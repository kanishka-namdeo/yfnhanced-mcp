import { HistoricalTools } from '../../../src/tools/historical';
import { DataQualityReporter } from '../../../src/utils/data-completion';
import type { YahooFinanceClient } from '../../../src/services/yahoo-finance';
import type { HistoricalPriceResult } from '../../../src/types/yahoo-finance';

// src/tools/historical.ts exports the CLASS `HistoricalTools`, constructed as
// `new HistoricalTools(this.yahooClient, this.qualityReporter)` (src/server.ts:216).
// There is no module-level `getHistorical` function: the callable surface is
// `getHistoricalPrices(args)` / `getHistoricalPricesMulti(args)`, and the only client
// method they touch is `getHistoricalPrices(symbol, { period1, period2, interval })`,
// which resolves a chart-shaped HistoricalPriceResult.
// Handlers return a plain object; src/server.ts:583 wraps it in MCP `content`.

type Row = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjclose?: number;
  volume: number;
};

function chartResult(symbol: string, rows: Row[]): HistoricalPriceResult {
  const column = (pick: (row: Row) => number): number[] => rows.map(pick);

  return {
    meta: { currency: 'USD', symbol, regularMarketTime: null },
    timestamps: column((row) => Math.floor(new Date(`${row.date}T00:00:00Z`).getTime() / 1000)),
    indicators: {
      quote: [
        {
          open: column((row) => row.open),
          high: column((row) => row.high),
          low: column((row) => row.low),
          close: column((row) => row.close),
          volume: column((row) => row.volume)
        }
      ],
      adjclose: [{ adjclose: column((row) => row.adjclose ?? row.close) }]
    }
  } as unknown as HistoricalPriceResult;
}

const cleanRows: Row[] = [
  { date: '2024-01-02', open: 100, high: 102, low: 99, close: 101, volume: 1000 },
  { date: '2024-01-03', open: 101, high: 104, low: 100, close: 103, volume: 1200 }
];

describe('HistoricalTools', () => {
  let tools: HistoricalTools;
  let clientGetHistoricalPrices: jest.Mock;

  beforeEach(() => {
    clientGetHistoricalPrices = jest.fn();
    const client = {
      getHistoricalPrices: clientGetHistoricalPrices
    } as unknown as YahooFinanceClient;

    tools = new HistoricalTools(client, new DataQualityReporter());
  });

  describe('getHistoricalPrices', () => {
    test('returns a plain symbol/data/meta payload, never an MCP content array', async () => {
      clientGetHistoricalPrices.mockResolvedValue(chartResult('AAPL', cleanRows));

      const result = await tools.getHistoricalPrices({
        symbol: 'AAPL',
        startDate: '2024-01-01',
        endDate: '2024-01-05'
      });

      expect(result).not.toHaveProperty('content');
      expect(result.symbol).toBe('AAPL');
      expect(result.data).toEqual([
        { date: '2024-01-02', open: 100, high: 102, low: 99, close: 101, adjclose: 101, volume: 1000, isGap: false, isSplit: false, hasNulls: false },
        { date: '2024-01-03', open: 101, high: 104, low: 100, close: 103, adjclose: 103, volume: 1200, isGap: false, isSplit: false, hasNulls: false }
      ]);
      expect(result.meta).toEqual({
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        integrityFlags: []
      });
    });

    test('queries the client with the requested date window and defaults to 1d', async () => {
      clientGetHistoricalPrices.mockResolvedValue(chartResult('AAPL', cleanRows));

      await tools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2024-01-01', endDate: '2024-01-31' });

      const [symbol, options] = clientGetHistoricalPrices.mock.calls[0];
      expect(symbol).toBe('AAPL');
      expect(options.interval).toBe('1d');
      expect(options.period1).toEqual(new Date('2024-01-01'));
      expect(options.period2).toEqual(new Date('2024-01-31'));

      await tools.getHistoricalPrices({ symbol: 'MSFT', startDate: '2024-02-01' });
      expect(clientGetHistoricalPrices.mock.calls[1][1].period2 instanceof Date).toBe(true);
    });

    test('rejects input that violates the declared schema before any client call', async () => {
      await expect(tools.getHistoricalPrices({ symbol: 'AAPL' })).rejects.toThrow();
      await expect(
        tools.getHistoricalPrices({ symbol: 'AAPL', startDate: '20240101' })
      ).rejects.toThrow();
      await expect(
        tools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2024-01-01', interval: '4h' })
      ).rejects.toThrow();
      await expect(
        tools.getHistoricalPrices({ symbol: 'X'.repeat(21), startDate: '2024-01-01' })
      ).rejects.toThrow();

      expect(clientGetHistoricalPrices).not.toHaveBeenCalled();
    });

    test('serves a second identical request from its own cache', async () => {
      clientGetHistoricalPrices.mockResolvedValue(chartResult('AAPL', cleanRows));

      const first = await tools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2024-01-01' });
      const second = await tools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2024-01-01' });

      expect(clientGetHistoricalPrices).toHaveBeenCalledTimes(1);
      expect(first.meta.fromCache).toBe(false);
      expect(second.meta.fromCache).toBe(true);
      expect(second.data).toEqual(first.data);
      expect(second.meta.completenessScore).toBe(1);
      expect(second.meta.integrityFlags).toEqual([]);
      expect(Array.isArray(second.meta.warnings)).toBe(true);
      expect(tools.getCacheSize()).toBe(1);
    });

    test('clearCache forces the next request to refetch', async () => {
      clientGetHistoricalPrices.mockResolvedValue(chartResult('AAPL', cleanRows));

      await tools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2024-01-01' });
      tools.clearCache();

      expect(tools.getCacheSize()).toBe(0);

      const refetched = await tools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2024-01-01' });

      expect(clientGetHistoricalPrices).toHaveBeenCalledTimes(2);
      expect(refetched.meta.fromCache).toBe(false);
    });

    test('flags an inverted bar and keeps serving the row', async () => {
      clientGetHistoricalPrices.mockResolvedValue(
        chartResult('AAPL', [{ date: '2024-01-02', open: 100, high: 98, low: 102, close: 100, volume: 1000 }])
      );

      const result = await tools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2024-01-01' });

      expect(result.meta.warnings).toEqual([
        'Data integrity issues on 2024-01-02: high_below_low, close_out_of_range, open_out_of_range'
      ]);
      expect(result.data[0].isGap).toBe(true);
      expect(result.meta.integrityFlags).toEqual(['gap_detected']);
    });

    test('marks a trading gap wider than three days', async () => {
      clientGetHistoricalPrices.mockResolvedValue(
        chartResult('AAPL', [
          { date: '2024-01-02', open: 100, high: 102, low: 99, close: 101, volume: 1000 },
          { date: '2024-01-12', open: 101, high: 104, low: 100, close: 103, volume: 1200 }
        ])
      );

      const result = await tools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2024-01-01' });

      expect(result.data[1].isGap).toBe(true);
      expect(result.meta.integrityFlags).toEqual(['gap_detected']);
      expect(result.meta.warnings).toEqual([]);
    });

    test('marks a price discontinuity that matches a split ratio', async () => {
      clientGetHistoricalPrices.mockResolvedValue(
        chartResult('AAPL', [
          { date: '2024-01-02', open: 100, high: 102, low: 99, close: 100, volume: 1000 },
          { date: '2024-01-03', open: 50, high: 51, low: 49, close: 50, volume: 1200 }
        ])
      );

      const result = await tools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2024-01-01' });

      expect(result.data[1].isSplit).toBe(true);
      expect(result.meta.integrityFlags).toContain('split_detected');
    });

    test('reports an all-zero bar as null values with zero completeness', async () => {
      clientGetHistoricalPrices.mockResolvedValue(
        chartResult('AAPL', [{ date: '2024-01-02', open: 0, high: 0, low: 0, close: 0, volume: 0 }])
      );

      const result = await tools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2024-01-01' });

      expect(result.data[0].hasNulls).toBe(true);
      expect(result.meta.integrityFlags).toEqual(['null_values']);
      expect(result.meta.completenessScore).toBe(0);
    });

    test('drops the adjclose series to the close price when the chart omits it', async () => {
      clientGetHistoricalPrices.mockResolvedValue({
        meta: { currency: 'USD', symbol: 'AAPL' },
        timestamps: [Math.floor(new Date('2024-01-02T00:00:00Z').getTime() / 1000)],
        indicators: {
          quote: [{ open: [100], high: [102], low: [99], close: [101], volume: [1000] }],
          adjclose: []
        }
      } as unknown as HistoricalPriceResult);

      const result = await tools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2024-01-01' });

      expect(result.data[0].adjclose).toBe(101);
    });

    test('rejects after exhausting its retries when nothing is cached', async () => {
      clientGetHistoricalPrices.mockRejectedValue(new Error('chart endpoint unavailable'));

      await expect(
        tools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2024-01-01', interval: '1d' })
      ).rejects.toThrow('chart endpoint unavailable');

      expect(clientGetHistoricalPrices).toHaveBeenCalledTimes(3);
    }, 20000);

    test('degrades to expired cached data when a later fetch fails', async () => {
      const realNow = Date.now();
      clientGetHistoricalPrices.mockResolvedValue(chartResult('AAPL', cleanRows));

      await tools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2024-01-01' });

      clientGetHistoricalPrices.mockRejectedValue(new Error('chart endpoint unavailable'));
      // One minute past the 1 h TTL: the entry must read as expired, and the reported age
      // must still clear the 3600000 ms assertion however long this test took to get here.
      const spy = jest.spyOn(Date, 'now').mockReturnValue(realNow + 3600000 + 60000);

      try {
        const result = await tools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2024-01-01' });

        expect(result.meta.fromCache).toBe(true);
        expect(result.meta.warnings).toEqual(['Using stale cached data due to fetch failure']);
        expect(result.meta.integrityFlags).toEqual(['stale_data']);
        expect(result.meta.dataAge).toBeGreaterThanOrEqual(3600000);
        expect(result.data).toEqual(expect.any(Array));
      } finally {
        spy.mockRestore();
      }
    }, 20000);
  });

  describe('getHistoricalPricesMulti', () => {
    test('keys results by symbol and records per-symbol status', async () => {
      clientGetHistoricalPrices.mockImplementation((symbol: string) =>
        Promise.resolve(chartResult(symbol, cleanRows))
      );

      const results = await tools.getHistoricalPricesMulti({
        symbols: ['AAPL', 'MSFT'],
        startDate: '2024-01-01'
      });

      expect(Object.keys(results)).toEqual(['AAPL', 'MSFT']);
      expect(results.AAPL.status).toBe('success');
      expect(results.AAPL.symbol).toBe('AAPL');
      expect(results.AAPL.data).toHaveLength(2);
      expect(results.MSFT.status).toBe('success');
      expect(results.MSFT.error).toBeUndefined();
    });

    test('continues the batch when one symbol fails', async () => {
      clientGetHistoricalPrices.mockImplementation((symbol: string) =>
        symbol === 'BAD'
          ? Promise.reject(new Error('no chart for BAD'))
          : Promise.resolve(chartResult(symbol, cleanRows))
      );

      const results = await tools.getHistoricalPricesMulti({
        symbols: ['AAPL', 'BAD'],
        startDate: '2024-01-01',
        interval: '1d'
      });

      expect(results.AAPL.status).toBe('success');
      expect(results.BAD).toEqual({
        symbol: 'BAD',
        status: 'error',
        error: 'no chart for BAD'
      });
    }, 20000);

    test('enforces the batch schema before fetching', async () => {
      await expect(tools.getHistoricalPricesMulti({ symbols: [], startDate: '2024-01-01' })).rejects.toThrow();
      await expect(tools.getHistoricalPricesMulti({ startDate: '2024-01-01' })).rejects.toThrow();
      await expect(
        tools.getHistoricalPricesMulti({ symbols: Array.from({ length: 51 }, (_, i) => `SYM${i}`), startDate: '2024-01-01' })
      ).rejects.toThrow();

      expect(clientGetHistoricalPrices).not.toHaveBeenCalled();
    });
  });

  describe('getToolDefinitions', () => {
    test('declares the two callable historical tools and their required args', () => {
      const definitions = tools.getToolDefinitions() as Array<{
        name: string;
        description: string;
        inputSchema: { properties: Record<string, { enum?: string[] }>; required: string[] };
      }>;

      expect(definitions).toHaveLength(2);
      expect(definitions.map((d) => d.name)).toEqual([
        'get_historical_prices',
        'get_historical_prices_multi'
      ]);
      expect(definitions[0].inputSchema.required).toEqual(['symbol', 'startDate']);
      expect(definitions[1].inputSchema.required).toEqual(['symbols', 'startDate']);
      expect(definitions[0].inputSchema.properties.interval.enum).toHaveLength(13);
      definitions.forEach((definition) => expect(definition.description).toBeTruthy());
    });
  });
});
