export interface RequestDelayerConfig {
  minDelay: number;
  maxDelay: number;
  adaptive: boolean;
}

export type DelayStrategyType = 'fixed' | 'exponential' | 'linear' | 'adaptive';

export interface DelayStrategyConfig {
  type: DelayStrategyType;
  baseDelay: number;
  multiplier?: number;
  increment?: number;
  maxDelay?: number;
  minDelay?: number;
  jitter?: boolean;
}

export class RequestDelayer {
  private minDelay: number;
  private maxDelay: number;
  private adaptive: boolean;
  private currentDelay: number;
  private delayCount: number;
  private totalDelay: number;
  private activeDelayPromise: Promise<void> | null;
  private cancelDelay: (() => void) | null;
  private isCancelled: boolean;
  private rejectFn: ((error: Error) => void) | null;

  constructor(delay?: number | Partial<RequestDelayerConfig>) {
    if (typeof delay === 'number') {
      this.minDelay = delay;
      this.maxDelay = delay * 30;
      this.currentDelay = delay;
    } else if (delay && typeof delay === 'object') {
      this.minDelay = delay.minDelay ?? 1000;
      this.maxDelay = delay.maxDelay ?? 30000;
      this.currentDelay = delay.minDelay ?? (delay.maxDelay ?? 30000) / 2;
      this.adaptive = delay.adaptive ?? false;
    } else {
      this.minDelay = 1000;
      this.maxDelay = 30000;
      this.currentDelay = 1000;
      this.adaptive = false;
    }
    this.delayCount = 0;
    this.totalDelay = 0;
    this.activeDelayPromise = null;
    this.cancelDelay = null;
    this.isCancelled = false;
    this.rejectFn = null;
  }

  async delay(ms?: number): Promise<void> {
    this.isCancelled = false;
    this.rejectFn = null;
    const delayTime = ms ?? this.currentDelay;
    
    let hasResolved = false;
    let hasRejected = false;
    
    const promise = new Promise<void>((resolve, reject) => {
      this.rejectFn = reject;
      
      let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
      
      const cleanup = () => {
        if (timeoutId !== null) {
          globalThis.clearTimeout(timeoutId);
          timeoutId = null;
        }
        this.cancelDelay = null;
        this.rejectFn = null;
      };
      
      timeoutId = globalThis.setTimeout(() => {
        if (!this.isCancelled && !hasResolved && !hasRejected) {
          cleanup();
          hasResolved = true;
          resolve();
        }
      }, delayTime);
      
      this.cancelDelay = () => {
        if (!this.isCancelled && !hasResolved && !hasRejected) {
          this.isCancelled = true;
          cleanup();
          hasRejected = true;
          setTimeout(() => {
            try {
              reject(new Error('Delay cancelled'));
            } catch (error) {
            }
          }, 0);
        }
      };
    });

    this.activeDelayPromise = promise;
    promise.catch(() => {});
    
    try {
      await promise;
      if (!this.isCancelled) {
        this.delayCount++;
        this.totalDelay += delayTime;
      }
    } catch (error) {
      this.activeDelayPromise = null;
      this.cancelDelay = null;
      this.rejectFn = null;
      throw error;
    }
    
    this.activeDelayPromise = null;
    this.cancelDelay = null;
    this.rejectFn = null;
  }

  async adaptiveDelay(successRate: number): Promise<void> {
    if (!this.adaptive) {
      await this.delay();
      return;
    }

    if (successRate < 0.5) {
      this.currentDelay = Math.min(this.currentDelay * 1.5, this.maxDelay);
    } else if (successRate > 0.9) {
      this.currentDelay = Math.max(this.currentDelay * 0.8, this.minDelay);
    }

    await this.delay();
  }

  cancel(): void {
    if (this.isCancelled) {
      return;
    }
    
    const promise = this.activeDelayPromise;
    const cancelFn = this.cancelDelay;
    const rejectFn = this.rejectFn;
    this.cancelDelay = null;
    this.rejectFn = null;
    
    if (promise && rejectFn) {
      promise.catch(() => {
      });
    }
    
    if (cancelFn) {
      try {
        cancelFn();
      } catch (error) {
      }
    }
  }

  reset(): void {
    this.currentDelay = (this.minDelay + this.maxDelay) / 2;
    this.delayCount = 0;
    this.totalDelay = 0;
    this.activeDelayPromise = null;
    this.cancelDelay = null;
    this.isCancelled = false;
  }

  getDelay(): number {
    return this.currentDelay;
  }

  setDelay(delay: number): void {
    this.currentDelay = Math.max(this.minDelay, Math.min(delay, this.maxDelay));
  }

  getDelayCount(): number {
    return this.delayCount;
  }

  getAverageDelay(): number {
    return this.delayCount > 0 ? this.totalDelay / this.delayCount : 0;
  }

  getStats(): { currentDelay: number; delayCount: number; averageDelay: number } {
    return {
      currentDelay: this.currentDelay,
      delayCount: this.delayCount,
      averageDelay: this.getAverageDelay()
    };
  }
}

export class DelayStrategy {
  private config: DelayStrategyConfig;
  private successCount: number;
  private failureCount: number;

  constructor(config: DelayStrategyConfig) {
    this.config = {
      type: config.type,
      baseDelay: config.baseDelay,
      multiplier: config.multiplier ?? 2,
      increment: config.increment ?? (config.type === 'linear' ? config.multiplier ?? config.baseDelay : config.baseDelay),
      maxDelay: config.maxDelay ?? 30000,
      minDelay: config.minDelay ?? 100,
      jitter: config.jitter ?? false
    };
      this.successCount = 0;
      this.failureCount = 0;
  }

  calculateDelay(attempt: number): number {
    let delay: number;

    switch (this.config.type) {
      case 'fixed':
        delay = this.config.baseDelay;
        break;

      case 'exponential':
        delay = this.config.baseDelay * Math.pow(this.config.multiplier ?? 2, Math.max(0, attempt - 1));
        break;

      case 'linear':
        delay = this.config.baseDelay + (this.config.increment ?? this.config.baseDelay) * Math.max(0, attempt - 1);
        break;

      case 'adaptive':
        const total = this.successCount + this.failureCount;
        if (total === 0) {
          delay = this.config.baseDelay;
        } else {
          const successRate = this.getSuccessRate();
          if (successRate > 0.9) {
            delay = Math.max(this.config.minDelay, this.config.baseDelay * 0.8);
          } else if (successRate < 0.5) {
            delay = Math.min(this.config.maxDelay, this.config.baseDelay * 1.5);
          } else {
            delay = this.config.baseDelay;
          }
        }
        break;

      default:
        delay = this.config.baseDelay;
    }

    delay = Math.max(this.config.minDelay ?? 0, Math.min(delay, this.config.maxDelay ?? Infinity));

    if (this.config.jitter) {
      delay = this.addJitter(delay);
    }

    return delay;
  }

  recordSuccess(): void {
    this.successCount++;
  }

  recordFailure(): void {
    this.failureCount++;
  }

  getSuccessRate(): number {
    const total = this.successCount + this.failureCount;
    return total > 0 ? this.successCount / total : 0;
  }

  reset(): void {
    this.successCount = 0;
    this.failureCount = 0;
  }

  getType(): DelayStrategyType {
    return this.config.type;
  }

  getConfig(): DelayStrategyConfig {
    return { ...this.config };
  }

  async delay(attempt: number = 1): Promise<void> {
    const delayTime = this.calculateDelay(attempt);
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayTime));
  }

  private addJitter(delay: number): number {
    const jitterFactor = 0.1;
    const randomJitter = (Math.random() * 2 - 1) * delay * jitterFactor;
    return Math.max(0, delay + randomJitter);
  }
}

export function createDelayStrategy(
  type: DelayStrategyType,
  baseDelay: number = 1000,
  multiplier?: number,
  maxDelay?: number,
  minDelay?: number,
  jitter?: boolean
): DelayStrategy {
  if (!['fixed', 'exponential', 'linear', 'adaptive'].includes(type)) {
    throw new Error(`Invalid delay strategy type: ${type}`);
  }
  
  return new DelayStrategy({
    type,
    baseDelay,
    multiplier,
    maxDelay,
    minDelay,
    jitter
  });
}
