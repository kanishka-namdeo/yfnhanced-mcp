export type PriceData = {
  regularMarketPrice: number | null;
  regularMarketChange: number | null;
  regularMarketChangePercent: number | null;
  regularMarketPreviousClose: number | null;
  regularMarketOpen: number | null;
  regularMarketDayHigh: number | null;
  regularMarketDayLow: number | null;
  regularMarketVolume: number | null;
  marketCap: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  averageDailyVolume3Month: number | null;
  averageDailyVolume10Day: number | null;
  currency: string | null;
  marketState: string | null;
  quoteType: string | null;
  symbol: string;
  shortName: string | null;
  longName: string | null;
  exchange: string | null;
  exchangeTimezoneName: string | null;
  exchangeTimezoneShortName: string | null;
  gmtOffSetMilliseconds: number | null;
  preMarketPrice: number | null;
  preMarketChange: number | null;
  preMarketChangePercent: number | null;
  preMarketTime: number | null;
  postMarketPrice: number | null;
  postMarketChange: number | null;
  postMarketChangePercent: number | null;
  postMarketTime: number | null;
};

export type QuoteResult = {
  price: PriceData;
  meta?: {
    currency: string;
    symbol: string;
    exchangeName: string;
    instrumentType: string;
    firstTradeDate: number;
    regularMarketTime: number;
    gmtoffset: number;
    timezone: string;
    exchangeTimezoneName: string;
    regularMarketPrice: number;
    chartPreviousClose: number;
    priceHint: number;
    currentTradingPeriod: {
      pre: {
        timezone: string;
        start: number;
        end: number;
        gmtoffset: number;
      };
      regular: {
        timezone: string;
        start: number;
        end: number;
        gmtoffset: number;
      };
      post: {
        timezone: string;
        start: number;
        end: number;
        gmtoffset: number;
      };
    };
    dataGranularity: string;
    range: string;
    validRanges: string[];
  };
};

export type HistoricalPriceData = {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
  [key: string]: number | string | Date;
};

export type HistoricalPriceMeta = {
  currency: string;
  symbol: string;
  exchangeName: string;
  instrumentType: string;
  firstTradeDate: number;
  regularMarketTime: number;
  gmtoffset: number;
  timezone: string;
  exchangeTimezoneName: string;
  regularMarketPrice: number;
  chartPreviousClose: number;
  priceHint: number;
  currentTradingPeriod: {
    pre: {
      timezone: string;
      start: number;
      end: number;
      gmtoffset: number;
    };
    regular: {
      timezone: string;
      start: number;
      end: number;
      gmtoffset: number;
    };
    post: {
      timezone: string;
      start: number;
      end: number;
      gmtoffset: number;
    };
  };
  dataGranularity: string;
  range: string;
  validRanges: string[];
};

export type HistoricalPriceResult = {
  meta: HistoricalPriceMeta;
  timestamps: number[];
  indicators: {
    quote: Array<{
      open: Array<number | null>;
      high: Array<number | null>;
      low: Array<number | null>;
      close: Array<number | null>;
      volume: Array<number | null>;
    }>;
    adjclose: Array<{
      adjclose: Array<number | null>;
    }>;
  };
};

export type FinancialStatementItem = {
  maxAge: number;
  trailingPegRatio: number | null;
};

export type IncomeStatement = {
  maxAge: number;
  quarterly: Array<{
    endDate: {
      fmt: string;
      raw: number;
    };
    totalRevenue: {
      fmt: string;
      raw: number;
    };
    costOfRevenue: {
      fmt: string;
      raw: number;
    };
    grossProfit: {
      fmt: string;
      raw: number;
    };
    operatingIncome: {
      fmt: string;
      raw: number;
    };
    netIncome: {
      fmt: string;
      raw: number;
    };
    [key: string]: unknown;
  }>;
  annual: Array<{
    endDate: {
      fmt: string;
      raw: number;
    };
    totalRevenue: {
      fmt: string;
      raw: number;
    };
    costOfRevenue: {
      fmt: string;
      raw: number;
    };
    grossProfit: {
      fmt: string;
      raw: number;
    };
    operatingIncome: {
      fmt: string;
      raw: number;
    };
    netIncome: {
      fmt: string;
      raw: number;
    };
    [key: string]: unknown;
  }>;
};

export type BalanceSheet = {
  maxAge: number;
  quarterly: Array<{
    endDate: {
      fmt: string;
      raw: number;
    };
    totalAssets: {
      fmt: string;
      raw: number;
    };
    totalLiab: {
      fmt: string;
      raw: number;
    };
    totalStockholderEquity: {
      fmt: string;
      raw: number;
    };
    [key: string]: unknown;
  }>;
  annual: Array<{
    endDate: {
      fmt: string;
      raw: number;
    };
    totalAssets: {
      fmt: string;
      raw: number;
    };
    totalLiab: {
      fmt: string;
      raw: number;
    };
    totalStockholderEquity: {
      fmt: string;
      raw: number;
    };
    [key: string]: unknown;
  }>;
};

export type CashFlowStatement = {
  maxAge: number;
  quarterly: Array<{
    endDate: {
      fmt: string;
      raw: number;
    };
    totalCashFromOperatingActivities: {
      fmt: string;
      raw: number;
    };
    capitalExpenditures: {
      fmt: string;
      raw: number;
    };
    totalCashFromFinancingActivities: {
      fmt: string;
      raw: number;
    };
    [key: string]: unknown;
  }>;
  annual: Array<{
    endDate: {
      fmt: string;
      raw: number;
    };
    totalCashFromOperatingActivities: {
      fmt: string;
      raw: number;
    };
    capitalExpenditures: {
      fmt: string;
      raw: number;
    };
    totalCashFromFinancingActivities: {
      fmt: string;
      raw: number;
    };
    [key: string]: unknown;
  }>;
};

export type FinancialStatementResult = {
  incomeStatementHistory: IncomeStatement;
  balanceSheetHistory: BalanceSheet;
  cashflowStatementHistory: CashFlowStatement;
  incomeStatementHistoryQuarterly: IncomeStatement;
  balanceSheetHistoryQuarterly: BalanceSheet;
  cashflowStatementHistoryQuarterly: CashFlowStatement;
};

export type EarningsEstimate = {
  avg: number;
  low: number;
  high: number;
  yearAgoEps: number;
  numberOfAnalysts: number;
  growth: number;
};

export type EarningsTrend = {
  period: string;
  endDate: {
    fmt: string;
    raw: number;
  };
  growth: number;
  earningsEstimate: EarningsEstimate;
  revenueEstimate: {
    avg: number;
    low: number;
    high: number;
    numberOfAnalysts: number;
    yearAgoRevenue: number;
    growth: number;
  };
  epsTrend: {
    current: number;
    '7daysAgo': number;
    '30daysAgo': number;
    '60daysAgo': number;
    '90daysAgo': number;
  };
  epsRevisions: {
    upLast7days: number;
    upLast30days: number;
    downLast7days: number;
    downLast30days: number;
  };
};

export type EarningsChart = {
  currentQuarterEstimate: number;
  currentQuarterEstimateDate: {
    fmt: string;
    raw: number;
  };
  currentQuarterEstimateYearAgo: number;
  earningsDate: {
    date: string;
  };
  quarterly: Array<{
    date: string;
    estimate: number;
    actual: number | null;
  }>;
};

export type EarningsResult = {
  earningsChart: EarningsChart;
  financialsChart: {
    yearly: Array<{
      date: string;
      revenue: number;
      earnings: number;
    }>;
    quarterly: Array<{
      date: string;
      revenue: number;
      earnings: number;
    }>;
  };
  earningsTrend: EarningsTrend[];
  industryTrend: Array<{
    name: string;
    estimates: Array<{
      period: string;
      estimate: number;
      actual: number | null;
    }>;
  }>;
};

export type AnalystRecommendation = {
  period: string;
  strongBuy: number;
  buy: number;
  hold: number;
  sell: number;
  strongSell: number;
};

export type AnalystOpinion = {
  companyName: string;
  currentRatings: {
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
  };
  currentOpinion: string;
  targetPrice: number;
  recommendationKey: string;
};

export type AnalysisResult = {
  earningsTrend: EarningsTrend[];
  industryTrend: Array<{
    name: string;
    estimates: Array<{
      period: string;
      estimate: number;
      actual: number | null;
    }>;
  }>;
  analystOpinion: {
    companyName: string;
    currentRatings: {
      strongBuy: number;
      buy: number;
      hold: number;
      sell: number;
      strongSell: number;
    };
    currentOpinion: string;
    targetPrice: number;
    recommendationKey: string;
  };
  recommendationTrend: {
    trend: AnalystRecommendation[];
    maxAge: number;
  };
};

export type Holder = {
  holderName: string;
  holderType: 'company' | 'individual' | 'institution';
  relation: 'direct' | 'indirect';
  lastReported: {
    fmt: string;
    raw: number;
  };
  positionDirect: {
    fmt: string;
    raw: number;
  };
  positionDirectDate: {
    fmt: string;
    raw: number;
  };
  positionIndirect: {
    fmt: string;
    raw: number;
  };
  positionIndirectDate: {
    fmt: string;
    raw: number;
  };
  position: {
    fmt: string;
    raw: number;
  };
  [key: string]: unknown;
};

export type InstitutionalHolder = {
  holderName: string;
  holderType: string;
  lastReported: {
    fmt: string;
    raw: number;
  };
  position: {
    fmt: string;
    raw: number;
  };
  value: {
    fmt: string;
    raw: number;
  };
  pctHeld: {
    fmt: string;
    raw: number;
  };
  [key: string]: unknown;
};

export type FundHolder = {
  holderName: string;
  lastReported: {
    fmt: string;
    raw: number;
  };
  position: {
    fmt: string;
    raw: number;
  };
  value: {
    fmt: string;
    raw: number;
  };
  pctHeld: {
    fmt: string;
    raw: number;
  };
  [key: string]: unknown;
};

export type InsiderHolder = {
  maxAge: number;
  holders: Array<{
    name: string;
    relation: {
      latestTransaction: {
        maxAge: number;
        shares: number;
        filerUrl: string;
        transactionDate: number;
        positionDirect: number;
        positionIndirect: number;
        title: string;
      };
      transaction: Array<{
        shares: number;
        filerUrl: string;
        transactionDate: number;
        positionDirect: number;
        positionIndirect: number;
        title: string;
      }>;
    };
    [key: string]: unknown;
  }>;
};

export type HolderResult = {
  majorHoldersBreakdown: {
    maxAge: number;
    insidersPercentHeld: number;
    institutionsPercentHeld: number;
    institutionsFloatPercentHeld: number;
    institutionsCount: number;
  };
  institutionalHolders: {
    holders: InstitutionalHolder[];
    maxAge: number;
  };
  fundHolders: {
    holders: FundHolder[];
    maxAge: number;
  };
  insiderHolders: InsiderHolder;
  directHolders: {
    holders: Holder[];
    maxAge: number;
  };
};

export type NewsItem = {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  providerPublishTime: number;
  type: string;
  thumbnail?: {
    resolutions: Array<{
      url: string;
      width: number;
      height: number;
      tag: string;
    }>;
  };
  relatedTickers: string[];
};

export type NewsResult = {
  count: number;
  news: NewsItem[];
};

export type OptionsExpiration = {
  date: number;
  expirationDate: number;
  hasMiniOptions: boolean;
  calls: Array<{
    contractSymbol: string;
    strike: number;
    lastPrice: number;
    change: number;
    percentChange: number;
    volume: number;
    openInterest: number;
    bid: number;
    ask: number;
    impliedVolatility: number;
    inTheMoney: boolean;
    contractSize: number;
    currency: string;
  }>;
  puts: Array<{
    contractSymbol: string;
    strike: number;
    lastPrice: number;
    change: number;
    percentChange: number;
    volume: number;
    openInterest: number;
    bid: number;
    ask: number;
    impliedVolatility: number;
    inTheMoney: boolean;
    contractSize: number;
    currency: string;
  }>;
};

export type OptionsResult = {
  expirationDates: number[];
  options: OptionsExpiration[];
  quote: PriceData;
};

export type SummaryProfile = {
  address1: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string;
  website: string;
  industry: string;
  sector: string;
  longBusinessSummary: string;
  fullTimeEmployees: number;
  companyOfficers: Array<{
    maxAge: number;
    name: {
      prefix: string;
      firstName: string;
      middleName: string;
      lastName: string;
      suffix: string;
    };
    age: number;
    title: Array<{
      long: string;
      short: string;
    }>;
    yearBorn: number;
    totalPay: {
      raw: number;
      fmt: string;
      longFmt: string;
    };
    exercisedValue: {
      raw: number;
      fmt: string;
      longFmt: string;
    };
    unexercisedValue: {
      raw: number;
      fmt: string;
      longFmt: string;
    };
  }>;
  maxAge: number;
};

export type SummaryProfileResult = {
  assetProfile: SummaryProfile;
};

export type CryptoQuote = {
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketPreviousClose: number;
  regularMarketOpen: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketVolume: number;
  marketCap: number;
  circulatingSupply: number;
  totalVolume24Hr: number;
  volumeAllCurrencies: number;
  fromCurrency: string;
  toCurrency: string;
  lastMarket: string;
  coinImageUrl: string;
};

export type CryptoQuoteResult = {
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketPreviousClose: number;
  regularMarketOpen: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketVolume: number;
  marketCap: number;
  circulatingSupply: number;
  totalVolume24Hr: number;
  volumeAllCurrencies: number;
  fromCurrency: string;
  toCurrency: string;
  lastMarket: string;
  coinImageUrl: string;
  quoteSourceName: string;
  quoteType: string;
  symbol: string;
  shortName: string;
  longName: string;
};

export type ForexQuote = {
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketPreviousClose: number;
  regularMarketOpen: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketVolume: number;
  fromCurrency: string;
  toCurrency: string;
  lastMarket: string;
};

export type ForexQuoteResult = {
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketPreviousClose: number;
  regularMarketOpen: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketVolume: number;
  fromCurrency: string;
  toCurrency: string;
  lastMarket: string;
  quoteSourceName: string;
  quoteType: string;
  symbol: string;
  shortName: string;
  longName: string;
};

export type TrendingQuote = {
  symbol: string;
  name: string;
  lastPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  type: string;
};

export type TrendingResult = {
  quotes: TrendingQuote[];
  jobTimestamp: number;
  startInterval: number;
  endInterval: number;
};

export type ScreenerMatch = {
  symbol: string;
  name: string;
  lastPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  sector: string;
  industry: string;
  peRatio: number | null;
  dividendYield: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  beta: number | null;
  eps: number | null;
};

export type ScreenerResult = {
  finance: {
    result: Array<{
      quotes: ScreenerMatch[];
      meta?: {
        count: number;
        start: number;
        end: number;
      };
    }>;
    error?: {
      code: string;
      description: string;
    };
  };
};
