import * as securityModule from '../../../src/utils/security';
import {
  CacheValidator,
  ConfigSecurityValidator,
  DataSanitizer,
  InputValidator,
  NetworkSecurityValidator,
  RateLimitValidator,
  SecurityError
} from '../../../src/utils/security';

// `src/utils/security.ts` owns the grammar every tool and the security middleware inherit:
// symbol pattern /^[A-Z0-9.\-\^]+$/, MAX_SYMBOL_LENGTH 20, MAX_SYMBOLS_PER_REQUEST 50,
// MAX_STRING_LENGTH 1000, failures thrown as SecurityError.
// DANGEROUS_PATTERNS and SQL_INJECTION_PATTERNS carry the /g flag while being driven by `.test()`
// (security.ts:13-19, :100), so `lastIndex` survives between calls and a repeated match on the same
// input returns false. That is a real defect and this suite pins it rather than fixing it. A clean
// string is passed through first to reset pattern state, so the sequences do not depend on file order.

const captureSecurityError = (run: () => void): { name: string; message: string; code: string } => {
  try {
    run();
  } catch (error) {
    if (error instanceof SecurityError) {
      return { name: error.name, message: error.message, code: error.code };
    }
    throw error;
  }
  throw new Error('expected the validator to throw a SecurityError');
};

// A no-match `.test()` resets lastIndex to 0, so a clean input leaves every /g pattern armed.
const resetPatternState = (): void => {
  InputValidator.validateString('Apple Inc');
};

const asString = (value: unknown): string => value as string;
const asNumber = (value: unknown): number => value as number;
const asStringArray = (value: unknown): string[] => value as string[];

describe('security module surface', () => {
  test('exports the validator classes and SecurityError', () => {
    expect(Object.keys(securityModule).sort()).toEqual([
      'CacheValidator',
      'ConfigSecurityValidator',
      'DataSanitizer',
      'InputValidator',
      'NetworkSecurityValidator',
      'RateLimitValidator',
      'SecurityError'
    ]);
  });

  test('the pattern arrays and size constants stay module-private', () => {
    const hidden = securityModule as Record<string, unknown>;
    expect(hidden['DANGEROUS_PATTERNS']).toBeUndefined();
    expect(hidden['SQL_INJECTION_PATTERNS']).toBeUndefined();
    expect(hidden['MAX_SYMBOL_LENGTH']).toBeUndefined();
    expect(hidden['MAX_SYMBOLS_PER_REQUEST']).toBeUndefined();
  });

  test('SecurityError is an Error subclass carrying a machine-readable code', () => {
    const error = new SecurityError('bad', 'INVALID_TYPE');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SecurityError');
    expect(error.code).toBe('INVALID_TYPE');
  });
});

describe('InputValidator.validateSymbol grammar', () => {
  test.each(['AAPL', 'BRK.B', '^GSPC', 'VFIN-X', 'BTC-USD', 'QQQ3', 'A'])('accepts %s', (symbol) => {
    expect(() => InputValidator.validateSymbol(symbol)).not.toThrow();
  });

  test('rejects lowercase, because the grammar is uppercase only', () => {
    const error = captureSecurityError(() => InputValidator.validateSymbol('aapl'));
    expect(error.code).toBe('INVALID_CHARS');
    expect(error.message).toBe('Symbol contains invalid characters');
  });

  test.each(['AA PL', 'AAPL;DROP', 'AAP_L', 'AAPL+', 'AAPL#', '2$', 'AAPL/', 'aapl '])(
    'rejects the invalid character in %s',
    (symbol) => {
      expect(captureSecurityError(() => InputValidator.validateSymbol(symbol)).code).toBe('INVALID_CHARS');
    }
  );

  test('accepts a single character and the twenty-character ceiling', () => {
    expect(() => InputValidator.validateSymbol('A')).not.toThrow();
    expect(() => InputValidator.validateSymbol('A'.repeat(20))).not.toThrow();
  });

  test('rejects the empty string with INVALID_LENGTH', () => {
    expect(captureSecurityError(() => InputValidator.validateSymbol('')).code).toBe('INVALID_LENGTH');
  });

  test('rejects a twenty-one character symbol by length before checking characters', () => {
    const error = captureSecurityError(() => InputValidator.validateSymbol('a'.repeat(21)));
    expect(error.code).toBe('INVALID_LENGTH');
    expect(error.message).toBe('Symbol length must be between 1 and 20');
  });

  test('rejects a non-string input', () => {
    expect(captureSecurityError(() => InputValidator.validateSymbol(asNumber(5))).code).toBe('INVALID_TYPE');
  });

  test('does not trim or uppercase — normalization belongs to formatting', () => {
    expect(captureSecurityError(() => InputValidator.validateSymbol(' AAPL ')).code).toBe('INVALID_CHARS');
  });
});

describe('InputValidator.validateSymbols caps', () => {
  test('accepts exactly the fifty-symbol per-request ceiling', () => {
    const symbols = Array.from({ length: 50 }, (_value, index) => `S${index}`);
    expect(() => InputValidator.validateSymbols(symbols)).not.toThrow();
  });

  test('rejects a fifty-first symbol with TOO_MANY_SYMBOLS', () => {
    const symbols = Array.from({ length: 51 }, (_value, index) => `S${index}`);
    const error = captureSecurityError(() => InputValidator.validateSymbols(symbols));
    expect(error.code).toBe('TOO_MANY_SYMBOLS');
    expect(error.message).toBe('Maximum 50 symbols per request');
  });

  test('rejects an empty array before any per-symbol grammar check', () => {
    expect(captureSecurityError(() => InputValidator.validateSymbols([])).code).toBe('EMPTY_ARRAY');
  });

  test('rejects a non-array', () => {
    expect(captureSecurityError(() => InputValidator.validateSymbols(asStringArray('AAPL'))).code).toBe('INVALID_TYPE');
  });

  test('rejects duplicates by identity', () => {
    expect(captureSecurityError(() => InputValidator.validateSymbols(['AAPL', 'AAPL'])).code).toBe('DUPLICATE_SYMBOLS');
  });

  test('the count cap is enforced before duplicate detection', () => {
    const repeated = Array.from({ length: 51 }, () => 'AAPL');
    expect(captureSecurityError(() => InputValidator.validateSymbols(repeated)).code).toBe('TOO_MANY_SYMBOLS');
  });

  test('applies the per-symbol grammar to every element', () => {
    expect(captureSecurityError(() => InputValidator.validateSymbols(['AAPL', 'bad char'])).code).toBe('INVALID_CHARS');
  });

  test('enforces the same twenty-character ceiling inside a batch', () => {
    expect(captureSecurityError(() => InputValidator.validateSymbols(['A'.repeat(21)])).code).toBe('INVALID_LENGTH');
  });
});

describe('InputValidator.validateString length and type', () => {
  test('accepts a string at the 1000 character ceiling', () => {
    expect(() => InputValidator.validateString('a'.repeat(1000))).not.toThrow();
  });

  test('rejects the 1001st character with INVALID_LENGTH', () => {
    const error = captureSecurityError(() => InputValidator.validateString('a'.repeat(1001)));
    expect(error.code).toBe('INVALID_LENGTH');
    expect(error.message).toBe('input exceeds maximum length of 1000');
  });

  test('names the field in type errors and defaults it to input', () => {
    expect(captureSecurityError(() => InputValidator.validateString(asString(null))).message).toBe('input must be a string');
    expect(captureSecurityError(() => InputValidator.validateString(asString(null), 'region')).message).toBe(
      'region must be a string'
    );
  });

  test('accepts an empty string', () => {
    expect(() => InputValidator.validateString('')).not.toThrow();
  });
});

describe('InputValidator.validateString content rules', () => {
  test('patterns without the global flag match deterministically', () => {
    expect(captureSecurityError(() => InputValidator.validateString('a/../../b')).code).toBe('DANGEROUS_CONTENT');
    expect(captureSecurityError(() => InputValidator.validateString('a/../../b')).code).toBe('DANGEROUS_CONTENT');
    expect(captureSecurityError(() => InputValidator.validateString('a|b')).code).toBe('COMMAND_INJECTION_ATTEMPT');
    expect(captureSecurityError(() => InputValidator.validateString('a|b')).code).toBe('COMMAND_INJECTION_ATTEMPT');
  });

  test('an inline event handler attribute is dangerous content', () => {
    resetPatternState();
    expect(captureSecurityError(() => InputValidator.validateString('img onerror = x')).code).toBe('DANGEROUS_CONTENT');
  });

  test('a clean string passes all three rule groups', () => {
    expect(() => InputValidator.validateString('Apple Inc. 2024')).not.toThrow();
  });

  test('the dangerous group runs before the SQL group', () => {
    resetPatternState();
    expect(captureSecurityError(() => InputValidator.validateString('SELECT<script>x</script>')).code).toBe(
      'DANGEROUS_CONTENT'
    );
  });});

describe('/g pattern lastIndex defect', () => {
  test('a SQL keyword is rejected, then accepted, then rejected again for the same input', () => {
    resetPatternState();
    expect(captureSecurityError(() => InputValidator.validateString('SELECT')).code).toBe('SQL_INJECTION_ATTEMPT');
    expect(() => InputValidator.validateString('SELECT')).not.toThrow();
    expect(captureSecurityError(() => InputValidator.validateString('SELECT')).code).toBe('SQL_INJECTION_ATTEMPT');
  });

  test('an OR boolean bypasses detection on the second identical call', () => {
    resetPatternState();
    expect(captureSecurityError(() => InputValidator.validateString('x OR 1=1')).code).toBe('SQL_INJECTION_ATTEMPT');
    expect(() => InputValidator.validateString('x OR 1=1')).not.toThrow();
  });

  test('a javascript: URL bypasses detection on the second identical call', () => {
    resetPatternState();
    expect(captureSecurityError(() => InputValidator.validateString('javascript:void')).code).toBe('DANGEROUS_CONTENT');
    expect(() => InputValidator.validateString('javascript:void')).not.toThrow();
  });

  test('a repeated script tag is downgraded from DANGEROUS_CONTENT to COMMAND_INJECTION_ATTEMPT', () => {
    resetPatternState();
    expect(captureSecurityError(() => InputValidator.validateString('<script>alert(1)</script>')).code).toBe(
      'DANGEROUS_CONTENT'
    );
    expect(captureSecurityError(() => InputValidator.validateString('<script>alert(1)</script>')).code).toBe(
      'COMMAND_INJECTION_ATTEMPT'
    );
  });

  test('state is shared across inputs, so one payload disarms the next one', () => {
    resetPatternState();
    expect(captureSecurityError(() => InputValidator.validateString('DELETE')).code).toBe('SQL_INJECTION_ATTEMPT');
    expect(() => InputValidator.validateString('SELECT')).not.toThrow();
  });
});

describe('InputValidator.validateNumber', () => {
  test('accepts finite numbers including zero and negatives', () => {
    expect(() => InputValidator.validateNumber(0)).not.toThrow();
    expect(() => InputValidator.validateNumber(-5)).not.toThrow();
  });

  test('rejects NaN and non-numbers with INVALID_NUMBER', () => {
    expect(captureSecurityError(() => InputValidator.validateNumber(NaN)).code).toBe('INVALID_NUMBER');
    expect(captureSecurityError(() => InputValidator.validateNumber(asString('5'))).code).toBe('INVALID_NUMBER');
  });

  test('rejects Infinity with INFINITE_NUMBER', () => {
    expect(captureSecurityError(() => InputValidator.validateNumber(Infinity)).code).toBe('INFINITE_NUMBER');
    expect(captureSecurityError(() => InputValidator.validateNumber(-Infinity)).code).toBe('INFINITE_NUMBER');
  });

  test('the OUT_OF_RANGE guard is unreachable: the bounds are +/- Number.MAX_VALUE', () => {
    expect(() => InputValidator.validateNumber(Number.MAX_VALUE)).not.toThrow();
    expect(() => InputValidator.validateNumber(-Number.MAX_VALUE)).not.toThrow();
  });
});

describe('InputValidator.validateDate', () => {
  test('accepts mid-decade ISO calendar dates', () => {
    expect(() => InputValidator.validateDate('1950-06-15')).not.toThrow();
    expect(() => InputValidator.validateDate('2050-06-15')).not.toThrow();
  });

  test('requires the YYYY-MM-DD shape', () => {
    const error = captureSecurityError(() => InputValidator.validateDate('15-01-2024'));
    expect(error.code).toBe('INVALID_DATE_FORMAT');
    expect(error.message).toBe('date must be in YYYY-MM-DD format');
    expect(captureSecurityError(() => InputValidator.validateDate('2024/01/15')).code).toBe('INVALID_DATE_FORMAT');
  });

  test('rejects an impossible month after the shape check', () => {
    expect(captureSecurityError(() => InputValidator.validateDate('2024-13-01')).code).toBe('INVALID_DATE');
  });

  test('an impossible day is accepted because Date rolls it over to the next month', () => {
    expect(() => InputValidator.validateDate('2024-02-30')).not.toThrow();
  });

  test('rejects years outside 1900 to 2100', () => {
    expect(captureSecurityError(() => InputValidator.validateDate('1850-06-15')).code).toBe('DATE_OUT_OF_RANGE');
    expect(captureSecurityError(() => InputValidator.validateDate('2150-06-15')).code).toBe('DATE_OUT_OF_RANGE');
  });

  test('rejects a non-string', () => {
    expect(captureSecurityError(() => InputValidator.validateDate(asString(5))).code).toBe('INVALID_TYPE');
  });
});

describe('InputValidator.validatePath', () => {
  test('rejects traversal and home-directory markers', () => {
    expect(captureSecurityError(() => InputValidator.validatePath('../x')).code).toBe('PATH_TRAVERSAL');
    expect(captureSecurityError(() => InputValidator.validatePath('~/x')).code).toBe('PATH_TRAVERSAL');
  });

  test('rejects Unix absolute and UNC paths', () => {
    expect(captureSecurityError(() => InputValidator.validatePath('/etc/passwd')).code).toBe('ABSOLUTE_PATH');
    expect(captureSecurityError(() => InputValidator.validatePath('\\\\server\\share')).code).toBe('ABSOLUTE_PATH');
  });

  test('accepts a Windows drive path written with forward slashes, since the regex only knows backslashes', () => {
    expect(() => InputValidator.validatePath('C:/cfg.json')).not.toThrow();
  });

  test('accepts a relative path', () => {
    expect(() => InputValidator.validatePath('config/x.json')).not.toThrow();
  });

  test('rejects a non-string path before touching the grammar', () => {
    // :165 is the type guard every later leg depends on; without it `path.includes` TypeErrors.
    expect(captureSecurityError(() => InputValidator.validatePath(undefined as never)).code).toBe('INVALID_TYPE');
    expect(captureSecurityError(() => InputValidator.validatePath(42 as never)).code).toBe('INVALID_TYPE');
    expect(captureSecurityError(() => InputValidator.validatePath(['a'] as never)).message).toBe(
      'Path must be a string'
    );
  });
});

describe('InputValidator sanitizers', () => {
  test('sanitizeString strips angle brackets and C0/DEL characters, then trims', () => {
    expect(InputValidator.sanitizeString('  <b>hi</b>' + String.fromCharCode(0) + String.fromCharCode(31) + '  ')).toBe('bhi/b');
    expect(InputValidator.sanitizeString('plain')).toBe('plain');
  });

  test('sanitizeString does not neutralise quotes or pipes', () => {
    expect(InputValidator.sanitizeString("a'b|c")).toBe("a'b|c");
  });

  test('sanitizeObject keeps strings, finite numbers, booleans and stringified array items', () => {
    expect(
      InputValidator.sanitizeObject({ a: '<x>', b: 1, c: false, d: ['<y>', 2] } as Record<string, unknown>)
    ).toEqual({ a: 'x', b: 1, c: false, d: ['y', 2] });
  });

  test('sanitizeObject drops null, non-finite numbers and nested objects entirely', () => {
    const sanitized = InputValidator.sanitizeObject({
      keep: 'yes',
      nulled: null,
      infinite: Infinity,
      nested: { a: 1 }
    } as Record<string, unknown>);
    expect(sanitized).toEqual({ keep: 'yes' });
    expect('nulled' in sanitized).toBe(false);
    expect('nested' in sanitized).toBe(false);
  });

  test('sanitizeObject leaves non-string array items untouched', () => {
    expect(InputValidator.sanitizeObject({ list: [1, true, { a: 1 }] } as Record<string, unknown>)).toEqual({
      list: [1, true, { a: 1 }]
    });
  });
});

describe('DataSanitizer', () => {
  test('sanitizeQuoteData maps non-finite numbers and absences to null', () => {
    expect(
      DataSanitizer.sanitizeQuoteData({
        price: NaN,
        marketCap: Infinity,
        nothing: null,
        missing: undefined
      })
    ).toEqual({ price: null, marketCap: null, nothing: null, missing: null });
  });

  test('sanitizeQuoteData sanitizes strings and recurses into nested objects', () => {
    expect(
      DataSanitizer.sanitizeQuoteData({
        sym: '<b>AAPL</b>',
        flag: true,
        list: ['<i>', 3],
        nested: { v: Infinity }
      })
    ).toEqual({ sym: 'bAAPL/b', flag: true, list: ['i', 3], nested: { v: null } });
  });

  test('sanitizeQuoteData validates, it does not reject: injection payloads pass through sanitized', () => {
    expect(DataSanitizer.sanitizeQuoteData({ sym: 'a|b' })).toEqual({ sym: 'a|b' });
  });

  test('sanitizeErrorMessage redacts paths and credential-looking pairs', () => {
    expect(DataSanitizer.sanitizeErrorMessage(new Error('failed at /var/log password=hunter2 secret=abc key=xyz'))).toBe(
      'failed at [REDACTED] password=[REDACTED] secret=[REDACTED] key=[REDACTED]'
    );
  });

  test('sanitizeErrorMessage collapses anything that is not an Error to a generic string', () => {
    expect(DataSanitizer.sanitizeErrorMessage('boom')).toBe('An error occurred');
    expect(DataSanitizer.sanitizeErrorMessage({ message: 'symbol not found' })).toBe('An error occurred');
  });
});

describe('bounded numeric validators', () => {
  test('requests per minute must be 1 to 1000', () => {
    expect(() => RateLimitValidator.validateRequestsPerMinute(1)).not.toThrow();
    expect(() => RateLimitValidator.validateRequestsPerMinute(1000)).not.toThrow();
    expect(captureSecurityError(() => RateLimitValidator.validateRequestsPerMinute(0)).code).toBe('INVALID_RATE_LIMIT');
    expect(captureSecurityError(() => RateLimitValidator.validateRequestsPerMinute(1001)).code).toBe('INVALID_RATE_LIMIT');
  });

  test('requests per hour must be 1 to 50000', () => {
    expect(() => RateLimitValidator.validateRequestsPerHour(50000)).not.toThrow();
    expect(captureSecurityError(() => RateLimitValidator.validateRequestsPerHour(50001)).code).toBe('INVALID_RATE_LIMIT');
  });

  test('timeout must be 100 ms to 5 minutes', () => {
    expect(() => RateLimitValidator.validateTimeout(100)).not.toThrow();
    expect(() => RateLimitValidator.validateTimeout(300000)).not.toThrow();
    expect(captureSecurityError(() => RateLimitValidator.validateTimeout(99)).code).toBe('INVALID_TIMEOUT');
    expect(captureSecurityError(() => RateLimitValidator.validateTimeout(300001)).code).toBe('INVALID_TIMEOUT');
  });

  test('TTL must be 0 to 24 hours', () => {
    expect(() => CacheValidator.validateTTL(0)).not.toThrow();
    expect(() => CacheValidator.validateTTL(86400000)).not.toThrow();
    expect(captureSecurityError(() => CacheValidator.validateTTL(-1)).code).toBe('INVALID_TTL');
    expect(captureSecurityError(() => CacheValidator.validateTTL(86400001)).code).toBe('INVALID_TTL');
  });

  test('cache size must be 1 to 100000', () => {
    expect(() => CacheValidator.validateCacheSize(1)).not.toThrow();
    expect(captureSecurityError(() => CacheValidator.validateCacheSize(0)).code).toBe('INVALID_CACHE_SIZE');
  });

  test('cache keys are bounded at 500 characters but run through the content rules first', () => {
    expect(() => CacheValidator.validateCacheKey('quote:AAPL')).not.toThrow();
    expect(captureSecurityError(() => CacheValidator.validateCacheKey('')).code).toBe('INVALID_CACHE_KEY');
    expect(captureSecurityError(() => CacheValidator.validateCacheKey('k'.repeat(501))).code).toBe('INVALID_CACHE_KEY');
    expect(captureSecurityError(() => CacheValidator.validateCacheKey('a|b')).code).toBe('COMMAND_INJECTION_ATTEMPT');
  });
});

describe('NetworkSecurityValidator', () => {
  test('accepts http and https public hosts', () => {
    expect(() => NetworkSecurityValidator.validateURL('http://example.com')).not.toThrow();
    expect(() => NetworkSecurityValidator.validateURL('https://query1.finance.yahoo.com/v8/finance/chart/AAPL')).not.toThrow();
  });

  test('rejects localhost by name and address', () => {
    expect(captureSecurityError(() => NetworkSecurityValidator.validateURL('https://localhost/x')).code).toBe('INVALID_HOSTNAME');
    expect(captureSecurityError(() => NetworkSecurityValidator.validateURL('https://127.0.0.1/x')).code).toBe('INVALID_HOSTNAME');
  });

  test('rejects private and link-local ranges by prefix match', () => {
    expect(captureSecurityError(() => NetworkSecurityValidator.validateURL('https://192.168.1.1/x')).code).toBe('INVALID_HOSTNAME');
    expect(captureSecurityError(() => NetworkSecurityValidator.validateURL('https://10.0.0.1/x')).code).toBe('INVALID_HOSTNAME');
    expect(captureSecurityError(() => NetworkSecurityValidator.validateURL('https://169.254.1.1/x')).code).toBe('INVALID_HOSTNAME');
  });

  test('rejects non-HTTP protocols and unparseable URLs', () => {
    expect(captureSecurityError(() => NetworkSecurityValidator.validateURL('ftp://example.com')).code).toBe('INVALID_PROTOCOL');
    expect(captureSecurityError(() => NetworkSecurityValidator.validateURL('not a url')).code).toBe('INVALID_URL');
  });

  test('user agents are length-checked after the content rules', () => {
    expect(() => NetworkSecurityValidator.validateUserAgent('Mozilla/5.0')).not.toThrow();
    expect(captureSecurityError(() => NetworkSecurityValidator.validateUserAgent('u'.repeat(501))).code).toBe('INVALID_USER_AGENT');
    expect(captureSecurityError(() => NetworkSecurityValidator.validateUserAgent('a|b')).code).toBe('COMMAND_INJECTION_ATTEMPT');
  });
});

describe('ConfigSecurityValidator', () => {
  test('config paths must carry a supported extension', () => {
    expect(() => ConfigSecurityValidator.validateConfigPath('cfg.json')).not.toThrow();
    expect(() => ConfigSecurityValidator.validateConfigPath('cfg.yaml')).not.toThrow();
    expect(() => ConfigSecurityValidator.validateConfigPath('cfg.yml')).not.toThrow();
    expect(captureSecurityError(() => ConfigSecurityValidator.validateConfigPath('cfg.txt')).code).toBe('INVALID_EXTENSION');
  });

  test('a Windows path with forward slashes reaches the extension check', () => {
    expect(() => ConfigSecurityValidator.validateConfigPath('C:/cfg.json')).not.toThrow();
  });

  test('environment keys must be prefixed YF_MCP_', () => {
    expect(() => ConfigSecurityValidator.validateEnvVar('YF_MCP_CACHE_TTL', 'v')).not.toThrow();
    expect(captureSecurityError(() => ConfigSecurityValidator.validateEnvVar('CACHE_TTL', 'v')).code).toBe('INVALID_ENV_KEY');
  });

  test('secret-ish keys require an eight character value', () => {
    expect(() => ConfigSecurityValidator.validateEnvVar('YF_MCP_API_SECRET', 'longersecret')).not.toThrow();
    expect(captureSecurityError(() => ConfigSecurityValidator.validateEnvVar('YF_MCP_API_SECRET', 'short')).code).toBe('WEAK_SECRET');
  });

  test('non-string environment pairs are rejected', () => {
    expect(captureSecurityError(() => ConfigSecurityValidator.validateEnvVar(asNumber(1) as unknown as string, 'v')).code).toBe(
      'INVALID_TYPE'
    );
  });
});
