export function formatNumber(value: number, decimals: number = 2): string {
  if (isNaN(value)) {return 'N/A';}
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function formatCurrency(value: number, currency: string = 'USD'): string {
  if (isNaN(value)) {return 'N/A';}
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
}

export function formatPercentage(value: number, decimals: number = 2): string {
  if (isNaN(value)) {return 'N/A';}
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

export function formatDate(timestamp: number, format: string = 'YYYY-MM-DD'): string {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {return 'Invalid Date';}

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', String(year))
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

export function formatVolume(volume: number): string {
  if (isNaN(volume) || volume === 0) {return 'N/A';}

  if (volume >= 1e9) {
    return `${(volume / 1e9).toFixed(2)}B`;
  }
  if (volume >= 1e6) {
    return `${(volume / 1e6).toFixed(2)}M`;
  }
  if (volume >= 1e3) {
    return `${(volume / 1e3).toFixed(2)}K`;
  }
  return volume.toString();
}

export function normalizeSymbol(symbol: string): string {
  return symbol.toUpperCase().trim();
}

export function normalizeDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = (parts[0] || '').padStart(4, '0');
      const month = (parts[1] || '').padStart(2, '0');
      const day = (parts[2] || '').padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    return dateStr;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calculatePercentChange(old: number, newValue: number): number {
  if (old === 0) {return 0;}
  return ((newValue - old) / old) * 100;
}

export function calculateAnnualizedReturn(start: number, end: number, days: number): number {
  if (start <= 0 || days <= 0) {return 0;}
  return (Math.pow(end / start, 365 / days) - 1) * 100;
}

export function calculateVolatility(prices: number[]): number {
  if (prices.length < 2) {return 0;}

  const n = prices.length;
  const mean = prices.reduce((sum, price) => sum + price, 0) / n;
  const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / (n - 1);
  return Math.sqrt(variance);
}

export function calculateMovingAverage(prices: number[], period: number): number[] {
  if (period <= 0 || prices.length === 0) {return [];}

  const result: number[] = [];
  for (let i = 0; i <= prices.length - period; i++) {
    const sum = prices.slice(i, i + period).reduce((acc, val) => acc + val, 0);
    result.push(sum / period);
  }
  return result;
}

export function calculateRSI(prices: number[], period: number = 14): number[] {
  if (prices.length < period + 1) {return [];}

  const result: number[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const currentPrice = prices[i];
    const previousPrice = prices[i - 1];
    if (currentPrice === undefined || previousPrice === undefined) {continue;}
    const change = currentPrice - previousPrice;
    if (change > 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  if (avgLoss === 0) {
    return new Array(prices.length - period).fill(100);
  }

  let rs = avgGain / avgLoss;
  result.push(100 - 100 / (1 + rs));

  for (let i = period + 1; i < prices.length; i++) {
    const currentPrice = prices[i];
    const previousPrice = prices[i - 1];
    if (currentPrice === undefined || previousPrice === undefined) {continue;}
    const change = currentPrice - previousPrice;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result.push(100);
    } else {
      rs = avgGain / avgLoss;
      result.push(100 - 100 / (1 + rs));
    }
  }

  return result;
}

export function calculateMACD(prices: number[], fast: number = 12, slow: number = 26, signal: number = 9): { macd: number[], signal: number[], histogram: number[] } {
  if (prices.length < slow) {
    return { macd: [], signal: [], histogram: [] };
  }

  const emaFast = calculateEMA(prices, fast);
  const emaSlow = calculateEMA(prices, slow);

  const macd: number[] = [];
  for (let i = 0; i < emaFast.length && i < emaSlow.length; i++) {
    const emaFastValue = emaFast[i];
    const emaSlowValue = emaSlow[i];
    if (emaFastValue === undefined || emaSlowValue === undefined) {continue;}
    macd.push(emaFastValue - emaSlowValue);
  }

  const signalLine = calculateEMA(macd, signal);

  const histogram: number[] = [];
  for (let i = 0; i < macd.length && i < signalLine.length; i++) {
    const macdValue = macd[i];
    const signalValue = signalLine[i];
    if (macdValue === undefined || signalValue === undefined) {continue;}
    histogram.push(macdValue - signalValue);
  }

  return { macd, signal: signalLine, histogram };
}

function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length === 0 || period <= 0) {return [];}

  const k = 2 / (period + 1);
  const ema: number[] = [];

  ema.push(prices[0] ?? 0);
  for (let i = 1; i < prices.length; i++) {
    const currentPrice = prices[i];
    const previousEma = ema[i - 1];
    if (currentPrice === undefined || previousEma === undefined) {continue;}
    ema.push(currentPrice * k + previousEma * (1 - k));
  }

  return ema;
}

export function calculateBollingerBands(prices: number[], period: number = 20, stdDev: number = 2): { upper: number[], middle: number[], lower: number[] } {
  if (prices.length < period) {
    return { upper: [], middle: [], lower: [] };
  }

  const middle = calculateMovingAverage(prices, period);
  const upper: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < middle.length; i++) {
    const middleValue = middle[i];
    if (middleValue === undefined) {continue;}
    const slice = prices.slice(i, i + period);
    const mean = slice.reduce((sum, val) => sum + val, 0) / period;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    const std = Math.sqrt(variance);

    upper.push(middleValue + stdDev * std);
    lower.push(middleValue - stdDev * std);
  }

  return { upper, middle, lower };
}
