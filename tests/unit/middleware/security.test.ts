// `SecurityMiddleware` (src/middleware/security.ts) is the STATEFUL wrapper that `src/server.ts`
// runs on the MCP boundary only (:572 input, :580 output, :586 error, :635 resource URI, :669
// output again). It gates grammar rules that live in `src/utils/security.ts` behind three
// `SecurityConfig` flags, and owns its own state (`blockedIPs`, `requestCounts`,
// `suspiciousPatterns`, auto-block at 5 hits).
//
// Everything here runs in-process with fake timers: no network, no sleeps. `jest.useFakeTimers()`
// is global for this file because `block()` schedules a real `setTimeout` per call (:83) and
// `checkRateLimit` reads `Date.now()` (:95), which the modern fake clock also owns.
//
// Rejection inputs deliberately use the NON-`/g` patterns (`${…}`, `../`, and the
// COMMAND_INJECTION character class) so `lastIndex` never carries between tests. The one place
// this suite does lean on a `/g` pattern is the last block, which is self-balancing and pins the
// defect the middleware inherits from `src/utils/security.ts:13-19`, `:100`.

import { SecurityMiddleware } from '../../../src/middleware/security';
import type { SecurityConfig } from '../../../src/types/config';

const BASE_CONFIG: SecurityConfig = {
  enabled: true,
  enableInputValidation: true,
  enableOutputSanitization: true,
  maxSymbolsPerRequest: 50,
  maxStringLength: 1000,
  allowedOrigins: [],
  enableRateLimiting: true,
  enableRequestLogging: true,
  sanitizeErrors: true,
  maxRequestsPerIP: 1000,
  rateLimitWindowMs: 3600000,
  blockDurationMs: 3600000,
  enableCSRFProtection: true,
  enableContentSecurityPolicy: true
};

const config = (overrides: Partial<SecurityConfig> = {}): SecurityConfig => ({
  ...BASE_CONFIG,
  ...overrides
});

// `${…}` is DANGEROUS_PATTERNS[0] and has no /g flag, so it throws on every call.
const DANGEROUS = 'price${now}';
// `../` is DANGEROUS_PATTERNS[5], also flagless.
const TRAVERSAL = 'config/../../etc/passwd';

const middleware = (overrides: Partial<SecurityConfig> = {}): SecurityMiddleware =>
  new SecurityMiddleware(config(overrides));

describe('SecurityMiddleware.validateInput — enableInputValidation gate', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('resolves true and never reaches the grammar when the flag is off', async () => {
    const subject = middleware({ enableInputValidation: false });
    await expect(subject.validateInput(DANGEROUS, 'tool:get_quote')).resolves.toBe(true);
    await expect(subject.validateInput(TRAVERSAL, 'tool:get_quote')).resolves.toBe(true);
  });

  test('the same dangerous string rejects when the flag is on', async () => {
    const subject = middleware({ enableInputValidation: true });
    await expect(subject.validateInput(DANGEROUS, 'tool:get_quote')).rejects.toThrow(
      /tool:get_quote contains potentially dangerous content/
    );
  });

  test('resolves true for a clean string when validation is on', async () => {
    await expect(middleware().validateInput('AAPL', 'tool:get_quote')).resolves.toBe(true);
  });

  test('enabled:false gates nothing — only enableInputValidation is read', async () => {
    const subject = middleware({ enabled: false });
    await expect(subject.validateInput(DANGEROUS, 'ctx')).rejects.toThrow(/dangerous content/);
  });
});

describe('SecurityMiddleware.validateInput — input shapes', () => {
  test('an array validates each string element and rejects on the first dangerous one', async () => {
    await expect(middleware().validateInput(['AAPL', 'MSFT'], 'tool:get_quote')).resolves.toBe(true);
    await expect(middleware().validateInput(['AAPL', DANGEROUS], 'tool:get_quote')).rejects.toThrow(
      /potentially dangerous content/
    );
  });

  test('non-string array elements are skipped entirely, so a nested payload is not scanned', async () => {
    await expect(
      middleware().validateInput([1, true, null, undefined, { nested: DANGEROUS }, ['a${b}']], 'ctx')
    ).resolves.toBe(true);
  });

  test('an object validates its own string values', async () => {
    await expect(
      middleware().validateInput({ symbol: 'AAPL', note: 'fine' }, 'ctx')
    ).resolves.toBe(true);
    await expect(middleware().validateInput({ symbol: DANGEROUS }, 'ctx')).rejects.toThrow(
      /potentially dangerous content/
    );
  });

  test('DEFECT: an object input reports the property key and discards the context argument', async () => {
    // :36 calls validateString(value, key) — `context` never reaches the message, so the tool
    // name that every other branch includes is lost for object payloads.
    await expect(
      middleware().validateInput({ query: TRAVERSAL }, 'tool:get_news')
    ).rejects.toThrow(/^query contains potentially dangerous content$/);
  });

  test('object non-string values are skipped', async () => {
    await expect(
      middleware().validateInput({ n: 1, b: false, o: { deep: DANGEROUS }, a: [DANGEROUS] }, 'ctx')
    ).resolves.toBe(true);
  });

  test('null, numbers, booleans and undefined fall through to resolve(true)', async () => {
    await expect(middleware().validateInput(null, 'ctx')).resolves.toBe(true);
    await expect(middleware().validateInput(42, 'ctx')).resolves.toBe(true);
    await expect(middleware().validateInput(false, 'ctx')).resolves.toBe(true);
    await expect(middleware().validateInput(undefined, 'ctx')).resolves.toBe(true);
  });

  test('a validator throw becomes a rejection, not a synchronous throw', async () => {
    // :19 the Promise executor is synchronous, so a throwing validator must surface as a rejected
    // promise — a caller that forgets to await would otherwise see nothing.
    const subject = middleware();
    let synchronousThrow = false;
    try {
      const pending = subject.validateInput(DANGEROUS, 'ctx');
      pending.catch(() => undefined);
    } catch (_error) {
      synchronousThrow = true;
    }
    expect(synchronousThrow).toBe(false);
    await expect(subject.validateInput(DANGEROUS, 'ctx')).rejects.toBeInstanceOf(Error);
  });

  test('DEFECT: maxStringLength and maxSymbolsPerRequest are inert — the grammar\'s own constants win', async () => {
    const subject = middleware({ maxStringLength: 10, maxSymbolsPerRequest: 2 });
    await expect(subject.validateInput('x'.repeat(200), 'ctx')).resolves.toBe(true);
    await expect(subject.validateInput(Array.from({ length: 80 }, (_v, i) => `SYMBOL${i}`), 'ctx'))
      .resolves.toBe(true);
    // Only InputValidator's hard 1000-character cap applies.
    await expect(subject.validateInput('x'.repeat(1001), 'ctx')).rejects.toThrow(
      /exceeds maximum length of 1000/
    );
  });
});

describe('SecurityMiddleware.sanitizeOutput — enableOutputSanitization gate', () => {
  test('returns the payload untouched when the flag is off', async () => {
    const subject = middleware({ enableOutputSanitization: false });
    const payload = { name: '<script>alert</script>', price: Infinity };
    await expect(subject.sanitizeOutput(payload)).resolves.toBe(payload);
  });

  test('sanitizes a plain object when the flag is on', async () => {
    const subject = middleware();
    await expect(subject.sanitizeOutput({ name: '<b>AAPL</b>', price: 10 })).resolves.toEqual({
      name: 'bAAPL/b',
      price: 10
    });
  });

  test('non-finite numbers become null and null/undefined collapse to null', async () => {
    const subject = middleware();
    await expect(
      subject.sanitizeOutput({ inf: Infinity, nan: NaN, n: null, u: undefined, ok: 1 })
    ).resolves.toEqual({ inf: null, nan: null, n: null, u: null, ok: 1 });
  });

  test('nested objects are sanitized recursively and arrays keep their non-string items', async () => {
    const subject = middleware();
    await expect(
      subject.sanitizeOutput({ inner: { s: '<i>x</i>' }, list: ['<i>y</i>', 7, { z: 1 }] })
    ).resolves.toEqual({ inner: { s: 'ix/i' }, list: ['iy/i', 7, { z: 1 }] });
  });

  test('DEFECT: a top-level array is not an object branch, so it is returned unsanitized', async () => {
    const subject = middleware();
    const list = ['<script>keep</script>'];
    await expect(subject.sanitizeOutput(list)).resolves.toBe(list);
  });

  test('DEFECT: null, strings, numbers and booleans are returned as-is, and Date/function values do not survive', async () => {
    const subject = middleware();
    await expect(subject.sanitizeOutput(null)).resolves.toBeNull();
    await expect(subject.sanitizeOutput('<b>raw</b>')).resolves.toBe('<b>raw</b>');
    await expect(subject.sanitizeOutput(7)).resolves.toBe(7);
    await expect(subject.sanitizeOutput(false)).resolves.toBe(false);
    // Inside an object, a Date recurses into "no own enumerable keys" and a function has no
    // matching branch at all, so both are silently dropped from the client payload.
    await expect(
      subject.sanitizeOutput({ when: new Date(0), fn: () => undefined, kept: 1 })
    ).resolves.toEqual({ when: {}, kept: 1 });
  });
});

describe('SecurityMiddleware.sanitizeError — sanitizeErrors gate', () => {
  test('redacts paths and secrets when the flag is on', () => {
    const subject = middleware({ sanitizeErrors: true });
    expect(subject.sanitizeError(new Error('failed reading /etc/passwd file'))).toBe(
      'failed reading [REDACTED] file'
    );
    expect(subject.sanitizeError(new Error('password=hunter2 secret=abc123 key=zzz999'))).toContain(
      '[REDACTED]'
    );
  });

  test('a non-Error becomes the fixed string when the flag is on, losing the original text', () => {
    const subject = middleware({ sanitizeErrors: true });
    expect(subject.sanitizeError('boom')).toBe('An error occurred');
    expect(subject.sanitizeError(404)).toBe('An error occurred');
    expect(subject.sanitizeError(null)).toBe('An error occurred');
  });

  test('returns the raw message for an Error when the flag is off', () => {
    const subject = middleware({ sanitizeErrors: false });
    expect(subject.sanitizeError(new Error('verbatim /etc/passwd failure'))).toBe(
      'verbatim /etc/passwd failure'
    );
  });

  test('stringifies a non-Error when the flag is off', () => {
    const subject = middleware({ sanitizeErrors: false });
    expect(subject.sanitizeError('plain string')).toBe('plain string');
    expect(subject.sanitizeError(42)).toBe('42');
    expect(subject.sanitizeError(undefined)).toBe('undefined');
  });

  test('an Error subclass keeps its message and is not re-typed', () => {
    const subject = middleware({ sanitizeErrors: false });
    class Boom extends Error {
      constructor() {
        super('subclass message');
        this.name = 'Boom';
      }
    }
    expect(subject.sanitizeError(new Boom())).toBe('subclass message');
  });
});

describe('SecurityMiddleware.validateCacheKey', () => {
  test('resolves true for a grammar-clean key', async () => {
    await expect(middleware().validateCacheKey('quotes:AAPL')).resolves.toBe(true);
  });

  test('resolves false instead of rejecting for an empty, oversized, or dangerous key', async () => {
    const subject = middleware();
    await expect(subject.validateCacheKey('')).resolves.toBe(false);
    await expect(subject.validateCacheKey('x'.repeat(501))).resolves.toBe(false);
    await expect(subject.validateCacheKey(DANGEROUS)).resolves.toBe(false);
    await expect(subject.validateCacheKey(TRAVERSAL)).resolves.toBe(false);
  });

  test('the flag does not gate it — a disabled middleware still validates cache keys', async () => {
    const subject = middleware({ enableInputValidation: false, enabled: false });
    await expect(subject.validateCacheKey(DANGEROUS)).resolves.toBe(false);
  });
});

describe('SecurityMiddleware.block / isBlocked / unblock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('blocks immediately and self-clears after the hard-coded 3600000 ms default', () => {
    const subject = middleware();
    subject.block('10.0.0.1');
    expect(subject.isBlocked('10.0.0.1')).toBe(true);
    jest.advanceTimersByTime(3599999);
    expect(subject.isBlocked('10.0.0.1')).toBe(true);
    jest.advanceTimersByTime(1);
    expect(subject.isBlocked('10.0.0.1')).toBe(false);
  });

  test('DEFECT: config.blockDurationMs is ignored by block() — the default argument wins', () => {
    const subject = middleware({ blockDurationMs: 1000 });
    subject.block('10.0.0.2');
    jest.advanceTimersByTime(60000);
    expect(subject.isBlocked('10.0.0.2')).toBe(true);
    jest.advanceTimersByTime(3540000);
    expect(subject.isBlocked('10.0.0.2')).toBe(false);
  });

  test('an explicit duration is honoured', () => {
    const subject = middleware();
    subject.block('10.0.0.3', 500);
    expect(subject.isBlocked('10.0.0.3')).toBe(true);
    jest.advanceTimersByTime(500);
    expect(subject.isBlocked('10.0.0.3')).toBe(false);
  });

  test('unblock removes immediately, and removing an unknown identifier is a no-op', () => {
    const subject = middleware();
    subject.block('10.0.0.4', 60000);
    subject.unblock('10.0.0.4');
    expect(subject.isBlocked('10.0.0.4')).toBe(false);
    expect(() => subject.unblock('never-blocked')).not.toThrow();
    expect(subject.isBlocked('never-blocked')).toBe(false);
  });

  test('blocking the same identifier twice schedules two independent expiries', () => {
    const subject = middleware();
    subject.block('10.0.0.5', 1000);
    subject.block('10.0.0.5', 3000);
    jest.advanceTimersByTime(1000);
    // The first timer already deleted the entry, so the later one cannot keep it blocked.
    expect(subject.isBlocked('10.0.0.5')).toBe(false);
  });
});

describe('SecurityMiddleware.checkRateLimit', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('opens a window on the first call, counts up, then refuses at maxRequests', async () => {
    const subject = middleware();
    await expect(subject.checkRateLimit('ip-1', 2, 1000)).resolves.toBe(true);
    await expect(subject.checkRateLimit('ip-1', 2, 1000)).resolves.toBe(true);
    await expect(subject.checkRateLimit('ip-1', 2, 1000)).resolves.toBe(false);
    await expect(subject.checkRateLimit('ip-1', 2, 1000)).resolves.toBe(false);
  });

  test('a window roll resets the count to 1 and re-admits the caller', async () => {
    const subject = middleware();
    await expect(subject.checkRateLimit('ip-2', 1, 1000)).resolves.toBe(true);
    await expect(subject.checkRateLimit('ip-2', 1, 1000)).resolves.toBe(false);
    jest.advanceTimersByTime(1001);
    await expect(subject.checkRateLimit('ip-2', 1, 1000)).resolves.toBe(true);
    await expect(subject.checkRateLimit('ip-2', 1, 1000)).resolves.toBe(false);
  });

  test('the window boundary is exclusive: now === resetTime is still inside the old window', async () => {
    const subject = middleware();
    await expect(subject.checkRateLimit('ip-3', 1, 1000)).resolves.toBe(true);
    jest.advanceTimersByTime(1000);
    await expect(subject.checkRateLimit('ip-3', 1, 1000)).resolves.toBe(false);
    jest.advanceTimersByTime(1);
    await expect(subject.checkRateLimit('ip-3', 1, 1000)).resolves.toBe(true);
  });

  test('identifiers are independent counters', async () => {
    const subject = middleware();
    await expect(subject.checkRateLimit('ip-a', 1, 1000)).resolves.toBe(true);
    await expect(subject.checkRateLimit('ip-a', 1, 1000)).resolves.toBe(false);
    await expect(subject.checkRateLimit('ip-b', 1, 1000)).resolves.toBe(true);
    expect(subject.getSecurityMetrics().activeRequestCounters).toBe(2);
  });

  test('DEFECT: enableRateLimiting:false does not disable the counter, and maxRequestsPerIP/rateLimitWindowMs are never read', async () => {
    const subject = middleware({
      enableRateLimiting: false,
      maxRequestsPerIP: 1000,
      rateLimitWindowMs: 3600000
    });
    await expect(subject.checkRateLimit('ip-4', 1, 1000)).resolves.toBe(true);
    await expect(subject.checkRateLimit('ip-4', 1, 1000)).resolves.toBe(false);
  });

  test('maxRequests of 0 refuses every caller from the second call onward', async () => {
    const subject = middleware();
    await expect(subject.checkRateLimit('ip-5', 0, 1000)).resolves.toBe(true);
    await expect(subject.checkRateLimit('ip-5', 0, 1000)).resolves.toBe(false);
  });
});

describe('SecurityMiddleware.recordSuspiciousActivity', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('four hits do not block; the fifth blocks pattern:<name> for 7200000 ms', () => {
    const subject = middleware();
    for (let hit = 1; hit <= 4; hit++) {
      subject.recordSuspiciousActivity('sqlmap');
      expect(subject.isBlocked('pattern:sqlmap')).toBe(false);
      expect(subject.getSecurityMetrics().suspiciousPatterns).toBe(1);
    }
    subject.recordSuspiciousActivity('sqlmap');
    expect(subject.isBlocked('pattern:sqlmap')).toBe(true);

    jest.advanceTimersByTime(7199999);
    expect(subject.isBlocked('pattern:sqlmap')).toBe(true);
    jest.advanceTimersByTime(1);
    expect(subject.isBlocked('pattern:sqlmap')).toBe(false);
    // The counter entry survives its own auto-block, so a sixth hit re-blocks immediately.
    subject.recordSuspiciousActivity('sqlmap');
    expect(subject.isBlocked('pattern:sqlmap')).toBe(true);
  });

  test('each distinct pattern is counted separately', () => {
    const subject = middleware();
    subject.recordSuspiciousActivity('a');
    subject.recordSuspiciousActivity('b');
    subject.recordSuspiciousActivity('b');
    expect(subject.getSecurityMetrics().suspiciousPatterns).toBe(2);
    expect(subject.getSecurityMetrics().blockedIPs).toBe(0);
  });

  test('DEFECT: nothing in src/ calls recordSuspiciousActivity, isBlocked, or checkRateLimit, so a blocked identifier never gates a request', () => {
    // src/server.ts only ever calls validateInput/sanitizeOutput/sanitizeError (:572, :580, :586,
    // :635, :669). The auto-block therefore blocks an identifier the server never consults.
    const subject = middleware();
    for (let hit = 0; hit < 5; hit++) {
      subject.recordSuspiciousActivity('scanner');
    }
    expect(subject.isBlocked('pattern:scanner')).toBe(true);
    expect(subject.getSecurityMetrics().blockedIPs).toBe(1);
    // And a blocked identifier still passes input validation unchanged.
    return expect(subject.validateInput('AAPL', 'ctx')).resolves.toBe(true);
  });
});

describe('SecurityMiddleware.getSecurityMetrics / reset / updateConfig', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  test('metrics report all three collections', async () => {
    const subject = middleware();
    expect(subject.getSecurityMetrics()).toEqual({
      blockedIPs: 0,
      activeRequestCounters: 0,
      suspiciousPatterns: 0
    });
    subject.block('ip-1');
    subject.recordSuspiciousActivity('p-1');
    await subject.checkRateLimit('ip-2', 5, 1000);
    expect(subject.getSecurityMetrics()).toEqual({
      blockedIPs: 1,
      activeRequestCounters: 1,
      suspiciousPatterns: 1
    });
  });

  test('reset clears counters, blocks and pattern history', async () => {
    const subject = middleware();
    subject.block('ip-1', 60000);
    subject.recordSuspiciousActivity('p-1');
    await subject.checkRateLimit('ip-2', 5, 1000);
    subject.reset();
    expect(subject.getSecurityMetrics()).toEqual({
      blockedIPs: 0,
      activeRequestCounters: 0,
      suspiciousPatterns: 0
    });
    expect(subject.isBlocked('ip-1')).toBe(false);
    // A reset pattern restarts its own 5-hit budget.
    for (let hit = 0; hit < 4; hit++) {
      subject.recordSuspiciousActivity('p-1');
    }
    expect(subject.isBlocked('pattern:p-1')).toBe(false);
    subject.recordSuspiciousActivity('p-1');
    expect(subject.isBlocked('pattern:p-1')).toBe(true);
  });

  test('reset does not cancel an already-scheduled unblock timer', () => {
    const subject = middleware();
    subject.block('ip-1', 1000);
    subject.reset();
    subject.block('ip-1', 60000);
    jest.advanceTimersByTime(1000);
    expect(subject.isBlocked('ip-1')).toBe(false);
  });

  test('updateConfig merges a partial and takes effect on the next call', async () => {
    const subject = middleware({ enableInputValidation: true });
    await expect(subject.validateInput(DANGEROUS, 'ctx')).rejects.toThrow(/dangerous content/);
    subject.updateConfig({ enableInputValidation: false });
    await expect(subject.validateInput(DANGEROUS, 'ctx')).resolves.toBe(true);
    subject.updateConfig({ enableInputValidation: true });
    await expect(subject.validateInput(DANGEROUS, 'ctx')).rejects.toThrow(/dangerous content/);
  });

  test('updateConfig({}) replaces nothing and keeps every other flag', async () => {
    const subject = middleware({ sanitizeErrors: false });
    subject.updateConfig({});
    expect(subject.sanitizeError(new Error('kept /raw/path'))).toBe('kept /raw/path');
    await expect(subject.sanitizeOutput({ s: '<i>x</i>' })).resolves.toEqual({ s: 'ix/i' });
  });
});

describe('the /g lastIndex defect reaches the middleware boundary', () => {
  // `DANGEROUS_PATTERNS[2]` is /javascript:/gi (src/utils/security.ts:12) and is consumed with
  // `.test()` (:100), so lastIndex survives a hit and the SAME input can pass the next call.
  // Kept last and run in fours so the pattern is left armed at lastIndex 0 for anything after it.
  const payload = 'x javascript: y';

  test('alternates reject / resolve on identical consecutive inputs', async () => {
    const subject = middleware();
    const outcomes: string[] = [];
    for (let call = 0; call < 4; call++) {
      try {
        await subject.validateInput(payload, 'tool:get_news');
        outcomes.push('resolved');
      } catch (error) {
        outcomes.push(error instanceof Error ? error.message : 'rejected');
      }
    }
    expect(outcomes).toEqual([
      'tool:get_news contains potentially dangerous content',
      'resolved',
      'tool:get_news contains potentially dangerous content',
      'resolved'
    ]);
  });

  test('the leak is per-pattern, not per-middleware instance', async () => {
    // Both instances share the module-level regex array, so a hit on one arms the other.
    const first = middleware();
    const second = middleware();
    await expect(first.validateInput(payload, 'ctx')).rejects.toThrow(/dangerous content/);
    await expect(second.validateInput(payload, 'ctx')).resolves.toBe(true);
    await expect(first.validateInput(payload, 'ctx')).rejects.toThrow(/dangerous content/);
  });
});
