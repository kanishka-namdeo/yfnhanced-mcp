export const YF_ERR_RATE_LIMIT = 'YF_ERR_RATE_LIMIT';
export const YF_ERR_API_CHANGED = 'YF_ERR_API_CHANGED';
export const YF_ERR_DATA_UNAVAILABLE = 'YF_ERR_DATA_UNAVAILABLE';
export const YF_ERR_SYMBOL_NOT_FOUND = 'YF_ERR_SYMBOL_NOT_FOUND';
export const YF_ERR_NETWORK = 'YF_ERR_NETWORK';
export const YF_ERR_TIMEOUT = 'YF_ERR_TIMEOUT';
export const YF_ERR_SERVER = 'YF_ERR_SERVER';
export const YF_ERR_DATA_INCOMPLETE = 'YF_ERR_DATA_INCOMPLETE';
export const YF_ERR_CIRCUIT_OPEN = 'YF_ERR_CIRCUIT_OPEN';
export const YF_ERR_CACHE_STALE = 'YF_ERR_CACHE_STALE';
export const YF_ERR_UNKNOWN = 'YF_ERR_UNKNOWN';
export const YF_ERR_MAX_RETRIES_EXCEEDED = 'YF_ERR_MAX_RETRIES_EXCEEDED';

export type ErrorCodeType =
  | typeof YF_ERR_RATE_LIMIT
  | typeof YF_ERR_API_CHANGED
  | typeof YF_ERR_DATA_UNAVAILABLE
  | typeof YF_ERR_SYMBOL_NOT_FOUND
  | typeof YF_ERR_NETWORK
  | typeof YF_ERR_TIMEOUT
  | typeof YF_ERR_SERVER
  | typeof YF_ERR_DATA_INCOMPLETE
  | typeof YF_ERR_CIRCUIT_OPEN
  | typeof YF_ERR_CACHE_STALE
  | typeof YF_ERR_UNKNOWN
  | typeof YF_ERR_MAX_RETRIES_EXCEEDED;

export class YahooFinanceError extends Error {
  code: ErrorCodeType;
  statusCode: number | null;
  isRetryable: boolean;
  isRateLimit: boolean;
  context: Record<string, unknown>;
  timestamp: Date;
  suggestedAction: string;

  constructor(
    message: string,
    code: ErrorCodeType,
    statusCode: number | null,
    isRetryable: boolean,
    isRateLimit: boolean,
    context: Record<string, unknown> = {},
    suggestedAction: string
  ) {
    super(message);
    this.name = 'YahooFinanceError';
    this.code = code;
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
    this.isRateLimit = isRateLimit;
    this.context = context;
    this.timestamp = new Date();
    this.suggestedAction = suggestedAction;
    Object.setPrototypeOf(this, YahooFinanceError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      isRetryable: this.isRetryable,
      isRateLimit: this.isRateLimit,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      suggestedAction: this.suggestedAction
    };
  }
}
