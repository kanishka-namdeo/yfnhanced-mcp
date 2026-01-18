import { YahooFinanceError } from '../types/errors.js';
import { classifyError } from '../utils/error-classifier.js';
import type { RetryConfig, RetryAttempt, RetryResult } from '../types/middleware.js';

const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];
const RETRYABLE_ERROR_CODES = ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'];
const RETRYABLE_ERROR_MESSAGES = ['timeout', 'network', 'rate limit'];

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

  constructor(config: RetryConfig) {
    this.config = config;
    this.attempt = 0;
    this.lastError = null;
    this.retryHistory = [];
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
      }

      throw error;
    }
  }

  async executeWithRetry<T>(fn: () => Promise<T>, context?: Record<string, unknown>): Promise<T> {
    let lastError: Error | null = null;

    for (this.attempt = 0; this.attempt <= this.config.maxRetries; this.attempt++) {
      try {
        const result = await fn();

        if (this.attempt > 0 && this.config.onRetry) {
          this.config.onRetry(new Error('Retry succeeded'), this.attempt);
        }

        return result;
      } catch (error) {
        const classifiedError = classifyError(error);
        lastError = classifiedError;
        this.lastError = classifiedError;

        const delayMs = this.calculateDelay(this.attempt + 1);
        const retryAttempt: RetryAttempt = {
          attempt: this.attempt + 1,
          delayMs,
          error: classifiedError,
          timestamp: new Date(),
          context
        };
        this.retryHistory.push(retryAttempt);

        if (this.config.onRetry) {
          this.config.onRetry(classifiedError, this.attempt + 1);
        }

        if (!this.shouldRetry(classifiedError, this.attempt + 1)) {
          if (this.config.onGiveUp) {
            this.config.onGiveUp(classifiedError, this.attempt + 1);
          }
          throw classifiedError;
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

    return false;
  }

  calculateDelay(attempt: number): number {
    let delay: number;

    switch (this.config.strategy) {
      case 'exponential':
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

    delay = Math.min(delay, this.config.maxDelayMs);

    if (this.config.jitter) {
      delay = this.addJitter(delay);
    }

    return delay;
  }

  addJitter(delay: number): number {
    const jitterFactor = 0.1;
    const randomJitter = (Math.random() * 2 - 1) * delay * jitterFactor;
    return Math.max(0, delay + randomJitter);
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
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export function createRetryPolicy(config: RetryConfig): RetryPolicy {
  return new RetryPolicy(config);
}

export async function retry<T>(
  fn: () => Promise<T>,
  config: RetryConfig,
  context?: Record<string, unknown>
): Promise<T> {
  const policy = new RetryPolicy(config);
  return policy.execute(fn, context);
}
