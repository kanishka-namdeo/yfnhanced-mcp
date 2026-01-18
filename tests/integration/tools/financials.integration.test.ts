import * as yahooFinance from 'yahoo-finance2';
import {
  getBalanceSheetTool,
  getIncomeStatementTool,
  getCashFlowStatementTool,
  getFinancialsToolDefinitions,
  clearFinancialsCache
} from '../../../src/tools/financials';
import { YahooFinanceError, YF_ERR_DATA_INCOMPLETE } from '../../../src/types/errors';

jest.mock('yahoo-finance2');

const mockBalanceSheetData = {
  balanceSheetHistory: {
    maxAge: 1,
    annual: [
      {
        endDate: { fmt: '2023-09-30', raw: 1696118400 },
        totalAssets: { fmt: '352,583,000,000', raw: 352583000000 },
        totalLiab: { fmt: '290,437,000,000', raw: 290437000000 },
        totalStockholderEquity: { fmt: '62,146,000,000', raw: 62146000000 },
        cash: { fmt: '29,965,000,000', raw: 29965000000 },
        shortTermInvestments: { fmt: '31,775,000,000', raw: 31775000000 },
        netReceivables: { fmt: '29,508,000,000', raw: 29508000000 },
        inventory: { fmt: '6,331,000,000', raw: 6331000000 },
        totalCurrentAssets: { fmt: '143,566,000,000', raw: 143566000000 },
        totalCurrentLiabilities: { fmt: '145,306,000,000', raw: 145306000000 },
        longTermDebt: { fmt: '95,281,000,000', raw: 95281000000 },
        propertyPlantEquipment: { fmt: '43,715,000,000', raw: 43715000000 },
        goodWill: { fmt: '0', raw: 0 },
        intangibleAssets: { fmt: '0', raw: 0 }
      },
      {
        endDate: { fmt: '2022-09-24', raw: 1664006400 },
        totalAssets: { fmt: '338,516,000,000', raw: 338516000000 },
        totalLiab: { fmt: '302,083,000,000', raw: 302083000000 },
        totalStockholderEquity: { fmt: '50,672,000,000', raw: 50672000000 },
        cash: { fmt: '23,646,000,000', raw: 23646000000 },
        shortTermInvestments: { fmt: '24,658,000,000', raw: 24658000000 },
        netReceivables: { fmt: '28,184,000,000', raw: 28184000000 },
        inventory: { fmt: '4,946,000,000', raw: 4946000000 },
        totalCurrentAssets: { fmt: '135,405,000,000', raw: 135405000000 },
        totalCurrentLiabilities: { fmt: '153,982,000,000', raw: 153982000000 },
        longTermDebt: { fmt: '98,959,000,000', raw: 98959000000 },
        propertyPlantEquipment: { fmt: '42,117,000,000', raw: 42117000000 }
      }
    ],
    quarterly: [
      {
        endDate: { fmt: '2023-09-30', raw: 1696118400 },
        totalAssets: { fmt: '352,583,000,000', raw: 352583000000 },
        totalLiab: { fmt: '290,437,000,000', raw: 290437000000 },
        totalStockholderEquity: { fmt: '62,146,000,000', raw: 62146000000 }
      }
    ]
  }
};

const mockIncomeStatementData = {
  incomeStatementHistory: {
    maxAge: 1,
    annual: [
      {
        endDate: { fmt: '2023-09-30', raw: 1696118400 },
        totalRevenue: { fmt: '383,285,000,000', raw: 383285000000 },
        costOfRevenue: { fmt: '214,137,000,000', raw: 214137000000 },
        grossProfit: { fmt: '169,148,000,000', raw: 169148000000 },
        operatingIncome: { fmt: '114,301,000,000', raw: 114301000000 },
        ebitda: { fmt: '126,332,000,000', raw: 126332000000 },
        netIncome: { fmt: '96,995,000,000', raw: 96995000000 },
        epsBasic: { fmt: '1.64', raw: 1.64 },
        epsDiluted: { fmt: '1.62', raw: 1.62 },
        interestExpense: { fmt: '3,962,000,000', raw: 3962000000 },
        taxProvision: { fmt: '16,423,000,000', raw: 16423000000 },
        researchAndDevelopment: { fmt: '29,915,000,000', raw: 29915000000 },
        sellingGeneralAndAdministrative: { fmt: '24,932,000,000', raw: 24932000000 }
      },
      {
        endDate: { fmt: '2022-09-24', raw: 1664006400 },
        totalRevenue: { fmt: '365,817,000,000', raw: 365817000000 },
        costOfRevenue: { fmt: '217,254,000,000', raw: 217254000000 },
        grossProfit: { fmt: '148,563,000,000', raw: 148563000000 },
        operatingIncome: { fmt: '108,949,000,000', raw: 108949000000 },
        ebitda: { fmt: '122,864,000,000', raw: 122864000000 },
        netIncome: { fmt: '99,803,000,000', raw: 99803000000 },
        epsBasic: { fmt: '1.68', raw: 1.68 },
        epsDiluted: { fmt: '1.67', raw: 1.67 }
      }
    ],
    quarterly: [
      {
        endDate: { fmt: '2023-09-30', raw: 1696118400 },
        totalRevenue: { fmt: '89,498,000,000', raw: 89498000000 },
        costOfRevenue: { fmt: '51,467,000,000', raw: 51467000000 },
        grossProfit: { fmt: '38,031,000,000', raw: 38031000000 },
        netIncome: { fmt: '22,956,000,000', raw: 22956000000 }
      }
    ]
  }
};

const mockCashFlowData = {
  cashflowStatementHistory: {
    maxAge: 1,
    annual: [
      {
        endDate: { fmt: '2023-09-30', raw: 1696118400 },
        totalCashFromOperatingActivities: { fmt: '110,543,000,000', raw: 110543000000 },
        capitalExpenditures: { fmt: '-10,957,000,000', raw: -10957000000 },
        totalCashFromFinancingActivities: { fmt: '-104,954,000,000', raw: -104954000000 },
        totalCashFromInvestingActivities: { fmt: '-7,399,000,000', raw: -7399000000 },
        depreciation: { fmt: '11,284,000,000', raw: 11284000000 },
        dividendsPaid: { fmt: '-14,835,000,000', raw: -14835000000 },
        stockRepurchases: { fmt: '-77,550,000,000', raw: -77550000000 },
        changeInCash: { fmt: '-3,032,000,000', raw: -3032000000 },
        freeCashFlow: { fmt: '99,586,000,000', raw: 99586000000 }
      },
      {
        endDate: { fmt: '2022-09-24', raw: 1664006400 },
        totalCashFromOperatingActivities: { fmt: '122,151,000,000', raw: 122151000000 },
        capitalExpenditures: { fmt: '-10,708,000,000', raw: -10708000000 },
        totalCashFromFinancingActivities: { fmt: '-110,542,000,000', raw: -110542000000 },
        totalCashFromInvestingActivities: { fmt: '-9,055,000,000', raw: -9055000000 },
        depreciation: { fmt: '11,104,000,000', raw: 11104000000 },
        dividendsPaid: { fmt: '-14,467,000,000', raw: -14467000000 },
        stockRepurchases: { fmt: '-89,403,000,000', raw: -89403000000 }
      }
    ],
    quarterly: [
      {
        endDate: { fmt: '2023-09-30', raw: 1696118400 },
        totalCashFromOperatingActivities: { fmt: '28,987,000,000', raw: 28987000000 },
        capitalExpenditures: { fmt: '-2,832,000,000', raw: -2832000000 },
        changeInCash: { fmt: '-6,299,000,000', raw: -6299000000 }
      }
    ]
  }
};

describe('Financials Tools Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearFinancialsCache();
  });

  describe('getBalanceSheetTool', () => {
    it('should successfully fetch annual balance sheet', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockBalanceSheetData);

      const result = await getBalanceSheetTool({
        symbol: 'AAPL',
        frequency: 'annual',
        limit: 2
      });

      expect(result.symbol).toBe('AAPL');
      expect(result.statements).toBeInstanceOf(Array);
      expect(result.statements.length).toBe(2);
      expect(result.statements[0].period).toBe('annual');
      expect(result.statements[0].balanceSheet.totalAssets).toBe(352583000000);
      expect(result.statements[0].balanceSheet.totalLiab).toBe(290437000000);
      expect(result.statements[0].balanceSheet.totalStockholderEquity).toBe(62146000000);
      expect(result.meta.fromCache).toBe(false);
      expect(yahooFinance.quoteSummary).toHaveBeenCalledWith('AAPL', {
        modules: ['balanceSheetHistory']
      });
    });

    it('should successfully fetch quarterly balance sheet', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockBalanceSheetData);

      const result = await getBalanceSheetTool({
        symbol: 'AAPL',
        frequency: 'quarterly',
        limit: 1
      });

      expect(result.symbol).toBe('AAPL');
      expect(result.statements[0].period).toBe('quarterly');
      expect(result.statements[0].endDate).toBe('2023-09-30');
      expect(yahooFinance.quoteSummary).toHaveBeenCalledWith('AAPL', {
        modules: ['balanceSheetHistoryQuarterly']
      });
    });

    it('should respect limit parameter', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockBalanceSheetData);

      const result = await getBalanceSheetTool({
        symbol: 'AAPL',
        frequency: 'annual',
        limit: 1
      });

      expect(result.statements.length).toBe(1);
    });

    it('should use default limit when not specified', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockBalanceSheetData);

      const result = await getBalanceSheetTool({
        symbol: 'AAPL'
      });

      expect(result.statements.length).toBe(2);
    });

    it('should include field availability information', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockBalanceSheetData);

      const result = await getBalanceSheetTool({
        symbol: 'AAPL'
      });

      expect(result.statements[0].fieldAvailability).toBeDefined();
      expect(result.statements[0].fieldAvailability.totalAssets).toBe(true);
      expect(result.statements[0].fieldInventory.totalLiab).toBe(true);
      expect(result.statements[0].fieldAvailability.totalStockholderEquity).toBe(true);
    });

    it('should use cached data on subsequent requests', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockBalanceSheetData);

      const result1 = await getBalanceSheetTool({ symbol: 'AAPL' });
      const result2 = await getBalanceSheetTool({ symbol: 'AAPL' });

      expect(result1.symbol).toBe('AAPL');
      expect(result2.symbol).toBe('AAPL');
      expect(yahooFinance.quoteSummary).toHaveBeenCalledTimes(1);
    });

    it('should handle missing fields in field availability', async () => {
      const incompleteData = {
        ...mockBalanceSheetData,
        balanceSheetHistory: {
          ...mockBalanceSheetData.balanceSheetHistory,
          annual: [
            {
              ...mockBalanceSheetData.balanceSheetHistory.annual[0],
              goodWill: undefined,
              intangibleAssets: undefined
            }
          ]
        }
      };

      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(incompleteData);

      const result = await getBalanceSheetTool({ symbol: 'AAPL' });

      expect(result.statements[0].fieldAvailability.goodWill).toBe(false);
      expect(result.statements[0].fieldAvailability.intangibleAssets).toBe(false);
    });

    it('should calculate completeness score', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockBalanceSheetData);

      const result = await getBalanceSheetTool({ symbol: 'AAPL' });

      expect(result.meta.completenessScore).toBeGreaterThan(0);
      expect(result.meta.completenessScore).toBeLessThanOrEqual(1);
    });

    it('should generate warnings for low completeness', async () => {
      const incompleteData = {
        balanceSheetHistory: {
          maxAge: 1,
          annual: [
            {
              endDate: { fmt: '2023-09-30', raw: 1696118400 },
              totalAssets: { fmt: '352,583,000,000', raw: 352583000000 }
            }
          ]
        }
      };

      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(incompleteData);

      const result = await getBalanceSheetTool({ symbol: 'AAPL' });

      expect(result.meta.warnings).toContainEqual(
        expect.stringContaining('completeness')
      );
    });

    it('should handle API errors gracefully', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockRejectedValue(new Error('API error'));

      await expect(getBalanceSheetTool({ symbol: 'AAPL' }))
        .rejects.toThrow(YahooFinanceError);
    });

    it('should fall back to quarterly when annual is unavailable', async () => {
      const annualUnavailableData = {
        balanceSheetHistory: {
          maxAge: 1,
          annual: [],
          quarterly: mockBalanceSheetData.balanceSheetHistory.quarterly
        }
      };

      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(annualUnavailableData);

      const result = await getBalanceSheetTool({ symbol: 'AAPL', frequency: 'annual' });

      expect(result.statements[0].period).toBe('quarterly');
    });
  });

  describe('getIncomeStatementTool', () => {
    it('should successfully fetch annual income statement', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockIncomeStatementData);

      const result = await getIncomeStatementTool({
        symbol: 'AAPL',
        frequency: 'annual',
        limit: 2
      });

      expect(result.symbol).toBe('AAPL');
      expect(result.statements).toBeInstanceOf(Array);
      expect(result.statements.length).toBe(2);
      expect(result.statements[0].period).toBe('annual');
      expect(result.statements[0].incomeStatement.totalRevenue).toBe(383285000000);
      expect(result.statements[0].incomeStatement.costOfRevenue).toBe(214137000000);
      expect(result.statements[0].incomeStatement.grossProfit).toBe(169148000000);
      expect(result.statements[0].incomeStatement.netIncome).toBe(96995000000);
      expect(result.statements[0].incomeStatement.epsBasic).toBe(1.64);
      expect(result.statements[0].incomeStatement.epsDiluted).toBe(1.62);
      expect(yahooFinance.quoteSummary).toHaveBeenCalledWith('AAPL', {
        modules: ['incomeStatementHistory']
      });
    });

    it('should successfully fetch quarterly income statement', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockIncomeStatementData);

      const result = await getIncomeStatementTool({
        symbol: 'AAPL',
        frequency: 'quarterly'
      });

      expect(result.statements[0].period).toBe('quarterly');
      expect(yahooFinance.quoteSummary).toHaveBeenCalledWith('AAPL', {
        modules: ['incomeStatementHistoryQuarterly']
      });
    });

    it('should include field availability for income statement', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockIncomeStatementData);

      const result = await getIncomeStatementTool({ symbol: 'AAPL' });

      expect(result.statements[0].fieldAvailability).toBeDefined();
      expect(result.statements[0].fieldAvailability.totalRevenue).toBe(true);
      expect(result.statements[0].fieldAvailability.grossProfit).toBe(true);
      expect(result.statements[0].fieldAvailability.netIncome).toBe(true);
      expect(result.statements[0].fieldAvailability.epsBasic).toBe(true);
    });

    it('should handle missing EPS data', async () => {
      const noEPSData = {
        ...mockIncomeStatementData,
        incomeStatementHistory: {
          ...mockIncomeStatementData.incomeStatementHistory,
          annual: [
            {
              ...mockIncomeStatementData.incomeStatementHistory.annual[0],
              epsBasic: undefined,
              epsDiluted: undefined
            }
          ]
        }
      };

      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(noEPSData);

      const result = await getIncomeStatementTool({ symbol: 'AAPL' });

      expect(result.statements[0].fieldAvailability.epsBasic).toBe(false);
      expect(result.statements[0].fieldAvailability.epsDiluted).toBe(false);
    });

    it('should calculate profitability metrics', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockIncomeStatementData);

      const result = await getIncomeStatementTool({ symbol: 'AAPL' });

      expect(result.statements[0].incomeStatement.grossProfit).toBeDefined();
      expect(result.statements[0].incomeStatement.operatingIncome).toBeDefined();
      expect(result.statements[0].incomeStatement.ebitda).toBeDefined();
    });
  });

  describe('getCashFlowStatementTool', () => {
    it('should successfully fetch annual cash flow statement', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockCashFlowData);

      const result = await getCashFlowStatementTool({
        symbol: 'AAPL',
        frequency: 'annual',
        limit: 2
      });

      expect(result.symbol).toBe('AAPL');
      expect(result.statements).toBeInstanceOf(Array);
      expect(result.statements.length).toBe(2);
      expect(result.statements[0].period).toBe('annual');
      expect(result.statements[0].cashFlowStatement.totalCashFromOperatingActivities).toBe(110543000000);
      expect(result.statements[0].cashFlowStatement.capitalExpenditures).toBe(-10957000000);
      expect(result.statements[0].cashFlowStatement.totalCashFromFinancingActivities).toBe(-104954000000);
      expect(result.statements[0].cashFlowStatement.totalCashFromInvestingActivities).toBe(-7399000000);
      expect(result.statements[0].cashFlowStatement.freeCashFlow).toBe(99586000000);
      expect(yahooFinance.quoteSummary).toHaveBeenCalledWith('AAPL', {
        modules: ['cashflowStatementHistory']
      });
    });

    it('should successfully fetch quarterly cash flow statement', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockCashFlowData);

      const result = await getCashFlowStatementTool({
        symbol: 'AAPL',
        frequency: 'quarterly'
      });

      expect(result.statements[0].period).toBe('quarterly');
      expect(yahooFinance.quoteSummary).toHaveBeenCalledWith('AAPL', {
        modules: ['cashflowStatementHistoryQuarterly']
      });
    });

    it('should include field availability for cash flow statement', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockCashFlowData);

      const result = await getCashFlowStatementTool({ symbol: 'AAPL' });

      expect(result.statements[0].fieldAvailability).toBeDefined();
      expect(result.statements[0].fieldAvailability.totalCashFromOperatingActivities).toBe(true);
      expect(result.statements[0].fieldAvailability.capitalExpenditures).toBe(true);
      expect(result.statements[0].fieldAvailability.freeCashFlow).toBe(true);
    });

    it('should handle missing free cash flow data', async () => {
      const noFCFData = {
        ...mockCashFlowData,
        cashflowStatementHistory: {
          ...mockCashFlowData.cashflowStatementHistory,
          annual: [
            {
              ...mockCashFlowData.cashflowStatementHistory.annual[0],
              freeCashFlow: undefined
            }
          ]
        }
      };

      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(noFCFData);

      const result = await getCashFlowStatementTool({ symbol: 'AAPL' });

      expect(result.statements[0].fieldAvailability.freeCashFlow).toBe(false);
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
      const definitions = getFinancialsToolDefinitions();

      definitions.forEach(definition => {
        expect(definition.inputSchema).toBeDefined();
        expect(definition.inputSchema.type).toBe('object');
        expect(definition.inputSchema.properties).toHaveProperty('symbol');
        expect(definition.inputSchema.properties).toHaveProperty('frequency');
        expect(definition.inputSchema.properties).toHaveProperty('limit');
        expect(definition.inputSchema.required).toContain('symbol');
      });
    });

    it('should include descriptions for tools', () => {
      const definitions = getFinancialsToolDefinitions();

      definitions.forEach(definition => {
        expect(definition.description).toBeDefined();
        expect(definition.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('clearFinancialsCache', () => {
    it('should clear the financials cache', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockBalanceSheetData);

      await getBalanceSheetTool({ symbol: 'AAPL' });
      clearFinancialsCache();

      (yahooFinance.quoteSummary as jest.Mock).mockClear();
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockBalanceSheetData);

      await getBalanceSheetTool({ symbol: 'AAPL' });

      expect(yahooFinance.quoteSummary).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle symbol not found', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockRejectedValue(
        new Error('Symbol not found')
      );

      await expect(getBalanceSheetTool({ symbol: 'INVALID' }))
        .rejects.toThrow(YahooFinanceError);
    });

    it('should handle network errors', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockRejectedValue(
        new Error('Network error')
      );

      await expect(getIncomeStatementTool({ symbol: 'AAPL' }))
        .rejects.toThrow();
    });

    it('should handle timeout errors', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockRejectedValue(
        new Error('Request timeout')
      );

      await expect(getCashFlowStatementTool({ symbol: 'AAPL' }))
        .rejects.toThrow();
    });

    it('should handle empty financial data', async () => {
      const emptyData = {
        balanceSheetHistory: {
          maxAge: 1,
          annual: [],
          quarterly: []
        }
      };

      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(emptyData);

      await expect(getBalanceSheetTool({ symbol: 'AAPL' }))
        .rejects.toThrow(YF_ERR_DATA_INCOMPLETE);
    });

    it('should handle malformed data', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue({});

      await expect(getIncomeStatementTool({ symbol: 'AAPL' }))
        .rejects.toThrow(YahooFinanceError);
    });
  });

  describe('Data Quality', () => {
    it('should report recency of financial data', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockBalanceSheetData);

      const result = await getBalanceSheetTool({ symbol: 'AAPL' });

      expect(result.meta.recency).toBeDefined();
      expect(result.meta.recency).toBe('2023-09-30');
    });

    it('should generate warnings for stale data', async () => {
      const staleData = {
        ...mockBalanceSheetData,
        balanceSheetHistory: {
          ...mockBalanceSheetData.balanceSheetHistory,
          annual: [
            {
              ...mockBalanceSheetData.balanceSheetHistory.annual[0],
              endDate: { fmt: '2020-09-30', raw: 1601452800 }
            }
          ]
        }
      };

      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(staleData);

      const result = await getBalanceSheetTool({ symbol: 'AAPL' });

      expect(result.meta.warnings).toContainEqual(
        expect.stringContaining('stale')
      );
    });

    it('should calculate metadata correctly', async () => {
      (yahooFinance.quoteSummary as jest.Mock).mockResolvedValue(mockIncomeStatementData);

      const result = await getIncomeStatementTool({ symbol: 'AAPL' });

      expect(result.meta).toHaveProperty('fromCache');
      expect(result.meta).toHaveProperty('dataAge');
      expect(result.meta).toHaveProperty('completenessScore');
      expect(result.meta).toHaveProperty('warnings');
      expect(result.meta).toHaveProperty('recency');
    });
  });
});
