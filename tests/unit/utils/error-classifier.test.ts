import { classifyError, ErrorClassification, ErrorCategory, ErrorSeverity } from '../../../src/utils/error-classifier';

describe('classifyError', () => {
  test('should classify ECONNRESET as transient error', () => {
    const error = { code: 'ECONNRESET' };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.TRANSIENT);
    expect(result.severity).toBe(ErrorSeverity.HIGH);
  });

  test('should classify ETIMEDOUT as transient error', () => {
    const error = { code: 'ETIMEDOUT' };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.TRANSIENT);
    expect(result.severity).toBe(ErrorSeverity.HIGH);
  });

  test('should classify ECONNREFUSED as transient error', () => {
    const error = { code: 'ECONNREFUSED' };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.TRANSIENT);
    expect(result.severity).toBe(ErrorSeverity.HIGH);
  });

  test('should classify ENOTFOUND as transient error', () => {
    const error = { code: 'ENOTFOUND' };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.TRANSIENT);
    expect(result.severity).toBe(ErrorSeverity.HIGH);
  });

  test('should classify EAI_AGAIN as transient error', () => {
    const error = { code: 'EAI_AGAIN' };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.TRANSIENT);
    expect(result.severity).toBe(ErrorSeverity.HIGH);
  });

  test('should classify 429 as rate limit error', () => {
    const error = { statusCode: 429 };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.RATE_LIMIT);
    expect(result.severity).toBe(ErrorSeverity.HIGH);
  });

  test('should classify 500 as service unavailable', () => {
    const error = { statusCode: 500 };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.SERVICE_UNAVAILABLE);
    expect(result.severity).toBe(ErrorSeverity.HIGH);
  });

  test('should classify 502 as service unavailable', () => {
    const error = { statusCode: 502 };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.SERVICE_UNAVAILABLE);
    expect(result.severity).toBe(ErrorSeverity.HIGH);
  });

  test('should classify 503 as service unavailable', () => {
    const error = { statusCode: 503 };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.SERVICE_UNAVAILABLE);
    expect(result.severity).toBe(ErrorSeverity.HIGH);
  });

  test('should classify 504 as service unavailable', () => {
    const error = { statusCode: 504 };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.SERVICE_UNAVAILABLE);
    expect(result.severity).toBe(ErrorSeverity.HIGH);
  });

  test('should classify 400 as client error', () => {
    const error = { statusCode: 400 };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.CLIENT_ERROR);
    expect(result.severity).toBe(ErrorSeverity.LOW);
  });

  test('should classify 401 as authentication error', () => {
    const error = { statusCode: 401 };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.AUTHENTICATION);
    expect(result.severity).toBe(ErrorSeverity.HIGH);
  });

  test('should classify 403 as authorization error', () => {
    const error = { statusCode: 403 };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.AUTHORIZATION);
    expect(result.severity).toBe(ErrorSeverity.HIGH);
  });

  test('should classify 404 as not found', () => {
    const error = { statusCode: 404 };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.NOT_FOUND);
    expect(result.severity).toBe(ErrorSeverity.LOW);
  });

  test('should classify symbol not found as not found', () => {
    const error = new Error('symbol not found');
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.NOT_FOUND);
    expect(result.severity).toBe(ErrorSeverity.LOW);
  });

  test('should classify invalid symbol as validation error', () => {
    const error = new Error('invalid symbol');
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.VALIDATION);
    expect(result.severity).toBe(ErrorSeverity.LOW);
  });

  test('should classify invalid parameter as validation error', () => {
    const error = new Error('invalid parameter');
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.VALIDATION);
    expect(result.severity).toBe(ErrorSeverity.LOW);
  });

  test('should classify no data as not found', () => {
    const error = new Error('no data');
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.NOT_FOUND);
    expect(result.severity).toBe(ErrorSeverity.LOW);
  });

  test('should classify unknown error as unknown category', () => {
    const error = new Error('unknown error');
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.UNKNOWN);
    expect(result.severity).toBe(ErrorSeverity.MEDIUM);
  });

  test('should handle error with both code and statusCode', () => {
    const error = { code: 'ECONNRESET', statusCode: 500 };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.TRANSIENT);
    expect(result.severity).toBe(ErrorSeverity.HIGH);
  });

  test('should handle null error', () => {
    const result = classifyError(null);
    expect(result.category).toBe(ErrorCategory.UNKNOWN);
    expect(result.severity).toBe(ErrorSeverity.MEDIUM);
  });

  test('should handle undefined error', () => {
    const result = classifyError(undefined);
    expect(result.category).toBe(ErrorCategory.UNKNOWN);
    expect(result.severity).toBe(ErrorSeverity.MEDIUM);
  });

  test('should return error classification object', () => {
    const error = new Error('test error');
    const result = classifyError(error);

    expect(result).toHaveProperty('category');
    expect(result).toHaveProperty('severity');
    expect(result).toHaveProperty('retryable');
    expect(result).toHaveProperty('fallbackAllowed');
  });

  test('should mark transient errors as retryable', () => {
    const error = { code: 'ECONNRESET' };
    const result = classifyError(error);
    expect(result.retryable).toBe(true);
  });

  test('should mark rate limit errors as retryable', () => {
    const error = { statusCode: 429 };
    const result = classifyError(error);
    expect(result.retryable).toBe(true);
  });

  test('should mark service unavailable errors as retryable', () => {
    const error = { statusCode: 503 };
    const result = classifyError(error);
    expect(result.retryable).toBe(true);
  });

  test('should mark client errors as not retryable', () => {
    const error = { statusCode: 400 };
    const result = classifyError(error);
    expect(result.retryable).toBe(false);
  });

  test('should mark not found errors as not retryable', () => {
    const error = { statusCode: 404 };
    const result = classifyError(error);
    expect(result.retryable).toBe(false);
  });

  test('should mark transient errors as fallback allowed', () => {
    const error = { code: 'ECONNRESET' };
    const result = classifyError(error);
    expect(result.fallbackAllowed).toBe(true);
  });

  test('should mark rate limit errors as fallback allowed', () => {
    const error = { statusCode: 429 };
    const result = classifyError(error);
    expect(result.fallbackAllowed).toBe(true);
  });

  test('should mark client errors as not fallback allowed', () => {
    const error = { statusCode: 400 };
    const result = classifyError(error);
    expect(result.fallbackAllowed).toBe(false);
  });

  test('should classify authentication errors correctly', () => {
    const error = { statusCode: 401 };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.AUTHENTICATION);
    expect(result.retryable).toBe(false);
    expect(result.fallbackAllowed).toBe(false);
  });

  test('should classify authorization errors correctly', () => {
    const error = { statusCode: 403 };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.AUTHORIZATION);
    expect(result.retryable).toBe(false);
    expect(result.fallbackAllowed).toBe(false);
  });

  test('should handle error with message containing symbol not found', () => {
    const error = { message: 'Error: symbol AAPL not found' };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.NOT_FOUND);
  });

  test('should handle error with message containing invalid symbol', () => {
    const error = { message: 'Error: invalid symbol format' };
    const result = classifyError(error);
    expect(result.category).toBe(ErrorCategory.VALIDATION);
  });
});

describe('ErrorCategory', () => {
  test('should have transient category', () => {
    expect(ErrorCategory.TRANSIENT).toBe('transient');
  });

  test('should have rate limit category', () => {
    expect(ErrorCategory.RATE_LIMIT).toBe('rate-limit');
  });

  test('should have service unavailable category', () => {
    expect(ErrorCategory.SERVICE_UNAVAILABLE).toBe('service-unavailable');
  });

  test('should have client error category', () => {
    expect(ErrorCategory.CLIENT_ERROR).toBe('client-error');
  });

  test('should have authentication category', () => {
    expect(ErrorCategory.AUTHENTICATION).toBe('authentication');
  });

  test('should have authorization category', () => {
    expect(ErrorCategory.AUTHORIZATION).toBe('authorization');
  });

  test('should have not found category', () => {
    expect(ErrorCategory.NOT_FOUND).toBe('not-found');
  });

  test('should have validation category', () => {
    expect(ErrorCategory.VALIDATION).toBe('validation');
  });

  test('should have unknown category', () => {
    expect(ErrorCategory.UNKNOWN).toBe('unknown');
  });
});

describe('ErrorSeverity', () => {
  test('should have low severity', () => {
    expect(ErrorSeverity.LOW).toBe('low');
  });

  test('should have medium severity', () => {
    expect(ErrorSeverity.MEDIUM).toBe('medium');
  });

  test('should have high severity', () => {
    expect(ErrorSeverity.HIGH).toBe('high');
  });
});

describe('ErrorClassification', () => {
  test('should create valid classification object', () => {
    const classification: ErrorClassification = {
      category: ErrorCategory.TRANSIENT,
      severity: ErrorSeverity.HIGH,
      retryable: true,
      fallbackAllowed: true
    };

    expect(classification.category).toBe(ErrorCategory.TRANSIENT);
    expect(classification.severity).toBe(ErrorSeverity.HIGH);
    expect(classification.retryable).toBe(true);
    expect(classification.fallbackAllowed).toBe(true);
  });

  test('should validate classification structure', () => {
    const classification = {
      category: 'transient',
      severity: 'high',
      retryable: true,
      fallbackAllowed: true
    };

    expect(classification).toHaveProperty('category');
    expect(classification).toHaveProperty('severity');
    expect(classification).toHaveProperty('retryable');
    expect(classification).toHaveProperty('fallbackAllowed');
  });
});
