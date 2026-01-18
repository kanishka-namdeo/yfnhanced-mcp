import { YahooFinanceError, YF_ERR_RATE_LIMIT, YF_ERR_API_CHANGED, YF_ERR_DATA_UNAVAILABLE, YF_ERR_SYMBOL_NOT_FOUND, YF_ERR_NETWORK, YF_ERR_TIMEOUT, YF_ERR_SERVER, YF_ERR_DATA_INCOMPLETE, YF_ERR_CIRCUIT_OPEN, YF_ERR_CACHE_STALE, YF_ERR_UNKNOWN } from '../types/errors.js';

export function classifyError(error: unknown): YahooFinanceError {
  if (error instanceof YahooFinanceError) {
    return error;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorCode = (error as any)?.code;
  const statusCode = (error as any)?.statusCode || (error as any)?.response?.status || (error as any)?.status;

  if (statusCode === 429 || errorMessage.toLowerCase().includes('rate limit') || errorCode === YF_ERR_RATE_LIMIT) {
    return new YahooFinanceError(
      'Rate limit exceeded',
      YF_ERR_RATE_LIMIT,
      429,
      true,
      true,
      { originalError: errorMessage, statusCode },
      'Wait and retry with exponential backoff'
    );
  }

  if (statusCode === 404 || errorMessage.toLowerCase().includes('symbol not found') || errorMessage.toLowerCase().includes('no data found') || errorCode === YF_ERR_SYMBOL_NOT_FOUND) {
    return new YahooFinanceError(
      'Symbol not found',
      YF_ERR_SYMBOL_NOT_FOUND,
      404,
      false,
      false,
      { originalError: errorMessage, statusCode },
      'Verify the stock symbol is valid'
    );
  }

  if (statusCode && statusCode >= 500 && statusCode < 600 || errorCode === YF_ERR_SERVER) {
    return new YahooFinanceError(
      'Server error',
      YF_ERR_SERVER,
      statusCode || 500,
      true,
      false,
      { originalError: errorMessage, statusCode },
      'Retry with exponential backoff'
    );
  }

  if (errorMessage.toLowerCase().includes('timeout') || errorMessage.toLowerCase().includes('etimeout') || errorCode === YF_ERR_TIMEOUT) {
    return new YahooFinanceError(
      'Request timeout',
      YF_ERR_TIMEOUT,
      null,
      true,
      false,
      { originalError: errorMessage },
      'Retry with longer timeout'
    );
  }

  if (errorMessage.toLowerCase().includes('network') || errorMessage.toLowerCase().includes('econnrefused') || errorMessage.toLowerCase().includes('enotfound') || errorCode === YF_ERR_NETWORK) {
    return new YahooFinanceError(
      'Network error',
      YF_ERR_NETWORK,
      null,
      true,
      false,
      { originalError: errorMessage },
      'Check network connection and retry'
    );
  }

  if (errorMessage.toLowerCase().includes('api changed') || errorMessage.toLowerCase().includes('unexpected structure') || errorCode === YF_ERR_API_CHANGED) {
    return new YahooFinanceError(
      'API structure changed',
      YF_ERR_API_CHANGED,
      null,
      false,
      false,
      { originalError: errorMessage },
      'Update data extraction logic to match new API structure'
    );
  }

  if (errorMessage.toLowerCase().includes('data unavailable') || errorMessage.toLowerCase().includes('no data available') || errorCode === YF_ERR_DATA_UNAVAILABLE) {
    return new YahooFinanceError(
      'Data unavailable',
      YF_ERR_DATA_UNAVAILABLE,
      null,
      false,
      false,
      { originalError: errorMessage },
      'Data may not be available for this symbol or time period'
    );
  }

  if (errorMessage.toLowerCase().includes('incomplete') || errorMessage.toLowerCase().includes('partial data') || errorCode === YF_ERR_DATA_INCOMPLETE) {
    return new YahooFinanceError(
      'Incomplete data',
      YF_ERR_DATA_INCOMPLETE,
      null,
      false,
      false,
      { originalError: errorMessage },
      'Data returned may be partial or incomplete'
    );
  }

  if (errorMessage.toLowerCase().includes('circuit open') || errorCode === YF_ERR_CIRCUIT_OPEN) {
    return new YahooFinanceError(
      'Circuit breaker open',
      YF_ERR_CIRCUIT_OPEN,
      null,
      false,
      false,
      { originalError: errorMessage },
      'Wait for circuit breaker to reset before retrying'
    );
  }

  if (errorMessage.toLowerCase().includes('stale cache') || errorCode === YF_ERR_CACHE_STALE) {
    return new YahooFinanceError(
      'Stale cache data',
      YF_ERR_CACHE_STALE,
      null,
      false,
      false,
      { originalError: errorMessage },
      'Clear cache and fetch fresh data'
    );
  }

  if (errorMessage.toLowerCase().includes('null') || errorMessage.toLowerCase().includes('undefined')) {
    return new YahooFinanceError(
      'Data unavailable',
      YF_ERR_DATA_UNAVAILABLE,
      null,
      false,
      false,
      { originalError: errorMessage },
      'Data may not be available for this symbol or time period'
    );
  }

  return new YahooFinanceError(
    'Unknown error',
    YF_ERR_UNKNOWN,
    null,
    false,
    false,
    { originalError: errorMessage },
    'Review error details and try again'
  );
}

export function isRetryableError(error: YahooFinanceError): boolean {
  return error.isRetryable;
}

export function isRateLimitError(error: YahooFinanceError): boolean {
  return error.isRateLimit;
}
