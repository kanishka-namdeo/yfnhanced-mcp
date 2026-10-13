# src/tools

## Purpose

One module per financial data domain. Each turns validated MCP tool arguments into a domain payload by calling `src/services/`, and shapes what a client sees.

## Ownership

- This folder owns handler behavior, per-domain normalization, `meta` reporting, and any module-level cache it creates.
- `src/index.ts` owns the registry: `toolHandlers.set(...)` at `:273-287` and the `ListToolsRequestSchema` definitions starting at `:290`. A tool that exists here but is not wired there is not callable, and vice versa.
- `src/services/` owns the network call and its retries; `src/schemas/` owns the zod contracts referenced here.

## Local Contracts

- Callable tools are exactly these 17 names, all snake_case: `get_quote`, `get_quote_summary` (`quotes.ts:122`, `:271`), `get_historical_prices`, `get_historical_prices_multi` (`historical.ts:227`, `:321`), `get_earnings` (`earnings.ts:94`), `get_analysis` (`analysis.ts:104`), `get_major_holders` (`holders.ts:451`), `get_news` (`news.ts:261`), `get_options` (`options.ts:528`), `get_balance_sheet` / `get_income_statement` / `get_cash_flow_statement` (`financials.ts:684`, `:711`, `:744`), `get_summary_profile` / `get_crypto_quote` / `get_forex_quote` / `get_trending_symbols` / `screener` (`summary.ts:83`, `:141`, `:185`, `:227`, `:264`).
- Canonical handler shape, in this order: `XxxInputSchema.parse(args)` → `InputValidator.validateSymbol(...)` → service call → normalize and build `meta` → `XxxOutputSchema.parse(output)`. See `news.ts:264-307`, `holders.ts:454-524`, `options.ts:531-587`, `financials.ts:687-708`.
- Handlers return a plain object. `src/index.ts:578` wraps it as `content: [{ type: 'text', text: JSON.stringify(sanitized, null, 2) }]`. `earnings.ts:152` and `analysis.ts` still pre-wrap their own `content` array, so routed through `index.ts:574` they double-wrap. `historical.ts` was corrected to return plain objects on 2026-10-13 when it was wired up. Match the caller, do not "fix" one side alone.
- `meta` is part of the contract: `fromCache`, `dataAge`, `completenessScore` (`.min(0).max(1)`), `warnings[]`; `options.ts` and `holders.ts` add `dataSource` and `lastUpdated`.
- Partial or empty data degrades, it does not fail: emit `warnings` and a lower `completenessScore` (`holders.ts:410-427`, `news.ts:196-244`, `quotes.ts:479-505`). Batch tools collect per-symbol `errors[]` and continue (`quotes.ts:143-152`, `summary.ts:166`).
- Errors thrown here are `YahooFinanceError` with a `YF_ERR_*` code and a mandatory `suggestedAction` (`src/types/errors.ts:46`). `classifyError` is not called in this folder; classification belongs to services and middleware.
- Every module with a module-level cache must export `clearXxxCache()`, because `src/index.ts:936-939` calls exactly `clearFinancialsCache`, `clearNewsCache`, `clearOptionsCache`, `clearHoldersCache` during shutdown. A new cache without one survives restart in the same process.
- Known deviations, keep them deliberate rather than accidental: `summary.ts` aggregates five endpoints, declares zod schemas locally and unexported (`:46-70`), throws bare `Error` (`:137`, `:260`, `:312`), and its crypto/forex fetchers return hardcoded stubs (`:316-365`). `options.ts` has no pagination; it substitutes the nearest expiration (`:421-434`) and computes Black-Scholes Greeks (`:130`). `financials.ts` holds a cache singleton (`:682`) and falls back annual → quarterly.
- Dead by contract, do not treat as live: `getFinancialsToolDefinitions` (`financials.ts:777`), `getOptionsToolDefinitions` (`options.ts:590`), `getHoldersToolDefinitions` (`holders.ts:527`), `getNewsToolDefinitions` (`news.ts:310`) are imported at `src/index.ts:29-38` and never called; only `SummaryTools.getTools()` (`summary.ts:515`) is consumed, at `:551`.
- `HistoricalTools` (`historical.ts:138`) is constructed in `registerTools` and dispatched through the shared map as of 2026-10-13. It must not self-register: its constructor used to call `server.setRequestHandler` for both `ListToolsRequestSchema` and `CallToolRequestSchema`, which would have silently replaced the server's own handlers and broken every other tool. `EarningsTools` and `AnalysisTools` still self-register via `server.setRequestHandler` (`earnings.ts:52`, `analysis.ts:68`) while `index.ts` already owns those schemas (`:289`, `:557`) — the SDK allows one handler per request schema, so a second registration path is a defect, not a feature.
- `docs/TOOLS.md` places `get_crypto_quote` in `quotes.ts` and `get_trending_symbols` in a nonexistent `market.ts`; the registry above is authoritative. `get_summary_profile` is callable but absent from `docs/TOOLS.md`.

## Work Guidance

- Import schemas from `../schemas/index.js` only; that barrel is the single re-export point.
- Symbol input must satisfy `InputValidator` after `.parse`: `/^[A-Z0-9.\-\^]+$/`, length 1-20, at most 50 unique symbols (`src/utils/security.ts:3-20`, `:62-86`). `securityMiddleware` enforces it again at `src/index.ts:567`.
- `get_quote` accepts up to 100 symbols in its advertised schema (`src/index.ts:297-303`) while `InputValidator` caps at 50 — inputs between 51 and 100 are rejected at runtime.
- Add a tool by doing both halves: `toolHandlers.set('<name>', ...)` in `registerTools` and a definition with the identical `name` in the `:290` array. A mismatch yields `Unknown tool` at `:571` or an invisible definition.

## Verification

- `npx jest tests/unit/tools` and `npx jest tests/integration/tools`
- `npm run typecheck`, `npm run lint`
- `npm run build && node test-mcp-client.js` to confirm a new tool appears in `tools/list`

## Child DOX Index

None. This folder is a leaf.
