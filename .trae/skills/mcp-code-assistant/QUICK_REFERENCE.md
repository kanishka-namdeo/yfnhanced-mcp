# Quick Reference - Yahoo Finance MCP Server

## Essential Commands

```bash
# Development
npm run dev              # Watch mode
npm run build            # Compile TypeScript
npm start                # Start server

# Quality Checks
npm run typecheck        # TypeScript validation
npm run lint            # ESLint
npm run lint:fix        # Auto-fix linting

# Testing
npm test                # All tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage report
```

## Project Structure

```
src/
├── config/           # Configuration management
├── middleware/       # Circuit breaker, cache, rate limiter, retry, security
├── prompts/          # Pre-built financial analysis prompts
├── schemas/          # Zod validation schemas
├── services/         # Yahoo Finance API client, data aggregator
├── tools/            # MCP tool implementations
├── types/            # TypeScript type definitions
├── utils/            # Data quality, formatting, security
└── index.ts          # Server entry point

tests/
├── unit/             # Component tests
├── integration/      # Integration tests
├── e2e/             # End-to-end tests
└── chaos/           # Chaos engineering tests
```

## Available Tools

**Market Data**
- `get_quote` - Real-time quotes
- `get_quote_summary` - Company overview
- `get_historical_prices` - OHLCV data
- `get_historical_prices_multi` - Batch historical

**Financial Analysis**
- `get_balance_sheet` - Assets, liabilities, equity
- `get_income_statement` - Revenue, expenses, net income
- `get_cash_flow_statement` - Cash flows
- `get_earnings` - Quarterly earnings

**Market Intelligence**
- `get_analysis` - Analyst recommendations
- `get_news` - Latest articles
- `get_major_holders` - Ownership data
- `get_options` - Options chains

**Screening**
- `screener` - Stock filtering
- `get_trending_symbols` - Top movers
- `get_summary_profile` - Company profile

**Cross-Asset**
- `get_crypto_quote` - Cryptocurrency prices
- `get_forex_quote` - Currency pairs

## Middleware Stack

1. **Rate Limiter** - Token bucket + adaptive throttling
2. **Retry** - Exponential backoff + jitter
3. **Circuit Breaker** - 3-state (Closed/Open/Half-Open)
4. **Cache** - Tiered TTL (60s/1h/24h)
5. **Security** - Input validation + output sanitization

## Key Configuration

```json
{
  "rateLimit": {
    "requestsPerMinute": 60,
    "requestsPerHour": 1500
  },
  "cache": {
    "ttlQuotes": 60000,
    "ttlHistorical": 3600000,
    "ttlFinancials": 86400000,
    "maxCacheSize": 1000
  },
  "circuitBreaker": {
    "failureThreshold": 5,
    "monitoringWindow": 60000,
    "successThreshold": 3
  }
}
```

## Common Patterns

### Tool Implementation

```typescript
import { z } from 'zod';

export const toolSchema = z.object({
  symbol: z.string().min(1).max(10)
});

export async function toolHandler(input: z.infer<typeof toolSchema>) {
  const data = await fetchData(input.symbol);
  const quality = DataQualityReporter.score(data);
  return { success: true, data, meta: quality };
}
```

### Error Handling

```typescript
try {
  const result = await apiCall();
  return { success: true, data: result };
} catch (error) {
  logger.error('API failure', { error });
  return { success: false, error: error.message };
}
```

### Adding New Tool

1. Create schema in `src/schemas/`
2. Implement in `src/tools/`
3. Register in `src/index.ts`
4. Write unit tests in `tests/unit/tools/`
5. Write integration tests in `tests/integration/tools/`
6. Update README.md

## Troubleshooting

**TypeScript errors**: Run `npm run typecheck`
**Linting errors**: Run `npm run lint:fix`
**Test failures**: Run `npm test -- --verbose`
**Runtime errors**: Check Winston logs
**Performance issues**: Check cache hit ratio and circuit breaker state

## Success Metrics

✅ TypeScript compilation passes
✅ All tests pass (unit, integration, e2e, chaos)
✅ ESLint passes without warnings
✅ Code coverage >95%
✅ Cache hit ratio >70%
✅ Circuit breaker opens <5% under normal load
