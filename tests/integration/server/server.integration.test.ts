import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MCPServer } from '../../../src/server';
import { defaultConfig } from '../../../src/config';
import { YahooFinanceClient } from '../../../src/services/yahoo-finance';

// The suite used to import `src/index.ts`, which the CommonJS Jest transform cannot emit
// because it reads `import.meta.url`. It also reached for `mcpServer.getServer()`,
// `mcpServer.start()`, `server.listTools()`, `server.callTool()` and a `config` export from
// src/config — none of which exist. `MCPServer` keeps its `Server` private, connects the
// transport inside `initialize()` (there is no `start()`), and `listTools`/`callTool` are
// CLIENT-side methods. So this file now drives the server the way a client does: JSON-RPC
// messages pushed into the transport's `onmessage`, responses read back out of `send`.
jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
  const transports: Array<Record<string, unknown>> = [];
  const pending = new Map<number, (message: Record<string, unknown>) => void>();

  class StdioServerTransportMock {
    static transports = transports;
    static pending = pending;

    onmessage: ((message: unknown, extra: unknown) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: ((error: unknown) => void) | null = null;
    sessionId: string | undefined = undefined;

    start = jest.fn(async (): Promise<void> => undefined);
    close = jest.fn(async (): Promise<void> => undefined);

    send = jest.fn((message: Record<string, unknown>): Promise<void> => {
      const id = message.id as number | undefined;
      if (id !== undefined) {
        const resolve = pending.get(id);
        if (resolve !== undefined) {
          pending.delete(id);
          resolve(message);
        }
      }
      return Promise.resolve();
    });

    constructor() {
      transports.push(this);
    }
  }

  return { StdioServerTransport: StdioServerTransportMock };
});

// The real client warms live AAPL/MSFT/GOOGL quotes in initialize() and owns the network
// seam, so it is replaced with a scripted double that records what the server asks of it.
jest.mock('../../../src/services/yahoo-finance', () => {
  const state = {
    failInitialize: false,
    initializeCalls: 0,
    shutdownCalls: 0,
    quoteCalls: [] as string[],
    financialsCalls: [] as string[],
    quote: {
      price: {
        symbol: 'AAPL',
        regularMarketPrice: 175.5,
        regularMarketChange: 2.3,
        regularMarketChangePercent: 1.33,
        regularMarketPreviousClose: 173.2,
        regularMarketVolume: 50000000,
        marketCap: 2800000000000,
        currency: 'USD',
        exchangeTimezoneName: 'America/New_York'
      },
      meta: {
        symbol: 'AAPL',
        currency: 'USD',
        exchangeName: 'NasdaqGS',
        instrumentType: 'EQUITY',
        exchangeTimezoneName: 'America/New_York',
        regularMarketTime: 1767225600000
      }
    },
    profile: { assetProfile: { sector: 'Technology', industry: 'Consumer Electronics' } },
    financials: { incomeStatementHistory: { incomeStatementHistory: [] } },
    historical: {
      timestamps: [],
      meta: { symbol: 'AAPL', currency: 'USD' },
      indicators: { quote: [], adjclose: [] }
    },
    news: { count: 0, news: [] },
    analysis: { analystOpinion: undefined }
  };

  class YahooFinanceClientMock {
    static clientState = state;
    private config: unknown;

    constructor(config: unknown) {
      this.config = config;
    }

    initialize(): Promise<void> {
      state.initializeCalls++;
      if (state.failInitialize) {
        return Promise.reject(new Error('Yahoo session could not be established'));
      }
      return Promise.resolve();
    }

    shutdown(): Promise<void> {
      state.shutdownCalls++;
      return Promise.resolve();
    }

    getStats(): Record<string, unknown> {
      return { rateLimiter: {}, circuitBreaker: {}, cache: {}, warnings: [] };
    }

    isInitialized(): boolean {
      return true;
    }

    getQuote(symbol: string): Promise<unknown> {
      state.quoteCalls.push(symbol);
      return Promise.resolve(state.quote);
    }

    getSummaryProfile(symbol: string): Promise<unknown> {
      state.quoteCalls.push(symbol);
      return Promise.resolve(state.profile);
    }

    getFinancials(symbol: string): Promise<unknown> {
      state.financialsCalls.push(symbol);
      return Promise.resolve(state.financials);
    }

    getHistoricalPrices(): Promise<unknown> {
      return Promise.resolve(state.historical);
    }

    getNews(): Promise<unknown> {
      return Promise.resolve(state.news);
    }

    getAnalysis(): Promise<unknown> {
      return Promise.resolve(state.analysis);
    }

    getConfig(): unknown {
      return this.config;
    }
  }

  return {
    YahooFinanceClient: YahooFinanceClientMock,
    yahooFinance: {
      quote: jest.fn(),
      chart: jest.fn(),
      quoteSummary: jest.fn(),
      fundamentalsTimeSeries: jest.fn(),
      search: jest.fn(),
      options: jest.fn(),
      trendingSymbols: jest.fn(),
      screener: jest.fn()
    },
    toOptionContract: (contract: unknown): unknown => contract
  };
});

const clientState = (YahooFinanceClient as unknown as { clientState: Record<string, never> }).clientState;
const transportMock = StdioServerTransport as unknown as {
  transports: Array<Record<string, jest.Mock>>;
  pending: Map<number, (message: Record<string, unknown>) => void>;
};

type RpcResponse = {
  id?: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
};

type ToolDefinition = {
  name: string;
  description?: string;
  inputSchema?: { type: string; properties?: Record<string, unknown>; required?: string[] };
};

const CALLABLE_TOOLS = [
  'get_quote',
  'get_quote_summary',
  'get_historical_prices',
  'get_historical_prices_multi',
  'get_earnings',
  'get_analysis',
  'get_major_holders',
  'get_news',
  'get_options',
  'get_balance_sheet',
  'get_income_statement',
  'get_cash_flow_statement',
  'get_summary_profile',
  'get_crypto_quote',
  'get_forex_quote',
  'get_trending_symbols',
  'screener'
];

const RESOURCE_TEMPLATES = [
  'ticker://{symbol}/quote',
  'ticker://{symbol}/profile',
  'ticker://{symbol}/financials',
  'ticker://{symbol}/historical',
  'ticker://{symbol}/news',
  'ticker://{symbol}/analysis'
];

const PROMPT_NAMES = [
  'analyze_stock',
  'compare_stocks',
  'financial_health_check',
  'earnings_analysis',
  'market_overview',
  'portfolio_due_diligence'
];

let nextId = 1;

function rpc(method: string, params?: Record<string, unknown>): Promise<RpcResponse> {
  const id = nextId++;
  const waiter = new Promise<RpcResponse>((resolve) => {
    transportMock.pending.set(id, resolve as (message: Record<string, unknown>) => void);
  });

  const transport = transportMock.transports[transportMock.transports.length - 1];
  if (transport === undefined) {
    throw new Error('The server never connected a transport');
  }
  (transport.onmessage as (message: unknown, extra: unknown) => void)(
    { jsonrpc: '2.0', id, method, params },
    { sessionId: undefined }
  );

  return waiter;
}

async function listTools(): Promise<ToolDefinition[]> {
  const response = await rpc('tools/list');
  return ((response.result as { tools: ToolDefinition[] }).tools ?? []);
}

function toolNames(): Promise<string[]> {
  return listTools().then((tools) => tools.map((t) => t.name).sort());
}

describe('Server Integration Tests', () => {
  let mcpServer: MCPServer;

  beforeAll(() => {
    // Pin the clock so the quote fixture's regularMarketTime is a plausible "now" and the
    // tool-side dataAge math is deterministic.
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    clientState.failInitialize = false;
    clientState.initializeCalls = 0;
    clientState.shutdownCalls = 0;
    clientState.quoteCalls = [];
    clientState.financialsCalls = [];
  });

  afterEach(async () => {
    if (mcpServer !== undefined) {
      await mcpServer.shutdown();
      mcpServer = undefined as unknown as MCPServer;
    }
  });

  async function startServer(options?: { serverVersion?: string }): Promise<MCPServer> {
    const server = new MCPServer(options === undefined ? {} : options);
    await server.initialize();
    return server;
  }

  describe('Server Initialization', () => {
    it('should reach the ready state through initialize()', async () => {
      mcpServer = await startServer({ serverVersion: '2.0.0' });

      expect(mcpServer.getState()).toBe('ready');
      expect(clientState.initializeCalls).toBe(1);
    });

    it('should construct the client before the handlers are registered', async () => {
      clientState.failInitialize = true;

      const server = new MCPServer({});
      await expect(server.initialize()).rejects.toThrow('Yahoo session could not be established');

      // The catch in initialize() sets 'stopped' and rethrows, so a half-initialized server
      // never advertises 'ready'.
      expect(server.getState()).toBe('stopped');
    });

    it('should connect the stdio transport inside initialize(), because there is no start()', async () => {
      mcpServer = await startServer({ serverVersion: '2.0.0' });

      const transport = transportMock.transports[transportMock.transports.length - 1];

      expect(typeof transport.start).toBe('function');
      expect(transport.start).toHaveBeenCalledTimes(1);
      expect(typeof transport.onmessage).toBe('function');
      expect(typeof (mcpServer as unknown as { start?: unknown }).start).toBe('undefined');
    });

    it('should advertise the tools, resources and prompts capabilities', async () => {
      mcpServer = await startServer({ serverVersion: '2.0.0' });

      const response = await rpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'integration-suite', version: '1.0.0' }
      });

      const result = response.result as {
        capabilities: Record<string, unknown>;
        serverInfo: { name: string; version: string };
        protocolVersion: string;
      };

      expect(Object.keys(result.capabilities).sort()).toEqual(['prompts', 'resources', 'tools']);
      expect(result.serverInfo.name).toBe(defaultConfig.serverInfo.name);
      expect(result.protocolVersion).toBeDefined();
    });

    it('should take the protocol version from the process entry, not from the class default', async () => {
      mcpServer = await startServer({ serverVersion: '2.0.0' });

      const withOption = (await rpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'a', version: 'b' }
      })) as { result: { serverInfo: { version: string } } };

      expect(withOption.result.serverInfo.version).toBe('2.0.0');

      await mcpServer.shutdown();
      mcpServer = await startServer();

      const withoutOption = (await rpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'a', version: 'b' }
      })) as { result: { serverInfo: { version: string } } };

      // src/index.ts is the only reader of package.json; constructing MCPServer directly
      // falls back to config.serverInfo.version, which defaults to an empty string.
      expect(withoutOption.result.serverInfo.version).toBe('');
    });
  });

  describe('Tool Registration', () => {
    beforeEach(async () => {
      mcpServer = await startServer({ serverVersion: '2.0.0' });
    });

    it('should register exactly the seventeen callable tools', async () => {
      const names = await toolNames();

      expect(names).toEqual([...CALLABLE_TOOLS].sort());
      expect(names).toHaveLength(17);
    });

    it('should register the quote tools', async () => {
      const names = await toolNames();

      expect(names).toContain('get_quote');
      expect(names).toContain('get_quote_summary');
    });

    it('should register both historical tools through the shared dispatch map', async () => {
      const names = await toolNames();

      expect(names).toContain('get_historical_prices');
      expect(names).toContain('get_historical_prices_multi');
    });

    it('should register all three financial statement tools', async () => {
      const names = await toolNames();

      expect(names).toContain('get_balance_sheet');
      expect(names).toContain('get_income_statement');
      expect(names).toContain('get_cash_flow_statement');
    });

    it('should register one holders tool, not a per-holder-class tool each', async () => {
      const names = await toolNames();

      expect(names).toContain('get_major_holders');

      // There is no get_institutional_holders / get_mutual_fund_holders tool: holders.ts
      // folds every ownership class into the single get_major_holders payload.
      expect(names).not.toContain('get_institutional_holders');
      expect(names).not.toContain('get_mutual_fund_holders');
    });

    it('should register get_news, not get_company_news or get_market_news', async () => {
      const names = await toolNames();

      expect(names).toContain('get_news');
      expect(names).not.toContain('get_company_news');
      expect(names).not.toContain('get_market_news');
    });

    it('should register get_options only, and get_earnings and get_analysis once each', async () => {
      const names = await toolNames();

      expect(names).toContain('get_options');
      expect(names).not.toContain('get_options_chain');
      expect(names).toContain('get_earnings');
      expect(names).not.toContain('get_earnings_trend');
      expect(names).toContain('get_analysis');
      expect(names).not.toContain('get_recommendation_trend');
    });

    it('should register the five summary-domain tools', async () => {
      const names = await toolNames();

      expect(names).toContain('get_summary_profile');
      expect(names).toContain('get_crypto_quote');
      expect(names).toContain('get_forex_quote');
      expect(names).toContain('get_trending_symbols');
      expect(names).toContain('screener');
    });

    it('should give every tool a non-empty description', async () => {
      const tools = await listTools();

      expect(tools.length).toBeGreaterThan(0);
      for (const tool of tools) {
        expect(typeof tool.description).toBe('string');
        expect((tool.description ?? '').length).toBeGreaterThan(0);
      }
    });

    it('should give every tool an object input schema with properties', async () => {
      const tools = await listTools();

      for (const tool of tools) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema?.type).toBe('object');
        expect(tool.inputSchema?.properties).toBeDefined();
        expect(Object.keys(tool.inputSchema?.properties ?? {}).length).toBeGreaterThan(0);
      }
    });

    it('should require a target key on every tool that needs one', async () => {
      const tools = await listTools();

      const withoutRequired = tools
        .filter((tool) => (tool.inputSchema?.required ?? []).length === 0)
        .map((tool) => tool.name);

      // get_trending_symbols is the only market-wide tool that declares no required key;
      // screener requires `filters` even though the handler ignores them.
      expect(withoutRequired).toEqual(['get_trending_symbols']);

      const screener = tools.find((t) => t.name === 'screener');
      expect(screener?.inputSchema?.required).toEqual(['filters']);

      for (const tool of tools.filter((t) => !withoutRequired.includes(t.name) && t.name !== 'screener')) {
        const required = tool.inputSchema?.required ?? [];
        expect(required.some((key) => key === 'symbol' || key === 'symbols' || key === 'pairs')).toBe(true);
      }

      // get_forex_quote is the only tool keyed by `pairs` rather than symbol/symbols, because
      // the handler validates FX pairs with a different grammar.
      const forex = tools.find((t) => t.name === 'get_forex_quote');
      expect(forex?.inputSchema?.required).toEqual(['pairs']);
    });

    it('should keep the registry and the dispatch map in step', async () => {
      const advertised = await toolNames();
      const handlers = (mcpServer as unknown as {
        toolHandlers: Map<string, unknown>;
      }).toolHandlers;

      expect([...handlers.keys()].sort()).toEqual(advertised);
    });

    it('should disagree with the handler about the statement period key', async () => {
      const tools = await listTools();
      const balanceSheet = tools.find((t) => t.name === 'get_balance_sheet');

      // Defect: the registry advertises `period` while FinancialsInputSchema parses
      // `frequency`, and no schema uses .strict(). A client that sends
      // { period: 'quarterly' } is silently served annual data.
      expect(Object.keys(balanceSheet?.inputSchema?.properties ?? {})).toContain('period');
      expect(Object.keys(balanceSheet?.inputSchema?.properties ?? {})).not.toContain('frequency');
    });

    it('should advertise a news count key the handler reads as limit', async () => {
      const tools = await listTools();
      const news = tools.find((t) => t.name === 'get_news');

      // Same class of drift: get_news is advertised with `count`, NewsInputSchema reads `limit`.
      expect(Object.keys(news?.inputSchema?.properties ?? {})).toContain('count');
      expect(Object.keys(news?.inputSchema?.properties ?? {})).not.toContain('limit');
    });

    it('should advertise 100 quote symbols while the validator caps the batch at 50', async () => {
      const tools = await listTools();
      const quote = tools.find((t) => t.name === 'get_quote');
      const symbols = quote?.inputSchema?.properties?.symbols as { maxItems: number };

      expect(symbols.maxItems).toBe(100);

      const response = await rpc('tools/call', {
        name: 'get_quote',
        arguments: { symbols: Array.from({ length: 51 }, (_unused, i) => `SYM${i}`) }
      });

      const content = (response.result as { content: Array<{ text: string }> }).content;
      expect(JSON.parse(content[0].text).error).toMatch(/Maximum 50 symbols per request/);
      expect((response.result as { isError?: boolean }).isError).toBe(true);
    });
  });

  describe('Resource Registration', () => {
    beforeEach(async () => {
      mcpServer = await startServer({ serverVersion: '2.0.0' });
    });

    it('should list the six ticker resource templates as resources', async () => {
      const response = await rpc('resources/list');
      const resources = (response.result as { resources: Array<{ uri: string; name: string }> }).resources;

      expect(resources.map((r) => r.uri).sort()).toEqual([...RESOURCE_TEMPLATES].sort());
      expect(resources).toHaveLength(6);
    });

    it('should answer resources/templates/list explicitly', async () => {
      const response = await rpc('resources/templates/list');
      const templates = (response.result as {
        resourceTemplates: Array<{ uriTemplate: string; name: string; mimeType: string }>;
      }).resourceTemplates;

      expect(templates.map((t) => t.uriTemplate).sort()).toEqual([...RESOURCE_TEMPLATES].sort());
      for (const template of templates) {
        expect(template.mimeType).toBe('application/json');
      }
    });

    it('should not register documentation or market-status resources', async () => {
      const response = await rpc('resources/list');
      const resources = (response.result as { resources: Array<{ name: string }> }).resources;

      // The old suite expected a 'Documentation' and a 'Market Status' resource; the server
      // only ever registers the six ticker templates.
      expect(resources.some((r) => r.name === 'Documentation')).toBe(false);
      expect(resources.some((r) => r.name === 'Market Status')).toBe(false);
    });

    it('should give every resource a non-empty name and description', async () => {
      const response = await rpc('resources/list');
      const resources = (response.result as {
        resources: Array<{ uri: string; name: string; description: string }>;
      }).resources;

      for (const resource of resources) {
        expect(resource.uri.length).toBeGreaterThan(0);
        expect(resource.name.length).toBeGreaterThan(0);
        expect(resource.description).toBe(`Resource for ${resource.uri}`);
      }
    });
  });

  describe('Prompt Registration', () => {
    beforeEach(async () => {
      mcpServer = await startServer({ serverVersion: '2.0.0' });
    });

    it('should register the six inline prompts', async () => {
      const response = await rpc('prompts/list');
      const prompts = (response.result as { prompts: Array<{ name: string }> }).prompts;

      expect(prompts.map((p) => p.name).sort()).toEqual([...PROMPT_NAMES].sort());
    });

    it('should name the health prompt financial_health_check', async () => {
      const response = await rpc('prompts/list');
      const names = ((response.result as { prompts: Array<{ name: string }> }).prompts).map((p) => p.name);

      expect(names).toContain('financial_health_check');
      expect(names).not.toContain('financial_health');
      expect(names).not.toContain('trend_analysis');
      expect(names).not.toContain('portfolio_analysis');
    });

    it('should describe every prompt and type every argument', async () => {
      const response = await rpc('prompts/list');
      const prompts = (response.result as {
        prompts: Array<{ name: string; description?: string; arguments: Array<{ name: string; required: boolean }> }>;
      }).prompts;

      for (const prompt of prompts) {
        expect((prompt.description ?? '').length).toBeGreaterThan(0);
        expect(Array.isArray(prompt.arguments)).toBe(true);

        for (const argument of prompt.arguments) {
          expect(typeof argument.name).toBe('string');
          expect(typeof argument.required).toBe('boolean');
        }
      }

      const analyzeStock = prompts.find((p) => p.name === 'analyze_stock');
      expect(analyzeStock?.arguments.map((a) => a.name)).toEqual(['symbol', 'include_recommendations']);
      expect(analyzeStock?.arguments[0].required).toBe(true);
    });
  });

  describe('Tool Execution', () => {
    beforeEach(async () => {
      mcpServer = await startServer({ serverVersion: '2.0.0' });
    });

    it('should wrap a handler result as text content', async () => {
      const response = await rpc('tools/call', {
        name: 'get_quote',
        arguments: { symbols: ['AAPL'] }
      });

      const result = response.result as {
        content: Array<{ type: string; text: string }>;
        isError?: boolean;
      };

      expect(result.isError).toBeUndefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const payload = JSON.parse(result.content[0].text) as {
        results: Record<string, { data: Record<string, number> }>;
        summary: { totalReturned: number };
      };

      expect(payload.results.AAPL.data.regularMarketPrice).toBe(175.5);
      expect(payload.summary.totalReturned).toBe(1);
      expect(clientState.quoteCalls).toEqual(['AAPL']);
    });

    it('should dispatch every registered tool to its own handler', async () => {
      const unknownTool: string[] = [];

      for (const name of CALLABLE_TOOLS) {
        const response = await rpc('tools/call', {
          name,
          arguments: { symbol: 'AAPL', symbols: ['AAPL'], pairs: ['EURUSD=X'], filters: {} }
        });

        const result = response.result as { content: Array<{ text: string }> };
        const payload = JSON.parse(result.content[0].text) as { error?: string };

        // A registry/dispatch mismatch surfaces as 'Unknown tool', whatever else the handler
        // does with the arguments.
        if (typeof payload.error === 'string' && payload.error.includes('Unknown tool')) {
          unknownTool.push(name);
        }
      }

      expect(unknownTool).toEqual([]);

      const rejected = await rpc('tools/call', { name: 'get_quote', arguments: { symbols: 'AAPL' } });
      const rejectedPayload = JSON.parse(
        (rejected.result as { content: Array<{ text: string }> }).content[0].text
      ) as { error: string };

      expect(rejectedPayload.error).toMatch(/Symbols must be an array/);
    });

    it('should return isError content instead of a JSON-RPC error', async () => {
      const response = await rpc('tools/call', { name: 'get_quote', arguments: {} });

      expect(response.error).toBeUndefined();

      const result = response.result as { isError: boolean; content: Array<{ text: string }> };
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0].text).error).toBeDefined();
    });

    it('should reject an unknown tool as an isError payload, not a protocol error', async () => {
      const response = await rpc('tools/call', { name: 'non_existent_tool', arguments: {} });
      const result = response.result as { isError: boolean; content: Array<{ text: string }> };

      expect(response.error).toBeUndefined();
      expect(result.isError).toBe(true);
      expect(JSON.parse(result.content[0].text).error).toMatch(/Unknown tool: non_existent_tool/);
    });

    it('should count metrics for successes and failures separately', async () => {
      await rpc('tools/call', { name: 'get_quote', arguments: { symbols: ['AAPL'] } });
      await rpc('tools/call', { name: 'non_existent_tool', arguments: {} });

      const metrics = mcpServer.getMetrics();

      expect(metrics.requestCount).toBe(2);
      expect(metrics.successCount).toBe(1);
      expect(metrics.errorCount).toBe(1);
    });

    it('should refuse tool calls once the server has left the ready state', async () => {
      await mcpServer.shutdown();

      const response = await rpc('tools/call', { name: 'get_quote', arguments: { symbols: ['AAPL'] } });

      // `state` gates every request path; a stopped server answers with a protocol error
      // rather than dispatching.
      expect(response.error?.message).toMatch(/Server is not ready\. Current state: stopped/);
    });
  });

  describe('Resource Reading', () => {
    beforeEach(async () => {
      mcpServer = await startServer({ serverVersion: '2.0.0' });
    });

    it('should read a ticker quote resource', async () => {
      const response = await rpc('resources/read', { uri: 'ticker://AAPL/quote' });
      const contents = (response.result as {
        contents: Array<{ uri: string; mimeType: string; text: string }>;
      }).contents;

      expect(contents).toHaveLength(1);
      expect(contents[0].uri).toBe('ticker://AAPL/quote');
      expect(contents[0].mimeType).toBe('application/json');
      expect(JSON.parse(contents[0].text).price.regularMarketPrice).toBe(175.5);
      expect(clientState.quoteCalls).toEqual(['AAPL']);
    });

    it('should route each resource type to its own client method', async () => {
      await rpc('resources/read', { uri: 'ticker://AAPL/profile' });
      await rpc('resources/read', { uri: 'ticker://AAPL/financials' });

      expect(clientState.quoteCalls).toContain('AAPL');
      expect(clientState.financialsCalls).toEqual(['AAPL']);
    });

    it('should rethrow a resource failure as a JSON-RPC error', async () => {
      const response = await rpc('resources/read', { uri: 'invalid://resource' });

      // Tool failures come back as isError content; resource failures rethrow, so the client
      // sees a protocol error instead.
      expect(response.error).toBeDefined();
      expect(response.error?.message).toMatch(/Invalid resource URI/);
    });

    it('should reject an unknown resource type inside a valid URI', async () => {
      const response = await rpc('resources/read', { uri: 'ticker://AAPL/dividends' });

      expect(response.error?.message).toMatch(/Unknown resource type: dividends/);
    });

    it('should reject a lowercase symbol in a resource URI', async () => {
      const response = await rpc('resources/read', { uri: 'ticker://aapl/quote' });

      // InputValidator's grammar is /^[A-Z0-9.\-\^]+$/, so lowercase fails as invalid chars.
      expect(response.error?.message).toMatch(/Symbol contains invalid characters/);
    });
  });

  describe('Prompt Execution', () => {
    beforeEach(async () => {
      mcpServer = await startServer({ serverVersion: '2.0.0' });
    });

    it('should render the analyze_stock prompt', async () => {
      const response = await rpc('prompts/get', {
        name: 'analyze_stock',
        arguments: { symbol: 'AAPL', include_recommendations: 'true' }
      });

      const messages = (response.result as {
        messages: Array<{ role: string; content: { type: string; text: string } }>;
      }).messages;

      expect(messages).toHaveLength(1);
      expect(messages[0].role).toBe('user');
      expect(messages[0].content.type).toBe('text');
      expect(messages[0].content.text).toContain('AAPL');
      expect(messages[0].content.text).toContain('Analyst recommendations');
    });

    it('should omit the recommendations section unless it is exactly the string true', async () => {
      const response = await rpc('prompts/get', {
        name: 'analyze_stock',
        arguments: { symbol: 'AAPL', include_recommendations: 'yes' }
      });

      const text = (
        (response.result as { messages: Array<{ content: { text: string } }> }).messages[0].content
      ).text;

      expect(text).not.toContain('Analyst recommendations');
    });

    it('should render compare_stocks with its metrics line', async () => {
      const response = await rpc('prompts/get', {
        name: 'compare_stocks',
        arguments: { symbols: 'AAPL,MSFT', metrics: 'P/E, market cap' }
      });

      const text = (
        (response.result as { messages: Array<{ content: { text: string } }> }).messages[0].content
      ).text;

      expect(text).toContain('AAPL,MSFT');
      expect(text).toContain('P/E, market cap');
    });

    it('should not validate required prompt arguments', async () => {
      const response = await rpc('prompts/get', { name: 'analyze_stock', arguments: {} });

      // prompts/get only checks the NAME; the required flag from prompts/list is never
      // enforced, so a missing symbol renders into the text as the string 'undefined'.
      expect(response.error).toBeUndefined();

      const text = (
        (response.result as { messages: Array<{ content: { text: string } }> }).messages[0].content
      ).text;

      expect(text).toContain('undefined');
    });

    it('should return a protocol error for an unknown prompt', async () => {
      const response = await rpc('prompts/get', { name: 'non_existent_prompt', arguments: {} });

      expect(response.error?.message).toMatch(/Unknown prompt: non_existent_prompt/);
    });
  });

  describe('Server Shutdown', () => {
    it('should stop the client and clear the module caches', async () => {
      mcpServer = await startServer({ serverVersion: '2.0.0' });

      await mcpServer.shutdown();

      expect(clientState.shutdownCalls).toBe(1);
      expect(mcpServer.getState()).toBe('stopped');
    });

    it('should never close the transport, because shutdown() does not touch it', async () => {
      mcpServer = await startServer({ serverVersion: '2.0.0' });
      const transport = transportMock.transports[transportMock.transports.length - 1];

      await mcpServer.shutdown();

      // Defect: shutdown() resets the client, caches, limiter and breaker but never calls
      // server.close(), so the stdio transport is left open.
      expect(transport.close).not.toHaveBeenCalled();
    });

    it('should be a no-op on the second call', async () => {
      mcpServer = await startServer({ serverVersion: '2.0.0' });

      await mcpServer.shutdown();
      await mcpServer.shutdown();

      expect(clientState.shutdownCalls).toBe(1);
      expect(mcpServer.getState()).toBe('stopped');
    });

    it('should not be safe to shut down before initialize() has run', async () => {
      mcpServer = new MCPServer({ serverVersion: '2.0.0' });

      expect(mcpServer.getState()).toBe('initializing');

      // Defect: the guard in shutdown() only skips 'shutting_down' and 'stopped', so an
      // un-initialized server takes the body path and dereferences the client that
      // initializeServices() never assigned.
      await expect(mcpServer.shutdown()).rejects.toBeInstanceOf(TypeError);
      expect(mcpServer.getState()).toBe('stopped');
      expect(clientState.shutdownCalls).toBe(0);
    });
  });

  describe('Stats Surface', () => {
    it('should aggregate every layer in getStats()', async () => {
      mcpServer = await startServer({ serverVersion: '2.0.0' });

      const stats = await mcpServer.getStats();

      expect(stats.server.state).toBe('ready');
      expect(typeof stats.server.uptime).toBe('number');
      expect(stats.circuitBreaker.state).toBe('CLOSED');
      expect(stats.circuitBreaker.failureCount).toBe(0);
      expect(stats.cache).toHaveProperty('entries');
      expect(stats.rateLimiter).toHaveProperty('tokens');
      expect(stats.yahooClient).toHaveProperty('rateLimiter');
      expect(stats.metrics.requestCount).toBe(0);
    });

    it('should return a copy of the metrics object', async () => {
      mcpServer = await startServer({ serverVersion: '2.0.0' });

      const first = mcpServer.getMetrics();
      first.requestCount = 999;

      expect(mcpServer.getMetrics().requestCount).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should report an unknown method as a protocol error', async () => {
      mcpServer = await startServer({ serverVersion: '2.0.0' });

      const response = await rpc('completion/complete', { ref: {}, argument: {} });

      expect(response.error?.message).toBe('Method not found');
    });

    it('should keep serving after a handler throws', async () => {
      mcpServer = await startServer({ serverVersion: '2.0.0' });

      await rpc('tools/call', { name: 'get_quote', arguments: {} });

      const response = await rpc('tools/call', { name: 'get_quote', arguments: { symbols: ['AAPL'] } });
      const result = response.result as { isError?: boolean };

      expect(result.isError).toBeUndefined();
      expect(mcpServer.getState()).toBe('ready');
    });

    it('should expose the server-owned middleware only through getStats()', async () => {
      mcpServer = await startServer({ serverVersion: '2.0.0' });

      const internals = mcpServer as unknown as Record<string, { reset?: unknown; getStats?: unknown }>;

      // The server constructs its own RateLimiter/CircuitBreaker/Cache and the client
      // constructs another set; only the client's set sees requests, so the server-owned
      // counters stay at zero no matter how many tools are called.
      expect(typeof internals.rateLimiter.reset).toBe('function');
      expect(typeof internals.circuitBreaker.reset).toBe('function');
      expect(typeof internals.cache.getStats).toBe('function');

      await rpc('tools/call', { name: 'get_quote', arguments: { symbols: ['AAPL'] } });

      const stats = await mcpServer.getStats();
      expect(stats.cache.entries).toBe(0);
      expect(stats.rateLimiter.totalRequests).toBe(0);
    });
  });
});
