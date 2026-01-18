# Project Memory - Yahoo Finance MCP Server

## Project Overview

**Purpose**: Production-grade financial data infrastructure for AI assistants
**Tech Stack**: TypeScript, Node.js, MCP SDK, yahoo-finance2, Zod, Winston
**Key Differentiators**: Circuit breaker, multi-strategy rate limiting, data quality scoring, comprehensive testing (including chaos engineering)

## Architecture Patterns

### Middleware Stack Order

The middleware chain applies in this order (from outer to inner):

1. **Rate Limiter** - Controls request rate (token bucket + adaptive throttling)
2. **Retry** - Handles transient failures (exponential backoff + jitter)
3. **Circuit Breaker** - Prevents cascading failures (3-state: Closed → Open → Half-Open)
4. **Cache** - Serves cached data with tiered TTL strategy
5. **Security** - Input validation and output sanitization

### Data Flow

```
Tool Request
  ↓
Rate Limiter (check token bucket)
  ↓
Retry Wrapper (with backoff)
  ↓
Circuit Breaker (check state)
  ↓
Cache (check if data exists and fresh)
  ↓
Yahoo Finance API (if cache miss)
  ↓
Data Quality Reporter (score completeness/integrity)
  ↓
Tool Response (with metadata)
```

## Configuration Hierarchy

1. **defaults.ts** - Default values for all configuration options
2. **config.json / config.yaml** - User-provided configuration (optional)
3. **Environment variables** - Override configuration values
4. **validation.ts** - Ensures all configuration is valid before use

## Testing Strategy

### Test Categories

**Unit Tests** (`tests/unit/`)
- Test individual components in isolation
- Mock external dependencies (yahoo-finance2)
- Focus on logic, not integration
- Target: 95%+ coverage

**Integration Tests** (`tests/integration/`)
- Test tool and resource workflows
- Verify middleware chain behavior
- Test error handling and recovery
- Validate schema compliance

**End-to-End Tests** (`tests/e2e/`)
- Complete user journey tests
- MCP Inspector compatibility
- Configuration-driven behavior
- Performance benchmarks

**Chaos Tests** (`tests/chaos/`)
- Network failures (timeouts, connection resets)
- API changes (breaking schema changes)
- Partial data (missing fields, null values)
- Rate limit scenarios (burst traffic)
- Circuit breaker behavior
- Timeout handling

### Test Commands

```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode for development
npm run test:coverage     # Tests with coverage report
npm test -- <pattern>     # Run specific tests
```

## Code Conventions

### TypeScript

- Use strict mode (`strict: true` in tsconfig.json)
- Explicit return types for all functions
- Use `async/await` for async operations
- Avoid `any` type; use `unknown` with type guards if needed
- Use interfaces for object shapes, types for unions/primitives

### Naming

- **Files**: kebab-case (e.g., `circuit-breaker.ts`)
- **Functions**: camelCase (e.g., `getCircuitBreakerState`)
- **Classes**: PascalCase (e.g., `CircuitBreaker`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `DEFAULT_TTL`)
- **Types**: PascalCase with suffix (e.g., `ConfigType`, `ToolHandler`)

### Error Handling

```typescript
try {
  const result = await apiCall();
  return { success: true, data: result };
} catch (error) {
  if (error instanceof NetworkError) {
    return { success: false, error: 'Network timeout' };
  }
  logger.error('Unexpected error', { error, context });
  return { success: false, error: 'Internal server error' };
}
```

### Logging

```typescript
import { logger } from './logger';

logger.info('Tool execution started', { tool: 'get_quote', symbol });
logger.warn('Cache miss', { symbol, cacheKey });
logger.error('API failure', { error: error.message, statusCode });
logger.debug('Middleware state', { circuitBreaker: state });
```

## Common Patterns

### Tool Implementation Template

```typescript
import { z } from 'zod';
import { logger } from '../utils/logger';
import { DataQualityReporter } from '../utils/data-completion';

export const myToolSchema = z.object({
  symbol: z.string().min(1).max(10),
  // ... other fields
});

export async function myTool(input: z.infer<typeof myToolSchema>) {
  try {
    logger.info('Executing tool', { tool: 'my_tool', input });

    const data = await fetchData(input.symbol);

    const quality = DataQualityReporter.score(data);

    return {
      success: true,
      data,
      meta: {
        fromCache: false,
        dataAge: Date.now() - data.timestamp,
        ...quality
      }
    };
  } catch (error) {
    logger.error('Tool execution failed', { error, input });
    throw error;
  }
}
```

### Middleware Usage Pattern

```typescript
import { CircuitBreaker } from '../middleware/circuit-breaker';
import { Cache } from '../middleware/cache';
import { RateLimiter } from '../middleware/rate-limiter';
import { RetryWrapper } from '../middleware/retry';

const circuitBreaker = new CircuitBreaker(config);
const cache = new Cache(config);
const rateLimiter = new RateLimiter(config);
const retryWrapper = new RetryWrapper(config);

export async function fetchData(symbol: string) {
  await rateLimiter.acquire();
  
  return retryWrapper.execute(async () => {
    if (circuitBreaker.isOpen()) {
      throw new Error('Circuit breaker is open');
    }
    
    const cacheKey = `data:${symbol}`;
    const cached = await cache.get(cacheKey);
    if (cached) return cached;
    
    const result = await apiCall(symbol);
    await cache.set(cacheKey, result);
    
    return result;
  });
}
```

## Known Issues & Solutions

### Rate Limiting

**Issue**: Yahoo Finance API returns 429 errors
**Solution**: Token bucket rate limiter with adaptive throttling automatically adjusts limits based on API responses

### Data Quality

**Issue**: Incomplete or corrupted data from API
**Solution**: DataQualityReporter scores completeness (0-100) and validates integrity (high/low consistency, negative prices, etc.)

### Circuit Breaker False Positives

**Issue**: Circuit breaker opens too frequently during legitimate traffic
**Solution**: Adjust `failureThreshold` and `monitoringWindow` in config.json to match actual traffic patterns

### Cache Staleness

**Issue**: Stale data served when cache TTL is too high
**Solution**: Use tiered TTL (quotes: 60s, historical: 1h, financials: 24h) and implement force-refresh option

## Performance Benchmarks

### Target Metrics

- **Cold start**: <500ms
- **Quote query**: <200ms (cached), <1s (API)
- **Batch query**: <2s for 100 symbols
- **Cache hit ratio**: >70%
- **Circuit breaker opens**: <5% under normal load
- **Retry success rate**: >85% for transient failures

### Optimization Tips

1. Increase cache size for frequently accessed symbols
2. Use batch operations when possible
3. Adjust rate limiter to match API limits
4. Monitor circuit breaker state and adjust thresholds
5. Implement request batching for multiple symbols

## Dependencies

### Core Dependencies

- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `yahoo-finance2` - Yahoo Finance API client
- `zod` - Schema validation
- `winston` - Logging

### Dev Dependencies

- `typescript` - TypeScript compiler
- `jest` - Testing framework
- `ts-jest` - TypeScript Jest preset
- `@typescript-eslint/*` - ESLint TypeScript support
- `tsx` - TypeScript execution

## Development Workflow

1. **Feature development**
   - Create feature branch
   - Write tests first (TDD)
   - Implement feature
   - Run `npm run typecheck`, `npm run lint`, `npm test`
   - Update documentation

2. **Bug fixing**
   - Reproduce issue with test
   - Fix bug
   - Verify all tests pass
   - Add regression test if needed

3. **Code review**
   - Check TypeScript compilation
   - Run linter
   - Review test coverage
   - Verify documentation

## Security Considerations

- Input validation for all tool inputs
- Output sanitization to remove sensitive data
- No hardcoded credentials
- Path traversal prevention in resource URIs
- Rate limiting to prevent abuse
- Secure error messages (no sensitive info)

## Deployment Checklist

- [ ] All tests pass (`npm test`)
- [ ] TypeScript compilation succeeds (`npm run build`)
- [ ] Linting passes (`npm run lint`)
- [ ] Coverage >95% (`npm run test:coverage`)
- [ ] Documentation updated
- [ ] Configuration validated
- [ ] Environment variables set
- [ ] Logging configured
- [ ] Circuit breaker thresholds reviewed
- [ ] Rate limiter configured for production
- [ ] Cache strategy appropriate for load
