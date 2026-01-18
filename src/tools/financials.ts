import YahooFinance from 'yahoo-finance2';
import { FinancialsInputSchema, FinancialsOutputSchema } from '../schemas/index.js';
import { YahooFinanceError, YF_ERR_DATA_INCOMPLETE } from '../types/errors.js';
import { DataQualityReporter } from '../utils/data-completion.js';
import type { FinancialStatementResult, BalanceSheet, IncomeStatement, CashFlowStatement } from '../types/yahoo-finance.js';
import type { CacheConfig } from '../types/config.js';
import { InputValidator } from '../utils/security.js';

type FinancialsToolConfig = {
  cache: CacheConfig;
  defaultTTL: number;
};

type StatementData = {
  period: string;
  startDate: string;
  endDate: string;
  [key: string]: number | string | null;
};

type StatementWithMeta = {
  statements: StatementData[];
  meta: {
    fromCache: boolean;
    dataAge: number;
    completenessScore: number;
    warnings: string[];
    recency: string;
  };
};

const DEFAULT_LIMIT = 4;
const CACHE_TTL = 86400000;
const EXPECTED_BS_FIELDS = [
  'totalAssets',
  'totalLiab',
  'totalStockholderEquity',
  'cash',
  'shortTermInvestments',
  'netReceivables',
  'inventory',
  'totalCurrentAssets',
  'totalCurrentLiabilities',
  'longTermDebt',
  'propertyPlantEquipment',
  'goodWill',
  'intangibleAssets'
];

const EXPECTED_IS_FIELDS = [
  'totalRevenue',
  'costOfRevenue',
  'grossProfit',
  'operatingIncome',
  'ebitda',
  'netIncome',
  'epsBasic',
  'epsDiluted',
  'interestExpense',
  'taxProvision',
  'researchAndDevelopment',
  'sellingGeneralAndAdministrative'
];

const EXPECTED_CF_FIELDS = [
  'totalCashFromOperatingActivities',
  'capitalExpenditures',
  'totalCashFromFinancingActivities',
  'totalCashFromInvestingActivities',
  'depreciation',
  'dividendsPaid',
  'stockRepurchases',
  'changeInCash',
  'freeCashFlow'
];

class FinancialsToolCache {
  private cache: Map<string, { data: StatementWithMeta; timestamp: number }>;
  private ttl: number;

  constructor(ttl: number = CACHE_TTL) {
    this.cache = new Map();
    this.ttl = ttl;
  }

  get(key: string): StatementWithMeta | null {
    const entry = this.cache.get(key);
    if (!entry) {return null;}
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: StatementWithMeta): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  generateCacheKey(symbol: string, type: string, frequency: string): string {
    return `financials:${symbol}:${type}:${frequency}`;
  }

  clear(): void {
    this.cache.clear();
  }
}

function extractField(item: Record<string, unknown>, fieldName: string): number | null {
  if (item[fieldName] === undefined || item[fieldName] === null) {
    return null;
  }
  const field = item[fieldName];
  if (typeof field === 'number') {
    return field;
  }
  if (typeof field === 'object' && field !== null && 'raw' in field) {
    const raw = (field as { raw: unknown }).raw;
    return typeof raw === 'number' ? raw : null;
  }
  return null;
}

function extractStringField(item: Record<string, unknown>, fieldName: string): string | null {
  if (item[fieldName] === undefined || item[fieldName] === null) {
    return null;
  }
  const field = item[fieldName];
  if (typeof field === 'string') {
    return field;
  }
  if (typeof field === 'object' && field !== null && 'fmt' in field) {
    return String((field as { fmt: unknown }).fmt);
  }
  return null;
}

function buildFieldAvailability(data: Record<string, number | null>, expectedFields: string[]): Record<string, boolean> {
  const availability: Record<string, boolean> = {};
  for (const field of expectedFields) {
    availability[field] = data[field] !== null && data[field] !== undefined;
  }
  return availability;
}

function convertBalanceSheetToStatementData(item: Record<string, unknown>): StatementData {
  const endDateRaw = extractStringField(item, 'endDate');
  const endDate = endDateRaw ? new Date(endDateRaw).toISOString().split('T')[0] : '';

  const statement: StatementData = {
    period: 'annual',
    startDate: '',
    endDate,
    totalAssets: extractField(item, 'totalAssets'),
    totalLiab: extractField(item, 'totalLiab'),
    totalStockholderEquity: extractField(item, 'totalStockholderEquity'),
    cash: extractField(item, 'cash'),
    shortTermInvestments: extractField(item, 'shortTermInvestments'),
    netReceivables: extractField(item, 'netReceivables'),
    inventory: extractField(item, 'inventory'),
    totalCurrentAssets: extractField(item, 'totalCurrentAssets'),
    totalCurrentLiabilities: extractField(item, 'totalCurrentLiabilities'),
    longTermDebt: extractField(item, 'longTermDebt'),
    propertyPlantEquipment: extractField(item, 'propertyPlantEquipment'),
    goodWill: extractField(item, 'goodWill'),
    intangibleAssets: extractField(item, 'intangibleAssets'),
    retainedEarnings: extractField(item, 'retainedEarnings'),
    otherAssets: extractField(item, 'otherAssets'),
    otherLiab: extractField(item, 'otherLiab')
  };

  return statement;
}

function convertIncomeStatementToStatementData(item: Record<string, unknown>): StatementData {
  const endDateRaw = extractStringField(item, 'endDate');
  const endDate = endDateRaw ? new Date(endDateRaw).toISOString().split('T')[0] : '';

  const statement: StatementData = {
    period: 'annual',
    startDate: '',
    endDate,
    totalRevenue: extractField(item, 'totalRevenue'),
    costOfRevenue: extractField(item, 'costOfRevenue'),
    grossProfit: extractField(item, 'grossProfit'),
    operatingIncome: extractField(item, 'operatingIncome'),
    ebitda: extractField(item, 'ebitda'),
    netIncome: extractField(item, 'netIncome'),
    epsBasic: extractField(item, 'epsBasic'),
    epsDiluted: extractField(item, 'epsDiluted'),
    interestExpense: extractField(item, 'interestExpense'),
    taxProvision: extractField(item, 'taxProvision'),
    researchAndDevelopment: extractField(item, 'researchAndDevelopment'),
    sellingGeneralAndAdministrative: extractField(item, 'sellingGeneralAndAdministrative'),
    operatingExpense: extractField(item, 'operatingExpense'),
    otherOperatingExpenses: extractField(item, 'otherOperatingExpenses'),
    nonRecurringEvents: extractField(item, 'nonRecurringEvents'),
    nonOperatingInterestIncome: extractField(item, 'nonOperatingInterestIncome'),
    otherIncomeExpense: extractField(item, 'otherIncomeExpense')
  };

  return statement;
}

function convertCashFlowToStatementData(item: Record<string, unknown>): StatementData {
  const endDateRaw = extractStringField(item, 'endDate');
  const endDate = endDateRaw ? new Date(endDateRaw).toISOString().split('T')[0] : '';

  const statement: StatementData = {
    period: 'annual',
    startDate: '',
    endDate,
    totalCashFromOperatingActivities: extractField(item, 'totalCashFromOperatingActivities'),
    capitalExpenditures: extractField(item, 'capitalExpenditures'),
    totalCashFromFinancingActivities: extractField(item, 'totalCashFromFinancingActivities'),
    totalCashFromInvestingActivities: extractField(item, 'totalCashFromInvestingActivities'),
    depreciation: extractField(item, 'depreciation'),
    dividendsPaid: extractField(item, 'dividendsPaid'),
    stockRepurchases: extractField(item, 'stockRepurchases'),
    changeInCash: extractField(item, 'changeInCash'),
    freeCashFlow: extractField(item, 'freeCashFlow'),
    netBorrowings: extractField(item, 'netBorrowings'),
    otherCashflowsFromInvestingActivities: extractField(item, 'otherCashflowsFromInvestingActivities'),
    otherCashflowsFromFinancingActivities: extractField(item, 'otherCashflowsFromFinancingActivities'),
    effectOfExchangeRateOnCash: extractField(item, 'effectOfExchangeRateOnCash')
  };

  return statement;
}

function buildStatementMetadata(
  statements: StatementData[],
  fromCache: boolean,
  dataAge: number,
  expectedFields: string[]
): StatementWithMeta['meta'] {
  const qualityReporter = new DataQualityReporter(CACHE_TTL);
  const warnings: string[] = [];

  let totalFields = 0;
  let availableFields = 0;

  for (const statement of statements) {
    for (const field of expectedFields) {
      totalFields++;
      if (statement[field] !== null && statement[field] !== undefined) {
        availableFields++;
      }
    }
  }

  const completenessScore = totalFields > 0 ? availableFields / totalFields : 0;

  if (completenessScore < 0.5) {
    warnings.push('Data completeness is low (< 50% fields available)');
  } else if (completenessScore < 0.8) {
    warnings.push('Some financial data fields are missing');
  }

  if (dataAge > CACHE_TTL * 0.5) {
    warnings.push('Financial data is stale (older than 12 hours)');
  }

  const latestDate = statements.length > 0 ? statements[0].endDate : '';
  const recency = latestDate || new Date().toISOString().split('T')[0];

  return {
    fromCache,
    dataAge,
    completenessScore,
    warnings,
    recency
  };
}

async function fetchBalanceSheet(
  symbol: string,
  frequency: 'annual' | 'quarterly' = 'annual'
): Promise<BalanceSheet> {
  try {
    const yf = new YahooFinance();
    // Use a date far in the past to get all available historical data
    const result = await yf.fundamentalsTimeSeries(symbol, {
      module: 'balance-sheet',
      type: frequency,
      period1: new Date(2000, 0, 1) // January 1, 2000
    });

    if (!result || result.length === 0) {
      throw new YahooFinanceError(
        `Balance sheet data not available for ${symbol}`,
        YF_ERR_DATA_INCOMPLETE,
        null,
        false,
        false,
        { symbol, frequency },
        'Try quarterly frequency or check if symbol is valid'
      );
    }

    // Convert fundamentalsTimeSeries format to legacy BalanceSheet format
    const bsData: BalanceSheet = {
      maxAge: 0,
      annual: [],
      quarterly: []
    };

    const dataArray = frequency === 'annual' ? bsData.annual : bsData.quarterly;

    // Cast result to BalanceSheet type
    for (const item of result as any) {
      const periodData: Record<string, unknown> = {
        endDate: {
          fmt: item.date instanceof Date ? item.date.toISOString().split('T')[0] : '',
          raw: item.date instanceof Date ? item.date.getTime() / 1000 : 0
        },
        totalAssets: item.totalAssets ? { fmt: item.totalAssets.toString(), raw: item.totalAssets } : undefined,
        totalLiab: item.totalLiabilities ? { fmt: item.totalLiabilities.toString(), raw: item.totalLiabilities } : undefined,
        totalStockholderEquity: item.stockholdersEquity ? { fmt: item.stockholdersEquity.toString(), raw: item.stockholdersEquity } : undefined,
        cash: item.cashAndCashEquivalents ? { fmt: item.cashAndCashEquivalents.toString(), raw: item.cashAndCashEquivalents } : undefined,
        shortTermInvestments: item.cashCashEquivalentsAndShortTermInvestments ? { fmt: item.cashCashEquivalentsAndShortTermInvestments.toString(), raw: item.cashCashEquivalentsAndShortTermInvestments } : undefined,
        netReceivables: item.receivables ? { fmt: item.receivables.toString(), raw: item.receivables } : undefined,
        inventory: item.inventory ? { fmt: item.inventory.toString(), raw: item.inventory } : undefined,
        totalCurrentAssets: item.currentAssets ? { fmt: item.currentAssets.toString(), raw: item.currentAssets } : undefined,
        totalCurrentLiabilities: item.currentLiabilities ? { fmt: item.currentLiabilities.toString(), raw: item.currentLiabilities } : undefined,
        longTermDebt: item.longTermDebt ? { fmt: item.longTermDebt.toString(), raw: item.longTermDebt } : undefined,
        propertyPlantEquipment: item.netPPE ? { fmt: item.netPPE.toString(), raw: item.netPPE } : undefined,
        goodWill: item.goodwill ? { fmt: item.goodwill.toString(), raw: item.goodwill } : undefined,
        intangibleAssets: item.otherIntangibleAssets ? { fmt: item.otherIntangibleAssets.toString(), raw: item.otherIntangibleAssets } : undefined,
        retainedEarnings: item.retainedEarnings ? { fmt: item.retainedEarnings.toString(), raw: item.retainedEarnings } : undefined,
        otherAssets: item.otherAssets ? { fmt: item.otherAssets.toString(), raw: item.otherAssets } : undefined,
        otherLiab: item.otherLiabilities ? { fmt: item.otherLiabilities.toString(), raw: item.otherLiabilities } : undefined
      };

      dataArray.push(periodData as any);
    }

    return bsData;
  } catch (error) {
    if (error instanceof YahooFinanceError) {
      throw error;
    }
    throw new YahooFinanceError(
      `Failed to fetch balance sheet for ${symbol}: ${error instanceof Error ? error.message : String(error)}`,
      YF_ERR_DATA_INCOMPLETE,
      null,
      true,
      false,
      { symbol, frequency },
      'Retry the request or try quarterly frequency'
    );
  }
}

async function fetchIncomeStatement(
  symbol: string,
  frequency: 'annual' | 'quarterly' = 'annual'
): Promise<IncomeStatement> {
  try {
    const yf = new YahooFinance();
    // Use a date far in past to get all available historical data
    const result = await yf.fundamentalsTimeSeries(symbol, {
      module: 'financials',
      type: frequency,
      period1: new Date(2000, 0, 1) // January 1, 2000
    });

    if (!result || result.length === 0) {
      throw new YahooFinanceError(
        `Income statement data not available for ${symbol}`,
        YF_ERR_DATA_INCOMPLETE,
        null,
        false,
        false,
        { symbol, frequency },
        'Try quarterly frequency or check if symbol is valid'
      );
    }

    // Convert fundamentalsTimeSeries format to legacy IncomeStatement format
    const isData: IncomeStatement = {
      maxAge: 0,
      annual: [],
      quarterly: []
    };

    const dataArray = frequency === 'annual' ? isData.annual : isData.quarterly;

    // Cast result to Financials type
    for (const item of result as any) {
      const periodData: Record<string, unknown> = {
        endDate: {
          fmt: item.date instanceof Date ? item.date.toISOString().split('T')[0] : '',
          raw: item.date instanceof Date ? item.date.getTime() / 1000 : 0
        },
        totalRevenue: item.totalRevenue ? { fmt: item.totalRevenue.toString(), raw: item.totalRevenue } : undefined,
        costOfRevenue: item.costOfRevenue ? { fmt: item.costOfRevenue.toString(), raw: item.costOfRevenue } : undefined,
        grossProfit: item.grossProfit ? { fmt: item.grossProfit.toString(), raw: item.grossProfit } : undefined,
        operatingIncome: item.operatingIncome ? { fmt: item.operatingIncome.toString(), raw: item.operatingIncome } : undefined,
        ebitda: item.EBITDA ? { fmt: item.EBITDA.toString(), raw: item.EBITDA } : undefined,
        netIncome: item.netIncome ? { fmt: item.netIncome.toString(), raw: item.netIncome } : undefined,
        epsBasic: item.basicEPS ? { fmt: item.basicEPS.toString(), raw: item.basicEPS } : undefined,
        epsDiluted: item.dilutedEPS ? { fmt: item.dilutedEPS.toString(), raw: item.dilutedEPS } : undefined,
        interestExpense: item.interestExpenseNonOperating ? { fmt: item.interestExpenseNonOperating.toString(), raw: item.interestExpenseNonOperating } : undefined,
        taxProvision: item.taxProvision ? { fmt: item.taxProvision.toString(), raw: item.taxProvision } : undefined,
        researchAndDevelopment: item.researchAndDevelopment ? { fmt: item.researchAndDevelopment.toString(), raw: item.researchAndDevelopment } : undefined,
        sellingGeneralAndAdministrative: item.sellingGeneralAndAdministration ? { fmt: item.sellingGeneralAndAdministration.toString(), raw: item.sellingGeneralAndAdministration } : undefined,
        operatingExpense: item.operatingExpense ? { fmt: item.operatingExpense.toString(), raw: item.operatingExpense } : undefined,
        otherOperatingExpenses: item.otherOperatingExpenses ? { fmt: item.otherOperatingExpenses.toString(), raw: item.otherOperatingExpenses } : undefined,
        nonRecurringEvents: item.totalUnusualItems ? { fmt: item.totalUnusualItems.toString(), raw: item.totalUnusualItems } : undefined,
        nonOperatingInterestIncome: item.interestIncomeNonOperating ? { fmt: item.interestIncomeNonOperating.toString(), raw: item.interestIncomeNonOperating } : undefined,
        otherIncomeExpense: item.otherIncomeExpense ? { fmt: item.otherIncomeExpense.toString(), raw: item.otherIncomeExpense } : undefined
      };

      dataArray.push(periodData as any);
    }

    return isData;
  } catch (error) {
    if (error instanceof YahooFinanceError) {
      throw error;
    }
    throw new YahooFinanceError(
      `Failed to fetch income statement for ${symbol}: ${error instanceof Error ? error.message : String(error)}`,
      YF_ERR_DATA_INCOMPLETE,
      null,
      true,
      false,
      { symbol, frequency },
      'Retry the request or try quarterly frequency'
    );
  }
}

async function fetchCashFlowStatement(
  symbol: string,
  frequency: 'annual' | 'quarterly' = 'annual'
): Promise<CashFlowStatement> {
  try {
    const yf = new YahooFinance();
    // Use a date far in past to get all available historical data
    const result = await yf.fundamentalsTimeSeries(symbol, {
      module: 'cash-flow',
      type: frequency,
      period1: new Date(2000, 0, 1) // January 1, 2000
    });

    if (!result || result.length === 0) {
      throw new YahooFinanceError(
        `Cash flow statement data not available for ${symbol}`,
        YF_ERR_DATA_INCOMPLETE,
        null,
        false,
        false,
        { symbol, frequency },
        'Try quarterly frequency or check if symbol is valid'
      );
    }

    // Convert fundamentalsTimeSeries format to legacy CashFlowStatement format
    const cfData: CashFlowStatement = {
      maxAge: 0,
      annual: [],
      quarterly: []
    };

    const dataArray = frequency === 'annual' ? cfData.annual : cfData.quarterly;

    // Cast result to CashFlow type
    for (const item of result as any) {
      const periodData: Record<string, unknown> = {
        endDate: {
          fmt: item.date instanceof Date ? item.date.toISOString().split('T')[0] : '',
          raw: item.date instanceof Date ? item.date.getTime() / 1000 : 0
        },
        totalCashFromOperatingActivities: item.operatingCashFlow ? { fmt: item.operatingCashFlow.toString(), raw: item.operatingCashFlow } : undefined,
        capitalExpenditures: item.capitalExpenditure ? { fmt: item.capitalExpenditure.toString(), raw: item.capitalExpenditure } : undefined,
        totalCashFromFinancingActivities: item.cashFlowFromContinuingFinancingActivities ? { fmt: item.cashFlowFromContinuingFinancingActivities.toString(), raw: item.cashFlowFromContinuingFinancingActivities } : undefined,
        totalCashFromInvestingActivities: item.cashFlowFromContinuingInvestingActivities ? { fmt: item.cashFlowFromContinuingInvestingActivities.toString(), raw: item.cashFlowFromContinuingInvestingActivities } : undefined,
        depreciation: item.depreciationAndAmortization ? { fmt: item.depreciationAndAmortization.toString(), raw: item.depreciationAndAmortization } : undefined,
        dividendsPaid: item.commonStockDividendPaid ? { fmt: item.commonStockDividendPaid.toString(), raw: item.commonStockDividendPaid } : undefined,
        stockRepurchases: item.repurchaseOfCapitalStock ? { fmt: item.repurchaseOfCapitalStock.toString(), raw: item.repurchaseOfCapitalStock } : undefined,
        changeInCash: item.changesInCash ? { fmt: item.changesInCash.toString(), raw: item.changesInCash } : undefined,
        freeCashFlow: item.freeCashFlow ? { fmt: item.freeCashFlow.toString(), raw: item.freeCashFlow } : undefined,
        netBorrowings: item.netIssuancePaymentsOfDebt ? { fmt: item.netIssuancePaymentsOfDebt.toString(), raw: item.netIssuancePaymentsOfDebt } : undefined,
        otherCashflowsFromInvestingActivities: item.netOtherInvestingChanges ? { fmt: item.netOtherInvestingChanges.toString(), raw: item.netOtherInvestingChanges } : undefined,
        otherCashflowsFromFinancingActivities: item.netOtherFinancingCharges ? { fmt: item.netOtherFinancingCharges.toString(), raw: item.netOtherFinancingCharges } : undefined,
        effectOfExchangeRateOnCash: item.effectOfExchangeRateChanges ? { fmt: item.effectOfExchangeRateChanges.toString(), raw: item.effectOfExchangeRateChanges } : undefined
      };

      dataArray.push(periodData as any);
    }

    return cfData;
  } catch (error) {
    if (error instanceof YahooFinanceError) {
      throw error;
    }
    throw new YahooFinanceError(
      `Failed to fetch cash flow statement for ${symbol}: ${error instanceof Error ? error.message : String(error)}`,
      YF_ERR_DATA_INCOMPLETE,
      null,
      true,
      false,
      { symbol, frequency },
      'Retry the request or try quarterly frequency'
    );
  }
}

async function getBalanceSheet(
  symbol: string,
  frequency: 'annual' | 'quarterly' = 'annual',
  limit: number = DEFAULT_LIMIT,
  cache: FinancialsToolCache
): Promise<StatementWithMeta> {
  const cacheKey = cache.generateCacheKey(symbol, 'balance-sheet', frequency);
  const cached = cache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const data = await fetchBalanceSheet(symbol, frequency);
  const statementsData = frequency === 'annual' ? data.annual : data.quarterly;

  if (!statementsData || statementsData.length === 0) {
    if (frequency === 'annual') {
      const quarterlyData = await fetchBalanceSheet(symbol, 'quarterly');
      const quarterlyStatements = quarterlyData.quarterly;
      if (quarterlyStatements && quarterlyStatements.length > 0) {
        const statements = quarterlyStatements
          .slice(0, limit)
          .map((item) => convertBalanceSheetToStatementData(item as unknown as Record<string, unknown>));

        for (const stmt of statements) {
          stmt.period = 'quarterly';
        }

        const meta = buildStatementMetadata(statements, false, 0, EXPECTED_BS_FIELDS);
        const result = { statements, meta };
        cache.set(cacheKey, result);
        return result;
      }
    }

    throw new YahooFinanceError(
      `No balance sheet data available for ${symbol}`,
      YF_ERR_DATA_INCOMPLETE,
      null,
      false,
      false,
      { symbol, frequency },
      'Verify the symbol exists and has financial data available'
    );
  }

  const statements = statementsData
    .slice(0, limit)
    .map((item) => convertBalanceSheetToStatementData(item as unknown as Record<string, unknown>));

  const meta = buildStatementMetadata(statements, false, 0, EXPECTED_BS_FIELDS);
  const result = { statements, meta };
  cache.set(cacheKey, result);
  return result;
}

async function getIncomeStatement(
  symbol: string,
  frequency: 'annual' | 'quarterly' = 'annual',
  limit: number = DEFAULT_LIMIT,
  cache: FinancialsToolCache
): Promise<StatementWithMeta> {
  const cacheKey = cache.generateCacheKey(symbol, 'income-statement', frequency);
  const cached = cache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const data = await fetchIncomeStatement(symbol, frequency);
  const statementsData = frequency === 'annual' ? data.annual : data.quarterly;

  if (!statementsData || statementsData.length === 0) {
    if (frequency === 'annual') {
      const quarterlyData = await fetchIncomeStatement(symbol, 'quarterly');
      const quarterlyStatements = quarterlyData.quarterly;
      if (quarterlyStatements && quarterlyStatements.length > 0) {
        const statements = quarterlyStatements
          .slice(0, limit)
          .map((item) => convertIncomeStatementToStatementData(item as unknown as Record<string, unknown>));

        for (const stmt of statements) {
          stmt.period = 'quarterly';
        }

        const meta = buildStatementMetadata(statements, false, 0, EXPECTED_IS_FIELDS);
        const result = { statements, meta };
        cache.set(cacheKey, result);
        return result;
      }
    }

    throw new YahooFinanceError(
      `No income statement data available for ${symbol}`,
      YF_ERR_DATA_INCOMPLETE,
      null,
      false,
      false,
      { symbol, frequency },
      'Verify the symbol exists and has financial data available'
    );
  }

  const statements = statementsData
    .slice(0, limit)
    .map((item) => convertIncomeStatementToStatementData(item as unknown as Record<string, unknown>));

  const meta = buildStatementMetadata(statements, false, 0, EXPECTED_IS_FIELDS);
  const result = { statements, meta };
  cache.set(cacheKey, result);
  return result;
}

async function getCashFlowStatement(
  symbol: string,
  frequency: 'annual' | 'quarterly' = 'annual',
  limit: number = DEFAULT_LIMIT,
  cache: FinancialsToolCache
): Promise<StatementWithMeta> {
  const cacheKey = cache.generateCacheKey(symbol, 'cash-flow', frequency);
  const cached = cache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const data = await fetchCashFlowStatement(symbol, frequency);
  const statementsData = frequency === 'annual' ? data.annual : data.quarterly;

  if (!statementsData || statementsData.length === 0) {
    if (frequency === 'annual') {
      const quarterlyData = await fetchCashFlowStatement(symbol, 'quarterly');
      const quarterlyStatements = quarterlyData.quarterly;
      if (quarterlyStatements && quarterlyStatements.length > 0) {
        const statements = quarterlyStatements
          .slice(0, limit)
          .map((item) => convertCashFlowToStatementData(item as unknown as Record<string, unknown>));

        for (const stmt of statements) {
          stmt.period = 'quarterly';
        }

        const meta = buildStatementMetadata(statements, false, 0, EXPECTED_CF_FIELDS);
        const result = { statements, meta };
        cache.set(cacheKey, result);
        return result;
      }
    }

    throw new YahooFinanceError(
      `No cash flow statement data available for ${symbol}`,
      YF_ERR_DATA_INCOMPLETE,
      null,
      false,
      false,
      { symbol, frequency },
      'Verify the symbol exists and has financial data available'
    );
  }

  const statements = statementsData
    .slice(0, limit)
    .map((item) => convertCashFlowToStatementData(item as unknown as Record<string, unknown>));

  const meta = buildStatementMetadata(statements, false, 0, EXPECTED_CF_FIELDS);
  const result = { statements, meta };
  cache.set(cacheKey, result);
  return result;
}

const financialsToolCache = new FinancialsToolCache(CACHE_TTL);

export async function getBalanceSheetTool(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const parsed = FinancialsInputSchema.parse(args);
  const { symbol, frequency = 'annual', limit = DEFAULT_LIMIT } = parsed;

  const result = await getBalanceSheet(symbol, frequency, limit, financialsToolCache);

  const statements = result.statements.map((stmt) => ({
    period: stmt.period,
    startDate: stmt.startDate,
    endDate: stmt.endDate,
    balanceSheet: Object.fromEntries(
      Object.entries(stmt).filter(([key]) => !['period', 'startDate', 'endDate'].includes(key))
    ),
    fieldAvailability: buildFieldAvailability(stmt as Record<string, number | null>, EXPECTED_BS_FIELDS)
  }));

  const output = {
    symbol,
    statements,
    meta: result.meta
  };

  return FinancialsOutputSchema.parse(output);
}

export async function getIncomeStatementTool(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const parsed = FinancialsInputSchema.parse(args);
  const { symbol, frequency = 'annual', limit = DEFAULT_LIMIT } = parsed;

  InputValidator.validateSymbol(symbol);

  if (frequency) {
    InputValidator.validateString(frequency, 'frequency');
  }

  const result = await getIncomeStatement(symbol, frequency, limit, financialsToolCache);

  const statements = result.statements.map((stmt) => ({
    period: stmt.period,
    startDate: stmt.startDate,
    endDate: stmt.endDate,
    incomeStatement: Object.fromEntries(
      Object.entries(stmt).filter(([key]) => !['period', 'startDate', 'endDate'].includes(key))
    ),
    fieldAvailability: buildFieldAvailability(stmt as Record<string, number | null>, EXPECTED_IS_FIELDS)
  }));

  const output = {
    symbol,
    statements,
    meta: result.meta
  };

  return FinancialsOutputSchema.parse(output);
}

export async function getCashFlowStatementTool(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const parsed = FinancialsInputSchema.parse(args);
  const { symbol, frequency = 'annual', limit = DEFAULT_LIMIT } = parsed;

  InputValidator.validateSymbol(symbol);

  if (frequency) {
    InputValidator.validateString(frequency, 'frequency');
  }

  const result = await getCashFlowStatement(symbol, frequency, limit, financialsToolCache);

  const statements = result.statements.map((stmt) => ({
    period: stmt.period,
    startDate: stmt.startDate,
    endDate: stmt.endDate,
    cashFlowStatement: Object.fromEntries(
      Object.entries(stmt).filter(([key]) => !['period', 'startDate', 'endDate'].includes(key))
    ),
    fieldAvailability: buildFieldAvailability(stmt as Record<string, number | null>, EXPECTED_CF_FIELDS)
  }));

  const output = {
    symbol,
    statements,
    meta: result.meta
  };

  return FinancialsOutputSchema.parse(output);
}

export function getFinancialsToolDefinitions() {
  return [
    {
      name: 'get_balance_sheet',
      description: 'Retrieve balance sheet financial statements for a company including assets, liabilities, and equity data. Returns both annual and quarterly periods with field availability tracking.',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'Stock ticker symbol (e.g., AAPL, MSFT, GOOGL)',
            minLength: 1,
            maxLength: 20
          },
          frequency: {
            type: 'string',
            enum: ['annual', 'quarterly'],
            description: 'Reporting frequency (default: annual)'
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 20,
            description: 'Maximum number of periods to return (default: 4)'
          }
        },
        required: ['symbol']
      }
    },
    {
      name: 'get_income_statement',
      description: 'Retrieve income statement financial statements for a company including revenue, expenses, and earnings data. Provides EPS data and attempts fallback to quarterly if annual fails.',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'Stock ticker symbol (e.g., AAPL, MSFT, GOOGL)',
            minLength: 1,
            maxLength: 20
          },
          frequency: {
            type: 'string',
            enum: ['annual', 'quarterly'],
            description: 'Reporting frequency (default: annual)'
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 20,
            description: 'Maximum number of periods to return (default: 4)'
          }
        },
        required: ['symbol']
      }
    },
    {
      name: 'get_cash_flow_statement',
      description: 'Retrieve cash flow statement financial statements for a company including operating, investing, and financing activities. Tracks free cash flow and capital expenditures.',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'Stock ticker symbol (e.g., AAPL, MSFT, GOOGL)',
            minLength: 1,
            maxLength: 20
          },
          frequency: {
            type: 'string',
            enum: ['annual', 'quarterly'],
            description: 'Reporting frequency (default: annual)'
          },
          limit: {
            type: 'number',
            minimum: 1,
            maximum: 20,
            description: 'Maximum number of periods to return (default: 4)'
          }
        },
        required: ['symbol']
      }
    }
  ];
}

export function clearFinancialsCache(): void {
  financialsToolCache.clear();
}
