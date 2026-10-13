# Yahoo Finance MCP Server Configuration Guide

This document explains all configuration options available for the Yahoo Finance MCP Server. Configuration files can be provided in either JSON (`config.json`) or YAML (`config.yaml`) format.

## Table of Contents

- [Getting Started](#getting-started)
- [Rate Limiting](#rate-limiting)
- [Cache Configuration](#cache-configuration)
- [Retry Configuration](#retry-configuration)
- [Circuit Breaker](#circuit-breaker)
- [Queue Configuration](#queue-configuration)
- [Data Completion](#data-completion)
- [Server Configuration](#server-configuration)
- [Logging Configuration](#logging-configuration)
- [MCP Server Information](#mcp-server-information)
- [MCP Capabilities](#mcp-capabilities)
- [Security Configuration](#security-configuration)
- [Fallback Configuration](#fallback-configuration)
- [Yahoo Finance Configuration](#yahoo-finance-configuration)
- [Network Configuration](#network-configuration)
- [Configuration Examples](#configuration-examples)

## Getting Started

### Creating Your Configuration File

1. Copy one of the example files:
   ```bash
   cp config.json.example config.json
   # or
   cp config.yaml.example config.yaml
   ```

2. Adjust the values according to your needs

3. Place the configuration file in the project root directory

### Configuration Priority

The server looks for configuration files in the following order:
1. `config.json` (if present)
2. `config.yaml` (if present)
3. Default configuration values

## Rate Limiting

Rate limiting prevents API abuse and ensures fair usage of Yahoo Finance's services.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `requestsPerMinute` | number | 60 | Maximum requests allowed per minute |
| `requestsPerHour` | number | 1500 | Maximum requests allowed per hour |
| `burstLimit` | number | 5 | Maximum requests in a short burst |
| `backoffMultiplier` | number | 2 | Multiplier for exponential backoff |
| `maxBackoffSeconds` | number | 300 | Maximum backoff time in seconds |
| `retryCount` | number | 3 | Number of retries before giving up |
| `circuitBreakerThreshold` | number | 5 | Failures before circuit breaker opens |
| `circuitBreakerResetMs` | number | 60000 | Time in ms before circuit breaker resets |

### Recommended Values

**Development Environment:**
```json
{
  "rateLimit": {
    "requestsPerMinute": 30,
    "requestsPerHour": 500,
    "burstLimit": 3,
    "backoffMultiplier": 2,
    "maxBackoffSeconds": 60,
    "retryCount": 2
  }
}
```

**Production Environment:**
```json
{
  "rateLimit": {
    "requestsPerMinute": 60,
    "requestsPerHour": 1500,
    "burstLimit": 5,
    "backoffMultiplier": 2,
    "maxBackoffSeconds": 300,
    "retryCount": 3
  }
}
```

**High-Throughput Environment:**
```json
{
  "rateLimit": {
    "requestsPerMinute": 120,
    "requestsPerHour": 3000,
    "burstLimit": 10,
    "backoffMultiplier": 1.5,
    "maxBackoffSeconds": 600,
    "retryCount": 5
  }
}
```

### Understanding the Options

- **requestsPerMinute**: Controls the rate at which the server makes requests. Lower values reduce the risk of hitting API limits.
- **burstLimit**: Allows temporary spikes in request rate while maintaining overall limits.
- **backoffMultiplier**: Used when the server hits rate limits. A value of 2 means the delay doubles each time.
- **circuitBreakerThreshold**: When this many consecutive failures occur, the circuit breaker opens to prevent cascading failures.

## Cache Configuration

Caching reduces API calls and improves response times for frequently accessed data.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttlQuotes` | number | 60000 | Time to live for quote data (ms) |
| `ttlHistorical` | number | 3600000 | Time to live for historical data (ms) |
| `ttlFinancials` | number | 86400000 | Time to live for financial data (ms) |
| `ttlNews` | number | 300000 | Time to live for news data (ms) |
| `ttlAnalysis` | number | 3600000 | Time to live for analysis data (ms) |
| `maxCacheSize` | number | 1000 | Maximum number of cache entries |
| `cacheStrategy` | string | 'lru' | Cache eviction strategy |

### Cache Strategies

- **lru** (Least Recently Used): Evicts items that haven't been accessed for the longest time. Best for general use.
- **lfu** (Least Frequently Used): Evicts items accessed least frequently. Best for hot data patterns.
- **fifo** (First In, First Out): Evicts oldest items. Simple and predictable.

### Recommended Values

**Low-Memory Environment:**
```json
{
  "cache": {
    "ttlQuotes": 30000,
    "ttlHistorical": 1800000,
    "ttlFinancials": 43200000,
    "ttlNews": 180000,
    "ttlAnalysis": 1800000,
    "maxCacheSize": 500,
    "cacheStrategy": "lru"
  }
}
```

**Standard Environment:**
```json
{
  "cache": {
    "ttlQuotes": 60000,
    "ttlHistorical": 3600000,
    "ttlFinancials": 86400000,
    "ttlNews": 300000,
    "ttlAnalysis": 3600000,
    "maxCacheSize": 1000,
    "cacheStrategy": "lru"
  }
}
```

**High-Performance Environment:**
```json
{
  "cache": {
    "ttlQuotes": 120000,
    "ttlHistorical": 7200000,
    "ttlFinancials": 172800000,
    "ttlNews": 600000,
    "ttlAnalysis": 7200000,
    "maxCacheSize": 2000,
    "cacheStrategy": "lru"
  }
}
```

## Retry Configuration

Retry logic handles transient failures and improves reliability.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxRetries` | number | 3 | Maximum number of retry attempts |
| `baseDelay` | number | 1000 | Initial delay between retries (ms) |
| `maxDelay` | number | 30000 | Maximum delay between retries (ms) |
| `jitter` | boolean | true | Add randomness to retry delays |
| `jitterFactor` | number | 0.1 | Randomness factor (0-1) |
| `retryableStatusCodes` | array | [429, 500, 502, 503, 504] | HTTP codes that trigger retries |
| `retryableErrors` | array | [ECONNRESET, ETIMEDOUT, ENOTFOUND, ECONNREFUSED] | Network errors that trigger retries |

### Understanding Jitter

Jitter adds randomness to retry delays to prevent the "thundering herd" problem, where many clients retry simultaneously. With `jitterFactor: 0.1`, the actual delay varies by +/-10%.

### Recommended Values

**Conservative Retry:**
```json
{
  "retry": {
    "maxRetries": 2,
    "baseDelay": 2000,
    "maxDelay": 15000,
    "jitter": true,
    "jitterFactor": 0.2
  }
}
```

**Standard Retry:**
```json
{
  "retry": {
    "maxRetries": 3,
    "baseDelay": 1000,
    "maxDelay": 30000,
    "jitter": true,
    "jitterFactor": 0.1
  }
}
```

**Aggressive Retry:**
```json
{
  "retry": {
    "maxRetries": 5,
    "baseDelay": 500,
    "maxDelay": 60000,
    "jitter": true,
    "jitterFactor": 0.15
  }
}
```

## Circuit Breaker

The circuit breaker prevents cascading failures by stopping requests to failing services.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `failureThreshold` | number | 5 | Failures before opening circuit |
| `successThreshold` | number | 2 | Successes needed to close circuit |
| `timeout` | number | 60000 | Time in ms before attempting to close circuit |
| `monitoringWindow` | number | 60000 | Time window for monitoring failures (ms) |

### Circuit Breaker States

1. **Closed**: Normal operation, requests pass through
2. **Open**: Circuit is tripped, requests are blocked
3. **Half-Open**: Testing if service has recovered

### Recommended Values

**Fast Recovery:**
```json
{
  "circuitBreaker": {
    "failureThreshold": 3,
    "successThreshold": 2,
    "timeout": 30000,
    "monitoringWindow": 30000
  }
}
```

**Standard Protection:**
```json
{
  "circuitBreaker": {
    "failureThreshold": 5,
    "successThreshold": 2,
    "timeout": 60000,
    "monitoringWindow": 60000
  }
}
```

**Conservative Protection:**
```json
{
  "circuitBreaker": {
    "failureThreshold": 10,
    "successThreshold": 5,
    "timeout": 120000,
    "monitoringWindow": 120000
  }
}
```

## Queue Configuration

The request queue manages concurrent requests and prevents overwhelming the API.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxConcurrent` | number | 5 | Maximum concurrent requests |
| `maxQueueSize` | number | 100 | Maximum queue size |
| `priorityLevels` | number | 3 | Number of priority levels |
| `queueTimeout` | number | 30000 | Time in ms before queue request times out |
| `batchWindow` | number | 100 | Time in ms to batch requests |

### Priority Levels

Higher priority levels are processed first. The system supports 3 levels by default:
1. Level 1: Highest priority (urgent requests)
2. Level 2: Normal priority (standard requests)
3. Level 3: Lowest priority (background tasks)

### Recommended Values

**Low Concurrency:**
```json
{
  "queue": {
    "maxConcurrent": 3,
    "maxQueueSize": 50,
    "priorityLevels": 3,
    "queueTimeout": 15000,
    "batchWindow": 50
  }
}
```

**Standard Concurrency:**
```json
{
  "queue": {
    "maxConcurrent": 5,
    "maxQueueSize": 100,
    "priorityLevels": 3,
    "queueTimeout": 30000,
    "batchWindow": 100
  }
}
```

**High Concurrency:**
```json
{
  "queue": {
    "maxConcurrent": 10,
    "maxQueueSize": 200,
    "priorityLevels": 5,
    "queueTimeout": 60000,
    "batchWindow": 200
  }
}
```

## Data Completion

Data completion handles incomplete responses by attempting to fill missing fields.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableFallback` | boolean | true | Enable fallback mechanisms |
| `fallbackPriority` | array | ["cache", "alternative"] | Priority order for fallback sources |
| `fillMissingFields` | boolean | true | Attempt to fill missing fields |
| `validateCompleteness` | boolean | true | Validate data completeness |

### Fallback Sources

1. **cache**: Check cached data for missing fields
2. **alternative**: Try alternative data sources or calculations

### Recommended Values

**Strict Mode:**
```json
{
  "dataCompletion": {
    "enableFallback": true,
    "fallbackPriority": ["cache"],
    "fillMissingFields": false,
    "validateCompleteness": true
  }
}
```

**Standard Mode:**
```json
{
  "dataCompletion": {
    "enableFallback": true,
    "fallbackPriority": ["cache", "alternative"],
    "fillMissingFields": true,
    "validateCompleteness": true
  }
}
```

**Lenient Mode:**
```json
{
  "dataCompletion": {
    "enableFallback": true,
    "fallbackPriority": ["cache", "alternative"],
    "fillMissingFields": true,
    "validateCompleteness": false
  }
}
```

## Server Configuration

Server settings control how the MCP server runs and communicates.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `transport` | string | 'stdio' | Transport type: 'stdio' or 'sse' |
| `port` | number | 3000 | Server port (for SSE transport) |
| `host` | string | 'localhost' | Server host |
| `logLevel` | string | 'info' | Logging level |
| `enableMetrics` | boolean | true | Enable metrics collection |
| `metricsPort` | number | 9090 | Port for metrics endpoint |

### Transport Types

- **stdio**: Standard input/output for MCP protocol (recommended for most use cases)
- **sse**: Server-Sent Events for web-based clients

### Logging Levels

- **debug**: Detailed diagnostic information
- **info**: General informational messages (recommended)
- **warn**: Warning messages
- **error**: Error messages only

### Recommended Values

**Development:**
```json
{
  "server": {
    "transport": "stdio",
    "logLevel": "debug",
    "enableMetrics": true,
    "metricsPort": 9090
  }
}
```

**Production:**
```json
{
  "server": {
    "transport": "stdio",
    "logLevel": "info",
    "enableMetrics": true,
    "metricsPort": 9090
  }
}
```

**Web Server Mode (SSE):**
```json
{
  "server": {
    "transport": "sse",
    "port": 3000,
    "host": "0.0.0.0",
    "logLevel": "info",
    "enableMetrics": true,
    "metricsPort": 9090
  }
}
```

## Logging Configuration

Logging settings control how the server logs messages and events.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `level` | string | 'info' | Logging level: 'debug', 'info', 'warn', 'error' |
| `format` | string | 'json' | Log format: 'json' or 'text' |
| `destination` | string | 'console' | Log destination: 'console', 'file', or 'both' |
| `filePath` | string | './logs/mcp-server.log' | Path to log file |
| `maxSize` | number | 10485760 | Maximum log file size in bytes |
| `maxFiles` | number | 5 | Maximum number of log files to keep |

### Logging Levels

- **debug**: Detailed diagnostic information for troubleshooting
- **info**: General informational messages (recommended for production)
- **warn**: Warning messages for potential issues
- **error**: Error messages only

### Log Formats

- **json**: Structured JSON logs (recommended for production and log aggregation)
- **text**: Human-readable plain text logs (recommended for development)

### Recommended Values

**Development:**
```json
{
  "logging": {
    "level": "debug",
    "format": "text",
    "destination": "console"
  }
}
```

**Production:**
```json
{
  "logging": {
    "level": "info",
    "format": "json",
    "destination": "both",
    "filePath": "./logs/mcp-server.log",
    "maxSize": 10485760,
    "maxFiles": 5
  }
}
```

**Minimal:**
```json
{
  "logging": {
    "level": "error",
    "format": "json",
    "destination": "file",
    "filePath": "./logs/errors.log",
    "maxSize": 5242880,
    "maxFiles": 3
  }
}
```

## MCP Server Information

Server information defines the identity and versioning of the MCP server.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | string | 'y-finance-mcp-server' | Server name identifier |
| `version` | string | '1.0.0' | Server version (semantic versioning) |
| `protocolVersion` | string | '1.0' | MCP protocol version supported |

### Recommended Values

```json
{
  "serverInfo": {
    "name": "y-finance-mcp-server",
    "version": "1.0.0",
    "protocolVersion": "1.0"
  }
}
```

## MCP Capabilities

Define the capabilities that the MCP server advertises to clients.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `tools.listChanged` | boolean | false | Whether tool list can change dynamically |
| `resources.subscribe` | boolean | false | Whether resources support subscriptions |
| `resources.listChanged` | boolean | false | Whether resource list can change dynamically |
| `prompts.listChanged` | boolean | false | Whether prompt list can change dynamically |
| `logging.level` | string | 'info' | Server logging level for capabilities |

### Recommended Values

**Standard:**
```json
{
  "capabilities": {
    "tools": {
      "listChanged": false
    },
    "resources": {
      "subscribe": false,
      "listChanged": false
    },
    "prompts": {
      "listChanged": false
    },
    "logging": {
      "level": "info"
    }
  }
}
```

**Dynamic Tools:**
```json
{
  "capabilities": {
    "tools": {
      "listChanged": true
    },
    "resources": {
      "subscribe": true,
      "listChanged": true
    },
    "prompts": {
      "listChanged": false
    },
    "logging": {
      "level": "debug"
    }
  }
}
```

## Security Configuration

Security settings control input validation, rate limiting, and protection mechanisms.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable security features globally |
| `enableInputValidation` | boolean | true | Validate all input parameters |
| `enableOutputSanitization` | boolean | true | Sanitize output data |
| `maxSymbolsPerRequest` | number | 50 | Maximum symbols per request |
| `maxStringLength` | number | 1000 | Maximum string length for inputs |
| `allowedOrigins` | array | [] | Allowed CORS origins |
| `enableRateLimiting` | boolean | true | Enable IP-based rate limiting |
| `enableRequestLogging` | boolean | true | Log all requests for audit |
| `sanitizeErrors` | boolean | true | Sanitize error messages |
| `maxRequestsPerIP` | number | 1000 | Max requests per IP per window |
| `rateLimitWindowMs` | number | 3600000 | Rate limit time window (ms) |
| `blockDurationMs` | number | 3600000 | IP block duration (ms) |
| `enableCSRFProtection` | boolean | true | Enable CSRF protection |
| `enableContentSecurityPolicy` | boolean | true | Enable CSP headers |

### Recommended Values

**Development:**
```json
{
  "security": {
    "enabled": true,
    "enableInputValidation": true,
    "enableOutputSanitization": false,
    "maxSymbolsPerRequest": 50,
    "maxStringLength": 1000,
    "allowedOrigins": [],
    "enableRateLimiting": false,
    "enableRequestLogging": true,
    "sanitizeErrors": false,
    "maxRequestsPerIP": 1000,
    "rateLimitWindowMs": 3600000,
    "blockDurationMs": 3600000,
    "enableCSRFProtection": false,
    "enableContentSecurityPolicy": false
  }
}
```

**Production:**
```json
{
  "security": {
    "enabled": true,
    "enableInputValidation": true,
    "enableOutputSanitization": true,
    "maxSymbolsPerRequest": 50,
    "maxStringLength": 1000,
    "allowedOrigins": ["https://yourdomain.com"],
    "enableRateLimiting": true,
    "enableRequestLogging": true,
    "sanitizeErrors": true,
    "maxRequestsPerIP": 1000,
    "rateLimitWindowMs": 3600000,
    "blockDurationMs": 3600000,
    "enableCSRFProtection": true,
    "enableContentSecurityPolicy": true
  }
}
```

**Strict Security:**
```json
{
  "security": {
    "enabled": true,
    "enableInputValidation": true,
    "enableOutputSanitization": true,
    "maxSymbolsPerRequest": 10,
    "maxStringLength": 500,
    "allowedOrigins": ["https://yourdomain.com"],
    "enableRateLimiting": true,
    "enableRequestLogging": true,
    "sanitizeErrors": true,
    "maxRequestsPerIP": 100,
    "rateLimitWindowMs": 60000,
    "blockDurationMs": 3600000,
    "enableCSRFProtection": true,
    "enableContentSecurityPolicy": true
  }
}
```

## Fallback Configuration

Global fallback settings for handling failures.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | true | Enable fallback mechanisms globally |
| `delay` | number | 5000 | Delay in ms before triggering fallback |

### Recommended Values

```json
{
  "fallback": {
    "enabled": true,
    "delay": 5000
  }
}
```

## Yahoo Finance Configuration

Settings specific to the Yahoo Finance API.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | string | 'https://query1.finance.yahoo.com' | Yahoo Finance API base URL |
| `timeoutMs` | number | 30000 | Request timeout in milliseconds |
| `userAgent` | string | 'Mozilla/5.0 (compatible; YFinanceMCP/1.0)' | User agent string |
| `maxConcurrentRequests` | number | 5 | Maximum concurrent requests |
| `requestQueueSize` | number | 100 | Request queue size |
| `validateResponses` | boolean | true | Validate Yahoo Finance responses |
| `strictMode` | boolean | false | Strict mode for validation |

### Recommended Values

**Standard:**
```json
{
  "yahooFinance": {
    "baseUrl": "https://query1.finance.yahoo.com",
    "timeoutMs": 30000,
    "userAgent": "Mozilla/5.0 (compatible; YFinanceMCP/1.0)",
    "maxConcurrentRequests": 5,
    "requestQueueSize": 100,
    "validateResponses": true,
    "strictMode": false
  }
}
```

**High Performance:**
```json
{
  "yahooFinance": {
    "baseUrl": "https://query1.finance.yahoo.com",
    "timeoutMs": 60000,
    "userAgent": "Mozilla/5.0 (compatible; YFinanceMCP/1.0)",
    "maxConcurrentRequests": 10,
    "requestQueueSize": 200,
    "validateResponses": true,
    "strictMode": false
  }
}
```

**Strict Validation:**
```json
{
  "yahooFinance": {
    "baseUrl": "https://query1.finance.yahoo.com",
    "timeoutMs": 30000,
    "userAgent": "Mozilla/5.0 (compatible; YFinanceMCP/1.0)",
    "maxConcurrentRequests": 5,
    "requestQueueSize": 100,
    "validateResponses": true,
    "strictMode": true
  }
}
```

## Network Configuration

General network settings for HTTP requests.

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeoutMs` | number | 30000 | Default network timeout (ms) |
| `keepAlive` | boolean | true | Enable HTTP keep-alive |
| `keepAliveMsecs` | number | 1000 | Keep-alive interval (ms) |
| `maxSockets` | number | 50 | Maximum sockets per host |
| `maxFreeSockets` | number | 10 | Maximum free sockets |
| `maxRedirects` | number | 5 | Maximum number of redirects |
| `followRedirects` | boolean | true | Follow HTTP redirects |

### Recommended Values

**Standard:**
```json
{
  "network": {
    "timeoutMs": 30000,
    "keepAlive": true,
    "keepAliveMsecs": 1000,
    "maxSockets": 50,
    "maxFreeSockets": 10,
    "maxRedirects": 5,
    "followRedirects": true
  }
}
```

**High Throughput:**
```json
{
  "network": {
    "timeoutMs": 60000,
    "keepAlive": true,
    "keepAliveMsecs": 1000,
    "maxSockets": 100,
    "maxFreeSockets": 20,
    "maxRedirects": 10,
    "followRedirects": true
  }
}
```

## Configuration Examples

### Minimal Configuration

For quick testing with minimal configuration:

**JSON:**
```json
{
  "rateLimit": {
    "requestsPerMinute": 30
  },
  "cache": {
    "maxCacheSize": 100
  },
  "server": {
    "transport": "stdio",
    "logLevel": "info"
  }
}
```

**YAML:**
```yaml
rateLimit:
  requestsPerMinute: 30

cache:
  maxCacheSize: 100

server:
  transport: stdio
  logLevel: info
```

### Development Configuration

For development with detailed logging:

**JSON:**
```json
{
  "rateLimit": {
    "requestsPerMinute": 30,
    "requestsPerHour": 500,
    "burstLimit": 3
  },
  "cache": {
    "ttlQuotes": 30000,
    "maxCacheSize": 500,
    "cacheStrategy": "lru"
  },
  "retry": {
    "maxRetries": 2,
    "baseDelay": 1000,
    "jitter": true
  },
  "server": {
    "transport": "stdio",
    "logLevel": "debug",
    "enableMetrics": true
  }
}
```

**YAML:**
```yaml
rateLimit:
  requestsPerMinute: 30
  requestsPerHour: 500
  burstLimit: 3

cache:
  ttlQuotes: 30000
  maxCacheSize: 500
  cacheStrategy: lru

retry:
  maxRetries: 2
  baseDelay: 1000
  jitter: true

server:
  transport: stdio
  logLevel: debug
  enableMetrics: true
```

### Production Configuration

For production with optimal performance and reliability:

**JSON:**
```json
{
  "rateLimit": {
    "requestsPerMinute": 60,
    "requestsPerHour": 1500,
    "burstLimit": 5,
    "backoffMultiplier": 2,
    "maxBackoffSeconds": 300,
    "retryCount": 3,
    "circuitBreakerThreshold": 5,
    "circuitBreakerResetMs": 60000
  },
  "cache": {
    "ttlQuotes": 60000,
    "ttlHistorical": 3600000,
    "ttlFinancials": 86400000,
    "ttlNews": 300000,
    "ttlAnalysis": 3600000,
    "maxCacheSize": 1000,
    "cacheStrategy": "lru"
  },
  "retry": {
    "maxRetries": 3,
    "baseDelay": 1000,
    "maxDelay": 30000,
    "jitter": true,
    "jitterFactor": 0.1,
    "retryableStatusCodes": [429, 500, 502, 503, 504],
    "retryableErrors": ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "ECONNREFUSED"]
  },
  "circuitBreaker": {
    "failureThreshold": 5,
    "successThreshold": 2,
    "timeout": 60000,
    "monitoringWindow": 60000
  },
  "queue": {
    "maxConcurrent": 5,
    "maxQueueSize": 100,
    "priorityLevels": 3,
    "queueTimeout": 30000,
    "batchWindow": 100
  },
  "dataCompletion": {
    "enableFallback": true,
    "fallbackPriority": ["cache", "alternative"],
    "fillMissingFields": true,
    "validateCompleteness": true
  },
  "server": {
    "transport": "stdio",
    "logLevel": "info",
    "enableMetrics": true,
    "metricsPort": 9090
  },
  "logging": {
    "level": "info",
    "format": "json",
    "destination": "console"
  },
  "serverInfo": {
    "name": "y-finance-mcp-server",
    "version": "1.0.0",
    "protocolVersion": "1.0"
  },
  "capabilities": {
    "tools": {
      "listChanged": false
    },
    "resources": {
      "subscribe": false,
      "listChanged": false
    },
    "prompts": {
      "listChanged": false
    },
    "logging": {
      "level": "info"
    }
  },
  "security": {
    "enabled": true,
    "enableInputValidation": true,
    "enableOutputSanitization": true,
    "maxSymbolsPerRequest": 50,
    "maxStringLength": 1000,
    "allowedOrigins": [],
    "enableRateLimiting": true,
    "enableRequestLogging": true,
    "sanitizeErrors": true,
    "maxRequestsPerIP": 1000,
    "rateLimitWindowMs": 3600000,
    "blockDurationMs": 3600000,
    "enableCSRFProtection": true,
    "enableContentSecurityPolicy": true
  },
  "fallback": {
    "enabled": true,
    "delay": 5000
  },
  "yahooFinance": {
    "baseUrl": "https://query1.finance.yahoo.com",
    "timeoutMs": 30000,
    "userAgent": "Mozilla/5.0 (compatible; YFinanceMCP/1.0)",
    "maxConcurrentRequests": 5,
    "requestQueueSize": 100,
    "validateResponses": true,
    "strictMode": false
  },
  "network": {
    "timeoutMs": 30000,
    "keepAlive": true,
    "keepAliveMsecs": 1000,
    "maxSockets": 50,
    "maxFreeSockets": 10,
    "maxRedirects": 5,
    "followRedirects": true
  }
}
```

**YAML:**
```yaml
rateLimit:
  requestsPerMinute: 60
  requestsPerHour: 1500
  burstLimit: 5
  backoffMultiplier: 2
  maxBackoffSeconds: 300
  retryCount: 3
  circuitBreakerThreshold: 5
  circuitBreakerResetMs: 60000

cache:
  ttlQuotes: 60000
  ttlHistorical: 3600000
  ttlFinancials: 86400000
  ttlNews: 300000
  ttlAnalysis: 3600000
  maxCacheSize: 1000
  cacheStrategy: lru

retry:
  maxRetries: 3
  baseDelay: 1000
  maxDelay: 30000
  jitter: true
  jitterFactor: 0.1
  retryableStatusCodes:
    - 429
    - 500
    - 502
    - 503
    - 504
  retryableErrors:
    - ECONNRESET
    - ETIMEDOUT
    - ENOTFOUND
    - ECONNREFUSED

circuitBreaker:
  failureThreshold: 5
  successThreshold: 2
  timeout: 60000
  monitoringWindow: 60000

queue:
  maxConcurrent: 5
  maxQueueSize: 100
  priorityLevels: 3
  queueTimeout: 30000
  batchWindow: 100

dataCompletion:
  enableFallback: true
  fallbackPriority:
    - cache
    - alternative
  fillMissingFields: true
  validateCompleteness: true

server:
  transport: stdio
  logLevel: info
  enableMetrics: true
  metricsPort: 9090

logging:
  level: info
  format: json
  destination: console

serverInfo:
  name: y-finance-mcp-server
  version: 1.0.0
  protocolVersion: 1.0

capabilities:
  tools:
    listChanged: false
  resources:
    subscribe: false
    listChanged: false
  prompts:
    listChanged: false
  logging:
    level: info

security:
  enabled: true
  enableInputValidation: true
  enableOutputSanitization: true
  maxSymbolsPerRequest: 50
  maxStringLength: 1000
  allowedOrigins: []
  enableRateLimiting: true
  enableRequestLogging: true
  sanitizeErrors: true
  maxRequestsPerIP: 1000
  rateLimitWindowMs: 3600000
  blockDurationMs: 3600000
  enableCSRFProtection: true
  enableContentSecurityPolicy: true

fallback:
  enabled: true
  delay: 5000

yahooFinance:
  baseUrl: https://query1.finance.yahoo.com
  timeoutMs: 30000
  userAgent: Mozilla/5.0 (compatible; YFinanceMCP/1.0)
  maxConcurrentRequests: 5
  requestQueueSize: 100
  validateResponses: true
  strictMode: false

network:
  timeoutMs: 30000
  keepAlive: true
  keepAliveMsecs: 1000
  maxSockets: 50
  maxFreeSockets: 10
  maxRedirects: 5
  followRedirects: true
```

## Troubleshooting

### Common Issues

1. **Rate Limiting Errors**
   - Reduce `requestsPerMinute` and `requestsPerHour`
   - Increase `backoffMultiplier` and `maxBackoffSeconds`
   - Enable caching to reduce API calls

2. **Slow Response Times**
   - Increase cache TTL values
   - Increase `maxCacheSize`
   - Reduce `maxConcurrent` requests if overwhelming the API

3. **Frequent Circuit Breaker Trips**
   - Increase `failureThreshold`
   - Increase `timeout` and `monitoringWindow`
   - Check network connectivity and API status

4. **High Memory Usage**
   - Reduce `maxCacheSize`
   - Reduce cache TTL values
   - Reduce `maxQueueSize`

### Monitoring

Enable metrics to monitor server performance:
```json
{
  "server": {
    "enableMetrics": true,
    "metricsPort": 9090
  }
}
```

Access metrics at `http://localhost:9090/metrics` when running in SSE mode.

## Best Practices

1. **Start Conservative**: Begin with conservative rate limits and increase as needed
2. **Monitor Metrics**: Regularly check metrics to identify bottlenecks
3. **Use Caching**: Enable caching for frequently accessed data
4. **Configure Retries**: Set appropriate retry delays to avoid overwhelming the API
5. **Test Configuration**: Test configuration in development before deploying to production
6. **Document Changes**: Keep track of configuration changes and their impact

## Additional Resources

- [MCP Protocol Documentation](https://modelcontextprotocol.io/)
- [Yahoo Finance API Documentation](https://finance.yahoo.com/)
- [Project README](./README.md)
