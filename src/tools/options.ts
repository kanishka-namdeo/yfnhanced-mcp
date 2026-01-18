import YahooFinance from 'yahoo-finance2';
import { OptionsInputSchema, OptionsOutputSchema } from '../schemas/index.js';
import { YahooFinanceError, YF_ERR_DATA_INCOMPLETE, YF_ERR_DATA_UNAVAILABLE } from '../types/errors.js';
import { DataQualityReporter } from '../utils/data-completion.js';
import type { OptionsResult, OptionsExpiration, PriceData } from '../types/yahoo-finance.js';

const yahooFinance = new YahooFinance();
const OPTIONS_CACHE_TTL = 3600000;

class OptionsToolCache {
  private cache: Map<string, { data: OptionsResult; timestamp: number }>;

  constructor() {
    this.cache = new Map();
  }

  get(key: string): OptionsResult | null {
    const entry = this.cache.get(key);
    if (!entry) {return null;}
    if (Date.now() - entry.timestamp > OPTIONS_CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: OptionsResult): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  generateCacheKey(symbol: string, expiration: string | null, includeGreeks: boolean): string {
    return `options:${symbol}:${expiration || 'default'}:${includeGreeks}`;
  }

  clear(): void {
    this.cache.clear();
  }
}

function calculateDelta(
  S: number,
  K: number,
  r: number,
  sigma: number,
  T: number,
  isCall: boolean
): number {
  if (T <= 0 || sigma <= 0) {return isCall ? 1 : -1;}

  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const cdf = (x: number): number => {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
  };

  return isCall ? cdf(d1) : cdf(d1) - 1;
}

function calculateGamma(
  S: number,
  K: number,
  r: number,
  sigma: number,
  T: number
): number {
  if (T <= 0 || sigma <= 0 || S <= 0) {return 0;}

  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const pdf = (x: number): number => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

  return pdf(d1) / (S * sigma * Math.sqrt(T));
}

function calculateTheta(
  S: number,
  K: number,
  r: number,
  sigma: number,
  T: number,
  isCall: boolean
): number {
  if (T <= 0 || sigma <= 0) {return 0;}

  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const cdf = (x: number): number => {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;
    const sign = x < 0 ? -1 : 1;
    x = Math.abs(x) / Math.sqrt(2);
    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1.0 + sign * y);
  };
  const pdf = (x: number): number => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

  const theta = -(S * sigma * pdf(d1)) / (2 * Math.sqrt(T)) - r * K * Math.exp(-r * T) * cdf(isCall ? d2 : -d2);
  return theta / 365;
}

function calculateVega(
  S: number,
  K: number,
  r: number,
  sigma: number,
  T: number
): number {
  if (T <= 0 || sigma <= 0 || S <= 0) {return 0;}

  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  const pdf = (x: number): number => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

  return S * pdf(d1) * Math.sqrt(T) / 100;
}

function calculateGreeks(
  spotPrice: number,
  strike: number,
  impliedVolatility: number,
  timeToExpiration: number,
  isCall: boolean
): {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
} {
  const riskFreeRate = 0.05;
  const sigma = impliedVolatility / 100;

  return {
    delta: calculateDelta(spotPrice, strike, riskFreeRate, sigma, timeToExpiration, isCall),
    gamma: calculateGamma(spotPrice, strike, riskFreeRate, sigma, timeToExpiration),
    theta: calculateTheta(spotPrice, strike, riskFreeRate, sigma, timeToExpiration, isCall),
    vega: calculateVega(spotPrice, strike, riskFreeRate, sigma, timeToExpiration)
  };
}

function convertOptionContract(
  item: Record<string, unknown>,
  spotPrice: number,
  timeToExpiration: number,
  includeGreeks: boolean,
  isCall: boolean
): {
  contractSymbol: string;
  strike: number;
  lastPrice: number | null;
  change: number | null;
  percentChange: number | null;
  volume: number;
  openInterest: number;
  bid: number | null;
  ask: number | null;
  impliedVolatility: number | null;
  inTheMoney: boolean;
  contractSize: number;
  currency: string;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
} {
  const strike = typeof item.strike === 'number' ? item.strike : 0;
  const impliedVolatility = typeof item.impliedVolatility === 'number' ? item.impliedVolatility : null;
  const lastPrice = typeof item.lastPrice === 'number' ? item.lastPrice : null;
  const change = typeof item.change === 'number' ? item.change : null;
  const percentChange = typeof item.percentChange === 'number' ? item.percentChange : null;
  const volume = typeof item.volume === 'number' ? item.volume : 0;
  const openInterest = typeof item.openInterest === 'number' ? item.openInterest : 0;
  const bid = typeof item.bid === 'number' ? item.bid : null;
  const ask = typeof item.ask === 'number' ? item.ask : null;
  const inTheMoney = typeof item.inTheMoney === 'boolean' ? item.inTheMoney : false;

  let delta: number | null = null;
  let gamma: number | null = null;
  let theta: number | null = null;
  let vega: number | null = null;

  if (includeGreeks && impliedVolatility !== null && lastPrice !== null && timeToExpiration > 0) {
    const greeks = calculateGreeks(spotPrice, strike, impliedVolatility, timeToExpiration, isCall);
    delta = greeks.delta;
    gamma = greeks.gamma;
    theta = greeks.theta;
    vega = greeks.vega;
  }

  return {
    contractSymbol: typeof item.contractSymbol === 'string' ? item.contractSymbol : '',
    strike,
    lastPrice,
    change,
    percentChange,
    volume,
    openInterest,
    bid,
    ask,
    impliedVolatility,
    inTheMoney,
    contractSize: typeof item.contractSize === 'number' ? item.contractSize : 100,
    currency: typeof item.currency === 'string' ? item.currency : 'USD',
    delta,
    gamma,
    theta,
    vega
  };
}

function convertOptionsExpiration(
  item: Record<string, unknown>,
  spotPrice: number,
  includeGreeks: boolean
): {
  expirationDate: string;
  date: number;
  hasMiniOptions: boolean;
  calls: Array<{
    contractSymbol: string;
    strike: number;
    lastPrice: number | null;
    change: number | null;
    percentChange: number | null;
    volume: number;
    openInterest: number;
    bid: number | null;
    ask: number | null;
    impliedVolatility: number | null;
    inTheMoney: boolean;
    contractSize: number;
    currency: string;
    delta: number | null;
    gamma: number | null;
    theta: number | null;
    vega: number | null;
  }>;
  puts: Array<{
    contractSymbol: string;
    strike: number;
    lastPrice: number | null;
    change: number | null;
    percentChange: number | null;
    volume: number;
    openInterest: number;
    bid: number | null;
    ask: number | null;
    impliedVolatility: number | null;
    inTheMoney: boolean;
    contractSize: number;
    currency: string;
    delta: number | null;
    gamma: number | null;
    theta: number | null;
    vega: number | null;
  }>;
} {
  const expirationDateRaw = typeof item.expirationDate === 'number' ? item.expirationDate : 0;
  const expirationDate = expirationDateRaw > 0 ? new Date(expirationDateRaw * 1000).toISOString().split('T')[0] : '';
  const timeToExpiration = expirationDateRaw > 0 ? (expirationDateRaw * 1000 - Date.now()) / (365 * 24 * 60 * 60 * 1000) : 0;

  const calls = Array.isArray(item.calls) ? item.calls : [];
  const puts = Array.isArray(item.puts) ? item.puts : [];

  return {
    expirationDate,
    date: expirationDateRaw,
    hasMiniOptions: typeof item.hasMiniOptions === 'boolean' ? item.hasMiniOptions : false,
    calls: calls.map((contract) =>
      convertOptionContract(contract as Record<string, unknown>, spotPrice, timeToExpiration, includeGreeks, true)
    ),
    puts: puts.map((contract) =>
      convertOptionContract(contract as Record<string, unknown>, spotPrice, timeToExpiration, includeGreeks, false)
    )
  };
}

async function fetchOptions(symbol: string): Promise<OptionsResult> {
  try {
    const result = await yahooFinance.quoteSummary(symbol, {
      modules: ['optionChain' as unknown as never]
    });

    if (!result?.optionChain) {
      throw new YahooFinanceError(
        `Options data not available for ${symbol}`,
        YF_ERR_DATA_INCOMPLETE,
        null,
        false,
        false,
        { symbol },
        'Check if symbol has options trading available'
      );
    }

    return result.optionChain as OptionsResult;
  } catch (error) {
    if (error instanceof YahooFinanceError) {
      throw error;
    }
    throw new YahooFinanceError(
      `Failed to fetch options for ${symbol}: ${error instanceof Error ? error.message : String(error)}`,
      YF_ERR_DATA_UNAVAILABLE,
      null,
      true,
      false,
      { symbol },
      'Retry request or check if options are available for this symbol'
    );
  }
}

async function getOptionsData(
  symbol: string,
  expiration: string | null,
  includeGreeks: boolean,
  cache: OptionsToolCache
): Promise<{
  options: {
    expirationDate: string;
    date: number;
    hasMiniOptions: boolean;
    calls: Array<{
      contractSymbol: string;
      strike: number;
      lastPrice: number | null;
      change: number | null;
      percentChange: number | null;
      volume: number;
      openInterest: number;
      bid: number | null;
      ask: number | null;
      impliedVolatility: number | null;
      inTheMoney: boolean;
      contractSize: number;
      currency: string;
      delta: number | null;
      gamma: number | null;
      theta: number | null;
      vega: number | null;
    }>;
    puts: Array<{
      contractSymbol: string;
      strike: number;
      lastPrice: number | null;
      change: number | null;
      percentChange: number | null;
      volume: number;
      openInterest: number;
      bid: number | null;
      ask: number | null;
      impliedVolatility: number | null;
      inTheMoney: boolean;
      contractSize: number;
      currency: string;
      delta: number | null;
      gamma: number | null;
      theta: number | null;
      vega: number | null;
    }>;
  };
  quote: PriceData;
  expirationDates: number[];
  requestedExpiration: string | null;
  fallbackExpiration: boolean;
  fromCache: boolean;
}> {
  const cacheKey = cache.generateCacheKey(symbol, expiration, includeGreeks);
  const cached = cache.get(cacheKey);

  if (cached) {
    const cachedOptions = cached.options[0];
    const timeToExpiration = cachedOptions ? (cachedOptions.date - Date.now() / 1000) / (365 * 24 * 60 * 60) : 0;
    const spotPrice = typeof cached.quote?.regularMarketPrice === 'number' ? cached.quote.regularMarketPrice : 0;
    const convertedOptions = convertOptionsExpiration(cachedOptions as Record<string, unknown>, spotPrice, includeGreeks);

    return {
      options: {
        expirationDate: convertedOptions.expirationDate,
        date: cachedOptions?.date || 0,
        hasMiniOptions: convertedOptions.hasMiniOptions,
        calls: convertedOptions.calls,
        puts: convertedOptions.puts
      },
      quote: cached.quote,
      expirationDates: cached.expirationDates,
      requestedExpiration: expiration,
      fallbackExpiration: false,
      fromCache: true
    };
  }

  const data = await fetchOptions(symbol);

  if (!data.expirationDates || data.expirationDates.length === 0) {
    throw new YahooFinanceError(
      `No options expirations available for ${symbol}`,
      YF_ERR_DATA_INCOMPLETE,
      null,
      false,
      false,
      { symbol },
      'Check if symbol has options trading available'
    );
  }

  let selectedExpiration = expiration;

  if (selectedExpiration) {
    const requestedDate = new Date(selectedExpiration).getTime() / 1000;
    if (!data.expirationDates.includes(requestedDate)) {
      const closestDate = data.expirationDates.reduce((prev, curr) => {
        return Math.abs(curr - requestedDate) < Math.abs(prev - requestedDate) ? curr : prev;
      });
      selectedExpiration = new Date(closestDate * 1000).toISOString().split('T')[0];
    }
  } else {
    selectedExpiration = new Date(data.expirationDates[0] * 1000).toISOString().split('T')[0];
  }

  const requestedDateNum = expiration ? new Date(expiration).getTime() / 1000 : 0;
  const fallbackExpiration = requestedDateNum > 0 && requestedDateNum !== data.expirationDates[0];

  const spotPrice = typeof data.quote?.regularMarketPrice === 'number' ? data.quote.regularMarketPrice : 0;

  let selectedOptions = data.options[0];
  if (expiration) {
    const targetDate = new Date(selectedExpiration).getTime() / 1000;
    const matchingOption = data.options.find((opt) => opt.date === targetDate);
    if (matchingOption) {
      selectedOptions = matchingOption;
    }
  }

  const convertedOptions = convertOptionsExpiration(selectedOptions as Record<string, unknown>, spotPrice, includeGreeks);

  cache.set(cacheKey, data);

  return {
    options: convertedOptions,
    quote: data.quote,
    expirationDates: data.expirationDates,
    requestedExpiration: expiration,
    fallbackExpiration,
    fromCache: false
  };
}

function buildOptionsMetadata(
  fromCache: boolean,
  dataAge: number,
  optionsData: {
    calls: unknown[];
    puts: unknown[];
  },
  expirationDates: number[],
  requestedExpiration: string | null,
  fallbackExpiration: boolean
): {
  fromCache: boolean;
  dataAge: number;
  completenessScore: number;
  warnings: string[];
  dataSource: string;
  lastUpdated: string;
  availableExpirations: string[];
  requestedExpiration: string | null;
  fallbackExpiration: boolean;
  ivCalculationMethod: string;
} {
  const warnings: string[] = [];

  if (optionsData.calls.length === 0 && optionsData.puts.length === 0) {
    warnings.push('No option contracts available for selected expiration');
  }

  if (requestedExpiration && fallbackExpiration) {
    warnings.push('Requested expiration not available, using closest available date');
  }

  if (expirationDates.length === 0) {
    warnings.push('No option expirations available for this symbol');
  }

  if (dataAge > OPTIONS_CACHE_TTL * 0.75) {
    warnings.push('Options data is stale (older than 45 minutes)');
  } else if (dataAge > OPTIONS_CACHE_TTL * 0.5) {
    warnings.push('Options data may be stale (older than 30 minutes)');
  }

  const totalContracts = optionsData.calls.length + optionsData.puts.length;
  const completenessScore = totalContracts > 0 ? 1 : 0;

  const availableExpirations = expirationDates
    .map((date) => new Date(date * 1000).toISOString().split('T')[0])
    .sort();

  const lastUpdated = new Date(Date.now() - dataAge).toISOString();

  return {
    fromCache,
    dataAge,
    completenessScore,
    warnings,
    dataSource: 'Yahoo Finance',
    lastUpdated,
    availableExpirations,
    requestedExpiration,
    fallbackExpiration,
    ivCalculationMethod: 'Black-Scholes approximation'
  };
}

const optionsToolCache = new OptionsToolCache();

export async function getOptionsTool(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const parsed = OptionsInputSchema.parse(args);
  const { symbol, date, expiration, optionsType = 'both', includeGreeks = false } = parsed;

  const cacheKey = optionsToolCache.generateCacheKey(symbol, expiration || date || null, includeGreeks);
  const fromCache = optionsToolCache.get(cacheKey) !== null;
  const startTime = Date.now();

  const selectedExpiration = expiration || date || null;
  const data = await getOptionsData(symbol, selectedExpiration, includeGreeks, optionsToolCache);

  const dataAge = fromCache ? startTime - optionsToolCache.generateCacheKey(symbol, selectedExpiration || '', includeGreeks).length : 0;

  let filteredOptions = data.options;

  if (optionsType === 'calls') {
    filteredOptions = {
      ...data.options,
      puts: []
    };
  } else if (optionsType === 'puts') {
    filteredOptions = {
      ...data.options,
      calls: []
    };
  }

  const meta = buildOptionsMetadata(
    fromCache,
    dataAge,
    filteredOptions,
    data.expirationDates,
    selectedExpiration,
    data.fallbackExpiration
  );

  const output = {
    symbol,
    options: filteredOptions,
    expirationDates: data.expirationDates.map((date) => new Date(date * 1000).toISOString().split('T')[0]),
    meta
  } as unknown;

  return OptionsOutputSchema.parse(output);
}

export function getOptionsToolDefinitions() {
  return [
    {
      name: 'get_options',
      description: 'Retrieve options chain data for a stock including calls, puts, strike prices, and implied volatility. Calculates Greeks if requested and gracefully degrades to available expirations.',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'Stock ticker symbol (e.g., AAPL, MSFT, GOOGL)',
            minLength: 1,
            maxLength: 20
          },
          date: {
            type: 'string',
            description: 'Expiration date in YYYY-MM-DD format (deprecated: use expiration)'
          },
          expiration: {
            type: 'string',
            description: 'Expiration date in YYYY-MM-DD format (defaults to nearest available date)'
          },
          optionsType: {
            type: 'string',
            enum: ['calls', 'puts', 'both'],
            description: 'Filter by options type (default: both)'
          },
          includeGreeks: {
            type: 'boolean',
            description: 'Calculate and include Greeks (delta, gamma, theta, vega) for each contract (default: false)'
          }
        },
        required: ['symbol']
      }
    }
  ];
}

export function clearOptionsCache(): void {
  optionsToolCache.clear();
}
