# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## User Preferences

When the user requests a durable behavior change, record it here or in the relevant child AGENTS.md

- DOX contracts record what the code actually does, including where that contradicts `docs/`. Where behavior and prose disagree, the AGENTS.md states the behavior and flags the defect in one line; it does not restate the aspirational doc.
- Fixing the flagged defects is separate work, not implied by a doc edit.

## Project-Wide Contracts

- Package: `yfnhanced-mcp` v2.0.0, ESM (`"type": "module"`), Node >= 22.13, entry `dist/index.js` (the thin process entry `src/index.ts`, which carries the `#!/usr/bin/env node` shebang; `src/server.ts` holds the `MCPServer` class), bins `y-finance-mcp` and `yfnhanced-mcp`. The shebang is not decoration: without it npm emits a bin shim that `exec`s the JS file with no interpreter, so `npx -y yfnhanced-mcp` exited silently until 2026-10-13. Runtime deps are only `@modelcontextprotocol/sdk` ^1.32.1, `yahoo-finance2` ^4.0.3, and `zod` ^4.6.7 — `winston` was deleted on 2026-10-13 because nothing in `src/` ever imported it. The Node floor is forced by the two majors that raised theirs (`yahoo-finance2` >=22, `eslint` ^20.19 || ^22.13 || >=24), so `engines`, the CI matrix, and the Docker base all move together. npm already serves 1.0.1, so a publish of 2.0.0 still needs its own approval.
- Verification gate for any source change: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, `npm run test:coverage`. Measured 2026-10-14: all five pass. Lint is 0 errors with 21 warnings (`complexity`, `max-lines-per-function`, `max-depth` — `--max-warnings` is deliberately not set, so they cannot fail a run); typecheck and build are clean; `npm test` is 56 suites / 2112 tests green with 55 live-network tests filtered out by name; `npm run test:coverage` passes the 85% gate at 98.05% statements and 95.15% branches. `npm run test:live` passes its 55 cases against real Yahoo and needs both a build and network, so it is not wired into CI or release.
- The 810-error / 44-red-suite baseline that this file carried through 2026-10-13 is gone: `src/` was typed at the Yahoo boundary instead of cast through `any`, and `tests/` was rewritten against the exports that actually exist rather than the ones the tests imagined. Re-measure before quoting any count here; the numbers above are a snapshot of this tree.
- Trust the runtime check over the suite. The strongest signal is: `npm run build`, `npm pack`, install the tarball into an empty directory, and drive `node_modules/.bin/yfnhanced-mcp` over stdio — that is what catches a missing shebang, a bad start guard, and a bin shim with no interpreter, none of which Jest or ESLint can see. `node test-mcp-client.js` covers the handshake only. On 2026-10-13 all 17 tools were diffed against the pre-change build over live Yahoo through real stdio JSON-RPC: identical success and failure flags, identical payload shapes, the only differences being live price drift.
- 17 tools, 6 prompts, and 6 resource templates are registered by `src/server.ts`. The count appears in `GITHUB-README.md`, `NPM-README.md`, `assets/banner.svg`, and `assets/terminal/demo.svg`; a registration change must update all four. `src/server.ts` handles `resources/templates/list` explicitly — until 2026-10-13 it did not, so that request returned JSON-RPC `-32601 Method not found`.
- Root-owned surface with no child doc: `package.json` scripts, `tsconfig.json`, `eslint.config.mjs`, `babel.config.js` (dead), `jest.config.js`, `Dockerfile`, `docker-compose.yml`, `.gitignore`, `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`, the `*-README.md` variants, and the two frozen `*_REPORT.md` snapshots.
- `README.md` is a generated swap target: `npm run readme:npm` copies `NPM-README.md` over it, `npm run readme:github` copies `GITHUB-README.md` over it. Never hand-edit `README.md`; edit the variant. Both scripts shell out to `node -e` with `fs.copyFileSync`, so they run on any platform.
- `COMPREHENSIVE_TEST_REPORT.md` and `TEST_REPORT.md` are frozen snapshots dated 2026-01-18. They are not a verification source and their counts do not match the current suite; do not cite them as test status.
- `LICENSE` is MIT, `Copyright (c) 2026 Kanishka Namdeo`, matching `package.json` `license` and `author`. The author field deliberately carries no email; do not add one.
- `assets/` holds every human-facing image and `scripts/` holds the Node ESM utilities that rasterize and check them. Neither ships to npm, because `package.json` `files` is a `dist`/`README.md`/`LICENSE` whitelist.
- Packaging is controlled by `package.json` `files` alone; `.npmignore` was deleted on 2026-10-13 because the whitelist made it dead config (its `dist/*.map` and `*.md` exclusions never took effect). npm unconditionally ships any root file named `README*` or `LICENSE*` no matter what `files` says, which is why the variants are `NPM-README.md`, `GITHUB-README.md`, and `CONFIG-README.md` rather than `README.*.md`: the leading-name rule is the only exclusion that works, and a `README.` prefix would publish them. The tarball is `dist` (js, d.ts, and maps) plus `README.md` and `LICENSE`; `dist/` is gitignored.

## Child DOX Index

Root owns the rail, packaging surface, and repo-wide gates. Children own their subtree details.

- `src/AGENTS.md` — server runtime code: module layout, startup ordering, stdio logging rule, lint/type strictness that binds edits.
- `src/config/AGENTS.md` — config loading and validation, including the precedence defect that makes config files inert.
- `src/tools/AGENTS.md` — MCP tool handler modules and the registry contract with `src/index.ts`.
- `src/services/AGENTS.md` — the Yahoo Finance boundary, middleware composition, and graceful-degradation policy.
- `src/middleware/AGENTS.md` — cache, circuit breaker, rate limiter, retry, security wrappers and their state machines.
- `src/schemas/AGENTS.md` — zod input/output schema conventions and the `schemas/index.ts` barrel rule.
- `src/utils/AGENTS.md` — stateless validators, error classifier taxonomy, data-quality scoring.
- `src/types/AGENTS.md` — type-only contracts, error class rules, and the duplicate-config-type hazard.
- `docs/AGENTS.md` — the five durable design docs, their ownership, and known drift against code.
- `tests/AGENTS.md` — suite layout, commands, coverage gate, and mocking policy across all layers.
- `tests/e2e/AGENTS.md` — spawned-server end-to-end tests and their build dependency.
- `tests/chaos/AGENTS.md` — failure-injection tests and the process-boundary limits of their mocks.
- `.github/AGENTS.md` — CI and release workflows, job gates, and runner portability defects.
- `assets/AGENTS.md` — the visual identity system: palette, type stacks, geometry, size budgets, the SVG-vs-mermaid split, and ownership of `scripts/`.

Folders with no child doc are owned by the nearest parent above them: `scripts/` is governed by `assets/AGENTS.md`, and `tests/unit`, `tests/integration`, `tests/fixtures` are governed by `tests/AGENTS.md`. `src/prompts/` was deleted on 2026-10-13 — its 988-line module was never wired into the server, and the six live prompts are inline in `src/index.ts`.
