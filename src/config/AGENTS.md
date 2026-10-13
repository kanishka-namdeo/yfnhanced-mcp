# src/config

## Purpose

Builds the single `AppConfig` object consumed at startup and validates it before the server is allowed to serve.

## Ownership

- `index.ts` owns precedence and merging, `defaults.ts` owns the default values and the `AppConfig` type, `validation.ts` owns the zod `AppConfigSchema`.
- Which fields then take runtime effect is decided by their consumers (`src/index.ts:103-163`, `src/services/`), not here.

## Local Contracts

- Precedence as coded is `defaults` → `file` → `env` (`index.ts:203-222`), with `sources` defaulting to `['env', 'file']` (`:207`).
- The config file has no effect on the effective config. `loadFromEnv()` (`:40-118`) assigns every key unconditionally, and `parseEnvVar` returns the default when the variable is unset (`:16-34`); the final `deepMerge` (`:219-222`) therefore overwrites each file value with a default. Only a caller passing `sources: ['file']` gets file values, and nothing in `src/` does.
- Config path resolution (`:211`) goes through `resolveConfigPath` (`:191-201`): the first of `options.configPath`, `process.env.YF_MCP_CONFIG_PATH` that is set and non-empty, else `'./config.json'`, resolved against the current working directory. Empty strings fall through exactly as the previous `||` chain did. A missing file returns `null` and is not an error (`:144-146`).
- Unvalidated config is typed as `ConfigObject` (`Record<string, unknown>`, `:10`): env values and parsed JSON/JSON-ish file content enter as `unknown`, merge as `unknown`, and only become `AppConfig` at the zod parse. Keep it that way — `any`, assertions and `as` casts in this module are lint errors, and a real fix belongs at these boundaries.
- Only `.json` is parsed. `.yaml`/`.yml` route through `loadYamlModule()` (`:129-141`), which still calls `require('js-yaml')` (`:134`) inside an ESM module for a package that is not a dependency; the throw is caught and downgraded to `console.warn` + `null` (`:164-167`), so a YAML config is silently ignored. `config.yaml.example` documents an unsupported format. A parsed result that is not an object also returns `null` (`:153-160`), as does any other extension (`:163`).
- Validation is fatal: `AppConfigSchema.parse` (`:225`) throws after logging `error.issues` (`:227-231`), which aborts startup at `src/server.ts:85`. Unknown keys are stripped rather than rejected, because no schema in `validation.ts` uses `.strict()`.
- Env names are `YF_MCP_` plus the upper-cased key (`:17`). Arrays are comma-split into strings (`:30`), so `YF_MCP_RETRY_STATUS_CODES=429,500` produces strings and fails `z.array(z.number())` (`validation.ts:31`).
- Knobs that reach runtime: `rateLimit.requestsPerMinute`, `cache.ttlQuotes`, `cache.maxCacheSize`, `retry.*`, `circuitBreaker.*`, `queue.*`, `dataCompletion.*`, all of `security`, and `yahooFinance.userAgent` (only for the unused alternative endpoint, `src/services/yahoo-finance.ts:1116`).
- Knobs that are read into config but never act: `serverInfo.*` (overwritten at `index.ts:99`), `cache.ttlHistorical`, `ttlFinancials`, `ttlNews`, `ttlAnalysis`, `cacheStrategy`; `rateLimit.requestsPerHour`, `burstLimit`, `maxBackoffSeconds`, `retryCount`, `circuitBreaker*`; `queue.priorityLevels`; `dataCompletion.validateCompleteness`; every `logging.*` and `network.*` field; `serverInfo.protocolVersion`; `capabilities` (hardcoded later at `src/server.ts:200`).
- `defaults.ts:6-149` and `src/types/config.ts:5-233` declare the same names (`RateLimitConfig`, `CacheConfig`, `RetryConfig`, `CircuitBreakerConfig`, `QueueConfig`, `DataCompletionConfig`, `LoggingConfig`, `NetworkConfig`, `YahooFinanceConfig`) with different shapes and field names. `AppConfig` exists only in `defaults.ts:136`. `validation.ts` and the middleware read the `defaults.ts` shape; `src/types/middleware.ts:1-4` re-exports the other. Changing one without the other is the main way to alter a default invisibly.
- `defaultServerInfoConfig.version` is `''` on purpose (`defaults.ts:246`). No module in `src/config/` may read `import.meta` (the Jest transform forces CommonJS), so the version is supplied by the entry: `src/index.ts` reads `package.json` and passes `new MCPServer({ serverVersion })`. Do not hardcode a version here and do not move the read into `defaults.ts`. `config/index.ts:99` assigns `config.serverInfo = defaultConfig.serverInfo` unconditionally, so neither `serverInfo.name` nor `serverInfo.version` is settable by env or file — the earlier "reaches runtime via env" claim was wrong.

## Work Guidance

- `index.ts` uses `import * as fs`, `path`, `z` and re-exports widely (`:235-238`), including `export * from './defaults.js'` plus `export type * from './validation.js'`; new exports must not collide with those names.
- `parseEnvVar` (`:16-34`) is typed `unknown` in and out; the runtime type of the fallback still decides how a value is coerced, so a default of `undefined` disables coercion for that variable. Do not restore `any` to get inference back.
- Do not fix precedence here as a side effect of a feature; env-always-wins is what every current consumer assumes.

## Verification

- `npx jest tests/unit/config/validation`
- `npx jest tests/unit/config/defaults`
- `npx eslint src/config` — clean since 2026-10-13 (0 errors, 0 warnings); keep it at zero.
- `npm run typecheck`

## Child DOX Index

None. This folder is a leaf.
