import { YahooFinanceError, YF_ERR_COOKIE_ERROR, YF_ERR_PARTIAL_DATA } from '../types/errors.js';
import { classifyError } from '../utils/error-classifier.js';
import type { RetryConfig, RetryAttempt, RetryResult } from '../types/middleware.js';

const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];
const RETRYABLE_ERROR_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
const RETRYABLE_ERROR_MESSAGES = ['timeout', 'network', 'rate limit', 'cookie', 'session'];

export class MaxRetriesExceededError extends YahooFinanceError {
  attempts: number;
  retryHistory: RetryAttempt[];

  constructor(message: string, attempts: number, retryHistory: RetryAttempt[]) {
    super(
      message,
      'YF_ERR_MAX_RETRIES_EXCEEDED',
      null,
      false,
      false,
      { attempts, retryHistory },
      'Review retry history and adjust retry configuration'
    );
    this.name = 'MaxRetriesExceededError';
    this.attempts = attempts;
    this.retryHistory = retryHistory;
    Object.setPrototypeOf(this, MaxRetriesExceededError.prototype);
  }
}

export class RetryPolicy {
  config: RetryConfig;
  attempt: number;
  lastError: Error | null;
  retryHistory: RetryAttempt[];
  private delayFn?: (ms: number) => Promise<void>;

  constructor(config: RetryConfig, delayFn?: (ms: number) => Promise<void>) {
    this.config = config;
    this.attempt = 0;
    this.lastError = null;
    this.retryHistory = [];
    this.delayFn = delayFn;
  }

  async execute<T>(fn: () => Promise<T>, context?: Record<string, unknown>): Promise<T> {
    this.reset();
    const startTime = Date.now();

    try {
      return await this.executeWithRetry(fn, context);
    } catch (error) {
      const totalDurationMs = Date.now() - startTime;
      const result: RetryResult<T> = {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        attempts: this.attempt,
        totalDurationMs,
        attemptsHistory: this.retryHistory
      };

      if (this.attempt > this.config.maxRetries) {
        throw new MaxRetriesExceededError(
          `Max retries (${this.config.maxRetries}) exceeded after ${this.attempt} attempts`,
          this.attempt,
          this.retryHistory
        );
      } else {
        throw error;
      }
    }
  }

  async executeWithRetry<T>(fn: () => Promise<T>, context?: Record<string, unknown>): Promise<T> {
    let lastError: Error | null = null;

    for (this.attempt = 0; this.attempt <= this.config.maxRetries + 1; this.attempt++) {
      try {
        const result = await fn();

        return result;
      } catch (error) {
        const classifiedError = classifyError(error);
        lastError = classifiedError;
        this.lastError = classifiedError;

        if (this.attempt > this.config.maxRetries) {
          throw new MaxRetriesExceededError(
            `Max retries (${this.config.maxRetries}) exceeded after ${this.attempt} attempts`,
            this.attempt,
            this.retryHistory
          );
        }

        if (!this.shouldRetry(classifiedError, this.attempt + 1)) {
          if (this.config.onGiveUp) {
            this.config.onGiveUp(classifiedError, this.attempt + 1);
          }
          throw classifiedError;
        }

        // Use smart delay calculation based on error type
        const delayMs = this.calculateDelayForError(classifiedError, this.attempt + 1);
        const retryAttempt: RetryAttempt = {
          attempt: this.attempt + 1,
          delayMs,
          error: classifiedError,
          timestamp: new Date(),
          context,
          errorType: classifiedError.code,
          isRetryable: classifiedError.isRetryable
        };
        this.retryHistory.push(retryAttempt);

        if (this.config.onRetry) {
          this.config.onRetry(classifiedError, this.attempt + 1);
        }

        await this.delay(delayMs);
      }
    }

    if (lastError && this.config.onGiveUp) {
      this.config.onGiveUp(lastError, this.attempt);
    }

    throw lastError || new Error('Retry failed without error');
  }

  shouldRetry(error: unknown, attempt: number): boolean {
    if (attempt > this.config.maxRetries) {
      return false;
    }

    const classifiedError = error instanceof YahooFinanceError ? error : classifyError(error);

    if (this.config.skipRetry?.(classifiedError)) {
      return false;
    }

    if (!classifiedError.isRetryable) {
      return false;
    }

    if (classifiedError.statusCode && this.config.retryableStatusCodes.includes(classifiedError.statusCode)) {
      return true;
    }

    const errorCode = (error as any)?.code;
    if (errorCode && RETRYABLE_ERROR_CODES.includes(errorCode)) {
      return true;
    }

    const errorMessage = classifiedError.message.toLowerCase();
    if (RETRYABLE_ERROR_MESSAGES.some((msg) => errorMessage.includes(msg))) {
      return true;
    }

    // Default to true for retryable errors
    return true;
  }

  calculateDelay(attempt: number): number {
    let delay: number;

    switch (this.config.strategy) {
      case 'exponential':
        // Enhanced exponential backoff with full jitter
        delay = this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, attempt - 1);
        break;
      case 'linear':
        delay = this.config.initialDelayMs * attempt;
        break;
      case 'fixed':
        delay = this.config.retryDelayMs || this.config.initialDelayMs;
        break;
      default:
        delay = this.config.initialDelayMs;
    }

    // Cap at max delay
    delay = Math.min(delay, this.config.maxDelayMs);

    // Apply jitter if configured
    if (this.config.jitter) {
      delay = this.addJitter(delay);
    }

    return delay;
  }

  /**
   * Adds jitter to delay using "decorrelated jitter" algorithm
   * which provides better distribution than simple random jitter
   */
  addJitter(delay: number): number {
    const jitterFactor = 0.25; // 25% jitter
    const randomJitter = (Math.random() * 2 - 1) * delay * jitterFactor;
    const jitteredDelay = delay + randomJitter;

    // Ensure delay is non-negative and has a minimum of 100ms
    return Math.max(100, jitteredDelay);
  }

  /**
   * Calculates delay based on error type for smarter retry strategies
   */
  calculateDelayForError(error: YahooFinanceError, attempt: number): number {
    const baseDelay = this.calculateDelay(attempt);

    // Rate limit errors: use longer delays with more aggressive backoff
    if (error.isRateLimit) {
      const retryAfter = error.context?.retryAfter as number;
      if (retryAfter && typeof retryAfter === 'number') {
        // Use retry-after header if available
        return Math.max(baseDelay, retryAfter * 1000);
      }
      // Otherwise use more aggressive backoff for rate limits
      return Math.min(baseDelay * 2, this.config.maxDelayMs);
    }

    // Cookie/session errors: shorter delays with quick retries
    if (error.code === YF_ERR_COOKIE_ERROR) {
      return Math.min(baseDelay * 0.5, this.config.maxDelayMs);
    }

    // Transient server errors (502, 503, 504): moderate backoff
    if (error.statusCode && [502, 503, 504].includes(error.statusCode)) {
      return Math.min(baseDelay * 1.5, this.config.maxDelayMs);
    }

    // Default: use standard delay
    return baseDelay;
  }

  reset(): void {
    this.attempt = 0;
    this.lastError = null;
    this.retryHistory = [];
  }

  getConfig(): RetryConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<RetryConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private delay(ms: number): Promise<void> {
    return this.delayFn ? this.delayFn(ms) : new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export function createRetryPolicy(config: RetryConfig, delayFn?: (ms: number) => Promise<void>): RetryPolicy {
  return new RetryPolicy(config, delayFn);
}

export async function retry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  context?: Record<string, unknown>,
  delayFn?: (ms: number) => Promise<void>
): Promise<T> {
  const policy = new RetryPolicy(config, delayFn);
  return policy.execute(fn, context);
}
