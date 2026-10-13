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

- Package: `yfnhanced-mcp` v1.0.0, ESM (`"type": "module"`), Node >= 18, entry `dist/index.js`, bin `y-finance-mcp`. Runtime deps are only `@modelcontextprotocol/sdk`, `yahoo-finance2`, `zod`, `winston`.
- Verification gate for any source change: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` (see `AGENTS.md` under `.github/` for what CI actually runs, and the build-ordering defect there).
- Root-owned surface with no child doc: `package.json` scripts, `tsconfig.json`, `eslint.config.mjs`, `babel.config.js` (dead), `jest.config.js`, `Dockerfile`, `docker-compose.yml`, `.gitignore`, `.npmignore`, the `README*.md` variants, and the two frozen `*_REPORT.md` snapshots.
- `README.md` is a generated swap target: `npm run readme:npm` copies `README.npm.md` over it, `npm run readme:github` copies `README.github.md` over it. Never hand-edit `README.md`; edit the variant. Both scripts use the Windows `copy` command and fail on Linux runners.
- `COMPREHENSIVE_TEST_REPORT.md` and `TEST_REPORT.md` are frozen snapshots dated 2026-01-18. They are not a verification source and their counts do not match the current suite; do not cite them as test status.
- No `LICENSE` file exists although `package.json` `files` lists it and `README.md` asserts MIT. `package.json` `author` is still the placeholder `Your Name <your.email@example.com>`.
- `docs/` and every `*.md` except `README.md` are excluded from the npm package by `.npmignore`; `dist/` is gitignored.

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

Folders with no child doc are owned by the nearest parent above them: `src/prompts/` is orphaned (see `src/AGENTS.md`), and `tests/unit`, `tests/integration`, `tests/fixtures` are governed by `tests/AGENTS.md`.
