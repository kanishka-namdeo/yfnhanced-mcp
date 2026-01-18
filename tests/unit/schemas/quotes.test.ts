import { QuoteInputSchema, QuoteResultSchema, QuoteMetaSchema, QuoteOutputSchema } from '../../../src/schemas/quotes';

describe('QuoteInputSchema', () => {
  test('should validate valid quote input', () => {
    const input = { symbols: ['AAPL', 'MSFT'] };
    const result = QuoteInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should validate single symbol', () => {
    const input = { symbols: ['AAPL'] };
    const result = QuoteInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should reject empty symbols array', () => {
    const input = { symbols: [] };
    const result = QuoteInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject missing symbols', () => {
    const input = {};
    const result = QuoteInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject invalid symbol type', () => {
    const input = { symbols: [123] };
    const result = QuoteInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject empty symbol string', () => {
    const input = { symbols: [''] };
    const result = QuoteInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('QuoteResultSchema', () => {
  test('should validate quote result with all fields', () => {
    const result = {
      symbol: 'AAPL',
      price: 150.5,
      change: 2.5,
      changePercent: 1.69,
      volume: 50000000,
      marketCap: 2500000000000,
      currency: 'USD',
      timestamp: 1705327800000
    };
    const parseResult = QuoteResultSchema.safeParse(result);
    expect(parseResult.success).toBe(true);
  });

  test('should validate quote result with required fields only', () => {
    const result = {
      symbol: 'AAPL',
      price: 150.5,
      currency: 'USD',
      timestamp: 1705327800000
    };
    const parseResult = QuoteResultSchema.safeParse(result);
    expect(parseResult.success).toBe(true);
  });

  test('should reject missing symbol', () => {
    const result = {
      price: 150.5,
      currency: 'USD',
      timestamp: 1705327800000
    };
    const parseResult = QuoteResultSchema.safeParse(result);
    expect(parseResult.success).toBe(false);
  });

  test('should reject missing price', () => {
    const result = {
      symbol: 'AAPL',
      currency: 'USD',
      timestamp: 1705327800000
    };
    const parseResult = QuoteResultSchema.safeParse(result);
    expect(parseResult.success).toBe(false);
  });

  test('should accept null for optional fields', () => {
    const result = {
      symbol: 'AAPL',
      price: 150.5,
      change: null,
      volume: null,
      currency: 'USD',
      timestamp: 1705327800000
    };
    const parseResult = QuoteResultSchema.safeParse(result);
    expect(parseResult.success).toBe(true);
  });

  test('should reject negative price', () => {
    const result = {
      symbol: 'AAPL',
      price: -150.5,
      currency: 'USD',
      timestamp: 1705327800000
    };
    const parseResult = QuoteResultSchema.safeParse(result);
    expect(parseResult.success).toBe(false);
  });

  test('should accept zero price', () => {
    const result = {
      symbol: 'AAPL',
      price: 0,
      currency: 'USD',
      timestamp: 1705327800000
    };
    const parseResult = QuoteResultSchema.safeParse(result);
    expect(parseResult.success).toBe(true);
  });
});

describe('QuoteMetaSchema', () => {
  test('should validate meta with all fields', () => {
    const meta = {
      count: 2,
      sources: ['yahoo-finance'],
      timestamp: 1705327800000,
      hasErrors: false
    };
    const result = QuoteMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  test('should validate meta with required fields only', () => {
    const meta = {
      count: 1
    };
    const result = QuoteMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  test('should reject negative count', () => {
    const meta = {
      count: -1
    };
    const result = QuoteMetaSchema.safeParse(meta);
    expect(result.success).toBe(false);
  });

  test('should accept zero count', () => {
    const meta = {
      count: 0
    };
    const result = QuoteMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  test('should accept boolean hasErrors', () => {
    const meta = {
      count: 1,
      hasErrors: true
    };
    const result = QuoteMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  test('should accept array sources', () => {
    const meta = {
      count: 1,
      sources: ['yahoo-finance', 'cache']
    };
    const result = QuoteMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });
});

describe('QuoteOutputSchema', () => {
  test('should validate complete output', () => {
    const output = {
      success: true,
      data: [
        {
          symbol: 'AAPL',
          price: 150.5,
          currency: 'USD',
          timestamp: 1705327800000
        }
      ],
      meta: {
        count: 1
      }
    };
    const result = QuoteOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('should validate output with errors', () => {
    const output = {
      success: false,
      data: [],
      errors: [
        {
          code: 'YF_ERR_NOT_FOUND',
          message: 'Symbol not found',
          symbol: 'INVALID'
        }
      ],
      meta: {
        count: 0,
        hasErrors: true
      }
    };
    const result = QuoteOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('should reject missing success', () => {
    const output = {
      data: [],
      meta: { count: 0 }
    };
    const result = QuoteOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing data', () => {
    const output = {
      success: true,
      meta: { count: 0 }
    };
    const result = QuoteOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing meta', () => {
    const output = {
      success: true,
      data: []
    };
    const result = QuoteOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should accept null errors when success is true', () => {
    const output = {
      success: true,
      data: [
        {
          symbol: 'AAPL',
          price: 150.5,
          currency: 'USD',
          timestamp: 1705327800000
        }
      ],
      errors: null,
      meta: {
        count: 1
      }
    };
    const result = QuoteOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('should require errors when success is false', () => {
    const output = {
      success: false,
      data: [],
      meta: {
        count: 0,
        hasErrors: true
      }
    };
    const result = QuoteOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });
});
