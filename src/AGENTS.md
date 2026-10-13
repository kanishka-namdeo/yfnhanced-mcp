# src

## Purpose

TypeScript implementation of the Yahoo Finance MCP server: process lifecycle, MCP protocol handling, financial data acquisition, resilience, and validation.

## Ownership

- `src/index.ts` owns the `MCPServer` class, the only `Server` + `StdioServerTransport` pair, the tool/resource/prompt registries and dispatch maps, process signal handling, and shutdown. Nothing below `src/` may open a transport or register a second handler for the same MCP request schema.
- `src/config/` owns config loading and startup validation.
- `src/tools/` owns per-domain tool handlers and their tool-facing behavior.
- `src/services/` owns the network boundary to Yahoo Finance and the resilience composition.
- `src/middleware/` owns the algorithms for cache, circuit breaking, rate limiting, retry, and security gating.
- `src/schemas/` owns zod input/output contracts shared by tools.
- `src/utils/` owns stateless validators, error classification, data-quality scoring, formatting.
- `src/types/` owns type-only declarations.
- `src/prompts/` no longer exists. It was deleted on 2026-10-13 together with its unreferenced 988-line module, because `src/index.ts` hardcodes its six prompts inline. If prompts ever grow past those six, that is the reason to reintroduce the folder.

## Local Contracts

- Startup sequence is load-bearing and may not be reordered (`src/index.ts:81-96`): `loadConfig` → `initializeServices` → `initializeServer` → `registerTools` → `registerResources` → `registerPrompts` → `setupErrorHandling` → `setupGracefulShutdown` → `state = 'ready'`. A throw sets `state = 'stopped'` and rethrows (`:93-94`).
- `state` gates every request path (`:560`, `:614`, `:759`); handlers registered after the ready flag would be unreachable, and any earlier one leaves a half-initialized server answering requests.
- stdout is the MCP channel. Never introduce `console.log` or write to stdout in `src/`; all diagnostics use `console.error`. `yahoo-finance2` logs through `console.info`/`console.warn`, which are stdout in Node, so the shared client instance passes a `console.error`-bound `logger` — any new library client must do the same or it corrupts JSON-RPC framing. `winston` was removed on 2026-10-13; it was never imported.
- Transport is hardcoded stdio (`src/index.ts:207-208`) and `transport: 'stdio'` is passed twice (`:186`, `:270`); no config value selects a transport.
- Capabilities are hardcoded in `new Server(...)` (`:199`); the configured `capabilities` object passed to the Yahoo client (`:184`) has no effect on what the server advertises.
- Process handlers are registered once inside `initialize()`: `uncaughtException` → `shutdown()` (`:902-905`), `unhandledRejection` logs only (`:907`), `SIGINT`/`SIGTERM` → `shutdown()` then `process.exit(0)` (`:912-921`). `shutdown()` is guarded by `state` (`:924-927`) and is not safe to call twice by any other route.
- `main()` runs only under the `process.argv[1] === __filename` guard (`:1005`). Tests import `MCPServer` and depend on it not auto-starting.
- Two middleware instantiations coexist by design: server-owned at `src/index.ts:103-129` and client-owned at `src/services/yahoo-finance.ts:107-110`. The request path uses the client's copies; the server's copies only feed `getStats()` (uncalled) and `shutdown()`. Do not "deduplicate" these without re-checking both paths.
- Tool and resource errors differ: tool failures return `isError: true` content (`:582-585`), resource failures rethrow (`:657`).

## Work Guidance

- ESM throughout. Every relative import uses a `.js` specifier; named exports only, no default exports anywhere in `src/`.
- `tsconfig.json` includes only `src/**/*` and excludes `tests`, `*.test.ts`, and the config files. It is deliberately loose: `strict: true` with `noImplicitAny: false`, `noUnusedLocals: false`, `noUnusedParameters: false`, `noImplicitReturns: false`, `noUncheckedIndexedAccess: false`. The compiler will not flag dead code or unused imports; several exist (`index.ts:19-38`).
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
