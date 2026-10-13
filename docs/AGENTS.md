# docs

## Purpose

Long-form design documents for humans: architecture narrative, tool reference, configuration reference, data availability truth tables, client usage.

## Ownership

- `ARCHITECTURE.md` — resilience mechanism narrative (rate limiter, circuit breaker, retry, cache), data-quality and security design, plus a project-structure map at `:487-546`.
- `TOOLS.md` — per-tool parameters and returns, each with a `Location:` pointer to a source file.
- `CONFIGURATION.md` — `config.json` reference: loading order (`:21-27`) and the environment variable table (`:463-471`).
- `DATA_VERIFICATION.md` — per-tool and per-field availability, the single source of truth for "does this value actually come back"; `README.md:176` points readers here.
- `USAGE_GUIDE.md` — client integration, examples, troubleshooting.
- Tool registry truth lives in `src/tools/AGENTS.md`; runtime config truth lives in `src/config/AGENTS.md`. Prose here defers to those and to `src/`.

## Local Contracts

- `.npmignore:12` excludes `docs/` and `:14-15` exclude every `*.md` except `README.md`, so nothing in this folder ships in the npm package. Links from `README.npm.md` must resolve on GitHub, not in the tarball.
- Verified drift against code, to correct whenever these docs are next edited rather than silently inherited:
  - `ARCHITECTURE.md` references `src/config/schema.ts` (`:493`), `src/prompts/analyze_stock.ts` and `src/prompts/compare_stocks.ts` (`:502-503`), `src/tools/market.ts` (`:527`), and `src/utils/data-quality.ts` (`:286`, `:536`). None of these files exist; the real equivalents are `src/config/validation.ts`, a single `src/prompts/financial.ts` (unwired), `src/tools/summary.ts`, and `src/utils/data-completion.ts`.
  - `TOOLS.md:438` and `:470` place trending and screener in `src/tools/market.ts`; they are implemented in `src/tools/summary.ts` and registered at `src/index.ts:286-287`. `TOOLS.md:525` and `:544` place crypto and forex quotes in `src/tools/quotes.ts`; they are `src/index.ts:284-285` routed to `summaryTools`.
  - `TOOLS.md` documents `get_historical_prices` (`:60-130`) as available, but `HistoricalTools` is never constructed, so that tool is not callable. `get_summary_profile` is callable yet absent here.
  - Tool-count claims disagree: `ARCHITECTURE.md:27` and `README.md:18` say "13+", `TOOLS.md` lists 16, the registry exposes 15.
  - The env table at `CONFIGURATION.md:463-471` lists `RATE_LIMIT_RPM`, `RATE_LIMIT_RPH`, `CACHE_TTL_QUOTES`, `CACHE_MAX_SIZE`, `CIRCUIT_BREAKER_FAILURE_THRESHOLD`, `SERVER_LOG_LEVEL`, `SERVER_TRANSPORT`. The loader only honors names prefixed `YF_MCP_` (`src/config/index.ts:10`), and `logging.*` plus transport are not read at all, so no documented variable works as written. `docker-compose.yml:13-14` uses a third set (`LOG_LEVEL`, `MCP_TRANSPORT`) that is equally unread.
  - `CONFIGURATION.md:21` states all settings are validated at startup using Zod. Validation is real and fatal, but file values are overwritten before validation — see `src/config/AGENTS.md`.
- `DATA_VERIFICATION.md` marks tools as working (for example `:32`, `:74`, `:537-550`) while `TEST_REPORT.md:24` and `COMPREHENSIVE_TEST_REPORT.md:20-25` record failures. Both reports are frozen 2026-01-18 snapshots and are not a verification source; neither settles the question.

## Work Guidance

- One fact, one home: availability in `DATA_VERIFICATION.md`, parameters in `TOOLS.md`, config semantics in `CONFIGURATION.md`, mechanism narrative in `ARCHITECTURE.md`, integration in `USAGE_GUIDE.md`.
- Keep `Location:` pointers aimed at files that exist; a pointer to a renamed module is how this folder accumulated drift.
- `README.config.md` at the repository root duplicates and extends `CONFIGURATION.md` with sections on queue, data completion, capabilities, fallback, and network. Prefer changing the narrower doc and reconciling the two rather than editing one alone.

## Verification

None. No markdown lint, link check, or documentation build exists, and no CI step in `.github/workflows/` touches this folder.

## Child DOX Index

None. This folder is a leaf.
