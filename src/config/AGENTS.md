# src/config

## Purpose

Builds the single `AppConfig` object consumed at startup and validates it before the server is allowed to serve.

## Ownership

- `index.ts` owns precedence and merging, `defaults.ts` owns the default values and the `AppConfig` type, `validation.ts` owns the zod `AppConfigSchema`.
- Which fields then take runtime effect is decided by their consumers (`src/index.ts:103-163`, `src/services/`), not here.

## Local Contracts

- Precedence as coded is `defaults` → `file` → `env` (`index.ts:163-182`), with `sources` defaulting to `['env', 'file']`.
- The config file has no effect on the effective config. `loadFromEnv()` (`:33-112`) assigns every key unconditionally, and `parseEnvVar` returns the default when the variable is unset (`:9-15`); the final `deepMerge` (`:179-182`) therefore overwrites each file value with a default. Only a caller passing `sources: ['file']` gets file values, and nothing in `src/` does.
- Config path resolution: `options.configPath || process.env.YF_MCP_CONFIG_PATH || './config.json'` (`:171`), resolved against the current working directory. A missing file returns `null` and is not an error (`:116-118`).
- Only `.json` is parsed. `.yaml`/`.yml` hits `require('js-yaml')` (`:128`) inside an ESM module for a package that is not a dependency; the throw is caught and downgraded to `console.warn` + `null` (`:133-136`), so a YAML config is silently ignored. `config.yaml.example` documents an unsupported format. Any other extension also returns `null` (`:132`).
- Validation is fatal: `AppConfigSchema.parse` (`:185`) throws after logging `error.issues` (`:187-192`), which aborts startup at `src/index.ts:81`. Unknown keys are stripped rather than rejected, because no schema in `validation.ts` uses `.strict()`.
- Env names are `YF_MCP_` plus the upper-cased key (`:10`). Arrays are comma-split into strings (`:27`), so `YF_MCP_RETRY_STATUS_CODES=429,500` produces strings and fails `z.array(z.number())` (`validation.ts:31`).
- Knobs that reach runtime: `rateLimit.requestsPerMinute`, `cache.ttlQuotes`, `cache.maxCacheSize`, `retry.*`, `circuitBreaker.*`, `queue.*`, `dataCompletion.*`, all of `security`, `serverInfo.name`/`version`, and `yahooFinance.userAgent` (only for the unused alternative endpoint, `src/services/yahoo-finance.ts:1116`).
- Knobs that are read into config but never act: `cache.ttlHistorical`, `ttlFinancials`, `ttlNews`, `ttlAnalysis`, `cacheStrategy`; `rateLimit.requestsPerHour`, `burstLimit`, `maxBackoffSeconds`, `retryCount`, `circuitBreaker*`; `queue.priorityLevels`; `dataCompletion.validateCompleteness`; every `logging.*` and `network.*` field; `serverInfo.protocolVersion`; `capabilities` (hardcoded later at `src/index.ts:199`).
- `defaults.ts:1-144` and `src/types/config.ts:5-233` declare the same names (`RateLimitConfig`, `CacheConfig`, `RetryConfig`, `CircuitBreakerConfig`, `QueueConfig`, `DataCompletionConfig`, `LoggingConfig`, `NetworkConfig`, `YahooFinanceConfig`) with different shapes and field names. `AppConfig` exists only in `defaults.ts:131`. `validation.ts` and the middleware read the `defaults.ts` shape; `src/types/middleware.ts:1-4` re-exports the other. Changing one without the other is the main way to alter a default invisibly.

## Work Guidance

- `index.ts` uses `import * as fs`, `path`, `z` and re-exports widely (`:195-198`), including `export * from './defaults.js'` plus `export type * from './validation.js'`; new exports must not collide with those names.
- Keep `parseEnvVar` type inference in mind: the fallback decides how a value is parsed, so a default of `undefined` disables coercion for that variable.
- Do not fix precedence here as a side effect of a feature; env-always-wins is what every current consumer assumes.

## Verification

- `npx jest tests/unit/config/validation`
- `npx jest tests/unit/config/defaults` (currently cannot pass: it imports `getDefaultConfig` and twelve `get*Defaults` symbols that `defaults.ts` does not export)
- `npm run typecheck`

## Child DOX Index

None. This folder is a leaf.
