import type { SecurityConfig } from '../types/config.js';
import { InputValidator, CacheValidator, DataSanitizer } from '../utils/security.js';

export class SecurityMiddleware {
  private config: SecurityConfig;
  private requestCounts: Map<string, { count: number; resetTime: number }>;
  private blockedIPs: Set<string>;
  private suspiciousPatterns: Map<string, number>;

  constructor(config: SecurityConfig) {
    this.config = config;
    this.requestCounts = new Map();
    this.blockedIPs = new Set();
    this.suspiciousPatterns = new Map();
  }

  // Promise executor runs the body synchronously and converts validator throws into rejections, matching `async`.
  validateInput(input: unknown, context: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      if (!this.config.enableInputValidation) {
        resolve(true);
        return;
      }

      if (typeof input === 'string') {
        InputValidator.validateString(input, context);
      } else if (Array.isArray(input)) {
        for (const item of input) {
          if (typeof item === 'string') {
            InputValidator.validateString(item, context);
          }
        }
      } else if (typeof input === 'object' && input !== null) {
        for (const [key, value] of Object.entries(input)) {
          if (typeof value === 'string') {
            InputValidator.validateString(value, key);
          }
        }
      }

      resolve(true);
    });
  }

  sanitizeOutput<T>(data: T): Promise<T> {
    return new Promise<T>((resolve) => {
      if (!this.config.enableOutputSanitization) {
        resolve(data);
        return;
      }

      if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        resolve(DataSanitizer.sanitizeQuoteData(data as Record<string, unknown>) as T);
        return;
      }

      resolve(data);
    });
  }

  sanitizeError(error: unknown): string {
    if (this.config.sanitizeErrors) {
      return DataSanitizer.sanitizeErrorMessage(error);
    }
    return error instanceof Error ? error.message : String(error);
  }

  validateCacheKey(key: string): Promise<boolean> {
    try {
      CacheValidator.validateCacheKey(key);
      return Promise.resolve(true);
    } catch {
      return Promise.resolve(false);
    }
  }

  isBlocked(identifier: string): boolean {
    return this.blockedIPs.has(identifier);
  }

  block(identifier: string, duration: number = 3600000): void {
    this.blockedIPs.add(identifier);
    setTimeout(() => {
      this.blockedIPs.delete(identifier);
    }, duration);
  }

  unblock(identifier: string): void {
    this.blockedIPs.delete(identifier);
  }

  // Executor keeps the counter mutation synchronous, as the `async` body was.
  checkRateLimit(identifier: string, maxRequests: number, windowMs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const now = Date.now();
      const record = this.requestCounts.get(identifier);

      if (!record || now > record.resetTime) {
        this.requestCounts.set(identifier, {
          count: 1,
          resetTime: now + windowMs
        });
        resolve(true);
        return;
      }

      if (record.count >= maxRequests) {
        resolve(false);
        return;
      }

      record.count++;
      resolve(true);
    });
  }

  recordSuspiciousActivity(pattern: string): void {
    const current = this.suspiciousPatterns.get(pattern) ?? 0;
    this.suspiciousPatterns.set(pattern, current + 1);

    if (current + 1 >= 5) {
      this.block(`pattern:${pattern}`, 7200000);
    }
  }

  getSecurityMetrics(): {
    blockedIPs: number;
    activeRequestCounters: number;
    suspiciousPatterns: number;
  } {
    return {
      blockedIPs: this.blockedIPs.size,
      activeRequestCounters: this.requestCounts.size,
      suspiciousPatterns: this.suspiciousPatterns.size
    };
  }

  reset(): void {
    this.requestCounts.clear();
    this.blockedIPs.clear();
    this.suspiciousPatterns.clear();
  }

  updateConfig(config: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
