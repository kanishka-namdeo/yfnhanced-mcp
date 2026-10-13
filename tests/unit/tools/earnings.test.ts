import { EarningsTools } from '../../../src/tools/earnings';
import { YahooFinanceError, YF_ERR_DATA_UNAVAILABLE } from '../../../src/types/errors';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import type { YahooFinanceClient } from '../../../src/services/yahoo-finance';
import type { EarningsResult } from '../../../src/types/yahoo-finance';

// src/tools/earnings.ts exports the CLASS `EarningsTools`, constructed as
// `new EarningsTools(this.yahooClient)` (src/server.ts:214) — it builds its own
// DataQualityReporter. The single callable handler behind `get_earnings` is
// `getEarnings(args)`, and the only client method it uses is `getEarnings(symbol)`.
// There is no `getTools()` on this class: its tool definition is declared inside
// registerTools(). Handlers return a PLAIN OBJECT; src/server.ts:583 adds `content`.

type QuarterlyInput = {
  date: string;
  estimate: number | null;
  actual: number | null;
};

function earningsResult(quarterly: QuarterlyInput[], options: { trends?: boolean; chartMeta?: boolean } = {}): EarningsResult {
  return {
    earningsChart: {
      currentQuarterEstimate: options.chartMeta === false ? null : 2.25,
      currentQuarterEstimateDate: options.chartMeta === false ? { fmt: '', raw: 0 } : { fmt: '2024-04-30', raw: 1714435200 },
      currentQuarterEstimateYearAgo: options.chartMeta === false ? null : 2.1,
      earningsDate: { date: options.chartMeta === false ? '' : '2024-05-02T16:30:00Z' },
      quarterly
    },
    financialsChart: { yearly: [], quarterly: [] },
    earningsTrend:
      options.trends === false
        ? []
        : [
            {
              period: '0m',
              growth: 0.08,
              earningsEstimate: { avg: 2.25, numberOfAnalysts: 12 }
            }
          ],
    industryTrend: []
  } as unknown as EarningsResult;
}

const richQuarterly: QuarterlyInput[] = [
  { date: '2024-01-31T17:30:00Z', estimate: 2.1, actual: 2.18 },
  { date: '2023-11-02T07:00:00Z', estimate: 2.05, actual: 2.0 },
  { date: '2023-08-01T12:00:00Z', estimate: 1.99, actual: 1.99 },
  { date: '', estimate: 2.1, actual: 2.12 }
];

describe('EarningsTools', () => {
  let tools: EarningsTools;
  let clientGetEarnings: jest.Mock;

  beforeEach(() => {
    clientGetEarnings = jest.fn();
    const client = { getEarnings: clientGetEarnings } as unknown as YahooFinanceClient;
    tools = new EarningsTools(client);
  });

  describe('getEarnings', () => {
    test('returns a plain symbol/earnings/meta payload, never an MCP content array', async () => {
      clientGetEarnings.mockResolvedValue(earningsResult(richQuarterly));

      const result = await tools.getEarnings({ symbol: 'AAPL' });

      expect(result).not.toHaveProperty('content');
      expect(result).not.toHaveProperty('isError');
      expect(result.symbol).toBe('AAPL');
      expect(result.earnings.quarterly).toHaveLength(4);
      expect(result.earnings.earningsDate).toBe('2024-05-02T16:30:00Z');
      expect(result.earnings.currentQuarterEstimate).toBe(2.25);
      expect(result.earnings.currentQuarterEstimateDate).toBe('2024-04-30');
      expect(result.earnings.currentQuarterEstimateYearAgo).toBe(2.1);
      expect(result.earnings.trends).toHaveLength(1);
      expect(result.meta.fromCache).toBe(false);
      expect(result.meta.dataAge).toBe(0);
      expect(result.meta.warnings).toEqual([]);
    });

    test('applies the declared defaults for limit and includeEstimates', async () => {
      const quarterly: QuarterlyInput[] = Array.from({ length: 15 }, (_, i) => ({
        date: '2024-01-31T17:30:00Z',
        estimate: 2,
        actual: 2 + i / 100
      }));
      clientGetEarnings.mockResolvedValue(earningsResult(quarterly));

      const result = await tools.getEarnings({ symbol: 'AAPL' });

      expect(clientGetEarnings).toHaveBeenCalledWith('AAPL');
      expect(result.earnings.quarterly).toHaveLength(12);
      expect(result.earnings.quarterly[0].estimate).toBe(2);
    });

    test('computes surprise percentage, direction and announcement timing per quarter', async () => {
      clientGetEarnings.mockResolvedValue(earningsResult(richQuarterly));

      const result = await tools.getEarnings({ symbol: 'AAPL' });
      const [beat, miss, inline, noDate] = result.earnings.quarterly;

      expect(beat.surprisePercent).toBeCloseTo(((2.18 - 2.1) / 2.1) * 100, 8);
      expect(beat.surpriseDirection).toBe('positive');
      expect(beat.timing).toBe('after');

      expect(miss.surpriseDirection).toBe('negative');
      expect(miss.timing).toBe('before');

      expect(inline.surprisePercent).toBe(0);
      expect(inline.surpriseDirection).toBe('neutral');
      expect(inline.timing).toBe('during');

      expect(noDate.date).toBe('');
      expect(noDate.timing).toBe('unknown');
    });

    test('honours limit and includeEstimates', async () => {
      clientGetEarnings.mockResolvedValue(earningsResult(richQuarterly));

      const limited = await tools.getEarnings({ symbol: 'AAPL', limit: 2, includeEstimates: false });

      expect(limited.earnings.quarterly).toHaveLength(2);
      expect(limited.earnings.quarterly[0].estimate).toBeNull();
      expect(limited.earnings.quarterly[0].surprisePercent).toBeNull();
      expect(limited.earnings.quarterly[0].surpriseDirection).toBeNull();
    });

    test('reports zero surprise when no estimate is available rather than dividing by zero', async () => {
      clientGetEarnings.mockResolvedValue(earningsResult([{ date: '2024-01-31T17:30:00Z', estimate: 0, actual: 2 }]));

      const result = await tools.getEarnings({ symbol: 'AAPL' });

      expect(result.earnings.quarterly[0].surprisePercent).toBeNull();
      expect(result.earnings.quarterly[0].surpriseDirection).toBeNull();
    });

    test('scores a fully populated payload at the top of the completeness scale', async () => {
      clientGetEarnings.mockResolvedValue(earningsResult(richQuarterly));

      const result = await tools.getEarnings({ symbol: 'AAPL' });

      // The reporter returns a 0-100 percentage and earnings.ts stores it straight into
      // meta.completenessScore, which schemas/*.ts bounds to 0-1. The value is asserted
      // as emitted, not as the shared meta schema would allow.
      expect(result.meta.completenessScore).toBe(100);
    });

    test('degrades an empty earnings payload with warnings instead of throwing', async () => {
      clientGetEarnings.mockResolvedValue(earningsResult([], { trends: false, chartMeta: false }));

      const result = await tools.getEarnings({ symbol: 'AAPL' });

      expect(result.earnings.quarterly).toEqual([]);
      expect(result.earnings.earningsDate).toBeNull();
      expect(result.earnings.currentQuarterEstimate).toBeNull();
      expect(result.meta.warnings).toEqual(
        expect.arrayContaining([
          'Earnings date not available',
          'Current quarter estimate not available',
          'No historical earnings data available',
          'Earnings trend data not available'
        ])
      );
      expect(result.meta.completenessScore).toBe(0);
      expect(result.meta.fromCache).toBe(false);
    });

    test('warns when most quarters are missing actuals', async () => {
      clientGetEarnings.mockResolvedValue(
        earningsResult([
          { date: '2024-01-31T17:30:00Z', estimate: 2.1, actual: null },
          { date: '2023-11-02T17:30:00Z', estimate: 2.05, actual: null },
          { date: '2023-08-01T17:30:00Z', estimate: 2.0, actual: 2.02 }
        ])
      );

      const result = await tools.getEarnings({ symbol: 'AAPL' });

      expect(result.meta.warnings).toContain('Most actual earnings values are missing');
      expect(result.earnings.quarterly[0].actual).toBeNull();
    });

    test('caches per symbol and flags the cached read in meta', async () => {
      clientGetEarnings.mockResolvedValue(earningsResult(richQuarterly));

      await tools.getEarnings({ symbol: 'AAPL' });
      const cached = await tools.getEarnings({ symbol: 'AAPL' });

      expect(clientGetEarnings).toHaveBeenCalledTimes(1);
      expect(tools.getCacheSize()).toBe(1);
      expect(cached.meta.fromCache).toBe(true);
      expect(cached.meta.dataAge).toBeGreaterThanOrEqual(0);
      expect(cached.meta.warnings).toContain('Data from cache');
      expect(cached.earnings.quarterly).toHaveLength(4);
    });

    test('clearCache empties the module instance cache', async () => {
      clientGetEarnings.mockResolvedValue(earningsResult(richQuarterly));

      await tools.getEarnings({ symbol: 'AAPL' });
      tools.clearCache();
      await tools.getEarnings({ symbol: 'AAPL' });

      expect(tools.getCacheSize()).toBe(1);
      expect(clientGetEarnings).toHaveBeenCalledTimes(2);
    });

    test('serves stale cached earnings when a later fetch fails', async () => {
      const realNow = Date.now();
      clientGetEarnings.mockResolvedValue(earningsResult(richQuarterly));
      await tools.getEarnings({ symbol: 'AAPL' });

      clientGetEarnings.mockRejectedValue(new Error('earnings endpoint unavailable'));
      // One minute past the 1 h TTL so the entry reads as expired and the stale branch is
      // taken regardless of how long this test has been running.
      const spy = jest.spyOn(Date, 'now').mockReturnValue(realNow + 3600000 + 60000);

      try {
        const result = await tools.getEarnings({ symbol: 'AAPL' });

        expect(result.meta.fromCache).toBe(true);
        expect(result.meta.warnings).toContain('Using stale cached data due to fetch failure');
        expect(result.meta.dataAge).toBeGreaterThanOrEqual(3600000);
        expect(result.earnings.quarterly).toHaveLength(4);
      } finally {
        spy.mockRestore();
      }
    });

    test('propagates the client YahooFinanceError with its code and suggested action', async () => {
      clientGetEarnings.mockRejectedValue(
        new YahooFinanceError(
          'Earnings data not available for FAKE',
          YF_ERR_DATA_UNAVAILABLE,
          404,
          false,
          false,
          { symbol: 'FAKE' },
          'Check if symbol is valid'
        )
      );

      await expect(tools.getEarnings({ symbol: 'FAKE' })).rejects.toBeInstanceOf(YahooFinanceError);

      const error = await tools.getEarnings({ symbol: 'FAKE' }).catch((e: unknown) => e as YahooFinanceError);

      expect(error).toBeInstanceOf(YahooFinanceError);
      expect(error.code).toBe(YF_ERR_DATA_UNAVAILABLE);
      expect(error.suggestedAction).toBe('Check if symbol is valid');
    });

    test('rejects invalid symbols before calling the client', async () => {
      await expect(tools.getEarnings({ symbol: 'aapl' })).rejects.toThrow('Symbol contains invalid characters');
      await expect(tools.getEarnings({ symbol: 'X'.repeat(21) })).rejects.toThrow();
      await expect(tools.getEarnings({ symbol: '' })).rejects.toThrow();

      expect(clientGetEarnings).not.toHaveBeenCalled();
    });

    test('rejects out-of-range limits', async () => {
      await expect(tools.getEarnings({ symbol: 'AAPL', limit: 0 })).rejects.toThrow();
      await expect(tools.getEarnings({ symbol: 'AAPL', limit: 21 })).rejects.toThrow();
      expect(clientGetEarnings).not.toHaveBeenCalled();
    });

    test('declares get_earnings when registered and dispatches only that name', async () => {
      type Handler = (request: never) => Promise<unknown>;
      const registrations: Array<{ schema: unknown; handler: Handler }> = [];
      const server = {
        setRequestHandler: jest.fn((schema: unknown, handler: Handler) => {
          registrations.push({ schema, handler });
        })
      } as unknown as Server;

      tools.registerTools(server);

      // EarningsTools registers ListTools/CallTool handlers itself, which src/server.ts
      // already owns; the SDK keeps only one handler per request schema.
      expect(registrations.map((entry) => entry.schema)).toEqual([
        ListToolsRequestSchema,
        CallToolRequestSchema
      ]);

      const listed = (await registrations[0].handler({} as never)) as {
        tools: Array<{ name: string; inputSchema: { required: string[] } }>;
      };

      expect(listed.tools).toHaveLength(1);
      expect(listed.tools[0].name).toBe('get_earnings');
      expect(listed.tools[0].inputSchema.required).toEqual(['symbol']);

      clientGetEarnings.mockResolvedValue(earningsResult(richQuarterly));
      const called = (await registrations[1].handler({
        params: { name: 'get_earnings', arguments: { symbol: 'AAPL' } }
      } as never)) as { symbol: string };

      expect(called.symbol).toBe('AAPL');
      await expect(
        registrations[1].handler({ params: { name: 'nope', arguments: {} } } as never)
      ).rejects.toThrow('Unknown tool: nope');
    });
  });
});
