# src

## Purpose

TypeScript implementation of the Yahoo Finance MCP server: process lifecycle, MCP protocol handling, financial data acquisition, resilience, and validation.

## Ownership

- `src/index.ts` is the process entry and nothing else: the `#!/usr/bin/env node` shebang, the realpath start guard, reading the published version out of `package.json`, and constructing `MCPServer`. `src/server.ts` owns the `MCPServer` class, the only `Server` + `StdioServerTransport` pair, the tool/resource/prompt registries and dispatch maps, process signal handling, and shutdown. Nothing below `src/` may open a transport or register a second handler for the same MCP request schema.
- The entry/class split is load-bearing: the Jest transform forces `module: 'commonjs'` (`jest.config.js:15`) and TypeScript cannot downlevel `import.meta`, so every module a test imports must stay `import.meta`-free. `src/index.ts` is the only file in `src/` allowed to use it, and no test loads it.
- `src/config/` owns config loading and startup validation.
- `src/tools/` owns per-domain tool handlers and their tool-facing behavior.
- `src/services/` owns the network boundary to Yahoo Finance and the resilience composition.
- `src/middleware/` owns the algorithms for cache, circuit breaking, rate limiting, retry, and security gating.
- `src/schemas/` owns zod input/output contracts shared by tools.
- `src/utils/` owns stateless validators, error classification, data-quality scoring, formatting.
- `src/types/` owns type-only declarations.
- `src/prompts/` no longer exists. It was deleted on 2026-10-13 together with its unreferenced 988-line module, because `src/server.ts` hardcodes its six prompts inline. If prompts ever grow past those six, that is the reason to reintroduce the folder.

## Local Contracts

- Startup sequence is load-bearing and may not be reordered (`src/server.ts:82-93`): `loadConfig` → `initializeServices` → `initializeServer` → `registerTools` → `registerResources` → `registerPrompts` → `setupErrorHandling` → `setupGracefulShutdown` → `state = 'ready'`. A throw sets `state = 'stopped'` and rethrows.
- `state` gates the call and read paths (`src/server.ts:565`, `:630`, `:775`) but not the list handlers — `tools/list`, `resources/list`, `resources/templates/list` and `prompts/list` answer before the server is ready. Handlers registered after the ready flag would be unreachable, and any earlier one leaves a half-initialized server answering requests.
- stdout is the MCP channel. Never introduce `console.log` or write to stdout in `src/`; all diagnostics use `console.error`. `yahoo-finance2` logs through `console.info`/`console.warn`, which are stdout in Node, so the shared client instance passes a `console.error`-bound `logger` — any new library client must do the same or it corrupts JSON-RPC framing. `winston` was removed on 2026-10-13; it was never imported.
- Transport is hardcoded stdio (`src/server.ts:208`) and `transport: 'stdio'` is passed twice (`:187`, `:272`); no config value selects a transport.
- Capabilities are hardcoded in `new Server(...)` (`src/server.ts:200`); the configured `capabilities` object passed to the Yahoo client has no effect on what the server advertises.
- Process handlers are registered once inside `initialize()`: `uncaughtException` → `shutdown()` (`src/server.ts:917-921`), `unhandledRejection` logs only, `SIGINT`/`SIGTERM` → `shutdown()` then `process.exit(0)` (`:928`). `shutdown()` (`:943`) is guarded by `state` and is not safe to call twice by any other route.
- The published identity is assembled in two places: `src/index.ts` reads `version` from the package's own `package.json` and passes it as `new MCPServer({ serverVersion })`, and `src/server.ts:196` prefers that over `config.serverInfo.version`. `defaultServerInfoConfig.version` is deliberately `''` — nothing in `src/config/` may read `import.meta`, and a hardcoded version drifts the moment the package version is bumped.
- `main()` runs only when the resolved path of `process.argv[1]` equals `realpath` of this module (`src/index.ts:29-35`). A plain string compare against `__filename` is not enough: the installed bin reaches the file through a `node_modules/.bin` symlink, so `argv[1]` is the link and `import.meta.url` is the target — under the old compare the server exited silently without starting, which is what `npx yfnhanced-mcp` did until 2026-10-13. Tests import `MCPServer` from `src/server.js` and depend on it not auto-starting.
- Two middleware instantiations coexist by design: server-owned at `src/server.ts:103-131` and client-owned at `src/services/yahoo-finance.ts:107-110`. The request path uses the client's copies; the server's copies only feed `getStats()` (uncalled) and `shutdown()`. Do not "deduplicate" these without re-checking both paths.
- Tool and resource errors differ: tool failures return `isError: true` content (`src/server.ts:586-589`), resource failures rethrow.

## Work Guidance

- ESM throughout. Every relative import uses a `.js` specifier; named exports only, no default exports anywhere in `src/`.
- `tsconfig.json` includes only `src/**/*` and excludes `tests`, `*.test.ts`, and the config files. It is deliberately loose: `strict: true` with `noImplicitAny: false`, `noUnusedLocals: false`, `noUnusedParameters: false`, `noImplicitReturns: false`, `noUncheckedIndexedAccess: false`. The compiler will not flag dead code or unused imports — ESLint does, and `src/` has been held at zero ESLint errors since 2026-10-13, so a new unused import or `any` is a lint failure, not a warning.
- `eslint.config.mjs:15` scopes the strict block to `src/**/*.ts`: type-aware `no-floating-promises`, `no-misused-promises`, `await-thenable`, `no-unsafe-*`, `strict-boolean-expressions`, `no-non-null-assertion`, `explicit-function-return-type`, `eqeqeq`, `consistent-return`. Warnings at `:82-84`: `complexity` 15, `max-lines-per-function` 100, `max-depth` 4. No Prettier gate.
- New layers or registries are hand-wired at their call sites; there is no generic registry, plugin system, or `MiddlewareChain` implementation.

## Verification

- `npm run typecheck` (`tsc --noEmit`, src only)
- `npm run lint` / `npm run lint:fix`
- `npm run build` (`tsc` emits `dist/`)
- `npm test`, `npm run test:coverage`
- `npm run dev` (`tsx watch src/index.ts`)
- `node test-mcp-client.js` after `npm run build` for a manual stdio handshake against `dist/index.js`

## Child DOX Index

- `src/config/AGENTS.md` — config precedence, validation fatality, and which knobs take effect.
- `src/tools/AGENTS.md` — tool handler anatomy and the registration contract with `src/index.ts`.
- `src/services/AGENTS.md` — Yahoo Finance client, degradation policy, and state traps.
- `src/middleware/AGENTS.md` — resilience primitives and the contract for adding one.
- `src/schemas/AGENTS.md` — zod conventions and barrel export rules.
- `src/utils/AGENTS.md` — stateless helper invariants and the error taxonomy.
- `src/types/AGENTS.md` — type-only contracts and the duplicate config types hazard.
