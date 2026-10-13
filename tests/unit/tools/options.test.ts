import { getOptionsTool, getOptionsToolDefinitions, clearOptionsCache } from '../../../src/tools/options';
import { yahooFinance } from '../../../src/services/yahoo-finance';
import { OptionsOutputSchema } from '../../../src/schemas/index';
import {
  YahooFinanceError,
  YF_ERR_DATA_INCOMPLETE,
  YF_ERR_DATA_UNAVAILABLE
} from '../../../src/types/errors';
import { SecurityError } from '../../../src/utils/security';

// src/tools/options.ts exports FUNCTIONS, not a class: the callable surface behind `get_options`
// is `getOptionsTool(args)`, plus `getOptionsToolDefinitions()` (imported by the server entrypoint but
// never called) and `clearOptionsCache()` (shutdown hook). There is no `OptionsTools` and no
// client-injected `getOptions` method: the handler calls the process-wide `yahooFinance`
// singleton once per request — `yahooFinance.options(symbol)` — and maps each contract through
// the real `toOptionContract` helper exported by the same module.
// Handler order per src/tools/AGENTS.md: OptionsInputSchema.parse -> InputValidator.validateSymbol
// -> expiration/date/optionsType grammar -> options() -> normalize + build meta ->
// OptionsOutputSchema.parse. The return value is a PLAIN OBJECT; the server entrypoint wraps it.
// There is no pagination: a requested expiration is substituted with the nearest chain
// (src/tools/AGENTS.md), and the chain dates arrive as Date objects
// (src/types/yahoo-finance.ts:36-49), so `asEpoch` yields MILLISECONDS. Consumers are all in
// milliseconds since 2026-10-13; the residual Greek-math defect is pinned where it is measured.

// Fixed future expirations keep the suite clock-independent: the substitution maths and the
// Greek formula both need timeToExpiration > 0, and these stay in the future for decades.
const EXP1 = Date.parse('2031-01-17T00:00:00.000Z');
const EXP2 = Date.parse('2031-02-21T00:00:00.000Z');
const EXP3 = Date.parse('2031-03-21T00:00:00.000Z');

function trueDateString(ms: number): string {
  return new Date(ms).toISOString().split('T')[0];
}

type Contract = {
  contractSymbol: string;
  strike: number;
  lastPrice: number | null;
  change: number | null;
  percentChange: number | null;
  volume: number;
  openInterest: number;
  bid: number | null;
  ask: number | null;
  impliedVolatility: number | null;
  inTheMoney: boolean;
  contractSize: number;
  currency: string;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
};

type OptionsMetaOut = {
  fromCache: boolean;
  dataAge: number;
  completenessScore: number;
  warnings: string[];
  dataSource: string;
  lastUpdated: string;
  availableExpirations: string[];
  requestedExpiration: string | null;
  fallbackExpiration: boolean;
  ivCalculationMethod: string;
};

type OptionsPayload = {
  symbol: string;
  options: {
    expirationDate: string;
    date: number;
    hasMiniOptions: boolean;
    calls: Contract[];
    puts: Contract[];
  };
  expirationDates: string[];
  meta: OptionsMetaOut;
};

type RawContract = Record<string, unknown>;

function callContract(overrides: RawContract = {}): RawContract {
  return {
    contractSymbol: 'AAPL310117C00180000',
    strike: 180,
    lastPrice: 6.5,
    change: 0.3,
    percentChange: 4.84,
    volume: 1250,
    openInterest: 5432,
    bid: 6.4,
    ask: 6.6,
    impliedVolatility: 0.32,
    inTheMoney: true,
    contractSize: '100',
    currency: 'USD',
    ...overrides
  };
}

function putContract(overrides: RawContract = {}): RawContract {
  return {
    contractSymbol: 'AAPL310117P00180000',
    strike: 180,
    lastPrice: 0.95,
    change: -0.05,
    percentChange: -5.0,
    volume: 3456,
    openInterest: 6789,
    bid: 0.92,
    ask: 0.98,
    impliedVolatility: 0.35,
    inTheMoney: false,
    contractSize: '100',
    currency: 'USD',
    ...overrides
  };
}

function chainPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    underlyingSymbol: 'AAPL',
    expirationDates: [new Date(EXP1), new Date(EXP2), new Date(EXP3)],
    options: [
      {
        date: new Date(EXP1),
        expirationDate: new Date(EXP1),
        hasMiniOptions: false,
        calls: [callContract()],
        puts: [putContract()]
      },
      {
        date: new Date(EXP2),
        expirationDate: new Date(EXP2),
        hasMiniOptions: false,
        calls: [callContract({ contractSymbol: 'AAPL310221C00200000', strike: 200 })],
        puts: [putContract({ contractSymbol: 'AAPL310221P00200000', strike: 200 })]
      },
      {
        date: new Date(EXP3),
        expirationDate: new Date(EXP3),
        hasMiniOptions: false,
        calls: [callContract({ contractSymbol: 'AAPL310321C00300000', strike: 300 })],
        puts: []
      }
    ],
    quote: { regularMarketPrice: 185.92, symbol: 'AAPL' },
    ...overrides
  };
}

let options: jest.Mock;

async function callOptionsTool(args: Record<string, unknown>): Promise<OptionsPayload> {
  return (await getOptionsTool(args)) as unknown as OptionsPayload;
}

describe('options tool module', () => {
  beforeEach(() => {
    clearOptionsCache();
    options = jest.fn();
    (yahooFinance as unknown as { options: jest.Mock }).options = options;
  });

  afterEach(() => {
    clearOptionsCache();
  });

  describe('getOptionsTool', () => {
    test('returns a plain options payload, never an MCP content array', async () => {
      options.mockResolvedValue(chainPayload());

      const result = await callOptionsTool({ symbol: 'AAPL' });

      expect(result).not.toHaveProperty('content');
      expect(result).not.toHaveProperty('isError');
      expect(result.symbol).toBe('AAPL');
      expect(result).toHaveProperty('options');
      expect(result).toHaveProperty('expirationDates');
      expect(result).toHaveProperty('meta');
      expect(result.options.calls).toHaveLength(1);
      expect(result.options.puts).toHaveLength(1);
      expect(OptionsOutputSchema.parse(result)).toEqual(result);
    });

    test('calls the library once for the symbol and maps every contract field', async () => {
      options.mockResolvedValue(chainPayload());

      const result = await callOptionsTool({ symbol: 'AAPL' });

      expect(options).toHaveBeenCalledTimes(1);
      expect(options).toHaveBeenCalledWith('AAPL');
      expect(result.options.date).toBe(EXP1);
      expect(result.options.hasMiniOptions).toBe(false);
      expect(result.options.calls[0]).toEqual({
        contractSymbol: 'AAPL310117C00180000',
        strike: 180,
        lastPrice: 6.5,
        change: 0.3,
        percentChange: 4.84,
        volume: 1250,
        openInterest: 5432,
        bid: 6.4,
        ask: 6.6,
        impliedVolatility: 0.32,
        inTheMoney: true,
        contractSize: 100,
        currency: 'USD',
        delta: null,
        gamma: null,
        theta: null,
        vega: null
      });
      expect(result.options.puts[0]).toMatchObject({
        contractSymbol: 'AAPL310117P00180000',
        strike: 180,
        lastPrice: 0.95,
        percentChange: -5.0,
        inTheMoney: false
      });
    });

    test('carries the options meta contract on a fresh fetch', async () => {
      options.mockResolvedValue(chainPayload());

      const result = await callOptionsTool({ symbol: 'AAPL' });
      const meta = result.meta;

      expect(meta.fromCache).toBe(false);
      expect(meta.dataAge).toBe(0);
      expect(meta.dataSource).toBe('Yahoo Finance');
      expect(meta.completenessScore).toBe(1);
      expect(meta.completenessScore).toBeGreaterThanOrEqual(0);
      expect(meta.completenessScore).toBeLessThanOrEqual(1);
      expect(meta.warnings).toEqual([]);
      expect(meta.requestedExpiration).toBeNull();
      expect(meta.fallbackExpiration).toBe(false);
      expect(meta.ivCalculationMethod).toBe('Black-Scholes approximation');
      expect(Date.parse(meta.lastUpdated)).toBeGreaterThan(Date.now() - 5000);
    });

    test('reports every expiration as the calendar date of its millisecond epoch', async () => {
      options.mockResolvedValue(chainPayload());

      const result = await callOptionsTool({ symbol: 'AAPL' });

      // `asEpoch` returns milliseconds and every consumer now treats them as milliseconds. Before
      // 2026-10-13 the consumers scaled them a second time, so a 2031 expiry was reported as a
      // year ~61,000 date.
      expect(result.expirationDates).toEqual([trueDateString(EXP1), trueDateString(EXP2), trueDateString(EXP3)]);
      expect(result.options.expirationDate).toBe(trueDateString(EXP1));
      expect(result.meta.availableExpirations).toEqual(
        [EXP1, EXP2, EXP3].map(trueDateString).sort()
      );
      for (const reported of result.expirationDates) {
        expect(reported.startsWith('+')).toBe(false);
        expect(reported).toBe(trueDateString(Date.parse(reported)));
      }
    });

    test('accepts a requested expiration that is genuinely offered', async () => {
      options.mockResolvedValue(chainPayload());

      const result = await callOptionsTool({ symbol: 'AAPL', expiration: trueDateString(EXP1) });

      // EXP1 is the first offered chain, so nothing is substituted now that the comparison is
      // milliseconds against milliseconds.
      expect(result.meta.requestedExpiration).toBe(trueDateString(EXP1));
      expect(result.meta.fallbackExpiration).toBe(false);
      expect(result.meta.warnings).not.toContain('Requested expiration not available, using closest available date');
      expect(result.options.date).toBe(EXP1);
    });

    test('selects the chain that matches the requested expiration', async () => {
      options.mockResolvedValue(chainPayload());

      const result = await callOptionsTool({ symbol: 'AAPL', expiration: trueDateString(EXP3) });

      // The requested 2031-03 chain is found rather than the first chain being served, which is
      // what the seconds-versus-milliseconds lookup silently prevented before 2026-10-13.
      expect(result.options.date).toBe(EXP3);
      expect(result.options.calls[0].contractSymbol).toBe('AAPL310321C00300000');
      // fallbackExpiration is still flagged for any requested expiry other than the first,
      // because the code computes it as "requested !== expirationDates[0]" rather than comparing
      // against what it actually served. Open defect.
      expect(result.meta.fallbackExpiration).toBe(true);
    });

    test('filters calls and puts by optionsType and scores the filtered set', async () => {
      options.mockResolvedValue(chainPayload());

      const callsOnly = await callOptionsTool({ symbol: 'AAPL', optionsType: 'calls' });
      expect(callsOnly.options.calls).toHaveLength(1);
      expect(callsOnly.options.puts).toEqual([]);
      expect(callsOnly.meta.completenessScore).toBe(1);

      clearOptionsCache();
      const putsOnly = await callOptionsTool({ symbol: 'AAPL', optionsType: 'puts' });
      expect(putsOnly.options.calls).toEqual([]);
      expect(putsOnly.options.puts).toHaveLength(1);
      expect(putsOnly.meta.completenessScore).toBe(1);

      expect(options).toHaveBeenCalledTimes(2);
    });

    test('degrades an expiration with no contracts on the requested side', async () => {
      options.mockResolvedValue(
        chainPayload({
          options: [
            {
              date: new Date(EXP1),
              expirationDate: new Date(EXP1),
              hasMiniOptions: false,
              calls: [],
              puts: [putContract()]
            }
          ]
        })
      );

      const result = await callOptionsTool({ symbol: 'AAPL', optionsType: 'calls' });

      expect(result.options.calls).toEqual([]);
      expect(result.options.puts).toEqual([]);
      expect(result.meta.completenessScore).toBe(0);
      expect(result.meta.warnings).toContain('No option contracts available for selected expiration');
    });

    test('defect guard: includeGreeks still collapses every contract to the intrinsic limit', async () => {
      options.mockResolvedValue(chainPayload());

      const result = await callOptionsTool({ symbol: 'AAPL', includeGreeks: true });
      const call = result.options.calls[0];
      const put = result.options.puts[0];

      expect(call.delta).not.toBeNull();
      expect(put.delta).not.toBeNull();
      // The 2026-10-13 epoch-unit fix cured the reported dates and timeToExpiration, but the
      // Greeks are still degenerate for a 4.2-year at-the-money contract at 32% implied
      // volatility (spot 185.92 vs strike 180): delta saturates at 1 for the call and 0 for the
      // put, and gamma/vega underflow two orders of magnitude below any usable value. Measured,
      // not theorised. A second unit error survives in the volatility or rate inputs the
      // Black-Scholes helpers actually receive — open defect, see src/tools/AGENTS.md.
      expect(call.delta).toBe(1);
      expect(put.delta).toBe(0);
      expect(call.gamma).toBeLessThan(1e-100);
      expect(call.vega).toBeLessThan(1e-100);
      expect(put.gamma).toBeLessThan(1e-100);
      expect(put.vega).toBeLessThan(1e-100);
    });

    test('defect guard: an untraded contract reports lastPrice 0 and still gets Greeks', async () => {
      options.mockResolvedValue(
        chainPayload({
          options: [
            {
              date: new Date(EXP1),
              expirationDate: new Date(EXP1),
              hasMiniOptions: false,
              calls: [callContract({ lastPrice: null, impliedVolatility: null })],
              puts: [putContract({ lastPrice: null, impliedVolatility: null })]
            }
          ]
        })
      );

      const result = await callOptionsTool({ symbol: 'AAPL', includeGreeks: true });
      const call = result.options.calls[0];
      const put = result.options.puts[0];

      // toOptionContract collapses a null lastPrice/impliedVolatility to 0 before
      // convertOptionContract sees them, so the `lastPrice !== null && impliedVolatility
      // !== null` gate can never fail on a live payload: a contract that never traded is
      // priced at 0 and run through Black-Scholes with sigma 0, which returns the boundary
      // deltas (1 for a call, -1 for a put) instead of null Greeks.
      expect(call.lastPrice).toBe(0);
      expect(call.impliedVolatility).toBe(0);
      expect(call.delta).toBe(1);
      expect(call.gamma).toBe(0);
      expect(call.theta).toBe(0);
      expect(call.vega).toBe(0);
      expect(put.delta).toBe(-1);
      expect(put.gamma).toBe(0);
    });

    test('leaves the Greeks null when the chain date is not a Date', async () => {
      // timeToExpiration is 0 whenever expirationDate is absent, which is the only reachable
      // way to keep the Greek gate closed.
      options.mockResolvedValue(
        chainPayload({
          options: [
            {
              date: undefined,
              expirationDate: undefined,
              hasMiniOptions: false,
              calls: [callContract()],
              puts: []
            }
          ]
        })
      );

      const result = await callOptionsTool({ symbol: 'AAPL', includeGreeks: true });

      expect(result.options.date).toBe(0);
      expect(result.options.expirationDate).toBe('');
      expect(result.options.calls[0].delta).toBeNull();
      expect(result.options.calls[0].gamma).toBeNull();
      expect(result.options.calls[0].theta).toBeNull();
      expect(result.options.calls[0].vega).toBeNull();
    });

    test('defect guard: absent contract fields land on the library zeros, not the documented defaults', async () => {
      options.mockResolvedValue(
        chainPayload({
          options: [
            {
              date: new Date(EXP1),
              expirationDate: new Date(EXP1),
              hasMiniOptions: false,
              calls: [{ strike: 190 }],
              puts: []
            }
          ]
        })
      );

      const result = await callOptionsTool({ symbol: 'AAPL' });

      // toOptionContract runs first and coerces every field to a number, so the `100` /
      // `'USD'` fallbacks in convertOptionContract are unreachable for live payloads.
      expect(result.options.calls[0]).toEqual({
        contractSymbol: '',
        strike: 190,
        lastPrice: 0,
        change: 0,
        percentChange: 0,
        volume: 0,
        openInterest: 0,
        bid: 0,
        ask: 0,
        impliedVolatility: 0,
        inTheMoney: false,
        contractSize: 0,
        currency: '',
        delta: null,
        gamma: null,
        theta: null,
        vega: null
      });
      expect(result.meta.completenessScore).toBe(1);
    });

    test('throws a non-retryable incomplete-data error when the chain is absent', async () => {
      options.mockResolvedValue({ expirationDates: [], options: [] });

      const error = (await callOptionsTool({ symbol: 'FAKE' }).catch((e: unknown) => e)) as YahooFinanceError;

      expect(error).toBeInstanceOf(YahooFinanceError);
      expect(error.code).toBe(YF_ERR_DATA_INCOMPLETE);
      expect(error.message).toBe('Options data not available for FAKE');
      expect(error.isRetryable).toBe(false);
      expect(error.suggestedAction).toBe('Check if symbol has options trading available');
      expect(error.context).toEqual({ symbol: 'FAKE' });
    });

    test('throws when a chain is present but no expirations are reported', async () => {
      options.mockResolvedValue(chainPayload({ expirationDates: undefined }));

      const error = (await callOptionsTool({ symbol: 'AAPL' }).catch((e: unknown) => e)) as YahooFinanceError;

      expect(error).toBeInstanceOf(YahooFinanceError);
      expect(error.code).toBe(YF_ERR_DATA_INCOMPLETE);
      expect(error.message).toBe('No options expirations available for AAPL');
    });

    test('wraps a transport failure as a retryable unavailable error', async () => {
      options.mockRejectedValue(new Error('Network error'));

      const error = (await callOptionsTool({ symbol: 'AAPL' }).catch((e: unknown) => e)) as YahooFinanceError;

      expect(error).toBeInstanceOf(YahooFinanceError);
      expect(error.code).toBe(YF_ERR_DATA_UNAVAILABLE);
      expect(error.message).toBe('Failed to fetch options for AAPL: Network error');
      expect(error.isRetryable).toBe(true);
      expect(error.suggestedAction).toBe('Retry request or check if options are available for this symbol');
    });

    test('defect guard: a chain dated in epoch seconds rather than Dates collapses to 1970', async () => {
      // The shape tests/fixtures/mock-responses.ts still publishes: numeric epoch seconds.
      // asEpoch only recognises Date objects, so every date field collapses to 0.
      options.mockResolvedValue({
        expirationDates: [EXP1 / 1000, EXP2 / 1000],
        options: [
          {
            date: EXP1 / 1000,
            expirationDate: EXP1 / 1000,
            hasMiniOptions: false,
            calls: [callContract()],
            puts: []
          }
        ],
        quote: { regularMarketPrice: 185.92 }
      });

      const result = await callOptionsTool({ symbol: 'AAPL' });

      expect(result.expirationDates).toEqual(['1970-01-01', '1970-01-01']);
      expect(result.options.date).toBe(0);
      expect(result.options.expirationDate).toBe('');
      expect(result.options.calls[0].contractSymbol).toBe('AAPL310117C00180000');
    });

    test('serves the second identical request from the module options cache', async () => {
      options.mockResolvedValue(chainPayload());

      const first = await callOptionsTool({ symbol: 'AAPL' });
      const second = await callOptionsTool({ symbol: 'AAPL' });

      expect(options).toHaveBeenCalledTimes(1);
      expect(first.meta.fromCache).toBe(false);
      expect(second.meta.fromCache).toBe(true);
      expect(second.options.calls).toEqual(first.options.calls);
      // `dataAge` comes from OptionsToolCache.getAge. It used to be `now - cacheKey.length`,
      // which reported a ~57-year-old chain and dragged `lastUpdated` back to the Unix epoch.
      expect(second.meta.dataAge).toBeLessThan(1000);
      expect(second.meta.warnings).not.toContain('Options data is stale (older than 45 minutes)');
      expect(Date.parse(second.meta.lastUpdated)).toBeGreaterThan(Date.now() - 5000);
      // The cached branch still returns `data.options[0]` whatever was asked for, and still
      // hardcodes fallbackExpiration false. Open defect, pinned in the next test.
      expect(second.meta.requestedExpiration).toBeNull();
    });

    test('defect guard: a cached request for a substituted expiration stops reporting the substitution', async () => {
      options.mockResolvedValue(chainPayload());

      const fresh = await callOptionsTool({ symbol: 'AAPL', expiration: trueDateString(EXP3) });
      const cached = await callOptionsTool({ symbol: 'AAPL', expiration: trueDateString(EXP3) });

      expect(fresh.meta.fallbackExpiration).toBe(true);
      expect(cached.meta.fromCache).toBe(true);
      // Same data, same impossible request, but the cached path hardcodes fallbackExpiration
      // false, so the client stops being told the chain it received is not the one it asked for.
      expect(cached.meta.fallbackExpiration).toBe(false);
      expect(cached.meta.requestedExpiration).toBe(trueDateString(EXP3));
      expect(cached.meta.warnings).not.toContain('Requested expiration not available, using closest available date');
      expect(cached.options.date).toBe(EXP1);
    });

    test('keys the cache by expiration and includeGreeks', async () => {
      options.mockResolvedValue(chainPayload());

      await callOptionsTool({ symbol: 'AAPL' });
      await callOptionsTool({ symbol: 'AAPL', includeGreeks: true });
      await callOptionsTool({ symbol: 'AAPL', expiration: trueDateString(EXP2) });

      expect(options).toHaveBeenCalledTimes(3);
    });

    test('clearOptionsCache forces the next request back to the network', async () => {
      options.mockResolvedValue(chainPayload());

      await callOptionsTool({ symbol: 'AAPL' });
      clearOptionsCache();
      const refetched = await callOptionsTool({ symbol: 'AAPL' });

      expect(options).toHaveBeenCalledTimes(2);
      expect(refetched.meta.fromCache).toBe(false);
    });

    test('validates the symbol, expiration, date and optionsType grammar before any call', async () => {
      options.mockResolvedValue(chainPayload());

      await expect(callOptionsTool({ symbol: 'aapl' })).rejects.toThrow(SecurityError);
      await expect(callOptionsTool({ symbol: 'aapl' })).rejects.toThrow('Symbol contains invalid characters');
      await expect(callOptionsTool({ symbol: 'X'.repeat(21) })).rejects.toThrow();
      await expect(callOptionsTool({ symbol: 'AAPL', date: '17-01-2031' })).rejects.toThrow(
        'date must be in YYYY-MM-DD format'
      );
      await expect(callOptionsTool({ symbol: 'AAPL', date: '2100-01-17' })).resolves.toMatchObject({
        symbol: 'AAPL'
      });
      await expect(callOptionsTool({ symbol: 'AAPL', optionsType: 'calls; DROP TABLE' })).rejects.toThrow();
      await expect(callOptionsTool({ symbol: 'AAPL', optionsType: 'strikes' })).rejects.toThrow();
      await expect(callOptionsTool({ symbol: 'AAPL', expiration: 1700000000 as unknown as string })).rejects.toThrow();

      expect(options).toHaveBeenCalledTimes(1);
    });
  });

  // The branches below are the ones the live-shaped fixtures never reach: the cache TTL and
  // age checks, the stringly-typed contract coercion fallbacks, a chain entry whose optional
  // keys are absent, the nearest-expiration substitution in both directions, and the two
  // staleness bands of the metadata warning ladder. All epoch maths stays in MILLISECONDS.
  describe('options cache clock and normalization', () => {
    test('evicts the cached chain when the age check lands past the TTL', async () => {
      options.mockResolvedValue(chainPayload());
      const base = Date.now();

      await callOptionsTool({ symbol: 'AAPL' });

      // A cached call reads the clock five times: the fromCache probe, the lookup inside
      // getOptionsData, the chain's time-to-expiry, OptionsToolCache.getAge, and lastUpdated.
      // Only the first two may see the entry as live, otherwise the library is called again.
      const live = base + 1000;
      const past = base + 3600000 + 60000;
      const reads = [live, live, past, past, past];
      let index = 0;
      const spy = jest.spyOn(Date, 'now').mockImplementation(() => reads[Math.min(index++, reads.length - 1)]);

      try {
        const second = await callOptionsTool({ symbol: 'AAPL' });

        expect(second.meta.fromCache).toBe(true);
        expect(second.meta.dataAge).toBe(0);
        expect(second.options.calls).toHaveLength(1);
      } finally {
        spy.mockRestore();
      }

      expect(options).toHaveBeenCalledTimes(1);

      // getAge deleted the expired entry, so the next request really does refetch.
      const third = await callOptionsTool({ symbol: 'AAPL' });

      expect(third.meta.fromCache).toBe(false);
      expect(options).toHaveBeenCalledTimes(2);
    });

    test('reports the 30-minute and 45-minute staleness bands of an ageing cached chain', async () => {
      options.mockResolvedValue(chainPayload());
      const base = Date.now();

      await callOptionsTool({ symbol: 'AAPL' });

      const firstSpy = jest.spyOn(Date, 'now').mockReturnValue(base + 2000000);
      let midAge;
      try {
        midAge = await callOptionsTool({ symbol: 'AAPL' });
      } finally {
        firstSpy.mockRestore();
      }

      expect(midAge.meta.fromCache).toBe(true);
      expect(midAge.meta.dataAge).toBeGreaterThan(1800000);
      expect(midAge.meta.dataAge).toBeLessThanOrEqual(2700000);
      expect(midAge.meta.warnings).toEqual(['Options data may be stale (older than 30 minutes)']);

      const secondSpy = jest.spyOn(Date, 'now').mockReturnValue(base + 2900000);
      let oldAge;
      try {
        oldAge = await callOptionsTool({ symbol: 'AAPL' });
      } finally {
        secondSpy.mockRestore();
      }

      expect(oldAge.meta.dataAge).toBeGreaterThan(2700000);
      expect(oldAge.meta.warnings).toEqual(['Options data is stale (older than 45 minutes)']);
      expect(options).toHaveBeenCalledTimes(1);
    });

    test('drops the cached entry once it is older than the one-hour TTL', async () => {
      options.mockResolvedValue(chainPayload());

      await callOptionsTool({ symbol: 'AAPL' });

      const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 3600000 + 60000);
      try {
        const refetched = await callOptionsTool({ symbol: 'AAPL' });
        expect(refetched.meta.fromCache).toBe(false);
      } finally {
        spy.mockRestore();
      }

      expect(options).toHaveBeenCalledTimes(2);
    });

    test('evaluates the negative-side normal CDF for a deep out-of-the-money chain', async () => {
      options.mockResolvedValue(
        chainPayload({
          options: [
            {
              date: new Date(EXP1),
              expirationDate: new Date(EXP1),
              hasMiniOptions: false,
              calls: [callContract({ strike: 5000, lastPrice: 0.01, impliedVolatility: 0.32 })],
              puts: [putContract({ strike: 5000, lastPrice: 0.01, impliedVolatility: 0.35 })]
            }
          ]
        })
      );

      const result = await callOptionsTool({ symbol: 'AAPL', includeGreeks: true });
      const call = result.options.calls[0];
      const put = result.options.puts[0];

      // spot 185.92 against a 5000 strike drives d1 deeply negative, which is the only way to
      // take the sign = -1 side of the Abramowitz-Stegun CDF. The call's probability mass is
      // zero and the put's is zero minus one; the put still carries the negative theta of a
      // written option while the call's theta collapses to zero.
      expect(call.delta).toBe(0);
      expect(call.gamma).toBe(0);
      expect(call.vega).toBe(0);
      expect(call.theta).toBeCloseTo(0);
      expect(put.delta).toBe(-1);
      expect(put.theta).toBeLessThan(0);
    });

    test('coerces a stringly-typed contract onto the converter defaults', async () => {
      options.mockResolvedValue(
        chainPayload({
          options: [
            {
              date: new Date(EXP1),
              expirationDate: new Date(EXP1),
              hasMiniOptions: 'no',
              calls: [
                {
                  contractSymbol: 123,
                  strike: '180',
                  lastPrice: '6.5',
                  change: '0.3',
                  percentChange: '4.84',
                  volume: '1250',
                  openInterest: '5432',
                  bid: '6.4',
                  ask: '6.6',
                  impliedVolatility: '0.32',
                  inTheMoney: 'true',
                  contractSize: 100,
                  currency: 5
                }
              ],
              puts: []
            }
          ]
        })
      );

      const result = await callOptionsTool({ symbol: 'AAPL' });

      // toOptionContract only normalizes with `?? 0` and Number() for contractSize, so every
      // other string survives into convertOptionContract, which types each one and lands on
      // its own default. contractSize is the single field that cannot reach its default.
      expect(result.options.hasMiniOptions).toBe(false);
      expect(result.options.calls[0]).toEqual({
        contractSymbol: '',
        strike: 0,
        lastPrice: null,
        change: null,
        percentChange: null,
        volume: 0,
        openInterest: 0,
        bid: null,
        ask: null,
        impliedVolatility: null,
        inTheMoney: false,
        contractSize: 100,
        currency: 'USD',
        delta: null,
        gamma: null,
        theta: null,
        vega: null
      });
      expect(result.meta.completenessScore).toBe(1);
    });

    test('fills the chain defaults when the library omits hasMiniOptions, calls, puts and quote', async () => {
      options.mockResolvedValue({
        underlyingSymbol: 'AAPL',
        expirationDates: [new Date(EXP1)],
        options: [{ date: new Date(EXP1) }]
      });

      const result = await callOptionsTool({ symbol: 'AAPL' });

      expect(result.options.calls).toEqual([]);
      expect(result.options.puts).toEqual([]);
      expect(result.options.hasMiniOptions).toBe(false);
      // No expirationDate on the chain entry, so asEpoch yields 0 and the date stays blank;
      // no quote, so the spot price used for intrinsic checks is 0 rather than an error.
      expect(result.options.expirationDate).toBe('');
      // The emitted `date` is the chain's expirationDate, not its `date` field, so an entry
      // that carries only a date reports 0 even though fetchOptions parsed the date fine.
      expect(result.options.date).toBe(0);
      expect(result.expirationDates).toEqual([trueDateString(EXP1)]);
      expect(result.meta.completenessScore).toBe(0);
      expect(result.meta.warnings).toEqual(['No option contracts available for selected expiration']);
    });

    test('serves a cached chain that has neither a numeric spot nor a Date-shaped period', async () => {
      options.mockResolvedValue({
        expirationDates: [new Date(EXP1)],
        options: [
          {
            date: EXP1,
            expirationDate: EXP1,
            hasMiniOptions: false,
            calls: [callContract()],
            puts: []
          }
        ],
        quote: { regularMarketPrice: '185.92' }
      });

      const first = await callOptionsTool({ symbol: 'AAPL' });

      // asEpoch only accepts Date objects, so a numeric epoch collapses the whole chain to 0
      // while the top-level expirationDates (which are Dates) stay correct.
      expect(first.options.date).toBe(0);
      expect(first.options.expirationDate).toBe('');
      expect(first.expirationDates).toEqual([trueDateString(EXP1)]);

      const second = await callOptionsTool({ symbol: 'AAPL' });

      expect(options).toHaveBeenCalledTimes(1);
      expect(second.meta.fromCache).toBe(true);
      // The cached branch reads the same two unusable values: a spot that is not a number
      // falls back to 0, and a chain dated 0 stays 0.
      expect(second.options.date).toBe(0);
      expect(second.options.calls[0].contractSymbol).toBe('AAPL310117C00180000');
    });

    test('substitutes the nearest offered expiration from either side of the request', async () => {
      options.mockResolvedValue(chainPayload());

      // 2031-01-25 is 8 days after the first offered chain and 27 days before the second, so
      // the reduce keeps the earlier candidate at every step.
      const earlier = await callOptionsTool({ symbol: 'AAPL', expiration: '2031-01-25' });

      expect(earlier.meta.requestedExpiration).toBe('2031-01-25');
      expect(earlier.meta.fallbackExpiration).toBe(true);
      expect(earlier.meta.warnings).toContain('Requested expiration not available, using closest available date');
      expect(earlier.options.date).toBe(EXP1);
      expect(earlier.options.expirationDate).toBe(trueDateString(EXP1));

      clearOptionsCache();

      // 2031-03-15 is 6 days before the last chain and 53 days after the second, so the
      // reduce has to move forward twice before it lands on 2031-03-21.
      const later = await callOptionsTool({ symbol: 'AAPL', expiration: '2031-03-15' });

      expect(later.options.date).toBe(EXP3);
      expect(later.options.expirationDate).toBe(trueDateString(EXP3));
      expect(later.options.calls[0].strike).toBe(300);
      expect(later.meta.availableExpirations).toHaveLength(3);
      expect(options).toHaveBeenCalledTimes(2);
    });

    test('serves the first chain when the substituted expiration matches no chain entry', async () => {
      // The substitution runs over `expirationDates`, but the chain is then looked up in
      // `options[]` by its own `date`. When the two disagree the lookup misses and the code
      // silently keeps serving options[0], while the meta still advertises the substitution.
      options.mockResolvedValue({
        underlyingSymbol: 'AAPL',
        expirationDates: [new Date(EXP1), new Date(EXP2)],
        options: [
          {
            date: new Date(EXP3),
            expirationDate: new Date(EXP3),
            hasMiniOptions: false,
            calls: [callContract({ contractSymbol: 'AAPL310321C00300000', strike: 300 })],
            puts: []
          }
        ],
        quote: { regularMarketPrice: 185.92 }
      });

      const result = await callOptionsTool({ symbol: 'AAPL', expiration: '2031-03-15' });

      expect(result.meta.requestedExpiration).toBe('2031-03-15');
      expect(result.meta.fallbackExpiration).toBe(true);
      expect(result.meta.warnings).toContain('Requested expiration not available, using closest available date');
      expect(result.meta.availableExpirations).toEqual([trueDateString(EXP1), trueDateString(EXP2)].sort());
      // The served chain is the only one present, dated 2031-03-21, which is not even offered
      // in expirationDates.
      expect(result.options.date).toBe(EXP3);
      expect(result.options.expirationDate).toBe(trueDateString(EXP3));
      expect(result.options.calls[0].strike).toBe(300);
    });

    test('names a non-Error options rejection with String(error)', async () => {
      options.mockRejectedValue('chain unavailable');

      const error = (await callOptionsTool({ symbol: 'AAPL' }).catch((e: unknown) => e)) as YahooFinanceError;

      expect(error).toBeInstanceOf(YahooFinanceError);
      expect(error.code).toBe(YF_ERR_DATA_UNAVAILABLE);
      expect(error.message).toBe('Failed to fetch options for AAPL: chain unavailable');
      expect(error.isRetryable).toBe(true);
    });
  });

  describe('getOptionsToolDefinitions', () => {
    test('declares the single get_options tool and its required args', () => {
      const definitions = getOptionsToolDefinitions();

      expect(definitions).toHaveLength(1);
      expect(definitions[0].name).toBe('get_options');
      expect(definitions[0].inputSchema).toMatchObject({
        type: 'object',
        required: ['symbol'],
        properties: {
          symbol: { type: 'string', minLength: 1, maxLength: 20 },
          date: { type: 'string' },
          expiration: { type: 'string' },
          optionsType: { type: 'string', enum: ['calls', 'puts', 'both'] },
          includeGreeks: { type: 'boolean' }
        }
      });
    });

    test('gives every definition a description and an object input schema', () => {
      for (const definition of getOptionsToolDefinitions()) {
        expect(definition).toHaveProperty('name');
        expect(typeof definition.description).toBe('string');
        expect(definition.description.length).toBeGreaterThan(0);
        expect(definition).toHaveProperty('inputSchema');
      }
    });
  });
});
