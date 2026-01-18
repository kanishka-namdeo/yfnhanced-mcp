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
  YF_ERR_COOKIE_ERROR,
  YF_ERR_PARTIAL_DATA
} from '../types/errors.js';

interface ErrorRecord {
  code?: string;
  statusCode?: number;
  response?: {
    status?: number;
    headers?: Record<string, unknown>;
  };
  headers?: Record<string, unknown>;
  status?: number;
}

export function classifyError(error: unknown): YahooFinanceError {
  if (error instanceof YahooFinanceError) {
    return error;
  }

  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorRecord = error as ErrorRecord;
  const statusCode = getStatusCode(errorRecord);

  // Cookie/Set-Cookie errors - common with Yahoo Finance
  if (isCookieError(errorMessage, errorRecord.code)) {
    const cookieHints = getCookieErrorHints(errorMessage);
    return new YahooFinanceError(
      `Cookie/session error: ${errorMessage}`,
      YF_ERR_COOKIE_ERROR,
      statusCode,
      true,
      false,
      { originalError: errorMessage, statusCode, hints: cookieHints },
      'Clear cookies and retry: ' + cookieHints.join('; '),
      undefined,
      undefined
    );
  }

  // Rate limit errors - enhanced with retry guidance
  if (isRateLimitError(statusCode, errorMessage, errorRecord.code)) {
    const retryAfter = getRetryAfter(errorRecord);
    const retryDelay = retryAfter !== null ? ` Retry after ${retryAfter} seconds` : '';

    return new YahooFinanceError(
      'Rate limit exceeded' + retryDelay,
      YF_ERR_RATE_LIMIT,
      429,
      true,
      true,
      { originalError: errorMessage, statusCode, retryAfter },
      'Wait and retry with exponential backoff. Reduce request frequency.',
      undefined,
      undefined
    );
  }

  // Symbol not found
  if (isSymbolNotFoundError(statusCode, errorMessage, errorRecord.code)) {
    return new YahooFinanceError(
      errorMessage.toLowerCase().includes('symbol not found') ? errorMessage : 'Symbol not found',
      YF_ERR_SYMBOL_NOT_FOUND,
      404,
      false,
      false,
      { originalError: errorMessage, statusCode },
      'Verify the stock symbol is valid and try alternative symbols if needed',
      undefined,
      undefined
    );
  }

  // Server errors - enhanced with transient detection
  if (isServerError(statusCode, errorRecord.code)) {
    const isTransient = [502, 503, 504].includes(statusCode ?? 0);
    return new YahooFinanceError(
      `Server error (${statusCode ?? 500}): ${isTransient ? 'Transient error - retry' : 'Server issue'}`,
      YF_ERR_SERVER,
      statusCode ?? 500,
      true,
      false,
      { originalError: errorMessage, statusCode, isTransient },
      isTransient ? 'Retry with exponential backoff. Server is temporarily unavailable.' : 'Retry with exponential backoff. Server experiencing issues.',
      undefined,
      undefined
    );
  }

  // Timeout errors
  if (isTimeoutError(errorMessage, errorRecord.code)) {
    return new YahooFinanceError(
      'Request timeout',
      YF_ERR_TIMEOUT,
      null,
      true,
      false,
      { originalError: errorMessage },
      'Retry with longer timeout. Consider reducing data requested.',
      undefined,
      undefined
    );
  }

  // Network errors
  if (isNetworkError(errorMessage, errorRecord.code)) {
    return new YahooFinanceError(
      'Network error',
      YF_ERR_NETWORK,
      null,
      true,
      false,
      { originalError: errorMessage },
      'Check network connection and retry. May be a temporary connectivity issue.',
      undefined,
      undefined
    );
  }

  // API changed errors
  if (isAPIChangedError(errorMessage, errorRecord.code)) {
    return new YahooFinanceError(
      'API structure changed',
      YF_ERR_API_CHANGED,
      null,
      false,
      false,
      { originalError: errorMessage },
      'Update data extraction logic to match new API structure. Report this issue.',
      undefined,
      undefined
    );
  }

  // Data unavailable errors
  if (isDataUnavailableError(errorMessage, errorRecord.code)) {
    return new YahooFinanceError(
      'Data unavailable',
      YF_ERR_DATA_UNAVAILABLE,
      null,
      false,
      false,
      { originalError: errorMessage },
      'Data may not be available for this symbol or time period. Try different date range.',
      undefined,
      undefined
    );
  }

  // Incomplete/partial data errors
  if (isPartialDataError(errorMessage, errorRecord.code)) {
    return new YahooFinanceError(
      'Incomplete data received',
      YF_ERR_PARTIAL_DATA,
      null,
      false,
      false,
      { originalError: errorMessage },
      'Partial data available. Some fields may be missing. Consider retrying for complete data.',
      undefined,
      undefined
    );
  }

  // Circuit breaker errors
  if (isCircuitOpenError(errorMessage, errorRecord.code)) {
    return new YahooFinanceError(
      'Circuit breaker open',
      YF_ERR_CIRCUIT_OPEN,
      null,
      false,
      false,
      { originalError: errorMessage },
      'Wait for circuit breaker to reset before retrying. Too many recent failures.',
      undefined,
      undefined
    );
  }

  // Stale cache errors
  if (isStaleCacheError(errorMessage, errorRecord.code)) {
    return new YahooFinanceError(
      'Stale cache data',
      YF_ERR_CACHE_STALE,
      null,
      false,
      false,
      { originalError: errorMessage },
      'Clear cache and fetch fresh data. Use forceRefresh option.',
      undefined,
      undefined
    );
  }

  // Null/undefined data
  if (isNullDataError(errorMessage)) {
    return new YahooFinanceError(
      'Data unavailable',
      YF_ERR_DATA_UNAVAILABLE,
      null,
      false,
      false,
      { originalError: errorMessage },
      'Data may not be available for this symbol or time period',
      undefined,
      undefined
    );
  }

  // Unknown errors - mark as retryable to attempt recovery
  return new YahooFinanceError(
    'Unknown error',
    YF_ERR_UNKNOWN,
    null,
    true,
    false,
    { originalError: errorMessage, stack: error instanceof Error ? error.stack : undefined },
    'Review error details and try again. May be a transient issue.',
    undefined,
    undefined
  );
}

/**
 * Helper function to extract status code from error object
 */
function getStatusCode(error: ErrorRecord): number | null {
  if (typeof error.statusCode === 'number') {
    return error.statusCode;
  }

  if (error.response) {
    const status = error.response.status;
    if (typeof status === 'number') {
      return status;
    }
  }

  if (typeof error.status === 'number') {
    return error.status;
  }

  return null;
}

/**
 * Helper function to extract retry-after header
 */
function getRetryAfter(error: ErrorRecord): number | null {
  if (error.response?.headers) {
    const retryAfter = error.response.headers['retry-after'];
    if (typeof retryAfter === 'number') {
      return retryAfter;
    }
    if (typeof retryAfter === 'string') {
      const parsed = parseInt(retryAfter, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  if (error.headers) {
    const retryAfter = error.headers['retry-after'];
    if (typeof retryAfter === 'number') {
      return retryAfter;
    }
    if (typeof retryAfter === 'string') {
      const parsed = parseInt(retryAfter, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

/**
 * Helper functions to check error types
 */
function isCookieError(message: string, code?: string): boolean {
  const lowerMsg = message.toLowerCase();
  return (
    lowerMsg.includes('cookie') ||
    lowerMsg.includes('set-cookie') ||
    lowerMsg.includes('crumb') ||
    lowerMsg.includes('cookie jar') ||
    lowerMsg.includes('csrf') ||
    lowerMsg.includes('session') ||
    code === YF_ERR_COOKIE_ERROR
  );
}

function isRateLimitError(statusCode: number | null, message: string, code?: string): boolean {
  return (
    statusCode === 429 ||
    message.toLowerCase().includes('rate limit') ||
    code === YF_ERR_RATE_LIMIT
  );
}

function isSymbolNotFoundError(statusCode: number | null, message: string, code?: string): boolean {
  return (
    statusCode === 404 ||
    message.toLowerCase().includes('symbol not found') ||
    message.toLowerCase().includes('no data found') ||
    code === YF_ERR_SYMBOL_NOT_FOUND
  );
}

function isServerError(statusCode: number | null, code?: string): boolean {
  return (
    (statusCode !== null && statusCode >= 500 && statusCode < 600) ||
    code === YF_ERR_SERVER
  );
}

function isTimeoutError(message: string, code?: string): boolean {
  return (
    message.toLowerCase().includes('timeout') ||
    message.toLowerCase().includes('etimeout') ||
    code === YF_ERR_TIMEOUT
  );
}

function isNetworkError(message: string, code?: string): boolean {
  return (
    message.toLowerCase().includes('network') ||
    message.toLowerCase().includes('econnrefused') ||
    message.toLowerCase().includes('enotfound') ||
    code === YF_ERR_NETWORK
  );
}

function isAPIChangedError(message: string, code?: string): boolean {
  return (
    message.toLowerCase().includes('api changed') ||
    message.toLowerCase().includes('unexpected structure') ||
    code === YF_ERR_API_CHANGED
  );
}

function isDataUnavailableError(message: string, code?: string): boolean {
  return (
    message.toLowerCase().includes('data unavailable') ||
    message.toLowerCase().includes('no data available') ||
    code === YF_ERR_DATA_UNAVAILABLE
  );
}

function isPartialDataError(message: string, code?: string): boolean {
  return (
    message.toLowerCase().includes('incomplete') ||
    message.toLowerCase().includes('partial data') ||
    code === YF_ERR_DATA_INCOMPLETE ||
    code === YF_ERR_PARTIAL_DATA
  );
}

function isCircuitOpenError(message: string, code?: string): boolean {
  return (
    message.toLowerCase().includes('circuit open') ||
    code === YF_ERR_CIRCUIT_OPEN
  );
}

function isStaleCacheError(message: string, code?: string): boolean {
  return (
    message.toLowerCase().includes('stale cache') ||
    code === YF_ERR_CACHE_STALE
  );
}

function isNullDataError(message: string): boolean {
  return (
    message.toLowerCase().includes('null') ||
    message.toLowerCase().includes('undefined')
  );
}

/**
 * Provides helpful hints for cookie-related errors
 */
function getCookieErrorHints(errorMessage: string): string[] {
  const hints: string[] = [];
  const lowerMsg = errorMessage.toLowerCase();

  if (lowerMsg.includes('crumb')) {
    hints.push('Cookie crumb token may be expired');
  }
  if (lowerMsg.includes('csrf')) {
    hints.push('CSRF token validation failed');
  }
  if (lowerMsg.includes('session')) {
    hints.push('Session may have expired');
  }
  if (lowerMsg.includes('set-cookie')) {
    hints.push('Check cookie header format');
  }
  if (lowerMsg.includes('cookie jar')) {
    hints.push('Cookie storage issue detected');
  }

  if (hints.length === 0) {
    hints.push('Clear cookies and retry');
    hints.push('Ensure proper cookie handling');
  }

  return hints;
}

export function isRetryableError(error: YahooFinanceError): boolean {
  return error.isRetryable;
}

export function isRateLimitErrorCheck(error: YahooFinanceError): boolean {
  return error.isRateLimit;
}
