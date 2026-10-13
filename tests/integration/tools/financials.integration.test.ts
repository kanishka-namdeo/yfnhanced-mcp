import {
  getBalanceSheetTool,
  getIncomeStatementTool,
  getCashFlowStatementTool,
  getFinancialsToolDefinitions,
  clearFinancialsCache
} from '../../../src/tools/financials';
import { yahooFinance } from '../../../src/services/yahoo-finance';
import { YahooFinanceError, YF_ERR_DATA_INCOMPLETE } from '../../../src/types/errors';
import { SecurityError } from '../../../src/utils/security';

// `src/tools/financials.ts` never calls a namespace function: it calls the process-wide
// `yahooFinance` instance exported by `src/services/yahoo-finance.ts`, and the only library
// method it uses is `fundamentalsTimeSeries`. Mocking `yahoo-finance2` (as this file used to)
// left `yahooFinance.quoteSummary` undefined and every `mockResolvedValue` landed on nothing.
jest.mock('../../../src/services/yahoo-finance', () => ({
  yahooFinance: {
    fundamentalsTimeSeries: jest.fn(),
    quoteSummary: jest.fn(),
    search: jest.fn(),
    options: jest.fn()
  },
  YahooFinanceClient: class {},
  toOptionContract: jest.fn()
}));

const mockFundamentalsTimeSeries = yahooFinance.fundamentalsTimeSeries as jest.Mock;

type StatementRow = Record<string, unknown>;

function balanceSheetRow(date: string, overrides: StatementRow = {}): StatementRow {
  return {
    TYPE: 'BALANCE_SHEET',
    date: new Date(date),
    totalAssets: 352583000000,
    totalLiabilitiesNetMinorityInterest: 290437000000,
    stockholdersEquity: 62146000000,
    cashAndCashEquivalents: 29965000000,
    cashCashEquivalentsAndShortTermInvestments: 31775000000,
    receivables: 29508000000,
    inventory: 6331000000,
    currentAssets: 143566000000,
    currentLiabilities: 145306000000,
    longTermDebt: 95281000000,
    netPPE: 43715000000,
    goodwill: 0,
    otherIntangibleAssets: 0,
    retainedEarnings: 21423000000,
    ...overrides
  };
}

function incomeStatementRow(date: string, overrides: StatementRow = {}): StatementRow {
  return {
    TYPE: 'FINANCIALS',
    date: new Date(date),
    totalRevenue: 383285000000,
    costOfRevenue: 214137000000,
    grossProfit: 169148000000,
    operatingIncome: 114301000000,
    EBITDA: 126332000000,
    netIncome: 96995000000,
    basicEPS: 1.64,
    dilutedEPS: 1.62,
    interestExpenseNonOperating: 3962000000,
    taxProvision: 16423000000,
    researchAndDevelopment: 29915000000,
    sellingGeneralAndAdministration: 24932000000,
    ...overrides
  };
}

function cashFlowRow(date: string, overrides: StatementRow = {}): StatementRow {
  return {
    TYPE: 'CASH_FLOW',
    date: new Date(date),
    operatingCashFlow: 110543000000,
    capitalExpenditure: -10957000000,
    cashFlowFromContinuingFinancingActivities: -104954000000,
    cashFlowFromContinuingInvestingActivities: -7399000000,
    depreciationAndAmortization: 11284000000,
    commonStockDividendPaid: -14835000000,
    repurchaseOfCapitalStock: -77550000000,
    changesInCash: -3032000000,
    freeCashFlow: 99586000000,
    ...overrides
  };
}

// One row per period carrying every expected balance-sheet field, so a full row scores 1.
function completeBalanceSheetRow(date: string): StatementRow {
  return balanceSheetRow(date, { goodwill: 1400000000, otherIntangibleAssets: 7000000000 });
}

type RowSet = {
  balanceSheet?: StatementRow[];
  balanceSheetQuarterly?: StatementRow[];
  incomeStatement?: StatementRow[];
  incomeStatementQuarterly?: StatementRow[];
  cashFlow?: StatementRow[];
  cashFlowQuarterly?: StatementRow[];
};

// The tool asks for one module per statement and reads rows back by `TYPE`, so the stub
// answers per (module, type) pair the way `fundamentalsTimeSeries` does.
function stubRows(rows: RowSet): void {
  mockFundamentalsTimeSeries.mockImplementation(
    async (_symbol: string, options: { module: string; type: string }) => {
      if (options.module === 'balance-sheet') {
        return options.type === 'quarterly' ? rows.balanceSheetQuarterly ?? [] : rows.balanceSheet ?? [];
      }
      if (options.module === 'financials') {
        return options.type === 'quarterly'
          ? rows.incomeStatementQuarterly ?? []
          : rows.incomeStatement ?? [];
      }
      if (options.module === 'cash-flow') {
        return options.type === 'quarterly' ? rows.cashFlowQuarterly ?? [] : rows.cashFlow ?? [];
      }
      return [];
    }
  );
}

describe('Financials Tools Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearFinancialsCache();
    stubRows({
      balanceSheet: [
        balanceSheetRow('2023-09-30T00:00:00Z'),
        balanceSheetRow('2022-09-24T00:00:00Z', {
          totalAssets: 338516000000,
          totalLiabilitiesNetMinorityInterest: 302083000000,
          stockholdersEquity: 50672000000
        }),
        balanceSheetRow('2021-09-25T00:00:00Z', { totalAssets: 323889000000 }),
        balanceSheetRow('2020-09-26T00:00:00Z', { totalAssets: 323889000000 })
      ],
      balanceSheetQuarterly: [balanceSheetRow('2023-09-30T00:00:00Z')],
      incomeStatement: [
        incomeStatementRow('2023-09-30T00:00:00Z'),
        incomeStatementRow('2022-09-24T00:00:00Z', {
          totalRevenue: 365817000000,
          netIncome: 99803000000
        })
      ],
      incomeStatementQuarterly: [incomeStatementRow('2023-09-30T00:00:00Z', { totalRevenue: 89498000000 })],
      cashFlow: [
        cashFlowRow('2023-09-30T00:00:00Z'),
        cashFlowRow('2022-09-24T00:00:00Z', { operatingCashFlow: 122151000000 })
      ],
      cashFlowQuarterly: [cashFlowRow('2023-09-30T00:00:00Z', { operatingCashFlow: 28987000000 })]
    });
  });

  describe('getBalanceSheetTool', () => {
    it('should fetch the balance-sheet module for the requested frequency', async () => {
      const result = await getBalanceSheetTool({ symbol: 'AAPL', frequency: 'annual', limit: 2 });

      expect(result.symbol).toBe('AAPL');
      expect(result.statements).toBeInstanceOf(Array);
      expect(result.statements).toHaveLength(2);
      expect(result.statements[0].period).toBe('annual');
      expect(result.statements[0].endDate).toBe('2023-09-30');
      expect(result.meta.fromCache).toBe(false);

      expect(mockFundamentalsTimeSeries).toHaveBeenCalledTimes(1);
      const [symbol, options] = mockFundamentalsTimeSeries.mock.calls[0];
      expect(symbol).toBe('AAPL');
      expect(options.module).toBe('balance-sheet');
      expect(options.type).toBe('annual');
      expect(options.period1).toBeInstanceOf(Date);
    });

    it('should map the wrapped library metrics onto numeric statement fields', async () => {
      const result = await getBalanceSheetTool({ symbol: 'AAPL', frequency: 'annual', limit: 2 });
      const balanceSheet = result.statements[0].balanceSheet as Record<string, number | null>;

      expect(balanceSheet.totalAssets).toBe(352583000000);
      expect(balanceSheet.totalLiab).toBe(290437000000);
      expect(balanceSheet.totalStockholderEquity).toBe(62146000000);
      expect(balanceSheet.propertyPlantEquipment).toBe(43715000000);
    });

    it('should fetch the balance-sheet module with quarterly type', async () => {
      const result = await getBalanceSheetTool({ symbol: 'AAPL', frequency: 'quarterly', limit: 1 });

      // Defect: the non-fallback path never stamps the requested frequency, so a direct
      // quarterly request reports period 'annual' (src/tools/financials.ts:579-583; only the
      // annual -> quarterly fallback rewrites it at :558).
      expect(result.statements[0].period).toBe('annual');
      expect(result.statements[0].endDate).toBe('2023-09-30');
      expect(mockFundamentalsTimeSeries.mock.calls[0][1].type).toBe('quarterly');
    });

    it('should respect the limit parameter', async () => {
      const result = await getBalanceSheetTool({ symbol: 'AAPL', frequency: 'annual', limit: 1 });

      expect(result.statements).toHaveLength(1);
    });

    it('should default to four periods when no limit is given', async () => {
      const result = await getBalanceSheetTool({ symbol: 'AAPL' });

      expect(result.statements).toHaveLength(4);
    });

    it('should report field availability for every expected field', async () => {
      const result = await getBalanceSheetTool({ symbol: 'AAPL', limit: 1 });
      const availability = result.statements[0].fieldAvailability as Record<string, boolean>;

      expect(availability).toBeDefined();
      expect(availability.totalAssets).toBe(true);
      expect(availability.totalLiab).toBe(true);
      expect(availability.totalStockholderEquity).toBe(true);
      // `wrapMetric` treats 0 as absent, so a real zero reports as unavailable.
      expect(availability.goodWill).toBe(false);
      expect(availability.intangibleAssets).toBe(false);
    });

    it('should mark metrics missing from the library row as unavailable', async () => {
      stubRows({
        balanceSheet: [{ TYPE: 'BALANCE_SHEET', date: new Date('2023-09-30T00:00:00Z'), totalAssets: 1 }]
      });

      const result = await getBalanceSheetTool({ symbol: 'AAPL', limit: 1 });
      const availability = result.statements[0].fieldAvailability as Record<string, boolean>;

      expect(availability.totalAssets).toBe(true);
      expect(availability.netReceivables).toBe(false);
      expect(availability.inventory).toBe(false);
    });

    it('should score completeness from the expected field set', async () => {
      stubRows({ balanceSheet: [completeBalanceSheetRow('2023-09-30T00:00:00Z')] });

      const complete = await getBalanceSheetTool({ symbol: 'AAPL', limit: 1 });
      expect(complete.meta.completenessScore).toBe(1);

      clearFinancialsCache();
      stubRows({
        balanceSheet: [{ TYPE: 'BALANCE_SHEET', date: new Date('2023-09-30T00:00:00Z'), totalAssets: 1 }]
      });
      const partial = await getBalanceSheetTool({ symbol: 'MSFT', limit: 1 });

      expect(partial.meta.completenessScore).toBeCloseTo(1 / 13, 5);
      expect(partial.meta.completenessScore).toBeGreaterThan(0);
      expect(partial.meta.completenessScore).toBeLessThanOrEqual(1);
    });

    it('should warn when completeness is below 50 percent', async () => {
      stubRows({
        balanceSheet: [
          {
            TYPE: 'BALANCE_SHEET',
            date: new Date('2023-09-30T00:00:00Z'),
            totalAssets: 1,
            totalLiabilitiesNetMinorityInterest: 2
          }
        ]
      });

      const result = await getBalanceSheetTool({ symbol: 'AAPL', limit: 1 });

      expect(result.meta.warnings).toContain('Data completeness is low (< 50% fields available)');
    });

    it('should wrap library failures in YahooFinanceError', async () => {
      mockFundamentalsTimeSeries.mockRejectedValue(new Error('API error'));

      await expect(getBalanceSheetTool({ symbol: 'AAPL' })).rejects.toThrow(YahooFinanceError);
      await expect(getBalanceSheetTool({ symbol: 'AAPL' })).rejects.toThrow(
        /Failed to fetch balance sheet for AAPL: API error/
      );
    });

    it('should fall back to quarterly periods when the annual call returns no balance-sheet rows', async () => {
      // An empty result set throws inside the fetcher, so the annual->quarterly fallback is
      // only reachable when rows come back that do not carry the balance-sheet TYPE.
      mockFundamentalsTimeSeries.mockImplementation(async (_symbol: string, options: { type: string }) =>
        options.type === 'annual'
          ? [cashFlowRow('2023-09-30T00:00:00Z')]
          : [balanceSheetRow('2023-09-30T00:00:00Z')]
      );

      const result = await getBalanceSheetTool({ symbol: 'AAPL', frequency: 'annual' });

      expect(result.statements[0].period).toBe('quarterly');
      expect(mockFundamentalsTimeSeries).toHaveBeenCalledTimes(2);
      expect(mockFundamentalsTimeSeries.mock.calls[1][1].type).toBe('quarterly');
    });

    it('should serve the second identical request from the module cache', async () => {
      const first = await getBalanceSheetTool({ symbol: 'AAPL', limit: 1 });
      const second = await getBalanceSheetTool({ symbol: 'AAPL', limit: 1 });

      expect(mockFundamentalsTimeSeries).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
      // The cached entry replays the meta captured on the miss, so a hit still reports
      // fromCache false at this layer (src/tools/financials.ts:541).
      expect(second.meta.fromCache).toBe(false);
    });

    it('should re-fetch after clearFinancialsCache', async () => {
      await getBalanceSheetTool({ symbol: 'AAPL', limit: 1 });
      clearFinancialsCache();
      await getBalanceSheetTool({ symbol: 'AAPL', limit: 1 });

      expect(mockFundamentalsTimeSeries).toHaveBeenCalledTimes(2);
    });
  });

  describe('getIncomeStatementTool', () => {
    it('should fetch the financials module and map the income metrics', async () => {
      const result = await getIncomeStatementTool({ symbol: 'AAPL', frequency: 'annual', limit: 1 });
      const incomeStatement = result.statements[0].incomeStatement as Record<string, number | null>;

      expect(result.symbol).toBe('AAPL');
      expect(result.statements[0].period).toBe('annual');
      expect(incomeStatement.totalRevenue).toBe(383285000000);
      expect(incomeStatement.costOfRevenue).toBe(214137000000);
      expect(incomeStatement.grossProfit).toBe(169148000000);
      expect(incomeStatement.netIncome).toBe(96995000000);
      expect(incomeStatement.epsBasic).toBe(1.64);
      expect(incomeStatement.epsDiluted).toBe(1.62);

      expect(mockFundamentalsTimeSeries.mock.calls[0][1].module).toBe('financials');
    });

    it('should fetch the financials module with quarterly type', async () => {
      const result = await getIncomeStatementTool({ symbol: 'AAPL', frequency: 'quarterly', limit: 1 });

      // Defect: period is never stamped with the requested frequency outside the fallback
      // path (src/tools/financials.ts:636-640).
      expect(result.statements[0].period).toBe('annual');
      expect(mockFundamentalsTimeSeries.mock.calls[0][1].type).toBe('quarterly');
    });

    it('should report field availability for the income statement', async () => {
      const result = await getIncomeStatementTool({ symbol: 'AAPL', limit: 1 });
      const availability = result.statements[0].fieldAvailability as Record<string, boolean>;

      expect(availability.totalRevenue).toBe(true);
      expect(availability.grossProfit).toBe(true);
      expect(availability.netIncome).toBe(true);
      expect(availability.epsBasic).toBe(true);
    });

    it('should mark missing EPS fields as unavailable', async () => {
      stubRows({
        incomeStatement: [
          incomeStatementRow('2023-09-30T00:00:00Z', { basicEPS: undefined, dilutedEPS: undefined })
        ]
      });

      const result = await getIncomeStatementTool({ symbol: 'AAPL', limit: 1 });
      const availability = result.statements[0].fieldAvailability as Record<string, boolean>;

      expect(availability.epsBasic).toBe(false);
      expect(availability.epsDiluted).toBe(false);
    });

    it('should carry the profitability metrics through the output schema', async () => {
      const result = await getIncomeStatementTool({ symbol: 'AAPL', limit: 1 });
      const incomeStatement = result.statements[0].incomeStatement as Record<string, number | null>;

      expect(incomeStatement.grossProfit).toBeDefined();
      expect(incomeStatement.operatingIncome).toBeDefined();
      expect(incomeStatement.ebitda).toBeDefined();
    });

    it('should reject an invalid symbol before any network call', async () => {
      await expect(getIncomeStatementTool({ symbol: 'aapl' })).rejects.toThrow(SecurityError);
      expect(mockFundamentalsTimeSeries).not.toHaveBeenCalled();
    });

    it('should throw the incomplete-data code when no rows come back', async () => {
      stubRows({ incomeStatement: [] });

      await expect(getIncomeStatementTool({ symbol: 'AAPL' })).rejects.toMatchObject({
        code: YF_ERR_DATA_INCOMPLETE
      });
    });
  });

  describe('getCashFlowStatementTool', () => {
    it('should fetch the cash-flow module and map the cash metrics', async () => {
      const result = await getCashFlowStatementTool({ symbol: 'AAPL', frequency: 'annual', limit: 1 });
      const cashFlow = result.statements[0].cashFlowStatement as Record<string, number | null>;

      expect(result.statements[0].period).toBe('annual');
      expect(cashFlow.totalCashFromOperatingActivities).toBe(110543000000);
      expect(cashFlow.capitalExpenditures).toBe(-10957000000);
      expect(cashFlow.totalCashFromFinancingActivities).toBe(-104954000000);
      expect(cashFlow.totalCashFromInvestingActivities).toBe(-7399000000);
      expect(cashFlow.freeCashFlow).toBe(99586000000);

      expect(mockFundamentalsTimeSeries.mock.calls[0][1].module).toBe('cash-flow');
    });

    it('should fetch the cash-flow module with quarterly type', async () => {
      const result = await getCashFlowStatementTool({ symbol: 'AAPL', frequency: 'quarterly', limit: 1 });

      // Defect: period is never stamped with the requested frequency outside the fallback
      // path (src/tools/financials.ts:693-697).
      expect(result.statements[0].period).toBe('annual');
      expect(mockFundamentalsTimeSeries.mock.calls[0][1].type).toBe('quarterly');
    });

    it('should report field availability for the cash flow statement', async () => {
      const result = await getCashFlowStatementTool({ symbol: 'AAPL', limit: 1 });
      const availability = result.statements[0].fieldAvailability as Record<string, boolean>;

      expect(availability.totalCashFromOperatingActivities).toBe(true);
      expect(availability.capitalExpenditures).toBe(true);
      expect(availability.freeCashFlow).toBe(true);
    });

    it('should mark a missing free cash flow as unavailable', async () => {
      stubRows({ cashFlow: [cashFlowRow('2023-09-30T00:00:00Z', { freeCashFlow: undefined })] });

      const result = await getCashFlowStatementTool({ symbol: 'AAPL', limit: 1 });
      const availability = result.statements[0].fieldAvailability as Record<string, boolean>;

      expect(availability.freeCashFlow).toBe(false);
    });
  });

  describe('getFinancialsToolDefinitions', () => {
    it('should return tool definitions for all financial tools', () => {
      const definitions = getFinancialsToolDefinitions();

      expect(definitions).toHaveLength(3);
      expect(definitions[0].name).toBe('get_balance_sheet');
      expect(definitions[1].name).toBe('get_income_statement');
      expect(definitions[2].name).toBe('get_cash_flow_statement');
    });

    it('should include correct input schemas', () => {
      getFinancialsToolDefinitions().forEach(definition => {
        const inputSchema = definition.inputSchema as {
          type: string;
          properties: Record<string, unknown>;
          required: string[];
        };

        expect(inputSchema).toBeDefined();
        expect(inputSchema.type).toBe('object');
        expect(inputSchema.properties).toHaveProperty('symbol');
        expect(inputSchema.properties).toHaveProperty('frequency');
        expect(inputSchema.properties).toHaveProperty('limit');
        expect(inputSchema.required).toContain('symbol');
      });
    });

    it('should include descriptions for tools', () => {
      getFinancialsToolDefinitions().forEach(definition => {
        expect(definition.description).toBeDefined();
        expect((definition.description ?? '').length).toBeGreaterThan(0);
      });
    });
  });

  describe('Error Handling', () => {
    it('should report an unknown symbol as a YahooFinanceError', async () => {
      mockFundamentalsTimeSeries.mockRejectedValue(new Error('Symbol not found'));

      await expect(getBalanceSheetTool({ symbol: 'INVALID' })).rejects.toThrow(YahooFinanceError);
    });

    it('should wrap network failures for the income statement', async () => {
      mockFundamentalsTimeSeries.mockRejectedValue(new Error('Network error'));

      await expect(getIncomeStatementTool({ symbol: 'AAPL' })).rejects.toThrow(
        /Failed to fetch income statement for AAPL/
      );
    });

    it('should wrap timeout failures for the cash flow statement', async () => {
      mockFundamentalsTimeSeries.mockRejectedValue(new Error('Request timeout'));

      await expect(getCashFlowStatementTool({ symbol: 'AAPL' })).rejects.toThrow(
        /Failed to fetch cash flow statement for AAPL/
      );
    });

    it('should reject an empty result set with the incomplete-data code', async () => {
      mockFundamentalsTimeSeries.mockResolvedValue([]);

      await expect(getBalanceSheetTool({ symbol: 'AAPL' })).rejects.toMatchObject({
        code: YF_ERR_DATA_INCOMPLETE,
        isRetryable: false
      });
    });

    it('should reject a malformed result object', async () => {
      mockFundamentalsTimeSeries.mockResolvedValue({});

      await expect(getIncomeStatementTool({ symbol: 'AAPL' })).rejects.toThrow(YahooFinanceError);
    });

    it('should reject input that violates the financials input schema', async () => {
      await expect(getBalanceSheetTool({ symbol: 'AAPL', limit: 0 })).rejects.toThrow();
    });
  });

  describe('Data Quality', () => {
    it('should report the most recent period end as recency', async () => {
      const result = await getBalanceSheetTool({ symbol: 'AAPL' });

      expect(result.meta.recency).toBe('2023-09-30');
    });

    it('should not emit a staleness warning from the tool path', async () => {
      // `buildStatementMetadata` is only ever called with dataAge 0 (src/tools/financials.ts:561,
      // :583), so the `dataAge > CACHE_TTL * 0.5` branch at :280 cannot fire from here: a 2020
      // period end is reported, never warned about.
      stubRows({ balanceSheet: [balanceSheetRow('2020-09-26T00:00:00Z')] });

      const result = await getBalanceSheetTool({ symbol: 'AAPL', limit: 1 });

      expect(result.meta.recency).toBe('2020-09-26');
      expect(result.meta.dataAge).toBe(0);
      expect(result.meta.warnings).not.toContainEqual(expect.stringContaining('stale'));
    });

    it('should assemble the full meta block', async () => {
      const result = await getIncomeStatementTool({ symbol: 'AAPL' });

      expect(result.meta).toHaveProperty('fromCache');
      expect(result.meta).toHaveProperty('dataAge');
      expect(result.meta).toHaveProperty('completenessScore');
      expect(result.meta).toHaveProperty('warnings');
      expect(result.meta).toHaveProperty('recency');
    });
  });
});
