export const validSymbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'META', 'NVDA', 'JPM', 'V', 'WMT'];

export const invalidSymbols = ['INVALID', '', '123', 'ABC123XYZ'];

export const cryptoSymbols = ['BTC-USD', 'ETH-USD', 'XRP-USD', 'ADA-USD', 'DOGE-USD'];

export const forexPairs = ['EURUSD=X', 'GBPUSD=X', 'USDJPY=X', 'USDCHF=X', 'AUDUSD=X'];

export const testSymbols = {
  apple: 'AAPL',
  microsoft: 'MSFT',
  google: 'GOOGL',
  amazon: 'AMZN',
  tesla: 'TSLA',
  meta: 'META',
  nvidia: 'NVDA',
  jpmorgan: 'JPM',
  visa: 'V',
  walmart: 'WMT'
};

export const testTimeframes = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max'];

export const testPeriods = ['annual', 'quarterly'];

export const testLimits = [1, 3, 5, 10, 20];

export const quoteFields = [
  'regularMarketPrice',
  'regularMarketChange',
  'regularMarketChangePercent',
  'regularMarketVolume',
  'marketCap',
  'trailingPE',
  'forwardPE',
  'dividendYield',
  'beta',
  'fiftyTwoWeekHigh',
  'fiftyTwoWeekLow'
];

export const newsCounts = [1, 5, 10, 20, 50];

export const optionExpirationDates = [
  '2024-01-19',
  '2024-02-16',
  '2024-03-15',
  '2024-06-21',
  '2024-12-20'
];

export const strikeFilters = {
  inTheMoneyOnly: true,
  outOfTheMoneyOnly: true,
  minStrike: 150,
  maxStrike: 200
};

export const moduleCombinations = [
  ['defaultKeyStatistics', 'summaryDetail'],
  ['financialData', 'price'],
  ['defaultKeyStatistics', 'summaryDetail', 'financialData'],
  ['summaryDetail', 'price', 'financialData'],
  ['defaultKeyStatistics', 'summaryDetail', 'financialData', 'price']
];

export const regionCodes = ['US', 'EU', 'ASIA', 'LATAM'];

export const riskTolerances = ['low', 'medium', 'high'];

export const screenerCriteria = {
  marketCapMin: 1000000000,
  marketCapMax: 1000000000000,
  peMin: 10,
  peMax: 50,
  dividendYieldMin: 0,
  dividendYieldMax: 10
};

export const batchSizes = [1, 5, 10, 25, 50, 100];

export const timeoutValues = [100, 1000, 5000, 10000, 30000, 60000];

export const rateLimitConfigs = {
  requestsPerMinute: 120,
  requestsPerHour: 2000,
  burstLimit: 10,
  backoffMultiplier: 2,
  maxBackoffSeconds: 60,
  retryCount: 3
};

export const circuitBreakerConfigs = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000,
  monitoringWindow: 60000
};

export const cacheConfigs = {
  ttlQuotes: 300000,
  ttlHistorical: 600000,
  ttlFinancials: 3600000,
  ttlNews: 180000,
  ttlAnalysis: 900000,
  maxCacheSize: 1000
};

export const retryConfigs = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  jitter: true,
  jitterFactor: 0.1
};

export const networkFailureScenarios = {
  timeout: { timeout: 30000 },
  connectionRefused: { code: 'ECONNREFUSED' },
  dnsError: { code: 'ENOTFOUND' },
  networkDown: { code: 'ENETDOWN' },
  socketHangUp: { code: 'ECONNRESET' }
};

export const apiErrorScenarios = {
  rateLimit429: { statusCode: 429, message: 'Too Many Requests' },
  unauthorized401: { statusCode: 401, message: 'Unauthorized' },
  forbidden403: { statusCode: 403, message: 'Forbidden' },
  notFound404: { statusCode: 404, message: 'Not Found' },
  serverError500: { statusCode: 500, message: 'Internal Server Error' },
  badGateway502: { statusCode: 502, message: 'Bad Gateway' },
  serviceUnavailable503: { statusCode: 503, message: 'Service Unavailable' }
};

export const partialDataScenarios = {
  missingPrice: { regularMarketPrice: null },
  missingVolume: { regularMarketVolume: null },
  missingMarketCap: { marketCap: null },
  missingPE: { trailingPE: null },
  missingDividends: { dividendRate: null, dividendYield: null },
  incompleteHistorical: { timestamp: [], indicators: { quote: [] } }
};

export const concurrentRequestCounts = [1, 5, 10, 20, 50];

export const stressTestConfigs = {
  symbolCount: 100,
  requestCount: 500,
  concurrentRequests: 20,
  duration: 60000
};

export const resilienceTestConfigs = {
  failureRate: 0.3,
  recoveryTime: 5000,
  minSuccessfulRequests: 10
};

export const backoffStrategies = {
  linear: (attempt: number) => attempt * 1000,
  exponential: (attempt: number) => Math.pow(2, attempt) * 1000,
  exponentialWithJitter: (attempt: number) => Math.pow(2, attempt) * 1000 * (0.8 + Math.random() * 0.4)
};

export const validationRules = {
  symbol: {
    minLength: 1,
    maxLength: 20,
    pattern: /^[A-Z0-9.-]+$/
  },
  timeout: {
    min: 100,
    max: 60000
  },
  count: {
    min: 1,
    max: 50
  },
  limit: {
    min: 1,
    max: 20
  }
};

export const expectedResponseFormats = {
  quote: {
    hasPrice: true,
    hasVolume: true,
    hasChange: true,
    hasMeta: true
  },
  historical: {
    hasTimestamp: true,
    hasOHLC: true,
    hasVolume: true
  },
  financials: {
    hasStatements: true,
    hasDates: true,
    hasMonetaryValues: true
  },
  news: {
    hasItems: true,
    hasTitles: true,
    hasLinks: true
  },
  options: {
    hasExpirationDates: true,
    hasCalls: true,
    hasPuts: true
  }
};

export const performanceThresholds = {
  maxResponseTime: 5000,
  maxLatency: 1000,
  minCacheHitRate: 0.7,
  maxErrorRate: 0.05,
  maxMemoryUsage: 500000000
};

export const qualityMetrics = {
  minCompleteness: 0.8,
  minFreshness: 300000,
  minAccuracy: 0.95,
  maxStaleness: 900000
};

export const integrationTestScenarios = {
  happyPath: {
    symbol: 'AAPL',
    expectedSuccess: true
  },
  edgeCase: {
    symbol: 'GOOG',
    expectedPartialData: true
  },
  failure: {
    symbol: 'INVALID',
    expectedError: true
  }
};

export const chaosTestScenarios = {
  networkFailure: {
    type: 'network',
    duration: 5000,
    recovery: true
  },
  apiFailure: {
    type: 'api',
    errorRate: 0.5,
    recovery: true
  },
  rateLimit: {
    type: 'rate_limit',
    limit: 10,
    recovery: true
  },
  timeout: {
    type: 'timeout',
    timeout: 1000,
    recovery: true
  }
};

export const circuitBreakerStates = ['CLOSED', 'OPEN', 'HALF_OPEN'];

export const rateLimitStates = ['available', 'throttled', 'exceeded', 'recovering'];

export const cacheStates = ['hit', 'miss', 'stale', 'expired'];
