# Yahoo Finance MCP Server

A Model Context Protocol (MCP) server providing comprehensive financial data from Yahoo Finance API. Get real-time stock quotes, historical data, earnings reports, analyst recommendations, news, options chains, and more.

## Features

- 📊 **Real-time Stock Quotes**: Current prices, market cap, volume, and more
- 📈 **Historical Data**: Daily OHLCV data with customizable date ranges
- 💰 **Earnings Reports**: Historical earnings, estimates, and surprise analysis
- 🎯 **Analyst Analysis**: Recommendations, target prices, and trend analysis
- 📰 **Company News**: Latest news articles with relevance scoring
- 📋 **Options Chains**: Complete options data with Greeks calculations
- 💳 **Financial Statements**: Balance sheet, income statement, cash flow
- 👥 **Holder Data**: Institutional and insider ownership information
- 🪙 **Crypto & Forex**: Cryptocurrency and forex quotes
- 🚀 **Trending Data**: Market movers and trending symbols
- 🔒 **Resilience**: Rate limiting, caching, circuit breaker, retry logic
- ⚡ **Performance**: Request queuing and concurrent request management

## Installation

### Prerequisites

- Node.js >= 18.0.0
- npm >= 9.0.0

### Setup

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the project:
   ```bash
   npm run build
   ```

4. (Optional) Create a configuration file:
   ```bash
   cp config.json.example config.json
   # or
   cp config.yaml.example config.yaml
   ```

5. Start the server:
   ```bash
   npm start
   ```

## Configuration

Create a `config.json` or `config.yaml` file in the project root. Configuration files are loaded in this priority:
1. `config.json`
2. `config.yaml`
3. Default values

### Key Configuration Options

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
  "server": {
    "transport": "stdio",
    "logLevel": "info"
  },
  "yahooFinance": {
    "timeoutMs": 30000,
    "maxConcurrentRequests": 5
  }
}
```

For detailed configuration options, see [README.config.md](./README.config.md).

## Available Tools

### Stock Quotes

#### `get_quote`

Fetch real-time stock quotes with data quality reporting and caching.

**Parameters:**
- `symbols` (required): Array of stock symbols (e.g., `["AAPL", "MSFT", "GOOGL"]`)
- `fields` (optional): Specific fields to retrieve
- `forceRefresh` (optional): Force refresh from API (default: `false`)
- `timeout` (optional): Request timeout in milliseconds (100-60000)

**Example:**
```json
{
  "symbols": ["AAPL", "MSFT", "GOOGL"],
  "forceRefresh": true
}
```

**Response:**
```json
{
  "results": {
    "AAPL": {
      "data": {
        "price": 178.72,
        "change": 2.34,
        "changePercent": 1.33,
        "volume": 52345678,
        "marketCap": 2800000000000
      },
      "meta": {
        "fromCache": false,
        "dataAge": 150,
        "completenessScore": 95,
        "warnings": []
      }
    }
  }
}
```

#### `get_quote_summary`

Get comprehensive quote summary with data quality analysis and fallback strategies.

**Parameters:**
- `symbol` (required): Stock symbol (e.g., `"AAPL"`)
- `modules` (optional): Data modules to retrieve
- `retryOnFailure` (optional): Retry with alternative modules on failure (default: `false`)

**Example:**
```json
{
  "symbol": "AAPL",
  "retryOnFailure": true
}
```

### Historical Data

#### `get_historical`

Fetch historical price data with customizable date ranges and intervals.

**Parameters:**
- `symbol` (required): Stock symbol
- `period` (optional): Time period (`1d`, `5d`, `1mo`, `3mo`, `6mo`, `1y`, `2y`, `5y`, `max`)
- `interval` (optional): Data interval (`1m`, `2m`, `5m`, `15m`, `30m`, `60m`, `90m`, `1h`, `1d`, `5d`, `1wk`, `1mo`, `3mo`)
- `startDate` (optional): Start date (YYYY-MM-DD)
- `endDate` (optional): End date (YYYY-MM-DD)
- `includePrePost` (optional): Include pre/post market data

**Example:**
```json
{
  "symbol": "AAPL",
  "period": "1y",
  "interval": "1d"
}
```

### Earnings Data

#### `get_earnings`

Fetch earnings data including historical earnings, estimates, and surprise analysis.

**Parameters:**
- `symbol` (required): Stock symbol
- `limit` (optional): Maximum number of historical quarters (default: 12, max: 20)
- `includeEstimates` (optional): Include earnings estimates (default: `true`)

**Example:**
```json
{
  "symbol": "AAPL",
  "limit": 8,
  "includeEstimates": true
}
```

### Analyst Analysis

#### `get_analysis`

Fetch analyst recommendations, target prices, and trend analysis.

**Parameters:**
- `symbol` (required): Stock symbol
- `includeExpired` (optional): Include expired analyst recommendations (default: `false`)

**Example:**
```json
{
  "symbol": "AAPL",
  "includeExpired": false
}
```

### Company News

#### `get_news`

Fetch latest news articles for a stock symbol with relevance scoring.

**Parameters:**
- `symbol` (required): Stock symbol
- `count` (optional): Number of articles (default: 10, max: 50)
- `requireRelated` (optional): Only return related news (default: `false`)

**Example:**
```json
{
  "symbol": "AAPL",
  "count": 5
}
```

### Options Data

#### `get_options`

Fetch options chain data with Greeks calculations and expiration filtering.

**Parameters:**
- `symbol` (required): Stock symbol
- `expiration` (optional): Options expiration date (YYYY-MM-DD format)
- `includeGreeks` (optional): Include Greeks calculations (default: `true`)
- `strikeFilter` (optional): Filter options by strike price or ITM/OTM status

**Example:**
```json
{
  "symbol": "AAPL",
  "expiration": "2025-02-21",
  "includeGreeks": true,
  "strikeFilter": {
    "inTheMoneyOnly": false
  }
}
```

### Financial Statements

#### `get_balance_sheet`

Fetch balance sheet data for a company.

**Parameters:**
- `symbol` (required): Stock symbol
- `period` (optional): `annual` or `quarterly` (default: `annual`)
- `limit` (optional): Number of periods (1-10)

**Example:**
```json
{
  "symbol": "AAPL",
  "period": "quarterly",
  "limit": 4
}
```

#### `get_income_statement`

Fetch income statement data for a company.

**Parameters:**
- `symbol` (required): Stock symbol
- `period` (optional): `annual` or `quarterly` (default: `annual`)
- `limit` (optional): Number of periods (1-10)

**Example:**
```json
{
  "symbol": "AAPL",
  "period": "annual",
  "limit": 3
}
```

#### `get_cash_flow_statement`

Fetch cash flow statement data for a company.

**Parameters:**
- `symbol` (required): Stock symbol
- `period` (optional): `annual` or `quarterly` (default: `annual`)
- `limit` (optional): Number of periods (1-10)

**Example:**
```json
{
  "symbol": "AAPL",
  "period": "quarterly"
}
```

### Holder Data

#### `get_major_holders`

Retrieve major holders information including institutional ownership, fund holders, insider transactions, and direct holders.

**Parameters:**
- `symbol` (required): Stock symbol
- `includeChangeHistory` (optional): Include historical change tracking (default: `false`)

**Example:**
```json
{
  "symbol": "AAPL",
  "includeChangeHistory": true
}
```

### Company Profile

#### `get_summary_profile`

Get comprehensive company summary with financial metrics, business summary, and key statistics.

**Parameters:**
- `symbol` (required): Stock symbol

**Example:**
```json
{
  "symbol": "AAPL"
}
```

### Cryptocurrency & Forex

#### `get_crypto_quote`

Fetch cryptocurrency quotes.

**Parameters:**
- `symbols` (optional): Array of crypto symbols (e.g., `["BTC-USD", "ETH-USD"]`)

**Example:**
```json
{
  "symbols": ["BTC-USD", "ETH-USD", "SOL-USD"]
}
```

#### `get_forex_quote`

Fetch foreign exchange rates.

**Parameters:**
- `pairs` (optional): Array of forex pairs (e.g., `["EUR-USD", "GBP-USD"]`)

**Example:**
```json
{
  "pairs": ["EUR-USD", "GBP-USD", "JPY-USD"]
}
```

### Market Data

#### `get_trending_symbols`

Get trending stocks and cryptocurrency data.

**Parameters:**
- `region` (optional): Market region (e.g., `"US"`, `"EU"`, `"ASIA"`)
- `count` (optional): Number of trending items

**Example:**
```json
{
  "region": "US",
  "count": 10
}
```

#### `screener`

Stock screener for filtering stocks based on criteria.

**Parameters:**
- `region` (optional): Region filter
- `sector` (optional): Sector filter
- `marketCap` (optional): Market cap range filter
- `dividendYield` (optional): Dividend yield filter
- `peRatio` (optional): P/E ratio filter

**Example:**
```json
{
  "sector": "Technology",
  "marketCap": { "min": 10000000000 }
}
```

## Available Resources

Resources provide structured access to financial data using URI patterns:

- `ticker://{symbol}/quote` - Current quote data
- `ticker://{symbol}/profile` - Company profile
- `ticker://{symbol}/financials` - Financial statements
- `ticker://{symbol}/historical` - Historical prices
- `ticker://{symbol}/news` - Company news
- `ticker://{symbol}/analysis` - Analyst analysis

**Example usage:**
```
ticker://AAPL/quote
ticker://MSFT/profile
ticker://GOOGL/financials
```

## Available Prompts

Pre-built prompts for common financial analysis tasks:

### `analyze_stock`

Perform comprehensive stock analysis including financials, earnings, and analyst recommendations.

**Parameters:**
- `symbol` (required): Stock symbol
- `include_recommendations` (optional): Include analyst recommendations

**Example:**
```json
{
  "symbol": "AAPL",
  "include_recommendations": true
}
```

### `compare_stocks`

Compare multiple stocks across key metrics.

**Parameters:**
- `symbols` (required): Comma-separated stock symbols
- `metrics` (optional): Metrics to compare (e.g., `"P/E, market cap, revenue"`)

**Example:**
```json
{
  "symbols": "AAPL,MSFT,GOOGL",
  "metrics": "P/E, market cap, revenue, PEG ratio"
}
```

### `financial_health_check`

Assess financial health of a company using key ratios.

**Parameters:**
- `symbol` (required): Stock symbol

**Example:**
```json
{
  "symbol": "AAPL"
}
```

### `earnings_analysis`

Analyze earnings history and trends.

**Parameters:**
- `symbol` (required): Stock symbol
- `quarters` (optional): Number of quarters to analyze

**Example:**
```json
{
  "symbol": "AAPL",
  "quarters": 8
}
```

### `market_overview`

Get market overview with trending stocks and indices.

**Parameters:**
- `region` (optional): Market region (e.g., `"US"`, `"EU"`, `"ASIA"`)

**Example:**
```json
{
  "region": "US"
}
```

### `portfolio_due_diligence`

Perform due diligence on a portfolio of stocks.

**Parameters:**
- `symbols` (required): Comma-separated stock symbols
- `risk_tolerance` (optional): Risk tolerance level (`"low"`, `"medium"`, `"high"`)

**Example:**
```json
{
  "symbols": "AAPL,MSFT,GOOGL,AMZN",
  "risk_tolerance": "medium"
}
```

## Usage with Claude Desktop

To use this MCP server with Claude Desktop:

1. **Build the server:**
   ```bash
   npm run build
   ```

2. **Configure Claude Desktop:**
   - Open Claude Desktop settings
   - Navigate to MCP Servers section
   - Add a new server with the following configuration:
   
   ```json
   {
     "mcpServers": {
       "yahoo-finance": {
         "command": "node",
         "args": ["D:\\path\\to\\y-finance-mcp\\dist\\index.js"],
         "cwd": "D:\\path\\to\\y-finance-mcp"
       }
     }
   }
   ```
   
   Replace paths with your actual installation directory.

3. **Restart Claude Desktop**

4. **Start using financial tools:**
   - Ask Claude: "What's the current price of AAPL?"
   - Ask Claude: "Analyze Apple's financial health"
   - Ask Claude: "Compare AAPL, MSFT, and GOOGL"

## Usage with MCP Inspector

Use the official MCP Inspector to test the server:

```bash
npx -y @modelcontextprotocol/inspector node dist/index.js
```

This will open a web interface to interact with all available tools and resources.

## Development

### Scripts

```bash
npm run dev        # Watch mode for development
npm run build      # Compile TypeScript
npm run start      # Start the server
npm run test       # Run tests
npm run lint       # Run linter
npm run lint:fix   # Fix linting issues
npm run typecheck  # Type checking
```

### Project Structure

```
src/
├── config/          # Configuration management
├── middleware/      # Rate limiting, caching, circuit breaker
├── services/        # Yahoo Finance API client
├── tools/           # MCP tool implementations
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
└── index.ts         # Server entry point
```

## Troubleshooting

### Server won't start

**Issue**: `require is not defined in ES module scope`

**Solution**: Ensure you've built the project with `npm run build` before starting.

### Rate limiting errors

**Symptoms**: Frequent 429 errors or slow responses

**Solutions**:
1. Reduce `requestsPerMinute` in config
2. Enable caching (default: enabled)
3. Increase cache TTL values

### Empty data responses

**Symptoms**: Tools return empty data fields

**Solutions**:
1. Check if the symbol is valid
2. Yahoo Finance may have rate limited your requests
3. Try `forceRefresh: true` parameter
4. Check network connectivity

### Connection timeouts

**Symptoms**: Requests timeout after 30 seconds

**Solutions**:
1. Increase `timeoutMs` in config
2. Check network connectivity
3. Reduce concurrent requests

## Performance Features

### Caching

The server implements intelligent caching to reduce API calls and improve response times:
- **Quote cache**: 60 seconds TTL
- **Historical cache**: 1 hour TTL
- **Financials cache**: 24 hours TTL
- **News cache**: 5 minutes TTL

### Rate Limiting

Token bucket algorithm prevents API abuse:
- Configurable requests per minute/hour
- Automatic backoff on rate limit
- Burst allowance for short spikes

### Circuit Breaker

Prevents cascading failures:
- Opens after configurable failure threshold
- Half-open state for testing recovery
- Automatic reset after timeout

### Retry Logic

Handles transient failures:
- Exponential backoff with jitter
- Configurable retry attempts
- Retry for specific HTTP codes (429, 500, 502, 503, 504)

## Data Quality

All responses include metadata:
```json
{
  "data": { ... },
  "meta": {
    "fromCache": false,
    "dataAge": 150,
    "completenessScore": 95,
    "warnings": []
  }
}
```

- `fromCache`: Whether data came from cache
- `dataAge`: Age of data in seconds
- `completenessScore`: Data completeness (0-100)
- `warnings`: Array of quality warnings

## License

MIT

## Support

- [Yahoo Finance API](https://finance.yahoo.com/)
- [MCP Protocol Documentation](https://modelcontextprotocol.io/)
- [Issue Tracker](https://github.com/your-repo/issues)

## Contributing

Contributions welcome! Please ensure:
- Code passes TypeScript compilation
- Linting passes
- Tests are added for new features
- Documentation is updated
