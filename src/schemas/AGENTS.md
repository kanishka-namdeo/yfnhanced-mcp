# src/schemas

## Purpose

Zod contracts for tool inputs and outputs, one file per domain, re-exported through a single barrel.

## Ownership

- This folder owns the shape a client may send and the shape a tool must return. Handlers own producing that shape; `src/tools/` owns when `.parse` is called.
- `src/config/validation.ts` owns startup config validation with its own `AppConfigSchema` and is not part of this barrel.

## Local Contracts

- Zod is `^4.0.0` (`package.json:57`). Use the v4 surface: `error.issues`, not `error.errors` (`src/index.ts:189`).
- Naming: `<Domain>InputSchema`, `<Domain>OutputSchema`, `<Domain>MetaSchema`, `<Domain>DataSchema`, plus entity schemas such as `QuoteResultSchema` and `HistoricalPriceSchema`.
- Idioms actually in use: `.optional()`, `.nullable()`, `.min(1).max(20)` on symbols, `z.enum([...])`, `.int().nonnegative()`, `z.record(z.string(), X)`, ISO date regex `/^\d{4}-\d{2}-\d{2}$/`, and `z.array(z.any())` escape hatches (`analysis.ts:41`, `earnings.ts:24`).
- Absent by convention, not by oversight: no `.strict()`, `.refine()`, `.superRefine()`, `.default()`, `.passthrough()`, `.catch()` anywhere in this folder, so unknown keys are stripped rather than rejected and no value is ever defaulted by zod.
- Every `*OutputSchema` repeats the same `meta` block (`fromCache`, `dataAge`, `completenessScore` bounded 0-1, `warnings`). Keep the copies in step until it is extracted; a divergent `meta` silently changes what clients may rely on.
- `schemas/index.ts` (64 lines) re-exports explicitly. Add the new schema to that file; `export *` is not used here.
- Dead exports to know before trusting a name: `tools/quotes.ts:12-111`, `summary.ts:46-84`, `analysis.ts:108`, `earnings.ts:99`, and `historical.ts:245` define inline duplicate schemas, which leaves `QuoteInputSchema`, `QuoteOutputSchema`, `HistoricalInputSchema`, `AnalysisInputSchema`, `EarningsInputSchema`, and `ErrorOutputSchema` (`errors.ts`, 17 lines) unused.
- `FinancialStatementSchema.startDate` is `.optional()`: `fundamentalsTimeSeries` reports only a period end, and the hardcoded empty string the producers used failed the ISO regex and made all three statement tools throw on every call. Fixed 2026-10-13 — do not reintroduce a required-but-absent date field.

## Work Guidance

- Schemas are shared between input and output validation on purpose: `FinancialsInputSchema.parse(args)` (`tools/financials.ts:687`) and `FinancialsOutputSchema.parse(output)` (`:708`), same pattern in `holders.ts` and `news.ts`, `options.ts`.
- Import from `../schemas/index.js` in tools, never from a domain file directly.
- Keep tool-facing identifiers snake_case where the payload is snake_case and camelCase where the config is camelCase; MCP envelope fields keep their wire names (`jsonrpc`, `params`).

## Verification

- `npx jest tests/unit/schemas`
- `npm run typecheck`
- No schema-only lint rule exists; `npm run lint` covers style only.

## Child DOX Index

None. This folder is a leaf.
