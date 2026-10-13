import {
  YahooFinanceError,
  YF_ERR_RATE_LIMIT,
  YF_ERR_API_CHANGED,
  YF_ERR_DATA_UNAVAILABLE,
  YF_ERR_SYMBOL_NOT_FOUND,
  YF_ERR_NETWORK,
  YF_ERR_TIMEOUT,
  YF_ERR_SERVER,
  YF_ERR_DATA_INCOMPLETE,
  YF_ERR_CIRCUIT_OPEN,
  YF_ERR_CACHE_STALE,
  YF_ERR_UNKNOWN,
  YF_ERR_MAX_RETRIES_EXCEEDED,
  YF_ERR_COOKIE_ERROR,
  YF_ERR_PARTIAL_DATA
} from '../../../src/types/errors';

// YahooFinanceError is the ONLY runtime class this module exports. It takes nine
// positional arguments: message, code, statusCode, isRetryable, isRateLimit,
// context = {}, suggestedAction, warnings?, partialData?. suggestedAction has no
// default even though it follows a defaulted parameter, so callers pass the first
// seven positions explicitly. This factory mirrors that real call signature.
function makeError(overrides: Record<string, unknown> = {}): YahooFinanceError {
  const a = {
    message: 'quote failed',
    code: YF_ERR_NETWORK as string,
    statusCode: 503,
    isRetryable: true,
    isRateLimit: false,
    context: { symbol: 'AAPL' } as Record<string, unknown>,
    suggestedAction: 'Retry after a short delay',
    warnings: undefined as unknown[] | undefined,
    partialData: undefined as unknown,
    ...overrides
  };
  return new YahooFinanceError(
    a.message as string,
    a.code as never,
    a.statusCode as number,
    a.isRetryable as boolean,
    a.isRateLimit as boolean,
    a.context as Record<string, unknown>,
    a.suggestedAction as string,
    a.warnings as never,
    a.partialData
  );
}

describe('error code constants', () => {
  test('each YF_ERR_* constant equals its own name', () => {
    expect(YF_ERR_RATE_LIMIT).toBe('YF_ERR_RATE_LIMIT');
    expect(YF_ERR_API_CHANGED).toBe('YF_ERR_API_CHANGED');
    expect(YF_ERR_DATA_UNAVAILABLE).toBe('YF_ERR_DATA_UNAVAILABLE');
    expect(YF_ERR_SYMBOL_NOT_FOUND).toBe('YF_ERR_SYMBOL_NOT_FOUND');
    expect(YF_ERR_NETWORK).toBe('YF_ERR_NETWORK');
    expect(YF_ERR_TIMEOUT).toBe('YF_ERR_TIMEOUT');
    expect(YF_ERR_SERVER).toBe('YF_ERR_SERVER');
    expect(YF_ERR_DATA_INCOMPLETE).toBe('YF_ERR_DATA_INCOMPLETE');
    expect(YF_ERR_CIRCUIT_OPEN).toBe('YF_ERR_CIRCUIT_OPEN');
    expect(YF_ERR_CACHE_STALE).toBe('YF_ERR_CACHE_STALE');
    expect(YF_ERR_UNKNOWN).toBe('YF_ERR_UNKNOWN');
    expect(YF_ERR_MAX_RETRIES_EXCEEDED).toBe('YF_ERR_MAX_RETRIES_EXCEEDED');
    expect(YF_ERR_COOKIE_ERROR).toBe('YF_ERR_COOKIE_ERROR');
    expect(YF_ERR_PARTIAL_DATA).toBe('YF_ERR_PARTIAL_DATA');
  });
});

describe('YahooFinanceError', () => {
  test('is a real Error carrying the message and a fixed name', () => {
    const error = makeError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(YahooFinanceError);
    expect(error.message).toBe('quote failed');
    expect(error.name).toBe('YahooFinanceError');
    expect(error.stack).toBeDefined();
  });

  test('stores the six required positional fields verbatim', () => {
    const error = new YahooFinanceError(
      'rate limited',
      YF_ERR_RATE_LIMIT,
      429,
      false,
      true,
      { endpoint: 'quote' },
      'Back off before retrying'
    );
    expect(error.code).toBe(YF_ERR_RATE_LIMIT);
    expect(error.statusCode).toBe(429);
    expect(error.isRetryable).toBe(false);
    expect(error.isRateLimit).toBe(true);
    expect(error.context).toEqual({ endpoint: 'quote' });
    expect(error.suggestedAction).toBe('Back off before retrying');
  });

  test('defaults context to an empty object when position 6 is undefined', () => {
    // context has a default, so passing undefined still yields {}; suggestedAction
    // in position 7 is passed explicitly, exactly as every real caller must.
    const error = new YahooFinanceError('boom', YF_ERR_UNKNOWN, null, false, false, undefined, 'Inspect the payload');
    expect(error.context).toEqual({});
    expect(error.statusCode).toBeNull();
  });

  test('sets timestamp to construction time as a Date', () => {
    const before = Date.now();
    const error = makeError();
    const after = Date.now();
    expect(error.timestamp).toBeInstanceOf(Date);
    expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    expect(error.timestamp.getTime()).toBeLessThanOrEqual(after);
  });

  test('optional warnings and partialData stay undefined when not supplied', () => {
    const error = makeError();
    expect(error.warnings).toBeUndefined();
    expect(error.partialData).toBeUndefined();
  });

  describe('toJSON', () => {
    test('exposes the client-visible envelope with an ISO timestamp', () => {
      const error = makeError();
      const json = error.toJSON();
      expect(json.name).toBe('YahooFinanceError');
      expect(json.message).toBe('quote failed');
      expect(json.code).toBe(YF_ERR_NETWORK);
      expect(json.statusCode).toBe(503);
      expect(json.isRetryable).toBe(true);
      expect(json.isRateLimit).toBe(false);
      expect(json.context).toEqual({ symbol: 'AAPL' });
      expect(json.suggestedAction).toBe('Retry after a short delay');
      expect(typeof json.timestamp).toBe('string');
      expect(new Date(json.timestamp as string).toISOString()).toBe(json.timestamp);
    });

    test('reports hasPartialData as a boolean, never the payload itself', () => {
      const withoutData = makeError().toJSON();
      expect(withoutData.hasPartialData).toBe(false);
      expect(withoutData.partialData).toBeUndefined();

      const withData = makeError({ partialData: { close: 150 } }).toJSON();
      expect(withData.hasPartialData).toBe(true);
      expect(withData.partialData).toBeUndefined();
    });

    test('carries warnings through when supplied', () => {
      const warnings = [{ field: 'close', severity: 'info', message: 'approx', timestamp: new Date() }];
      const json = makeError({ warnings }).toJSON();
      expect(json.warnings).toEqual(warnings);
    });

    test('omits warnings when none were supplied', () => {
      const json = makeError().toJSON();
      expect(json.warnings).toBeUndefined();
    });
  });

  describe('getPartialData', () => {
    test('reports no partial data when partialData is undefined', () => {
      const result = makeError().getPartialData();
      expect(result.data).toBeNull();
      expect(result.warnings).toEqual([]);
      expect(result.isPartial).toBe(false);
      expect(result.hasData).toBe(false);
    });

    test('a present-but-empty payload still reports partial success', () => {
      const result = makeError({ partialData: {} }).getPartialData();
      expect(result.data).toEqual({});
      expect(result.isPartial).toBe(true);
      expect(result.hasData).toBe(true);
    });

    test('forwards the payload and warnings when both are present', () => {
      const warnings = [{ field: 'volume', severity: 'warning', message: 'stale', timestamp: new Date() }];
      const result = makeError({ partialData: { close: 150 }, warnings }).getPartialData();
      expect(result.data).toEqual({ close: 150 });
      expect(result.warnings).toEqual(warnings);
      expect(result.isPartial).toBe(true);
    });
  });
});
