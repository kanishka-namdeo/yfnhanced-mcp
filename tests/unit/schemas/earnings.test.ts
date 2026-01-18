import { EarningsInputSchema, EarningsQuarterlySchema, EarningsDataSchema, EarningsMetaSchema, EarningsOutputSchema } from '../../../src/schemas/earnings';

describe('EarningsInputSchema', () => {
  test('should validate valid earnings input', () => {
    const input = { symbol: 'AAPL' };
    const result = EarningsInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should reject missing symbol', () => {
    const input = {};
    const result = EarningsInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject empty symbol', () => {
    const input = { symbol: '' };
    const result = EarningsInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject non-string symbol', () => {
    const input = { symbol: 123 };
    const result = EarningsInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

describe('EarningsQuarterlySchema', () => {
  test('should validate quarterly earnings with all fields', () => {
    const quarterly = {
      quarter: 'Q1 2024',
      actual: 2.18,
      estimate: 2.10,
      surprise: 0.08,
      surprisePercent: 3.81
    };
    const result = EarningsQuarterlySchema.safeParse(quarterly);
    expect(result.success).toBe(true);
  });

  test('should validate quarterly earnings with required fields', () => {
    const quarterly = {
      quarter: 'Q1 2024',
      actual: 2.18,
      estimate: 2.10
    };
    const result = EarningsQuarterlySchema.safeParse(quarterly);
    expect(result.success).toBe(true);
  });

  test('should reject missing quarter', () => {
    const quarterly = {
      actual: 2.18,
      estimate: 2.10
    };
    const result = EarningsQuarterlySchema.safeParse(quarterly);
    expect(result.success).toBe(false);
  });

  test('should reject missing actual', () => {
    const quarterly = {
      quarter: 'Q1 2024',
      estimate: 2.10
    };
    const result = EarningsQuarterlySchema.safeParse(quarterly);
    expect(result.success).toBe(false);
  });

  test('should reject missing estimate', () => {
    const quarterly = {
      quarter: 'Q1 2024',
      actual: 2.18
    };
    const result = EarningsQuarterlySchema.safeParse(quarterly);
    expect(result.success).toBe(false);
  });

  test('should accept null for optional fields', () => {
    const quarterly = {
      quarter: 'Q1 2024',
      actual: 2.18,
      estimate: 2.10,
      surprise: null,
      surprisePercent: null
    };
    const result = EarningsQuarterlySchema.safeParse(quarterly);
    expect(result.success).toBe(true);
  });

  test('should accept negative values', () => {
    const quarterly = {
      quarter: 'Q1 2024',
      actual: -0.50,
      estimate: 0.10,
      surprise: -0.60,
      surprisePercent: -600
    };
    const result = EarningsQuarterlySchema.safeParse(quarterly);
    expect(result.success).toBe(true);
  });

  test('should accept zero values', () => {
    const quarterly = {
      quarter: 'Q1 2024',
      actual: 0,
      estimate: 0,
      surprise: 0,
      surprisePercent: 0
    };
    const result = EarningsQuarterlySchema.safeParse(quarterly);
    expect(result.success).toBe(true);
  });
});

describe('EarningsDataSchema', () => {
  test('should validate earnings data with all fields', () => {
    const data = {
      symbol: 'AAPL',
      currency: 'USD',
      quarterly: [
        {
          quarter: 'Q1 2024',
          actual: 2.18,
          estimate: 2.10
        }
      ],
      currentQuarterEstimate: 2.25,
      nextQuarterEstimate: 2.30
    };
    const result = EarningsDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test('should validate earnings data with required fields', () => {
    const data = {
      symbol: 'AAPL',
      quarterly: []
    };
    const result = EarningsDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test('should reject missing symbol', () => {
    const data = {
      quarterly: []
    };
    const result = EarningsDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test('should reject missing quarterly', () => {
    const data = {
      symbol: 'AAPL'
    };
    const result = EarningsDataSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  test('should accept null currency', () => {
    const data = {
      symbol: 'AAPL',
      currency: null,
      quarterly: []
    };
    const result = EarningsDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test('should accept null for optional estimates', () => {
    const data = {
      symbol: 'AAPL',
      quarterly: [],
      currentQuarterEstimate: null,
      nextQuarterEstimate: null
    };
    const result = EarningsDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  test('should accept empty quarterly array', () => {
    const data = {
      symbol: 'AAPL',
      quarterly: []
    };
    const result = EarningsDataSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

describe('EarningsMetaSchema', () => {
  test('should validate meta with all fields', () => {
    const meta = {
      count: 4,
      currency: 'USD',
      lastUpdated: 1705327800000
    };
    const result = EarningsMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  test('should validate meta with required fields', () => {
    const meta = {
      count: 4
    };
    const result = EarningsMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  test('should reject negative count', () => {
    const meta = {
      count: -1
    };
    const result = EarningsMetaSchema.safeParse(meta);
    expect(result.success).toBe(false);
  });

  test('should accept zero count', () => {
    const meta = {
      count: 0
    };
    const result = EarningsMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  test('should accept null currency', () => {
    const meta = {
      count: 4,
      currency: null
    };
    const result = EarningsMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  test('should accept null lastUpdated', () => {
    const meta = {
      count: 4,
      lastUpdated: null
    };
    const result = EarningsMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });
});

describe('EarningsOutputSchema', () => {
  test('should validate complete earnings output', () => {
    const output = {
      success: true,
      data: {
        symbol: 'AAPL',
        quarterly: [
          {
            quarter: 'Q1 2024',
            actual: 2.18,
            estimate: 2.10
          }
        ]
      },
      meta: {
        count: 1
      }
    };
    const result = EarningsOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('should validate output with empty data', () => {
    const output = {
      success: true,
      data: {
        symbol: 'AAPL',
        quarterly: []
      },
      meta: {
        count: 0
      }
    };
    const result = EarningsOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('should reject missing success', () => {
    const output = {
      data: {
        symbol: 'AAPL',
        quarterly: []
      },
      meta: {
        count: 0
      }
    };
    const result = EarningsOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing data', () => {
    const output = {
      success: true,
      meta: {
        count: 0
      }
    };
    const result = EarningsOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing meta', () => {
    const output = {
      success: true,
      data: {
        symbol: 'AAPL',
        quarterly: []
      }
    };
    const result = EarningsOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should accept null errors when success is true', () => {
    const output = {
      success: true,
      data: {
        symbol: 'AAPL',
        quarterly: []
      },
      errors: null,
      meta: {
        count: 0
      }
    };
    const result = EarningsOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('should require errors when success is false', () => {
    const output = {
      success: false,
      data: null,
      errors: []
    };
    const result = EarningsOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });
});
