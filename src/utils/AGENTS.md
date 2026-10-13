# src/utils

## Purpose

Stateless helpers shared by services, middleware, and tools: input grammar, error classification, data-quality scoring, delay pacing, and formatting.

## Ownership

- This folder owns rules and math with no request state. `src/middleware/security.ts` owns the stateful enforcement of these rules; `src/services/` owns when classification is invoked.
- Nothing here registers, caches across requests, or touches the network.

## Local Contracts

- `security.ts` defines the grammar everything else inherits: `InputValidator` symbol pattern `/^[A-Z0-9.\-\^]+$/`, `MAX_SYMBOL_LENGTH` 20, `MAX_SYMBOLS_PER_REQUEST` 50, `MAX_STRING_LENGTH` 1000, plus `DANGEROUS_PATTERNS` and `SQL_INJECTION_PATTERNS` (`:3-20`, `:62-86`); failures throw `SecurityError`. `DataSanitizer.sanitizeString` strips `<`/`>` and C0/DEL characters (`:181`). Also present: `CacheValidator`, `NetworkSecurityValidator`, `ConfigSecurityValidator`, `RateLimitValidator`.
- The `DANGEROUS_PATTERNS`/`SQL_INJECTION_PATTERNS` regexes carry the `/g` flag and are used with `.test()` (`:13-19`, `:100`). `lastIndex` persists between calls, so a repeated match on the same input can return `false`. Any change here alters what the security middleware accepts.
- `error-classifier.ts` exposes `classifyError` (`:29`), which returns a `YahooFinanceError` or `null` and is matched first-wins in this order: cookie → rate limit → symbol → server → timeout → network → api → unavailable → partial → circuit → stale → null → unknown (`:39-234`). Order is contractual: a new rule must be placed where its precedence effect is intended. `YF_ERR_DATA_INCOMPLETE` is imported (`src/types/errors.ts:8`) but never returned by this classifier, and `YF_ERR_MAX_RETRIES_EXCEEDED` is set only by `middleware/retry.ts:16`.
- `data-completion.ts` exposes `DataQualityReporter` (`:26`) with weighted field scoring — CRITICAL 2, IMPORTANT 1.5, STANDARD 1 (`:20-24`) — and reliability labels at `>= 90` high, `>= 70` medium (`:314-328`). `extractTimestamp` returns `0` when no timestamp is present (`:224`), which makes the `staleData` check at `:117` silently false. There is no `calculateCompleteness` or `calculateFieldQuality` export.
- `request-delayer.ts` (`:55`) defaults to `minDelay` 1000 ms and `maxDelay` 30000 ms; a numeric constructor argument sets `maxDelay = delay * 30` (`:35`); `adaptiveDelay` multiplies by 1.5 below a 0.5 success ratio and by 0.8 above 0.9 (`:127-131`). It holds one `activeDelayPromise`, so it is not reentrant, and no production code imports it — only tests do.
- `formatting.ts` is pure, and `formatDate` (`:17-35`) uses local-time getters, so output depends on the host timezone. Tool output does not use it.

## Work Guidance

- Keep every export side-effect free and stateless; stateful behavior belongs in `src/middleware/`.
- Tools validate through `InputValidator` and again at the MCP boundary; do not weaken a constant here to fix one call site.
- Tests reference helpers that do not exist (`formatLargeNumber`, `formatTime`, `formatPrice`). Confirm an export exists before citing it as available.

## Verification

- `npx jest tests/unit/utils`
- `npm run typecheck`, `npm run lint`
- No dedicated security test layer exists; coverage comes from `tests/unit/middleware/cache.test.ts` and integration tests.

## Child DOX Index

None. This folder is a leaf.
