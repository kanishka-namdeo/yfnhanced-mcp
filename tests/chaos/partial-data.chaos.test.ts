import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { existsSync } from 'fs';
import { YahooFinanceClient } from '../../src/services/yahoo-finance';
import { DataQualityReporter } from '../../src/utils/data-completion';
import { YahooFinanceError, YF_ERR_API_CHANGED, YF_ERR_DATA_INCOMPLETE, YF_ERR_DATA_UNAVAILABLE, YF_ERR_PARTIAL_DATA, type DataWarning } from '../../src/types/errors';
import { partialDataScenarios, qualityMetrics } from '../fixtures/test-data.ts';

const SERVER_PATH = path.resolve(__dirname, '../../dist/index.js');

const CRITICAL_PRICE_FIELDS = [
  'price.regularMarketPrice',
  'price.regularMarketChange',
  'price.regularMarketChangePercent',
  'price.regularMarketPreviousClose',
  'price.regularMarketVolume'
];

type FakeLibrary = Partial<Record<'quote' | 'chart' | 'search' | 'quoteSummary', (arg1: string, arg2?: unknown) => Promise<unknown>>>;

function makeClient(handlers: FakeLibrary, cacheEnabled: boolean): YahooFinanceClient & Record<string, unknown> {
  const client = new YahooFinanceClient({
    serverInfo: { name: 'chaos', version: '0', protocolVersion: '2024-11-05' },
    capabilities: { tools: {} },
    transport: 'stdio',
    rateLimit: { strategy: 'token-bucket', maxRequests: 500, windowMs: 60000, tokenRefillRate: 500, requestsPerMinute: 100000 },
    cache: { enabled: cacheEnabled, store: 'memory', ttl: 60000, maxEntries: 50 },
    retry: {
      enabled: true, maxRetries: 1, initialDelayMs: 1, maxDelayMs: 5,
      strategy: 'fixed', backoffMultiplier: 2, jitter: false,
      retryableStatusCodes: [429, 500], retryableErrorCodes: []
    },
    yahooFinance: { baseUrl: 'https://example.invalid', timeoutMs: 1000, maxConcurrentRequests: 5, requestQueueSize: 10, validateResponses: true, strictMode: false },
    circuitBreaker: { errorThresholdPercentage: 100, halfOpenMaxAttempts: 1, resetTimeoutMs: 60000, rollingCountTimeoutMs: 60000 }
  } as never) as YahooFinanceClient & Record<string, unknown>;

  const noop = async (): Promise<never> => { throw new Error('fake library method not installed'); };
  (client as Record<string, unknown>).yahooFinanceInstance = {
    quote: handlers.quote ?? noop,
    chart: handlers.chart ?? noop,
    search: handlers.search ?? noop,
    quoteSummary: handlers.quoteSummary ?? noop
  };
  return client;
}

function warningFields(client: YahooFinanceClient & Record<string, unknown>): string[] {
  return (client.getWarnings() as DataWarning[]).map(w => w.field);
}

// `validateQuote` does NOT use the client warning buffer; it attaches its findings to the
// returned payload as `quote.warnings`. Only the degradation path (`executeWithMiddleware`)
// writes into `getWarnings()`, which is single-reader and drains on read.
function payloadWarnings(quote: unknown): DataWarning[] {
  return ((quote as { warnings?: DataWarning[] }).warnings ?? []);
}

describe('Partial data chaos (in-process fault injection)', () => {
  describe('sparse quote payloads degrade instead of failing', () => {
    test('a null critical field yields a warning on the payload and a null value, not an error', async () => {
      const client = makeClient({
        quote: async () => ({ symbol: 'AAPL', regularMarketPrice: partialDataScenarios.missingPrice.regularMarketPrice })
      }, false);

      const quote = await client.getQuote('AAPL');
      expect(quote.price.regularMarketPrice).toBeNull();
      expect(payloadWarnings(quote).map(w => w.field)).toContain('price.regularMarketPrice');
      // the client buffer stays empty: quote validation never routes through `addWarning`
      expect(client.getWarnings()).toHaveLength(0);
    });

    test('every missing critical price field is reported, preferred ones as info only', async () => {
      const client = makeClient({ quote: async () => ({ symbol: 'AAPL' }) }, false);
      const quote = await client.getQuote('AAPL');

      const warnings = payloadWarnings(quote);
      const critical = warnings.filter(w => w.severity === 'warning').map(w => w.field);
      expect(critical.sort()).toEqual([...CRITICAL_PRICE_FIELDS].sort());
      expect(warnings.filter(w => w.severity === 'info').map(w => w.field)).toContain('price.currency');
    });

    test('missing volume and market cap are reported, but PE and dividend fields are not tracked at all', async () => {
      const client = makeClient({
        quote: async () => ({
          symbol: 'AAPL',
          regularMarketPrice: 185.92,
          ...partialDataScenarios.missingVolume,
          ...partialDataScenarios.missingMarketCap,
          ...partialDataScenarios.missingPE,
          ...partialDataScenarios.missingDividends
        })
      }, false);

      const quote = await client.getQuote('AAPL');
      const fields = payloadWarnings(quote).map(w => w.field);

      expect(quote.price.regularMarketVolume).toBeNull();
      expect(quote.price.marketCap).toBeNull();
      expect(fields).toContain('price.regularMarketVolume');
      expect(fields).toContain('price.marketCap');
      // `trailingPE` and `dividendYield`/`dividendRate` are not part of PriceData, so their
      // absence is invisible to this layer: no warning is ever emitted for them.
      expect(fields.filter(f => f.includes('PE') || f.includes('dividend'))).toHaveLength(0);
    });

    test('a completely empty payload still returns, flagging the missing symbol', async () => {
      const client = makeClient({ quote: async () => ({}) }, false);
      const quote = await client.getQuote('AAPL');

      expect(quote.price.symbol).toBe('');
      expect(payloadWarnings(quote).map(w => w.field)).toContain('symbol');
    });

    test('the client warning buffer is drained by the first reader', async () => {
      let mode = 'ok';
      const client = makeClient({
        quote: async () => {
          if (mode === 'fail') throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), { code: 'ECONNREFUSED' });
          return { symbol: 'AAPL', regularMarketPrice: 1 };
        }
      }, true);

      await client.getQuote('AAPL');
      mode = 'fail';
      await client.getQuote('AAPL', { forceRefresh: true });

      expect(warningFields(client).length).toBeGreaterThan(0);
      expect(client.getWarnings()).toHaveLength(0);
    });
  });

  describe('shape changes at the library boundary', () => {
    test('a null payload is an API change and is not retried', async () => {
      let calls = 0;
      const client = makeClient({
        quote: async () => { calls++; return null; }
      }, false);

      const error = await client.getQuote('AAPL').then(() => null, (e: unknown) => e as YahooFinanceError);
      expect(calls).toBe(1);
      expect(error?.code).toBe(YF_ERR_API_CHANGED);
    });

    test('numeric fields are not coerced: strings survive verbatim, even non-numeric ones', async () => {
      const client = makeClient({
        quote: async () => ({ symbol: 'AAPL', regularMarketPrice: '185.92', regularMarketVolume: 'not-a-number' })
      }, false);

      const quote = await client.getQuote('AAPL');
      // `toPriceData` only nulls out `undefined` and real NaN, so a string passes through as
      // a value: no coercion, and no "missing field" warning either.
      expect(quote.price.regularMarketPrice).toBe('185.92');
      expect(quote.price.regularMarketVolume).toBe('not-a-number');
      expect(payloadWarnings(quote).map(w => w.field)).not.toContain('price.regularMarketVolume');
    });

    test('an unexpected envelope is served as empty data rather than rejected', async () => {
      const client = makeClient({ quote: async () => ({ data: { quotes: [{ price: 185.92 }] } }) }, false);
      const quote = await client.getQuote('AAPL');

      expect(quote.price.regularMarketPrice).toBeNull();
      expect(payloadWarnings(quote).map(w => w.field)).toContain('symbol');
    });
  });

  describe('batch requests hide per-symbol failures', () => {
    test('one bad symbol in a batch disappears without an error entry', async () => {
      const client = makeClient({
        quote: async (symbol: string) => {
          if (symbol === 'BAD') throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), { code: 'ECONNREFUSED' });
          return { symbol, regularMarketPrice: 10 };
        }
      }, false);

      const batch = await client.getQuotes(['AAPL', 'BAD']) as Record<string, unknown>;

      expect(Object.keys(batch)).toEqual(['AAPL']);
      // Measured defect: `getQuotes` only surfaces `errors` when NO symbol succeeded, so a
      // partial batch silently drops the failed symbol and emits no warning.
      expect(client.getWarnings()).toHaveLength(0);
    });

    test('a fully failed batch throws YF_ERR_DATA_UNAVAILABLE carrying the per-symbol errors', async () => {
      const client = makeClient({
        quote: async () => { throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), { code: 'ECONNREFUSED' }); }
      }, false);

      const error = await client.getQuotes(['AAPL', 'MSFT']).then(() => null, (e: unknown) => e as YahooFinanceError);

      expect(error?.code).toBe(YF_ERR_DATA_UNAVAILABLE);
      expect(Object.keys((error?.context as { errors: Record<string, unknown> }).errors)).toHaveLength(2);
    });
  });

  describe('degradation against cache and partial payloads', () => {
    test('a retryable failure after a cached success serves the cached payload with a warning', async () => {
      let mode = 'ok';
      const client = makeClient({
        quote: async () => {
          if (mode === 'fail') throw Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:443'), { code: 'ECONNREFUSED' });
          return { symbol: 'AAPL', regularMarketPrice: 185.92, regularMarketVolume: 44981879 };
        }
      }, true);

      const fresh = await client.getQuote('AAPL');
      mode = 'fail';
      const degraded = await client.getQuote('AAPL', { forceRefresh: true });

      expect(degraded.price.regularMarketPrice).toBe(fresh.price.regularMarketPrice);
      const warnings = client.getWarnings() as DataWarning[];
      expect(warnings).toHaveLength(1);
      expect(warnings[0].message).toContain('Using cached data due to:');
    });

    test('a partial-data error still returns its carried payload and forwards its warnings', async () => {
      const partialWarnings: DataWarning[] = [{
        field: 'price.marketCap',
        severity: 'warning',
        message: 'marketCap missing from upstream',
        timestamp: new Date()
      }];
      const client = makeClient({
        quote: async () => {
          throw new YahooFinanceError(
            'Incomplete data received', YF_ERR_PARTIAL_DATA, null, false, false, {},
            'Retry for complete data', partialWarnings, { price: { symbol: 'AAPL', regularMarketPrice: 185.92 } }
          );
        }
      }, true);

      const recovered = await client.getQuote('AAPL', { forceRefresh: true }) as { price?: { regularMarketPrice?: number } };

      expect(recovered.price?.regularMarketPrice).toBe(185.92);
      expect(warningFields(client)).toContain('price.marketCap');
    });

    test('with nothing cached and no partial payload the caller gets the classified error', async () => {
      const client = makeClient({
        quote: async () => { throw new Error('data unavailable for delisted symbol'); }
      }, true);

      const error = await client.getQuote('GONE', { forceRefresh: true }).then(() => null, (e: unknown) => e as YahooFinanceError);
      expect(error?.code).toBe(YF_ERR_DATA_UNAVAILABLE);
      expect(client.getWarnings()).toHaveLength(0);
    });
  });

  describe('historical and news shapes', () => {
    test('a chart result without an indicator series is YF_ERR_DATA_INCOMPLETE', async () => {
      const client = makeClient({ chart: async () => ({ meta: { symbol: 'AAPL' }, timestamp: [], indicators: {} }) }, false);
      const error = await client.getHistoricalPrices('AAPL').then(() => null, (e: unknown) => e as YahooFinanceError);

      expect(error?.code).toBe(YF_ERR_DATA_INCOMPLETE);
    });

    test('nulls inside a bar survive into the result untouched', async () => {
      const client = makeClient({
        chart: async () => ({
          meta: { symbol: 'AAPL', regularMarketPrice: 185.92 },
          timestamp: [1703702400],
          indicators: { quote: [{ open: [182.45], high: [184.89], low: [null], close: [184.35], volume: [48215632] }] }
        })
      }, false);

      const historical = await client.getHistoricalPrices('AAPL');
      expect(historical.indicators.quote[0].low).toEqual([null]);
      expect(historical.timestamps).toEqual([1703702400]);
    });

    test('news is validated only for null-ness, so a title-less item is served with a blank title', async () => {
      const items = [
        { title: 'News 1', link: 'https://example.com/1' },
        { title: null, link: 'https://example.com/2' }
      ];
      const client = makeClient({ search: async () => ({ news: items, quotes: [] }) }, false);
      const news = await client.getNews('AAPL');

      expect(news.news).toHaveLength(2);
      // `getNews` maps `item.title ?? ''`, so a null title is silently normalized rather than
      // warned about; `validateNews` only rejects a non-object payload.
      expect(news.news[1].title).toBe('');
      expect(client.getWarnings()).toHaveLength(0);
    });
  });

  describe('data-quality scoring on incomplete payloads', () => {
    test('completeness scores the payload it is given, so a two-field payload is also 100', () => {
      const reporter = new DataQualityReporter(qualityMetrics.minFreshness);
      const full = {
        symbol: 'AAPL', regularMarketPrice: 185.92, regularMarketVolume: 44981879,
        marketCap: 2898258160640, currency: 'USD'
      };
      const sparse = { symbol: 'AAPL', regularMarketPrice: 185.92 };
      const withNulls = { symbol: 'AAPL', regularMarketPrice: null, marketCap: null };

      // Measured: the score is weighted over the payload's OWN keys, so "sparse" is not
      // penalized; only null/undefined values lower it. Note the 0-100 scale here versus the
      // 0-1 `meta.completenessScore` the tool schemas allow and `qualityMetrics.minCompleteness`
      // (0.8) which is written as a fraction.
      expect(reporter.calculateCompleteness(full)).toBe(100);
      expect(reporter.calculateCompleteness(sparse)).toBe(100);
      expect(reporter.calculateCompleteness(withNulls)).toBeLessThan(100);
      expect(reporter.detectMissingFields(sparse, ['marketCap', 'currency'])).toEqual(['marketCap', 'currency']);
    });

    test('a payload with no timestamp is never flagged stale, however old it is', () => {
      const reporter = new DataQualityReporter(1000);
      const report = reporter.generateQualityReport({ symbol: 'AAPL', regularMarketPrice: 1 }, ['marketCap']);

      // Measured defect: `extractTimestamp` returns 0 when it finds nothing, so
      // `dataAge > ttl * 0.5` is false and stale data is invisible in the report.
      expect(report.dataAge).toBe(0);
      expect(report.staleData).toBe(false);
      expect(report.missingFields).toEqual(['marketCap']);
    });

    test('reliability and warnings track the gaps once a timestamp exists', () => {
      const reporter = new DataQualityReporter(qualityMetrics.maxStaleness);
      const report = reporter.generateQualityReport(
        { symbol: 'AAPL', regularMarketPrice: -5, lastUpdated: Date.now() },
        ['marketCap', 'currency'],
        Date.now()
      );

      expect(report.warnings.join(' ')).toContain('Negative or invalid price values detected');
      expect(['high', 'medium', 'low']).toContain(report.sourceReliability);
    });
  });

  describe('spawned-server resource templates', () => {
    let serverProcess: ChildProcess | null = null;
    let stdoutBuffer = '';
    const pending = new Map<number, (response: Record<string, unknown>) => void>();

    function createMCPRequest(method: string, params: Record<string, unknown> = {}, id = 1): string {
      return JSON.stringify({ jsonrpc: '2.0', id, method, params });
    }

    function sendMCPRequest(request: string, timeoutMs = 10000): Promise<Record<string, unknown>> {
      const id = (JSON.parse(request) as { id: number }).id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Request ${String(id)} timed out after ${String(timeoutMs)} ms`));
        }, timeoutMs);
        pending.set(id, response => { clearTimeout(timer); resolve(response); });
        if (serverProcess?.stdin === null || serverProcess?.stdin === undefined) {
          clearTimeout(timer);
          reject(new Error('Server process not available'));
          return;
        }
        serverProcess.stdin.write(`${request}\n`);
      });
    }

    beforeAll(async () => {
      if (!existsSync(SERVER_PATH)) {
        throw new Error('Server build not found. Run "npm run build" first.');
      }
      serverProcess = spawn(process.execPath, [SERVER_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'test' }
      });
      serverProcess.stdout?.setEncoding('utf8');
      serverProcess.stdout?.on('data', (chunk: string) => {
        stdoutBuffer += chunk;
        let newline = stdoutBuffer.indexOf('\n');
        while (newline >= 0) {
          const line = stdoutBuffer.slice(0, newline).trim();
          stdoutBuffer = stdoutBuffer.slice(newline + 1);
          if (line !== '') {
            const response = JSON.parse(line) as Record<string, unknown>;
            const id = response.id as number | undefined;
            if (id !== undefined) {
              pending.get(id)?.(response);
              pending.delete(id);
            }
          }
          newline = stdoutBuffer.indexOf('\n');
        }
      });

      await sendMCPRequest(createMCPRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, resources: {}, prompts: {} },
        clientInfo: { name: 'chaos-partial-data', version: '1.0.0' }
      }, 0));
      serverProcess.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    });

    afterAll(async () => {
      if (serverProcess === null) return;
      const exited = new Promise<void>(resolve => { serverProcess?.once('exit', () => resolve()); });
      serverProcess.stdin?.end();
      serverProcess.kill('SIGTERM');
      const killTimer = setTimeout(() => { serverProcess?.kill('SIGKILL'); }, 3000);
      await exited;
      clearTimeout(killTimer);
      serverProcess = null;
    });

    test('resources/templates/list reports all 6 templates', async () => {
      const response = await sendMCPRequest(createMCPRequest('resources/templates/list', {}, 1));
      const templates = (response.result as { resourceTemplates: Array<{ uriTemplate: string }> }).resourceTemplates;

      expect(templates).toHaveLength(6);
      expect(templates.map(t => t.uriTemplate)).toContain('ticker://{symbol}/quote');
    });
  });
});
