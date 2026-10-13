# src/types

## Purpose

Type-only declarations: config shapes, middleware interfaces, MCP wire shapes, Yahoo Finance payloads, and the error hierarchy.

## Ownership

- This folder owns compile-time contracts. Runtime behavior lives in `src/middleware/`, `src/services/`, `src/tools/`.
- `errors.ts` is the exception: it holds the one runtime class (`YahooFinanceError`) and the error-code constants that every other folder quotes.

## Local Contracts

- Fourteen error codes are exported as string constants (`errors.ts:1-14`): `YF_ERR_RATE_LIMIT`, `YF_ERR_API_CHANGED`, `YF_ERR_DATA_UNAVAILABLE`, `YF_ERR_SYMBOL_NOT_FOUND`, `YF_ERR_NETWORK`, `YF_ERR_TIMEOUT`, `YF_ERR_SERVER`, `YF_ERR_DATA_INCOMPLETE`, `YF_ERR_CIRCUIT_OPEN`, `YF_ERR_CACHE_STALE`, `YF_ERR_UNKNOWN`, `YF_ERR_MAX_RETRIES_EXCEEDED`, `YF_ERR_COOKIE_ERROR`, `YF_ERR_PARTIAL_DATA`. `ErrorCodeType` (`:16-30`) is the union of those literals, so a new code must be added to both the const and the union.
- `YahooFinanceError` (`:46-106`) takes nine positional arguments: `message`, `code`, `statusCode`, `isRetryable`, `isRateLimit`, `context = {}`, `suggestedAction`, `warnings?`, `partialData?`. `suggestedAction` is required but follows a defaulted parameter, so callers must pass the first seven positions explicitly. The constructor sets `name`, `timestamp`, and calls `Object.setPrototypeOf` (`:79`); keep that call when subclassing, or `instanceof` breaks under the transpiled target.
- `toJSON()` (`:82-96`) is what a client may see after `sanitizeError`: it exposes `code`, `statusCode`, `isRetryable`, `isRateLimit`, `context`, ISO `timestamp`, `suggestedAction`, `warnings`, and a boolean `hasPartialData` rather than the data itself.
- `PartialDataResult<T>` (`:39-44`) always sets `isPartial` and `hasData` from `partialData !== undefined` (`:98-105`); a present-but-empty payload reports partial success.
- `DataWarning` (`:32-37`) has `severity: 'warning' | 'info'` only — there is no error severity, so a blocking condition cannot be expressed as a warning.
- `types/middleware.ts` (326 lines) and `types/mcp.ts` (171 lines) declare `*Interface` shapes with no implementation behind them, and lean on `unknown` plus `[key: string]: unknown` (`mcp.ts:1`, `:7`). `MiddlewareChain`, `MiddlewareFunction`, `use()` (`middleware.ts:236-246`) are never implemented. Do not assume an interface here is honored by the class of the same name; several members (`isClosed`, `isHalfOpen`, `forceOpen`, `forceClose` in `CircuitBreakerInterface`) do not exist.
- `types/config.ts:5-233` duplicates nine config type names from `src/config/defaults.ts` with different field names and shapes; `AppConfig` exists only in `defaults.ts:131`. `types/middleware.ts:1-4` re-exports the `types/config.js` versions, so which `CacheConfig` a file sees depends on its import path.
- MCP envelope types mirror the SDK's wire names, i.e. snake_case `jsonrpc` and `params` (`mcp.ts:108-130`), while config and payload types are camelCase. Keep each side's case convention.
- No barrel file: there is no `types/index.ts`, and each consumer imports the specific module.

## Work Guidance

- Add no runtime code here beyond `errors.ts`; behavior belongs in the implementing folder.
- MCP wire changes must not rename snake_case fields for tidiness — they are protocol-visible.
- When a field is genuinely unknown, prefer a named `unknown` over `any`: `no-explicit-any` is an error for `src/**/*.ts`.

## Verification

- `npm run typecheck` covers these files (they are inside `src/**/*`)
- `npx jest tests/unit/types/errors` (currently imports `ConfigError`, `NetworkError`, `CircuitBreakerError`, `ValidationError`, `NotFoundError`, none of which this folder exports)

## Child DOX Index

None. This folder is a leaf.
