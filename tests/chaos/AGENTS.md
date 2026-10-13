# tests/chaos

## Purpose

Six failure-mode suites — network loss, timeouts, rate limiting, circuit breaking, partial data, API shape changes — asserted against the spawned server.

## Ownership

- This folder owns how a fault is simulated and what degradation looks like from a client's point of view.
- The fault mechanisms themselves are owned by `src/middleware/` and `src/services/`; scenario data is owned by `tests/fixtures/test-data.ts`.

## Local Contracts

- Same spawn and build guard as `tests/e2e/`: `../../dist/index.js` with `Server build not found. Run "npm run build" first.` (`network-failures.chaos.test.ts:29-34`, `circuit-breaker.chaos.test.ts:32-35`, and equivalents), and child env `NODE_ENV: 'test'`, `USE_MOCK_API: 'true'` (`network-failures.chaos.test.ts:41-43`, `rate-limit.chaos.test.ts:43-45`, `timeout.chaos.test.ts:43-45`, `circuit-breaker.chaos.test.ts:43-45`, `partial-data.chaos.test.ts:41-43`, `api-changes.chaos.test.ts:40-42`). That variable is read nowhere in `src/`, so it does not stub anything.
- Injection is in-process: `global.fetch` is replaced with a `jest.fn` rejecting `networkFailureScenarios[failureType].code` (`network-failures.chaos.test.ts:129`, `:137`) and restored in teardown (`:14`, `:25`). The server under test is a separate Node process, so these stubs cannot reach its fetches. Treat a chaos suite result as evidence about the harness plus whatever the live API did, not as proof that the server handled a specific fault.
- Scenario shapes come from `tests/fixtures/test-data.ts`: `networkFailureScenarios` (`:117-123`) and the counter/random-rate intermittent generators (`:135-147`), plus `circuitBreakerConfigs`, `resilienceTestConfigs`, `rateLimitConfigs`, `concurrentRequestCounts`, `backoffStrategies`, `timeoutValues`, `retryConfigs`, `partialDataScenarios`, `qualityMetrics` — each imported with a `.ts` extension at line 6 of its suite.
- Assertion target is protocol-level degradation: an `isError: true` result, an error payload carrying a `YF_ERR_*` code, or a response whose `meta.warnings` records the degradation. `src/index.ts:582-585` is what produces that shape.
- Suites run inside `npm test` with the global 30 s `testTimeout` (`jest.config.js:48`); each spawns its own server, so total wall time scales with the number of suites.

## Work Guidance

- To make a fault land inside the server rather than the test process, the injection has to be delivered to the child (an env switch honored by `src/`, or a stubbed upstream address), not through `global.fetch`. Decide that before writing a new chaos assertion, or the suite will pass for the wrong reason.
- Follow the existing one-file-per-failure-mode layout and keep the local `createMCPRequest`/`sendMCPRequest` pair inside the file.

## Verification

- `npm run build` then `npx jest tests/chaos`
- Single mode: `npx jest tests/chaos/circuit-breaker.chaos.test.ts`
- `npx jest tests/integration/middleware` for breaker and limiter behavior that is testable in-process

## Child DOX Index

None. This folder is a leaf.
