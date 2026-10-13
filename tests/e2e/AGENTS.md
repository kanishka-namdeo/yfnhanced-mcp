# tests/e2e

## Purpose

Drive the built server over its real transport — spawn `dist/index.js`, exchange JSON-RPC on stdio — plus one suite that calls tool modules in-process.

## Ownership

- `server.e2e.test.ts` startup and handshake, `tool-execution.e2e.test.ts` per-tool calls, `resource-access.e2e.test.ts` `resources/*`, `prompt-execution.e2e.test.ts` `prompts/*`, `real-world.test.ts` direct module usage against the live API.
- Layer-wide rules (commands, coverage, mocking policy) stay in `tests/AGENTS.md`.

## Local Contracts

- Every spawned file resolves `serverPath` to `../../dist/index.js` and rejects with `Server build not found. Run "npm run build" first.` when it is absent (`server.e2e.test.ts:27-33`, `tool-execution.e2e.test.ts:29-32`, `resource-access.e2e.test.ts:27-30`, `prompt-execution.e2e.test.ts:27-30`). `npm test` runs these without building first.
- `spawn('node', [serverPath], ...)` at `server.e2e.test.ts:37`, `tool-execution.e2e.test.ts:36` and the equivalents elsewhere, with child environment `NODE_ENV: 'test'` and `USE_MOCK_API: 'true'` (`tool-execution.e2e.test.ts:40-42`, `prompt-execution.e2e.test.ts:40`, `resource-access.e2e.test.ts:40`). No code in `src/` reads `USE_MOCK_API`; the only environment variable the loader honors is `YF_MCP_CONFIG_PATH` (`src/config/index.ts:171`). The child therefore resolves against live Yahoo Finance.
- `server.e2e.test.ts:3` uses `createRequire` because the artifact under test is the compiled CommonJS-shaped output of `tsc`, not `src/`. Assert against `dist/` behavior, not source behavior, in these files.
- Interaction is message-based: requests go to the child's stdin, responses are parsed from stdout. stdout is the protocol channel; nothing here may treat it as a log stream.
- `real-world.test.ts` is the exception to all of the above: it imports `QuoteTools`, `EarningsTools`, `HistoricalTools`, `AnalysisTools`, `getCompanyNewsTool`, `getMajorHoldersTool`, `getOptionsTool`, `YahooFinanceClient`, `DataQualityReporter`, and the SDK `Server` directly (`:2-16`), installs no mocks, and calls real tools (`:30-38`). It is the suite most likely to fail on upstream availability rather than on a code defect.

## Work Guidance

- Keep the per-file `createMCPRequest`/`sendMCPRequest` helpers consistent with the others until someone moves them into `tests/fixtures/`; six copies currently differ only in timeout handling.
- Expect fixture imports with a `.ts` suffix here (`tool-execution.e2e.test.ts:6-7`); see `tests/AGENTS.md`.
- The fifteen `mock*Response` imports at `tool-execution.e2e.test.ts:6` are unused, because assertions are made against the live child rather than against fixtures.

## Verification

- `npm run build` then `npx jest tests/e2e`
- Single file: `npx jest tests/e2e/tool-execution.e2e.test.ts`
- `npm run test:coverage` does not count these toward `src/` coverage gates in any special way; the gate is global.

## Child DOX Index

None. This folder is a leaf.
