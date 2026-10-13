# Contributing to yfnhanced-mcp

`yfnhanced-mcp` is a Model Context Protocol (MCP) server that wraps `yahoo-finance2`
with caching, circuit breaking, rate limiting, retry, and data-quality validation.
Thanks for helping make it better.

## Development setup

Requires Node.js >= 22.13 and npm >= 10.

```bash
git clone https://github.com/kanishka-namdeo/yfnhanced-mcp.git
cd yfnhanced-mcp
npm install
npm run build      # emits dist/ from src/ via tsc
```

For a fast edit loop use `npm run dev` (`tsx watch src/index.ts`). To exercise the
built server over a real stdio MCP handshake, run `npm run build` and then
`node test-mcp-client.js`.

## Verification gate

Run these commands **in this order** before opening a pull request. Every one of
them must pass:

```bash
npm run lint          # eslint .
npm run typecheck     # tsc --noEmit (src only)
npm run build         # tsc emits dist/
npm test              # deterministic Jest suite (no market data needed)
npm run test:coverage # Jest with the 85% coverage gate
```

Ordering matters: the `tests/e2e/` suites and the protocol checks inside
`tests/chaos/` spawn `dist/index.js`, so `npm run build` must run before
`npm test` or those suites fail with "Server build not found".

`npm run test:live` runs only the `*.live.test.ts` files, which call the real
Yahoo Finance endpoint. They are excluded from `npm test` and from CI because an
unauthenticated third-party API cannot be a reproducible gate; run them by hand
when you change a data path.

## Coverage

Coverage is enforced globally at **85%** for branches, functions, lines, and
statements (`jest.config.js`). `npm run test:coverage` fails below that threshold.
New code needs tests to keep the gate green.

## Test layers

There are four layers. `npm test` runs every deterministic one; the live-network files
are held back for `npm run test:live` (narrow any run with `npx jest <path>`):

- **unit** (`tests/unit/`) — drive the real exported functions and classes with a fake
  upstream at the seam the code actually calls. `jest.mock`-ing a namespace function
  that `src/` never invokes is how this layer accumulated 44 red suites.
- **integration** (`tests/integration/`) — mock the service or `yahoo-finance2`;
  middleware integration uses the real classes.
- **e2e** (`tests/e2e/`) — spawn the built server and speak JSON-RPC over stdio.
  Protocol checks (handshake, `tools/list`, `prompts/list`, `resources/templates/list`,
  error envelopes) need no market data; anything that reads live quotes lives in a
  `*.live.test.ts` file. Requires `npm run build`.
- **chaos** (`tests/chaos/`) — failure injection **in process** against the real
  resilience stack. A stub in the Jest process cannot reach a spawned child, so faults
  are injected through the fake `yahooFinanceInstance` seam, not `global.fetch`. Each
  file keeps one spawned-server protocol block, which does require `npm run build`.

**Resilience features need chaos tests.** If you touch or add cache, circuit
breaker, rate limiter, retry, or security behavior, add or update a chaos test that
exercises the failure path — not just the happy path.

## Code style

Rules that actually bind edits to `src/`:

- **ESM everywhere.** The package is `"type": "module"`. Every relative import uses
  a `.js` specifier (e.g. `import { x } from './foo.js'`), even though the source
  files are `.ts`.
- **Named exports only.** No default exports anywhere in `src/`.
- **Never write to stdout.** stdout is the MCP protocol channel (JSON-RPC). Any
  diagnostic output goes to `console.error`. A stray `console.log` corrupts the
  protocol stream and breaks clients.
- Lint enforces type-aware rules on `src/**/*.ts` (`no-floating-promises`,
  `no-misused-promises`, `strict-boolean-expressions`, `explicit-function-return-type`,
  `eqeqeq`, and others). There is no Prettier gate; match the surrounding style.
- Import shared zod schemas from `src/schemas/index.js` (the barrel), not from
  individual schema files.

## Documentation contract (AGENTS.md)

This repo uses a nested `AGENTS.md` documentation contract. Each folder's
`AGENTS.md` is a binding work contract describing what the code actually does.

- Read the root `AGENTS.md` and every `AGENTS.md` along the path to the files you
  touch **before** editing.
- If your change affects a contract — purpose, scope, module layout, startup
  ordering, required inputs/outputs, permissions, side effects, or user-facing
  behavior — update the nearest owning `AGENTS.md` in the same pull request, and
  refresh any affected Child DOX Index.
- Do not rely on memory; re-read the applicable chain in your current session.

See the root [`AGENTS.md`](./AGENTS.md) for the full rules.

## Pull requests

- Base branch is **`master`**. Open your PR against `master`.
- Keep the change focused. Fill in the PR template: summary, linked issue, what
  changed, the verification commands you actually ran with their results, whether
  you updated the docs/`AGENTS.md`, and whether the change needs a chaos test.
- CI runs lint, typecheck, the full test suite, and the coverage gate on pushes and
  PRs to `master`. Make it green locally first with the gate above.

## Reporting issues

Use the issue templates under `.github/ISSUE_TEMPLATE/`. This server calls a live
third-party API (Yahoo Finance) that rate-limits, so please include your package
version, Node version, OS, MCP client, the failing tool, and the exact error output.
See [`SECURITY.md`](./SECURITY.md) for how to report a vulnerability privately.
