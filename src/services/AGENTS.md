# src/services

## Purpose

The only place this server talks to Yahoo Finance. Wraps every call in resilience, degrades gracefully, and reports data quality.

## Ownership

- `yahoo-finance.ts` owns the `YahooFinanceClient`: client construction/lifecycle, the middleware composition order, cache write policy, fallback and partial-data recovery, response validation, and its own copies of the middleware instances.
- `data-aggregator.ts` is present but unwired: nothing in `src/` constructs it, and its local `YahooFinanceClient` interface (`:10-14`) demands `getQuoteSummary`/`getChart`, which the real client does not expose. Treat it as a draft, not a contract.
- Retry/backoff/breaker/throttle algorithms belong to `src/middleware/`; argument grammar belongs to `src/utils/security.ts`; `meta` assembly belongs to `src/tools/`.

## Local Contracts

- Library is `yahoo-finance2` ^4.0.3. One process-wide instance is exported as `yahooFinance` from `yahoo-finance.ts` and constructed with a `console.error`-bound `logger` plus `suppressNotices`, because v4 logs notices through `console.info`/`console.warn`, which are stdout in Node — the MCP wire. `YahooFinanceClient` reuses that instance; no module may `new YahooFinance()` again, since v4 keeps cookie, crumb, queue and debounce state per instance. Calls used: `quote` (single and array form for trending enrichment), `chart(..., { return: 'object' })` for historical (v4 deprecated `historical()`, and chart is the only source of the 13 advertised intervals), `quoteSummary` with valid `modules`, `trendingSymbols(region)`, `screener`, `search(symbol, { newsCount })` for news, and `options(symbol)` for the chain. `news` and `optionChain` are NOT valid quoteSummary modules — requesting them throws a schema error.
- The single raw network path is `fetch()` inside `tryAlternativeEndpoint` (`:988`) targeting `https://query1.finance.yahoo.com/v8/finance/chart/` (`:1120`, `:1130`). It has no caller in `src/`. `config.yahooFinance.userAgent` (`:1116`) only affects that dead path.
- Composition order for a data call lives in `executeWithMiddleware` ONLY (`:578-580`): cache pre-check (`:571-576`) then CircuitBreaker → RateLimiter → RetryPolicy → `fn`, with `cache.set` innermost (`:585`), so each retry attempt writes on success. `executeWithGracefulDegradation` (`:198-200`) nests the same order but has no caller in `src/` — it is reached only from tests. Do not treat it as a second live path.
- Measured defects in this file, pinned by `tests/unit/services/`: the limiter's 429-served-from-cache rescue is inert on the real path — `classifyError` rewrites the message before `RateLimiter`'s case-sensitive `includes('429') || includes('rate limit')` test sees it, and nothing ever calls the adapter half that writes `rate_limited_<key>`; `handleCookieError`'s csrf and session warning branches can never fire because it matches lowercase substrings against `'CSRF token validation failed'` and `'Session may have expired'` (only `crumb` matches); partial-data warnings are buffered before the `data !== null` fallthrough, so a rethrow leaves warnings no caller will read; `getCryptoQuote`/`getForexQuote` return the flat library object while `getQuote` returns `{ price, meta }`; and `screener`'s `meta.count` reports the library total while its rows are the mapped subset.
- Cache-first reads mean a hit is indistinguishable from a fresh value at this layer; `fromCache`/`dataAge` are invented downstream (`analysis.ts:118-128`, `historical.ts:335`). Do not claim provenance this layer does not provide.
- Emitted `DataWarning.timestamp` is `new Date()` at warning time (`:169`), not the data's timestamp.
- Degradation policy lives here: `fallbackCache` reads, warning emission, and partial-data recovery (`:593-628`) plus `validateDataQuality` (`:274`).
- Public surface consumed elsewhere: `getQuote`/`getQuotes` (`:315`, `:327`), `getHistoricalPrices` (`:355`), `getFinancials` (`:371`), `getEarnings` (`:400`), `getAnalysis` (`:412`), `getNews` (`:424`), `getOptions` (`:438`), `getSummaryProfile` (`:452`), `getCryptoQuote`/`getForexQuote` (`:464`, `:500`), `getTrending`/`screener` (`:536`, `:548`), plus `initialize`, `shutdown`, `getWarnings`, `getStats`, `isInitialized`. `validate*`, `detectAPIChanges`, `handleAPIChange`, `combineWithCache`, `getFallbackData` are public for tests only.
- `shutdown()` (`:142-150`) must reset every layer it owns; a new middleware without a line here keeps state across restart.

## Work Guidance

- Sequential `for ... await` batch loops (`:340`, `:485`, `:521`) drop a symbol's error when at least one symbol succeeded. Parallelizing these changes failure visibility — decide deliberately.
- Hazardous state to respect: destructive single-reader warning buffer (`:156-158`); `rate-limiter.ts:458` 100 ms `setInterval` keeps the process alive; empty `catch` blocks at `:135`, `:191`, `:1076`; a floating promise at `:1067`; `getFallbackData` writes cache key `api_change:...` (`:965`) but reads `fallback:...` (`:1082`), so that path can never hit; `validateQuote` mutates the library result and attaches `(quote as any).warnings` (`:733`).
- `data-aggregator.ts` consistency thresholds are selected by substring match on the field name (`:183-187`) — price within 1%, volume within 5%, time/date within 60000 ms, other numerics within 1%. Its cache is keyed by `symbol` alone (`:290`), so quote, historical, and financial entries collide, and `transformToFinancialResult` discards the cached quarterly rows it is handed instead of merging them. Pinned by `tests/unit/services/data-aggregator-branches.test.ts`.

## Verification

- `npx jest tests/unit/services`
- `npx jest tests/integration/middleware` (exercises this composition order end to end)
- `npm run typecheck`, `npm run lint`

## Child DOX Index

None. `data-aggregator.ts` has no independent contract while it stays unwired.
