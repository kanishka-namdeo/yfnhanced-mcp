import { HistoricalInputSchema, HistoricalPriceSchema, HistoricalOutputSchema } from '../../../src/schemas/historical';

describe('HistoricalInputSchema', () => {
  test('should validate valid historical input', () => {
    const input = {
      symbol: 'AAPL',
      period: '1mo',
      interval: '1d'
    };
    const result = HistoricalInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should validate input with date range', () => {
    const input = {
      symbol: 'AAPL',
      startDate: '2024-01-01',
      endDate: '2024-01-31',
      interval: '1d'
    };
    const result = HistoricalInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should reject missing symbol', () => {
    const input = {
      period: '1mo',
      interval: '1d'
    };
    const result = HistoricalInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject invalid period', () => {
    const input = {
      symbol: 'AAPL',
      period: 'invalid',
      interval: '1d'
    };
    const result = HistoricalInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject invalid interval', () => {
    const input = {
      symbol: 'AAPL',
      period: '1mo',
      interval: 'invalid'
    };
    const result = HistoricalInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should accept valid periods', () => {
    const periods = ['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', '10y', 'ytd', 'max'];
    periods.forEach(period => {
      const input = {
        symbol: 'AAPL',
        period,
        interval: '1d'
      };
      const result = HistoricalInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  test('should accept valid intervals', () => {
    const intervals = ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo'];
    intervals.forEach(interval => {
      const input = {
        symbol: 'AAPL',
        period: '1mo',
        interval
      };
      const result = HistoricalInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  test('should accept prePost option', () => {
    const input = {
      symbol: 'AAPL',
      period: '1mo',
      interval: '1d',
      includePrePost: true
    };
    const result = HistoricalInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('HistoricalPriceSchema', () => {
  test('should validate historical price with all fields', () => {
    const price = {
      date: '2024-01-15',
      open: 150,
      high: 155,
      low: 148,
      close: 152,
      adjustedClose: 150,
      volume: 50000000
    };
    const result = HistoricalPriceSchema.safeParse(price);
    expect(result.success).toBe(true);
  });

  test('should validate historical price with required fields', () => {
    const price = {
      date: '2024-01-15',
      open: 150,
      high: 155,
      low: 148,
      close: 152,
      volume: 50000000
    };
    const result = HistoricalPriceSchema.safeParse(price);
    expect(result.success).toBe(true);
  });

  test('should reject missing date', () => {
    const price = {
      open: 150,
      high: 155,
      low: 148,
      close: 152,
      volume: 50000000
    };
    const result = HistoricalPriceSchema.safeParse(price);
    expect(result.success).toBe(false);
  });

  test('should reject missing close', () => {
    const price = {
      date: '2024-01-15',
      open: 150,
      high: 155,
      low: 148,
      volume: 50000000
    };
    const result = HistoricalPriceSchema.safeParse(price);
    expect(result.success).toBe(false);
  });

  test('should reject negative values', () => {
    const price = {
      date: '2024-01-15',
      open: -150,
      high: 155,
      low: 148,
      close: 152,
      volume: 50000000
    };
    const result = HistoricalPriceSchema.safeParse(price);
    expect(result.success).toBe(false);
  });

  test('should accept zero values', () => {
    const price = {
      date: '2024-01-15',
      open: 0,
      high: 0,
      low: 0,
      close: 0,
      volume: 0
    };
    const result = HistoricalPriceSchema.safeParse(price);
    expect(result.success).toBe(true);
  });

  test('should accept null for adjustedClose', () => {
    const price = {
      date: '2024-01-15',
      open: 150,
      high: 155,
      low: 148,
      close: 152,
      adjustedClose: null,
      volume: 50000000
    };
    const result = HistoricalPriceSchema.safeParse(price);
    expect(result.success).toBe(true);
  });
});

describe('HistoricalOutputSchema', () => {
  test('should validate complete historical output', () => {
    const output = {
      success: true,
      data: {
        symbol: 'AAPL',
        currency: 'USD',
        prices: [
          {
            date: '2024-01-15',
            open: 150,
            high: 155,
            low: 148,
            close: 152,
            volume: 50000000
          }
        ],
        meta: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          interval: '1d',
          period: '1mo'
        }
      }
    };
    const result = HistoricalOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('should validate output with empty prices', () => {
    const output = {
      success: true,
      data: {
        symbol: 'AAPL',
        currency: 'USD',
        prices: [],
        meta: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          interval: '1d',
          period: '1mo'
        }
      }
    };
    const result = HistoricalOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('should reject missing symbol', () => {
    const output = {
      success: true,
      data: {
        currency: 'USD',
        prices: [],
        meta: {}
      }
    };
    const result = HistoricalOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing prices', () => {
    const output = {
      success: true,
      data: {
        symbol: 'AAPL',
        currency: 'USD',
        meta: {}
      }
    };
    const result = HistoricalOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing meta', () => {
    const output = {
      success: true,
      data: {
        symbol: 'AAPL',
        currency: 'USD',
        prices: []
      }
    };
    const result = HistoricalOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should accept null errors when success is true', () => {
    const output = {
      success: true,
      data: {
        symbol: 'AAPL',
        currency: 'USD',
        prices: [],
        meta: {}
      },
      errors: null
    };
    const result = HistoricalOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('should require errors when success is false', () => {
    const output = {
      success: false,
      data: null,
      errors: []
    };
    const result = HistoricalOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });
});
