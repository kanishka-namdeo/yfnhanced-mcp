# tests/chaos

## Purpose

Six failure-mode suites — circuit breaking, rate limiting, timeouts, network loss, partial data, API shape changes — injected in-process against the real resilience stack, plus one spawned-server protocol check per file.

## Ownership

- This folder owns how a fault is simulated and what degradation looks like from a caller's point of view.
- The fault mechanisms themselves are owned by `src/middleware/` and `src/services/`; scenario data is owned by `tests/fixtures/test-data.ts`.
- Protocol behavior of the built artifact is owned by `src/server.ts`; only the narrow handshake/list checks below belong here.

## Local Contracts

- Injection is in-process and real. Each suite imports `src/middleware/{circuit-breaker,rate-limiter,retry,cache}.ts`, `src/services/yahoo-finance.ts` and `src/utils/{error-classifier,data-completion}.ts` and drives them with a fake upstream. `YahooFinanceClient` is constructed with a full config object (`yahooFinance.baseUrl` is read by the constructor, so a client without it throws) and its private `yahooFinanceInstance` is replaced with `{ quote, chart, search, quoteSummary }` stubs. No test reaches live Yahoo.
- `USE_MOCK_API` is gone from every file: nothing in `src/` reads it, so it stubbed nothing. Child env is `NODE_ENV: 'test'` only — no `PORT` either, because the transport is stdio.
- `import.meta` is banned in every test file: the Jest transform forces `module: 'commonjs'` (`jest.config.js:15`) and cannot downlevel it. Paths use `__dirname` / `path.resolve(__dirname, '../../dist/index.js')` (supplied by `@types/node` under the CJS transform).
- One child process per file, spawned in `beforeAll`, killed in `afterAll` (`stdin.end()` → `SIGTERM`, `SIGKILL` after 3 s). The child is the subject only for: handshake, `tools/list` = 17, `prompts/list` = 6, `resources/templates/list` = 6, and malformed-argument calls producing `result.isError: true` with `{ error: ... }` text. None needs market data. Requests are matched by JSON-RPC `id` through one shared stdout line reader; the old "wait for `Yahoo Finance MCP Server started successfully` on stdout" never fired because that line goes to `console.error`, so every spawn stalled on a 10 s fallback timer.
- Behavior encoded because it was measured here, not because a doc said so: `RateLimiter` throws `RateLimitError` on exhaustion and only concurrency queues (FIFO via `waitForSlot`, ~100 ms `setInterval`; the per-endpoint guard throws instead of queueing); the fixed calendar window is off-by-one, a `requestsPerMinute` of N serves N - 1; `CircuitBreaker` goes HALF_OPEN→OPEN on any single failure and counts ONE failure per composed call because it wraps the whole retry chain; retry runs `maxRetries + 1` attempts and rethrows the classified error (`MaxRetriesExceededError` is unreachable on that path); `CircuitBreakerOpenError` short-circuits retry; per-error multipliers are rate-limit ×2 or `retryAfter * 1000`, cookie ×0.5, 502/503/504 ×1.5, with ±25% jitter and a 100 ms floor; retry attempts never re-enter the limiter.
- Defects this layer now pins down rather than hides: the `timeout` request option is inert (no layer races a slow upstream, a hung call hangs forever); `ETIMEDOUT` never classifies as a timeout because `isTimeoutError` matches `etimeout`, and `ECONNRESET`/`ENETDOWN` land in `YF_ERR_UNKNOWN`; a message containing the word `undefined` becomes non-retryable `YF_ERR_DATA_UNAVAILABLE`; `validateQuote` warnings attach to the returned payload, not to `getWarnings()`, which only the degradation path writes and the first reader drains; `getQuotes` drops per-symbol errors when at least one symbol succeeds; `tryAlternativeEndpoint` is the only raw `fetch` and has no caller; `handleAPIChange` archives under `api_change:<endpoint>:<ts>` while `getFallbackData` reads `fallback:<key>`, so the archive is unreachable; `detectAPIChanges` cannot fire on a mapped chart result; `trailingPE`/`dividend*` and news `title` nulls are invisible to this layer.
- Fixture keys do not match class keys. `circuitBreakerConfigs` (`failureThreshold`/`successThreshold`/`timeout`) and `retryConfigs` (`baseDelay`/`maxDelay`) must be mapped onto `errorThresholdPercentage`/`halfOpenMaxAttempts`/`resetTimeoutMs` and `initialDelayMs`/`maxDelayMs`, otherwise every value silently falls back to the inline defaults. `networkFailureScenarios.timeout` has no `code` field at all.
- `jest.useFakeTimers()` is used for elapsed-time transitions (breaker `resetTimeoutMs`, rolling window, cache TTL expiry, token refill) and is always released in the same test or an `afterEach`; queue/concurrency tests use real timers because `processQueue` runs on a `setInterval`.
- Cache TTL matching is `startsWith` on singular tokens, so `quotes:AAPL` DOES inherit the 60 s quote TTL and `financials:X` the 24 h one; an explicit `ttl` argument always wins; a key matching none of the five gets `config.ttl`.
- Measured 2026-10-14: `npx jest tests/chaos` is 6 suites / 102 tests green in ~7 s wall time, four consecutive runs identical. Timing-sensitive assertions are the two limiter latency checks (`< 90 ms` rejection, ~100 ms queue drain) and the `prompts/list < 5000 ms` bound.

## Work Guidance

- Inject faults where the code runs. A fault in the Jest process cannot reach a spawned child; never write a chaos assertion that depends on the child observing a parent-process stub.
- Keep exactly one spawned-server block per file and only for protocol facts; if a new check needs market data it belongs in `tests/e2e/`, not here.
- Keep the local `createMCPRequest`/`sendMCPRequest` pair inside the file, matching the other spawned-server suites.
- Assert a doc claim only after measuring it; when measurement contradicts `src/middleware/AGENTS.md` or `src/services/AGENTS.md`, encode the measurement and name the contradiction in the test title or a comment.
- Do not add a production env backdoor to make injection easier; the fake `yahooFinanceInstance` swap is the supported seam.

## Verification

- In-process half: `npx jest tests/chaos` with no build step.
- Protocol blocks additionally require `npm run build`; without `dist/index.js` each file rejects with `Server build not found. Run "npm run build" first.`
- Single mode: `npx jest tests/chaos/circuit-breaker.chaos.test.ts`
- `npx jest tests/integration/middleware` for the same primitives with their own fixtures.

## Child DOX Index

None. This folder is a leaf.
