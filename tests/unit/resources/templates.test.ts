/**
 * Real coverage for the MCP resource surface registered by `src/server.ts`
 * (`registerResources`, lines 595-676). This file replaces the old `expect(true).toBe(true)`
 * placeholder that `tests/AGENTS.md` flagged as covering nothing.
 *
 * Approach is the one `tests/integration/server/server.integration.test.ts` uses: the stdio
 * transport is mocked so the test can push JSON-RPC messages into `transport.onmessage` and
 * read replies out of `transport.send`, which means the assertions run against the handlers
 * actually registered on the SDK `Server` — including `ListResourceTemplatesRequestSchema`,
 * which before 2026-10-13 answered `resources/templates/list` with -32601 Method not found.
 * The Yahoo client is stubbed, because the real one warms live quotes in `initialize()`.
 *
 * Asymmetries this suite pins rather than smooths over:
 *  - `resources/read` gates on `state === 'ready'`; `resources/list` and
 *    `resources/templates/list` do not check `state` at all.
 *  - Resource failures RETHROW, so the client sees a JSON-RPC `error` envelope; tool failures
 *    return `isError: true` content instead (`src/AGENTS.md`: "tool failures return
 *    isError content (:582-585), resource failures rethrow (:657)").
 *  - Resource text is compact `JSON.stringify(result)`; tool text is pretty-printed.
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MCPServer } from '../../../src/server';
import { YahooFinanceClient } from '../../../src/services/yahoo-finance';

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

jest.mock('../../../src/services/yahoo-finance', () => {
  const state = {
    initializeCalls: 0,
    shutdownCalls: 0,
    // Records every data call the resource handlers make, as `<method>:<symbol>`.
    calls: [] as string[],
    lastFinancialsType: undefined as string | undefined,
    // When set, every data method rejects — the seam used to prove resource failures rethrow.
    failDataCalls: false,
    payloads: {
      quote: { price: { symbol: 'AAPL', regularMarketPrice: 175.5 }, meta: { currency: 'USD' } },
      profile: { assetProfile: { sector: 'Technology' } },
      financials: { incomeStatementHistory: { incomeStatementHistory: [] } },
      historical: { timestamps: [], meta: { symbol: 'AAPL' }, indicators: { quote: [], adjclose: [] } },
      news: { count: 0, news: [] },
      analysis: { analystOpinion: undefined }
    }
  };

  class YahooFinanceClientMock {
    static clientState = state;

    initialize(): Promise<void> {
      state.initializeCalls++;
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
      state.calls.push(`getQuote:${symbol}`);
      if (state.failDataCalls) {
        return Promise.reject(new Error('Yahoo Finance API unavailable'));
      }
      return Promise.resolve(state.payloads.quote);
    }

    getSummaryProfile(symbol: string): Promise<unknown> {
      state.calls.push(`getSummaryProfile:${symbol}`);
      return Promise.resolve(state.payloads.profile);
    }

    getFinancials(symbol: string, type?: string): Promise<unknown> {
      state.calls.push(`getFinancials:${symbol}`);
      state.lastFinancialsType = type;
      return Promise.resolve(state.payloads.financials);
    }

    getHistoricalPrices(symbol: string): Promise<unknown> {
      state.calls.push(`getHistoricalPrices:${symbol}`);
      return Promise.resolve(state.payloads.historical);
    }

    getNews(symbol: string): Promise<unknown> {
      state.calls.push(`getNews:${symbol}`);
      return Promise.resolve(state.payloads.news);
    }

    getAnalysis(symbol: string): Promise<unknown> {
      state.calls.push(`getAnalysis:${symbol}`);
      return Promise.resolve(state.payloads.analysis);
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

const clientState = (YahooFinanceClient as unknown as { clientState: {
  calls: string[];
  lastFinancialsType: string | undefined;
  failDataCalls: boolean;
  payloads: Record<string, unknown>;
} }).clientState;

const transportMock = StdioServerTransport as unknown as {
  transports: Array<Record<string, unknown>>;
  pending: Map<number, (message: Record<string, unknown>) => void>;
};

type RpcResponse = {
  id?: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
};

type Resource = { uri: string; name: string; description: string; mimeType: string };
type ResourceTemplate = { uriTemplate: string; name: string; description: string; mimeType: string };
type ResourceContents = { uri: string; mimeType: string; text: string };

// The six templates `registerResources` hardcodes; it is the only source of resources the
// server has — there is no Documentation or Market Status resource.
const RESOURCE_URIS = [
  'ticker://{symbol}/quote',
  'ticker://{symbol}/profile',
  'ticker://{symbol}/financials',
  'ticker://{symbol}/historical',
  'ticker://{symbol}/news',
  'ticker://{symbol}/analysis'
];

const READ_PATHS: Array<{ path: string; method: string }> = [
  { path: 'quote', method: 'getQuote' },
  { path: 'profile', method: 'getSummaryProfile' },
  { path: 'financials', method: 'getFinancials' },
  { path: 'historical', method: 'getHistoricalPrices' },
  { path: 'news', method: 'getNews' },
  { path: 'analysis', method: 'getAnalysis' }
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

async function listResources(): Promise<Resource[]> {
  const response = await rpc('resources/list');
  return ((response.result as { resources: Resource[] }).resources ?? []);
}

async function listTemplates(): Promise<ResourceTemplate[]> {
  const response = await rpc('resources/templates/list');
  return ((response.result as { resourceTemplates: ResourceTemplate[] }).resourceTemplates ?? []);
}

function contentsOf(response: RpcResponse): ResourceContents[] {
  return ((response.result as { contents: ResourceContents[] }).contents ?? []);
}

describe('MCP resource surface (src/server.ts registerResources)', () => {
  let mcpServer: MCPServer;

  beforeEach(async () => {
    clientState.calls = [];
    clientState.lastFinancialsType = undefined;
    clientState.failDataCalls = false;
    mcpServer = new MCPServer({ serverVersion: '2.0.0' });
    await mcpServer.initialize();
    expect(mcpServer.getState()).toBe('ready');
  });

  afterEach(async () => {
    if (mcpServer !== undefined) {
      await mcpServer.shutdown();
      mcpServer = undefined as unknown as MCPServer;
    }
  });

  describe('resources/list (ListResourcesRequestSchema)', () => {
    it('answers with exactly the six ticker resource URIs', async () => {
      const resources = await listResources();

      expect(resources.map((r) => r.uri).sort()).toEqual([...RESOURCE_URIS].sort());
      expect(resources).toHaveLength(6);
    });

    it('names each resource by its URI with the {symbol} placeholder rendered as [symbol]', async () => {
      const resources = await listResources();

      expect(resources.map((r) => r.name).sort()).toEqual([
        '[symbol]/analysis',
        '[symbol]/financials',
        '[symbol]/historical',
        '[symbol]/news',
        '[symbol]/profile',
        '[symbol]/quote'
      ]);
    });

    it('describes every resource as `Resource for <uri>` and types it application/json', async () => {
      const resources = await listResources();

      for (const resource of resources) {
        expect(resource.description).toBe(`Resource for ${resource.uri}`);
        expect(resource.mimeType).toBe('application/json');
      }
    });

    it('serves the list statically without touching the Yahoo client', async () => {
      await listResources();
      await listResources();

      expect(clientState.calls).toEqual([]);
    });
  });

  describe('resources/templates/list (ListResourceTemplatesRequestSchema)', () => {
    it('is answered explicitly rather than as -32601 Method not found', async () => {
      const response = await rpc('resources/templates/list');

      // Before `ListResourceTemplatesRequestSchema` was registered this came back as
      // { error: { code: -32601, message: 'Method not found' } }.
      expect(response.error).toBeUndefined();
      expect(response.result).toBeDefined();
      expect(Array.isArray((response.result as { resourceTemplates: unknown[] }).resourceTemplates)).toBe(true);
    });

    it('reports the same six URI templates as resources/list', async () => {
      const templates = await listTemplates();

      expect(templates.map((t) => t.uriTemplate).sort()).toEqual([...RESOURCE_URIS].sort());
      expect(templates).toHaveLength(6);
      for (const template of templates) {
        expect(template.uriTemplate).toContain('{symbol}');
        expect(template.uriTemplate.startsWith('ticker://')).toBe(true);
      }
    });

    it('names each template by its URI with the placeholder rendered as the bare word symbol', async () => {
      const templates = await listTemplates();

      // The list handler substitutes '[symbol]', the template handler substitutes 'symbol' —
      // the two name derivations are not the same string.
      expect(templates.map((t) => t.name).sort()).toEqual([
        'symbol/analysis',
        'symbol/financials',
        'symbol/historical',
        'symbol/news',
        'symbol/profile',
        'symbol/quote'
      ]);
    });

    it('types every template application/json with the shared description', async () => {
      const templates = await listTemplates();

      for (const template of templates) {
        expect(template.mimeType).toBe('application/json');
        expect(template.description).toBe(`Resource for ${template.uriTemplate}`);
      }
    });

    it('advertises the resources capability that makes the templates reachable', async () => {
      const response = await rpc('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'templates-unit-suite', version: '1.0.0' }
      });

      const capabilities = (response.result as { capabilities: Record<string, unknown> }).capabilities;
      expect(Object.keys(capabilities).sort()).toEqual(['prompts', 'resources', 'tools']);
    });
  });

  describe('resources/read (ReadResourceRequestSchema)', () => {
    it('reads a ticker quote resource through the documented URI path', async () => {
      const response = await rpc('resources/read', { uri: 'ticker://AAPL/quote' });

      expect(response.error).toBeUndefined();
      const contents = contentsOf(response);
      expect(contents).toHaveLength(1);
      expect(contents[0].uri).toBe('ticker://AAPL/quote');
      expect(contents[0].mimeType).toBe('application/json');
      expect(JSON.parse(contents[0].text)).toEqual(clientState.payloads.quote);
      expect(clientState.calls).toEqual(['getQuote:AAPL']);
    });

    it.each(READ_PATHS)('routes ticker://{symbol}/$path to $method', async ({ path, method }) => {
      clientState.calls = [];
      const response = await rpc('resources/read', { uri: `ticker://MSFT/${path}` });

      expect(response.error).toBeUndefined();
      expect(contentsOf(response)[0].uri).toBe(`ticker://MSFT/${path}`);
      expect(clientState.calls).toEqual([`${method}:MSFT`]);
    });

    it('passes the income-statement period when reading financials', async () => {
      await rpc('resources/read', { uri: 'ticker://AAPL/financials' });

      expect(clientState.lastFinancialsType).toBe('income-statement');
    });

    it('echoes the requested URI verbatim, including a symbol the templates never advertised', async () => {
      const response = await rpc('resources/read', { uri: 'ticker://NVDA/news' });

      expect(contentsOf(response)[0].uri).toBe('ticker://NVDA/news');
    });

    it('serializes resource text compactly, unlike the pretty-printed tool text', async () => {
      const contents = contentsOf(await rpc('resources/read', { uri: 'ticker://AAPL/quote' }));

      expect(contents[0].text).not.toContain('\n');
      expect(JSON.parse(contents[0].text).price.regularMarketPrice).toBe(175.5);
    });

    it('validates the symbol grammar, so a lowercase ticker is refused', async () => {
      const response = await rpc('resources/read', { uri: 'ticker://aapl/quote' });

      // InputValidator's grammar is /^[A-Z0-9.\-\^]+$/.
      expect(response.error?.message).toMatch(/Symbol contains invalid characters/);
    });
  });

  describe('resource failures rethrow where tool failures degrade to isError content', () => {
    it('turns an unparseable URI into a JSON-RPC error', async () => {
      const response = await rpc('resources/read', { uri: 'invalid://resource' });

      expect(response.result).toBeUndefined();
      expect(response.error).toBeDefined();
      // `securityMiddleware.sanitizeError` strips `//` from the message on the way out, so the
      // client sees `invalid:[REDACTED]` rather than the URI it sent.
      expect(response.error?.message).toMatch(/^Invalid resource URI: invalid:/);
      expect(response.error?.message).toContain('[REDACTED]');
    });

    it('turns an unknown resource type inside a valid URI into a JSON-RPC error', async () => {
      const response = await rpc('resources/read', { uri: 'ticker://AAPL/dividends' });

      expect(response.error?.message).toMatch(/Unknown resource type: dividends/);
      expect(clientState.calls).toEqual([]);
    });

    it('turns an upstream resource failure into a JSON-RPC error, not an isError payload', async () => {
      clientState.failDataCalls = true;

      const response = await rpc('resources/read', { uri: 'ticker://AAPL/quote' });

      // The read handler catches only to rethrow (`src/server.ts:671-674`), so a service
      // failure reaches the client as a protocol error — the opposite of tools/call.
      expect(response.result).toBeUndefined();
      expect(response.error).toBeDefined();
      expect(response.error?.message).toMatch(/unavailable/i);
      expect(clientState.calls).toEqual(['getQuote:AAPL']);
    });

    it('still answers resources/list and resources/templates/list once the server has left the ready state', async () => {
      await mcpServer.shutdown();

      expect(mcpServer.getState()).toBe('stopped');

      // Asymmetry: the list handlers never check `this.state`, so a stopped server keeps
      // advertising resources.
      const resources = await listResources();
      const templates = await listTemplates();
      expect(resources).toHaveLength(6);
      expect(templates).toHaveLength(6);
    });

    it('refuses resources/read by protocol error once the server has left the ready state', async () => {
      await mcpServer.shutdown();

      const response = await rpc('resources/read', { uri: 'ticker://AAPL/quote' });

      expect(mcpServer.getState()).toBe('stopped');
      expect(response.result).toBeUndefined();
      expect(response.error?.message).toMatch(/Server is not ready\. Current state: stopped/);
    });

    it('contrasts the two failure envelopes on the same server', async () => {
      const tool = await rpc('tools/call', { name: 'get_quote', arguments: {} });
      const resource = await rpc('resources/read', { uri: 'invalid://resource' });

      // Tool failure: HTTP-200-style result carrying isError content.
      expect(tool.error).toBeUndefined();
      expect((tool.result as { isError: boolean }).isError).toBe(true);

      // Resource failure: the handler rethrows, so the SDK emits a protocol error.
      expect(resource.result).toBeUndefined();
      expect(resource.error).toBeDefined();
    });
  });
});
