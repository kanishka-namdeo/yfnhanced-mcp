import { YahooFinanceError, ConfigError, NetworkError, RateLimitError, CircuitBreakerError, ValidationError, NotFoundError } from '../../../src/types/errors';

describe('YahooFinanceError', () => {
  test('should create error with message', () => {
    const error = new YahooFinanceError('Test error');
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('YahooFinanceError');
  });

  test('should include code', () => {
    const error = new YahooFinanceError('Test error', 'TEST_CODE');
    expect(error.code).toBe('TEST_CODE');
  });

  test('should include timestamp', () => {
    const before = Date.now();
    const error = new YahooFinanceError('Test error');
    const after = Date.now();
    expect(error.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    expect(error.timestamp.getTime()).toBeLessThanOrEqual(after);
  });

  test('should be instance of Error', () => {
    const error = new YahooFinanceError('Test error');
    expect(error).toBeInstanceOf(Error);
  });

  test('should capture stack trace', () => {
    const error = new YahooFinanceError('Test error');
    expect(error.stack).toBeDefined();
  });

  test('should support toJSON', () => {
    const error = new YahooFinanceError('Test error', 'TEST_CODE');
    const json = error.toJSON();
    expect(json).toHaveProperty('message');
    expect(json).toHaveProperty('code');
    expect(json).toHaveProperty('timestamp');
  });
});

describe('ConfigError', () => {
  test('should create config error', () => {
    const error = new ConfigError('Invalid config');
    expect(error.message).toBe('Invalid config');
    expect(error.name).toBe('ConfigError');
  });

  test('should have correct code', () => {
    const error = new ConfigError('Invalid config');
    expect(error.code).toBe('YF_ERR_CONFIG');
  });

  test('should be instance of YahooFinanceError', () => {
    const error = new ConfigError('Invalid config');
    expect(error).toBeInstanceOf(YahooFinanceError);
  });

  test('should be instance of Error', () => {
    const error = new ConfigError('Invalid config');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('NetworkError', () => {
  test('should create network error', () => {
    const error = new NetworkError('Network failed');
    expect(error.message).toBe('Network failed');
    expect(error.name).toBe('NetworkError');
  });

  test('should have correct code', () => {
    const error = new NetworkError('Network failed');
    expect(error.code).toBe('YF_ERR_NETWORK');
  });

  test('should be instance of YahooFinanceError', () => {
    const error = new NetworkError('Network failed');
    expect(error).toBeInstanceOf(YahooFinanceError);
  });

  test('should be instance of Error', () => {
    const error = new NetworkError('Network failed');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('RateLimitError', () => {
  test('should create rate limit error', () => {
    const error = new RateLimitError('Rate limit exceeded');
    expect(error.message).toBe('Rate limit exceeded');
    expect(error.name).toBe('RateLimitError');
  });

  test('should have correct code', () => {
    const error = new RateLimitError('Rate limit exceeded');
    expect(error.code).toBe('YF_ERR_RATE_LIMIT');
  });

  test('should be instance of YahooFinanceError', () => {
    const error = new RateLimitError('Rate limit exceeded');
    expect(error).toBeInstanceOf(YahooFinanceError);
  });

  test('should be instance of Error', () => {
    const error = new RateLimitError('Rate limit exceeded');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('CircuitBreakerError', () => {
  test('should create circuit breaker error', () => {
    const error = new CircuitBreakerError('Circuit breaker open');
    expect(error.message).toBe('Circuit breaker open');
    expect(error.name).toBe('CircuitBreakerError');
  });

  test('should have correct code', () => {
    const error = new CircuitBreakerError('Circuit breaker open');
    expect(error.code).toBe('YF_ERR_CIRCUIT_BREAKER');
  });

  test('should be instance of YahooFinanceError', () => {
    const error = new CircuitBreakerError('Circuit breaker open');
    expect(error).toBeInstanceOf(YahooFinanceError);
  });

  test('should be instance of Error', () => {
    const error = new CircuitBreakerError('Circuit breaker open');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('ValidationError', () => {
  test('should create validation error', () => {
    const error = new ValidationError('Invalid data');
    expect(error.message).toBe('Invalid data');
    expect(error.name).toBe('ValidationError');
  });

  test('should have correct code', () => {
    const error = new ValidationError('Invalid data');
    expect(error.code).toBe('YF_ERR_VALIDATION');
  });

  test('should be instance of YahooFinanceError', () => {
    const error = new ValidationError('Invalid data');
    expect(error).toBeInstanceOf(YahooFinanceError);
  });

  test('should be instance of Error', () => {
    const error = new ValidationError('Invalid data');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('NotFoundError', () => {
  test('should create not found error', () => {
    const error = new NotFoundError('Symbol not found');
    expect(error.message).toBe('Symbol not found');
    expect(error.name).toBe('NotFoundError');
  });

  test('should have correct code', () => {
    const error = new NotFoundError('Symbol not found');
    expect(error.code).toBe('YF_ERR_NOT_FOUND');
  });

  test('should be instance of YahooFinanceError', () => {
    const error = new NotFoundError('Symbol not found');
    expect(error).toBeInstanceOf(YahooFinanceError);
  });

  test('should be instance of Error', () => {
    const error = new NotFoundError('Symbol not found');
    expect(error).toBeInstanceOf(Error);
  });
});
