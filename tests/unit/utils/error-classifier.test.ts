import * as classifierModule from '../../../src/utils/error-classifier';
import { classifyError, isRetryableError, isRateLimitErrorCheck } from '../../../src/utils/error-classifier';
import {
  YahooFinanceError,
  YF_ERR_API_CHANGED,
  YF_ERR_CACHE_STALE,
  YF_ERR_CIRCUIT_OPEN,
  YF_ERR_COOKIE_ERROR,
  YF_ERR_DATA_INCOMPLETE,
  YF_ERR_DATA_UNAVAILABLE,
  YF_ERR_MAX_RETRIES_EXCEEDED,
  YF_ERR_NETWORK,
  YF_ERR_PARTIAL_DATA,
  YF_ERR_RATE_LIMIT,
  YF_ERR_SERVER,
  YF_ERR_SYMBOL_NOT_FOUND,
  YF_ERR_TIMEOUT,
  YF_ERR_UNKNOWN
} from '../../../src/types/errors';

// `classifyError` returns a `YahooFinanceError` — there is no null path and no
// `ErrorCategory` / `ErrorSeverity` / `ErrorClassification` vocabulary in `src/`; the codes are the
// `YF_ERR_*` constants in `src/types/errors.ts`. Rule order is first-wins and contractual:
// cookie → rate limit → symbol → server → timeout → network → api → unavailable → partial →
// circuit → stale → null → unknown. Each precedence pair below is a regression net for a reorder.

const nodeError = (message: string, extra?: Record<string, unknown>): Error =>
  Object.assign(new Error(message), extra ?? {});

describe('error-classifier module surface', () => {
  test('exports classifyError, isRetryableError and isRateLimitErrorCheck', () => {
    expect(typeof classifyError).toBe('function');
    expect(typeof isRetryableError).toBe('function');
    expect(typeof isRateLimitErrorCheck).toBe('function');
    expect(Object.keys(classifierModule).sort()).toEqual([
      'classifyError',
      'isRateLimitErrorCheck',
      'isRetryableError'
    ]);
  });

  test('ErrorCategory is not exported and never existed', () => {
    expect((classifierModule as Record<string, unknown>)['ErrorCategory']).toBeUndefined();
  });

  test('ErrorSeverity is not exported and never existed', () => {
    expect((classifierModule as Record<string, unknown>)['ErrorSeverity']).toBeUndefined();
  });

  test('ErrorClassification is not exported and never existed', () => {
    expect((classifierModule as Record<string, unknown>)['ErrorClassification']).toBeUndefined();
  });

  test('the private predicates are not exported', () => {
    expect((classifierModule as Record<string, unknown>)['isCookieError']).toBeUndefined();
    expect((classifierModule as Record<string, unknown>)['getStatusCode']).toBeUndefined();
  });
});

describe('return contract', () => {
  const samples: Array<[string, unknown]> = [
    ['empty object', {}],
    ['status code', { statusCode: 502 }],
    ['Error', new Error('boom')],
    ['string', 'boom'],
    ['number', 42],
    ['false', false],
    ['array', []],
    ['null-ish message', new Error('value was null')]
  ];

  test.each(samples)('classifies %s into a YahooFinanceError, never null', (_label, input) => {
    const result = classifyError(input);
    expect(result).toBeInstanceOf(YahooFinanceError);
    expect(result).not.toBeNull();
    expect(result).toBeInstanceOf(Error);
    expect(result.name).toBe('YahooFinanceError');
  });

  test.each(samples)('%s always carries a known code and a non-empty suggestedAction', (_label, input) => {
    const result = classifyError(input);
    const knownCodes: string[] = [
      YF_ERR_COOKIE_ERROR,
      YF_ERR_RATE_LIMIT,
      YF_ERR_SYMBOL_NOT_FOUND,
      YF_ERR_SERVER,
      YF_ERR_TIMEOUT,
      YF_ERR_NETWORK,
      YF_ERR_API_CHANGED,
      YF_ERR_DATA_UNAVAILABLE,
      YF_ERR_PARTIAL_DATA,
      YF_ERR_CIRCUIT_OPEN,
      YF_ERR_CACHE_STALE,
      YF_ERR_UNKNOWN
    ];
    expect(knownCodes).toContain(result.code);
    expect(result.suggestedAction.length).toBeGreaterThan(0);
    expect(result.statusCode === null || typeof result.statusCode === 'number').toBe(true);
    expect(typeof result.isRetryable).toBe('boolean');
    expect(typeof result.isRateLimit).toBe('boolean');
    expect(result.timestamp).toBeInstanceOf(Date);
  });

  test('context always echoes the message the classifier actually saw', () => {
    const result = classifyError(new Error('Rate limit exceeded'));
    expect(result.context.originalError).toBe('Rate limit exceeded');
  });

  test('a YahooFinanceError is returned untouched rather than reclassified', () => {
    const original = new YahooFinanceError('mine', YF_ERR_COOKIE_ERROR, 7, false, true, { a: 1 }, 'nope');
    const result = classifyError(original);
    expect(result).toBe(original);
    expect(result.code).toBe(YF_ERR_COOKIE_ERROR);
    expect(result.statusCode).toBe(7);
    expect(result.isRateLimit).toBe(true);
  });

  test('throws a TypeError for null because the status-code read has no guard', () => {
    expect(() => classifyError(null)).toThrow(TypeError);
    expect(() => classifyError(null)).toThrow(/Cannot read properties of null \(reading 'statusCode'\)/);
  });

  test('throws a TypeError for undefined for the same reason', () => {
    expect(() => classifyError(undefined)).toThrow(/Cannot read properties of undefined \(reading 'statusCode'\)/);
  });
});

describe('cookie rules are checked first', () => {
  test('a cookie message becomes YF_ERR_COOKIE_ERROR with retry enabled', () => {
    const result = classifyError(new Error('Invalid cookie header'));
    expect(result.code).toBe(YF_ERR_COOKIE_ERROR);
    expect(result.message).toBe('Cookie/session error: Invalid cookie header');
    expect(result.statusCode).toBeNull();
    expect(result.isRetryable).toBe(true);
    expect(result.isRateLimit).toBe(false);
  });

  test.each([
    ['crumb', 'crumb fetch failed'],
    ['session', 'session expired'],
    ['CSRF', 'CSRF mismatch'],
    ['Set-Cookie', 'Set-Cookie header missing'],
    ['cookie jar', 'cookie jar unreadable']
  ])('matches the %s hint family', (_label, message) => {
    expect(classifyError(new Error(message)).code).toBe(YF_ERR_COOKIE_ERROR);
  });

  test('collects every matching hint and folds them into the suggested action', () => {
    const result = classifyError(new Error('CSRF Set-Cookie cookie jar'));
    expect(result.context.hints).toEqual([
      'CSRF token validation failed',
      'Check cookie header format',
      'Cookie storage issue detected'
    ]);
    expect(result.suggestedAction).toBe(
      'Clear cookies and retry: CSRF token validation failed; Check cookie header format; Cookie storage issue detected'
    );
  });

  test('falls back to two generic hints when nothing more specific matched', () => {
    expect(classifyError(new Error('Invalid cookie header')).context.hints).toEqual([
      'Clear cookies and retry',
      'Ensure proper cookie handling'
    ]);
  });

  test('a bare YF_ERR_COOKIE_ERROR code matches even though the message is unreadable', () => {
    const result = classifyError({ code: YF_ERR_COOKIE_ERROR });
    expect(result.code).toBe(YF_ERR_COOKIE_ERROR);
    expect(result.message).toBe('Cookie/session error: [object Object]');
  });

  test('cookie wins over a 429 status code', () => {
    const result = classifyError(nodeError('cookie rejected: rate limit hit', { statusCode: 429 }));
    expect(result.code).toBe(YF_ERR_COOKIE_ERROR);
    expect(result.statusCode).toBe(429);
  });

  test('cookie wins over a symbol-not-found message and its 404', () => {
    expect(classifyError(nodeError('cookie missing, symbol not found', { statusCode: 404 })).code).toBe(YF_ERR_COOKIE_ERROR);
  });
});

describe('rate limit rules', () => {
  test('a 429 status becomes YF_ERR_RATE_LIMIT with both retry flags', () => {
    const result = classifyError({ statusCode: 429 });
    expect(result.code).toBe(YF_ERR_RATE_LIMIT);
    expect(result.message).toBe('Rate limit exceeded');
    expect(result.statusCode).toBe(429);
    expect(result.isRetryable).toBe(true);
    expect(result.isRateLimit).toBe(true);
    expect(result.suggestedAction).toBe('Wait and retry with exponential backoff. Reduce request frequency.');
  });

  test('a rate-limit message with no status still reports 429', () => {
    const result = classifyError(new Error('Rate limit exceeded, slow down'));
    expect(result.code).toBe(YF_ERR_RATE_LIMIT);
    expect(result.statusCode).toBe(429);
    expect(result.context.statusCode).toBeNull();
  });

  test('the YF_ERR_RATE_LIMIT code alone is enough', () => {
    expect(classifyError({ code: YF_ERR_RATE_LIMIT }).code).toBe(YF_ERR_RATE_LIMIT);
  });

  test('rate limit wins over symbol-not-found text', () => {
    expect(classifyError(nodeError('symbol not found', { statusCode: 429 })).code).toBe(YF_ERR_RATE_LIMIT);
  });

  describe('retry-after extraction', () => {
    test('reads a numeric retry-after from response headers', () => {
      const result = classifyError({ statusCode: 429, response: { headers: { 'retry-after': 30 } } });
      expect(result.message).toBe('Rate limit exceeded Retry after 30 seconds');
      expect(result.context.retryAfter).toBe(30);
    });

    test('parses a numeric string retry-after', () => {
      const result = classifyError({ statusCode: 429, response: { headers: { 'retry-after': '45' } } });
      expect(result.context.retryAfter).toBe(45);
      expect(result.message).toContain('Retry after 45 seconds');
    });

    test('falls back to top-level headers when the response value is unparseable', () => {
      const result = classifyError({
        statusCode: 429,
        response: { headers: { 'retry-after': 'soon' } },
        headers: { 'retry-after': 12 }
      });
      expect(result.context.retryAfter).toBe(12);
    });

    test('prefers response headers over top-level headers', () => {
      const result = classifyError({
        statusCode: 429,
        response: { headers: { 'retry-after': 5 } },
        headers: { 'retry-after': 9 }
      });
      expect(result.context.retryAfter).toBe(5);
    });

    test('keeps a zero retry-after rather than treating it as absent', () => {
      const result = classifyError({ statusCode: 429, response: { headers: { 'retry-after': 0 } } });
      expect(result.context.retryAfter).toBe(0);
      expect(result.message).toBe('Rate limit exceeded Retry after 0 seconds');
    });

    test('reports null when no header is present', () => {
      expect(classifyError({ statusCode: 429 }).context.retryAfter).toBeNull();
    });
  });
});

describe('symbol not found rules', () => {
  test('a 404 becomes YF_ERR_SYMBOL_NOT_FOUND and is not retryable', () => {
    const result = classifyError({ statusCode: 404 });
    expect(result.code).toBe(YF_ERR_SYMBOL_NOT_FOUND);
    expect(result.message).toBe('Symbol not found');
    expect(result.statusCode).toBe(404);
    expect(result.isRetryable).toBe(false);
    expect(result.isRateLimit).toBe(false);
  });

  test('keeps the original message when it already says symbol not found', () => {
    const result = classifyError(new Error('Symbol Not Found: AAPL'));
    expect(result.message).toBe('Symbol Not Found: AAPL');
    expect(result.statusCode).toBe(404);
    expect(result.context.statusCode).toBeNull();
  });

  test('rewrites a no data found message to the generic symbol text', () => {
    expect(classifyError(new Error('No data found')).message).toBe('Symbol not found');
  });

  test('symbol text wins over a 5xx status code', () => {
    const result = classifyError(nodeError('symbol not found', { statusCode: 500 }));
    expect(result.code).toBe(YF_ERR_SYMBOL_NOT_FOUND);
    expect(result.statusCode).toBe(404);
  });
});

describe('server rules', () => {
  test.each([500, 599])('%s is YF_ERR_SERVER with isTransient false', (status) => {
    const result = classifyError({ statusCode: status });
    expect(result.code).toBe(YF_ERR_SERVER);
    expect(result.message).toBe(`Server error (${status}): Server issue`);
    expect(result.statusCode).toBe(status);
    expect(result.isRetryable).toBe(true);
    expect(result.context.isTransient).toBe(false);
    expect(result.suggestedAction).toBe('Retry with exponential backoff. Server experiencing issues.');
  });

  test.each([502, 503, 504])('%s is flagged as a transient retry', (status) => {
    const result = classifyError({ statusCode: status });
    expect(result.message).toBe(`Server error (${status}): Transient error - retry`);
    expect(result.context.isTransient).toBe(true);
    expect(result.suggestedAction).toBe('Retry with exponential backoff. Server is temporarily unavailable.');
  });

  test('the YF_ERR_SERVER code alone defaults the status to 500', () => {
    const result = classifyError({ code: YF_ERR_SERVER });
    expect(result.code).toBe(YF_ERR_SERVER);
    expect(result.statusCode).toBe(500);
  });

  test('a status outside 500-599 is not a server error', () => {
    expect(classifyError({ statusCode: 600 }).code).toBe(YF_ERR_UNKNOWN);
    expect(classifyError({ statusCode: 499 }).code).toBe(YF_ERR_UNKNOWN);
  });

  test('server wins over a timeout message', () => {
    expect(classifyError(nodeError('timeout', { statusCode: 503 })).code).toBe(YF_ERR_SERVER);
  });
});

describe('timeout rules', () => {
  test('a timeout message becomes YF_ERR_TIMEOUT with no status code', () => {
    const result = classifyError(new Error('Request timeout after 30000ms'));
    expect(result.code).toBe(YF_ERR_TIMEOUT);
    expect(result.message).toBe('Request timeout');
    expect(result.statusCode).toBeNull();
    expect(result.isRetryable).toBe(true);
    expect(result.suggestedAction).toBe('Retry with longer timeout. Consider reducing data requested.');
  });

  test('the YF_ERR_TIMEOUT code matches even without message text', () => {
    expect(classifyError({ code: YF_ERR_TIMEOUT }).code).toBe(YF_ERR_TIMEOUT);
  });

  test('timeout wins over the network rule when both substrings are present', () => {
    expect(classifyError(new Error('network timeout')).code).toBe(YF_ERR_TIMEOUT);
  });

  test('Node\'s ETIMEDOUT text is NOT recognised: the substring test looks for etimeout', () => {
    const result = classifyError(new Error('Failure: ETIMEDOUT'));
    expect(result.code).toBe(YF_ERR_UNKNOWN);
    expect(result.isRetryable).toBe(true);
  });

  test('a Node error carrying only code ETIMEDOUT is unknown, not a timeout', () => {
    expect(classifyError(nodeError('socket hang up', { code: 'ETIMEDOUT' })).code).toBe(YF_ERR_UNKNOWN);
  });
});

describe('network rules', () => {
  test.each([
    ['network', 'Network error while fetching'],
    ['ECONNREFUSED', 'connect ECONNREFUSED 1.2.3.4'],
    ['ENOTFOUND', 'getaddrinfo ENOTFOUND foo']
  ])('the %s message becomes YF_ERR_NETWORK', (_label, message) => {
    const result = classifyError(new Error(message));
    expect(result.code).toBe(YF_ERR_NETWORK);
    expect(result.message).toBe('Network error');
    expect(result.statusCode).toBeNull();
    expect(result.isRetryable).toBe(true);
    expect(result.suggestedAction).toBe('Check network connection and retry. May be a temporary connectivity issue.');
  });

  test('the YF_ERR_NETWORK code matches on its own', () => {
    expect(classifyError({ code: YF_ERR_NETWORK }).code).toBe(YF_ERR_NETWORK);
  });

  test('network wins over the api-changed rule', () => {
    expect(classifyError(new Error('network failure: unexpected structure')).code).toBe(YF_ERR_NETWORK);
  });

  test('ECONNRESET is not in the network substring list, so it lands in unknown', () => {
    expect(classifyError(new Error('ECONNRESET read syscall')).code).toBe(YF_ERR_UNKNOWN);
    expect(classifyError({ code: 'ECONNRESET' }).code).toBe(YF_ERR_UNKNOWN);
  });

  test('socket hang up is not matched either', () => {
    expect(classifyError(new Error('socket hang up')).code).toBe(YF_ERR_UNKNOWN);
  });
});

describe('api changed rules', () => {
  test.each([
    ['api changed', 'API changed shape'],
    ['unexpected structure', 'Unexpected structure in payload']
  ])('the %s message becomes YF_ERR_API_CHANGED and is not retryable', (_label, message) => {
    const result = classifyError(new Error(message));
    expect(result.code).toBe(YF_ERR_API_CHANGED);
    expect(result.message).toBe('API structure changed');
    expect(result.isRetryable).toBe(false);
    expect(result.suggestedAction).toBe('Update data extraction logic to match new API structure. Report this issue.');
  });

  test('api changed wins over the data-unavailable rule', () => {
    expect(classifyError(new Error('api changed, data unavailable')).code).toBe(YF_ERR_API_CHANGED);
  });
});

describe('data unavailable rules', () => {
  test.each([
    ['data unavailable', 'Data unavailable for symbol'],
    ['no data available', 'No data available']
  ])('the %s message becomes YF_ERR_DATA_UNAVAILABLE', (_label, message) => {
    const result = classifyError(new Error(message));
    expect(result.code).toBe(YF_ERR_DATA_UNAVAILABLE);
    expect(result.message).toBe('Data unavailable');
    expect(result.isRetryable).toBe(false);
    expect(result.suggestedAction).toBe(
      'Data may not be available for this symbol or time period. Try different date range.'
    );
  });

  test('unavailable wins over the partial-data rule', () => {
    expect(classifyError(new Error('data unavailable and incomplete')).code).toBe(YF_ERR_DATA_UNAVAILABLE);
  });
});

describe('partial data rules', () => {
  test.each([
    ['incomplete', 'Incomplete data received'],
    ['partial data', 'partial data only']
  ])('the %s message becomes YF_ERR_PARTIAL_DATA', (_label, message) => {
    const result = classifyError(new Error(message));
    expect(result.code).toBe(YF_ERR_PARTIAL_DATA);
    expect(result.message).toBe('Incomplete data received');
    expect(result.isRetryable).toBe(false);
    expect(result.suggestedAction).toBe(
      'Partial data available. Some fields may be missing. Consider retrying for complete data.'
    );
  });

  test('YF_ERR_DATA_INCOMPLETE is folded into YF_ERR_PARTIAL_DATA and is never returned', () => {
    const result = classifyError({ code: YF_ERR_DATA_INCOMPLETE });
    expect(result.code).toBe(YF_ERR_PARTIAL_DATA);
    expect(result.code).not.toBe(YF_ERR_DATA_INCOMPLETE);
  });

  test('YF_ERR_PARTIAL_DATA maps to itself', () => {
    expect(classifyError({ code: YF_ERR_PARTIAL_DATA }).code).toBe(YF_ERR_PARTIAL_DATA);
  });

  test('partial wins over the circuit-breaker rule', () => {
    expect(classifyError(new Error('circuit open: partial data')).code).toBe(YF_ERR_PARTIAL_DATA);
  });
});

describe('circuit breaker rules', () => {
  test('a circuit-open message becomes YF_ERR_CIRCUIT_OPEN and is not retryable', () => {
    const result = classifyError(new Error('Circuit Open: too many failures'));
    expect(result.code).toBe(YF_ERR_CIRCUIT_OPEN);
    expect(result.message).toBe('Circuit breaker open');
    expect(result.isRetryable).toBe(false);
    expect(result.suggestedAction).toBe('Wait for circuit breaker to reset before retrying. Too many recent failures.');
  });

  test('the phrase must be contiguous: circuit is OPEN does not match', () => {
    expect(classifyError(new Error('circuit is OPEN')).code).toBe(YF_ERR_UNKNOWN);
  });

  test('YF_ERR_CIRCUIT_OPEN code matches', () => {
    expect(classifyError({ code: YF_ERR_CIRCUIT_OPEN }).code).toBe(YF_ERR_CIRCUIT_OPEN);
  });

  test('circuit wins over the stale-cache rule', () => {
    expect(classifyError(new Error('stale cache after circuit open')).code).toBe(YF_ERR_CIRCUIT_OPEN);
  });
});

describe('stale cache rules', () => {
  test('a stale-cache message becomes YF_ERR_CACHE_STALE', () => {
    const result = classifyError(new Error('Stale cache entry'));
    expect(result.code).toBe(YF_ERR_CACHE_STALE);
    expect(result.message).toBe('Stale cache data');
    expect(result.isRetryable).toBe(false);
    expect(result.suggestedAction).toBe('Clear cache and fetch fresh data. Use forceRefresh option.');
  });

  test('YF_ERR_CACHE_STALE code matches', () => {
    expect(classifyError({ code: YF_ERR_CACHE_STALE }).code).toBe(YF_ERR_CACHE_STALE);
  });

  test('stale wins over the null-data rule', () => {
    expect(classifyError(new Error('null stale cache')).code).toBe(YF_ERR_CACHE_STALE);
  });
});

describe('null data rule', () => {
  test.each([
    ['null', 'value was null'],
    ['undefined', 'undefined is not a function']
  ])('a message containing %s becomes YF_ERR_DATA_UNAVAILABLE with the shorter action', (_label, message) => {
    const result = classifyError(new Error(message));
    expect(result.code).toBe(YF_ERR_DATA_UNAVAILABLE);
    expect(result.message).toBe('Data unavailable');
    expect(result.isRetryable).toBe(false);
    expect(result.suggestedAction).toBe('Data may not be available for this symbol or time period');
  });
});

describe('unknown fallback', () => {
  test('an unrecognised message is YF_ERR_UNKNOWN and marked retryable', () => {
    const result = classifyError(new Error('totally unclassified'));
    expect(result.code).toBe(YF_ERR_UNKNOWN);
    expect(result.message).toBe('Unknown error');
    expect(result.statusCode).toBeNull();
    expect(result.isRetryable).toBe(true);
    expect(result.isRateLimit).toBe(false);
    expect(result.suggestedAction).toBe('Review error details and try again. May be a transient issue.');
  });

  test('an Error contributes its stack to the context', () => {
    const result = classifyError(new Error('totally unclassified'));
    expect(typeof result.context.stack).toBe('string');
    expect(result.context.originalError).toBe('totally unclassified');
  });

  test('a non-Error contributes an undefined stack key rather than omitting it', () => {
    const result = classifyError('boom');
    expect('stack' in result.context).toBe(true);
    expect(result.context.stack).toBeUndefined();
    expect(result.context.originalError).toBe('boom');
  });

  test('a plain object is stringified, so its own message property is ignored', () => {
    const result = classifyError({ message: 'rate limit' });
    expect(result.code).toBe(YF_ERR_UNKNOWN);
    expect(result.context.originalError).toBe('[object Object]');
  });

  test('4xx codes other than 404 and 429 fall through to the retryable unknown bucket', () => {
    expect(classifyError({ statusCode: 400 }).code).toBe(YF_ERR_UNKNOWN);
    expect(classifyError({ statusCode: 401 }).code).toBe(YF_ERR_UNKNOWN);
    expect(classifyError({ statusCode: 403 }).code).toBe(YF_ERR_UNKNOWN);
    expect(classifyError({ statusCode: 400 }).isRetryable).toBe(true);
  });

  test('a string status code is not a number and is ignored', () => {
    expect(classifyError({ statusCode: '429' }).code).toBe(YF_ERR_UNKNOWN);
  });

  test('YF_ERR_MAX_RETRIES_EXCEEDED is owned by the retry middleware, not this classifier', () => {
    const result = classifyError({ code: YF_ERR_MAX_RETRIES_EXCEEDED });
    expect(result.code).toBe(YF_ERR_UNKNOWN);
  });
});

describe('status code extraction', () => {
  test('statusCode wins over response.status and status', () => {
    const result = classifyError({ statusCode: 429, response: { status: 500 }, status: 503 });
    expect(result.statusCode).toBe(429);
  });

  test('response.status is used when statusCode is absent', () => {
    expect(classifyError({ response: { status: 502 } }).statusCode).toBe(502);
  });

  test('a flat status field is used last', () => {
    expect(classifyError({ status: 504 }).statusCode).toBe(504);
  });

  test('the unknown branch never carries a statusCode key value', () => {
    expect(classifyError({}).context.statusCode).toBeUndefined();
  });

  test('a matched branch does carry the extracted statusCode', () => {
    expect(classifyError({ statusCode: 404 }).context.statusCode).toBe(404);
  });
});

describe('first-wins precedence order', () => {
  const ordered: Array<{ label: string; input: unknown; code: string }> = [
    { label: 'cookie over everything', input: nodeError('cookie rejected: rate limit hit', { statusCode: 429 }), code: YF_ERR_COOKIE_ERROR },
    { label: 'rate limit over symbol', input: nodeError('symbol not found', { statusCode: 429 }), code: YF_ERR_RATE_LIMIT },
    { label: 'symbol over server', input: nodeError('symbol not found', { statusCode: 500 }), code: YF_ERR_SYMBOL_NOT_FOUND },
    { label: 'server over timeout', input: nodeError('timeout', { statusCode: 503 }), code: YF_ERR_SERVER },
    { label: 'timeout over network', input: new Error('network timeout'), code: YF_ERR_TIMEOUT },
    { label: 'network over api changed', input: new Error('network failure: unexpected structure'), code: YF_ERR_NETWORK },
    { label: 'api changed over unavailable', input: new Error('api changed, data unavailable'), code: YF_ERR_API_CHANGED },
    { label: 'unavailable over partial', input: new Error('data unavailable and incomplete'), code: YF_ERR_DATA_UNAVAILABLE },
    { label: 'partial over circuit', input: new Error('circuit open: partial data'), code: YF_ERR_PARTIAL_DATA },
    { label: 'circuit over stale', input: new Error('stale cache after circuit open'), code: YF_ERR_CIRCUIT_OPEN },
    { label: 'stale over null data', input: new Error('null stale cache'), code: YF_ERR_CACHE_STALE },
    { label: 'null data over unknown', input: new Error('value was undefined'), code: YF_ERR_DATA_UNAVAILABLE },
    { label: 'unknown is last', input: new Error('nothing recognised here'), code: YF_ERR_UNKNOWN }
  ];

  test.each(ordered)('$label yields $code', ({ input, code }) => {
    expect(classifyError(input).code).toBe(code);
  });

  test('the twelve-step order is exercised end to end', () => {
    expect(ordered.map((entry) => classifyError(entry.input).code)).toEqual([
      YF_ERR_COOKIE_ERROR,
      YF_ERR_RATE_LIMIT,
      YF_ERR_SYMBOL_NOT_FOUND,
      YF_ERR_SERVER,
      YF_ERR_TIMEOUT,
      YF_ERR_NETWORK,
      YF_ERR_API_CHANGED,
      YF_ERR_DATA_UNAVAILABLE,
      YF_ERR_PARTIAL_DATA,
      YF_ERR_CIRCUIT_OPEN,
      YF_ERR_CACHE_STALE,
      YF_ERR_DATA_UNAVAILABLE,
      YF_ERR_UNKNOWN
    ]);
  });
});

describe('retry predicates', () => {
  test('isRetryableError reflects the classified error', () => {
    expect(isRetryableError(classifyError({ statusCode: 429 }))).toBe(true);
    expect(isRetryableError(classifyError({ statusCode: 404 }))).toBe(false);
    expect(isRetryableError(classifyError('boom'))).toBe(true);
  });

  test('isRateLimitErrorCheck is true only for the rate-limit branch', () => {
    expect(isRateLimitErrorCheck(classifyError({ statusCode: 429 }))).toBe(true);
    expect(isRateLimitErrorCheck(classifyError({ statusCode: 503 }))).toBe(false);
    expect(isRateLimitErrorCheck(classifyError('boom'))).toBe(false);
  });
});

describe('serialized shape handed to clients', () => {
  test('toJSON exposes the classification without the raw error', () => {
    const json = classifyError({ statusCode: 502 }).toJSON();
    expect(json.code).toBe(YF_ERR_SERVER);
    expect(json.statusCode).toBe(502);
    expect(json.isRetryable).toBe(true);
    expect(json.isRateLimit).toBe(false);
    expect(json.hasPartialData).toBe(false);
    expect(json.warnings).toBeUndefined();
    expect(typeof json.timestamp).toBe('string');
  });
});
