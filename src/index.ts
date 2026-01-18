import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListPromptsRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig, type AppConfig } from './config/index.js';
import { YahooFinanceClient } from './services/yahoo-finance.js';
import { RateLimiter } from './middleware/rate-limiter.js';
import { CircuitBreaker } from './middleware/circuit-breaker.js';
import { Cache } from './middleware/cache.js';
import { DataQualityReporter } from './utils/data-completion.js';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { QuoteTools } from './tools/quotes.js';
import { HistoricalTools } from './tools/historical.js';
import { EarningsTools } from './tools/earnings.js';
import { AnalysisTools } from './tools/analysis.js';
import { SummaryTools } from './tools/summary.js';
import { getMajorHoldersTool, getHoldersToolDefinitions, clearHoldersCache } from './tools/holders.js';
import { getCompanyNewsTool, getNewsToolDefinitions, clearNewsCache } from './tools/news.js';
import { getOptionsTool, getOptionsToolDefinitions, clearOptionsCache } from './tools/options.js';
import {
  getBalanceSheetTool,
  getIncomeStatementTool,
  getCashFlowStatementTool,
  getFinancialsToolDefinitions,
  clearFinancialsCache
} from './tools/financials.js';

type ServerState = 'initializing' | 'ready' | 'shutting_down' | 'stopped';

type Metrics = {
  requestCount: number;
  successCount: number;
  errorCount: number;
  cacheHits: number;
  cacheMisses: number;
  startTime: number;
};

class MCPServer {
  private server!: Server;
  private config!: AppConfig;
  private yahooClient!: YahooFinanceClient;
  private rateLimiter!: RateLimiter;
  private circuitBreaker!: CircuitBreaker;
  private cache!: Cache;
  private qualityReporter!: DataQualityReporter;
  private state: ServerState;
  private metrics: Metrics;
  private toolHandlers: Map<string, (args: unknown) => Promise<unknown>>;
  private resourceHandlers: Map<string, (uri: string) => Promise<unknown>>;
  private promptHandlers: Map<string, (args: unknown) => Promise<unknown>>;

  constructor() {
    this.state = 'initializing';
    this.metrics = {
      requestCount: 0,
      successCount: 0,
      errorCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      startTime: Date.now()
    };
    this.toolHandlers = new Map();
    this.resourceHandlers = new Map();
    this.promptHandlers = new Map();
  }

  async initialize(): Promise<void> {
    try {
      this.config = this.loadConfig();
      await this.initializeServices();
      await this.initializeServer();
      await this.registerTools();
      await this.registerResources();
      await this.registerPrompts();
      this.setupErrorHandling();
      this.setupGracefulShutdown();
      this.state = 'ready';
    } catch (error) {
      this.state = 'stopped';
      throw error;
    }
  }

  private loadConfig(): AppConfig {
    return loadConfig();
  }

  private async initializeServices(): Promise<void> {
    this.rateLimiter = new RateLimiter({
      strategy: 'token-bucket',
      maxRequests: this.config.rateLimit.requestsPerMinute,
      windowMs: 60000
    });

    this.circuitBreaker = new CircuitBreaker({
      enabled: true,
      timeoutMs: this.config.circuitBreaker.timeout,
      errorThresholdPercentage: 50,
      resetTimeoutMs: this.config.circuitBreaker.monitoringWindow,
      rollingCountBuckets: 10,
      rollingCountTimeoutMs: 60000,
      volumeThreshold: this.config.circuitBreaker.failureThreshold,
      halfOpenMaxAttempts: this.config.circuitBreaker.successThreshold
    });

    this.cache = new Cache({
      enabled: true,
      store: 'memory',
      ttl: this.config.cache.ttlQuotes,
      maxEntries: this.config.cache.maxCacheSize
    });

    this.qualityReporter = new DataQualityReporter(this.config.cache.ttlQuotes);

    this.yahooClient = new YahooFinanceClient({
      rateLimit: {
        strategy: 'token-bucket',
        maxRequests: this.config.rateLimit.requestsPerMinute,
        windowMs: 60000
      },
      cache: {
        enabled: true,
        store: 'memory',
        ttl: this.config.cache.ttlQuotes,
        maxEntries: this.config.cache.maxCacheSize
      },
      retry: {
        enabled: true,
        maxRetries: this.config.retry.maxRetries,
        initialDelayMs: this.config.retry.baseDelay,
        maxDelayMs: this.config.retry.maxDelay,
        strategy: 'exponential',
        backoffMultiplier: this.config.retry.jitterFactor * 10,
        jitter: this.config.retry.jitter,
        retryableStatusCodes: this.config.retry.retryableStatusCodes,
        retryableErrorCodes: this.config.retry.retryableErrors
      },
      circuitBreaker: {
        enabled: true,
        timeoutMs: this.config.circuitBreaker.timeout,
        errorThresholdPercentage: 50,
        resetTimeoutMs: this.config.circuitBreaker.monitoringWindow,
        rollingCountBuckets: 10,
        rollingCountTimeoutMs: 60000,
        volumeThreshold: this.config.circuitBreaker.failureThreshold,
        halfOpenMaxAttempts: this.config.circuitBreaker.successThreshold
      },
      queue: {
        enabled: true,
        maxSize: this.config.queue.maxQueueSize,
        strategy: 'fifo',
        concurrency: this.config.queue.maxConcurrent,
        timeoutMs: this.config.queue.queueTimeout,
        processingTimeoutMs: this.config.queue.batchWindow
      },
      dataCompletion: {
        enabled: this.config.dataCompletion.enableFallback,
        level: 'moderate',
        requiredFields: [],
        preferredFields: this.config.dataCompletion.fallbackPriority,
        allowPartial: this.config.dataCompletion.fillMissingFields,
        fallbackToCache: true
      },
      logging: this.config.logging,
      network: this.config.network,
      yahooFinance: this.config.yahooFinance,
      serverInfo: this.config.serverInfo,
      capabilities: this.config.capabilities,
      transport: 'stdio'
    });

    await this.yahooClient.initialize();
  }

  private async initializeServer(): Promise<void> {
    this.server = new Server(
      {
        name: this.config.serverInfo.name,
        version: this.config.serverInfo.version
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      }
    );

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }

  private async registerTools(): Promise<void> {
    const quoteTools = new QuoteTools(this.yahooClient, this.qualityReporter);
    const earningsTools = new EarningsTools(this.yahooClient);
    const analysisTools = new AnalysisTools(this.yahooClient);
    const summaryTools = new SummaryTools(this.yahooClient, {
      rateLimit: {
        strategy: 'token-bucket',
        maxRequests: this.config.rateLimit.requestsPerMinute,
        windowMs: 60000
      },
      cache: {
        enabled: true,
        store: 'memory',
        ttl: this.config.cache.ttlQuotes,
        maxEntries: this.config.cache.maxCacheSize
      },
      retry: {
        enabled: true,
        maxRetries: this.config.retry.maxRetries,
        initialDelayMs: this.config.retry.baseDelay,
        maxDelayMs: this.config.retry.maxDelay,
        strategy: 'exponential',
        backoffMultiplier: this.config.retry.jitterFactor * 10,
        jitter: this.config.retry.jitter,
        retryableStatusCodes: this.config.retry.retryableStatusCodes,
        retryableErrorCodes: this.config.retry.retryableErrors
      },
      circuitBreaker: {
        enabled: true,
        timeoutMs: this.config.circuitBreaker.timeout,
        errorThresholdPercentage: 50,
        resetTimeoutMs: this.config.circuitBreaker.monitoringWindow,
        rollingCountBuckets: 10,
        rollingCountTimeoutMs: 60000,
        volumeThreshold: this.config.circuitBreaker.failureThreshold,
        halfOpenMaxAttempts: this.config.circuitBreaker.successThreshold
      },
      queue: {
        enabled: true,
        maxSize: this.config.queue.maxQueueSize,
        strategy: 'fifo',
        concurrency: this.config.queue.maxConcurrent,
        timeoutMs: this.config.queue.queueTimeout,
        processingTimeoutMs: this.config.queue.batchWindow
      },
      dataCompletion: {
        enabled: this.config.dataCompletion.enableFallback,
        level: 'moderate',
        requiredFields: [],
        preferredFields: this.config.dataCompletion.fallbackPriority,
        allowPartial: this.config.dataCompletion.fillMissingFields,
        fallbackToCache: true
      },
      logging: this.config.logging,
      network: this.config.network,
      yahooFinance: this.config.yahooFinance,
      serverInfo: this.config.serverInfo,
      capabilities: this.config.capabilities,
      transport: 'stdio'
    });

    this.toolHandlers.set('get_quote', async (args) => quoteTools.getQuote(args as { symbols: string[]; fields?: string[]; forceRefresh?: boolean; timeout?: number }));
    this.toolHandlers.set('get_quote_summary', async (args) => quoteTools.getQuoteSummary(args as { symbol: string; modules?: string[]; retryOnFailure?: boolean }));
    this.toolHandlers.set('get_earnings', async (args) => earningsTools.getEarnings(args as Record<string, unknown>));
    this.toolHandlers.set('get_analysis', async (args) => analysisTools.getAnalysis(args as Record<string, unknown>));
    this.toolHandlers.set('get_major_holders', async (args) => getMajorHoldersTool(args as Record<string, unknown>));
    this.toolHandlers.set('get_news', async (args) => getCompanyNewsTool(args as Record<string, unknown>));
    this.toolHandlers.set('get_options', async (args) => getOptionsTool(args as Record<string, unknown>));
    this.toolHandlers.set('get_balance_sheet', async (args) => getBalanceSheetTool(args as Record<string, unknown>));
    this.toolHandlers.set('get_income_statement', async (args) => getIncomeStatementTool(args as Record<string, unknown>));
    this.toolHandlers.set('get_cash_flow_statement', async (args) => getCashFlowStatementTool(args as Record<string, unknown>));
    this.toolHandlers.set('get_summary_profile', async (args) => summaryTools.getSummaryProfile(args as Record<string, unknown>));
    this.toolHandlers.set('get_crypto_quote', async (args) => summaryTools.getCryptoQuote(args as Record<string, unknown>));
    this.toolHandlers.set('get_forex_quote', async (args) => summaryTools.getForexQuote(args as Record<string, unknown>));
    this.toolHandlers.set('get_trending_symbols', async (args) => summaryTools.getTrendingSymbols(args as Record<string, unknown>));
    this.toolHandlers.set('screener', async (args) => summaryTools.screener(args as Record<string, unknown>));

    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const toolDefinitions = [
        {
          name: 'get_quote',
          description: 'Fetch real-time stock quotes with data quality reporting and caching. Supports batch processing of multiple symbols.',
          inputSchema: {
            type: 'object',
            properties: {
              symbols: {
                type: 'array',
                items: { type: 'string' },
                description: 'Array of stock symbols (e.g., AAPL, MSFT, GOOGL)',
                minItems: 1,
                maxItems: 100
              },
              fields: {
                type: 'array',
                items: { type: 'string' },
                description: 'Specific fields to retrieve'
              },
              forceRefresh: {
                type: 'boolean',
                description: 'Force refresh from API (default: false)'
              },
              timeout: {
                type: 'number',
                description: 'Request timeout in milliseconds (100-60000)'
              }
            },
            required: ['symbols']
          }
        },
        {
          name: 'get_quote_summary',
          description: 'Get comprehensive quote summary with data quality analysis and fallback strategies.',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'Stock symbol (e.g., AAPL, MSFT, GOOGL)',
                minLength: 1
              },
              modules: {
                type: 'array',
                items: { type: 'string' },
                description: 'Data modules to retrieve'
              },
              retryOnFailure: {
                type: 'boolean',
                description: 'Retry with alternative modules on failure (default: false)'
              }
            },
            required: ['symbol']
          }
        },
        {
          name: 'get_earnings',
          description: 'Fetch earnings data including historical earnings, estimates, and surprise analysis.',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'Stock symbol (e.g., AAPL, MSFT, GOOGL)',
                minLength: 1,
                maxLength: 20
              },
              limit: {
                type: 'number',
                description: 'Maximum number of historical earnings quarters (default: 12)',
                minimum: 1,
                maximum: 20
              },
              includeEstimates: {
                type: 'boolean',
                description: 'Include earnings estimates (default: true)'
              }
            },
            required: ['symbol']
          }
        },
        {
          name: 'get_analysis',
          description: 'Fetch analyst recommendations, target prices, and trend analysis.',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'Stock symbol (e.g., AAPL, MSFT, GOOGL)',
                minLength: 1,
                maxLength: 20
              },
              includeExpired: {
                type: 'boolean',
                description: 'Include expired analyst recommendations (default: false)'
              }
            },
            required: ['symbol']
          }
        },
        {
          name: 'get_major_holders',
          description: 'Retrieve major holders information including institutional ownership, fund holders, insider transactions, and direct holders.',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'Stock ticker symbol (e.g., AAPL, MSFT, GOOGL)',
                minLength: 1,
                maxLength: 20
              },
              includeChangeHistory: {
                type: 'boolean',
                description: 'Include historical change tracking (default: false)'
              }
            },
            required: ['symbol']
          }
        },
        {
          name: 'get_news',
          description: 'Fetch latest news articles for a stock symbol with relevance scoring.',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'Stock symbol (e.g., AAPL, MSFT, GOOGL)',
                minLength: 1,
                maxLength: 20
              },
              count: {
                type: 'number',
                description: 'Number of news articles to return (default: 10)',
                minimum: 1,
                maximum: 50
              },
              requireRelated: {
                type: 'boolean',
                description: 'Only return related news (default: false)'
              }
            },
            required: ['symbol']
          }
        },
        {
          name: 'get_options',
          description: 'Fetch options chain data with Greeks calculations and expiration filtering.',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'Stock symbol (e.g., AAPL, MSFT, GOOGL)',
                minLength: 1,
                maxLength: 20
              },
              expiration: {
                type: 'string',
                description: 'Options expiration date (YYYY-MM-DD format)'
              },
              includeGreeks: {
                type: 'boolean',
                description: 'Include Greeks calculations (default: true)'
              },
              strikeFilter: {
                type: 'object',
                properties: {
                  minStrike: { type: 'number' },
                  maxStrike: { type: 'number' },
                  inTheMoneyOnly: { type: 'boolean' },
                  outOfTheMoneyOnly: { type: 'boolean' }
                }
              }
            },
            required: ['symbol']
          }
        },
        {
          name: 'get_balance_sheet',
          description: 'Fetch balance sheet data for a company.',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'Stock symbol (e.g., AAPL, MSFT, GOOGL)',
                minLength: 1,
                maxLength: 20
              },
              period: {
                type: 'string',
                description: 'Reporting period (annual or quarterly)',
                enum: ['annual', 'quarterly']
              },
              limit: {
                type: 'number',
                description: 'Number of periods to return (1-10)',
                minimum: 1,
                maximum: 10
              }
            },
            required: ['symbol']
          }
        },
        {
          name: 'get_income_statement',
          description: 'Fetch income statement data for a company.',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'Stock symbol (e.g., AAPL, MSFT, GOOGL)',
                minLength: 1,
                maxLength: 20
              },
              period: {
                type: 'string',
                description: 'Reporting period (annual or quarterly)',
                enum: ['annual', 'quarterly']
              },
              limit: {
                type: 'number',
                description: 'Number of periods to return (1-10)',
                minimum: 1,
                maximum: 10
              }
            },
            required: ['symbol']
          }
        },
        {
          name: 'get_cash_flow_statement',
          description: 'Fetch cash flow statement data for a company.',
          inputSchema: {
            type: 'object',
            properties: {
              symbol: {
                type: 'string',
                description: 'Stock symbol (e.g., AAPL, MSFT, GOOGL)',
                minLength: 1,
                maxLength: 20
              },
              period: {
                type: 'string',
                description: 'Reporting period (annual or quarterly)',
                enum: ['annual', 'quarterly']
              },
              limit: {
                type: 'number',
                description: 'Number of periods to return (1-10)',
                minimum: 1,
                maximum: 10
              }
            },
            required: ['symbol']
          }
        },
        ...summaryTools.getTools()
      ];

      return { tools: toolDefinitions };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (this.state !== 'ready') {
        throw new Error(`Server is not ready. Current state: ${this.state}`);
      }

      this.metrics.requestCount++;

      try {
        const handler = this.toolHandlers.get(name);
        if (!handler) {
          throw new Error(`Unknown tool: ${name}`);
        }

        const result = await handler(args);
        this.metrics.successCount++;
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        this.metrics.errorCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: errorMessage }, null, 2) }],
          isError: true
        };
      }
    });
  }

  private async registerResources(): Promise<void> {
    const resourcePatterns = [
      'ticker://{symbol}/quote',
      'ticker://{symbol}/profile',
      'ticker://{symbol}/financials',
      'ticker://{symbol}/historical',
      'ticker://{symbol}/news',
      'ticker://{symbol}/analysis'
    ];

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: resourcePatterns.map(uri => ({
          uri,
          name: uri.replace('ticker://', '').replace(/{symbol}/, '[symbol]'),
          description: `Resource for ${uri}`,
          mimeType: 'application/json'
        }))
      };
    });

    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      if (this.state !== 'ready') {
        throw new Error(`Server is not ready. Current state: ${this.state}`);
      }

      const match = uri.match(/^ticker:\/\/([^/]+)\/(.+)$/);
      if (!match) {
        throw new Error(`Invalid resource URI: ${uri}`);
      }

      const [, symbol, resourceType] = match;

      switch (resourceType) {
        case 'quote':
          const quoteResult = await this.yahooClient.getQuote(symbol);
          return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(quoteResult) }] };
        case 'profile':
          const profileResult = await this.yahooClient.getSummaryProfile(symbol);
          return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(profileResult) }] };
        case 'financials':
          const financialsResult = await this.yahooClient.getFinancials(symbol, 'income-statement');
          return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(financialsResult) }] };
        case 'historical':
          const historicalResult = await this.yahooClient.getHistoricalPrices(symbol);
          return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(historicalResult) }] };
        case 'news':
          const newsResult = await this.yahooClient.getNews(symbol);
          return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(newsResult) }] };
        case 'analysis':
          const analysisResult = await this.yahooClient.getAnalysis(symbol);
          return { contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(analysisResult) }] };
        default:
          throw new Error(`Unknown resource type: ${resourceType}`);
      }
    });
  }

  private async registerPrompts(): Promise<void> {
    const prompts = [
      {
        name: 'analyze_stock',
        description: 'Perform comprehensive stock analysis including financials, earnings, and analyst recommendations',
        arguments: [
          {
            name: 'symbol',
            description: 'Stock symbol to analyze',
            required: true
          },
          {
            name: 'include_recommendations',
            description: 'Include analyst recommendations',
            required: false
          }
        ]
      },
      {
        name: 'compare_stocks',
        description: 'Compare multiple stocks across key metrics',
        arguments: [
          {
            name: 'symbols',
            description: 'Comma-separated stock symbols',
            required: true
          },
          {
            name: 'metrics',
            description: 'Metrics to compare (e.g., P/E, market cap, revenue)',
            required: false
          }
        ]
      },
      {
        name: 'financial_health_check',
        description: 'Assess financial health of a company using key ratios',
        arguments: [
          {
            name: 'symbol',
            description: 'Stock symbol to analyze',
            required: true
          }
        ]
      },
      {
        name: 'earnings_analysis',
        description: 'Analyze earnings history and trends',
        arguments: [
          {
            name: 'symbol',
            description: 'Stock symbol to analyze',
            required: true
          },
          {
            name: 'quarters',
            description: 'Number of quarters to analyze',
            required: false
          }
        ]
      },
      {
        name: 'market_overview',
        description: 'Get market overview with trending stocks and indices',
        arguments: [
          {
            name: 'region',
            description: 'Market region (e.g., US, EU, ASIA)',
            required: false
          }
        ]
      },
      {
        name: 'portfolio_due_diligence',
        description: 'Perform due diligence on a portfolio of stocks',
        arguments: [
          {
            name: 'symbols',
            description: 'Comma-separated stock symbols in portfolio',
            required: true
          },
          {
            name: 'risk_tolerance',
            description: 'Risk tolerance level (low, medium, high)',
            required: false
          }
        ]
      }
    ];

    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return { prompts };
    });

    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (this.state !== 'ready') {
        throw new Error(`Server is not ready. Current state: ${this.state}`);
      }

      const prompt = prompts.find(p => p.name === name);
      if (!prompt) {
        throw new Error(`Unknown prompt: ${name}`);
      }

      const argValues = args as Record<string, string>;

      switch (name) {
        case 'analyze_stock':
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Perform a comprehensive analysis of ${argValues.symbol}. Include:\n` +
                    `- Current stock price and market performance\n` +
                    `- Financial statements overview\n` +
                    `- Earnings history and trends\n` +
                    (argValues.include_recommendations === 'true' ? `- Analyst recommendations\n` : '') +
                    `- Key financial ratios\n` +
                    `- Recent news and events\n\n` +
                    `Provide investment insights and risk factors.`
                }
              }
            ]
          };

        case 'compare_stocks':
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Compare the following stocks: ${argValues.symbols}\n\n` +
                    `Provide a detailed comparison across:\n` +
                    (argValues.metrics ? `- ${argValues.metrics}\n` : '- Valuation metrics (P/E, P/B, P/S)\n') +
                    `- Financial performance (revenue, earnings growth)\n` +
                    `- Market capitalization and trading volume\n` +
                    `- Profitability ratios\n` +
                    `- Risk metrics (beta, debt ratios)\n\n` +
                    `Conclude with a relative ranking and investment recommendations.`
                }
              }
            ]
          };

        case 'financial_health_check':
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Perform a financial health check for ${argValues.symbol}.\n\n` +
                    `Analyze:\n` +
                    `- Liquidity ratios (current ratio, quick ratio)\n` +
                    `- Solvency ratios (debt-to-equity, interest coverage)\n` +
                    `- Profitability ratios (ROE, ROA, profit margins)\n` +
                    `- Efficiency ratios (asset turnover, inventory turnover)\n` +
                    `- Cash flow health\n\n` +
                    `Provide an overall health rating (Excellent/Good/Fair/Poor) and identify areas of concern.`
                }
              }
            ]
          };

        case 'earnings_analysis':
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Analyze earnings history for ${argValues.symbol} over the last ${argValues.quarters || 8} quarters.\n\n` +
                    `Provide:\n` +
                    `- Quarterly earnings trend\n` +
                    `- Earnings surprise analysis (beats/misses)\n` +
                    `- Revenue growth trends\n` +
                    `- Earnings quality assessment\n` +
                    `- Forward earnings estimates\n\n` +
                    `Identify patterns and provide outlook.`
                }
              }
            ]
          };

        case 'market_overview':
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Provide a market overview for ${argValues.region || 'US'} markets.\n\n` +
                    `Include:\n` +
                    `- Major index performance\n` +
                    `- Trending stocks\n` +
                    `- Sector performance\n` +
                    `- Market sentiment indicators\n` +
                    `- Key market events\n\n` +
                    `Summarize current market conditions and outlook.`
                }
              }
            ]
          };

        case 'portfolio_due_diligence':
          return {
            messages: [
              {
                role: 'user',
                content: {
                  type: 'text',
                  text: `Perform due diligence on a portfolio containing: ${argValues.symbols}\n\n` +
                    `For each stock, analyze:\n` +
                    `- Current financial health\n` +
                    `- Valuation assessment\n` +
                    `- Growth prospects\n` +
                    `- Risk factors\n` +
                    `- Recent developments\n\n` +
                    `Portfolio-level analysis:\n` +
                    `- Diversification assessment\n` +
                    `- Concentration risks\n` +
                    `- Overall portfolio quality\n` +
                    `- Recommendations for ${argValues.risk_tolerance || 'moderate'} risk tolerance`
                }
              }
            ]
          };

        default:
          throw new Error(`Prompt handler not implemented: ${name}`);
      }
    });
  }

  private setupErrorHandling(): void {
    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      this.shutdown();
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });
  }

  private setupGracefulShutdown(): void {
    const shutdownHandler = async (signal: string) => {
      console.error(`\nReceived ${signal}. Initiating graceful shutdown...`);
      await this.shutdown();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
  }

  async shutdown(): Promise<void> {
    if (this.state === 'shutting_down' || this.state === 'stopped') {
      return;
    }

    this.state = 'shutting_down';

    try {
      console.error('Shutting down Yahoo Finance client...');
      await this.yahooClient.shutdown();

      console.error('Clearing caches...');
      await this.cache.clear();
      clearFinancialsCache();
      clearNewsCache();
      clearOptionsCache();
      clearHoldersCache();

      console.error('Resetting rate limiter and circuit breaker...');
      this.rateLimiter.reset();
      this.circuitBreaker.reset();

      console.error('Server shutdown complete.');
      this.state = 'stopped';
    } catch (error) {
      console.error('Error during shutdown:', error);
      this.state = 'stopped';
      throw error;
    }
  }

  getMetrics(): Metrics {
    return { ...this.metrics };
  }

  getState(): ServerState {
    return this.state;
  }

  async getStats(): Promise<{
    server: { state: ServerState; uptime: number };
    yahooClient: ReturnType<YahooFinanceClient['getStats']>;
    rateLimiter: ReturnType<RateLimiter['getStats']>;
    circuitBreaker: { state: string; failureCount: number; successCount: number };
    cache: ReturnType<Cache['getStats']>;
    metrics: Metrics;
  }> {
    const yahooStats = this.yahooClient.getStats();
    const circuitBreakerState = this.circuitBreaker.getState();

    return {
      server: {
        state: this.state,
        uptime: Date.now() - this.metrics.startTime
      },
      yahooClient: yahooStats,
      rateLimiter: this.rateLimiter.getStats(),
      circuitBreaker: {
        state: String(circuitBreakerState),
        failureCount: this.circuitBreaker.getMetrics().failureCount,
        successCount: this.circuitBreaker.getMetrics().successCount
      },
      cache: this.cache.getStats(),
      metrics: this.getMetrics()
    };
  }
}

async function main(): Promise<void> {
  const server = new MCPServer();

  try {
    await server.initialize();
    console.error('Yahoo Finance MCP Server started successfully');
    console.error('Server state:', server.getState());
    console.error('Press Ctrl+C to stop the server');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

if (process.argv[1] === __filename) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { MCPServer, main };
