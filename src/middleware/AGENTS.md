# src/middleware

## Purpose

Reusable resilience primitives — cache, circuit breaker, rate limiter, retry, security gate — each owning one algorithm and its statistics.

## Ownership

- This folder owns the mechanics and their configurable parameters. `src/services/yahoo-finance.ts` owns where they are composed and in what order; `src/utils/security.ts` owns the stateless validation rules that `middleware/security.ts` delegates to.
- No chain abstraction exists. `MiddlewareChain`, `MiddlewareFunction`, and `use()` in `src/types/middleware.ts:236-246` are declared and never implemented; nesting is hand-written in the service.

## Local Contracts

- `Cache` (`cache.ts:222`, re-exporting `LRUCache`, `StaleWhileRevalidate`, `CacheMetrics` at `:444`) takes `CacheConfig` from `src/types/config.ts:21`; `maxEntries` is LRU capacity. TTL is chosen by `getTTLForType` (`:424-428`) prefix-matching `quote`/`historical`/`financial`/`news`/`analysis` against `DEFAULT_TTL` (`:4-10`: 60 s / 1 h / 24 h / 5 m / 1 h) then falling back to `config.ttl`; the matched tokens are singular, so a key typed `quotes:...` or `financials:...` does not match. Expired entries are deleted and reported as a miss (`:245-249`); `STALE_THRESHOLD` is 0.5 (`:12`); revalidation failure serves the stale value until expiry, otherwise rethrows (`:212-218`); `warm` routes errors to `config.onError` (`:402`). Storage is in-memory only — `store: 'memory'` (`src/index.ts:122`) — and the `redis`/`file` config fields are never read.
- `CircuitBreaker` + `CircuitBreakerOpenError` (`circuit-breaker.ts:37`, `:10`). States are uppercase `'CLOSED' | 'OPEN' | 'HALF_OPEN'`, while `src/types/config.ts:69` types a lowercase union — the runtime value wins. Transitions: CLOSED→OPEN when `failureCount >= failureThreshold` after rolling-window cleanup (`:120`, `:153-158`); OPEN→HALF_OPEN lazily on `execute`/`getState` once `now - lastStateChange >= timeoutMs` (`:67`, `:91`); HALF_OPEN→CLOSED at `successCount >= successThreshold` (`:106`); HALF_OPEN→OPEN on any single failure (`:118`); `reset()` forces CLOSED (`:125`). Despite the config names there is no volume threshold and no percentage logic. Constructor accepts `{} as CircuitBreakerConfig`, so defaults are inline (`:53-62`): `failureThreshold` from `errorThresholdPercentage || 5`, `successThreshold` from `halfOpenMaxAttempts || 3`, `timeoutMs` from `resetTimeoutMs || 60000`, `monitoringWindowMs` from `rollingCountTimeoutMs || 60000`. `getConfig()`/`updateConfig()` use the private `CircuitBreakerConfigInternal` (`:26`), and `isClosed`, `isHalfOpen`, `forceOpen`, `forceClose` from `CircuitBreakerInterface` (`src/types/middleware.ts:145`) are not implemented.
- `RateLimiter` (`rate-limiter.ts:257`) is a hybrid: continuous-refill `TokenBucket` (`:34`, `:47`), fixed calendar-window `RateLimitTracker` per minute/hour (`:79-117`), and `AdaptiveThrottling` from response headers (`:150`, `:169`). Defaults: `refillRate = tokenRefillRate || 1`, capacity `= maxRequests`, `burstLimit = 5` (`:290`), `maxConcurrent = maxRequests || 10`, adaptive floor `floor(maxRequests * 0.25)` (`:285`). Exhaustion throws `RateLimitError` (`:4`) — it never queues — including predictive throttle above `usageRatio > 0.7` (`:315`, `:435`) and token depletion (`:326`). Only concurrency queues, FIFO through `waitForSlot()` on a 100 ms `setInterval` (`:442-471`) that keeps the event loop alive. A 429 inside `execute` first returns a cached `rate_limited_${key}` value before throwing (`:396-406`).
- `RetryPolicy`, `createRetryPolicy`, `retry`, `MaxRetriesExceededError` (`retry.ts:30`, `:254`, `:258`, `:9`). Retries when `classifyError` marks the error retryable and its status is in `config.retryableStatusCodes` (`:144`), or the code is in `ECONNRESET`/`ETIMEDOUT`/`ENOTFOUND`/`ECONNREFUSED` (`:6`), or the message contains timeout/network/rate limit/cookie/session (`:7`). Backoff is exponential `initialDelayMs * backoffMultiplier^(attempt-1)`, or `linear`/`fixed` (`:165-178`), capped at `maxDelayMs` (`:181`), with ±25% jitter and a 100 ms floor (`:195-202`); per-error multipliers are rate-limit ×2 or `retryAfter * 1000`, cookie ×0.5, 502/503/504 ×1.5 (`:207-233`). Loop bound `attempt <= maxRetries + 1` (`:76`) yields `maxRetries + 2` attempts. It sets no interaction with the breaker: `CircuitBreakerOpenError` carries `isRetryable = false` (`circuit-breaker.ts:16`) and exits immediately. `MaxRetriesExceededError` is the only place `YF_ERR_MAX_RETRIES_EXCEEDED` is set.
- `SecurityMiddleware` (`security.ts:4`) is the stateful wrapper — `blockedIPs`, `requestCounts`, `suspiciousPatterns`, auto-block after 5 hits (`:108`) — gated by `SecurityConfig` flags, delegating rules to `src/utils/security.ts`. It runs on the MCP boundary only (`src/index.ts:567` input, `:575` output, `:581` error, `:619` resource URI), not inside the data chain.

## Work Guidance

- Contract for adding a layer: expose `execute<T>(fn: () => Promise<T>, ...rest)`, `getStats()`, `reset()`, `getConfig()`/`updateConfig(Partial<C>)`; throw a `YahooFinanceError` subclass with a `YF_ERR_*` code, call `Object.setPrototypeOf` in the constructor, and choose `isRetryable` deliberately because retry semantics depend on it; take config from `src/types/config.ts`, not the same-named interfaces in `src/config/defaults.ts`.
- `src/index.ts:103-163` is the translation point between config field names and the names these classes read (`failureThreshold` vs `errorThresholdPercentage`, `maxCacheSize` vs `maxEntries`, `baseDelay` vs `initialDelayMs`). Add the field in both places or the value silently falls back to the inline default.
- Wire the new layer at both nesting sites in the service (`yahoo-finance.ts:578-580` and `:198-200`) and add its `reset()` to `shutdown()` (`:142-150`).

## Verification

- `npx jest tests/unit/middleware`
- `npx jest tests/integration/middleware`
- `npx jest tests/chaos/circuit-breaker.chaos.test.ts tests/chaos/rate-limit.chaos.test.ts`
- `npm run lint`, `npm run typecheck`

## Child DOX Index

None. This folder is a leaf.
