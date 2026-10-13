import { AnalysisTools } from '../../../src/tools/analysis';
import { YahooFinanceError, YF_ERR_DATA_UNAVAILABLE } from '../../../src/types/errors';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { YahooFinanceClient } from '../../../src/services/yahoo-finance';
import type { AnalysisResult } from '../../../src/types/yahoo-finance';

// src/tools/analysis.ts exports the CLASS `AnalysisTools`, constructed as
// `new AnalysisTools(this.yahooClient)` (src/server.ts:215) — it builds its own
// DataQualityReporter. The handler behind the callable `get_analysis` tool is
// `getAnalysis(args)`; the only client method used is `getAnalysis(symbol)`, which
// resolves a quoteSummary-shaped AnalysisResult. There is no `getTools()` method.
// Handlers return a PLAIN OBJECT; src/server.ts:583 adds the MCP `content` wrapper.

type Ratings = {
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
};

function analysisResult(input: {
  ratings?: Ratings | null;
  targetPrice?: number | null;
  trend?: Ratings & { period: string }[];
  earningsTrend?: unknown[];
}): AnalysisResult {
  const ratings = input.ratings ?? null;

  return {
    analystOpinion:
      input.ratings === null || input.ratings === undefined
        ? undefined
        : {
            companyName: 'Apple Inc.',
            currentRatings: ratings,
            currentOpinion: 'BUY',
            targetPrice: input.targetPrice ?? 190,
            recommendationKey: 'BUY'
          },
    recommendationTrend:
      input.trend === undefined ? undefined : { trend: input.trend, maxAge: 1 },
    earningsTrend: input.earningsTrend
  } as unknown as AnalysisResult;
}

const strongTrend: Ratings & { period: string } = {
  period: '0m',
  strongBuy: 10,
  buy: 0,
  hold: 0,
  sell: 0,
  strongSell: 0
};

const holdTrend: Ratings & { period: string } = {
  period: '-1m',
  strongBuy: 0,
  buy: 1,
  hold: 8,
  sell: 1,
  strongSell: 0
};

const emptyTrend: Ratings & { period: string } = {
  period: '-2m',
  strongBuy: 0,
  buy: 0,
  hold: 0,
  sell: 0,
  strongSell: 0
};

describe('AnalysisTools', () => {
  let tools: AnalysisTools;
  let clientGetAnalysis: jest.Mock;

  beforeEach(() => {
    clientGetAnalysis = jest.fn();
    const client = { getAnalysis: clientGetAnalysis } as unknown as YahooFinanceClient;
    tools = new AnalysisTools(client);
  });

  describe('getAnalysis', () => {
    test('returns a plain symbol/analysis/meta payload, never an MCP content array', async () => {
      clientGetAnalysis.mockResolvedValue(
        analysisResult({
          ratings: { strongBuy: 8, buy: 4, hold: 2, sell: 0, strongSell: 0 },
          targetPrice: 190,
          trend: [strongTrend, holdTrend],
          earningsTrend: [{ period: '0m', growth: 0.08, earningsEstimate: { avg: 2.25, numberOfAnalysts: 12 } }]
        })
      );

      const result = await tools.getAnalysis({ symbol: 'AAPL' });

      expect(result).not.toHaveProperty('content');
      expect(result.symbol).toBe('AAPL');
      expect(result.analysis.currentRatings).toEqual({
        strongBuy: 8,
        buy: 4,
        hold: 2,
        sell: 0,
        strongSell: 0,
        total: 14,
        // extractCurrentRatings never applies determineRecommendation, so the summary
        // label stays on its initial value however bullish the counts are.
        recommendation: 'neutral'
      });
      expect(result.meta).toEqual({
        fromCache: false,
        dataAge: 0,
        completenessScore: 100,
        warnings: ['Analyst count for target price not reported']
      });
    });

    test('collapses every target-price field onto the single reported value', async () => {
      clientGetAnalysis.mockResolvedValue(
        analysisResult({ ratings: { strongBuy: 1, buy: 0, hold: 0, sell: 0, strongSell: 0 }, targetPrice: 187.5 })
      );

      const result = await tools.getAnalysis({ symbol: 'AAPL' });

      expect(result.analysis.targetPrice).toEqual({
        targetHigh: 187.5,
        targetLow: 187.5,
        targetMean: 187.5,
        targetMedian: 187.5,
        numberOfAnalysts: 0
      });
      expect(result.meta.warnings).toContain('Analyst count for target price not reported');
    });

    test('uses the wire target price for all four targets when none is reported', async () => {
      clientGetAnalysis.mockResolvedValue(
        analysisResult({ ratings: { strongBuy: 1, buy: 1, hold: 1, sell: 0, strongSell: 0 } })
      );

      const result = await tools.getAnalysis({ symbol: 'AAPL' });

      expect(result.analysis.targetPrice.targetMean).toBe(190);
      expect(result.meta.warnings).not.toContain('Target price not available');
    });

    test('labels each recommendation trend and totals its analyst counts', async () => {
      const trendRows = [
        strongTrend,
        { period: '-1m', strongBuy: 0, buy: 3, hold: 10, sell: 1, strongSell: 0 },
        { ...holdTrend, period: '-2m' },
        { period: '-3m', strongBuy: 0, buy: 1, hold: 1, sell: 2, strongSell: 0 },
        { period: '-4m', strongBuy: 0, buy: 0, hold: 2, sell: 6, strongSell: 4 }
      ];
      clientGetAnalysis.mockResolvedValue(
        analysisResult({
          ratings: { strongBuy: 8, buy: 4, hold: 2, sell: 0, strongSell: 0 },
          trend: trendRows
        })
      );

      const result = await tools.getAnalysis({ symbol: 'AAPL' });
      const labels = result.analysis.recommendationTrend.map((entry) => ({
        period: entry.period,
        total: entry.total,
        recommendation: entry.recommendation
      }));

      // determineTrendRecommendation scores (2*strongBuy + buy) - (2*strongSell + sell) over
      // the weighted total, so the bands are >0.4 strong_buy, >0.1 buy, <-0.1 sell,
      // <-0.4 strong_sell, and everything else hold.
      expect(labels).toEqual([
        { period: '0m', total: 10, recommendation: 'strong_buy' },
        { period: '-1m', total: 14, recommendation: 'buy' },
        { period: '-2m', total: 10, recommendation: 'hold' },
        { period: '-3m', total: 4, recommendation: 'sell' },
        { period: '-4m', total: 12, recommendation: 'strong_sell' }
      ]);

      // The same scoring is never applied to currentRatings: determineRecommendation
      // (analysis.ts:214) is unreachable, so 8 strong buys still report 'neutral'.
      expect(result.analysis.currentRatings.recommendation).toBe('neutral');
    });

    test('drops zero-populated trends unless includeExpired is set', async () => {
      clientGetAnalysis.mockResolvedValue(
        analysisResult({ ratings: { strongBuy: 1, buy: 0, hold: 0, sell: 0, strongSell: 0 }, trend: [strongTrend, emptyTrend] })
      );

      const filtered = await tools.getAnalysis({ symbol: 'AAPL' });
      expect(filtered.analysis.recommendationTrend.map((t) => t.period)).toEqual(['0m']);

      const included = await tools.getAnalysis({ symbol: 'MSFT', includeExpired: true });
      expect(included.analysis.recommendationTrend.map((t) => t.period)).toEqual(['0m', '-2m']);
      expect(included.analysis.recommendationTrend[1].total).toBe(0);
      expect(included.analysis.recommendationTrend[1].recommendation).toBe('neutral');
    });

    test('passes earnings trends through untouched', async () => {
      const earningsTrend = [
        { period: '0m', growth: 0.08, earningsEstimate: { avg: 2.25, numberOfAnalysts: 12 } },
        { period: '+1m', growth: 0.05, earningsEstimate: { avg: 2.4, numberOfAnalysts: 9 } }
      ];
      clientGetAnalysis.mockResolvedValue(
        analysisResult({ ratings: { strongBuy: 1, buy: 0, hold: 0, sell: 0, strongSell: 0 }, earningsTrend })
      );

      const result = await tools.getAnalysis({ symbol: 'AAPL' });

      expect(result.analysis.earningsTrends).toEqual(earningsTrend);
      expect(result.meta.warnings).not.toContain('Earnings trend data not available');
    });

    test('degrades a payload with no analyst data instead of throwing', async () => {
      clientGetAnalysis.mockResolvedValue(analysisResult({}));

      const result = await tools.getAnalysis({ symbol: 'FAKE' });

      expect(result.analysis.currentRatings).toEqual({
        strongBuy: 0,
        buy: 0,
        hold: 0,
        sell: 0,
        strongSell: 0,
        total: 0,
        recommendation: 'neutral'
      });
      expect(result.analysis.targetPrice.targetMean).toBeNull();
      expect(result.analysis.recommendationTrend).toEqual([]);
      expect(result.analysis.earningsTrends).toEqual([]);
      expect(result.meta.completenessScore).toBeLessThan(100);
      expect(result.meta.warnings).toEqual(
        expect.arrayContaining([
          'No analyst ratings available',
          'Target price not available',
          'Recommendation trend history not available',
          'Earnings trend data not available'
        ])
      );
    });

    test('warns when the recent trend rows are all empty', async () => {
      clientGetAnalysis.mockResolvedValue(
        analysisResult({
          ratings: { strongBuy: 1, buy: 0, hold: 0, sell: 0, strongSell: 0 },
          trend: [emptyTrend, { ...emptyTrend, period: '-3m' }],
          includeExpiredMarker: true
        })
      );

      const result = await tools.getAnalysis({ symbol: 'AAPL', includeExpired: true });

      expect(result.analysis.recommendationTrend).toHaveLength(2);
      expect(result.meta.warnings).toContain('Recent recommendation trends show no analyst data');
    });

    test('caches per symbol and flags the cached read in meta', async () => {
      clientGetAnalysis.mockResolvedValue(
        analysisResult({ ratings: { strongBuy: 8, buy: 4, hold: 2, sell: 0, strongSell: 0 }, trend: [strongTrend] })
      );

      await tools.getAnalysis({ symbol: 'AAPL' });
      const cached = await tools.getAnalysis({ symbol: 'AAPL' });

      expect(clientGetAnalysis).toHaveBeenCalledTimes(1);
      expect(tools.getCacheSize()).toBe(1);
      expect(cached.meta.fromCache).toBe(true);
      expect(cached.meta.warnings).toContain('Data from cache');
      expect(cached.analysis.currentRatings.total).toBe(14);
    });

    test('clearCache forces the next request to refetch', async () => {
      clientGetAnalysis.mockResolvedValue(analysisResult({ ratings: { strongBuy: 1, buy: 0, hold: 0, sell: 0, strongSell: 0 } }));

      await tools.getAnalysis({ symbol: 'AAPL' });
      tools.clearCache();
      const refetched = await tools.getAnalysis({ symbol: 'AAPL' });

      expect(clientGetAnalysis).toHaveBeenCalledTimes(2);
      expect(refetched.meta.fromCache).toBe(false);
      expect(tools.getCacheSize()).toBe(1);
    });

    test('serves stale cached analysis when a later fetch fails', async () => {
      const realNow = Date.now();
      clientGetAnalysis.mockResolvedValue(
        analysisResult({ ratings: { strongBuy: 8, buy: 4, hold: 2, sell: 0, strongSell: 0 }, trend: [strongTrend] })
      );
      await tools.getAnalysis({ symbol: 'AAPL' });

      clientGetAnalysis.mockRejectedValue(new Error('analysis endpoint unavailable'));
      // One minute past the 1 h TTL so the entry reads as expired and the stale branch is
      // taken regardless of how long this test has been running.
      const spy = jest.spyOn(Date, 'now').mockReturnValue(realNow + 3600000 + 60000);

      try {
        const result = await tools.getAnalysis({ symbol: 'AAPL' });

        expect(result.meta.fromCache).toBe(true);
        expect(result.meta.warnings).toContain('Using stale cached data due to fetch failure');
        expect(result.analysis.currentRatings.total).toBe(14);
      } finally {
        spy.mockRestore();
      }
    });

    test('propagates the client YahooFinanceError with its code and suggested action', async () => {
      clientGetAnalysis.mockRejectedValue(
        new YahooFinanceError(
          'Analysis data not available for FAKE',
          YF_ERR_DATA_UNAVAILABLE,
          404,
          false,
          false,
          { symbol: 'FAKE' },
          'Check if symbol is valid'
        )
      );

      const error = await tools.getAnalysis({ symbol: 'FAKE' }).catch((e: unknown) => e as YahooFinanceError);

      expect(error).toBeInstanceOf(YahooFinanceError);
      expect(error.code).toBe(YF_ERR_DATA_UNAVAILABLE);
      expect(error.suggestedAction).toBe('Check if symbol is valid');
    });

    test('rejects invalid symbols before calling the client', async () => {
      await expect(tools.getAnalysis({ symbol: 'aapl' })).rejects.toThrow('Symbol contains invalid characters');
      await expect(tools.getAnalysis({ symbol: '' })).rejects.toThrow();
      await expect(tools.getAnalysis({ symbol: 'X'.repeat(21) })).rejects.toThrow();

      expect(clientGetAnalysis).not.toHaveBeenCalled();
    });

    test('rejects a non-boolean includeExpired', async () => {
      await expect(tools.getAnalysis({ symbol: 'AAPL', includeExpired: 'true' })).rejects.toThrow();
      expect(clientGetAnalysis).not.toHaveBeenCalled();
    });

    test('defaults every absent analyst count to zero rather than leaving it undefined', async () => {
      // An opinion that reports a ratings object with none of the five buckets is what the
      // wire sends for a thinly covered name; extractCurrentRatings has to land each one on 0.
      clientGetAnalysis.mockResolvedValue(
        analysisResult({ ratings: {} as unknown as Ratings, targetPrice: 190, trend: [strongTrend] })
      );

      const result = await tools.getAnalysis({ symbol: 'AAPL' });

      expect(result.analysis.currentRatings).toEqual({
        strongBuy: 0,
        buy: 0,
        hold: 0,
        sell: 0,
        strongSell: 0,
        total: 0,
        recommendation: 'neutral'
      });
      expect(result.meta.warnings).toContain('No analyst ratings available');
      expect(result.analysis.recommendationTrend).toHaveLength(1);
    });

    test('defaults only the buckets the wire omits and keeps the reported ones', async () => {
      clientGetAnalysis.mockResolvedValue(
        analysisResult({ ratings: { strongBuy: 3, buy: 2 } as unknown as Ratings, targetPrice: 190 })
      );

      const result = await tools.getAnalysis({ symbol: 'AAPL' });

      expect(result.analysis.currentRatings).toEqual({
        strongBuy: 3,
        buy: 2,
        hold: 0,
        sell: 0,
        strongSell: 0,
        total: 5,
        recommendation: 'neutral'
      });
    });

    test('omits the estimate columns for an earnings trend that reports no estimate', async () => {
      const ratings: Ratings = { strongBuy: 1, buy: 0, hold: 0, sell: 0, strongSell: 0 };

      clientGetAnalysis.mockResolvedValueOnce(
        analysisResult({
          ratings,
          earningsTrend: [
            { period: '0m', growth: 0.08 },
            { period: '+1m', growth: 0.05, earningsEstimate: null }
          ]
        })
      );
      clientGetAnalysis.mockResolvedValueOnce(
        analysisResult({
          ratings,
          earningsTrend: [
            { period: '0m', growth: 0.08, earningsEstimate: { avg: 2.25, numberOfAnalysts: 12 } },
            { period: '+1m', growth: 0.05, earningsEstimate: { avg: 2.4, numberOfAnalysts: 9 } }
          ]
        })
      );

      const withoutEstimate = await tools.getAnalysis({ symbol: 'AAPL' });
      const withEstimate = await tools.getAnalysis({ symbol: 'MSFT' });

      expect(withoutEstimate.analysis.earningsTrends).toHaveLength(2);
      expect(withEstimate.analysis.earningsTrends).toHaveLength(2);
      // flattenAnalysisData only writes the earningsTrend_i_estimate / _analysts keys when an
      // estimate is present — and DataQualityReporter.buildFieldWeights derives its
      // denominator from Object.keys of the very object it is handed, so the omitted keys are
      // missing from the score as well. The two responses therefore report identical
      // completeness even though one is measurably thinner: the estimate branch cannot change
      // anything a client sees. Defect, pinned rather than smoothed over.
      expect(withoutEstimate.meta.completenessScore).toBe(withEstimate.meta.completenessScore);
      expect(clientGetAnalysis).toHaveBeenCalledTimes(2);
    });

    test('declares get_analysis when registered and dispatches only that name', async () => {
      type Handler = (request: never) => Promise<unknown>;
      const registrations: Array<{ schema: unknown; handler: Handler }> = [];
      const server = {
        setRequestHandler: jest.fn((schema: unknown, handler: Handler) => {
          registrations.push({ schema, handler });
        })
      } as unknown as Server;

      tools.registerTools(server);

      // AnalysisTools registers ListTools/CallTool handlers itself, which src/server.ts
      // already owns; the SDK keeps only one handler per request schema.
      expect(registrations.map((entry) => entry.schema)).toEqual([ListToolsRequestSchema, CallToolRequestSchema]);

      const listed = (await registrations[0].handler({} as never)) as {
        tools: Array<{ name: string; inputSchema: { required: string[] } }>;
      };

      expect(listed.tools).toHaveLength(1);
      expect(listed.tools[0].name).toBe('get_analysis');
      expect(listed.tools[0].inputSchema.required).toEqual(['symbol']);

      clientGetAnalysis.mockResolvedValue(analysisResult({ ratings: { strongBuy: 1, buy: 0, hold: 0, sell: 0, strongSell: 0 } }));
      const called = (await registrations[1].handler({
        params: { name: 'get_analysis', arguments: { symbol: 'AAPL' } }
      } as never)) as { symbol: string };

      expect(called.symbol).toBe('AAPL');
      await expect(
        registrations[1].handler({ params: { name: 'nope', arguments: {} } } as never)
      ).rejects.toThrow('Unknown tool: nope');
    });
  });
});
