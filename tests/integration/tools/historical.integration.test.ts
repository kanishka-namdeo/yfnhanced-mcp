import { HistoricalTools } from '../../../src/tools/historical';
import type { YahooFinanceClient } from '../../../src/services/yahoo-finance';
import type { DataQualityReporter } from '../../../src/utils/data-completion';
import type { HistoricalPriceResult } from '../../../src/types/yahoo-finance';

// `HistoricalTools` takes its collaborators by constructor injection
// (`new HistoricalTools(client, qualityReporter)`, src/tools/historical.ts:147) and exposes
// `getHistoricalPrices` / `getHistoricalPricesMulti`, which return plain objects. The suite
// used to pass a `Server` first and call `handleGetHistoricalPrices`, which does not exist.
const EPOCH = 1700000000; // 2023-11-14T22:13:20Z
const DAY = 86400;

function chartResult(overrides: Partial<HistoricalPriceResult> = {}): HistoricalPriceResult {
  const base: HistoricalPriceResult = {
    meta: {
      currency: 'USD',
      symbol: 'AAPL',
      exchangeName: 'NMS',
      instrumentType: 'EQUITY',
      firstTradeDate: 345479400,
      regularMarketTime: EPOCH,
      gmtoffset: -14400000,
      timezone: 'EST',
      exchangeTimezoneName: 'America/New_York',
      regularMarketPrice: 175.5,
      chartPreviousClose: 173.2,
      priceHint: 2,
      currentTradingPeriod: {
        pre: { timezone: 'EST', start: EPOCH, end: EPOCH + 3600, gmtoffset: -18000000 },
        regular: { timezone: 'EST', start: EPOCH + 3600, end: EPOCH + 25200, gmtoffset: -18000000 },
        post: { timezone: 'EST', start: EPOCH + 25200, end: EPOCH + 31600, gmtoffset: -18000000 }
      },
      dataGranularity: '1d',
      range: '1mo',
      validRanges: ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max']
    },
    timestamps: [EPOCH, EPOCH + DAY, EPOCH + 2 * DAY, EPOCH + 3 * DAY, EPOCH + 4 * DAY],
    indicators: {
      quote: [
        {
          open: [174.0, 174.5, 175.0, 175.5, 176.0],
          high: [175.0, 175.5, 176.0, 176.5, 177.0],
          low: [173.5, 174.0, 174.5, 175.0, 175.5],
          close: [174.5, 175.0, 175.5, 176.0, 176.5],
          volume: [50000000, 52000000, 48000000, 51000000, 49000000]
        }
      ],
      adjclose: [{ adjclose: [174.5, 175.0, 175.5, 176.0, 176.5] }]
    }
  };

  return { ...base, ...overrides };
}

function zeroedChartResult(): HistoricalPriceResult {
  return chartResult({
    timestamps: [EPOCH, EPOCH + DAY, EPOCH + 2 * DAY],
    indicators: {
      quote: [
        {
          open: [0, 0, 0],
          high: [0, 0, 0],
          low: [0, 0, 0],
          close: [0, 0, 0],
          volume: [0, 0, 0]
        }
      ],
      adjclose: [{ adjclose: [0, 0, 0] }]
    }
  });
}

describe('HistoricalTools Integration Tests', () => {
  let historicalTools: HistoricalTools;
  let getHistoricalPrices: jest.Mock;
  let generateWarnings: jest.Mock;
  let calculateCompleteness: jest.Mock;

  beforeEach(() => {
    getHistoricalPrices = jest.fn();
    generateWarnings = jest.fn().mockReturnValue([]);
    calculateCompleteness = jest.fn().mockReturnValue(90);

    const client = { getHistoricalPrices } as unknown as YahooFinanceClient;
    const reporter = {
      generateWarnings,
      calculateCompleteness,
      generateQualityReport: jest.fn().mockReturnValue({
        sourceReliability: 'high',
        warnings: [],
        recommendation: 'Data is reliable'
      })
    } as unknown as DataQualityReporter;

    historicalTools = new HistoricalTools(client, reporter);
  });

  afterEach(() => {
    historicalTools.clearCache();
    jest.restoreAllMocks();
  });

  describe('getHistoricalPrices - Success Cases', () => {
    it('should return normalized candles built from the injected client', async () => {
      getHistoricalPrices.mockResolvedValue(chartResult());

      const result = await historicalTools.getHistoricalPrices({
        symbol: 'AAPL',
        startDate: '2023-01-01',
        endDate: '2023-01-05',
        interval: '1d',
        validateData: true
      });

      expect(result.symbol).toBe('AAPL');
      expect(result.data).toBeInstanceOf(Array);
      expect(result.data).toHaveLength(5);
      expect(result.data[0].date).toBe('2023-11-14');
      expect(result.data[0].open).toBe(174);
      expect(result.data[0].high).toBe(175);
      expect(result.data[0].low).toBe(173.5);
      expect(result.data[0].close).toBe(174.5);
      expect(result.data[0].adjclose).toBe(174.5);
      expect(result.data[0].volume).toBe(50000000);
      expect(result.meta.fromCache).toBe(false);
      expect(result.meta.dataAge).toBe(0);

      expect(getHistoricalPrices).toHaveBeenCalledTimes(1);
      const [symbol, options] = getHistoricalPrices.mock.calls[0];
      expect(symbol).toBe('AAPL');
      expect(options.period1).toBeInstanceOf(Date);
      expect(options.period2).toBeInstanceOf(Date);
      expect(options.interval).toBe('1d');
    });

    it('should default the interval to 1d', async () => {
      getHistoricalPrices.mockResolvedValue(chartResult());

      await historicalTools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2023-01-01' });

      expect(getHistoricalPrices.mock.calls[0][1].interval).toBe('1d');
    });

    it('should pass every advertised interval through to the client', async () => {
      getHistoricalPrices.mockResolvedValue(chartResult());

      for (const interval of ['1m', '5m', '1h', '1d', '1wk', '1mo']) {
        await historicalTools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2023-01-01', interval });
        const calls = getHistoricalPrices.mock.calls;
        expect(calls[calls.length - 1][1].interval).toBe(interval);
      }

      expect(getHistoricalPrices).toHaveBeenCalledTimes(6);
    });

    it('should serve a repeated request from its own cache', async () => {
      getHistoricalPrices.mockResolvedValue(chartResult());
      const args = { symbol: 'AAPL', startDate: '2023-01-01', interval: '1d' };

      const first = await historicalTools.getHistoricalPrices(args);
      const second = await historicalTools.getHistoricalPrices(args);

      expect(getHistoricalPrices).toHaveBeenCalledTimes(1);
      expect(first.meta.fromCache).toBe(false);
      expect(second.meta.fromCache).toBe(true);
      expect(second.data).toEqual(first.data);
      // Only the cache path consults the quality reporter, and it derives warnings from
      // the cached rows.
      expect(generateWarnings).toHaveBeenCalledTimes(1);
    });

    it('should expose integrity flags when validation is requested', async () => {
      getHistoricalPrices.mockResolvedValue(chartResult());

      const result = await historicalTools.getHistoricalPrices({
        symbol: 'AAPL',
        startDate: '2023-01-01',
        validateData: true
      });

      expect(Array.isArray(result.meta.integrityFlags)).toBe(true);
      expect(result.meta.integrityFlags).toEqual([]);
    });

    it('should still return candles when validation is skipped', async () => {
      getHistoricalPrices.mockResolvedValue(chartResult());

      const result = await historicalTools.getHistoricalPrices({
        symbol: 'AAPL',
        startDate: '2023-01-01',
        validateData: false
      });

      expect(result.data.length).toBeGreaterThan(0);
      // Skipping validation only skips the previous-row comparisons
      // (src/tools/historical.ts:441); null detection still runs.
      expect(result.data[1].isGap).toBe(false);
      expect(result.data[1].isSplit).toBe(false);
    });

    it('should score completeness with its own validator, not the quality reporter', async () => {
      getHistoricalPrices.mockResolvedValue(chartResult());

      const result = await historicalTools.getHistoricalPrices({
        symbol: 'AAPL',
        startDate: '2023-01-01'
      });

      expect(result.meta.completenessScore).toBe(1);
      expect(calculateCompleteness).not.toHaveBeenCalled();
    });

    it('should score zero-filled candles as empty and flag the nulls', async () => {
      getHistoricalPrices.mockResolvedValue(zeroedChartResult());

      const result = await historicalTools.getHistoricalPrices({
        symbol: 'AAPL',
        startDate: '2023-01-01',
        validateData: true
      });

      expect(result.meta.completenessScore).toBe(0);
      expect(result.meta.integrityFlags).toContain('null_values');
      expect(result.data.every(item => item.hasNulls)).toBe(true);
    });

    it('should reject input that violates the historical input contract', async () => {
      await expect(historicalTools.getHistoricalPrices({ symbol: 'AAPL' })).rejects.toThrow();
      expect(getHistoricalPrices).not.toHaveBeenCalled();
    });
  });

  describe('getHistoricalPrices - Failure Handling', () => {
    it('should fall back to expired cached rows and mark them stale', async () => {
      getHistoricalPrices.mockResolvedValue(chartResult());
      const args = { symbol: 'AAPL', startDate: '2023-01-01', interval: '1d' };

      const cached = await historicalTools.getHistoricalPrices(args);
      const cachedAt = Date.now();

      // The tool's own TTL is one hour (src/tools/historical.ts:41); pretending the clock
      // moved past it is the only way to reach the stale-cache branch.
      getHistoricalPrices.mockRejectedValue(new Error('API error'));
      jest.spyOn(Date, 'now').mockReturnValue(cachedAt + 3600001);

      const result = await historicalTools.getHistoricalPrices(args);

      expect(result.meta.fromCache).toBe(true);
      expect(result.meta.warnings).toEqual(['Using stale cached data due to fetch failure']);
      expect(result.meta.integrityFlags).toEqual(['stale_data']);
      expect(result.meta.dataAge).toBeGreaterThanOrEqual(3600001);
      expect(result.data).toEqual(cached.data);
    });

    it('should surface the library message when nothing is cached', async () => {
      getHistoricalPrices.mockRejectedValue(new Error('API error'));

      await expect(
        historicalTools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2023-01-01' })
      ).rejects.toThrow('API error');
    });

    it('should retry the requested interval before switching', async () => {
      getHistoricalPrices
        .mockRejectedValueOnce(new Error('Primary interval failed'))
        .mockResolvedValueOnce(chartResult());

      const result = await historicalTools.getHistoricalPrices({
        symbol: 'AAPL',
        startDate: '2023-01-01',
        interval: '5m'
      });

      expect(result.data).toHaveLength(5);
      expect(getHistoricalPrices).toHaveBeenCalledTimes(2);
      expect(getHistoricalPrices.mock.calls[0][1].interval).toBe('5m');
      expect(getHistoricalPrices.mock.calls[1][1].interval).toBe('5m');
    });

    it('should reject when every interval attempt fails', async () => {
      getHistoricalPrices.mockRejectedValue(new Error('Request timeout'));

      await expect(
        historicalTools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2023-01-01', interval: '1d' })
      ).rejects.toThrow('Request timeout');
    });
  });

  describe('getHistoricalPricesMulti - Batch Processing', () => {
    it('should fetch every requested symbol sequentially', async () => {
      getHistoricalPrices.mockResolvedValue(chartResult());

      const result = await historicalTools.getHistoricalPricesMulti({
        symbols: ['AAPL', 'MSFT', 'GOOGL'],
        startDate: '2023-01-01',
        interval: '1d'
      });

      expect(Object.keys(result)).toEqual(['AAPL', 'MSFT', 'GOOGL']);
      expect(result.AAPL.status).toBe('success');
      expect(result.AAPL.data).toBeInstanceOf(Array);
      expect(getHistoricalPrices).toHaveBeenCalledTimes(3);
    });

    it('should record per-symbol errors and keep going', async () => {
      getHistoricalPrices.mockImplementation(async (symbol: string) => {
        if (symbol === 'INVALID') {
          throw new Error('Symbol not found');
        }
        return chartResult();
      });

      const result = await historicalTools.getHistoricalPricesMulti({
        symbols: ['AAPL', 'INVALID', 'MSFT'],
        startDate: '2023-01-01'
      });

      expect(result.AAPL.status).toBe('success');
      expect(result.INVALID.status).toBe('error');
      expect(result.INVALID.error).toBe('Symbol not found');
      expect(result.MSFT.status).toBe('success');
    });

    it('should mark every symbol as failed when the client always rejects', async () => {
      getHistoricalPrices.mockRejectedValue(new Error('All failed'));

      const result = await historicalTools.getHistoricalPricesMulti({
        symbols: ['AAPL', 'MSFT'],
        startDate: '2023-01-01'
      });

      expect(result.AAPL.status).toBe('error');
      expect(result.MSFT.status).toBe('error');
      expect(result.AAPL.error).toBe('All failed');
    });

    it('should accept the advertised 50 symbol batch ceiling', async () => {
      getHistoricalPrices.mockResolvedValue(chartResult());
      const symbols = Array.from({ length: 50 }, (_, i) => `SYMBOL${i}`);

      const result = await historicalTools.getHistoricalPricesMulti({ symbols, startDate: '2023-01-01' });

      expect(Object.keys(result)).toHaveLength(50);
      expect(getHistoricalPrices).toHaveBeenCalledTimes(50);
    });

    it('should reject a batch above the 50 symbol ceiling', async () => {
      const symbols = Array.from({ length: 51 }, (_, i) => `SYMBOL${i}`);

      await expect(
        historicalTools.getHistoricalPricesMulti({ symbols, startDate: '2023-01-01' })
      ).rejects.toThrow();
    });
  });

  describe('Data Validation', () => {
    it('should flag rows whose high is below their low', async () => {
      getHistoricalPrices.mockResolvedValue(
        chartResult({
          timestamps: [EPOCH, EPOCH + DAY, EPOCH + 2 * DAY],
          indicators: {
            quote: [
              {
                open: [100, 200, 150],
                high: [90, 210, 160],
                low: [110, 190, 140],
                close: [105, 205, 155],
                volume: [50000000, 52000000, 48000000]
              }
            ],
            adjclose: [{ adjclose: [105, 205, 155] }]
          }
        })
      );

      const result = await historicalTools.getHistoricalPrices({
        symbol: 'AAPL',
        startDate: '2023-01-01',
        validateData: true
      });

      // An invalid row is reported as a gap flag; the flag names come from
      // src/tools/historical.ts:305-311 and the detail lives in warnings.
      expect(result.meta.integrityFlags).toContain('gap_detected');
      expect(result.meta.warnings.some(w => w.includes('integrity issues'))).toBe(true);
      expect(result.meta.warnings.some(w => w.includes('high_below_low'))).toBe(true);
    });

    it('should detect gaps larger than three calendar days', async () => {
      getHistoricalPrices.mockResolvedValue(
        chartResult({ timestamps: [EPOCH, EPOCH + 4 * DAY] })
      );

      const result = await historicalTools.getHistoricalPrices({
        symbol: 'AAPL',
        startDate: '2023-01-01',
        validateData: true
      });

      expect(result.data[1].isGap).toBe(true);
      expect(result.meta.integrityFlags).toContain('gap_detected');
    });

    it('should detect a two-for-one close ratio as a split', async () => {
      getHistoricalPrices.mockResolvedValue(
        chartResult({
          timestamps: [EPOCH, EPOCH + DAY],
          indicators: {
            quote: [
              {
                open: [350, 175],
                high: [355, 178],
                low: [348, 173],
                close: [352, 176],
                volume: [50000000, 52000000]
              }
            ],
            adjclose: [{ adjclose: [352, 176] }]
          }
        })
      );

      const result = await historicalTools.getHistoricalPrices({
        symbol: 'AAPL',
        startDate: '2023-01-01',
        validateData: true
      });

      expect(result.data[1].isSplit).toBe(true);
      expect(result.meta.integrityFlags).toContain('split_detected');
    });

    it('should keep the isSplit property on rows that are not splits', async () => {
      getHistoricalPrices.mockResolvedValue(chartResult());

      const result = await historicalTools.getHistoricalPrices({
        symbol: 'AAPL',
        startDate: '2023-01-01',
        validateData: true
      });

      expect(result.data[0]).toHaveProperty('isSplit');
      expect(result.data[1].isSplit).toBe(false);
    });
  });

  describe('Cache Management', () => {
    it('should clear its cache', async () => {
      getHistoricalPrices.mockResolvedValue(chartResult());
      await historicalTools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2023-01-01' });

      expect(historicalTools.getCacheSize()).toBe(1);

      historicalTools.clearCache();

      expect(historicalTools.getCacheSize()).toBe(0);
    });

    it('should key the cache on symbol, dates and interval', async () => {
      getHistoricalPrices.mockResolvedValue(chartResult());

      await historicalTools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2023-01-01', interval: '1d' });
      await historicalTools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2023-01-02', interval: '1d' });
      await historicalTools.getHistoricalPrices({ symbol: 'AAPL', startDate: '2023-01-01', interval: '1wk' });

      expect(historicalTools.getCacheSize()).toBe(3);
      expect(getHistoricalPrices).toHaveBeenCalledTimes(3);
    });
  });

  describe('Tool Definitions', () => {
    it('should describe both historical endpoints with their required inputs', () => {
      const definitions = historicalTools.getToolDefinitions() as Array<{
        name: string;
        inputSchema: { required: string[] };
      }>;

      expect(definitions.map(definition => definition.name)).toEqual([
        'get_historical_prices',
        'get_historical_prices_multi'
      ]);
      expect(definitions[0].inputSchema.required).toEqual(['symbol', 'startDate']);
      expect(definitions[1].inputSchema.required).toEqual(['symbols', 'startDate']);
    });
  });
});
