import { YahooFinanceError, YF_ERR_CIRCUIT_OPEN } from '../types/errors.js';
import type { CircuitBreakerConfig } from '../types/config.js';

type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface FailureRecord {
  timestamp: number;
}

export class CircuitBreakerOpenError extends YahooFinanceError {
  constructor(message: string = 'Circuit breaker is open') {
    super(
      message,
      YF_ERR_CIRCUIT_OPEN,
      null,
      false,
      false,
      {},
      'Wait for circuit breaker to reset before retrying'
    );
    this.name = 'CircuitBreakerOpenError';
    Object.setPrototypeOf(this, CircuitBreakerOpenError.prototype);
  }
}

interface CircuitBreakerConfigInternal {
  failureThreshold: number;
  successThreshold: number;
  timeoutMs: number;
  monitoringWindowMs: number;
  fallback?: (error: Error) => unknown;
  onOpen?: () => void;
  onHalfOpen?: () => void;
  onClose?: () => void;
}

export class CircuitBreaker {
  private state: CircuitBreakerState;
  private failureCount: number;
  private successCount: number;
  private lastFailureTime: number;
  private lastStateChange: number;
  private config: CircuitBreakerConfigInternal;
  private failureWindow: FailureRecord[];

  constructor(config: CircuitBreakerConfig = {} as CircuitBreakerConfig) {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.lastStateChange = Date.now();
    this.failureWindow = [];
    this.config = {
      failureThreshold: config.errorThresholdPercentage || 5,
      successThreshold: config.halfOpenMaxAttempts || 3,
      timeoutMs: config.resetTimeoutMs || 60000,
      monitoringWindowMs: config.rollingCountTimeoutMs || 60000,
      fallback: config.fallback,
      onOpen: config.onOpen,
      onHalfOpen: config.onHalfOpen,
      onClose: config.onClose
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastStateChange >= this.config.timeoutMs) {
        this.transitionTo('HALF_OPEN');
      } else {
        throw new CircuitBreakerOpenError();
      }
    }

    this.cleanupFailureWindow();

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      if (this.config.fallback && (error instanceof Error || error instanceof YahooFinanceError)) {
        const fallbackResult = this.config.fallback(error);
        return fallbackResult as Promise<T>;
      }
      throw error;
    }
  }

  getState(): CircuitBreakerState {
    if (this.state === 'OPEN' && Date.now() - this.lastStateChange >= this.config.timeoutMs) {
      this.transitionTo('HALF_OPEN');
    }
    return this.state;
  }

  isOpen(): boolean {
    return this.getState() === 'OPEN';
  }

  recordSuccess(): void {
    this.cleanupFailureWindow();
    this.successCount++;

    if (this.state === 'HALF_OPEN') {
      if (this.successCount >= this.config.successThreshold) {
        this.transitionTo('CLOSED');
      }
    }
  }

  recordFailure(): void {
    this.cleanupFailureWindow();
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.failureWindow.push({ timestamp: this.lastFailureTime });

    if (this.state === 'HALF_OPEN') {
      this.transitionTo('OPEN');
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = 0;
    this.lastStateChange = Date.now();
    this.failureWindow = [];
  }

  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    if (newState === 'OPEN') {
      this.successCount = 0;
      this.config.onOpen?.();
    } else if (newState === 'HALF_OPEN') {
      this.failureCount = 0;
      this.config.onHalfOpen?.();
    } else if (newState === 'CLOSED') {
      this.failureCount = 0;
      this.successCount = 0;
      this.failureWindow = [];
      this.config.onClose?.();
    }
  }

  private cleanupFailureWindow(): void {
    const now = Date.now();
    const windowStart = now - this.config.monitoringWindowMs;
    this.failureWindow = this.failureWindow.filter(record => record.timestamp > windowStart);
    this.failureCount = this.failureWindow.length;
  }

  getConfig(): CircuitBreakerConfigInternal {
    return { ...this.config };
  }

  updateConfig(config: Partial<CircuitBreakerConfigInternal>): void {
    this.config = { ...this.config, ...config };
  }

  getMetrics(): {
    failureCount: number;
    successCount: number;
  } {
    return {
      failureCount: this.failureCount,
      successCount: this.successCount
    };
  }
}
