import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { QuoteTools } from '../../src/tools/quotes';
import { EarningsTools } from '../../src/tools/earnings';
import { HistoricalTools } from '../../src/tools/historical';
import { AnalysisTools } from '../../src/tools/analysis';
import { 
  getBalanceSheetTool, 
  getIncomeStatementTool, 
  getCashFlowStatementTool 
} from '../../src/tools/financials';
import { getCompanyNewsTool } from '../../src/tools/news';
import { getMajorHoldersTool } from '../../src/tools/holders';
import { getOptionsTool } from '../../src/tools/options';
import { YahooFinanceClient } from '../../src/services/yahoo-finance';
import { DataQualityReporter } from '../../src/utils/data-completion';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { defaultConfig } from '../../src/config/defaults';

describe('Real-World Yahoo Finance MCP Tests', () => {
  let yahooClient: YahooFinanceClient;
  let qualityReporter: DataQualityReporter;
  let quoteTools: QuoteTools;
  let earningsTools: EarningsTools;
  let analysisTools: AnalysisTools;
  let server: Server;

  const TEST_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META'];
  const TEST_SYMBOL = 'AAPL';

  beforeAll(async () => {
    yahooClient = new YahooFinanceClient(defaultConfig);
    qualityReporter = new DataQualityReporter(60000);
    quoteTools = new QuoteTools(yahooClient, qualityReporter);
    earningsTools = new EarningsTools(yahooClient);
    analysisTools = new AnalysisTools(yahooClient);
    server = new Server({ name: 'test-server', version: '1.0.0' }, { capabilities: {} });
    await yahooClient.initialize();
  });

  afterAll(async () => {
    if (yahooClient && typeof yahooClient.shutdown === 'function') {
      await yahooClient.shutdown();
    }
  });

  describe('Real-Time Quote Data', () => {
    it('should fetch real-time quotes for single symbol', async () => {
      const result = await quoteTools.getQuote({ symbols: [TEST_SYMBOL] });

      expect(result.results).toHaveProperty(TEST_SYMBOL);
      expect(result.summary.totalRequested).toBe(1);
      expect(result.summary.totalReturned).toBe(1);

      const quote = result.results[TEST_SYMBOL];
      expect(quote.data.regularMarketPrice).toBeDefined();
      expect(quote.data.regularMarketPrice).toBeGreaterThan(0);
      expect(quote.data.regularMarketChange).toBeDefined();
      expect(quote.data.regularMarketVolume).toBeDefined();
      expect(quote.data.regularMarketVolume).toBeGreaterThan(0);
      expect(quote.meta.completenessScore).toBeGreaterThan(0);
      expect(quote.meta.dataAge).toBeGreaterThanOrEqual(0);
    });

    it('should fetch real-time quotes for multiple symbols', async () => {
      const result = await quoteTools.getQuote({ symbols: TEST_SYMBOLS });

      expect(result.summary.totalRequested).toBe(TEST_SYMBOLS.length);
      expect(result.summary.totalReturned).toBeGreaterThan(0);
      expect(Object.keys(result.results).length).toBeGreaterThan(0);

      for (const symbol of Object.keys(result.results)) {
        const quote = result.results[symbol];
        expect(quote.data.regularMarketPrice).toBeDefined();
        expect(quote.data.regularMarketPrice).toBeGreaterThan(0);
        expect(quote.data.regularMarketVolume).toBeDefined();
      }
    });

    it('should fetch comprehensive quote with all fields', async () => {
      const result = await quoteTools.getQuote({ 
        symbols: [TEST_SYMBOL],
        forceRefresh: true 
      });

      const quote = result.results[TEST_SYMBOL];

      expect(quote.data.regularMarketPrice).toBeDefined();
      expect(quote.data.regularMarketChange).toBeDefined();
      expect(quote.data.regularMarketChangePercent).toBeDefined();
      expect(quote.data.regularMarketPreviousClose).toBeDefined();
      expect(quote.data.regularMarketOpen).toBeDefined();
      expect(quote.data.regularMarketDayRange).toBeDefined();
      expect(quote.data.regularMarketDayRange?.low).toBeDefined();
      expect(quote.data.regularMarketDayRange?.high).toBeDefined();
      expect(quote.data.fiftyTwoWeekRange).toBeDefined();
      expect(quote.data.regularMarketVolume).toBeDefined();
      expect(quote.data.marketCap).toBeDefined();
      expect(quote.data.trailingPE).toBeDefined();
      expect(quote.data.forwardPE).toBeDefined();
      expect(quote.data.beta).toBeDefined();
    });

    it('should fetch quote summary with company overview', async () => {
      const result = await quoteTools.getQuoteSummary({ 
        symbol: TEST_SYMBOL,
        retryOnFailure: true 
      });

      expect(result.symbol).toBe(TEST_SYMBOL);
      expect(result.modules).toBeDefined();
      expect(result.completenessPercentage).toBeGreaterThan(0);
      expect(result.metadata.lastSuccessfulUpdate).toBeDefined();
      expect(result.metadata.sourceReliability).toBeDefined();
      expect(result.metadata.recommendation).toBeDefined();
      expect(result.data).toBeDefined();
    });
  });

  describe('Financial Statements', () => {
    it('should fetch balance sheet data', async () => {
      const result = await getBalanceSheetTool({ 
        symbol: TEST_SYMBOL,
        frequency: 'annual',
        limit: 4
      });

      expect(result.symbol).toBe(TEST_SYMBOL);
      expect(result.statements).toBeDefined();
      expect(result.statements.length).toBeGreaterThan(0);
      expect(result.meta).toBeDefined();
      expect(result.meta.completenessScore).toBeGreaterThanOrEqual(0);
      expect(result.meta.recency).toBeDefined();

      const latestStatement = result.statements[0];
      expect(latestStatement.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(latestStatement.period).toBeDefined();
      expect(latestStatement.balanceSheet).toBeDefined();
      
      const bs = latestStatement.balanceSheet as any;
      expect(bs.totalAssets).toBeDefined();
      expect(bs.totalLiab).toBeDefined();
      expect(bs.totalStockholderEquity).toBeDefined();
      expect(latestStatement.fieldAvailability).toBeDefined();
    });

    it('should fetch income statement data', async () => {
      const result = await getIncomeStatementTool({ 
        symbol: TEST_SYMBOL,
        frequency: 'annual',
        limit: 4
      });

      expect(result.symbol).toBe(TEST_SYMBOL);
      expect(result.statements).toBeDefined();
      expect(result.statements.length).toBeGreaterThan(0);

      const latestStatement = result.statements[0];
      expect(latestStatement.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(latestStatement.incomeStatement).toBeDefined();
      
      const is = latestStatement.incomeStatement as any;
      expect(is.totalRevenue).toBeDefined();
      expect(is.netIncome).toBeDefined();
      expect(is.grossProfit).toBeDefined();
      expect(is.operatingIncome).toBeDefined();
      expect(is.epsBasic).toBeDefined();
      expect(is.epsDiluted).toBeDefined();
    });

    it('should fetch cash flow statement data', async () => {
      const result = await getCashFlowStatementTool({ 
        symbol: TEST_SYMBOL,
        frequency: 'annual',
        limit: 4
      });

      expect(result.symbol).toBe(TEST_SYMBOL);
      expect(result.statements).toBeDefined();
      expect(result.statements.length).toBeGreaterThan(0);

      const latestStatement = result.statements[0];
      expect(latestStatement.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(latestStatement.cashFlowStatement).toBeDefined();
      
      const cf = latestStatement.cashFlowStatement as any;
      expect(cf.totalCashFromOperatingActivities).toBeDefined();
      expect(cf.capitalExpenditures).toBeDefined();
      expect(cf.totalCashFromFinancingActivities).toBeDefined();
      expect(cf.totalCashFromInvestingActivities).toBeDefined();
      expect(cf.dividendsPaid).toBeDefined();
      expect(cf.changeInCash).toBeDefined();
    });

    it('should fetch quarterly financial statements', async () => {
      const result = await getIncomeStatementTool({ 
        symbol: TEST_SYMBOL,
        frequency: 'quarterly',
        limit: 4
      });

      expect(result.symbol).toBe(TEST_SYMBOL);
      expect(result.statements.length).toBeGreaterThan(0);
      expect(result.statements[0].period).toBe('quarterly');
    });
  });

  describe('Earnings Data', () => {
    it('should fetch earnings data with estimates', async () => {
      const result = await earningsTools.getEarnings({
        symbol: TEST_SYMBOL,
        limit: 8,
        includeEstimates: true
      });

      const data = JSON.parse(result.content[0].text);
      
      expect(data.symbol).toBe(TEST_SYMBOL);
      expect(data.earnings).toBeDefined();
      expect(data.meta).toBeDefined();
      expect(data.meta.completenessScore).toBeGreaterThanOrEqual(0);
      expect(data.meta.dataAge).toBeGreaterThanOrEqual(0);

      const earnings = data.earnings;
      expect(earnings.quarterly).toBeDefined();
      expect(earnings.quarterly.length).toBeGreaterThan(0);
      
      const latestQuarter = earnings.quarterly[0];
      expect(latestQuarter.date).toBeDefined();
      expect(latestQuarter.actual).toBeDefined();
      expect(latestQuarter.estimate).toBeDefined();
      expect(latestQuarter.surprisePercent).toBeDefined();
      expect(latestQuarter.surpriseDirection).toBeDefined();
      expect(latestQuarter.timing).toBeDefined();
    });

    it('should include earnings trends', async () => {
      const result = await earningsTools.getEarnings({
        symbol: TEST_SYMBOL,
        limit: 12
      });

      const data = JSON.parse(result.content[0].text);
      const earnings = data.earnings;
      
      expect(earnings.trends).toBeDefined();
      expect(earnings.earningsDate).toBeDefined();
      expect(earnings.currentQuarterEstimate).toBeDefined();
    });
  });

  describe('Historical Price Data', () => {
    it('should fetch historical prices for a date range', async () => {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);

      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];

      const result = await quoteTools.getQuote({ symbols: [TEST_SYMBOL] });

      const historicalTools = new HistoricalTools(server, yahooClient, qualityReporter);
      const historicalResult = await historicalTools.handleGetHistoricalPrices({
        symbol: TEST_SYMBOL,
        startDate: startDateStr,
        endDate: endDateStr,
        interval: '1d',
        validateData: true
      });

      const data = JSON.parse(historicalResult.content[0].text);
      
      expect(data.symbol).toBe(TEST_SYMBOL);
      expect(data.data).toBeDefined();
      expect(data.data.length).toBeGreaterThan(0);
      expect(data.meta).toBeDefined();
      expect(data.meta.completenessScore).toBeGreaterThan(0);
      expect(data.meta.integrityFlags).toBeDefined();

      const firstPrice = data.data[0];
      expect(firstPrice.date).toBeDefined();
      expect(firstPrice.open).toBeGreaterThan(0);
      expect(firstPrice.high).toBeGreaterThan(0);
      expect(firstPrice.low).toBeGreaterThan(0);
      expect(firstPrice.close).toBeGreaterThan(0);
      expect(firstPrice.volume).toBeGreaterThanOrEqual(0);
    });

    it('should fetch historical prices with different intervals', async () => {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      const startDateStr = startDate.toISOString().split('T')[0];

      const historicalTools = new HistoricalTools(server, yahooClient, qualityReporter);
      
      const intervals = ['1d', '1wk', '1mo'];
      for (const interval of intervals) {
        const result = await historicalTools.handleGetHistoricalPrices({
          symbol: TEST_SYMBOL,
          startDate: startDateStr,
          interval
        });

        const data = JSON.parse(result.content[0].text);
        expect(data.data).toBeDefined();
        expect(data.data.length).toBeGreaterThan(0);
      }
    });

    it('should validate data integrity in historical prices', async () => {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 2);
      const startDateStr = startDate.toISOString().split('T')[0];

      const historicalTools = new HistoricalTools(server, yahooClient, qualityReporter);
      const result = await historicalTools.handleGetHistoricalPrices({
        symbol: TEST_SYMBOL,
        startDate: startDateStr,
        validateData: true
      });

      const data = JSON.parse(result.content[0].text);
      
      for (const price of data.data) {
        expect(price.high).toBeGreaterThanOrEqual(price.low);
        expect(price.close).toBeGreaterThanOrEqual(price.low);
        expect(price.close).toBeLessThanOrEqual(price.high);
        expect(price.open).toBeGreaterThan(0);
        expect(price.high).toBeGreaterThan(0);
        expect(price.low).toBeGreaterThan(0);
        expect(price.close).toBeGreaterThan(0);
      }
    });
  });

  describe('Company News', () => {
    it('should fetch recent news articles', async () => {
      const result = await getCompanyNewsTool({
        symbol: TEST_SYMBOL,
        limit: 10
      });

      expect(result.symbol).toBe(TEST_SYMBOL);
      expect(result.news).toBeDefined();
      expect(result.count).toBeGreaterThan(0);
      expect(result.meta).toBeDefined();
      expect(result.meta.dataSource).toBe('Yahoo Finance');

      const firstArticle = result.news[0];
      expect(firstArticle.title).toBeDefined();
      expect(firstArticle.publisher).toBeDefined();
      expect(firstArticle.link).toBeDefined();
      expect(firstArticle.publishDate).toBeDefined();
      expect(firstArticle.urlValid).toBeDefined();
      expect(firstArticle.relatedTickers).toBeDefined();
    });

    it('should fetch news with related tickers filter', async () => {
      const result = await getCompanyNewsTool({
        symbol: TEST_SYMBOL,
        limit: 5,
        requireRelatedTickers: true
      });

      expect(result.news).toBeDefined();
      
      for (const article of result.news) {
        expect(article.relatedTickers.length).toBeGreaterThan(0);
      }
    });

    it('should include metadata about news freshness', async () => {
      const result = await getCompanyNewsTool({
        symbol: TEST_SYMBOL,
        limit: 10
      });

      expect(result.meta.lastUpdated).toBeDefined();
      expect(result.meta.completenessScore).toBeGreaterThanOrEqual(0);
      expect(result.meta.warnings).toBeDefined();
      expect(Array.isArray(result.meta.warnings)).toBe(true);
    });
  });

  describe('Analyst Analysis', () => {
    it('should fetch analyst recommendations', async () => {
      const result = await analysisTools.getAnalysis({
        symbol: TEST_SYMBOL,
        includeExpired: false
      });

      const data = JSON.parse(result.content[0].text);
      
      expect(data.symbol).toBe(TEST_SYMBOL);
      expect(data.analysis).toBeDefined();
      expect(data.meta).toBeDefined();
      expect(data.meta.completenessScore).toBeGreaterThanOrEqual(0);

      const analysis = data.analysis;
      expect(analysis.currentRatings).toBeDefined();
      expect(analysis.targetPrice).toBeDefined();
      expect(analysis.recommendationTrend).toBeDefined();
      expect(analysis.earningsTrends).toBeDefined();

      const ratings = analysis.currentRatings;
      expect(ratings.strongBuy).toBeGreaterThanOrEqual(0);
      expect(ratings.buy).toBeGreaterThanOrEqual(0);
      expect(ratings.hold).toBeGreaterThanOrEqual(0);
      expect(ratings.sell).toBeGreaterThanOrEqual(0);
      expect(ratings.strongSell).toBeGreaterThanOrEqual(0);
      expect(ratings.total).toBeGreaterThanOrEqual(0);
      expect(ratings.recommendation).toBeDefined();
    });

    it('should include target price data', async () => {
      const result = await analysisTools.getAnalysis({ symbol: TEST_SYMBOL });
      const data = JSON.parse(result.content[0].text);

      const targetPrice = data.analysis.targetPrice;
      expect(targetPrice).toBeDefined();
      expect(targetPrice.targetHigh).toBeDefined();
      expect(targetPrice.targetLow).toBeDefined();
      expect(targetPrice.targetMean).toBeDefined();
      expect(targetPrice.targetMedian).toBeDefined();
    });

    it('should include recommendation trends', async () => {
      const result = await analysisTools.getAnalysis({ symbol: TEST_SYMBOL });
      const data = JSON.parse(result.content[0].text);

      const trends = data.analysis.recommendationTrend;
      expect(trends).toBeDefined();
      expect(trends.length).toBeGreaterThan(0);

      const firstTrend = trends[0];
      expect(firstTrend.period).toBeDefined();
      expect(firstTrend.total).toBeGreaterThanOrEqual(0);
      expect(firstTrend.recommendation).toBeDefined();
    });
  });

  describe('Holder Information', () => {
    it('should fetch major holders data', async () => {
      const result = await getMajorHoldersTool({
        symbol: TEST_SYMBOL
      });

      expect(result.symbol).toBe(TEST_SYMBOL);
      expect(result.holders).toBeDefined();
      expect(result.meta).toBeDefined();
      expect(result.meta.completenessScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Options Data', () => {
    it('should fetch options chain data', async () => {
      const result = await getOptionsTool({
        symbol: TEST_SYMBOL,
        expiration: undefined
      });

      expect(result.symbol).toBe(TEST_SYMBOL);
      expect(result.options).toBeDefined();
      expect(result.meta).toBeDefined();
      expect(result.meta.completenessScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Data Quality Validation', () => {
    it('should report completeness scores for all tools', async () => {
      const quoteResult = await quoteTools.getQuote({ symbols: [TEST_SYMBOL] });
      const bsResult = await getBalanceSheetTool({ symbol: TEST_SYMBOL });
      const isResult = await getIncomeStatementTool({ symbol: TEST_SYMBOL });
      const cfResult = await getCashFlowStatementTool({ symbol: TEST_SYMBOL });

      expect(quoteResult.results[TEST_SYMBOL].meta.completenessScore).toBeGreaterThan(0);
      expect(bsResult.meta.completenessScore).toBeGreaterThan(0);
      expect(isResult.meta.completenessScore).toBeGreaterThan(0);
      expect(cfResult.meta.completenessScore).toBeGreaterThan(0);
    });

    it('should generate warnings for incomplete data', async () => {
      const quoteResult = await quoteTools.getQuote({ symbols: [TEST_SYMBOL] });
      const quote = quoteResult.results[TEST_SYMBOL];

      expect(Array.isArray(quote.meta.warnings)).toBe(true);
      expect(typeof quote.meta.completenessScore).toBe('number');
    });

    it('should track data age for all responses', async () => {
      const quoteResult = await quoteTools.getQuote({ symbols: [TEST_SYMBOL] });
      const earningsResult = await earningsTools.getEarnings({ symbol: TEST_SYMBOL });
      const analysisResult = await analysisTools.getAnalysis({ symbol: TEST_SYMBOL });

      const earningsData = JSON.parse(earningsResult.content[0].text);
      const analysisData = JSON.parse(analysisResult.content[0].text);

      expect(quoteResult.results[TEST_SYMBOL].meta.dataAge).toBeGreaterThanOrEqual(0);
      expect(earningsData.meta.dataAge).toBeGreaterThanOrEqual(0);
      expect(analysisData.meta.dataAge).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Cross-Tool Data Consistency', () => {
    it('should maintain consistent symbol format across all tools', async () => {
      const quoteResult = await quoteTools.getQuote({ symbols: [TEST_SYMBOL] });
      const bsResult = await getBalanceSheetTool({ symbol: TEST_SYMBOL });
      const newsResult = await getCompanyNewsTool({ symbol: TEST_SYMBOL });

      expect(quoteResult.results[TEST_SYMBOL]).toBeDefined();
      expect(bsResult.symbol).toBe(TEST_SYMBOL);
      expect(newsResult.symbol).toBe(TEST_SYMBOL);
    });

    it('should maintain consistent date formats', async () => {
      const bsResult = await getBalanceSheetTool({ symbol: TEST_SYMBOL });
      const isResult = await getIncomeStatementTool({ symbol: TEST_SYMBOL });

      const bsDate = bsResult.statements[0].endDate;
      const isDate = isResult.statements[0].endDate;

      expect(bsDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(isDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle rate limiting gracefully', async () => {
      const symbols = Array.from({ length: 20 }, (_, i) => `TEST${i}`);
      
      const result = await quoteTools.getQuote({ symbols });
      
      expect(result.summary).toBeDefined();
      expect(result.summary.totalRequested).toBe(20);
      expect(result.summary.totalReturned).toBeGreaterThanOrEqual(0);
    });

    it('should handle partial failures in batch requests', async () => {
      const symbols = [TEST_SYMBOL, 'INVALID_SYMBOL', 'ANOTHER_INVALID'];
      
      const result = await quoteTools.getQuote({ symbols });
      
      expect(result.summary.totalRequested).toBe(3);
      expect(result.summary.totalReturned).toBeGreaterThanOrEqual(0);
      expect(result.summary.errors).toBeDefined();
      expect(Array.isArray(result.summary.errors)).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    it('should fetch single quote within reasonable time', async () => {
      const startTime = Date.now();
      await quoteTools.getQuote({ symbols: [TEST_SYMBOL] });
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(10000);
    });

    it('should fetch multiple symbols efficiently', async () => {
      const startTime = Date.now();
      await quoteTools.getQuote({ symbols: TEST_SYMBOLS });
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(30000);
    });

    it('should fetch financial statements within reasonable time', async () => {
      const startTime = Date.now();
      await Promise.all([
        getBalanceSheetTool({ symbol: TEST_SYMBOL }),
        getIncomeStatementTool({ symbol: TEST_SYMBOL }),
        getCashFlowStatementTool({ symbol: TEST_SYMBOL })
      ]);
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(duration).toBeLessThan(30000);
    });
  });

  describe('Comprehensive Data Point Validation', () => {
    it('should validate all quote data points are fetchable', async () => {
      const result = await quoteTools.getQuote({ symbols: [TEST_SYMBOL] });
      const quote = result.results[TEST_SYMBOL].data;

      const requiredFields = [
        'regularMarketPrice',
        'regularMarketChange',
        'regularMarketChangePercent',
        'regularMarketPreviousClose',
        'regularMarketOpen',
        'regularMarketDayRange',
        'fiftyTwoWeekRange',
        'regularMarketVolume',
        'marketCap'
      ];

      for (const field of requiredFields) {
        expect(quote[field]).toBeDefined();
      }
    });

    it('should validate all balance sheet data points are fetchable', async () => {
      const result = await getBalanceSheetTool({ symbol: TEST_SYMBOL });
      const bs = result.statements[0].balanceSheet as any;

      const requiredFields = [
        'totalAssets',
        'totalLiab',
        'totalStockholderEquity',
        'cash',
        'shortTermInvestments',
        'netReceivables',
        'inventory',
        'totalCurrentAssets',
        'totalCurrentLiabilities',
        'longTermDebt'
      ];

      for (const field of requiredFields) {
        expect(bs[field]).toBeDefined();
      }
    });

    it('should validate all income statement data points are fetchable', async () => {
      const result = await getIncomeStatementTool({ symbol: TEST_SYMBOL });
      const is = result.statements[0].incomeStatement as any;

      const requiredFields = [
        'totalRevenue',
        'costOfRevenue',
        'grossProfit',
        'operatingIncome',
        'netIncome',
        'epsBasic',
        'epsDiluted'
      ];

      for (const field of requiredFields) {
        expect(is[field]).toBeDefined();
      }
    });

    it('should validate all cash flow data points are fetchable', async () => {
      const result = await getCashFlowStatementTool({ symbol: TEST_SYMBOL });
      const cf = result.statements[0].cashFlowStatement as any;

      const requiredFields = [
        'totalCashFromOperatingActivities',
        'capitalExpenditures',
        'totalCashFromFinancingActivities',
        'totalCashFromInvestingActivities',
        'dividendsPaid',
        'changeInCash'
      ];

      for (const field of requiredFields) {
        expect(cf[field]).toBeDefined();
      }
    });

    it('should validate all earnings data points are fetchable', async () => {
      const result = await earningsTools.getEarnings({ symbol: TEST_SYMBOL });
      const data = JSON.parse(result.content[0].text);
      const earnings = data.earnings;

      expect(earnings.earningsDate).toBeDefined();
      expect(earnings.currentQuarterEstimate).toBeDefined();
      expect(earnings.currentQuarterEstimateDate).toBeDefined();
      expect(earnings.quarterly).toBeDefined();
      expect(earnings.quarterly.length).toBeGreaterThan(0);
      expect(earnings.trends).toBeDefined();
    });

    it('should validate all analyst data points are fetchable', async () => {
      const result = await analysisTools.getAnalysis({ symbol: TEST_SYMBOL });
      const data = JSON.parse(result.content[0].text);
      const analysis = data.analysis;

      expect(analysis.currentRatings.strongBuy).toBeGreaterThanOrEqual(0);
      expect(analysis.currentRatings.buy).toBeGreaterThanOrEqual(0);
      expect(analysis.currentRatings.hold).toBeGreaterThanOrEqual(0);
      expect(analysis.currentRatings.sell).toBeGreaterThanOrEqual(0);
      expect(analysis.currentRatings.strongSell).toBeGreaterThanOrEqual(0);
      expect(analysis.targetPrice.targetMean).toBeDefined();
      expect(analysis.recommendationTrend).toBeDefined();
      expect(analysis.earningsTrends).toBeDefined();
    });
  });
});
