export interface RequestDelayerConfig {
  minDelay: number;
  maxDelay: number;
  adaptive: boolean;
}

export class RequestDelayer {
  private minDelay: number;
  private maxDelay: number;
  private adaptive: boolean;
  private currentDelay: number;

  constructor(config: RequestDelayerConfig) {
    this.minDelay = config.minDelay;
    this.maxDelay = config.maxDelay;
    this.adaptive = config.adaptive;
    this.currentDelay = (this.minDelay + this.maxDelay) / 2;
  }

  async delay(ms?: number): Promise<void> {
    const delayTime = ms ?? this.currentDelay;
    await new Promise<void>(resolve => globalThis.setTimeout(resolve, delayTime));
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

  reset(): void {
    this.currentDelay = (this.minDelay + this.maxDelay) / 2;
  }
}
