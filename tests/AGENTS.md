# tests

## Purpose

52 test modules across four layers plus shared fixtures, run by Jest against the TypeScript source and against the built server.

## Ownership

- This folder owns test layering, the mocking policy, the deterministic-versus-live split, and the coverage gate. `src/` owns the behavior being asserted; a test never defines a contract that `src/` does not already implement.
- `tests/unit/`, `tests/integration/`, and `tests/fixtures/` are governed here. `tests/e2e/` and `tests/chaos/` have their own contracts because they run the built artifact in a separate process.
- The live boundary is owned here, in `jest.config.js` and `jest.live.config.js`, not in `package.json`.

## Local Contracts

- Layers and counts: 36 under `tests/unit/`, 9 under `tests/integration/` (subdirs `tools/`, `middleware/`, `server/`, `e2e/`), 5 under `tests/e2e/`, 6 under `tests/chaos/`, and `tests/fixtures/` holding `mock-responses.ts` and `test-data.ts`.
- Commands: `npm test` is `jest` with `testNamePattern: '^(?!.*live market data)'`, so it is deterministic and needs no network. `npm run test:live` runs `jest.live.config.js`, which keeps only the `live market data` groups inside `server.e2e.test.ts`, `tool-execution.e2e.test.ts`, and `resource-access.e2e.test.ts` — those three files are named in its `testMatch` because a suite whose every test is filtered out fails with "Your test suite must contain at least one test". `test:live` needs both `npm run build` and internet access. Neither workflow runs it.
- The phrase `live market data` inside a `describe` title IS the split. Renaming or dropping it silently moves a network-dependent test into the CI gate, where a Yahoo outage or a 429 reads as a broken build. 55 tests are filtered by name in the default run and Jest reports them as skipped.
- Module system: `extensionsToTreatAsEsm: ['.ts']` (`jest.config.js:4`) against `"type": "module"` (`package.json:5`), while the transform forces `module: 'commonjs'` (`:15`) and nothing runs Jest with `--experimental-vm-modules`. Consequence: `import.meta` cannot appear in any file the suite loads — not a test, and not any `src/` module a test imports, because TypeScript refuses to downlevel it. That is why `src/index.ts` is the only file holding an ESM anchor and `src/server.ts` holds the loadable class. Test paths use `__dirname` / `path.resolve(__dirname, '../../dist/index.js')`, which `@types/node` supplies under the CJS transform.
- `moduleNameMapper` (`:5-7`) rewrites `.js` specifiers to extensionless paths, so both `.js` and extensionless imports resolve here. `babel.config.js` is dead: CommonJS in an ESM package, presets not installed, and it is in eslint's `ignores`.
- `testTimeout` is 30000 ms and `verbose` is on. There are no `setupFiles`, `globalSetup`, or teardown modules, so nothing sets or guards an environment; a live group sets its own per-test timeout instead of raising the global one.
- Mocking policy: a test fakes the seam the code actually calls — the shared `yahooFinance` singleton's methods (`quote`, `chart`, `quoteSummary`, `search`, `options`, `fundamentalsTimeSeries`, `trendingSymbols`, `screener`) or an injected `YahooFinanceClient` — and restores it afterwards. `jest.mock`-ing a namespace function that `src/` never invokes is the failure mode that kept 44 suites red; it cannot see the real data shapes and passes for the wrong reason.
- Handlers return plain objects and `src/server.ts` wraps them into `content: [{ type: 'text', text: JSON.stringify(...) }]`. Unit and integration tests assert the plain object; e2e tests assert the wrapped JSON string. Never mix the two.
- Spawned-server suites: one child per file, spawned in `beforeAll` and killed in `afterAll` (`stdin.end()` → `SIGTERM` → `SIGKILL`), never one per test. Readiness is the `Yahoo Finance MCP Server started successfully` line on **stderr** — diagnostics never go to stdout. Replies are correlated by JSON-RPC `id` through a single shared stdout reader, and every spawned file asserts continuous stdout framing, which is the only thing in this layer that catches a stray `console.log` in `src/`.
- Coverage is enforced globally at 85% for branches, functions, lines, and statements (`jest.config.js:40-46`) by `npm run test:coverage`. `collectCoverageFrom` excludes `src/**/*.d.ts`, `*.test.ts`, `*.spec.ts`, and `src/**/index.ts` — so since the 2026-10-13 entry split the `MCPServer` class in `src/server.ts` counts and the thin entry does not.
- Measured 2026-10-14: `npm test` is 56 of 56 suites and 2112 tests passing with 55 live tests skipped, and `npm run test:coverage` PASSES the 85% gate at 98.05% statements / 95.15% branches / 98.98% functions. `npm run test:live` passes all 55 network cases against Yahoo in about 15 s. The whole repo gate — lint, typecheck, build, test, coverage — is green; keep it that way by closing branch gaps rather than lowering the threshold.
- `TEST_REPORT.md` and `COMPREHENSIVE_TEST_REPORT.md` at the repository root are frozen 2026-01-18 snapshots. They are not a verification source and their counts match nothing; do not cite them.

## Work Guidance

- Test files are neither type-checked (`tsconfig.json` excludes `tests`) nor linted (`eslint.config.mjs` scopes the strict block to `src/**/*.ts`). Jest's own transform is the only net, which is exactly how a file importing twelve functions that never existed stayed red for months.
- Prefer `npx jest <path>` for a loop; a full `npm test` starts the spawned-server files. Never assert against stdout framing except in the spawned layer.
- Do not lower the 85% threshold to match a measurement, and do not add assertion-free tests to inflate it. Close the branch gap or state it.
- When `src/` behavior changes, update the tests that pinned the old defect instead of leaving a green lie — the two `get_balance_sheet` symbol-validation pins are the worked example from 2026-10-13.
- Keep the per-file `createMCPRequest`/`sendMCPRequest` pair inside each spawned-server file until someone moves it into `tests/fixtures/`; six copies currently differ only in timeout handling.
- Follow the existing `.ts`-suffix fixture imports in files that already use them (`tests/chaos/*.test.ts:6`, `tests/e2e/tool-execution.e2e.test.ts:6-7`); `allowImportingTsExtensions` is `false`, so those files stay outside any type check by necessity.

## Verification

- `npm test` — deterministic, no network, but requires `npm run build` first for the spawned-server files.
- `npm run test:live` — the 55 network cases; needs build plus internet.
- `npm run test:coverage` — the same run with the 85% gate.
- `npm run test:watch`
- Single file or single case: `npx jest tests/unit/tools/quotes.test.ts`, `npx jest -t "<test name>"`.

## Child DOX Index

- `tests/e2e/AGENTS.md` — spawned-server protocol tests, their stdout-framing contract, and their live groups.
- `tests/chaos/AGENTS.md` — in-process failure injection and the process-boundary limit that made the old spawned-fault fiction impossible to honor.
