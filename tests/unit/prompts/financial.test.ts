import {
  formatQuotePrompt,
  formatHistoricalPrompt,
  formatFinancialsPrompt,
  formatEarningsPrompt,
  formatAnalysisPrompt,
  formatHoldersPrompt,
  formatNewsPrompt,
  formatOptionsPrompt,
  formatSummaryPrompt,
  formatCryptoPrompt,
  formatForexPrompt,
  formatTrendingPrompt,
  formatScreenerPrompt
} from '../../../src/prompts/financial';

describe('formatQuotePrompt', () => {
  test('should format single quote prompt', () => {
    const prompt = formatQuotePrompt('AAPL', 150.5, 2.5, 1.69);
    expect(prompt).toContain('AAPL');
    expect(prompt).toContain('150.5');
    expect(prompt).toContain('2.5');
    expect(prompt).toContain('1.69');
  });

  test('should format multiple quotes prompt', () => {
    const quotes = [
      { symbol: 'AAPL', price: 150.5, change: 2.5, changePercent: 1.69 },
      { symbol: 'MSFT', price: 300.25, change: 5.75, changePercent: 1.95 }
    ];
    const prompt = formatQuotePrompt(quotes);
    expect(prompt).toContain('AAPL');
    expect(prompt).toContain('MSFT');
  });

  test('should handle null values', () => {
    const prompt = formatQuotePrompt('AAPL', 150.5, null, null);
    expect(prompt).toContain('AAPL');
    expect(prompt).toContain('150.5');
  });

  test('should handle empty quotes array', () => {
    const prompt = formatQuotePrompt([]);
    expect(prompt).toBeDefined();
  });
});

describe('formatHistoricalPrompt', () => {
  test('should format historical prompt', () => {
    const prices = [
      { date: '2024-01-15', open: 150, high: 155, low: 148, close: 152, volume: 50000000 },
      { date: '2024-01-16', open: 152, high: 158, low: 151, close: 157, volume: 55000000 }
    ];
    const prompt = formatHistoricalPrompt('AAPL', prices, '1d');
    expect(prompt).toContain('AAPL');
    expect(prompt).toContain('2024-01-15');
    expect(prompt).toContain('1d');
  });

  test('should handle empty prices', () => {
    const prompt = formatHistoricalPrompt('AAPL', [], '1d');
    expect(prompt).toContain('AAPL');
  });

  test('should include meta information', () => {
    const prices = [{ date: '2024-01-15', open: 150, high: 155, low: 148, close: 152, volume: 50000000 }];
    const prompt = formatHistoricalPrompt('AAPL', prices, '1d', { startDate: '2024-01-01', endDate: '2024-01-31' });
    expect(prompt).toContain('2024-01-01');
    expect(prompt).toContain('2024-01-31');
  });
});

describe('formatFinancialsPrompt', () => {
  test('should format financials prompt', () => {
    const statements = [
      {
        date: '2024-01-15',
        data: {
          totalRevenue: 394328000000,
          netIncome: 99803000000
        }
      }
    ];
    const prompt = formatFinancialsPrompt('AAPL', statements, 'income-statement', 'annual');
    expect(prompt).toContain('AAPL');
    expect(prompt).toContain('income-statement');
    expect(prompt).toContain('annual');
    expect(prompt).toContain('394328000000');
  });

  test('should handle empty statements', () => {
    const prompt = formatFinancialsPrompt('AAPL', [], 'income-statement', 'annual');
    expect(prompt).toContain('AAPL');
  });

  test('should format numbers correctly', () => {
    const statements = [
      {
        date: '2024-01-15',
        data: {
          totalRevenue: 394328000000
        }
      }
    ];
    const prompt = formatFinancialsPrompt('AAPL', statements, 'income-statement', 'annual');
    expect(prompt).toContain('394');
  });
});

describe('formatEarningsPrompt', () => {
  test('should format earnings prompt', () => {
    const quarterly = [
      {
        quarter: 'Q1 2024',
        actual: 2.18,
        estimate: 2.10,
        surprise: 0.08,
        surprisePercent: 3.81
      }
    ];
    const prompt = formatEarningsPrompt('AAPL', quarterly, 2.25, 2.30);
    expect(prompt).toContain('AAPL');
    expect(prompt).toContain('Q1 2024');
    expect(prompt).toContain('2.18');
    expect(prompt).toContain('2.10');
    expect(prompt).toContain('2.25');
    expect(prompt).toContain('2.30');
  });

  test('should handle empty quarterly data', () => {
    const prompt = formatEarningsPrompt('AAPL', [], null, null);
    expect(prompt).toContain('AAPL');
  });

  test('should handle missing estimates', () => {
    const quarterly = [
      {
        quarter: 'Q1 2024',
        actual: 2.18,
        estimate: 2.10
      }
    ];
    const prompt = formatEarningsPrompt('AAPL', quarterly);
    expect(prompt).toContain('2.18');
  });
});

describe('formatAnalysisPrompt', () => {
  test('should format analysis prompt', () => {
    const analysis = {
      currentRatings: {
        strongBuy: 15,
        buy: 8,
        hold: 5,
        sell: 1,
        strongSell: 0,
        total: 29,
        recommendation: 'strong_buy'
      },
      targetPrice: {
        targetHigh: 200,
        targetLow: 150,
        targetMean: 175,
        targetMedian: 178,
        numberOfAnalysts: 30
      },
      recommendationTrend: [
        {
          period: '0m',
          strongBuy: 15,
          buy: 8,
          hold: 5,
          sell: 1,
          strongSell: 0,
          total: 29,
          recommendation: 'strong_buy'
        }
      ],
      earningsTrends: []
    };
    const prompt = formatAnalysisPrompt('AAPL', analysis);
    expect(prompt).toContain('AAPL');
    expect(prompt).toContain('strong_buy');
    expect(prompt).toContain('175');
    expect(prompt).toContain('30');
  });

  test('should handle missing data', () => {
    const prompt = formatAnalysisPrompt('AAPL', null);
    expect(prompt).toContain('AAPL');
  });
});

describe('formatHoldersPrompt', () => {
  test('should format holders prompt', () => {
    const holders = {
      majorHoldersBreakdown: {
        insidersPercentHeld: 0.05,
        institutionsPercentHeld: 0.62,
        institutionsFloatPercentHeld: 0.65,
        institutionsCount: 5000
      },
      institutionalHolders: [
        {
          holderName: 'Vanguard Group Inc',
          holderType: 'institution',
          relation: 'direct',
          lastReported: '2024-01-15',
          positionDirect: 1500000000,
          positionDirectDate: '2024-01-15',
          positionIndirect: null,
          positionIndirectDate: null,
          position: 1500000000
        }
      ],
      fundHolders: [],
      insiderHolders: [],
      directHolders: [],
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z'
      }
    };
    const prompt = formatHoldersPrompt('AAPL', holders);
    expect(prompt).toContain('AAPL');
    expect(prompt).toContain('Vanguard Group Inc');
    expect(prompt).toContain('0.62');
  });

  test('should handle empty holders', () => {
    const holders = {
      majorHoldersBreakdown: {
        insidersPercentHeld: 0,
        institutionsPercentHeld: 0,
        institutionsFloatPercentHeld: 0,
        institutionsCount: 0
      },
      institutionalHolders: [],
      fundHolders: [],
      insiderHolders: [],
      directHolders: [],
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z'
      }
    };
    const prompt = formatHoldersPrompt('AAPL', holders);
    expect(prompt).toContain('AAPL');
  });
});

describe('formatNewsPrompt', () => {
  test('should format news prompt', () => {
    const news = {
      symbol: 'AAPL',
      news: [
        {
          uuid: 'abc123',
          title: 'Apple Reports Strong Q4 Earnings',
          publisher: 'Reuters',
          link: 'https://example.com/article',
          providerPublishTime: 1705327800,
          type: 'STORY',
          publishDate: '2024-01-15',
          urlValid: true,
          relatedTickers: ['AAPL', 'MSFT']
        }
      ],
      count: 1,
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z',
        oldestArticleAge: null,
        newestArticleAge: null
      }
    };
    const prompt = formatNewsPrompt(news);
    expect(prompt).toContain('AAPL');
    expect(prompt).toContain('Apple Reports Strong Q4 Earnings');
    expect(prompt).toContain('Reuters');
  });

  test('should handle empty news', () => {
    const news = {
      symbol: 'AAPL',
      news: [],
      count: 0,
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z',
        oldestArticleAge: null,
        newestArticleAge: null
      }
    };
    const prompt = formatNewsPrompt(news);
    expect(prompt).toContain('AAPL');
  });
});

describe('formatOptionsPrompt', () => {
  test('should format options prompt', () => {
    const options = {
      symbol: 'AAPL',
      options: {
        expirationDate: '2024-02-16',
        date: 1708089600,
        hasMiniOptions: false,
        calls: [
          {
            contractSymbol: 'AAPL240216C00150000',
            strike: 150,
            lastPrice: 5.25,
            change: 0.50,
            percentChange: 10.53,
            volume: 1000,
            openInterest: 5000,
            bid: 5.00,
            ask: 5.50,
            impliedVolatility: 0.25,
            inTheMoney: true,
            contractSize: 100,
            currency: 'USD',
            delta: 0.65,
            gamma: 0.05,
            theta: -0.02,
            vega: 0.15
          }
        ],
        puts: []
      },
      expirationDates: ['2024-02-16', '2024-03-15'],
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z',
        availableExpirations: ['2024-02-16', '2024-03-15'],
        requestedExpiration: '2024-02-16',
        fallbackExpiration: false,
        ivCalculationMethod: 'black-scholes'
      }
    };
    const prompt = formatOptionsPrompt(options);
    expect(prompt).toContain('AAPL');
    expect(prompt).toContain('2024-02-16');
    expect(prompt).toContain('150');
    expect(prompt).toContain('5.25');
  });

  test('should handle empty options', () => {
    const options = {
      symbol: 'AAPL',
      options: {
        expirationDate: '2024-02-16',
        date: 1708089600,
        hasMiniOptions: false,
        calls: [],
        puts: []
      },
      expirationDates: ['2024-02-16'],
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z',
        availableExpirations: ['2024-02-16'],
        requestedExpiration: '2024-02-16',
        fallbackExpiration: false,
        ivCalculationMethod: 'black-scholes'
      }
    };
    const prompt = formatOptionsPrompt(options);
    expect(prompt).toContain('AAPL');
  });
});

describe('formatSummaryPrompt', () => {
  test('should format summary prompt', () => {
    const profile = {
      symbol: 'AAPL',
      profile: {
        assetProfile: {
          address1: 'One Apple Park Way',
          city: 'Cupertino',
          state: 'CA',
          zip: '95014',
          country: 'United States',
          phone: '408-996-1010',
          website: 'https://www.apple.com',
          industry: 'Consumer Electronics',
          sector: 'Technology',
          fullTimeEmployees: 164000,
          longBusinessSummary: 'Apple Inc. designs, manufactures, and markets smartphones...'
        }
      },
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: []
      }
    };
    const prompt = formatSummaryPrompt(profile);
    expect(prompt).toContain('AAPL');
    expect(prompt).toContain('Cupertino');
    expect(prompt).toContain('Technology');
    expect(prompt).toContain('164000');
  });

  test('should handle missing profile data', () => {
    const profile = {
      symbol: 'AAPL',
      profile: {
        assetProfile: {
          address1: 'One Apple Park Way',
          city: 'Cupertino',
          state: 'CA',
          zip: '95014',
          country: 'United States',
          phone: '408-996-1010',
          website: 'https://www.apple.com',
          industry: '',
          sector: '',
          fullTimeEmployees: 164000,
          longBusinessSummary: ''
        }
      },
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 0.5,
        warnings: ['Sector data is missing', 'Industry data is missing']
      }
    };
    const prompt = formatSummaryPrompt(profile);
    expect(prompt).toContain('AAPL');
  });
});

describe('formatCryptoPrompt', () => {
  test('should format crypto prompt', () => {
    const results = {
      'BTC-USD': {
        regularMarketPrice: 50000,
        regularMarketChange: 1000,
        regularMarketChangePercent: 2.04,
        regularMarketPreviousClose: 49000,
        regularMarketOpen: 49500,
        regularMarketDayHigh: 51000,
        regularMarketDayLow: 49000,
        regularMarketVolume: 1000000000,
        marketCap: 1000000000000,
        circulatingSupply: 20000000,
        totalVolume24Hr: 1000000000,
        volumeAllCurrencies: 1000000000,
        fromCurrency: 'BTC',
        toCurrency: 'USD',
        lastMarket: 'Yahoo Finance',
        coinImageUrl: '',
        quoteSourceName: 'Yahoo Finance',
        quoteType: 'CRYPTOCURRENCY',
        symbol: 'BTC-USD',
        shortName: 'Bitcoin',
        longName: 'Bitcoin'
      }
    };
    const summary = {
      totalRequested: 1,
      totalReturned: 1,
      fromCache: 0,
      rateLimited: false,
      errors: []
    };
    const prompt = formatCryptoPrompt(results, summary);
    expect(prompt).toContain('BTC-USD');
    expect(prompt).toContain('50000');
    expect(prompt).toContain('Bitcoin');
  });

  test('should handle empty results', () => {
    const results = {};
    const summary = {
      totalRequested: 0,
      totalReturned: 0,
      fromCache: 0,
      rateLimited: false,
      errors: []
    };
    const prompt = formatCryptoPrompt(results, summary);
    expect(prompt).toBeDefined();
  });
});

describe('formatForexPrompt', () => {
  test('should format forex prompt', () => {
    const results = {
      'EURUSD': {
        regularMarketPrice: 1.08,
        regularMarketChange: 0.01,
        regularMarketChangePercent: 0.93,
        regularMarketPreviousClose: 1.07,
        regularMarketOpen: 1.07,
        regularMarketDayHigh: 1.09,
        regularMarketDayLow: 1.07,
        regularMarketVolume: 1000000,
        fromCurrency: 'EUR',
        toCurrency: 'USD',
        lastMarket: 'Yahoo Finance',
        quoteSourceName: 'Yahoo Finance',
        quoteType: 'CURRENCY',
        symbol: 'EURUSD',
        shortName: 'EUR/USD',
        longName: 'EUR/USD'
      }
    };
    const summary = {
      totalRequested: 1,
      totalReturned: 1,
      fromCache: 0,
      rateLimited: false,
      errors: []
    };
    const prompt = formatForexPrompt(results, summary);
    expect(prompt).toContain('EURUSD');
    expect(prompt).toContain('1.08');
  });

  test('should handle empty results', () => {
    const results = {};
    const summary = {
      totalRequested: 0,
      totalReturned: 0,
      fromCache: 0,
      rateLimited: false,
      errors: []
    };
    const prompt = formatForexPrompt(results, summary);
    expect(prompt).toBeDefined();
  });
});

describe('formatTrendingPrompt', () => {
  test('should format trending prompt', () => {
    const trending = {
      quotes: [
        { symbol: 'AAPL', name: 'Apple Inc.' },
        { symbol: 'MSFT', name: 'Microsoft Corporation' }
      ]
    };
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: 100,
      warnings: []
    };
    const prompt = formatTrendingPrompt(trending, meta);
    expect(prompt).toContain('AAPL');
    expect(prompt).toContain('MSFT');
  });

  test('should handle empty trending', () => {
    const trending = {
      quotes: []
    };
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: 0,
      warnings: ['No trending symbols returned']
    };
    const prompt = formatTrendingPrompt(trending, meta);
    expect(prompt).toBeDefined();
  });
});

describe('formatScreenerPrompt', () => {
  test('should format screener prompt', () => {
    const screened = {
      finance: {
        result: [
          {
            quotes: [
              { symbol: 'AAPL', lastPrice: 150, volume: 50000000, marketCap: 2500000000000 },
              { symbol: 'MSFT', lastPrice: 300, volume: 30000000, marketCap: 2800000000000 }
            ]
          }
        ]
      }
    };
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: 100,
      warnings: []
    };
    const prompt = formatScreenerPrompt(screened, meta, { sector: 'Technology' });
    expect(prompt).toContain('AAPL');
    expect(prompt).toContain('MSFT');
    expect(prompt).toContain('Technology');
  });

  test('should handle empty results', () => {
    const screened = {
      finance: {
        result: [
          {
            quotes: []
          }
        ]
      }
    };
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: 0,
      warnings: []
    };
    const prompt = formatScreenerPrompt(screened, meta, {});
    expect(prompt).toBeDefined();
  });
});
