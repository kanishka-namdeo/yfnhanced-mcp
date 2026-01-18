# Yahoo Finance MCP Server

Production-grade financial data infrastructure for AI assistants with enterprise-grade resilience, comprehensive data quality validation, and production-ready monitoring.

## Installation

```bash
npm install -g yfnhanced-mcp
```

## Quick Start

### Start Server

```bash
yfnhanced-mcp
```

### Claude Desktop Integration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "yfnhanced": {
      "command": "yfnhanced-mcp"
    }
  }
}
```

### Other AI Tools

**Cursor AI / Cline AI:**

```json
{
  "mcpServers": {
    "yfnhanced": {
      "command": "yfnhanced-mcp"
    }
  }
}
```

## Features

- **13+ Financial Data Tools**: Stocks, crypto, forex, company intelligence, market sentiment
- **Circuit Breaker Pattern**: Automatic recovery from API failures
- **Multi-Strategy Rate Limiting**: Token bucket + adaptive + per-endpoint limiting
- **Data Quality Scoring**: Completeness and integrity validation
- **Comprehensive Caching**: Graceful fallback with high cache hit ratio (70-90%)
- **Enterprise Testing**: Unit, integration, e2e, and chaos tests

## Available Tools

### Market Data
- `get_quote` - Real-time quotes with quality reporting
- `get_historical_prices` - OHLCV data with date ranges
- `get_historical_prices_multi` - Batch historical data

### Company Intelligence
- `get_quote_summary` - Comprehensive company overview
- `get_balance_sheet` - Assets, liabilities, equity
- `get_income_statement` - Revenue, expenses, net income
- `get_cash_flow_statement` - Operating, investing, financing cash flows
- `get_earnings` - Quarterly earnings with estimates
- `get_analysis` - Analyst recommendations and price targets
- `get_major_holders` - Institutional and insider ownership

### Market Sentiment
- `get_news` - Latest articles with relevance scoring
- `get_options` - Options chains with Greeks
- `get_trending_symbols` - Top movers with volume metrics
- `screener` - Filter stocks by 12+ criteria

### Cross-Asset
- `get_crypto_quote` - Cryptocurrency prices
- `get_forex_quote` - Currency pair exchange rates

## Documentation

For complete documentation including configuration, usage examples, architecture details, and best practices:

**[View Full Documentation on GitHub](https://github.com/kanishka-namdeo/yfnhanced-mcp)**

Documentation includes:
- [Complete Tool Reference](https://github.com/kanishka-namdeo/yfnhanced-mcp/blob/main/docs/TOOLS.md)
- [Usage Guide with Examples](https://github.com/kanishka-namdeo/yfnhanced-mcp/blob/main/docs/USAGE_GUIDE.md)
- [Configuration Guide](https://github.com/kanishka-namdeo/yfnhanced-mcp/blob/main/docs/CONFIGURATION.md)
- [Architecture Details](https://github.com/kanishka-namdeo/yfnhanced-mcp/blob/main/docs/ARCHITECTURE.md)
- [Data Verification Status](https://github.com/kanishka-namdeo/yfnhanced-mcp/blob/main/docs/DATA_VERIFICATION.md)

## Configuration

Create a `config.json` file:

```json
{
  "rateLimit": {
    "requestsPerMinute": 60,
    "requestsPerHour": 1500
  },
  "cache": {
    "ttlQuotes": 60000,
    "maxCacheSize": 1000
  },
  "circuitBreaker": {
    "failureThreshold": 5,
    "monitoringWindow": 60000,
    "successThreshold": 3
  }
}
```

For detailed configuration options, see the [Configuration Guide](https://github.com/your-username/y-finance-mcp/blob/main/docs/CONFIGURATION.md).

## Performance

| Metric | Value |
|--------|-------|
| Quote queries | 60 requests/minute (configurable) |
| Batch operations | Up to 100 symbols per request |
| Cache hit ratio | 70-90% for frequently accessed symbols |
| Cold start time | <500ms |
| Test coverage | 95%+ for core middleware |

## License

MIT

## Links

- [GitHub Repository](https://github.com/kanishka-namdeo/yfnhanced-mcp)
- [npm Package](https://www.npmjs.com/package/yfnhanced-mcp)
- [MCP Protocol](https://modelcontextprotocol.io/)
- [Report Issues](https://github.com/kanishka-namdeo/yfnhanced-mcp/issues)
