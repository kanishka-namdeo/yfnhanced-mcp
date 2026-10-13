import * as formattingModule from '../../../src/utils/formatting';
import {
  formatNumber,
  formatCurrency,
  formatPercentage,
  formatDate,
  formatVolume,
  normalizeSymbol,
  normalizeDate,
  calculatePercentChange,
  calculateAnnualizedReturn,
  calculateVolatility,
  calculateMovingAverage,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands
} from '../../../src/utils/formatting';

// These suites run against the real `src/utils/formatting` surface. The file exports exactly
// fourteen functions; the names `formatLargeNumber`, `formatTime` and `formatPrice` that this
// suite used to import have never existed anywhere in `src/` (see src/utils/AGENTS.md).
// `formatDate` and `normalizeDate` use local-time getters, so every date expectation here is
// computed from the same instant on the host clock instead of a hardcoded UTC string.

const asNumber = (value: unknown): number => value as number;
const asString = (value: unknown): string => value as string;

// 2024-01-15T14:10:00Z. Local rendering depends on the host timezone.
const INSTANT_MS = Date.UTC(2024, 0, 15, 14, 10, 0);

const pad = (value: number): string => String(value).padStart(2, '0');

// Mirrors the local-time getters `formatDate` uses, so assertions stay deterministic off UTC.
const localTokens = (ms: number): Record<string, string> => {
  const date = new Date(ms);
  return {
    YYYY: String(date.getFullYear()),
    MM: pad(date.getMonth() + 1),
    DD: pad(date.getDate()),
    HH: pad(date.getHours()),
    mm: pad(date.getMinutes()),
    ss: pad(date.getSeconds())
  };
};

describe('formatting module surface', () => {
  const exportedNames = [
    'formatNumber',
    'formatCurrency',
    'formatPercentage',
    'formatDate',
    'formatVolume',
    'normalizeSymbol',
    'normalizeDate',
    'calculatePercentChange',
    'calculateAnnualizedReturn',
    'calculateVolatility',
    'calculateMovingAverage',
    'calculateRSI',
    'calculateMACD',
    'calculateBollingerBands'
  ];

  test('exports exactly the fourteen documented functions', () => {
    expect(Object.keys(formattingModule).sort()).toEqual([...exportedNames].sort());
  });

  test.each(exportedNames)('%s is a function', (name) => {
    expect(typeof (formattingModule as Record<string, unknown>)[name]).toBe('function');
  });

  test('formatLargeNumber does not exist and is not an export', () => {
    expect((formattingModule as Record<string, unknown>)['formatLargeNumber']).toBeUndefined();
  });

  test('formatTime does not exist and is not an export', () => {
    expect((formattingModule as Record<string, unknown>)['formatTime']).toBeUndefined();
  });

  test('formatPrice does not exist and is not an export', () => {
    expect((formattingModule as Record<string, unknown>)['formatPrice']).toBeUndefined();
  });

  test('calculateEMA stays private to the module', () => {
    expect((formattingModule as Record<string, unknown>)['calculateEMA']).toBeUndefined();
  });

  test('no formatter takes a decimals or unit argument beyond its declared parameter', () => {
    expect(formatNumber.length).toBe(1);
    expect(formatCurrency.length).toBe(1);
    expect(formatPercentage.length).toBe(1);
    expect(formatDate.length).toBe(1);
    expect(formatVolume.length).toBe(1);
  });
});

describe('formatNumber', () => {
  test('pads to two fraction digits by default', () => {
    expect(formatNumber(150.5)).toBe('150.50');
  });

  test('groups thousands with the en-US separator', () => {
    expect(formatNumber(1500000.5)).toBe('1,500,000.50');
  });

  test('formats negative numbers', () => {
    expect(formatNumber(-150.5)).toBe('-150.50');
  });

  test('formats zero with the default fraction digits', () => {
    expect(formatNumber(0)).toBe('0.00');
  });

  test('honours an explicit fraction-digit count', () => {
    expect(formatNumber(150.567, 3)).toBe('150.567');
    expect(formatNumber(150.567, 0)).toBe('151');
    expect(formatNumber(150.4, 0)).toBe('150');
  });

  test('minimumFractionDigits equals maximumFractionDigits, so digits are always padded', () => {
    expect(formatNumber(1, 4)).toBe('1.0000');
  });

  test('returns N/A for NaN', () => {
    expect(formatNumber(NaN)).toBe('N/A');
  });

  test('returns N/A for undefined because isNaN(undefined) is true', () => {
    expect(formatNumber(undefined as unknown as number)).toBe('N/A');
  });

  test('throws for null because isNaN(null) is false and null has no toLocaleString', () => {
    expect(() => formatNumber(asNumber(null))).toThrow(TypeError);
    expect(() => formatNumber(asNumber(null))).toThrow(/Cannot read properties of null/);
  });

  test('renders Infinity through Intl rather than rejecting it', () => {
    expect(formatNumber(Infinity)).toContain('∞');
  });

  test('a numeric string is not formatted: the guard passes and toLocaleString echoes it', () => {
    expect(formatNumber(asNumber('150.5'))).toBe('150.5');
  });
});

describe('formatCurrency', () => {
  test('formats USD with the default currency', () => {
    expect(formatCurrency(150.5)).toBe('$150.50');
    expect(formatCurrency(150.5, 'USD')).toBe('$150.50');
  });

  test('has no decimals parameter, so sub-cent precision is rounded away', () => {
    expect(formatCurrency(150.567, 'USD')).toBe('$150.57');
  });

  test('formats EUR and GBP with two fraction digits', () => {
    expect(formatCurrency(150.5, 'EUR')).toContain('150.50');
    expect(formatCurrency(150.5, 'GBP')).toContain('150.50');
  });

  test('formats zero-decimal currencies without fraction digits', () => {
    expect(formatCurrency(150.5, 'JPY')).toContain('151');
  });

  test('prefixes negatives with the minus sign', () => {
    expect(formatCurrency(-150.5, 'USD')).toBe('-$150.50');
  });

  test('formats zero and grouped large values', () => {
    expect(formatCurrency(0, 'USD')).toBe('$0.00');
    expect(formatCurrency(1500000.5, 'USD')).toBe('$1,500,000.50');
  });

  test('returns N/A for NaN and undefined', () => {
    expect(formatCurrency(NaN, 'USD')).toBe('N/A');
    expect(formatCurrency(undefined as unknown as number, 'USD')).toBe('N/A');
  });

  test('reports null as $0.00 because isNaN(null) is false', () => {
    expect(formatCurrency(asNumber(null), 'USD')).toBe('$0.00');
  });

  test('renders Infinity as a currency symbol plus the infinity glyph, not N/A', () => {
    expect(formatCurrency(Infinity, 'USD')).toContain('∞');
  });

  test('throws RangeError for an unsupported currency code', () => {
    expect(() => formatCurrency(1, 'XX')).toThrow(RangeError);
  });
});

describe('formatPercentage', () => {
  test('always prefixes a sign, using an explicit plus for zero and positives', () => {
    expect(formatPercentage(2.5)).toBe('+2.50%');
    expect(formatPercentage(0)).toBe('+0.00%');
    expect(formatPercentage(150.5)).toBe('+150.50%');
  });

  test('leaves the negative sign from toFixed untouched', () => {
    expect(formatPercentage(-2.5)).toBe('-2.50%');
  });

  test('honours the decimals argument via toFixed', () => {
    expect(formatPercentage(2.567, 3)).toBe('+2.567%');
    expect(formatPercentage(2.5, 0)).toBe('+3%');
  });

  test('rounds small values to the requested precision', () => {
    expect(formatPercentage(0.015)).toBe('+0.01%');
    expect(formatPercentage(0.015, 3)).toBe('+0.015%');
  });

  test('returns N/A for NaN and undefined', () => {
    expect(formatPercentage(NaN)).toBe('N/A');
    expect(formatPercentage(undefined as unknown as number)).toBe('N/A');
  });

  test('throws for null because isNaN(null) is false and null has no toFixed', () => {
    expect(() => formatPercentage(asNumber(null))).toThrow(TypeError);
  });

  test('renders Infinity as +Infinity%, which is not a usable client string', () => {
    expect(formatPercentage(Infinity)).toBe('+Infinity%');
    expect(formatPercentage(-Infinity)).toBe('-Infinity%');
  });

  test('never multiplies by 100; the input is already a percentage', () => {
    expect(formatPercentage(0.25)).toBe('+0.25%');
  });
});

describe('formatDate', () => {
  test('default format renders the local calendar date', () => {
    expect(formatDate(INSTANT_MS)).toBe(`${localTokens(INSTANT_MS).YYYY}-${localTokens(INSTANT_MS).MM}-${localTokens(INSTANT_MS).DD}`);
  });

  test('full format renders local date and time', () => {
    const t = localTokens(INSTANT_MS);
    expect(formatDate(INSTANT_MS, 'YYYY-MM-DD HH:mm:ss')).toBe(`${t.YYYY}-${t.MM}-${t.DD} ${t.HH}:${t.mm}:${t.ss}`);
  });

  test('time-only format emits hours, minutes and seconds', () => {
    const t = localTokens(INSTANT_MS);
    expect(formatDate(INSTANT_MS, 'HH:mm:ss')).toBe(`${t.HH}:${t.mm}:${t.ss}`);
  });

  test('keeps non-token characters as separators', () => {
    const t = localTokens(INSTANT_MS);
    expect(formatDate(INSTANT_MS, 'YYYY/MM/DD')).toBe(`${t.YYYY}/${t.MM}/${t.DD}`);
  });

  test('unknown tokens pass through untouched', () => {
    const t = localTokens(INSTANT_MS);
    expect(formatDate(INSTANT_MS, 'YYYY-QQ')).toBe(`${t.YYYY}-QQ`);
    expect(formatDate(INSTANT_MS, 'date')).toBe('date');
    expect(formatDate(INSTANT_MS, '')).toBe('');
  });

  test('replaces only the first occurrence of each token', () => {
    const t = localTokens(INSTANT_MS);
    expect(formatDate(INSTANT_MS, 'MM MM')).toBe(`${t.MM} MM`);
    expect(formatDate(INSTANT_MS, 'YYYY YYYY')).toBe(`${t.YYYY} YYYY`);
  });

  test('month and minute tokens are case sensitive', () => {
    const t = localTokens(INSTANT_MS);
    expect(formatDate(INSTANT_MS, 'mm')).toBe(t.mm);
    expect(formatDate(INSTANT_MS, 'MM')).toBe(t.MM);
  });

  test('an empty format still yields a plain string', () => {
    expect(typeof formatDate(INSTANT_MS)).toBe('string');
  });

  test('null is coerced to the epoch, not to N/A', () => {
    const t = localTokens(0);
    expect(formatDate(asNumber(null))).toBe(`${t.YYYY}-${t.MM}-${t.DD}`);
  });

  test('invalid input returns the literal Invalid Date rather than N/A', () => {
    expect(formatDate(undefined as unknown as number)).toBe('Invalid Date');
    expect(formatDate('not a date' as unknown as number)).toBe('Invalid Date');
    expect(formatDate(NaN)).toBe('Invalid Date');
  });

  test('a numeric string is not parsed as milliseconds', () => {
    expect(formatDate(String(INSTANT_MS) as unknown as number)).toBe('Invalid Date');
  });

  test('second-resolution timestamps are read as milliseconds', () => {
    const seconds = Math.floor(INSTANT_MS / 1000);
    const t = localTokens(seconds);
    expect(formatDate(seconds)).toBe(`${t.YYYY}-${t.MM}-${t.DD}`);
    expect(formatDate(seconds)).toMatch(/^1970-/);
  });

  test('is timezone dependent because it reads local getters', () => {
    const utcDay = new Date(INSTANT_MS).getUTCDate();
    const rendered = formatDate(INSTANT_MS, 'DD');
    expect(Number(rendered)).toBeGreaterThanOrEqual(utcDay - 1);
    expect(Number(rendered)).toBeLessThanOrEqual(utcDay + 1);
    expect(Number(rendered)).toBe(new Date(INSTANT_MS).getDate());
  });
});

describe('formatVolume', () => {
  test('scales thousands, millions and billions with two decimals', () => {
    expect(formatVolume(1500)).toBe('1.50K');
    expect(formatVolume(1500000)).toBe('1.50M');
    expect(formatVolume(1500000000)).toBe('1.50B');
    expect(formatVolume(1000000)).toBe('1.00M');
  });

  test('leaves values under one thousand unscaled', () => {
    expect(formatVolume(999)).toBe('999');
    expect(formatVolume(999.9)).toBe('999.9');
    expect(formatVolume(1)).toBe('1');
  });

  test('reports zero volume as N/A, indistinguishable from missing data', () => {
    expect(formatVolume(0)).toBe('N/A');
  });

  test('does not scale negative values', () => {
    expect(formatVolume(-1500)).toBe('-1500');
    expect(formatVolume(-2e9)).toBe('-2000000000');
  });

  test('returns N/A for NaN and undefined', () => {
    expect(formatVolume(NaN)).toBe('N/A');
    expect(formatVolume(undefined as unknown as number)).toBe('N/A');
  });

  test('throws for null because null reaches volume.toString', () => {
    expect(() => formatVolume(asNumber(null))).toThrow(/Cannot read properties of null/);
  });

  test('has no unit parameter', () => {
    expect(formatVolume.length).toBe(1);
  });
});

describe('normalizeSymbol', () => {
  test('uppercases and trims', () => {
    expect(normalizeSymbol(' aapl ')).toBe('AAPL');
    expect(normalizeSymbol('brk.b')).toBe('BRK.B');
    expect(normalizeSymbol('^gspc')).toBe('^GSPC');
  });

  test('leaves already normalised symbols alone', () => {
    expect(normalizeSymbol('BTC-USD')).toBe('BTC-USD');
  });

  test('handles empty and whitespace-only strings', () => {
    expect(normalizeSymbol('')).toBe('');
    expect(normalizeSymbol('   ')).toBe('');
  });

  test('does not validate grammar — that is InputValidator\'s job', () => {
    expect(normalizeSymbol('not valid!')).toBe('NOT VALID!');
  });
});

describe('normalizeDate', () => {
  test('returns a local YYYY-MM-DD string for a parseable date', () => {
    const date = new Date('2024-01-15');
    expect(normalizeDate('2024-01-15')).toBe(
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    );
  });

  test('keeps the calendar day for a local noon input', () => {
    expect(normalizeDate('2024-01-15T12:00:00')).toBe('2024-01-15');
  });

  test('renders a full ISO instant in local time', () => {
    const date = new Date('2024-01-15T23:30:00Z');
    expect(normalizeDate('2024-01-15T23:30:00Z')).toBe(
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    );
  });

  test('pads unparsed three-part inputs, producing a five-digit year field for day-first input', () => {
    expect(normalizeDate('15-01-2024')).toBe('0015-01-2024');
  });

  test('zero-pads parts of a short three-part input', () => {
    expect(normalizeDate('2024-1-5')).toBe('2024-01-05');
  });

  test('returns the input unchanged when it does not parse and has no three-part shape', () => {
    expect(normalizeDate('nodash')).toBe('nodash');
    expect(normalizeDate('2024-13')).toBe('2024-13');
    expect(normalizeDate('')).toBe('');
  });

  test('zero-pads a three-part unparsed input token by token', () => {
    expect(normalizeDate('not-a-date')).toBe('0not-0a-date');
  });

  test('parses two-part year-month strings as the first of the month', () => {
    const date = new Date('2024-02');
    expect(normalizeDate('2024-02')).toBe(
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    );
  });
});

describe('calculatePercentChange', () => {
  test('computes the percentage change', () => {
    expect(calculatePercentChange(100, 110)).toBe(10);
    expect(calculatePercentChange(200, 100)).toBe(-50);
  });

  test('returns 0 for a zero base instead of dividing', () => {
    expect(calculatePercentChange(0, 5)).toBe(0);
    expect(calculatePercentChange(0, 0)).toBe(0);
  });

  test('returns 0 for identical values', () => {
    expect(calculatePercentChange(37.5, 37.5)).toBe(0);
  });

  test('propagates NaN rather than guarding it', () => {
    expect(Number.isNaN(calculatePercentChange('abc' as unknown as number, 1))).toBe(true);
  });
});

describe('calculateAnnualizedReturn', () => {
  test('annualises with a 365-day exponent', () => {
    expect(calculateAnnualizedReturn(100, 200, 365)).toBeCloseTo(100, 10);
    expect(calculateAnnualizedReturn(100, 110, 30)).toBeCloseTo((Math.pow(1.1, 365 / 30) - 1) * 100, 10);
  });

  test('returns 0 for non-positive start or days', () => {
    expect(calculateAnnualizedReturn(0, 200, 365)).toBe(0);
    expect(calculateAnnualizedReturn(-100, 200, 365)).toBe(0);
    expect(calculateAnnualizedReturn(100, 200, 0)).toBe(0);
    expect(calculateAnnualizedReturn(100, 200, -5)).toBe(0);
  });

  test('returns a negative annualisation for a falling end value', () => {
    expect(calculateAnnualizedReturn(200, 100, 365)).toBeCloseTo(-50, 10);
  });
});

describe('calculateVolatility', () => {
  test('returns 0 for fewer than two observations', () => {
    expect(calculateVolatility([])).toBe(0);
    expect(calculateVolatility([5])).toBe(0);
  });

  test('is the sample standard deviation (n-1 denominator)', () => {
    expect(calculateVolatility([1, 2, 3])).toBe(1);
    expect(calculateVolatility([1, 2])).toBeCloseTo(Math.SQRT1_2, 12);
    expect(calculateVolatility([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138089935299395, 12);
  });

  test('is 0 for a constant series', () => {
    expect(calculateVolatility([7, 7, 7, 7])).toBe(0);
  });
});

describe('calculateMovingAverage', () => {
  test('slides a window of the requested period', () => {
    expect(calculateMovingAverage([1, 2, 3, 4], 2)).toEqual([1.5, 2.5, 3.5]);
    expect(calculateMovingAverage([1, 2, 3, 4, 5], 3)).toEqual([2, 3, 4]);
  });

  test('produces prices.length - period + 1 values', () => {
    expect(calculateMovingAverage(Array.from({ length: 10 }, (_v, i) => i), 4)).toHaveLength(7);
  });

  test('returns a single value when the period equals the length', () => {
    expect(calculateMovingAverage([2, 4, 6], 3)).toEqual([4]);
  });

  test('returns an empty array for an empty series or a non-positive period', () => {
    expect(calculateMovingAverage([], 2)).toEqual([]);
    expect(calculateMovingAverage([1, 2], 0)).toEqual([]);
    expect(calculateMovingAverage([1, 2], -1)).toEqual([]);
  });

  test('returns an empty array when the period exceeds the series', () => {
    expect(calculateMovingAverage([1, 2], 5)).toEqual([]);
  });
});

describe('calculateRSI', () => {
  test('returns an empty array when there are fewer than period + 1 prices', () => {
    expect(calculateRSI([1, 2, 3])).toEqual([]);
    expect(calculateRSI(Array.from({ length: 14 }, (_v, i) => i))).toEqual([]);
  });

  test('returns prices.length - period values once there is enough data', () => {
    expect(calculateRSI(Array.from({ length: 15 }, (_v, i) => i))).toHaveLength(1);
    expect(calculateRSI(Array.from({ length: 20 }, (_v, i) => i))).toHaveLength(6);
  });

  test('saturates at 100 when the window has no losses', () => {
    expect(calculateRSI(Array.from({ length: 20 }, (_v, i) => i + 1))).toEqual([100, 100, 100, 100, 100, 100]);
  });

  test('saturates at 100 for a flat series because avgLoss starts at zero', () => {
    expect(calculateRSI(Array.from({ length: 20 }, () => 5))).toEqual([100, 100, 100, 100, 100, 100]);
  });

  test('drops to 0 when the window has no gains', () => {
    expect(calculateRSI(Array.from({ length: 20 }, (_v, i) => 20 - i))).toEqual([0, 0, 0, 0, 0, 0]);
  });

  test('uses a Wilder-smoothed average for subsequent values', () => {
    const series = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 2];
    const rsi = calculateRSI(series);
    expect(rsi).toHaveLength(6);
    expect(rsi[0]).toBeCloseTo(64.2857, 4);
    expect(rsi[rsi.length - 1]).toBeCloseTo(51.5232, 4);
  });

  test('honours a custom period', () => {
    expect(calculateRSI([1, 2, 3, 4, 5, 6], 3)).toHaveLength(3);
    expect(calculateRSI([1, 2, 3, 4, 5, 6], 3)).toEqual([100, 100, 100]);
  });

  test('stays within 0 to 100', () => {
    const series = Array.from({ length: 40 }, (_v, i) => 100 + Math.sin(i) * 10);
    calculateRSI(series).forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    });
  });
});

describe('calculateMACD', () => {
  test('returns empty arrays when the series is shorter than the slow period', () => {
    expect(calculateMACD([1, 2, 3])).toEqual({ macd: [], signal: [], histogram: [] });
    expect(calculateMACD(Array.from({ length: 25 }, (_v, i) => i))).toEqual({ macd: [], signal: [], histogram: [] });
  });

  test('produces full-length arrays rather than trimmed warm-up values', () => {
    const result = calculateMACD(Array.from({ length: 40 }, (_v, i) => 100 + i));
    expect(result.macd).toHaveLength(40);
    expect(result.signal).toHaveLength(40);
    expect(result.histogram).toHaveLength(40);
  });

  test('starts every EMA at the first price, so the leading MACD value is 0', () => {
    const result = calculateMACD(Array.from({ length: 40 }, (_v, i) => 100 + i));
    expect(result.macd[0]).toBe(0);
    expect(result.histogram[0]).toBe(0);
  });

  test('macd equals fast EMA minus slow EMA, and histogram equals macd minus signal', () => {
    const result = calculateMACD(Array.from({ length: 60 }, (_v, i) => 100 + Math.sin(i / 3) * 5));
    expect(result.histogram).toHaveLength(result.macd.length);
    result.macd.forEach((value, index) => {
      const signalValue = result.signal[index] as number;
      expect(result.histogram[index]).toBeCloseTo(value - signalValue, 12);
    });
  });

  test('accepts custom fast, slow and signal periods', () => {
    const result = calculateMACD(Array.from({ length: 10 }, (_v, i) => i), 2, 5, 3);
    expect(result.macd).toHaveLength(10);
  });

  test('is 0 everywhere for a constant series', () => {
    const result = calculateMACD(Array.from({ length: 40 }, () => 7));
    expect(result.macd.every((v) => v === 0)).toBe(true);
    expect(result.signal.every((v) => v === 0)).toBe(true);
  });
});

describe('calculateBollingerBands', () => {
  test('returns empty bands when the series is shorter than the period', () => {
    expect(calculateBollingerBands([1, 2, 3])).toEqual({ upper: [], middle: [], lower: [] });
  });

  test('produces prices.length - period + 1 bands', () => {
    const result = calculateBollingerBands(Array.from({ length: 25 }, (_v, i) => i + 1));
    expect(result.middle).toHaveLength(6);
    expect(result.upper).toHaveLength(6);
    expect(result.lower).toHaveLength(6);
  });

  test('middle is the simple moving average', () => {
    const result = calculateBollingerBands(Array.from({ length: 25 }, (_v, i) => i + 1));
    expect(result.middle[0]).toBe(10.5);
    expect(result.middle).toEqual(calculateMovingAverage(Array.from({ length: 25 }, (_v, i) => i + 1), 20));
  });

  test('uses the population standard deviation (n denominator) scaled by stdDev', () => {
    const series = Array.from({ length: 25 }, (_v, i) => i + 1);
    const result = calculateBollingerBands(series);
    const expectedStd = Math.sqrt(series.slice(0, 20).reduce((s, v) => s + Math.pow(v - 10.5, 2), 0) / 20);
    expect(result.upper[0]).toBeCloseTo(10.5 + 2 * expectedStd, 10);
    expect(result.lower[0]).toBeCloseTo(10.5 - 2 * expectedStd, 10);
  });

  test('bands collapse onto the mean for a constant series', () => {
    const result = calculateBollingerBands(Array.from({ length: 20 }, () => 7));
    expect(result.upper[0]).toBe(7);
    expect(result.middle[0]).toBe(7);
    expect(result.lower[0]).toBe(7);
  });

  test('honours custom period and standard-deviation multipliers', () => {
    const series = Array.from({ length: 10 }, (_v, i) => i + 1);
    const result = calculateBollingerBands(series, 5, 3);
    expect(result.middle).toHaveLength(6);
    expect(result.upper[0]).toBe(3 + 3 * Math.sqrt(2));
    expect(result.lower[0]).toBe(3 - 3 * Math.sqrt(2));
  });
});

// Residual branches: the `parts[i] || ''` fallbacks in normalizeDate and the defensive
// `undefined` guards inside the indicator loops. Holes are the only way to reach them, because
// every producer pushes a computed number, so an index inside a result array is never undefined.
describe('normalizeDate — empty segments of an unparsed three-part input', () => {
  test('every missing segment becomes its zero-padded empty string, not the original token', () => {
    // `new Date('--')` is invalid, so the split/zero-pad branch runs on ['', '', ''].
    expect(normalizeDate('--')).toBe('0000-00-00');
    expect(normalizeDate('-1-2024')).toBe('0000-01-2024');
    expect(normalizeDate('2024--05')).toBe('2024-00-05');
    expect(normalizeDate('-0-0')).toBe('0000-00-00');
  });

  test('the guard is a zero-pad, so a garbage segment is echoed at width 4/2/2', () => {
    expect(normalizeDate('xx-yy-zz')).toBe('00xx-yy-zz');
  });
});

describe('calculateRSI — holes and a degenerate period', () => {
  test('a hole in the seed window is skipped, and the all-losses-free window saturates at 100', () => {
    // prices[1] is undefined: the seed loop `continue`s on both the current and the previous
    // guard, so gains and losses stay 0 and avgLoss === 0 short-circuits the whole result.
    const series = [10, undefined, 12, 13, 14] as unknown as number[];
    expect(calculateRSI(series, 2)).toEqual([100, 100, 100]);
  });

  test('a hole in the smoothing window truncates the output rather than poisoning it with NaN', () => {
    const series = [10, 5, undefined, 8] as unknown as number[];
    const rsi = calculateRSI(series, 1);
    expect(rsi).toEqual([0]);
    expect(rsi.every((value) => !Number.isNaN(value))).toBe(true);
  });

  test('period 1 lets avgLoss collapse to exactly 0 mid-series, which pushes the literal 100', () => {
    // With period 1 the Wilder smoothing is (avgLoss * 0 + loss) / 1, so a single gain zeroes it.
    expect(calculateRSI([10, 5, 8], 1)).toEqual([0, 100]);
    expect(calculateRSI([10, 5, 8, 4, 9], 1)).toEqual([0, 100, 0, 100]);
  });
});

describe('calculateMACD — holes and a degenerate period', () => {
  test('zero periods short-circuit the private EMA guard and yield three empty arrays', () => {
    expect(calculateMACD([1, 2, 3, 4, 5], 0, 0, 0)).toEqual({ macd: [], signal: [], histogram: [] });
  });

  test('a missing first price seeds both EMAs at 0 instead of the first real value', () => {
    // `ema.push(prices[0] ?? 0)` — the seed is what drags the slow EMA, so the gap is visible.
    const withHole = calculateMACD([undefined, 100, 200] as unknown as number[], 1, 2, 1);
    const withPrice = calculateMACD([50, 100, 200], 1, 2, 1);
    expect(withHole.macd[1]).toBeCloseTo(100 - (100 * (2 / 3) + 0 * (1 / 3)), 10);
    expect(withPrice.macd[1]).toBeCloseTo(100 - (100 * (2 / 3) + 50 * (1 / 3)), 10);
    expect(withHole.macd[1]).not.toBeCloseTo(withPrice.macd[1] as number, 5);
  });

  test('a hole truncates the EMA, so MACD silently collapses from four points to one', () => {
    const series = [1, undefined, 3, 4] as unknown as number[];
    const result = calculateMACD(series, 1, 1, 1);
    // The EMA loop can no longer read ema[i-1] after the skip, so every later point is dropped.
    expect(result.macd).toEqual([0]);
    expect(result.signal).toEqual([0]);
    expect(result.histogram).toEqual([0]);
  });
});
