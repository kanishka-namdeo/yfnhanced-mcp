export const mockQuoteResponse = {
  quoteResponse: {
    result: [
      {
        meta: {
          currency: 'USD',
          symbol: 'AAPL',
          exchangeName: 'NMS',
          instrumentType: 'EQUITY',
          firstTradeDate: 345479400,
          regularMarketTime: 1703875200,
          gmtoffset: -18000,
          timezone: 'EST',
          exchangeTimezoneName: 'America/New_York',
          regularMarketPrice: 185.92,
      chartPreviousClose: 184.35,
      priceHint: 2,
      currentTradingPeriod: {
        pre: {
          timezone: 'EST',
          start: 1703853600,
          end: 1703871600,
          gmtoffset: -18000
        },
        regular: {
          timezone: 'EST',
          start: 1703871600,
          end: 1703896800,
          gmtoffset: -18000
        },
        post: {
          timezone: 'EST',
          start: 1703896800,
          end: 1703909200,
          gmtoffset: -18000
        }
      },
      dataGranularity: '1d',
      range: '1d',
      validRanges: ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max']
    },
    price: {
      maxAge: 1,
      preMarketChangePercent: -0.074488,
      preMarketChange: -0.138,
      preMarketTime: 1703878745,
      preMarketPrice: 185.782,
      regularMarketChangePercent: 0.852,
      regularMarketChange: 1.57,
      regularMarketTime: 1703875200,
      priceHint: 2,
      regularMarketPrice: 185.92,
      regularMarketDayHigh: 186.67,
      regularMarketDayLow: 184.22,
      regularMarketVolume: 44981879,
      fiftyTwoWeekHigh: 199.62,
      fiftyTwoWeekLow: 124.17,
      fiftyDayAverage: 176.7224,
      twoHundredDayAverage: 172.9598,
      marketCap: 2898258160640,
      forwardPE: 28.316698,
      trailingPE: 29.844543,
      epsTrailingTwelveMonths: 6.23,
      epsForward: 6.57,
      bookValue: 62.5,
      fiftyDayAverageChange: 9.1976,
      fiftyDayAverageChangePercent: 5.2046986,
      twoHundredDayAverageChange: 12.960197,
      twoHundredDayAverageChangePercent: 7.493733,
      marketCapChange: 24450150400,
      marketCapChangePercent: 0.848,
      symbol: 'AAPL'
    }
  }
  }
};

export const mockQuoteSummaryResponse = {
  price: {
    maxAge: 1,
    regularMarketChangePercent: 0.852,
    regularMarketChange: 1.57,
    regularMarketTime: 1703875200,
    priceHint: 2,
    regularMarketPrice: 185.92,
    regularMarketDayHigh: 186.67,
    regularMarketDayLow: 184.22,
    regularMarketVolume: 44981879,
    fiftyTwoWeekHigh: 199.62,
    fiftyTwoWeekLow: 124.17,
    marketCap: 2898258160640,
    forwardPE: 28.316698,
    trailingPE: 29.844543,
    epsTrailingTwelveMonths: 6.23,
    epsForward: 6.57
  },
  summaryDetail: {
    maxAge: 1,
    priceHint: 2,
    previousClose: 184.35,
    open: 185.25,
    dayLow: 184.22,
    dayHigh: 186.67,
    regularMarketOpen: 185.25,
    regularMarketDayLow: 184.22,
    regularMarketDayHigh: 186.67,
    fiftyTwoWeekLow: 124.17,
    fiftyTwoWeekHigh: 199.62,
    dividendRate: 0.96,
    dividendYield: 0.51599997,
    exDividendDate: 1699075200,
    payoutRatio: 15.4,
    beta: 1.292,
    trailingPE: 29.844543,
    forwardPE: 28.316698,
    volume: 44981879,
    averageVolume: 51658790,
    averageVolume10days: 48402710,
    averageDailyVolume3Month: 51658790,
    marketCap: 2898258160640,
    fiftyDayAverage: 176.7224,
    twoHundredDayAverage: 172.9598
  },
  defaultKeyStatistics: {
    maxAge: 1,
    priceHint: 2,
    enterpriseValue: 2847302142976,
    trailingPE: 29.844543,
    forwardPE: 28.316698,
    pegRatio: 3.01,
    priceSales: 7.454,
    priceBook: 4.636,
    enterpriseToRevenue: 7.329,
    enterpriseToEbitda: 20.459,
    beta: 1.292,
    fiftyTwoWeekLowChange: 61.75,
    fiftyTwoWeekLowChangePercent: 49.729,
    fiftyTwoWeekRange: '124.17 - 199.62',
    fiftyTwoWeekHighChange: -13.699997,
    fiftyTwoWeekHighChangePercent: -0.0686,
    sharesOutstanding: 15585999616,
    floatShares: 15585999616,
    sharesShort: 94726291,
    sharesShortPriorMonth: 84775665,
    sharesPercentSharesOut: 0.0061,
  },
  financialData: {
    maxAge: 1,
    totalCash: 62155000000,
    totalCashPerShare: 3.987,
    ebitda: 139254998400,
    totalDebt: 111113000000,
    quickRatio: 0.825,
    currentRatio: 0.984,
    totalRevenue: 385695001600,
    revenuePerShare: 24.749,
    returnOnAssets: 0.23354,
    returnOnEquity: 1.47889,
    freeCashflow: 99584998400,
    operatingCashflow: 110543997952,
  }
};

export const mockEarningsResponse = {
  earnings: {
    earningsChart: {
      quarterly: [
        {
          date: '2023Q4',
          actual: {
            raw: 2.18,
            fmt: '2.18'
          },
          estimate: {
            raw: 2.17,
            fmt: '2.17'
          }
        },
        {
          date: '2023Q3',
          actual: {
            raw: 1.46,
            fmt: '1.46'
          },
          estimate: {
            raw: 1.39,
            fmt: '1.39'
          }
        },
        {
          date: '2023Q2',
          actual: {
            raw: 1.26,
            fmt: '1.26'
          },
          estimate: {
            raw: 1.19,
            fmt: '1.19'
          }
        }
      ]
    },
    financialsChart: {
      yearly: [
        {
          date: '2023',
          revenue: {
            raw: 385695001600,
            fmt: '385.69B'
          },
          earnings: {
            raw: 96994997248,
            fmt: '96.99B'
          }
        },
        {
          date: '2022',
          revenue: {
            raw: 394328003072,
            fmt: '394.33B'
          },
          earnings: {
            raw: 99803001344,
            fmt: '99.80B'
          }
        }
      ]
    }
  }
};

export const mockAnalysisResponse = {
  financialsChart: {
    yearly: [
      {
        date: '2023',
        revenue: {
          raw: 385695001600,
          fmt: '385.69B'
        },
        earnings: {
          raw: 96994997248,
          fmt: '96.99B'
        }
      }
    ],
    quarterly: [
      {
        date: '2023Q4',
        revenue: {
          raw: 119575001600,
          fmt: '119.58B'
        },
        earnings: {
          raw: 33916000512,
          fmt: '33.92B'
        }
      }
    ]
  },
  earningsTrend: {
    trend: [
      {
        period: '0q',
        growth: 12.5,
        estimates: [
          {
            name: 'Low Estimate',
            value: 1.3,
            fmt: '1.30'
          },
          {
            name: 'High Estimate',
            value: 1.6,
            fmt: '1.60'
          },
          {
            name: 'Mean Estimate',
            value: 1.46,
            fmt: '1.46'
          }
        ]
      }
    ]
  },
  recommendationTrend: {
    trend: [
      {
        period: '0m',
        strongBuy: 28,
        buy: 18,
        hold: 8,
        sell: 0,
        strongSell: 0
      }
    ]
  }
};

export const mockHoldersResponse = {
  majorHoldersBreakdown: {
    insidersPercentHeld: 0.07,
    institutionsPercentHeld: 59.2,
    institutionsCount: 5236
  },
  institutionOwnership: {
    maxAge: 1,
    ownershipList: [
      {
        organization: 'Vanguard Group Inc',
        reportDate: 1700640000,
        held: {
          shares: 1573997568,
          value: 292760993792,
          pctReport: 10.11,
          pctOut: 10.1
        },
        pctHeld: 10.11,
        position: 0
      },
      {
        organization: 'BlackRock Inc.',
        reportDate: 1700640000,
        held: {
          shares: 1423939712,
          value: 264830603264,
          pctReport: 9.14,
          pctOut: 9.13
        },
        pctHeld: 9.14,
        position: 1
      }
    ]
  }
};

export const mockNewsResponse = {
  count: 10,
  itemsResult: {
    items: [
      {
        id: 'uuid-1',
        title: 'Apple Stock Hits New High',
        link: 'https://example.com/article1',
        publisher: 'Reuters',
        providerPublishTime: 1703875200,
        type: 'STORY',
        thumbnail: {
          resolutions: [
            {
              label: 'Small',
              width: 140,
              height: 80,
              url: 'https://example.com/image1-small.jpg'
            }
          ]
        }
      },
      {
        id: 'uuid-2',
        title: 'Tech Sector Rally Continues',
        link: 'https://example.com/article2',
        publisher: 'Bloomberg',
        providerPublishTime: 1703871600,
        type: 'STORY'
      }
    ]
  }
};

export const mockOptionsResponse = {
  expirationDates: [1703896800, 1703983200, 1704069600],
  options: [
    {
      expirationDate: 1703896800,
      hasMiniOptions: true,
      calls: [
        {
          strike: 180,
          lastPrice: 6.5,
          bid: 6.4,
          ask: 6.6,
          change: 0.3,
          percentChange: 4.84,
          volume: 1250,
          openInterest: 5432,
          impliedVolatility: 0.32,
          inTheMoney: true,
          currency: 'USD'
        },
        {
          strike: 185,
          lastPrice: 3.2,
          bid: 3.15,
          ask: 3.25,
          change: 0.15,
          percentChange: 4.92,
          volume: 2341,
          openInterest: 8765,
          impliedVolatility: 0.28,
          inTheMoney: true,
          currency: 'USD'
        }
      ],
      puts: [
        {
          strike: 180,
          lastPrice: 0.95,
          bid: 0.92,
          ask: 0.98,
          change: -0.05,
          percentChange: -5.0,
          volume: 3456,
          openInterest: 6789,
          impliedVolatility: 0.35,
          inTheMoney: false,
          currency: 'USD'
        }
      ]
    }
  ]
};

export const mockBalanceSheetResponse = {
  balanceSheetHistory: {
    balanceSheetStatements: [
      {
        maxAge: 1,
        endDate: {
          fmt: '2023-09-30',
          raw: 1696032000
        },
        totalAssets: {
          fmt: '352.58B',
          raw: 352583003136
        },
        totalLiab: {
          fmt: '290.44B',
          raw: 290436004864
        },
        totalStockholderEquity: {
          fmt: '62.15B',
          raw: 62147001856
        },
        cash: {
          fmt: '29.96B',
          raw: 29962000896
        },
        shortTermInvestments: {
          fmt: '31.75B',
          raw: 31754999296
        },
        netReceivables: {
          fmt: '29.51B',
          raw: 29509000448
        },
        inventory: {
          fmt: '6.35B',
          raw: 6350000000
        }
      }
    ]
  }
};

export const mockIncomeStatementResponse = {
  incomeStatementHistory: {
    incomeStatementHistory: [
      {
        maxAge: 1,
        endDate: {
          fmt: '2023-09-30',
          raw: 1696032000
        },
        totalRevenue: {
          fmt: '383.29B',
          raw: 383285996544
        },
        costOfRevenue: {
          fmt: '243.14B',
          raw: 243139998720
        },
        grossProfit: {
          fmt: '140.15B',
          raw: 140145997824
        },
        operatingIncome: {
          fmt: '114.30B',
          raw: 114304995072
        },
        ebit: {
          fmt: '114.30B',
          raw: 114304995072
        },
        netIncome: {
          fmt: '96.99B',
          raw: 96994997248
        }
      }
    ]
  }
};

export const mockCashFlowStatementResponse = {
  cashflowStatementHistory: {
    cashflowStatements: [
      {
        maxAge: 1,
        endDate: {
          fmt: '2023-09-30',
          raw: 1696032000
        },
        netIncome: {
          fmt: '96.99B',
          raw: 96994997248
        },
        depreciation: {
          fmt: '11.10B',
          raw: 11100000000
        },
        operatingCashflow: {
          fmt: '110.54B',
          raw: 110543997952
        },
        capitalExpenditures: {
          fmt: '-10.91B',
          raw: -10909000000
        },
        freeCashflow: {
          fmt: '99.63B',
          raw: 99634999296
        }
      }
    ]
  }
};

export const mockHistoricalResponse = {
  chart: {
    result: [
      {
        meta: {
          currency: 'USD',
          symbol: 'AAPL',
          exchangeName: 'NMS',
          instrumentType: 'EQUITY',
          firstTradeDate: 345479400,
          regularMarketTime: 1703875200,
          gmtoffset: -18000,
          timezone: 'EST',
          exchangeTimezoneName: 'America/New_York',
          regularMarketPrice: 185.92,
          chartPreviousClose: 184.35
        },
        timestamp: [1703702400, 1703788800],
        indicators: {
          quote: [
            {
              open: [182.45, 185.25],
              high: [184.89, 186.67],
              low: [181.22, 184.22],
              close: [184.35, 185.92],
              volume: [48215632, 44981879]
            }
          ],
          adjclose: [
            {
              adjclose: [184.35, 185.92]
            }
          ]
        }
      }
    ]
  }
};

export const mockSummaryProfileResponse = {
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
    longBusinessSummary: 'Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide.',
    fullTimeEmployees: 164000,
    companyOfficers: [
      {
        maxAge: 1,
        name: 'Mr. Timothy D. Cook',
        age: 62,
        title: 'CEO & Director',
        yearBorn: 1960,
        fiscalYear: 2023,
        totalPay: {
          raw: 63277854,
          fmt: '63.28M'
        },
        exercisedValue: {
          raw: 0,
          fmt: '0'
        },
        unexercisedValue: {
          raw: 0,
          fmt: '0'
        }
      }
    ]
  }
};

export const mockCryptoQuoteResponse = {
  chart: {
    result: [
      {
        meta: {
          currency: 'USD',
          symbol: 'BTC-USD',
          exchangeName: 'CCC',
          instrumentType: 'CRYPTOCURRENCY',
          firstTradeDate: 1410912000,
          regularMarketTime: 1703875200,
          gmtoffset: 0,
          timezone: 'UTC',
          exchangeTimezoneName: 'UTC',
          regularMarketPrice: 43250.75,
          chartPreviousClose: 42890.20
        },
        timestamp: [1703702400, 1703788800],
        indicators: {
          quote: [
            {
              open: [42890.20, 43120.50],
              high: [43550.80, 43890.25],
              low: [42650.30, 42980.45],
              close: [43250.75, 43680.90],
              volume: [1234567890, 1156789012]
            }
          ]
        }
      }
    ]
  }
};

export const mockForexQuoteResponse = {
  chart: {
    result: [
      {
        meta: {
          currency: 'USD',
          symbol: 'EURUSD=X',
          exchangeName: 'CCY',
          instrumentType: 'CURRENCY',
          firstTradeDate: 1072915200,
          regularMarketTime: 1703875200,
          gmtoffset: 0,
          timezone: 'UTC',
          exchangeTimezoneName: 'UTC',
          regularMarketPrice: 1.0945,
          chartPreviousClose: 1.0928
        },
        timestamp: [1703702400, 1703788800],
        indicators: {
          quote: [
            {
              open: [1.0928, 1.0935],
              high: [1.0952, 1.0968],
              low: [1.0915, 1.0922],
              close: [1.0945, 1.0951],
              volume: [0, 0]
            }
          ]
        }
      }
    ]
  }
};

export const mockTrendingResponse = {
  finance: {
    result: [
      {
        quotes: [
          {
            symbol: 'NVDA',
            shortName: 'NVIDIA Corporation',
            regularMarketPrice: 495.22,
            regularMarketChangePercent: 3.45
          },
          {
            symbol: 'MSFT',
            shortName: 'Microsoft Corporation',
            regularMarketPrice: 374.55,
            regularMarketChangePercent: 1.23
          },
          {
            symbol: 'AAPL',
            shortName: 'Apple Inc.',
            regularMarketPrice: 185.92,
            regularMarketChangePercent: 0.85
          }
        ]
      }
    ]
  }
};

export const mockScreenerResponse = {
  finance: {
    result: [
      {
        quotes: [
          {
            symbol: 'AAPL',
            shortName: 'Apple Inc.',
            regularMarketPrice: 185.92,
            marketCap: 2898258160640,
            trailingPE: 29.84
          },
          {
            symbol: 'MSFT',
            shortName: 'Microsoft Corporation',
            regularMarketPrice: 374.55,
            marketCap: 2776580423680,
            trailingPE: 35.12
          },
          {
            symbol: 'GOOGL',
            shortName: 'Alphabet Inc.',
            regularMarketPrice: 141.80,
            marketCap: 1778598006784,
            trailingPE: 24.56
          }
        ]
      }
    ]
  }
};

export const errorResponses = {
  rateLimit: {
    error: {
      code: 'Too Many Requests',
      description: 'Rate limit exceeded'
    }
  },
  notFound: {
    error: {
      code: 'Not Found',
      description: 'Symbol not found'
    }
  },
  serverError: {
    error: {
      code: 'Internal Server Error',
      description: 'An error occurred while processing your request'
    }
  },
  timeout: {
    error: {
      code: 'Request Timeout',
      description: 'Request timed out'
    }
  },
  unauthorized: {
    error: {
      code: 'Unauthorized',
      description: 'Authentication required'
    }
  }
};
