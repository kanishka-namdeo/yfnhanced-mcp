# Build Plan: Production-Ready Yahoo Finance MCP Server

## Overview
Build a defensive, resilient MCP server for Yahoo Finance data addressing rate limiting, API instability, missing data, and reliability issues.

## Latest Compatible Packages
- **@modelcontextprotocol/sdk**: ^1.25.2 (v2 is pre-alpha, use v1.x for production)
- **yahoo-finance2**: ^3.11.2 (latest stable)
- **zod**: ^4.0.0 (14x faster parsing, released Aug 2025)
- **typescript**: ^5.7.0 (latest stable)
- **tsx**: ^4.19.0 (modern TypeScript execution)
- **jest**: ^29.7.0 with ts-jest
- **@typescript-eslint/eslint-plugin**: ^8.0.0 with ESLint 9.x
- **winston**: ^3.15.0 (production logging)

---

## Phase 1: Create Coding Consistency Document
**Agent: documentation-expert**

Create `.trae/CODING_STANDARDS.md` with:
- Code style conventions (no comments unless requested)
- TypeScript strict mode requirements
- Error handling patterns
- File naming conventions
- Import/export patterns
- Testing conventions
- Documentation standards

---

## Phase 2: Project Foundation (Parallel Tasks)

### Task 2.1: Project Configuration
**Agent: devops-engineer**

Create:
- `package.json` with all dependencies and scripts
- `tsconfig.json` with strict settings (strictNullChecks, strictFunctionTypes)
- `eslint.config.mjs` with strict TypeScript rules
- `jest.config.js` with coverage thresholds (>85%)
- `.gitignore`
- `Dockerfile` for containerization
- `docker-compose.yml` for local development

### Task 2.2: Configuration Management System
**Agent: fullstack-dev-backend**

Create configuration layer:
- `src/config/index.ts` - Main config loader
- `src/config/defaults.ts` - Default values
- `src/config/validation.ts` - Zod schemas for config
- Environment variable support (YF_MCP_ prefix)
- Configuration file support (JSON/YAML)

---

## Phase 3: Core Infrastructure (Parallel Tasks)

### Task 3.1: Type Definitions
**Agent: type-generator**

Create comprehensive type system:
- `src/types/mcp.ts` - MCP-specific types
- `src/types/yahoo-finance.ts` - Yahoo Finance extensions
- `src/types/errors.ts` - Custom error types
- `src/types/config.ts` - Configuration types
- `src/types/middleware.ts` - Middleware types

### Task 3.2: Error Handling System
**Agent: fullstack-dev-backend**

Implement error classification:
- `src/utils/error-classifier.ts` - Classify error types
- `src/types/errors.ts` implementation
- YahooFinanceError class with codes:
  - YF_ERR_RATE_LIMIT, YF_ERR_API_CHANGED, YF_ERR_DATA_UNAVAILABLE
  - YF_ERR_SYMBOL_NOT_FOUND, YF_ERR_NETWORK, YF_ERR_TIMEOUT
  - YF_ERR_SERVER, YF_ERR_DATA_INCOMPLETE, YF_ERR_CIRCUIT_OPEN

### Task 3.3: Schemas & Validation
**Agent: spec-parser-dev**

Create Zod schemas:
- `src/schemas/index.ts` - Re-export all schemas
- `src/schemas/quotes.ts` - Quote validation
- `src/schemas/historical.ts` - Historical data validation
- `src/schemas/financials.ts` - Financial statement validation
- `src/schemas/errors.ts` - Error schemas

---

## Phase 4: Middleware Layer (Parallel Tasks)

### Task 4.1: Rate Limiter
**Agent: fullstack-dev-backend**

Implement intelligent rate limiting:
- `src/middleware/rate-limiter.ts`
- Token bucket algorithm
- Adaptive rate limiting (2000-2500 req/hour default)
- Endpoint-specific limits
- Predictive throttling
- Graceful degradation to cached data

### Task 4.2: Circuit Breaker
**Agent: fullstack-dev-backend**

Implement circuit breaker pattern:
- `src/middleware/circuit-breaker.ts`
- States: Closed, Open, Half-Open
- Failure threshold: 5 consecutive failures
- Reset timeout: 60 seconds
- Automatic recovery testing

### Task 4.3: Retry Logic
**Agent: fullstack-dev-backend**

Implement exponential backoff:
- `src/middleware/retry.ts`
- Max retries: 3
- Base delay: 1000ms, Max delay: 30000ms
- Jitter to prevent thundering herd
- Retry on 429, 5xx, network errors

### Task 4.4: Multi-Tier Cache
**Agent: fullstack-dev-backend**

Implement caching system:
- `src/middleware/cache.ts`
- In-memory LRU cache
- TTL: quotes (1min), historical (1hr), financials (24hr), news (5min)
- Stale-while-revalidate pattern
- Cache invalidation on errors

---

## Phase 5: Yahoo Finance Integration (Parallel Tasks)

### Task 5.1: Yahoo Finance Client Wrapper
**Agent: fullstack-dev-backend**

Create defensive wrapper:
- `src/services/yahoo-finance.ts`
- Wraps yahoo-finance2 library
- Integrates all middleware
- Validates results
- Handles API changes gracefully

### Task 5.2: Data Quality Reporter
**Agent: fullstack-dev-backend**

Implement quality tracking:
- `src/utils/data-completion.ts`
- Completeness score calculation
- Missing field detection
- Data age tracking
- Warning generation

### Task 5.3: Data Aggregator
**Agent: fullstack-dev-backend**

Create multi-source aggregation:
- `src/services/data-aggregator.ts`
- Combine data from multiple endpoints
- Fallback strategies
- Field-level completion

---

## Phase 6: MCP Tools Implementation (Parallel Tasks)

### Task 6.1: Quote Tools
**Agent: mcp-protocol-expert**

Implement quote tools:
- `src/tools/quotes.ts` - get_quote, get_quote_summary
- Batch processing with graceful degradation
- Data freshness indicators
- Cache fallback

### Task 6.2: Historical Data Tools
**Agent: mcp-protocol-expert**

Implement historical tools:
- `src/tools/historical.ts` - get_historical_prices, get_historical_prices_multi
- Data integrity validation
- Gap detection
- Multi-ticker processing

### Task 6.3: Financial Statement Tools
**Agent: mcp-protocol-expert**

Implement financials tools:
- `src/tools/financials.ts` - get_balance_sheet, get_income_statement
- Field availability reporting
- Frequency (annual/quarterly) support
- Data recency tracking

### Task 6.4: Earnings & Analysis Tools
**Agent: mcp-protocol-expert**

Implement earnings/analysis:
- `src/tools/earnings.ts` - get_earnings
- `src/tools/analysis.ts` - get_analysis
- Surprise tracking
- Analyst count reporting

### Task 6.5: Holder, News, Options Tools
**Agent: mcp-protocol-expert**

Implement:
- `src/tools/holders.ts` - get_major_holders
- `src/tools/news.ts` - get_company_news
- `src/tools/options.ts` - get_options
- Change tracking, URL verification

### Task 6.6: Summary, Crypto, Screener Tools
**Agent: mcp-protocol-expert**

Implement:
- `src/tools/summary.ts` - get_summary_profile
- `src/tools/crypto.ts` - get_crypto_quote, get_forex_quote
- `src/tools/screener.ts` - screener, get_trending_symbols

---

## Phase 7: MCP Server Core (Parallel Tasks)

### Task 7.1: MCP Server Setup
**Agent: mcp-protocol-expert**

Create server foundation:
- `src/index.ts` - Main entry point with graceful shutdown
- Tool registration
- Resource registration
- Prompt registration
- Transport configuration (stdio/HTTP)

### Task 7.2: Resources Implementation
**Agent: mcp-protocol-expert**

Implement resources:
- `src/resources/templates.ts`
- ticker://{symbol}/quote, profile, financials, historical, news, analysis
- Built-in caching and TTL

### Task 7.3: Prompts Implementation
**Agent: mcp-protocol-expert**

Implement prompts:
- `src/prompts/financial.ts`
- analyze_stock, compare_stocks, financial_health_check
- earnings_analysis, market_overview, portfolio_due_diligence

---

## Phase 8: Testing (Parallel Tasks)

### Task 8.1: Unit Tests
**Agent: mcp-tester**

Create comprehensive unit tests:
- All middleware components
- Error classification
- Data validation
- Configuration loading
- Target: >90% coverage

### Task 8.2: Integration Tests
**Agent: mcp-tester**

Create integration tests:
- Tool execution with mock Yahoo Finance
- Rate limiting behavior
- Circuit breaker transitions
- Cache operations
- Target: >80% coverage

### Task 8.3: E2E & Chaos Tests
**Agent: mcp-tester**

Create advanced tests:
- Load testing under rate limits
- Network failure simulation
- Timeout scenarios
- Recovery testing

---

## Phase 9: Utilities & Formatting

### Task 9.1: Utility Functions
**Agent: fullstack-dev-backend**

Create utilities:
- `src/utils/request-delayer.ts` - Dynamic pacing
- `src/utils/formatting.ts` - Data normalization
- Helper functions

---

## Phase 10: Documentation & Finalization

### Task 10.1: Documentation
**Agent: documentation-expert**

Create documentation:
- `README.md` - Setup, usage, troubleshooting
- API documentation for all tools
- Error code reference
- Migration guide from yfinance/yahoofinancer

### Task 10.2: Configuration Examples
**Agent: devops-engineer**

Create examples:
- `config.json.example`
- `config.yaml.example`
- Environment variable examples

### Task 10.3: Build & Verification
**Agent: devops-engineer**

Final tasks:
- Run linting (ESLint)
- Run type checking (tsc)
- Run all tests
- Generate coverage report
- Verify all requirements met

---

## Parallel Execution Strategy

### Batch 1 (Foundation) - Can run simultaneously:
- Coding standards document
- Project configuration
- Configuration management
- Type definitions
- Error handling system

### Batch 2 (Infrastructure) - After Batch 1:
- Schemas & validation
- All 4 middleware components (rate limiter, circuit breaker, retry, cache)

### Batch 3 (Integration) - After Batch 2:
- Yahoo Finance client wrapper
- Data quality reporter
- Data aggregator

### Batch 4 (Tools) - After Batch 3 (6 parallel streams):
- Quote tools
- Historical tools
- Financial statement tools
- Earnings & analysis tools
- Holder, news, options tools
- Summary, crypto, screener tools

### Batch 5 (Core) - After Batch 4:
- MCP server setup
- Resources implementation
- Prompts implementation

### Batch 6 (Testing) - After Batch 5:
- Unit tests
- Integration tests
- E2E & chaos tests

### Batch 7 (Finalization) - After Batch 6:
- Documentation
- Configuration examples
- Build & verification

---

## Success Criteria Verification
✓ All tools implement resilience patterns
✓ Rate limiting with 2000-2500 req/hour
✓ Circuit breaker with 5-failure threshold
✓ Exponential backoff retry (3 max)
✓ Multi-tier caching with appropriate TTLs
✓ Data quality metadata on all responses
✓ >90% unit test coverage
✓ >80% integration test coverage
✓ All error codes implemented
✓ Graceful degradation
✓ Clear, actionable error messages