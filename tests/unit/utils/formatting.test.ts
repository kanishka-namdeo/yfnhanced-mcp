import { formatCurrency, formatNumber, formatPercentage, formatDate, formatLargeNumber, formatTime, formatPrice, formatVolume } from '../../../src/utils/formatting';

describe('formatCurrency', () => {
  test('should format USD currency', () => {
    const result = formatCurrency(150.5, 'USD');
    expect(result).toContain('$150.50');
  });

  test('should format EUR currency', () => {
    const result = formatCurrency(150.5, 'EUR');
    expect(result).toContain('150.50');
  });

  test('should format GBP currency', () => {
    const result = formatCurrency(150.5, 'GBP');
    expect(result).toContain('£');
  });

  test('should format JPY currency', () => {
    const result = formatCurrency(150.5, 'JPY');
    expect(result).toContain('¥');
  });

  test('should format with default currency', () => {
    const result = formatCurrency(150.5);
    expect(result).toContain('$150.50');
  });

  test('should format negative values', () => {
    const result = formatCurrency(-150.5, 'USD');
    expect(result).toContain('-$150.50');
  });

  test('should handle zero', () => {
    const result = formatCurrency(0, 'USD');
    expect(result).toContain('$0.00');
  });

  test('should format large values', () => {
    const result = formatCurrency(1500000.5, 'USD');
    expect(result).toContain('1,500,000.50');
  });

  test('should format with custom decimals', () => {
    const result = formatCurrency(150.567, 'USD', 3);
    expect(result).toContain('150.567');
  });

  test('should handle null', () => {
    const result = formatCurrency(null, 'USD');
    expect(result).toBe('N/A');
  });

  test('should handle undefined', () => {
    const result = formatCurrency(undefined, 'USD');
    expect(result).toBe('N/A');
  });

  test('should handle NaN', () => {
    const result = formatCurrency(NaN, 'USD');
    expect(result).toBe('N/A');
  });

  test('should handle Infinity', () => {
    const result = formatCurrency(Infinity, 'USD');
    expect(result).toBe('N/A');
  });
});

describe('formatNumber', () => {
  test('should format basic number', () => {
    const result = formatNumber(150.5);
    expect(result).toBe('150.5');
  });

  test('should format with commas', () => {
    const result = formatNumber(1500000.5);
    expect(result).toBe('1,500,000.5');
  });

  test('should format negative numbers', () => {
    const result = formatNumber(-150.5);
    expect(result).toBe('-150.5');
  });

  test('should format zero', () => {
    const result = formatNumber(0);
    expect(result).toBe('0');
  });

  test('should format with custom decimals', () => {
    const result = formatNumber(150.567, 3);
    expect(result).toBe('150.567');
  });

  test('should format with zero decimals', () => {
    const result = formatNumber(150.567, 0);
    expect(result).toBe('151');
  });

  test('should handle null', () => {
    const result = formatNumber(null);
    expect(result).toBe('N/A');
  });

  test('should handle undefined', () => {
    const result = formatNumber(undefined);
    expect(result).toBe('N/A');
  });

  test('should handle NaN', () => {
    const result = formatNumber(NaN);
    expect(result).toBe('N/A');
  });
});

describe('formatPercentage', () => {
  test('should format positive percentage', () => {
    const result = formatPercentage(2.5);
    expect(result).toContain('+2.50%');
  });

  test('should format negative percentage', () => {
    const result = formatPercentage(-2.5);
    expect(result).toContain('-2.50%');
  });

  test('should format zero percentage', () => {
    const result = formatPercentage(0);
    expect(result).toContain('0.00%');
  });

  test('should format with custom decimals', () => {
    const result = formatPercentage(2.567, 3);
    expect(result).toContain('2.567%');
  });

  test('should handle null', () => {
    const result = formatPercentage(null);
    expect(result).toBe('N/A');
  });

  test('should handle undefined', () => {
    const result = formatPercentage(undefined);
    expect(result).toBe('N/A');
  });

  test('should handle NaN', () => {
    const result = formatPercentage(NaN);
    expect(result).toBe('N/A');
  });

  test('should format large percentages', () => {
    const result = formatPercentage(150.5);
    expect(result).toContain('150.50%');
  });

  test('should format small percentages', () => {
    const result = formatPercentage(0.015);
    expect(result).toContain('0.015%');
  });
});

describe('formatDate', () => {
  test('should format ISO date', () => {
    const result = formatDate('2024-01-15T10:30:00Z');
    expect(result).toContain('2024');
  });

  test('should format timestamp', () => {
    const result = formatDate(1705327800000);
    expect(result).toBeDefined();
  });

  test('should format Date object', () => {
    const result = formatDate(new Date('2024-01-15'));
    expect(result).toContain('2024');
  });

  test('should handle null', () => {
    const result = formatDate(null);
    expect(result).toBe('N/A');
  });

  test('should handle undefined', () => {
    const result = formatDate(undefined);
    expect(result).toBe('N/A');
  });

  test('should handle invalid date', () => {
    const result = formatDate('invalid');
    expect(result).toBe('N/A');
  });

  test('should format with custom format', () => {
    const result = formatDate('2024-01-15', 'YYYY-MM-DD');
    expect(result).toContain('2024-01-15');
  });

  test('should handle timestamp string', () => {
    const result = formatDate('1705327800000');
    expect(result).toBeDefined();
  });
});

describe('formatLargeNumber', () => {
  test('should format thousands', () => {
    const result = formatLargeNumber(1500);
    expect(result).toBe('1.5K');
  });

  test('should format millions', () => {
    const result = formatLargeNumber(1500000);
    expect(result).toBe('1.5M');
  });

  test('should format billions', () => {
    const result = formatLargeNumber(1500000000);
    expect(result).toBe('1.5B');
  });

  test('should format trillions', () => {
    const result = formatLargeNumber(1500000000000);
    expect(result).toBe('1.5T');
  });

  test('should format small numbers', () => {
    const result = formatLargeNumber(150);
    expect(result).toBe('150');
  });

  test('should format zero', () => {
    const result = formatLargeNumber(0);
    expect(result).toBe('0');
  });

  test('should format negative numbers', () => {
    const result = formatLargeNumber(-1500000);
    expect(result).toBe('-1.5M');
  });

  test('should handle null', () => {
    const result = formatLargeNumber(null);
    expect(result).toBe('N/A');
  });

  test('should handle undefined', () => {
    const result = formatLargeNumber(undefined);
    expect(result).toBe('N/A');
  });

  test('should format with custom decimals', () => {
    const result = formatLargeNumber(1500000, 2);
    expect(result).toBe('1.50M');
  });
});

describe('formatTime', () => {
  test('should format time in milliseconds', () => {
    const result = formatTime(1500);
    expect(result).toBe('1.5s');
  });

  test('should format time in seconds', () => {
    const result = formatTime(50000);
    expect(result).toBe('50s');
  });

  test('should format time in minutes', () => {
    const result = formatTime(90000);
    expect(result).toBe('1.5m');
  });

  test('should format time in hours', () => {
    const result = formatTime(3600000);
    expect(result).toBe('1h');
  });

  test('should format zero time', () => {
    const result = formatTime(0);
    expect(result).toBe('0ms');
  });

  test('should handle null', () => {
    const result = formatTime(null);
    expect(result).toBe('N/A');
  });

  test('should handle undefined', () => {
    const result = formatTime(undefined);
    expect(result).toBe('N/A');
  });
});

describe('formatPrice', () => {
  test('should format stock price', () => {
    const result = formatPrice(150.5);
    expect(result).toBe('$150.50');
  });

  test('should format negative price', () => {
    const result = formatPrice(-150.5);
    expect(result).toBe('-$150.50');
  });

  test('should format zero price', () => {
    const result = formatPrice(0);
    expect(result).toBe('$0.00');
  });

  test('should format with change', () => {
    const result = formatPrice(150.5, 2.5);
    expect(result).toContain('$150.50');
    expect(result).toContain('+2.50');
  });

  test('should format with negative change', () => {
    const result = formatPrice(150.5, -2.5);
    expect(result).toContain('$150.50');
    expect(result).toContain('-2.50');
  });

  test('should handle null price', () => {
    const result = formatPrice(null);
    expect(result).toBe('N/A');
  });

  test('should handle undefined price', () => {
    const result = formatPrice(undefined);
    expect(result).toBe('N/A');
  });

  test('should handle null change', () => {
    const result = formatPrice(150.5, null);
    expect(result).toBe('$150.50');
  });

  test('should format with custom currency', () => {
    const result = formatPrice(150.5, 0, 'EUR');
    expect(result).toContain('€150.50');
  });
});

describe('formatVolume', () => {
  test('should format volume in shares', () => {
    const result = formatVolume(1500000);
    expect(result).toBe('1.5M');
  });

  test('should format volume in thousands', () => {
    const result = formatVolume(1500);
    expect(result).toBe('1.5K');
  });

  test('should format volume in millions', () => {
    const result = formatVolume(1500000);
    expect(result).toBe('1.5M');
  });

  test('should format volume in billions', () => {
    const result = formatVolume(1500000000);
    expect(result).toBe('1.5B');
  });

  test('should format zero volume', () => {
    const result = formatVolume(0);
    expect(result).toBe('0');
  });

  test('should handle null volume', () => {
    const result = formatVolume(null);
    expect(result).toBe('N/A');
  });

  test('should handle undefined volume', () => {
    const result = formatVolume(undefined);
    expect(result).toBe('N/A');
  });

  test('should format with custom unit', () => {
    const result = formatVolume(1500000, 'shares');
    expect(result).toContain('1.5M');
  });
});
