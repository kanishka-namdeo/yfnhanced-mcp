import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { AppConfig, defaultConfig } from './defaults.js';
import { AppConfigSchema } from './validation.js';

type ConfigSource = 'env' | 'file';

function parseEnvVar(key: string, defaultValue: any): any {
  const envKey = `YF_MCP_${key.toUpperCase()}`;
  const value = process.env[envKey];

  if (value === undefined) {
    return defaultValue;
  }

  if (typeof defaultValue === 'number') {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  if (typeof defaultValue === 'boolean') {
    return value.toLowerCase() === 'true';
  }

  if (Array.isArray(defaultValue)) {
    return value.split(',').map((item: string) => item.trim());
  }

  return value;
}

function loadFromEnv(): Partial<AppConfig> {
  const config: any = {};

  config.rateLimit = {
    requestsPerMinute: parseEnvVar('RATE_LIMIT_REQUESTS_PER_MINUTE', defaultConfig.rateLimit.requestsPerMinute),
    requestsPerHour: parseEnvVar('RATE_LIMIT_REQUESTS_PER_HOUR', defaultConfig.rateLimit.requestsPerHour),
    burstLimit: parseEnvVar('RATE_LIMIT_BURST_LIMIT', defaultConfig.rateLimit.burstLimit),
    backoffMultiplier: parseEnvVar('RATE_LIMIT_BACKOFF_MULTIPLIER', defaultConfig.rateLimit.backoffMultiplier),
    maxBackoffSeconds: parseEnvVar('RATE_LIMIT_MAX_BACKOFF_SECONDS', defaultConfig.rateLimit.maxBackoffSeconds),
    retryCount: parseEnvVar('RATE_LIMIT_RETRY_COUNT', defaultConfig.rateLimit.retryCount),
    circuitBreakerThreshold: parseEnvVar('RATE_LIMIT_CIRCUIT_BREAKER_THRESHOLD', defaultConfig.rateLimit.circuitBreakerThreshold),
    circuitBreakerResetMs: parseEnvVar('RATE_LIMIT_CIRCUIT_BREAKER_RESET_MS', defaultConfig.rateLimit.circuitBreakerResetMs)
  };

  config.cache = {
    ttlQuotes: parseEnvVar('CACHE_TTL_QUOTES', defaultConfig.cache.ttlQuotes),
    ttlHistorical: parseEnvVar('CACHE_TTL_HISTORICAL', defaultConfig.cache.ttlHistorical),
    ttlFinancials: parseEnvVar('CACHE_TTL_FINANCIALS', defaultConfig.cache.ttlFinancials),
    ttlNews: parseEnvVar('CACHE_TTL_NEWS', defaultConfig.cache.ttlNews),
    ttlAnalysis: parseEnvVar('CACHE_TTL_ANALYSIS', defaultConfig.cache.ttlAnalysis),
    maxCacheSize: parseEnvVar('CACHE_MAX_SIZE', defaultConfig.cache.maxCacheSize),
    cacheStrategy: parseEnvVar('CACHE_STRATEGY', defaultConfig.cache.cacheStrategy)
  };

  config.retry = {
    maxRetries: parseEnvVar('RETRY_MAX_RETRIES', defaultConfig.retry.maxRetries),
    baseDelay: parseEnvVar('RETRY_BASE_DELAY', defaultConfig.retry.baseDelay),
    maxDelay: parseEnvVar('RETRY_MAX_DELAY', defaultConfig.retry.maxDelay),
    jitter: parseEnvVar('RETRY_JITTER', defaultConfig.retry.jitter),
    jitterFactor: parseEnvVar('RETRY_JITTER_FACTOR', defaultConfig.retry.jitterFactor),
    retryableStatusCodes: parseEnvVar('RETRY_STATUS_CODES', defaultConfig.retry.retryableStatusCodes),
    retryableErrors: parseEnvVar('RETRY_ERRORS', defaultConfig.retry.retryableErrors)
  };

  config.circuitBreaker = {
    failureThreshold: parseEnvVar('CIRCUIT_BREAKER_FAILURE_THRESHOLD', defaultConfig.circuitBreaker.failureThreshold),
    successThreshold: parseEnvVar('CIRCUIT_BREAKER_SUCCESS_THRESHOLD', defaultConfig.circuitBreaker.successThreshold),
    timeout: parseEnvVar('CIRCUIT_BREAKER_TIMEOUT', defaultConfig.circuitBreaker.timeout),
    monitoringWindow: parseEnvVar('CIRCUIT_BREAKER_MONITORING_WINDOW', defaultConfig.circuitBreaker.monitoringWindow)
  };

  config.queue = {
    maxConcurrent: parseEnvVar('QUEUE_MAX_CONCURRENT', defaultConfig.queue.maxConcurrent),
    maxQueueSize: parseEnvVar('QUEUE_MAX_SIZE', defaultConfig.queue.maxQueueSize),
    priorityLevels: parseEnvVar('QUEUE_PRIORITY_LEVELS', defaultConfig.queue.priorityLevels),
    queueTimeout: parseEnvVar('QUEUE_TIMEOUT', defaultConfig.queue.queueTimeout),
    batchWindow: parseEnvVar('QUEUE_BATCH_WINDOW', defaultConfig.queue.batchWindow)
  };

  config.dataCompletion = {
    enableFallback: parseEnvVar('DATA_COMPLETION_ENABLE_FALLBACK', defaultConfig.dataCompletion.enableFallback),
    fallbackPriority: parseEnvVar('DATA_COMPLETION_FALLBACK_PRIORITY', defaultConfig.dataCompletion.fallbackPriority),
    fillMissingFields: parseEnvVar('DATA_COMPLETION_FILL_MISSING_FIELDS', defaultConfig.dataCompletion.fillMissingFields),
    validateCompleteness: parseEnvVar('DATA_COMPLETION_VALIDATE_COMPLETENESS', defaultConfig.dataCompletion.validateCompleteness)
  };

  config.logging = defaultConfig.logging;
  config.network = defaultConfig.network;
  config.yahooFinance = defaultConfig.yahooFinance;
  config.serverInfo = defaultConfig.serverInfo;
  config.capabilities = defaultConfig.capabilities;

  return config;
}

function loadFromFile(configPath: string): Partial<AppConfig> | null {
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const ext = path.extname(configPath).toLowerCase();
    const content = fs.readFileSync(configPath, 'utf-8');

    if (ext === '.json') {
      return JSON.parse(content);
    }

    if (ext === '.yaml' || ext === '.yml') {
      const yaml = require('js-yaml');
      return yaml.load(content);
    }

    return null;
  } catch (error) {
    console.warn(`Failed to load config from ${configPath}:`, error);
    return null;
  }
}

function deepMerge(target: any, source: any): any {
  const output = { ...target };

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      if (isObject(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = deepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }

  return output;
}

function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}

export function loadConfig(options?: {
  configPath?: string;
  sources?: ConfigSource[];
}): AppConfig {
  const sources = options?.sources || ['env', 'file'];
  let mergedConfig: any = { ...defaultConfig };

  if (sources.includes('file')) {
    const configPath = options?.configPath || process.env.YF_MCP_CONFIG_PATH || './config.json';
    const fileConfig = loadFromFile(configPath);

    if (fileConfig) {
      mergedConfig = deepMerge(mergedConfig, fileConfig);
    }
  }

  if (sources.includes('env')) {
    const envConfig = loadFromEnv();
    mergedConfig = deepMerge(mergedConfig, envConfig);
  }

  try {
    const validatedConfig = AppConfigSchema.parse(mergedConfig);
    return validatedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Configuration validation failed:', error.issues);
    }
    throw error;
  }
}

export type { AppConfig };
export { defaultConfig };
export * from './defaults.js';
export type * from './validation.js';
