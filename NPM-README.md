<p align="center">
  <img src="https://raw.githubusercontent.com/kanishka-namdeo/yfnhanced-mcp/master/assets/banner.svg" alt="yfnhanced-mcp — enterprise-grade Yahoo Finance data for AI agents" width="100%">
</p>

# yfnhanced-mcp

A [Model Context Protocol](https://modelcontextprotocol.io/) server that gives AI assistants financial data from Yahoo Finance, wrapped in the resilience patterns you would expect from a service: a circuit breaker, adaptive rate limiting, jittered retry, and a stale-while-revalidate cache.

Every response carries a data-quality report, so a model can tell "market closed" apart from "the upstream call quietly returned nothing."

17 tools · 6 prompts · 6 resources · TypeScript · no API key · no database

> Yahoo Finance has no public API and rate-limits aggressively. This server is built to degrade honestly rather than pretend. Read [Data availability](#data-availability) before you build on it.

---

## Install

```bash
npm install -g yfnhanced-mcp
```

### Claude Desktop

Add to `claude_desktop_config.json` and restart:

```json
{
  "mcpServers": {
    "yfnhanced": {
      "command": "npx",
      "args": ["-y", "yfnhanced-mcp"]
    }
  }
}
```

The same block works for Cursor, Cline, Windsurf, and any other MCP client that launches a stdio server.

<details>
<summary><strong>A note on the two binary names</strong></summary>

The package installs two names for the same stdio server: `y-finance-mcp` and `yfnhanced-mcp`. They are the identical entry point, so pick whichever reads better in your client config. The `npx` form above uses the package name rather than a binary name, which keeps it working if an alias is ever dropped.

</details>

---

## Tools

**Quotes and history** — `get_quote` (up to 50 symbols), `get_quote_summary`, `get_historical_prices`, `get_historical_prices_multi`

**Fundamentals** — `get_balance_sheet`, `get_income_statement`, `get_cash_flow_statement`, `get_earnings`, `get_analysis`, `get_major_holders`, `get_summary_profile`

**Markets and sentiment** — `get_news`, `get_options` (with Black-Scholes Greeks), `get_trending_symbols`, `screener`, `get_crypto_quote`, `get_forex_quote`

**Prompts** — `analyze_stock`, `compare_stocks`, `financial_health_check`, `earnings_analysis`, `market_overview`, `portfolio_due_diligence`

**Resources** — `ticker://{symbol}/` then `quote`, `profile`, `financials`, `historical`, `news`, `analysis`

---

## Configuration

Environment variables are the only configuration that takes effect today. Names are `YF_MCP_` plus the upper-cased config path.

| Variable | Default |
|---|---|
| `YF_MCP_RATE_LIMIT_REQUESTS_PER_MINUTE` | `60` |
| `YF_MCP_CACHE_TTL_QUOTES` | `60000` |
| `YF_MCP_CACHE_MAX_CACHE_SIZE` | `1000` |
| `YF_MCP_CIRCUIT_BREAKER_FAILURE_THRESHOLD` | `5` |
| `YF_MCP_CIRCUIT_BREAKER_SUCCESS_THRESHOLD` | `3` |
| `YF_MCP_RETRY_MAX_RETRIES` | `3` |
| `YF_MCP_RETRY_BASE_DELAY` | `1000` |
| `YF_MCP_CONFIG_PATH` | `./config.json` |

```bash
YF_MCP_RATE_LIMIT_REQUESTS_PER_MINUTE=30 npx -y yfnhanced-mcp
```

> **Known defect:** `config.json` is parsed and validated, then overwritten by defaults, so file values have no effect. `.yaml` is unsupported. Use environment variables.

---

## Data availability

| Area | Status |
|---|---|
| Quotes, OHLCV, earnings, analysts, holders, news, options | Real data, subject to rate limits |
| Financial statements | Works, but validation can reject some symbols |
| `get_crypto_quote`, `get_forex_quote` | **Registered but stubbed** — hardcoded values, no network call |
| Batch size | 50 symbols maximum |
| Transport | stdio only |

---

## Documentation

- [README](https://github.com/kanishka-namdeo/yfnhanced-mcp#readme) — architecture, diagrams, and the full picture
- [Tools reference](https://github.com/kanishka-namdeo/yfnhanced-mcp/blob/master/docs/TOOLS.md)
- [Usage guide](https://github.com/kanishka-namdeo/yfnhanced-mcp/blob/master/docs/USAGE_GUIDE.md)
- [Configuration](https://github.com/kanishka-namdeo/yfnhanced-mcp/blob/master/docs/CONFIGURATION.md)
- [Architecture](https://github.com/kanishka-namdeo/yfnhanced-mcp/blob/master/docs/ARCHITECTURE.md)
- [Data verification](https://github.com/kanishka-namdeo/yfnhanced-mcp/blob/master/docs/DATA_VERIFICATION.md)
- [Source](https://github.com/kanishka-namdeo/yfnhanced-mcp) · [Issues](https://github.com/kanishka-namdeo/yfnhanced-mcp/issues)

## License

MIT © [Kanishka Namdeo](https://github.com/kanishka-namdeo)

*Not affiliated with, or endorsed by, Yahoo Inc.*
