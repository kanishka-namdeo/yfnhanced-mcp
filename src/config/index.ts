import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { AppConfig, defaultConfig } from './defaults.js';
import { AppConfigSchema } from './validation.js';

type ConfigSource = 'env' | 'file';

/** Config data before `AppConfigSchema.parse` proves it: sections keyed by unknown values. */
type ConfigObject = Record<string, unknown>;

type YamlModule = {
  load: (source: string) => unknown;
};

function parseEnvVar(key: string, defaultValue: unknown): unknown {
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

function loadFromEnv(): ConfigObject {
  const config: ConfigObject = {};

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
  config.security = {
    enabled: parseEnvVar('SECURITY_ENABLED', defaultConfig.security.enabled),
    enableInputValidation: parseEnvVar('SECURITY_ENABLE_INPUT_VALIDATION', defaultConfig.security.enableInputValidation),
    enableOutputSanitization: parseEnvVar('SECURITY_ENABLE_OUTPUT_SANITIZATION', defaultConfig.security.enableOutputSanitization),
    maxSymbolsPerRequest: parseEnvVar('SECURITY_MAX_SYMBOLS_PER_REQUEST', defaultConfig.security.maxSymbolsPerRequest),
    maxStringLength: parseEnvVar('SECURITY_MAX_STRING_LENGTH', defaultConfig.security.maxStringLength),
    allowedOrigins: parseEnvVar('SECURITY_ALLOWED_ORIGINS', defaultConfig.security.allowedOrigins),
    enableRateLimiting: parseEnvVar('SECURITY_ENABLE_RATE_LIMITING', defaultConfig.security.enableRateLimiting),
    enableRequestLogging: parseEnvVar('SECURITY_ENABLE_REQUEST_LOGGING', defaultConfig.security.enableRequestLogging),
    sanitizeErrors: parseEnvVar('SECURITY_SANITIZE_ERRORS', defaultConfig.security.sanitizeErrors),
    maxRequestsPerIP: parseEnvVar('SECURITY_MAX_REQUESTS_PER_IP', defaultConfig.security.maxRequestsPerIP),
    rateLimitWindowMs: parseEnvVar('SECURITY_RATE_LIMIT_WINDOW_MS', defaultConfig.security.rateLimitWindowMs),
    blockDurationMs: parseEnvVar('SECURITY_BLOCK_DURATION_MS', defaultConfig.security.blockDurationMs),
    enableCSRFProtection: parseEnvVar('SECURITY_ENABLE_CSRF_PROTECTION', defaultConfig.security.enableCSRFProtection),
    enableContentSecurityPolicy: parseEnvVar('SECURITY_ENABLE_CONTENT_SECURITY_POLICY', defaultConfig.security.enableContentSecurityPolicy)
  };

  return config;
}

function isObject(item: unknown): item is ConfigObject {
  return typeof item === 'object' && item !== null && !Array.isArray(item);
}

function isYamlModule(item: unknown): item is YamlModule {
  return typeof item === 'object' && item !== null && 'load' in item && typeof item.load === 'function';
}

function loadYamlModule(): YamlModule {
  // `require` is not available in this ESM build and `js-yaml` is not a dependency, so
  // this throws and `loadFromFile` downgrades it to warn + null. That dead end is the
  // documented behavior of `.yaml`/`.yml` configs; do not add the dependency here.
  const requireModule: (id: string) => unknown = require;
  const candidate = requireModule('js-yaml');

  if (!isYamlModule(candidate)) {
    throw new TypeError('js-yaml does not expose a load(source) function');
  }

  return candidate;
}

function loadFromFile(configPath: string): ConfigObject | null {
  try {
    if (!fs.existsSync(configPath)) {
      return null;
    }

    const ext = path.extname(configPath).toLowerCase();
    const content = fs.readFileSync(configPath, 'utf-8');

    if (ext === '.json') {
      const parsed: unknown = JSON.parse(content);
      return isObject(parsed) ? parsed : null;
    }

    if (ext === '.yaml' || ext === '.yml') {
      const parsed: unknown = loadYamlModule().load(content);
      return isObject(parsed) ? parsed : null;
    }

    return null;
  } catch (error) {
    console.warn(`Failed to load config from ${configPath}:`, error);
    return null;
  }
}

function deepMerge(target: unknown, source: unknown): ConfigObject {
  const output: ConfigObject = isObject(target) ? { ...target } : {};

  if (isObject(target) && isObject(source)) {
    Object.keys(source).forEach((key) => {
      const sourceValue = source[key];

      if (isObject(sourceValue)) {
        if (!(key in target)) {
          output[key] = sourceValue;
        } else {
          output[key] = deepMerge(target[key], sourceValue);
        }
      } else {
        output[key] = sourceValue;
      }
    });
  }

  return output;
}

function resolveConfigPath(explicit: string | undefined, fromEnv: string | undefined): string {
  if (explicit !== undefined && explicit !== '') {
    return explicit;
  }

  if (fromEnv !== undefined && fromEnv !== '') {
    return fromEnv;
  }

  return './config.json';
}

export function loadConfig(options?: {
  configPath?: string;
  sources?: ConfigSource[];
}): AppConfig {
  const sources = options?.sources ?? ['env', 'file'];
  let mergedConfig: ConfigObject = { ...defaultConfig };

  if (sources.includes('file')) {
    const configPath = resolveConfigPath(options?.configPath, process.env.YF_MCP_CONFIG_PATH);
    const fileConfig = loadFromFile(configPath);

    if (fileConfig !== null) {
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
