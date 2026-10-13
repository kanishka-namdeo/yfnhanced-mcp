# docs

## Purpose

Long-form design documents for humans: architecture narrative, tool reference, configuration reference, data availability truth tables, client usage.

## Ownership

- `ARCHITECTURE.md` — resilience mechanism narrative (rate limiter, circuit breaker, retry, cache), data-quality and security design, a project-structure map, and four fenced `mermaid` diagrams: system layers, data-call lifecycle, circuit breaker state machine, and startup ordering.
- `TOOLS.md` — per-tool parameters and returns, each with a `Location:` pointer to a source file.
- `CONFIGURATION.md` — `config.json` reference: loading order (`:21-27`) and the environment variable table (`:463-471`).
- `DATA_VERIFICATION.md` — per-tool and per-field availability, the single source of truth for "does this value actually come back"; `README.md:176` points readers here.
- `USAGE_GUIDE.md` — client integration, examples, troubleshooting.
- Tool registry truth lives in `src/tools/AGENTS.md`; runtime config truth lives in `src/config/AGENTS.md`. Prose here defers to those and to `src/`.

## Local Contracts

- The `package.json` `files` whitelist (`dist`, `README.md`, `LICENSE`) keeps this folder out of the npm package; nothing in it ships. Links from `NPM-README.md` must resolve on GitHub, not in the tarball.
- Verified drift against code, to correct whenever these docs are next edited rather than silently inherited:
  - `ARCHITECTURE.md` references `src/config/schema.ts`, `src/prompts/analyze_stock.ts` and `src/prompts/compare_stocks.ts`, `src/tools/market.ts`, and `src/utils/data-quality.ts`. None of these files exist; the real equivalents are `src/config/validation.ts`, no prompts module at all (`src/prompts/` was deleted 2026-10-13 and the six live prompts are inline in `src/server.ts`), `src/tools/summary.ts`, and `src/utils/data-completion.ts`.
  - `TOOLS.md:438` and `:470` place trending and screener in `src/tools/market.ts`; they are implemented in `src/tools/summary.ts` and registered in `registerTools` in `src/server.ts`. `TOOLS.md:525` and `:544` place crypto and forex quotes in `src/tools/quotes.ts`; they are routed to `summaryTools` from `registerTools` in `src/server.ts`.
  - `get_historical_prices` and `get_historical_prices_multi` became callable on 2026-10-13, so `TOOLS.md` is now accurate about them. `get_summary_profile` is callable yet still absent from `TOOLS.md`.
  - Tool-count claims still disagree: the registry exposes 17, `TOOLS.md` lists 16, and `CONFIG-README.md` plus the frozen reports carry older numbers. `README.md` and `assets/banner.svg` both state 17.
  - The env table at `CONFIGURATION.md:463-471` lists `RATE_LIMIT_RPM`, `RATE_LIMIT_RPH`, `CACHE_TTL_QUOTES`, `CACHE_MAX_SIZE`, `CIRCUIT_BREAKER_FAILURE_THRESHOLD`, `SERVER_LOG_LEVEL`, `SERVER_TRANSPORT`. The loader only honors names prefixed `YF_MCP_` (`src/config/index.ts:10`), and `logging.*` plus transport are not read at all, so no documented variable works as written. `docker-compose.yml:13-14` uses a third set (`LOG_LEVEL`, `MCP_TRANSPORT`) that is equally unread.
  - `CONFIGURATION.md:21` states all settings are validated at startup using Zod. Validation is real and fatal, but file values are overwritten before validation — see `src/config/AGENTS.md`.
  - `ARCHITECTURE.md` and `assets/diagrams/architecture.svg` draw one `src/index.ts` box that both defines the server and starts the process. Since 2026-10-13 that is two modules: `src/index.ts` is the shebanged entry and `src/server.ts` holds `MCPServer`. `USAGE_GUIDE.md` and `TOOLS.md` still cite `src/index.ts` for registry behavior, which now lives in `src/server.ts`.
- `DATA_VERIFICATION.md` marks tools as working (for example `:32`, `:74`, `:537-550`) while `TEST_REPORT.md:24` and `COMPREHENSIVE_TEST_REPORT.md:20-25` record failures. Both reports are frozen 2026-01-18 snapshots and are not a verification source; neither settles the question.

## Work Guidance

- One fact, one home: availability in `DATA_VERIFICATION.md`, parameters in `TOOLS.md`, config semantics in `CONFIGURATION.md`, mechanism narrative in `ARCHITECTURE.md`, integration in `USAGE_GUIDE.md`.
- Keep `Location:` pointers aimed at files that exist; a pointer to a renamed module is how this folder accumulated drift.
- `CONFIG-README.md` at the repository root duplicates and extends `CONFIGURATION.md` with sections on queue, data completion, capabilities, fallback, and network. Prefer changing the narrower doc and reconciling the two rather than editing one alone.

## Verification

None. No markdown lint, link check, or documentation build exists, and no CI step in `.github/workflows/` touches this folder.

## Child DOX Index

None. This folder is a leaf.
