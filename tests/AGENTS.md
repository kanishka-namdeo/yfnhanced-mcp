# tests

## Purpose

52 test modules across four layers plus shared fixtures, run by Jest against the TypeScript source and the built server.

## Ownership

- This folder owns test layering, mocking policy, and the coverage gate. `src/` owns the behavior being asserted; a test never defines a contract that `src/` does not already implement.
- `tests/unit/`, `tests/integration/`, and `tests/fixtures/` are governed here. `tests/e2e/` and `tests/chaos/` have their own contracts because they run the built artifact in a separate process.

## Local Contracts

- Layers and counts: 32 under `tests/unit/`, 9 under `tests/integration/` (subdirs `tools/`, `middleware/`, `server/`, `e2e/`), 5 under `tests/e2e/`, 6 under `tests/chaos/`, and `tests/fixtures/` holding `mock-responses.ts` and `test-data.ts`.
- One command runs everything: `npm test` is plain `jest` (`package.json:19`). There are no `test:unit`, `test:integration`, `test:e2e`, or `test:chaos` scripts, and `jest.config.js:21-25` has no per-layer `testMatch`, so `*.chaos.test.ts` and `*.e2e.test.ts` execute inside `npm test`.
- Narrow runs use the CLI directly: `npx jest tests/unit/tools/quotes.test.ts`, `npx jest tests/chaos`, `npx jest -t "<test name>"`.
- Coverage gate is global 85% for branches, functions, lines, and statements (`jest.config.js:40-46`), enforced by `npm run test:coverage`. `collectCoverageFrom` (`:26-32`) excludes `src/**/index.ts`, so the server entrypoint is outside the gate, and it only ever scans `src/`.
- Module system: `extensionsToTreatAsEsm: ['.ts']` (`:4`) against `"type": "module"` (`package.json:5`), while the transform forces `module: 'commonjs'` (`:15`). `moduleNameMapper` (`:5-7`) rewrites `.js` specifiers to extensionless paths, which is why both `.js` and extensionless imports resolve here. `babel.config.js` is dead: it is CommonJS in an ESM package and its Babel presets are not installed; it is also in eslint's `ignores` (`eslint.config.mjs:10`).
- `testTimeout` is 30000 ms and `verbose` is on (`:48-49`). There are no `setupFiles`, `globalSetup`, or teardown modules, so nothing sets or guards an environment for the suite.
- Mocking policy by layer: unit tests `jest.mock` the `src` module under test and use inline literals; integration tests mock the service and data-quality modules (`tests/integration/tools/quotes.integration.test.ts:7-8`) or `yahoo-finance2` itself (`tests/integration/e2e/full-workflow.integration.test.ts:1`), while middleware integration uses the real classes. There is no live-network guard anywhere: no `describe.skip`, `it.skip`, or env check exists in `tests/`.
- Fixtures are the shared vocabulary: `test-data.ts` supplies `validSymbols`, `cryptoSymbols`, `forexPairs`, `networkFailureScenarios` (`:117-123`), `rateLimitConfigs`, `timeoutValues`, `backoffStrategies`, and intermittent-failure generators (`:135-147`); `mock-responses.ts` supplies one `mock*Response` per tool.
- Style: explicit imports from `@jest/globals` at the top of every file, nested `describe` per feature area, built-in `expect` matchers only (no chai/sinon), and `test`/`it` leaves. JSON-RPC helpers `createMCPRequest`/`sendMCPRequest` are duplicated per spawned-server file rather than shared.
- Known-broken imports (not run in this session; the named exports do not exist in `src/`): `QuoteTools` is exported but tests import `QuotesTools` (`tests/unit/tools/quotes.test.ts:1`); `tests/unit/tools/financials|holders|news|options.test.ts` import classes where those files export functions; `tests/unit/config/defaults.test.ts:1` imports `getDefaultConfig` and twelve `get*Defaults`; `tests/unit/config/validation.test.ts:1` imports `validateConfig` and nine more while the module exports zod schemas; `tests/unit/prompts/financial.test.ts:1-16` imports thirteen `format*Prompt` functions against a module that exports `financialPrompts`, `getFinancialPrompt`, `listFinancialPrompts`; `tests/unit/utils/*` import `formatLargeNumber`, `formatTime`, `formatPrice`, `calculateCompleteness`, `calculateFieldQuality`; `tests/integration/server/server.integration.test.ts:4` imports `config`; `tests/unit/services/data-aggregator.test.ts` imports `FallbackStrategy`. `tests/unit/types/errors.test.ts` is covered in `src/types/AGENTS.md`.
- `tests/unit/resources/templates.test.ts` asserts `expect(true).toBe(true)` for a folder that does not exist in `src/`. It passes and covers nothing; do not read it as resource coverage.
- `tests/unit/prompts/financial.test.ts` targets the orphaned `src/prompts/` module; see `src/AGENTS.md`.

## Work Guidance

- Test files are not type-checked (`tsconfig.json:39-47` excludes `tests` and `*.test.ts`) and are not linted: `eslint.config.mjs:15` scopes the rule block to `src/**/*.ts`, and the override at `:87-95` only switches rules off. Only Jest's own transform catches errors here.
- Follow the existing path style when touching a file already importing fixtures with a `.ts` suffix (`tests/chaos/*.test.ts:6`, `tests/e2e/tool-execution.e2e.test.ts:6-7`); `allowImportingTsExtensions` is `false` (`tsconfig.json:33`), so those files stay outside any type check by necessity.
- Prefer `npx jest <path>` for a fast loop; a full `npm test` starts six spawned-server suites.
- Keep assertions off stdout framing; spawned servers speak JSON-RPC on stdout and are parsed, not printed.

## Verification

- `npm test`
- `npm run test:coverage` (fails below the global 85% thresholds)
- `npm run test:watch`
- Precondition for `tests/e2e` and `tests/chaos`: `npm run build`

## Child DOX Index

- `tests/e2e/AGENTS.md` — spawned-server protocol tests and their real-API outlier.
- `tests/chaos/AGENTS.md` — failure injection and the process boundary that limits it.
