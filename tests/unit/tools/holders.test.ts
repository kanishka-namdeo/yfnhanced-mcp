import { getMajorHoldersTool, getHoldersToolDefinitions, clearHoldersCache } from '../../../src/tools/holders';
import { yahooFinance } from '../../../src/services/yahoo-finance';
import { mockHoldersResponse } from '../../fixtures/mock-responses.ts';
import { HoldersOutputSchema } from '../../../src/schemas/index';
import {
  YahooFinanceError,
  YF_ERR_DATA_INCOMPLETE,
  YF_ERR_DATA_UNAVAILABLE
} from '../../../src/types/errors';
import { SecurityError } from '../../../src/utils/security';

// src/tools/holders.ts exports FUNCTIONS, not a class: the callable surface behind
// `get_major_holders` is `getMajorHoldersTool(args)`, plus `getHoldersToolDefinitions()`
// (imported by the server entrypoint but never called) and `clearHoldersCache()` (shutdown hook).
// There is no `HoldersTools` and no client-injected `getHolders` method: the handler walks
// five quoteSummary modules through the process-wide `yahooFinance` singleton, one request
// per module, in this order: majorHoldersBreakdown (required), institutionOwnership,
// fundOwnership, insiderHolders, majorDirectHolders (each optional and degraded).
// Handler order per src/tools/AGENTS.md: HoldersInputSchema.parse -> InputValidator.validateSymbol
// -> module fetches -> normalize + build meta -> HoldersOutputSchema.parse. The return value
// is a PLAIN OBJECT; the server entrypoint adds the MCP `content` wrapper.

const DAY_MS = 86400000;
const REPORT_DATE = Date.parse('2024-01-31T00:00:00.000Z');

type HolderRow = {
  holderName: string;
  holderType: string;
  relation: string;
  lastReported: string;
  positionDirect: number | null;
  positionDirectDate: string | null;
  positionIndirect: number | null;
  positionIndirectDate: string | null;
  position: number | null;
  changeHistory?: Array<{ date: string; shares: number; change: number; changePercent: number }>;
};

type HoldersMetaOut = {
  fromCache: boolean;
  dataAge: number;
  completenessScore: number;
  warnings: string[];
  dataSource: string;
  lastUpdated: string;
};

type HoldersPayload = {
  symbol: string;
  majorHoldersBreakdown: {
    insidersPercentHeld: number;
    institutionsPercentHeld: number;
    institutionsFloatPercentHeld: number;
    institutionsCount: number;
  };
  institutionalHolders: HolderRow[];
  fundHolders: HolderRow[];
  insiderHolders: HolderRow[];
  directHolders: HolderRow[];
  meta: HoldersMetaOut;
};

type ModulePayloads = Record<string, unknown>;

const fullBreakdown = {
  maxAge: 86400,
  insidersPercentHeld: 0.07,
  institutionsPercentHeld: 0.592,
  institutionsFloatPercentHeld: 0.651,
  institutionsCount: 5236
};

const fullModules = (): ModulePayloads => ({
  majorHoldersBreakdown: fullBreakdown,
  institutionOwnership: {
    maxAge: 86400,
    ownershipList: [
      {
        organization: 'Vanguard Group Inc',
        reportDate: new Date(REPORT_DATE),
        position: 1000,
        value: 292760993792,
        pctHeld: 0.1011
      }
    ]
  },
  fundOwnership: {
    maxAge: 86400,
    ownershipList: [
      {
        organization: 'Vanguard Total Stock Mkt Idx ETF',
        reportDate: new Date(REPORT_DATE),
        position: 2000,
        value: 40000,
        pctHeld: 0.02
      }
    ]
  },
  insiderHolders: {
    maxAge: 86400,
    holders: [
      {
        name: 'COOK TIMOTHY D',
        relation: 'Chief Executive Officer',
        positionDirect: 3000000,
        positionIndirect: 4500000,
        latestTransDate: new Date(REPORT_DATE),
        filerUrl: 'https://example.com/filer',
        maxAge: 86400
      }
    ]
  },
  majorDirectHolders: {
    maxAge: 86400,
    holders: [
      {
        holderName: 'MURPHY KATHERLEEN',
        positionDirect: 100000,
        positionDirectDate: new Date(REPORT_DATE),
        positionIndirect: 25000,
        positionIndirectDate: new Date(REPORT_DATE)
      }
    ]
  }
});

let quoteSummary: jest.Mock;

function stubQuoteSummary(modules: ModulePayloads): void {
  quoteSummary.mockImplementation((_symbol: string, options: { modules: string[] }) => {
    const name = options.modules[0];
    if (!(name in modules)) {
      return Promise.resolve({});
    }
    return Promise.resolve({ [name]: modules[name] });
  });
}

async function callHoldersTool(args: Record<string, unknown>): Promise<HoldersPayload> {
  return (await getMajorHoldersTool(args)) as unknown as HoldersPayload;
}

describe('holders tool module', () => {
  beforeEach(() => {
    clearHoldersCache();
    quoteSummary = jest.fn();
    (yahooFinance as unknown as { quoteSummary: jest.Mock }).quoteSummary = quoteSummary;
  });

  afterEach(() => {
    clearHoldersCache();
  });

  describe('getMajorHoldersTool', () => {
    test('returns a plain holders payload, never an MCP content array', async () => {
      stubQuoteSummary(fullModules());

      const result = await callHoldersTool({ symbol: 'AAPL' });

      expect(result).not.toHaveProperty('content');
      expect(result).not.toHaveProperty('isError');
      expect(result.symbol).toBe('AAPL');
      expect(result.majorHoldersBreakdown).toEqual({
        insidersPercentHeld: 0.07,
        institutionsPercentHeld: 0.592,
        institutionsFloatPercentHeld: 0.651,
        institutionsCount: 5236
      });
      expect(HoldersOutputSchema.parse(result)).toEqual(result);
    });

    test('requests one quoteSummary module per holder section for the requested symbol', async () => {
      stubQuoteSummary(fullModules());

      await callHoldersTool({ symbol: 'MSFT' });

      expect(quoteSummary).toHaveBeenCalledTimes(5);
      expect(quoteSummary.mock.calls.map((call) => [call[0], call[1]])).toEqual([
        ['MSFT', { modules: ['majorHoldersBreakdown'] }],
        ['MSFT', { modules: ['institutionOwnership'] }],
        ['MSFT', { modules: ['fundOwnership'] }],
        ['MSFT', { modules: ['insiderHolders'] }],
        ['MSFT', { modules: ['majorDirectHolders'] }]
      ]);
    });

    test('carries the meta contract on a fresh fetch', async () => {
      stubQuoteSummary(fullModules());

      const result = await callHoldersTool({ symbol: 'AAPL' });
      const meta = result.meta;

      expect(meta.fromCache).toBe(false);
      expect(meta.dataAge).toBe(0);
      expect(meta.dataSource).toBe('Yahoo Finance');
      expect(meta.completenessScore).toBe(1);
      expect(meta.completenessScore).toBeGreaterThanOrEqual(0);
      expect(meta.completenessScore).toBeLessThanOrEqual(1);
      expect(meta.warnings).toEqual([]);
      expect(Date.parse(meta.lastUpdated)).toBeGreaterThan(Date.now() - 5000);
    });

    test('maps each holder section onto the shared row shape', async () => {
      stubQuoteSummary(fullModules());

      const result = await callHoldersTool({ symbol: 'AAPL' });

      expect(result.institutionalHolders).toEqual([
        {
          holderName: 'Vanguard Group Inc',
          holderType: 'institution',
          relation: 'indirect',
          lastReported: '2024-01-31',
          positionDirect: null,
          positionDirectDate: null,
          positionIndirect: 1000,
          positionIndirectDate: '2024-01-31',
          position: 1000
        }
      ]);
      expect(result.fundHolders[0]).toMatchObject({
        holderName: 'Vanguard Total Stock Mkt Idx ETF',
        holderType: 'institution',
        relation: 'indirect',
        positionIndirect: 2000,
        position: 2000
      });
      expect(result.insiderHolders[0]).toEqual({
        holderName: 'COOK TIMOTHY D',
        holderType: 'individual',
        relation: 'direct',
        lastReported: '2024-01-31',
        positionDirect: 3000000,
        positionDirectDate: '2024-01-31',
        positionIndirect: 4500000,
        positionIndirectDate: '2024-01-31',
        position: 7500000
      });
      expect(result.directHolders[0]).toMatchObject({
        holderName: 'MURPHY KATHERLEEN',
        holderType: 'individual',
        relation: 'direct',
        positionDirect: 100000,
        positionIndirect: 25000,
        position: 0
      });
    });

    test('degrades missing optional modules with warnings and a lower score instead of throwing', async () => {
      stubQuoteSummary({ majorHoldersBreakdown: fullBreakdown });

      const result = await callHoldersTool({ symbol: 'AAPL' });

      expect(result.institutionalHolders).toEqual([]);
      expect(result.fundHolders).toEqual([]);
      expect(result.insiderHolders).toEqual([]);
      expect(result.directHolders).toEqual([]);
      expect(result.meta.completenessScore).toBe(0.2);
      expect(result.meta.warnings).toEqual([
        'Institutional holder data not available',
        'Fund holder data not available',
        'Insider holder data not available',
        'Direct holder data not available'
      ]);
    });

    test('swallows an optional module transport failure as an absent section', async () => {
      stubQuoteSummary(fullModules());
      quoteSummary.mockImplementation((_symbol: string, options: { modules: string[] }) => {
        if (options.modules[0] === 'institutionOwnership') {
          return Promise.reject(new Error('crumb expired'));
        }
        return Promise.resolve({ [options.modules[0]]: fullModules()[options.modules[0]] });
      });

      const result = await callHoldersTool({ symbol: 'AAPL' });

      expect(result.institutionalHolders).toEqual([]);
      expect(result.meta.warnings).toContain('Institutional holder data not available');
      expect(result.meta.completenessScore).toBe(0.8);
    });

    test('scores one fifth per populated section', async () => {
      stubQuoteSummary({
        majorHoldersBreakdown: fullBreakdown,
        institutionOwnership: fullModules().institutionOwnership
      });

      const result = await callHoldersTool({ symbol: 'AAPL' });

      expect(result.meta.completenessScore).toBe(0.4);
      expect(result.meta.warnings).toEqual([
        'Fund holder data not available',
        'Insider holder data not available',
        'Direct holder data not available'
      ]);
    });

    test('throws a non-retryable incomplete-data error when the breakdown module is absent', async () => {
      stubQuoteSummary({ institutionOwnership: fullModules().institutionOwnership });

      const error = (await callHoldersTool({ symbol: 'FAKE' }).catch((e: unknown) => e)) as YahooFinanceError;

      expect(error).toBeInstanceOf(YahooFinanceError);
      expect(error.code).toBe(YF_ERR_DATA_INCOMPLETE);
      expect(error.message).toBe('Major holders breakdown not available for FAKE');
      expect(error.isRetryable).toBe(false);
      expect(error.suggestedAction).toBe('Check if symbol is valid and has holder data available');
    });

    test('wraps a breakdown transport failure as a retryable unavailable error', async () => {
      quoteSummary.mockRejectedValue(new Error('socket hang up'));

      const error = (await callHoldersTool({ symbol: 'AAPL' }).catch((e: unknown) => e)) as YahooFinanceError;

      expect(error).toBeInstanceOf(YahooFinanceError);
      expect(error.code).toBe(YF_ERR_DATA_UNAVAILABLE);
      expect(error.message).toBe('Failed to fetch major holders breakdown for AAPL: socket hang up');
      expect(error.isRetryable).toBe(true);
      expect(error.suggestedAction).toBe('Retry request or check symbol validity');
    });

    test('defect guard: a breakdown missing institutionsFloatPercentHeld is rejected, not degraded', async () => {
      // The shared fixture payload (tests/fixtures/mock-responses.ts) carries only three of
      // the four breakdown fields, which is what Yahoo returns for thin tickers. The holder
      // sections degrade, but the output schema makes all four numbers mandatory, so the
      // documented partial-data policy does not reach the breakdown.
      stubQuoteSummary({ majorHoldersBreakdown: mockHoldersResponse.majorHoldersBreakdown });

      await expect(callHoldersTool({ symbol: 'AAPL' })).rejects.toThrow();
    });

    test('defect guard: includeChangeHistory fabricates four quarters of holdings', async () => {
      const NOW = Date.parse('2026-10-14T12:00:00.000Z');
      const spy = jest.spyOn(Date, 'now').mockReturnValue(NOW);

      try {
        // Restricted to the two sections that carry a usable position, because a full
        // payload trips the divide-by-zero guard below.
        stubQuoteSummary({
          majorHoldersBreakdown: fullBreakdown,
          institutionOwnership: fullModules().institutionOwnership
        });

        const result = await callHoldersTool({ symbol: 'AAPL', includeChangeHistory: true });
        const history = result.institutionalHolders[0].changeHistory;

        expect(history).toBeDefined();
        // Yahoo reports one position; the tool invents a perfectly regular -5%-of-current
        // ladder behind it and reports it as the holder's history.
        expect(history?.map((row) => row.shares)).toEqual([850, 900, 950, 1000]);
        expect(history?.map((row) => row.change)).toEqual([-50, -50, -50, 1000]);
        expect(history?.[3].changePercent).toBe(0);
        expect(history?.[2].changePercent).toBeCloseTo(-5, 6);
        expect(history?.[1].changePercent).toBeCloseTo(-5.2632, 3);
        expect(history?.[0].changePercent).toBeCloseTo(-5.5556, 3);

        const dates = history?.map((row) => Date.parse(`${row.date}T00:00:00.000Z`)) ?? [];
        expect(dates[1] - dates[0]).toBe(90 * DAY_MS);
        expect(dates[2] - dates[1]).toBe(90 * DAY_MS);
        expect(dates[3] - dates[2]).toBe(90 * DAY_MS);
        expect(history?.map((row) => row.date)).toEqual([
          new Date(NOW - 271 * DAY_MS).toISOString().split('T')[0],
          new Date(NOW - 181 * DAY_MS).toISOString().split('T')[0],
          new Date(NOW - 91 * DAY_MS).toISOString().split('T')[0],
          new Date(NOW - 1 * DAY_MS).toISOString().split('T')[0]
        ]);

        const withoutHistory = await callHoldersTool({ symbol: 'MSFT' });
        expect(withoutHistory.institutionalHolders[0].changeHistory).toBeUndefined();
      } finally {
        spy.mockRestore();
      }
    });

    test('defect guard: includeChangeHistory rejects a holder whose position is zero', async () => {
      // majorDirectHolders rows report positionDirect/positionIndirect only, so the mapped
      // `position` is 0. buildChangeHistory then divides a 0 change by 0 shares, emits NaN,
      // and the output schema refuses the whole call: includeChangeHistory fails for every
      // symbol that has direct holders.
      stubQuoteSummary(fullModules());

      await expect(callHoldersTool({ symbol: 'AAPL', includeChangeHistory: true })).rejects.toThrow(
        /directHolders[\s\S]*changePercent[\s\S]*expected number, received NaN/
      );
    });

    test('defect guard: an insider row without a transaction date is reported as 1970-01-01', async () => {
      stubQuoteSummary({
        majorHoldersBreakdown: fullBreakdown,
        insiderHolders: {
          maxAge: 86400,
          holders: [
            {
              name: 'NO TRANSACTION DATE',
              relation: 'Director',
              positionDirect: 10,
              positionIndirect: 0
            }
          ]
        }
      });

      const result = await callHoldersTool({ symbol: 'AAPL' });

      expect(result.insiderHolders[0].lastReported).toBe('1970-01-01');
      expect(result.insiderHolders[0].position).toBe(10);
    });

    test('serves the second identical request from the module holders cache', async () => {
      stubQuoteSummary(fullModules());

      const first = await callHoldersTool({ symbol: 'AAPL' });
      const second = await callHoldersTool({ symbol: 'AAPL' });

      expect(quoteSummary).toHaveBeenCalledTimes(5);
      expect(first.meta.fromCache).toBe(false);
      expect(second.meta.fromCache).toBe(true);
      expect(second.institutionalHolders).toEqual(first.institutionalHolders);
      // Defect guard: the cached branch sets dataAge to `now - cacheKey.length` rather than
      // the entry age, so a cache hit reports a ~55-year-old body of data and drags
      // lastUpdated back to the Unix epoch.
      expect(second.meta.dataAge).toBeGreaterThan(1e12);
      expect(second.meta.warnings).toContain('Holder data is outdated (older than 45 minutes)');
      expect(second.meta.lastUpdated.startsWith('1970-01-01')).toBe(true);
    });

    test('keys the cache by includeChangeHistory', async () => {
      stubQuoteSummary({
        majorHoldersBreakdown: fullBreakdown,
        institutionOwnership: fullModules().institutionOwnership
      });

      await callHoldersTool({ symbol: 'AAPL', includeChangeHistory: false });
      const withHistory = await callHoldersTool({ symbol: 'AAPL', includeChangeHistory: true });

      expect(quoteSummary).toHaveBeenCalledTimes(10);
      expect(withHistory.meta.fromCache).toBe(false);
      expect(withHistory.institutionalHolders[0].changeHistory).toBeDefined();
    });

    test('clearHoldersCache forces the next request back to the network', async () => {
      stubQuoteSummary(fullModules());

      await callHoldersTool({ symbol: 'AAPL' });
      clearHoldersCache();
      const refetched = await callHoldersTool({ symbol: 'AAPL' });

      expect(quoteSummary).toHaveBeenCalledTimes(10);
      expect(refetched.meta.fromCache).toBe(false);
    });

    test('validates the symbol grammar before any module request', async () => {
      stubQuoteSummary(fullModules());

      await expect(callHoldersTool({ symbol: 'aapl' })).rejects.toThrow(SecurityError);
      await expect(callHoldersTool({ symbol: 'aapl' })).rejects.toThrow('Symbol contains invalid characters');
      await expect(callHoldersTool({ symbol: 'X'.repeat(21) })).rejects.toThrow();
      await expect(callHoldersTool({ symbol: 'AAPL', includeChangeHistory: 'yes' })).rejects.toThrow();

      expect(quoteSummary).not.toHaveBeenCalled();
    });
  });

  // The cases below walk the normalizer branches the fixture-driven happy paths never reach:
  // the wrapped `{ raw }` / `{ fmt }` metric forms Yahoo uses on some modules, the `||`
  // fallback ladders behind every name and date field, an ownership module that answers
  // without its list key, transport failures on the optional modules, cache eviction, and the
  // middle staleness band of the metadata warning ladder.
  describe('holder normalization fallbacks', () => {
    test('reads wrapped raw/fmt metrics and falls back across the name and date fields', async () => {
      stubQuoteSummary({
        majorHoldersBreakdown: fullBreakdown,
        institutionOwnership: {
          ownershipList: [
            {
              holderName: { fmt: 'BlackRock Inc' },
              lastReported: { fmt: '2024-02-15T00:00:00Z' },
              position: { raw: 5000 },
              value: { raw: 'not-a-number' },
              pctHeld: { raw: 0.05 }
            },
            { holderName: {}, organization: 'State Street Corp', position: 4000 },
            {}
          ]
        },
        fundOwnership: {
          ownershipList: [
            {
              holderName: 'Vanguard Total Stock Mkt Idx ETF',
              reportDate: new Date(REPORT_DATE),
              position: 2000,
              value: 40000,
              pctHeld: 0.02
            },
            { organization: 'Fidelity Concord', position: { raw: 1200 }, pctHeld: {} },
            {}
          ]
        },
        insiderHolders: {
          holders: [
            { holderName: 'ALT FILER', title: 'Director', maxAge: 3600 },
            {}
          ]
        },
        majorDirectHolders: {
          holders: [
            { organization: 'SOME TRUST', holderType: 'company', name: 'IGNORED' },
            { name: 'NAMED HOLDER' },
            {}
          ]
        }
      });

      const result = await callHoldersTool({ symbol: 'AAPL' });

      // A `{ fmt }` object is read as a string and a `{ raw }` object as a number; a `{ raw }`
      // that is not a number collapses to 0, and an object without either key collapses to the
      // empty-string / zero fallback. Rows with no name anywhere land on ''.
      expect(result.institutionalHolders.map((row) => row.holderName)).toEqual([
        'BlackRock Inc',
        'State Street Corp',
        ''
      ]);
      expect(result.institutionalHolders[0]).toMatchObject({
        lastReported: '2024-02-15',
        positionIndirect: 5000,
        position: 5000
      });
      expect(result.institutionalHolders[1]).toMatchObject({
        holderType: 'institution',
        lastReported: '',
        position: 4000
      });
      expect(result.institutionalHolders[2]).toMatchObject({
        holderType: 'institution',
        lastReported: '',
        position: 0
      });
      expect(result.fundHolders.map((row) => row.holderName)).toEqual([
        'Vanguard Total Stock Mkt Idx ETF',
        'Fidelity Concord',
        ''
      ]);
      expect(result.fundHolders[0].lastReported).toBe('2024-01-31');
      expect(result.fundHolders[1]).toMatchObject({ lastReported: '', position: 1200 });
      expect(result.fundHolders[2]).toMatchObject({
        holderType: 'institution',
        lastReported: '',
        position: 0
      });
      // An insider row that only carries holderName/title is still reported, with the 1970
      // transaction-date defect and zero positions.
      expect(result.insiderHolders[0]).toMatchObject({
        holderName: 'ALT FILER',
        holderType: 'individual',
        lastReported: '1970-01-01',
        positionDirect: 0,
        positionIndirect: 0,
        position: 0
      });
      expect(result.insiderHolders[1].holderName).toBe('');
      expect(result.directHolders.map((row) => row.holderName)).toEqual([
        'SOME TRUST',
        'NAMED HOLDER',
        ''
      ]);
      expect(result.directHolders[0]).toMatchObject({
        holderType: 'company',
        lastReported: '',
        positionDirect: 0,
        positionDirectDate: '',
        positionIndirect: 0,
        positionIndirectDate: '',
        position: 0
      });
      expect(result.directHolders[1].holderType).toBe('individual');
      expect(result.directHolders[2]).toMatchObject({
        holderType: 'individual',
        lastReported: '',
        position: 0
      });
      // maxAge is absent on both ownership modules, so each section reports the zero fallback.
      expect(result.meta.completenessScore).toBe(1);
      expect(result.meta.warnings).toEqual([]);
    });

    test('treats an ownership module that answers without its list key as absent', async () => {
      stubQuoteSummary({
        majorHoldersBreakdown: fullBreakdown,
        institutionOwnership: { maxAge: 3600 },
        fundOwnership: { maxAge: 3600 },
        insiderHolders: { maxAge: 3600 },
        majorDirectHolders: { maxAge: 3600 }
      });

      const result = await callHoldersTool({ symbol: 'AAPL' });

      expect(result.institutionalHolders).toEqual([]);
      expect(result.fundHolders).toEqual([]);
      expect(result.insiderHolders).toEqual([]);
      expect(result.directHolders).toEqual([]);
      expect(result.meta.completenessScore).toBe(0.2);
      expect(result.meta.warnings).toEqual([
        'Institutional holder data not available',
        'Fund holder data not available',
        'Insider holder data not available',
        'Direct holder data not available'
      ]);
    });

    test('swallows a transport failure on every optional module and keeps the breakdown', async () => {
      quoteSummary.mockImplementation((_symbol: string, options: { modules: string[] }) => {
        if (options.modules[0] === 'majorHoldersBreakdown') {
          return Promise.resolve({ majorHoldersBreakdown: fullBreakdown });
        }
        return Promise.reject(new Error('crumb expired'));
      });

      const result = await callHoldersTool({ symbol: 'AAPL' });

      expect(quoteSummary).toHaveBeenCalledTimes(5);
      expect(result.meta.completenessScore).toBe(0.2);
      expect(result.meta.warnings).toEqual([
        'Institutional holder data not available',
        'Fund holder data not available',
        'Insider holder data not available',
        'Direct holder data not available'
      ]);
    });

    test('names a non-Error breakdown rejection with String(error)', async () => {
      quoteSummary.mockRejectedValue('socket hang up');

      const error = (await callHoldersTool({ symbol: 'AAPL' }).catch((e: unknown) => e)) as YahooFinanceError;

      expect(error).toBeInstanceOf(YahooFinanceError);
      expect(error.code).toBe(YF_ERR_DATA_UNAVAILABLE);
      expect(error.message).toBe('Failed to fetch major holders breakdown for AAPL: socket hang up');
      expect(error.isRetryable).toBe(true);
    });

    test('evicts the cached entry once it is older than the one-hour TTL', async () => {
      stubQuoteSummary(fullModules());

      await callHoldersTool({ symbol: 'AAPL' });

      const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + DAY_MS * 2);
      try {
        const refetched = await callHoldersTool({ symbol: 'AAPL' });
        expect(refetched.meta.fromCache).toBe(false);
      } finally {
        spy.mockRestore();
      }

      expect(quoteSummary).toHaveBeenCalledTimes(10);
    });

    test('warns only in the 30-minute band when a cached read is 33 minutes old', async () => {
      // Holders compute dataAge from the wall clock, so the whole exchange runs on a clock
      // parked at 00:33:20 UTC to land dataAge between 0.5 and 0.75 of HOLDERS_CACHE_TTL.
      const NOW = 2000000;
      const spy = jest.spyOn(Date, 'now').mockReturnValue(NOW);

      try {
        stubQuoteSummary(fullModules());

        const first = await callHoldersTool({ symbol: 'AAPL' });
        const second = await callHoldersTool({ symbol: 'AAPL' });

        expect(first.meta.fromCache).toBe(false);
        expect(first.meta.warnings).toEqual([]);
        expect(second.meta.fromCache).toBe(true);
        expect(second.meta.dataAge).toBe(NOW - 'holders:AAPL:false'.length);
        expect(second.meta.warnings).toEqual(['Holder data may be stale (older than 30 minutes)']);
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('getHoldersToolDefinitions', () => {
    test('declares the single get_major_holders tool and its required args', () => {
      const definitions = getHoldersToolDefinitions();

      expect(definitions).toHaveLength(1);
      expect(definitions[0].name).toBe('get_major_holders');
      expect(definitions[0].inputSchema).toMatchObject({
        type: 'object',
        required: ['symbol'],
        properties: {
          symbol: { type: 'string', minLength: 1, maxLength: 20 },
          includeChangeHistory: { type: 'boolean' }
        }
      });
    });

    test('gives every definition a description and an object input schema', () => {
      for (const definition of getHoldersToolDefinitions()) {
        expect(definition).toHaveProperty('name');
        expect(typeof definition.description).toBe('string');
        expect(definition.description.length).toBeGreaterThan(0);
        expect(definition).toHaveProperty('inputSchema');
      }
    });
  });
});
