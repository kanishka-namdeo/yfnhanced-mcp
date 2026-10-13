const MAX_SYMBOL_LENGTH = 20;
const MIN_SYMBOL_LENGTH = 1;
const ALLOWED_SYMBOL_CHARS = /^[A-Z0-9\.\-\^]+$/;
const MAX_SYMBOLS_PER_REQUEST = 50;
const MAX_STRING_LENGTH = 1000;
const SAFE_NUMBER_MIN = -Number.MAX_VALUE;
const SAFE_NUMBER_MAX = Number.MAX_VALUE;

const DANGEROUS_PATTERNS = [
  /\$\{.*\}/,
  /<script[^>]*>.*?<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /data:text\/html/gi,
  /\.\.[\/\\]/,
  /file:\/\//gi,
  /ftp:\/\//gi
];

const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC|ALTER|CREATE|TRUNCATE)\b)/gi,
  /(\b(OR|AND)\s+\d+\s*=\s*\d+)/gi,
  /(\b(OR|AND)\s+["'].*?["']\s*=\s*["'].*?["'])/gi
];

const COMMAND_INJECTION_PATTERNS = [
  /[;&|`$()]/,
  /\$\([^)]*\)/,
  /`[^`]*`/
];

export class SecurityError extends Error {
  code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'SecurityError';
    this.code = code;
  }
}

export class InputValidator {
  static validateSymbol(symbol: string): void {
    if (typeof symbol !== 'string') {
      throw new SecurityError('Symbol must be a string', 'INVALID_TYPE');
    }

    if (symbol.length < MIN_SYMBOL_LENGTH || symbol.length > MAX_SYMBOL_LENGTH) {
      throw new SecurityError(
        `Symbol length must be between ${MIN_SYMBOL_LENGTH} and ${MAX_SYMBOL_LENGTH}`,
        'INVALID_LENGTH'
      );
    }

    if (!ALLOWED_SYMBOL_CHARS.test(symbol)) {
      throw new SecurityError('Symbol contains invalid characters', 'INVALID_CHARS');
    }
  }

  static validateSymbols(symbols: string[]): void {
    if (!Array.isArray(symbols)) {
      throw new SecurityError('Symbols must be an array', 'INVALID_TYPE');
    }

    if (symbols.length === 0) {
      throw new SecurityError('Symbols array cannot be empty', 'EMPTY_ARRAY');
    }

    if (symbols.length > MAX_SYMBOLS_PER_REQUEST) {
      throw new SecurityError(
        `Maximum ${MAX_SYMBOLS_PER_REQUEST} symbols per request`,
        'TOO_MANY_SYMBOLS'
      );
    }

    const uniqueSymbols = new Set(symbols);
    if (uniqueSymbols.size !== symbols.length) {
      throw new SecurityError('Duplicate symbols are not allowed', 'DUPLICATE_SYMBOLS');
    }

    for (const symbol of symbols) {
      this.validateSymbol(symbol);
    }
  }

  static validateString(input: string, fieldName: string = 'input'): void {
    if (typeof input !== 'string') {
      throw new SecurityError(`${fieldName} must be a string`, 'INVALID_TYPE');
    }

    if (input.length > MAX_STRING_LENGTH) {
      throw new SecurityError(
        `${fieldName} exceeds maximum length of ${MAX_STRING_LENGTH}`,
        'INVALID_LENGTH'
      );
    }

    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(input)) {
        throw new SecurityError(
          `${fieldName} contains potentially dangerous content`,
          'DANGEROUS_CONTENT'
        );
      }
    }

    for (const pattern of SQL_INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        throw new SecurityError(
          `${fieldName} contains potentially dangerous SQL patterns`,
          'SQL_INJECTION_ATTEMPT'
        );
      }
    }

    for (const pattern of COMMAND_INJECTION_PATTERNS) {
      if (pattern.test(input)) {
        throw new SecurityError(
          `${fieldName} contains potentially dangerous command patterns`,
          'COMMAND_INJECTION_ATTEMPT'
        );
      }
    }
  }

  static validateNumber(input: number, fieldName: string = 'number'): void {
    if (typeof input !== 'number' || isNaN(input)) {
      throw new SecurityError(`${fieldName} must be a valid number`, 'INVALID_NUMBER');
    }

    if (!isFinite(input)) {
      throw new SecurityError(`${fieldName} must be finite`, 'INFINITE_NUMBER');
    }

    if (input < SAFE_NUMBER_MIN || input > SAFE_NUMBER_MAX) {
      throw new SecurityError(`${fieldName} is out of safe range`, 'OUT_OF_RANGE');
    }
  }

  static validateDate(dateString: string, fieldName: string = 'date'): void {
    if (typeof dateString !== 'string') {
      throw new SecurityError(`${fieldName} must be a string`, 'INVALID_TYPE');
    }

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) {
      throw new SecurityError(
        `${fieldName} must be in YYYY-MM-DD format`,
        'INVALID_DATE_FORMAT'
      );
    }

    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      throw new SecurityError(`${fieldName} is not a valid date`, 'INVALID_DATE');
    }

    const year = date.getFullYear();
    if (year < 1900 || year > 2100) {
      throw new SecurityError(`${fieldName} is out of valid range (1900-2100)`, 'DATE_OUT_OF_RANGE');
    }
  }

  static validatePath(path: string): void {
    if (typeof path !== 'string') {
      throw new SecurityError('Path must be a string', 'INVALID_TYPE');
    }

    if (path.includes('..') || path.includes('~')) {
      throw new SecurityError('Path contains directory traversal characters', 'PATH_TRAVERSAL');
    }

    const absolutePathRegex = /^[A-Za-z]:\\|^\/|^\\/;
    if (absolutePathRegex.test(path)) {
      throw new SecurityError('Absolute paths are not allowed', 'ABSOLUTE_PATH');
    }
  }

  static sanitizeString(input: string): string {
    return input
      .replace(/[<>]/g, '')
      .replace(/[\x00-\x1F\x7F]/g, '')
      .trim();
  }

  static sanitizeObject<T extends Record<string, unknown>>(obj: T): Partial<T> {
    const sanitized = {} as Partial<T>;

    for (const [key, value] of Object.entries(obj)) {
      const typedKey = key as keyof T;
      if (typeof value === 'string') {
        sanitized[typedKey] = this.sanitizeString(value) as T[keyof T];
      } else if (typeof value === 'number' && isFinite(value)) {
        sanitized[typedKey] = value as T[keyof T];
      } else if (typeof value === 'boolean') {
        sanitized[typedKey] = value as T[keyof T];
      } else if (Array.isArray(value)) {
        sanitized[typedKey] = value.map((item: unknown) => 
          typeof item === 'string' ? this.sanitizeString(item) : item
        ) as T[keyof T];
      }
    }

    return sanitized;
  }
}

export class RateLimitValidator {
  static validateRequestsPerMinute(value: number): void {
    InputValidator.validateNumber(value);
    if (value < 1 || value > 1000) {
      throw new SecurityError('Requests per minute must be between 1 and 1000', 'INVALID_RATE_LIMIT');
    }
  }

  static validateRequestsPerHour(value: number): void {
    InputValidator.validateNumber(value);
    if (value < 1 || value > 50000) {
      throw new SecurityError('Requests per hour must be between 1 and 50000', 'INVALID_RATE_LIMIT');
    }
  }

  static validateTimeout(value: number): void {
    InputValidator.validateNumber(value);
    if (value < 100 || value > 300000) {
      throw new SecurityError('Timeout must be between 100ms and 5 minutes', 'INVALID_TIMEOUT');
    }
  }
}

export class CacheValidator {
  static validateTTL(value: number): void {
    InputValidator.validateNumber(value);
    if (value < 0 || value > 86400000) {
      throw new SecurityError('TTL must be between 0 and 24 hours', 'INVALID_TTL');
    }
  }

  static validateCacheSize(value: number): void {
    InputValidator.validateNumber(value);
    if (value < 1 || value > 100000) {
      throw new SecurityError('Cache size must be between 1 and 100000', 'INVALID_CACHE_SIZE');
    }
  }

  static validateCacheKey(key: string): void {
    InputValidator.validateString(key);
    if (key.length === 0 || key.length > 500) {
      throw new SecurityError('Cache key must be between 1 and 500 characters', 'INVALID_CACHE_KEY');
    }
  }
}

export class NetworkSecurityValidator {
  static validateURL(url: string): void {
    try {
      const parsed = new URL(url);

      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new SecurityError('Only HTTP and HTTPS protocols are allowed', 'INVALID_PROTOCOL');
      }

      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        throw new SecurityError('Localhost is not allowed', 'INVALID_HOSTNAME');
      }

      if (parsed.hostname.startsWith('192.168.') || 
          parsed.hostname.startsWith('10.') ||
          parsed.hostname.includes('169.254.')) {
        throw new SecurityError('Private IP addresses are not allowed', 'INVALID_HOSTNAME');
      }
    } catch (error) {
      if (error instanceof SecurityError) {
        throw error;
      }
      throw new SecurityError('Invalid URL format', 'INVALID_URL');
    }
  }

  static validateUserAgent(userAgent: string): void {
    InputValidator.validateString(userAgent);
    const maxLength = 500;
    if (userAgent.length > maxLength) {
      throw new SecurityError(`User agent must be less than ${maxLength} characters`, 'INVALID_USER_AGENT');
    }
  }
}

export class ConfigSecurityValidator {
  static validateConfigPath(path: string): void {
    InputValidator.validatePath(path);

    const validExtensions = ['.json', '.yaml', '.yml'];
    const hasValidExtension = validExtensions.some(ext => path.endsWith(ext));

    if (!hasValidExtension) {
      throw new SecurityError('Config file must have .json, .yaml, or .yml extension', 'INVALID_EXTENSION');
    }
  }

  static validateEnvVar(key: string, value: string): void {
    if (typeof key !== 'string' || typeof value !== 'string') {
      throw new SecurityError('Environment variable key and value must be strings', 'INVALID_TYPE');
    }

    if (!/^YF_MCP_[A-Z_]+$/.test(key)) {
      throw new SecurityError('Invalid environment variable key format', 'INVALID_ENV_KEY');
    }

    if (key.includes('SECRET') || key.includes('PASSWORD') || key.includes('API_KEY')) {
      if (value.length < 8) {
        throw new SecurityError('Secret value must be at least 8 characters', 'WEAK_SECRET');
      }
    }
  }
}

export class DataSanitizer {
  static sanitizeQuoteData(data: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (value === null || value === undefined) {
        sanitized[key] = null;
        continue;
      }

      if (typeof value === 'number') {
        sanitized[key] = isFinite(value) ? value : null;
      } else if (typeof value === 'string') {
        sanitized[key] = InputValidator.sanitizeString(value);
      } else if (typeof value === 'boolean') {
        sanitized[key] = value;
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map((item: unknown) => 
          typeof item === 'string' ? InputValidator.sanitizeString(item) : item
        );
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeQuoteData(value as Record<string, unknown>);
      }
    }

    return sanitized;
  }

  static sanitizeErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      const message = error.message;
      return message
        .replace(/\/[^\s]+/g, '[REDACTED]')
        .replace(/password[=:][^\s]+/gi, 'password=[REDACTED]')
        .replace(/secret[=:][^\s]+/gi, 'secret=[REDACTED]')
        .replace(/key[=:][^\s]+/gi, 'key=[REDACTED]');
    }
    return 'An error occurred';
  }
}


