import {
  getBalanceSheetTool,
  getIncomeStatementTool,
  getCashFlowStatementTool,
  getFinancialsToolDefinitions,
  clearFinancialsCache
} from '../../../src/tools/financials';
import { yahooFinance } from '../../../src/services/yahoo-finance';
import { FinancialsOutputSchema } from '../../../src/schemas/index';
import { YahooFinanceError, YF_ERR_DATA_INCOMPLETE } from '../../../src/types/errors';
import { SecurityError } from '../../../src/utils/security';

// src/tools/financials.ts exports FUNCTIONS, not a class: three callable handlers behind
// `get_balance_sheet`, `get_income_statement` and `get_cash_flow_statement`, plus
// `getFinancialsToolDefinitions()` (imported by the server entrypoint but never called) and
// `clearFinancialsCache()` (shutdown hook). There is no `FinancialsTools`, no
// `getFinancials(statementType, periodType)` and no `getTools()`; the old suite asserted all
// three of those names.
// The network seam is the process-wide `yahooFinance` singleton: each handler calls
// `yahooFinance.fundamentalsTimeSeries(symbol, { module, type, period1 })` — never a
// YahooFinanceClient. Rows are filtered by `TYPE` ('BALANCE_SHEET' | 'FINANCIALS' |
// 'CASH_FLOW') and every metric is renamed from the v4 field to the tool-facing field.
// Handlers return a PLAIN OBJECT; the server entrypoint adds the MCP `content` wrapper.
// Metric values below are the raw values from tests/fixtures/mock-responses.ts, which are
// still correct even though that file's envelope shape predates the fundamentalsTimeSeries
// switch.

const END_DATE = Date.parse('2023-09-30T00:00:00.000Z');
const PREV_END_DATE = Date.parse('2022-09-24T00:00:00.000Z');

type StatementRow = {
  period: string;
  startDate?: string;
  endDate: string;
  balanceSheet?: Record<string, number | null>;
  incomeStatement?: Record<string, number | null>;
  cashFlowStatement?: Record<string, number | null>;
  fieldAvailability?: Record<string, boolean>;
};

type FinancialsMetaOut = {
  fromCache: boolean;
  dataAge: number;
  completenessScore: number;
  warnings: string[];
  recency: string;
};

type FinancialsPayload = {
  symbol: string;
  statements: StatementRow[];
  meta: FinancialsMetaOut;
};

type Row = Record<string, unknown>;

function bsRow(overrides: Row = {}, date = END_DATE): Row {
  return {
    TYPE: 'BALANCE_SHEET',
    date: new Date(date),
    totalAssets: 352583003136,
    totalLiabilitiesNetMinorityInterest: 290436004864,
    stockholdersEquity: 62147001856,
    cashAndCashEquivalents: 29962000896,
    cashCashEquivalentsAndShortTermInvestments: 31754999296,
    receivables: 29509000448,
    inventory: 6350000000,
    currentAssets: 134836007936,
    currentLiabilities: 153941004288,
    longTermDebt: 122256003072,
    netPPE: 43750998016,
    goodwill: undefined,
    otherIntangibleAssets: undefined,
    retainedEarnings: 60088002560,
    otherAssets: 215147004928,
    otherLiab: 290436004864 - 153941004288 - 122256003072,
    ...overrides
  };
}

function isRow(overrides: Row = {}, date = END_DATE): Row {
  return {
    TYPE: 'FINANCIALS',
    date: new Date(date),
    totalRevenue: 383285996544,
    costOfRevenue: 243139998720,
    grossProfit: 140145997824,
    operatingIncome: 114304995072,
    EBITDA: 139254998400,
    netIncome: 96994997248,
    basicEPS: 6.23,
    dilutedEPS: 6.21,
    interestExpenseNonOperating: 3934000128,
    taxProvision: 14679998464,
    researchAndDevelopment: 29919997952,
    sellingGeneralAndAdministration: 22679998464,
    operatingExpense: 25840001024,
    otherOperatingExpenses: 1383000064,
    totalUnusualItems: 0,
    interestIncomeNonOperating: 1040000000,
    otherIncomeExpense: 300000000,
    ...overrides
  };
}

function cfRow(overrides: Row = {}, date = END_DATE): Row {
  return {
    TYPE: 'CASH_FLOW',
    date: new Date(date),
    operatingCashFlow: 110543997952,
    capitalExpenditure: -10909000000,
    cashFlowFromContinuingFinancingActivities: -110404001792,
    cashFlowFromContinuingInvestingActivities: -30388005888,
    depreciationAndAmortization: 11100000000,
    commonStockDividendPaid: 14460000256,
    repurchaseOfCapitalStock: 88602998784,
    changesInCash: 3747000320,
    freeCashFlow: 99634999296,
    netIssuancePaymentsOfDebt: -9769998336,
    netOtherInvestingChanges: -660000768,
    netOtherFinancingCharges: -1000000000,
    effectOfExchangeRateChanges: 0,
    ...overrides
  };
}

function rows(count: number, factory: (index: number) => Row): Row[] {
  return Array.from({ length: count }, (_, index) => factory(index));
}

let fundamentalsTimeSeries: jest.Mock;

function stubTables(tables: Record<string, Row[]>): void {
  fundamentalsTimeSeries.mockImplementation(
    (_symbol: string, options: { module: string; type: string }) => {
      const key = `${options.module}:${options.type}`;
      return Promise.resolve(tables[key] ?? []);
    }
  );
}

async function callTool(
  tool: (args: Record<string, unknown>) => Promise<Record<string, unknown>>,
  args: Record<string, unknown>
): Promise<FinancialsPayload> {
  return (await tool(args)) as unknown as FinancialsPayload;
}

describe('financials tool module', () => {
  beforeEach(() => {
    clearFinancialsCache();
    fundamentalsTimeSeries = jest.fn();
    (yahooFinance as unknown as { fundamentalsTimeSeries: jest.Mock }).fundamentalsTimeSeries =
      fundamentalsTimeSeries;
  });

  afterEach(() => {
    clearFinancialsCache();
  });

  describe('getBalanceSheetTool', () => {
    test('returns a plain symbol/statements/meta payload, never an MCP content array', async () => {
      stubTables({ 'balance-sheet:annual': [bsRow()] });

      const result = await callTool(getBalanceSheetTool, { symbol: 'AAPL' });

      expect(result).not.toHaveProperty('content');
      expect(result).not.toHaveProperty('isError');
      expect(result.symbol).toBe('AAPL');
      expect(result.statements).toHaveLength(1);
      expect(FinancialsOutputSchema.parse(result)).toEqual(result);
    });

    test('requests the balance-sheet module for the symbol with the documented period window', async () => {
      stubTables({ 'balance-sheet:annual': [bsRow()] });

      await callTool(getBalanceSheetTool, { symbol: 'AAPL' });

      expect(fundamentalsTimeSeries).toHaveBeenCalledTimes(1);
      expect(fundamentalsTimeSeries).toHaveBeenCalledWith('AAPL', {
        module: 'balance-sheet',
        type: 'annual',
        period1: new Date(2000, 0, 1)
      });
    });

    test('renames every v4 metric to the tool-facing balance sheet field', async () => {
      stubTables({ 'balance-sheet:annual': [bsRow()] });

      const result = await callTool(getBalanceSheetTool, { symbol: 'AAPL' });
      const sheet = result.statements[0].balanceSheet as Record<string, number | null>;

      expect(sheet).toMatchObject({
        totalAssets: 352583003136,
        totalLiab: 290436004864,
        totalStockholderEquity: 62147001856,
        cash: 29962000896,
        shortTermInvestments: 31754999296,
        netReceivables: 29509000448,
        inventory: 6350000000,
        totalCurrentAssets: 134836007936,
        totalCurrentLiabilities: 153941004288,
        longTermDebt: 122256003072,
        propertyPlantEquipment: 43750998016,
        retainedEarnings: 60088002560,
        otherAssets: 215147004928
      });
      // The v4 names must not leak into the payload.
      expect(sheet).not.toHaveProperty('stockholdersEquity');
      expect(sheet).not.toHaveProperty('netPPE');
      expect(sheet).not.toHaveProperty('totalLiabilitiesNetMinorityInterest');
      expect(result.statements[0]).toMatchObject({ period: 'annual', endDate: '2023-09-30' });
      expect(result.statements[0].startDate).toBeUndefined();
      expect(result.meta.recency).toBe('2023-09-30');
    });

    test('reports the meta contract for a complete balance sheet', async () => {
      stubTables({
        'balance-sheet:annual': [
          bsRow({ goodwill: 14100000256, otherIntangibleAssets: 1500000000 })
        ]
      });

      const result = await callTool(getBalanceSheetTool, { symbol: 'AAPL' });

      expect(result.meta.fromCache).toBe(false);
      expect(result.meta.dataAge).toBe(0);
      expect(result.meta.warnings).toEqual([]);
      expect(result.meta.completenessScore).toBe(1);
      expect(result.meta.completenessScore).toBeGreaterThanOrEqual(0);
      expect(result.meta.completenessScore).toBeLessThanOrEqual(1);
    });

    test('scores field availability and stays silent once completeness clears 80 percent', async () => {
      stubTables({ 'balance-sheet:annual': [bsRow()] });

      const result = await callTool(getBalanceSheetTool, { symbol: 'AAPL' });
      const availability = result.statements[0].fieldAvailability as Record<string, boolean>;

      expect(result.statements[0].balanceSheet?.goodWill).toBeNull();
      expect(availability).toMatchObject({
        totalAssets: true,
        inventory: true,
        goodWill: false,
        intangibleAssets: false,
        longTermDebt: true
      });
      expect(Object.keys(availability)).toHaveLength(13);
      expect(result.meta.completenessScore).toBeCloseTo(11 / 13, 12);
      // buildStatementMetadata only warns below 0.8, so two absent expected fields at 85%
      // completeness are reported by fieldAvailability alone.
      expect(result.meta.warnings).toEqual([]);
    });

    test('defect guard: a legitimate zero metric is reported as missing data', async () => {
      stubTables({ 'balance-sheet:annual': [bsRow({ inventory: 0, goodWill: 0, intangibleAssets: undefined })] });

      const result = await callTool(getBalanceSheetTool, { symbol: 'AAPL' });

      // wrapMetric treats 0 the same as absent, so a company that reports zero inventory is
      // scored as not having reported inventory.
      expect(result.statements[0].balanceSheet?.inventory).toBeNull();
      expect(result.statements[0].fieldAvailability?.inventory).toBe(false);
      expect(result.statements[0].balanceSheet?.goodWill).toBeNull();
    });

    test('warns on low completeness when most expected fields are absent', async () => {
      stubTables({
        'balance-sheet:annual': [
          {
            TYPE: 'BALANCE_SHEET',
            date: new Date(END_DATE),
            totalAssets: 1,
            totalLiabilitiesNetMinorityInterest: 2
          }
        ]
      });

      const result = await callTool(getBalanceSheetTool, { symbol: 'AAPL' });

      expect(result.statements[0].balanceSheet).toMatchObject({ totalAssets: 1, totalLiab: 2 });
      expect(result.meta.completenessScore).toBeCloseTo(2 / 13, 12);
      expect(result.meta.warnings).toEqual(['Data completeness is low (< 50% fields available)']);
    });

    test('caps the statement list at the default limit of four and honours an explicit limit', async () => {
      stubTables({
        'balance-sheet:annual': rows(6, (index) => bsRow({}, END_DATE - index * 31536000000))
      });

      const defaulted = await callTool(getBalanceSheetTool, { symbol: 'AAPL' });
      expect(defaulted.statements).toHaveLength(4);
      expect(defaulted.statements.map((statement) => statement.endDate)).toEqual([
        '2023-09-30',
        '2022-09-30',
        '2021-09-30',
        '2020-09-30'
      ]);
      expect(defaulted.meta.recency).toBe('2023-09-30');

      clearFinancialsCache();
      const limited = await callTool(getBalanceSheetTool, { symbol: 'AAPL', limit: 2 });
      expect(limited.statements).toHaveLength(2);
      expect(limited.meta.recency).toBe('2023-09-30');
    });

    test('falls back to quarterly periods when the annual request yields no balance sheet rows', async () => {
      stubTables({
        'balance-sheet:annual': [isRow()],
        'balance-sheet:quarterly': [bsRow({}, PREV_END_DATE)]
      });

      const result = await callTool(getBalanceSheetTool, { symbol: 'AAPL' });

      expect(fundamentalsTimeSeries.mock.calls.map((call) => call[1].type)).toEqual([
        'annual',
        'quarterly'
      ]);
      expect(result.statements).toHaveLength(1);
      expect(result.statements[0].period).toBe('quarterly');
      expect(result.statements[0].endDate).toBe('2022-09-24');
    });

    test('throws when neither the annual nor the quarterly fallback has rows', async () => {
      stubTables({ 'balance-sheet:annual': [isRow()], 'balance-sheet:quarterly': [isRow()] });

      const error = (await callTool(getBalanceSheetTool, { symbol: 'FAKE' }).catch(
        (e: unknown) => e
      )) as YahooFinanceError;

      expect(error).toBeInstanceOf(YahooFinanceError);
      expect(error.code).toBe(YF_ERR_DATA_INCOMPLETE);
      expect(error.message).toBe('No balance sheet data available for FAKE');
      expect(error.isRetryable).toBe(false);
      expect(error.suggestedAction).toBe('Verify the symbol exists and has financial data available');
      expect(fundamentalsTimeSeries).toHaveBeenCalledTimes(2);
    });

    test('throws a distinct incomplete-data error when the module returns nothing at all', async () => {
      stubTables({ 'balance-sheet:annual': [] });

      const error = (await callTool(getBalanceSheetTool, { symbol: 'FAKE' }).catch(
        (e: unknown) => e
      )) as YahooFinanceError;

      expect(error).toBeInstanceOf(YahooFinanceError);
      expect(error.code).toBe(YF_ERR_DATA_INCOMPLETE);
      expect(error.message).toBe('Balance sheet data not available for FAKE');
      expect(error.isRetryable).toBe(false);
      expect(error.suggestedAction).toBe('Try quarterly frequency or check if symbol is valid');
      expect(fundamentalsTimeSeries).toHaveBeenCalledTimes(1);
    });

    test('wraps a transport failure as a retryable incomplete-data error', async () => {
      fundamentalsTimeSeries.mockRejectedValue(new Error('Network error'));

      const error = (await callTool(getBalanceSheetTool, { symbol: 'AAPL' }).catch(
        (e: unknown) => e
      )) as YahooFinanceError;

      expect(error).toBeInstanceOf(YahooFinanceError);
      expect(error.code).toBe(YF_ERR_DATA_INCOMPLETE);
      expect(error.message).toBe('Failed to fetch balance sheet for AAPL: Network error');
      expect(error.isRetryable).toBe(true);
      expect(error.suggestedAction).toBe('Retry the request or try quarterly frequency');
    });

    test('defect guard: a quarterly request reports its rows as annual', async () => {
      stubTables({ 'balance-sheet:quarterly': [bsRow({}, PREV_END_DATE)] });

      const result = await callTool(getBalanceSheetTool, { symbol: 'AAPL', frequency: 'quarterly' });

      // The converters hardcode period 'annual'; only the annual-to-quarterly fallback
      // overwrites it, so an explicitly quarterly request is mislabelled.
      expect(result.statements[0].period).toBe('annual');
      expect(result.statements[0].endDate).toBe('2022-09-24');
      expect(fundamentalsTimeSeries).toHaveBeenCalledWith('AAPL', {
        module: 'balance-sheet',
        type: 'quarterly',
        period1: new Date(2000, 0, 1)
      });
    });

    test('defect guard: a row whose date is not a Date collapses endDate and fails the schema', async () => {
      stubTables({
        'balance-sheet:annual': [{ TYPE: 'BALANCE_SHEET', date: '2023-09-30', totalAssets: 1 }]
      });

      await expect(callTool(getBalanceSheetTool, { symbol: 'AAPL' })).rejects.toThrow(/endDate/);
    });

    test('serves the second identical request from the module financials cache', async () => {
      stubTables({ 'balance-sheet:annual': [bsRow()] });

      const first = await callTool(getBalanceSheetTool, { symbol: 'AAPL' });
      const second = await callTool(getBalanceSheetTool, { symbol: 'AAPL' });

      expect(fundamentalsTimeSeries).toHaveBeenCalledTimes(1);
      expect(second.statements).toEqual(first.statements);
      // Defect guard: the cached StatementWithMeta is replayed with the meta it was written
      // with, so a cache hit still claims fromCache false and dataAge 0. The staleness
      // warning below therefore can never fire, and the client cannot tell a 23-hour-old
      // cached statement from a fresh one.
      expect(second.meta.fromCache).toBe(false);
      expect(second.meta.dataAge).toBe(0);
      expect(second.meta.warnings).toEqual([]);
    });

    test('re-fetches once the entry is older than the 24-hour cache TTL', async () => {
      const NOW = Date.now();
      stubTables({ 'balance-sheet:annual': [bsRow()] });

      await callTool(getBalanceSheetTool, { symbol: 'AAPL' });

      // A minute past the 86400000 ms TTL, so the entry is expired no matter how long the
      // await above took rather than by a one-millisecond margin.
      const spy = jest.spyOn(Date, 'now').mockReturnValue(NOW + 86400000 + 60000);
      try {
        await callTool(getBalanceSheetTool, { symbol: 'AAPL' });
      } finally {
        spy.mockRestore();
      }

      expect(fundamentalsTimeSeries).toHaveBeenCalledTimes(2);
    });

    test('keys the cache by statement type and frequency', async () => {
      stubTables({
        'balance-sheet:annual': [bsRow()],
        'balance-sheet:quarterly': [bsRow()],
        'financials:annual': [isRow()]
      });

      await callTool(getBalanceSheetTool, { symbol: 'AAPL' });
      await callTool(getBalanceSheetTool, { symbol: 'AAPL', frequency: 'quarterly' });
      await callTool(getIncomeStatementTool, { symbol: 'AAPL' });

      expect(fundamentalsTimeSeries).toHaveBeenCalledTimes(3);
    });

    test('clearFinancialsCache forces the next request back to the network', async () => {
      stubTables({ 'balance-sheet:annual': [bsRow()] });

      await callTool(getBalanceSheetTool, { symbol: 'AAPL' });
      clearFinancialsCache();
      await callTool(getBalanceSheetTool, { symbol: 'AAPL' });

      expect(fundamentalsTimeSeries).toHaveBeenCalledTimes(2);
    });

    test('rejects a malformed symbol at the grammar gate, as the other two handlers do', async () => {
      stubTables({ 'balance-sheet:annual': [bsRow()] });

      // getBalanceSheetTool was the one statement handler with no InputValidator.validateSymbol
      // call, so a malformed symbol went straight to the library and the wire. It gates first now.
      for (const handler of [getBalanceSheetTool, getIncomeStatementTool, getCashFlowStatementTool]) {
        await expect(callTool(handler, { symbol: 'bad symbol!' })).rejects.toThrow(
          'Symbol contains invalid characters'
        );
      }
      expect(fundamentalsTimeSeries).not.toHaveBeenCalled();
    });

    test('enforces the input schema before any call', async () => {
      stubTables({ 'balance-sheet:annual': [bsRow()] });

      await expect(callTool(getBalanceSheetTool, { symbol: '' })).rejects.toThrow();
      await expect(callTool(getBalanceSheetTool, { symbol: 'X'.repeat(21) })).rejects.toThrow();
      await expect(callTool(getBalanceSheetTool, { symbol: 'AAPL', frequency: 'monthly' })).rejects.toThrow();
      await expect(callTool(getBalanceSheetTool, { symbol: 'AAPL', limit: 0 })).rejects.toThrow();
      await expect(callTool(getBalanceSheetTool, { symbol: 'AAPL', limit: 21 })).rejects.toThrow();
      await expect(callTool(getBalanceSheetTool, { symbol: 'AAPL', limit: 2.5 })).rejects.toThrow();

      expect(fundamentalsTimeSeries).not.toHaveBeenCalled();
    });
  });

  describe('getIncomeStatementTool', () => {
    test('renames the v4 financials metrics and scores twelve expected fields', async () => {
      stubTables({ 'financials:annual': [isRow()] });

      const result = await callTool(getIncomeStatementTool, { symbol: 'AAPL' });
      const statement = result.statements[0].incomeStatement as Record<string, number | null>;

      expect(fundamentalsTimeSeries).toHaveBeenCalledWith('AAPL', {
        module: 'financials',
        type: 'annual',
        period1: new Date(2000, 0, 1)
      });
      expect(statement).toMatchObject({
        totalRevenue: 383285996544,
        costOfRevenue: 243139998720,
        grossProfit: 140145997824,
        operatingIncome: 114304995072,
        ebitda: 139254998400,
        netIncome: 96994997248,
        epsBasic: 6.23,
        epsDiluted: 6.21,
        interestExpense: 3934000128,
        taxProvision: 14679998464,
        researchAndDevelopment: 29919997952,
        sellingGeneralAndAdministrative: 22679998464,
        // totalUnusualItems is 0 on the row, and wrapMetric treats 0 as absent.
        nonRecurringEvents: null
      });
      expect(statement).not.toHaveProperty('EBITDA');
      expect(statement).not.toHaveProperty('basicEPS');
      expect(result.statements[0].balanceSheet).toBeUndefined();
      expect(result.meta.recency).toBe('2023-09-30');
    });

    test('defect guard: a zeroed EBITDA row is reported as missing rather than as zero', async () => {
      stubTables({ 'financials:annual': [isRow({ totalUnusualItems: 0, EBITDA: 0 })] });

      const result = await callTool(getIncomeStatementTool, { symbol: 'AAPL' });

      expect(result.statements[0].incomeStatement?.nonRecurringEvents).toBeNull();
      expect(result.statements[0].incomeStatement?.ebitda).toBeNull();
      expect(result.statements[0].fieldAvailability?.ebitda).toBe(false);
      expect(result.meta.completenessScore).toBeCloseTo(11 / 12, 12);
      expect(result.meta.warnings).toEqual([]);
    });

    test('falls back to quarterly income statements when the annual request has no FINANCIALS rows', async () => {
      stubTables({
        'financials:annual': [bsRow()],
        'financials:quarterly': [isRow({}, PREV_END_DATE)]
      });

      const result = await callTool(getIncomeStatementTool, { symbol: 'AAPL' });

      expect(fundamentalsTimeSeries.mock.calls.map((call) => call[1].type)).toEqual([
        'annual',
        'quarterly'
      ]);
      expect(result.statements[0].period).toBe('quarterly');
      expect(result.statements[0].endDate).toBe('2022-09-24');
      expect(result.statements[0].incomeStatement).toBeDefined();
    });

    test('throws a distinct message when no income statement rows exist in either frequency', async () => {
      stubTables({});

      const error = (await callTool(getIncomeStatementTool, { symbol: 'FAKE' }).catch(
        (e: unknown) => e
      )) as YahooFinanceError;

      expect(error.code).toBe(YF_ERR_DATA_INCOMPLETE);
      expect(error.message).toBe('Income statement data not available for FAKE');
    });

    test('rejects an unsupported symbol before calling the library', async () => {
      stubTables({ 'financials:annual': [isRow()] });

      await expect(callTool(getIncomeStatementTool, { symbol: 'aapl' })).rejects.toThrow(
        SecurityError
      );
      expect(fundamentalsTimeSeries).not.toHaveBeenCalled();
    });
  });

  describe('getCashFlowStatementTool', () => {
    test('renames the v4 cash-flow metrics and scores nine expected fields', async () => {
      stubTables({ 'cash-flow:annual': [cfRow()] });

      const result = await callTool(getCashFlowStatementTool, { symbol: 'AAPL' });
      const statement = result.statements[0].cashFlowStatement as Record<string, number | null>;

      expect(fundamentalsTimeSeries).toHaveBeenCalledWith('AAPL', {
        module: 'cash-flow',
        type: 'annual',
        period1: new Date(2000, 0, 1)
      });
      expect(statement).toMatchObject({
        totalCashFromOperatingActivities: 110543997952,
        capitalExpenditures: -10909000000,
        totalCashFromFinancingActivities: -110404001792,
        totalCashFromInvestingActivities: -30388005888,
        depreciation: 11100000000,
        dividendsPaid: 14460000256,
        stockRepurchases: 88602998784,
        changeInCash: 3747000320,
        freeCashFlow: 99634999296,
        netBorrowings: -9769998336
      });
      expect(statement).not.toHaveProperty('operatingCashFlow');
      expect(statement).not.toHaveProperty('repurchaseOfCapitalStock');
      expect(Object.keys(result.statements[0].fieldAvailability as object)).toHaveLength(9);
      expect(Object.values(result.statements[0].fieldAvailability as object)).toEqual(
        new Array(9).fill(true)
      );
      expect(result.meta.completenessScore).toBe(1);
      expect(result.meta.warnings).toEqual([]);
      expect(result.meta.recency).toBe('2023-09-30');
      // effectOfExchangeRateChanges is 0 on the row and is not one of the nine expected
      // fields, but the zero-to-null collapse still hides it from the payload.
      expect(statement.effectOfExchangeRateOnCash).toBeNull();
    });

    test('scores a cash flow statement that reports only seven of the nine expected fields', async () => {
      stubTables({
        'cash-flow:annual': [cfRow({ freeCashFlow: undefined, changesInCash: undefined })]
      });

      const result = await callTool(getCashFlowStatementTool, { symbol: 'MSFT' });

      expect(result.statements[0].cashFlowStatement?.freeCashFlow).toBeNull();
      expect(result.statements[0].fieldAvailability?.freeCashFlow).toBe(false);
      expect(result.meta.completenessScore).toBeCloseTo(7 / 9, 12);
      expect(result.meta.warnings).toEqual(['Some financial data fields are missing']);
    });

    test('reports a negative capital expenditure rather than discarding it', async () => {
      stubTables({ 'cash-flow:annual': [cfRow()] });

      const result = await callTool(getCashFlowStatementTool, { symbol: 'AAPL' });

      expect(result.statements[0].cashFlowStatement?.capitalExpenditures).toBe(-10909000000);
      expect(result.statements[0].fieldAvailability?.capitalExpenditures).toBe(true);
    });

    test('throws when the cash-flow module has no rows in either frequency', async () => {
      stubTables({ 'cash-flow:annual': [isRow()], 'cash-flow:quarterly': [isRow()] });

      const error = (await callTool(getCashFlowStatementTool, { symbol: 'FAKE' }).catch(
        (e: unknown) => e
      )) as YahooFinanceError;

      expect(error.code).toBe(YF_ERR_DATA_INCOMPLETE);
      expect(error.message).toBe('No cash flow statement data available for FAKE');
      expect(error.isRetryable).toBe(false);
    });
  });

  // The branches below are the ones the annual-happy-path fixtures never reach: a period end
  // that is not a Date for the income and cash-flow converters, a non-Error library
  // rejection, an empty table for the cash-flow module, the cash-flow annual-to-quarterly
  // fallback, and the cached read for the other two statement handlers.
  describe('statement normalization and cache branches', () => {
    test('collapses a non-Date period end onto the empty date for income and cash flow', async () => {
      stubTables({
        'financials:annual': [{ TYPE: 'FINANCIALS', date: '2023-09-30', totalRevenue: 10 }],
        'cash-flow:annual': [{ TYPE: 'CASH_FLOW', date: '2023-09-30', operatingCashFlow: 10 }]
      });

      // Both converters keep the same guard as the balance sheet: fmt is only filled when
      // `date` is a Date, and an empty period end is then refused by the output schema.
      await expect(callTool(getIncomeStatementTool, { symbol: 'AAPL' })).rejects.toThrow(/endDate/);
      await expect(callTool(getCashFlowStatementTool, { symbol: 'MSFT' })).rejects.toThrow(/endDate/);

      expect(fundamentalsTimeSeries).toHaveBeenCalledTimes(2);
    });

    test('names a non-Error library rejection with String(error)', async () => {
      fundamentalsTimeSeries.mockRejectedValue('table unavailable');

      const cases: Array<[typeof getBalanceSheetTool, string]> = [
        [getBalanceSheetTool, 'Failed to fetch balance sheet for AAPL: table unavailable'],
        [getIncomeStatementTool, 'Failed to fetch income statement for AAPL: table unavailable'],
        [getCashFlowStatementTool, 'Failed to fetch cash flow statement for AAPL: table unavailable']
      ];

      for (const [tool, message] of cases) {
        clearFinancialsCache();

        const error = (await tool({ symbol: 'AAPL' }).catch((e: unknown) => e)) as YahooFinanceError;

        expect(error).toBeInstanceOf(YahooFinanceError);
        expect(error.code).toBe(YF_ERR_DATA_INCOMPLETE);
        expect(error.message).toBe(message);
        expect(error.isRetryable).toBe(true);
      }

      expect(fundamentalsTimeSeries).toHaveBeenCalledTimes(3);
    });

    test('throws the incomplete-data error when the cash-flow module returns no rows at all', async () => {
      stubTables({});

      const error = (await callTool(getCashFlowStatementTool, { symbol: 'FAKE' }).catch(
        (e: unknown) => e
      )) as YahooFinanceError;

      expect(error).toBeInstanceOf(YahooFinanceError);
      expect(error.code).toBe(YF_ERR_DATA_INCOMPLETE);
      expect(error.message).toBe('Cash flow statement data not available for FAKE');
      expect(error.isRetryable).toBe(false);
      expect(error.suggestedAction).toBe('Try quarterly frequency or check if symbol is valid');
      // An empty table is refused before the quarterly fallback is attempted, and the
      // YahooFinanceError raised inside the try is re-thrown rather than re-wrapped.
      expect(fundamentalsTimeSeries).toHaveBeenCalledTimes(1);
    });

    test('falls back to quarterly cash-flow rows when the annual table has no CASH_FLOW rows', async () => {
      stubTables({
        'cash-flow:annual': [isRow()],
        'cash-flow:quarterly': [cfRow({}, PREV_END_DATE)]
      });

      const result = await callTool(getCashFlowStatementTool, { symbol: 'AAPL' });

      expect(fundamentalsTimeSeries.mock.calls.map((call) => call[1].type)).toEqual([
        'annual',
        'quarterly'
      ]);
      expect(result.statements).toHaveLength(1);
      expect(result.statements[0].period).toBe('quarterly');
      expect(result.statements[0].endDate).toBe('2022-09-24');
      expect(result.statements[0].cashFlowStatement).toMatchObject({
        totalCashFromOperatingActivities: 110543997952,
        freeCashFlow: 99634999296
      });
      expect(result.meta.recency).toBe('2022-09-24');
    });

    test('serves the second identical income statement and cash flow request from the module cache', async () => {
      stubTables({ 'financials:annual': [isRow()], 'cash-flow:annual': [cfRow()] });

      const firstIncome = await callTool(getIncomeStatementTool, { symbol: 'AAPL' });
      const secondIncome = await callTool(getIncomeStatementTool, { symbol: 'AAPL' });
      const firstCash = await callTool(getCashFlowStatementTool, { symbol: 'AAPL' });
      const secondCash = await callTool(getCashFlowStatementTool, { symbol: 'AAPL' });

      expect(fundamentalsTimeSeries).toHaveBeenCalledTimes(2);
      expect(secondIncome.statements).toEqual(firstIncome.statements);
      expect(secondCash.statements).toEqual(firstCash.statements);
      // Same defect as the balance-sheet handler: the cached StatementWithMeta is replayed
      // with the meta it was written with, so neither cache hit admits it came from cache.
      expect(secondIncome.meta.fromCache).toBe(false);
      expect(secondCash.meta.fromCache).toBe(false);
      expect(secondIncome.meta.dataAge).toBe(0);
      expect(secondCash.meta.dataAge).toBe(0);
    });

    test('throws without a further fallback when the caller already asked for quarterly', async () => {
      // Each table is non-empty but carries the wrong TYPE, so the requested bucket is empty.
      // The annual-to-quarterly retry is only attempted for an annual request.
      stubTables({
        'balance-sheet:quarterly': [isRow({}, PREV_END_DATE)],
        'financials:quarterly': [bsRow({}, PREV_END_DATE)],
        'cash-flow:quarterly': [isRow({}, PREV_END_DATE)]
      });

      const cases: Array<[typeof getBalanceSheetTool, string]> = [
        [getBalanceSheetTool, 'No balance sheet data available for FAKE'],
        [getIncomeStatementTool, 'No income statement data available for FAKE'],
        [getCashFlowStatementTool, 'No cash flow statement data available for FAKE']
      ];

      for (const [tool, message] of cases) {
        clearFinancialsCache();

        const error = (await tool({ symbol: 'FAKE', frequency: 'quarterly' }).catch(
          (e: unknown) => e
        )) as YahooFinanceError;

        expect(error).toBeInstanceOf(YahooFinanceError);
        expect(error.code).toBe(YF_ERR_DATA_INCOMPLETE);
        expect(error.message).toBe(message);
        expect(error.isRetryable).toBe(false);
        expect(error.suggestedAction).toBe('Verify the symbol exists and has financial data available');
      }

      expect(fundamentalsTimeSeries).toHaveBeenCalledTimes(3);
      expect(fundamentalsTimeSeries.mock.calls.map((call) => call[1].type)).toEqual([
        'quarterly',
        'quarterly',
        'quarterly'
      ]);
    });

    test('throws when the annual rows are the wrong type and the quarterly fallback is too', async () => {
      stubTables({
        'financials:annual': [bsRow()],
        'financials:quarterly': [cfRow({}, PREV_END_DATE)]
      });

      const error = (await callTool(getIncomeStatementTool, { symbol: 'FAKE' }).catch(
        (e: unknown) => e
      )) as YahooFinanceError;

      expect(error.message).toBe('No income statement data available for FAKE');
      expect(fundamentalsTimeSeries.mock.calls.map((call) => call[1].type)).toEqual([
        'annual',
        'quarterly'
      ]);
    });

    test('caps the income and cash flow statements at an explicit limit', async () => {
      stubTables({
        'financials:annual': rows(5, (index) => isRow({}, END_DATE - index * 31536000000)),
        'cash-flow:annual': rows(5, (index) => cfRow({}, END_DATE - index * 31536000000))
      });

      const income = await callTool(getIncomeStatementTool, { symbol: 'AAPL', limit: 3 });
      const cash = await callTool(getCashFlowStatementTool, { symbol: 'MSFT', limit: 1 });

      expect(income.statements).toHaveLength(3);
      expect(income.statements.map((statement) => statement.endDate)).toEqual([
        '2023-09-30',
        '2022-09-30',
        '2021-09-30'
      ]);
      expect(cash.statements).toHaveLength(1);
      expect(cash.meta.completenessScore).toBe(1);
    });

    test('throws the distinct no-rows message for the income module when both frequencies are empty', async () => {
      stubTables({});

      const error = (await callTool(getIncomeStatementTool, { symbol: 'FAKE' }).catch(
        (e: unknown) => e
      )) as YahooFinanceError;

      expect(error.message).toBe('Income statement data not available for FAKE');
      expect(error.isRetryable).toBe(false);
      expect(fundamentalsTimeSeries).toHaveBeenCalledTimes(1);
    });
  });

  describe('getFinancialsToolDefinitions', () => {
    test('declares the three callable statement tools and their required args', () => {
      const definitions = getFinancialsToolDefinitions();

      expect(definitions).toHaveLength(3);
      expect(definitions.map((definition) => definition.name)).toEqual([
        'get_balance_sheet',
        'get_income_statement',
        'get_cash_flow_statement'
      ]);
      for (const definition of definitions) {
        expect(definition.inputSchema).toMatchObject({
          type: 'object',
          required: ['symbol'],
          properties: {
            symbol: { type: 'string', minLength: 1, maxLength: 20 },
            frequency: { type: 'string', enum: ['annual', 'quarterly'] },
            limit: { type: 'number', minimum: 1, maximum: 20 }
          }
        });
        expect(definition.description.length).toBeGreaterThan(0);
      }
    });

    test('names the cash-flow tool after the callable tool, not get_financials', () => {
      const names = getFinancialsToolDefinitions().map((definition) => definition.name);

      expect(names).not.toContain('get_financials');
      expect(names).not.toContain('get_financials_statements');
    });
  });
});
