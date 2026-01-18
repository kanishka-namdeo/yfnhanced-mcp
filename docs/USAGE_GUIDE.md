# Usage Guide

Practical guide to using Yahoo Finance MCP Server in your applications.

## Table of Contents

- [Getting Started](#getting-started)
- [Basic Usage](#basic-usage)
- [Advanced Patterns](#advanced-patterns)
- [Real-World Examples](#real-world-examples)
- [Best Practices](#best-practices)
- [Troubleshooting](#troubleshooting)

---

## Getting Started

### Prerequisites

- Node.js 18+ installed
- Claude Desktop (or MCP-compatible client)
- Basic understanding of financial data concepts

### Installation

```bash
# Clone repository
git clone https://github.com/kanishka-namdeo/yfnhanced-mcp.git
cd yfnhanced-mcp

# Install dependencies
npm install

# Build TypeScript
npm run build

# Start server
npm start
```

### Claude Desktop Setup

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "yahoo-finance": {
      "command": "node",
      "args": ["D:\\path\\to\\yahoo-finance-mcp\\dist\\index.js"],
      "cwd": "D:\\path\\to\\yahoo-finance-mcp"
    }
  }
}
```

### Verifying Installation

1. Start the server: `npm start`
2. Open Claude Desktop
3. Ask: "Get the current price of AAPL"
4. Verify you receive a response with price data

---

## Basic Usage

### Getting Stock Quotes

**Request:**
```
Get the current price of AAPL, MSFT, and GOOGL
```

**Behind the scenes:**
```typescript
{
  "tool": "get_quote",
  "arguments": {
    "symbols": ["AAPL", "MSFT", "GOOGL"]
  }
}
```

**Response:**
```json
{
  "data": [
    {
      "symbol": "AAPL",
      "price": 178.72,
      "change": 2.35,
      "changePercent": 1.33,
      "volume": 52345678
    },
    {
      "symbol": "MSFT",
      "price": 378.91,
      "change": 5.42,
      "changePercent": 1.45,
      "volume": 22123456
    },
    {
      "symbol": "GOOGL",
      "price": 141.80,
      "change": -0.52,
      "changePercent": -0.37,
      "volume": 18923456
    }
  ],
  "meta": {
    "fromCache": false,
    "dataAge": 150,
    "completenessScore": 95,
    "warnings": []
  }
}
```

---

### Getting Historical Prices

**Request:**
```
Get Apple's historical prices for the past year
```

**Behind the scenes:**
```typescript
{
  "tool": "get_historical_prices",
  "arguments": {
    "symbol": "AAPL",
    "startDate": "2023-01-01",
    "endDate": "2024-01-01",
    "interval": "1d"
  }
}
```

**Response:**
```json
{
  "data": [
    {
      "date": "2023-01-03",
      "open": 125.07,
      "high": 128.19,
      "low": 124.26,
      "close": 126.36,
      "adjClose": 125.94,
      "volume": 89161000
    }
    // ... more data points
  ],
  "meta": {
    "gaps": 0,
    "splits": 0,
    "integrityChecks": [
      {
        "type": "VALID",
        "message": "Price data is consistent"
      }
    ]
  }
}
```

---

### Getting Company Profile

**Request:**
```
Tell me about Apple Inc.
```

**Behind the scenes:**
```typescript
{
  "tool": "get_quote_summary",
  "arguments": {
    "symbol": "AAPL"
  }
}
```

**Response:**
```json
{
  "data": {
    "assetProfile": {
      "companyName": "Apple Inc.",
      "sector": "Technology",
      "industry": "Consumer Electronics",
      "fullTimeEmployees": 164000,
      "city": "Cupertino",
      "country": "United States",
      "website": "https://www.apple.com"
    }
  }
}
```

---

### Getting Earnings Data

**Request:**
```
What are Apple's recent earnings?
```

**Behind the scenes:**
```typescript
{
  "tool": "get_earnings",
  "arguments": {
    "symbol": "AAPL"
  }
}
```

**Response:**
```json
{
  "data": {
    "quarterly": [
      {
        "date": "2024-01-25",
        "actual": 2.18,
        "estimate": 2.10,
        "surprise": 0.08,
        "surprisePercent": 3.81,
        "epsActual": 2.18,
        "epsEstimate": 2.10
      }
    ],
    "estimate": {
      "date": "2024-04-25",
      "epsEstimate": 1.52
    }
  }
}
```

---

## Advanced Patterns

### Batch Processing

**Scenario:** Get quotes for 100 stocks

**Approach:**
```
Get quotes for AAPL, MSFT, GOOGL, AMZN, META, TSLA, NVDA, JPM, V, JNJ, ...
```

**Benefits:**
- Single API call instead of 100 individual calls
- Faster response time
- Lower rate limit consumption
- Consistent data timestamps

---

### Data Quality Assessment

**Scenario:** Check if data is reliable

**Approach:**
```
Get the current price of AAPL and tell me about the data quality
```

**Response includes:**
```json
{
  "meta": {
    "fromCache": false,
    "dataAge": 150,
    "completenessScore": 95,
    "warnings": []
  }
}
```

**Interpretation:**
- `fromCache: false` - Fresh from API
- `dataAge: 150` - 150ms old, very fresh
- `completenessScore: 95` - High quality, use confidently
- `warnings: []` - No issues detected

---

### Error Handling

**Scenario:** Handle rate limits gracefully

**Approach:**
The server automatically handles rate limits:
1. Circuit breaker opens after 50% failure rate
2. Retry logic with exponential backoff
3. Cache fallback when API unavailable

**User experience:**
- Transparent error recovery
- Stale data served if API is down
- Clear error messages with recommendations

---

## Real-World Examples

### Investment Research Platform

**Scenario:** Build a portfolio screener

**Step 1:** Screen stocks
```
Screen for technology stocks with market cap over $1B and P/E under 30
```

**Step 2:** Get financials for top 20
```
Get the income statements for these 20 stocks
```

**Step 3:** Get earnings data
```
Get the earnings data for these 20 stocks
```

**Step 4:** Get analyst ratings
```
Get the analyst ratings for these 20 stocks
```

**Result:** Comprehensive analysis of 20 technology stocks

---

### Algorithmic Trading System

**Scenario:** Monitor real-time quotes and execute trades

**Step 1:** Get real-time quotes
```
Get the current prices of AAPL, MSFT, GOOGL, AMZN, META
```

**Step 2:** Calculate indicators
```
Calculate the 20-day moving average for these stocks
```

**Step 3:** Check conditions
```
If price crosses above 20-day moving average, buy
```

**Step 4:** Execute trade
```
Execute buy order for AAPL
```

**Benefits:**
- Real-time data with 60s cache
- Rate limiter prevents API bans
- Data quality validation prevents bad trades
- Metrics endpoint enables monitoring

---

### Financial AI Assistant

**Scenario:** Answer user questions about stocks

**User:** "How is Apple doing financially?"

**Step 1:** Get quote
```
Get the current price of AAPL
```

**Step 2:** Get financials
```
Get the income statement and balance sheet for AAPL
```

**Step 3:** Get earnings
```
Get the earnings data for AAPL
```

**Step 4:** Get analyst ratings
```
Get the analyst ratings for AAPL
```

**Response:**
"Apple is currently trading at $178.72 (+1.33%). The company has strong financial health with revenue of $383.29B and net income of $96.99B. Recent earnings beat estimates by 3.81%. Analysts have a Strong Buy rating with a target price of $185.00."

---

### Risk Management Tool

**Scenario:** Track institutional ownership changes

**Step 1:** Get major holders
```
Get the major holders for AAPL
```

**Step 2:** Monitor changes
```
Check if there are any significant changes in institutional ownership
```

**Step 3:** Get insider transactions
```
Get the insider transactions for AAPL
```

**Step 4:** Get analyst changes
```
Get the analyst rating trends for AAPL
```

**Result:** Comprehensive ownership and sentiment tracking

---

## Best Practices

### Performance

**1. Use Batch Requests**
```typescript
// Bad: Individual calls
for (const symbol of symbols) {
  await getQuote(symbol);
}

// Good: Batch call
await getQuote(symbols);
```

**2. Cache Aggressively**
```json
{
  "cache": {
    "ttlQuotes": 120000,
    "ttlHistorical": 7200000,
    "maxCacheSize": 5000
  }
}
```

**3. Monitor Cache Hit Ratio**
```typescript
const stats = await server.getStats();
console.log(stats.cache.hitRate);  // Target: 70-90%
```

---

### Data Quality

**1. Check Completeness Score**
```typescript
if (response.meta.completenessScore < 70) {
  console.warn('Data quality is low');
}
```

**2. Review Warnings**
```typescript
if (response.meta.warnings.length > 0) {
  console.warn('Warnings:', response.meta.warnings);
}
```

**3. Validate Data Freshness**
```typescript
if (response.meta.dataAge > 300000) {
  console.warn('Data is 5+ minutes old');
  await getQuote(symbols, { forceRefresh: true });
}
```

---

### Error Handling

**1. Use Pre-Built Prompts**
- `analyze_stock` - Comprehensive company analysis
- `compare_stocks` - Multi-stock comparison
- `financial_health_check` - Financial ratios
- `earnings_analysis` - Earnings trends

**2. Monitor Circuit Breaker**
```typescript
const stats = await server.getStats();
if (stats.circuitBreaker.state === 'OPEN') {
  console.warn('Circuit breaker is open');
}
```

**3. Handle Rate Limits**
```typescript
try {
  const data = await getQuote(symbols);
} catch (error) {
  if (error.code === 'RATE_LIMIT') {
    console.log('Rate limited, using cache');
    return getCachedData(symbols);
  }
}
```

---

### Security

**1. Validate Inputs**
```typescript
if (!/^[A-Z0-9.-]{1,10}$/i.test(symbol)) {
  throw new Error('Invalid symbol format');
}
```

**2. Sanitize Outputs**
```typescript
const sanitized = sanitizeResponse(data);
delete sanitized.password;
delete sanitized.apiKey;
```

**3. Use Environment Variables**
```bash
export API_KEY=your_api_key
npm start
```

---

## Troubleshooting

### Common Issues

**1. Circuit breaker opening frequently**

**Symptoms:**
- Requests failing frequently
- Circuit breaker state: OPEN

**Solutions:**
```typescript
// Check stats
const stats = await server.getStats();
console.log(stats.circuitBreaker);

// Adjust configuration
{
  "circuitBreaker": {
    "failureThreshold": 10,
    "monitoringWindow": 120000
  }
}
```

**2. Slow responses**

**Symptoms:**
- Requests taking >5 seconds
- High latency

**Solutions:**
```typescript
// Check cache hit ratio
const stats = await server.getStats();
console.log(stats.cache);

// Increase cache size
{
  "cache": {
    "maxCacheSize": 5000
  }
}
```

**3. Rate limit errors**

**Symptoms:**
- 429 errors despite rate limiting
- Requests failing

**Solutions:**
```typescript
// Check adaptive throttling
const stats = await server.getStats();
console.log(stats.rateLimiter.currentLimit);

// Reduce requests per minute
{
  "rateLimit": {
    "requestsPerMinute": 30
  }
}
```

---

### Getting Help

**1. Check Logs**
```bash
# View server logs
npm start

# Check for errors
grep ERROR logs/
```

**2. Run Tests**
```bash
npm test
npm run test:coverage
```

**3. Review Documentation**
- [TOOLS.md](TOOLS.md) - Tool reference
- [CONFIGURATION.md](CONFIGURATION.md) - Configuration guide
- [ARCHITECTURE.md](ARCHITECTURE.md) - Architecture details
- [DATA_VERIFICATION.md](DATA_VERIFICATION.md) - Data verification status

**4. Report Issues**
- [Issue Tracker](https://github.com/kanishka-namdeo/yfnhanced-mcp/issues)
- Include logs, configuration, and reproduction steps

---

### Debug Mode

Enable debug logging:

```json
{
  "server": {
    "logLevel": "debug"
  }
}
```

Or via environment variable:

```bash
export SERVER_LOG_LEVEL=debug
npm start
```

Debug logs include:
- Detailed request/response information
- Middleware state changes
- Cache operations
- Rate limiter activity

---

For more information on configuration, see [CONFIGURATION.md](CONFIGURATION.md).
