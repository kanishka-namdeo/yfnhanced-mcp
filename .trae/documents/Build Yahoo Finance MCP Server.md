# Build Plan: Yahoo Finance MCP Server

## Phase 0: Create Common Context Document

Create `CODING_CONVENTIONS.md` with coding standards, naming conventions, error handling patterns, and architectural guidelines that all subagents must follow.

## Phase 1: Project Configuration & Setup (Agent 1 - system-architect)

* Create `package.json` with latest compatible dependencies

* Create `tsconfig.json` with strict TypeScript settings

* Create `eslint.config.mjs` with ESLint configuration

* Create `jest.config.js` for testing setup

* Create `.gitignore` and other config files

## Phase 2: Core Infrastructure (Agent 2 - fullstack-dev-backend)

* Create `src/index.ts` - Main MCP server entry point

* Create `src/utils/logger.ts` - Structured logging utility

* Create `src/utils/rate-limiter.ts` - Rate limiting with exponential backoff

* Create `src/utils/cache.ts` - Response caching layer

* Create `src/utils/formatting.ts` - Data formatting utilities

* Create `src/types/index.ts` - Shared TypeScript types

## Phase 3: Schemas & Validation (Agent 3 - spec-parser-dev)

* Create all Zod schemas in `src/schemas/`:

  * `quotes.ts`, `historical.ts`, `financials.ts`, `earnings.ts`

  * `analysis.ts`, `news.ts`, `holders.ts`, `options.ts`

  * `crypto.ts`, `screener.ts`, `index.ts`

* Add runtime validation for all inputs/outputs

## Phase 4: Quote Tools Implementation (Agent 4 - fullstack-dev-backend)

* Create `src/tools/quotes.ts` - Real-time quote tools

* Create `src/tools/summary.ts` - Company summary tools

* Implement caching and rate limiting

## Phase 5: Historical Data Tools (Agent 5 - fullstack-dev-backend)

* Create `src/tools/historical.ts` - Historical price data

* Create `src/tools/dividends.ts` - Dividend history

* Create `src/tools/splits.ts` - Stock split history

## Phase 6: Financial Statements Tools (Agent 6 - fullstack-dev-backend)

* Create `src/tools/financials.ts` - Balance sheet, income statement, cash flow

## Phase 7: Earnings Tools (Agent 7 - fullstack-dev-backend)

* Create `src/tools/earnings.ts` - Earnings history and estimates

* Create `src/tools/earnings-calendar.ts` - Earnings calendar

## Phase 8: Analysis Tools (Agent 8 - fullstack-dev-backend)

* Create `src/tools/analysis.ts` - Analyst ratings and targets

* Create `src/tools/recommendations.ts` - Related tickers

## Phase 9: Holder Tools (Agent 9 - fullstack-dev-backend)

* Create `src/tools/holders.ts` - Institutional and insider holdings

## Phase 10: News Tools (Agent 10 - fullstack-dev-backend)

* Create `src/tools/news.ts` - Company and market news

## Phase 11: Options Tools (Agent 11 - fullstack-dev-backend)

* Create `src/tools/options.ts` - Options chain data

## Phase 12: Crypto & Forex Tools (Agent 12 - fullstack-dev-backend)

* Create `src/tools/crypto.ts` - Cryptocurrency data

* Create `src/tools/forex.ts` - Forex exchange rates

## Phase 13: Screener & Trending (Agent 13 - fullstack-dev-backend)

* Create `src/tools/screener.ts` - Stock screener

* Create `src/tools/trending.ts` - Trending stocks

## Phase 14: Resources & Prompts (Agent 14 - mcp-protocol-expert)

* Create `src/resources/templates.ts` - Resource templates

* Create `src/prompts/financial.ts` - Pre-defined prompts

## Phase 15: Testing (Agent 15 - mcp-tester)

* Create comprehensive unit tests for all tools

* Create integration tests

* Achieve >80% test coverage

## Phase 16: Build & Validation (Agent 16 - devops-engineer)

* Run TypeScript compilation

* Run ESLint and fix issues

* Run tests

* Generate production build

## Coordination Strategy

* Agents will work in parallel on non-conflicting files

* CODING\_CONVENTIONS.md ensures consistency across all agents

* Each agent will use unique file paths

* Main server integration happens in Phase 16

## Dependencies (Latest Compatible Versions)

* `@modelcontextprotocol/sdk`: ^1.25.2

* `yahoo-finance2`: ^2.14.2

* `zod`: ^4.0.0

* `typescript`: ^5.7.2

* `@typescript-eslint/*`: ^8.48.1

* `jest`: ^29.7.0

* `ts-jest`: ^29.2.5

* `tsx`: ^4.16.5

