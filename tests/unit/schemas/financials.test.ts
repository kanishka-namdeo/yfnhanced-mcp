import { FinancialsInputSchema, FinancialStatementSchema, FinancialsOutputSchema } from '../../../src/schemas/financials';

describe('FinancialsInputSchema', () => {
  test('should validate valid financials input', () => {
    const input = {
      symbol: 'AAPL',
      statementType: 'income-statement',
      periodType: 'annual'
    };
    const result = FinancialsInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should validate input with count', () => {
    const input = {
      symbol: 'AAPL',
      statementType: 'balance-sheet',
      periodType: 'quarterly',
      count: 5
    };
    const result = FinancialsInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should reject missing symbol', () => {
    const input = {
      statementType: 'income-statement',
      periodType: 'annual'
    };
    const result = FinancialsInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject invalid statementType', () => {
    const input = {
      symbol: 'AAPL',
      statementType: 'invalid',
      periodType: 'annual'
    };
    const result = FinancialsInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject invalid periodType', () => {
    const input = {
      symbol: 'AAPL',
      statementType: 'income-statement',
      periodType: 'invalid'
    };
    const result = FinancialsInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject negative count', () => {
    const input = {
      symbol: 'AAPL',
      statementType: 'income-statement',
      periodType: 'annual',
      count: -5
    };
    const result = FinancialsInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should accept valid statementTypes', () => {
    const types = ['income-statement', 'balance-sheet', 'cash-flow'];
    types.forEach(type => {
      const input = {
        symbol: 'AAPL',
        statementType: type,
        periodType: 'annual'
      };
      const result = FinancialsInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  test('should accept valid periodTypes', () => {
    const types = ['annual', 'quarterly'];
    types.forEach(type => {
      const input = {
        symbol: 'AAPL',
        statementType: 'income-statement',
        periodType: type
      };
      const result = FinancialsInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });
});

describe('FinancialStatementSchema', () => {
  test('should validate financial statement with all fields', () => {
    const statement = {
      date: '2024-01-15',
      currency: 'USD',
      data: {
        totalRevenue: 394328000000,
        netIncome: 99803000000
      }
    };
    const result = FinancialStatementSchema.safeParse(statement);
    expect(result.success).toBe(true);
  });

  test('should validate statement with required fields', () => {
    const statement = {
      date: '2024-01-15',
      data: {}
    };
    const result = FinancialStatementSchema.safeParse(statement);
    expect(result.success).toBe(true);
  });

  test('should reject missing date', () => {
    const statement = {
      currency: 'USD',
      data: {}
    };
    const result = FinancialStatementSchema.safeParse(statement);
    expect(result.success).toBe(false);
  });

  test('should reject missing data', () => {
    const statement = {
      date: '2024-01-15',
      currency: 'USD'
    };
    const result = FinancialStatementSchema.safeParse(statement);
    expect(result.success).toBe(false);
  });

  test('should accept null currency', () => {
    const statement = {
      date: '2024-01-15',
      currency: null,
      data: {}
    };
    const result = FinancialStatementSchema.safeParse(statement);
    expect(result.success).toBe(true);
  });

  test('should accept numeric values in data', () => {
    const statement = {
      date: '2024-01-15',
      data: {
        value1: 1000000,
        value2: -500000
      }
    };
    const result = FinancialStatementSchema.safeParse(statement);
    expect(result.success).toBe(true);
  });

  test('should accept null values in data', () => {
    const statement = {
      date: '2024-01-15',
      data: {
        value1: 1000000,
        value2: null
      }
    };
    const result = FinancialStatementSchema.safeParse(statement);
    expect(result.success).toBe(true);
  });
});

describe('FinancialsOutputSchema', () => {
  test('should validate complete financials output', () => {
    const output = {
      success: true,
      data: {
        symbol: 'AAPL',
        statementType: 'income-statement',
        periodType: 'annual',
        statements: [
          {
            date: '2024-01-15',
            data: {
              totalRevenue: 394328000000
            }
          }
        ]
      }
    };
    const result = FinancialsOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('should validate output with empty statements', () => {
    const output = {
      success: true,
      data: {
        symbol: 'AAPL',
        statementType: 'income-statement',
        periodType: 'annual',
        statements: []
      }
    };
    const result = FinancialsOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('should reject missing symbol', () => {
    const output = {
      success: true,
      data: {
        statementType: 'income-statement',
        periodType: 'annual',
        statements: []
      }
    };
    const result = FinancialsOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing statementType', () => {
    const output = {
      success: true,
      data: {
        symbol: 'AAPL',
        periodType: 'annual',
        statements: []
      }
    };
    const result = FinancialsOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing periodType', () => {
    const output = {
      success: true,
      data: {
        symbol: 'AAPL',
        statementType: 'income-statement',
        statements: []
      }
    };
    const result = FinancialsOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing statements', () => {
    const output = {
      success: true,
      data: {
        symbol: 'AAPL',
        statementType: 'income-statement',
        periodType: 'annual'
      }
    };
    const result = FinancialsOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should accept null errors when success is true', () => {
    const output = {
      success: true,
      data: {
        symbol: 'AAPL',
        statementType: 'income-statement',
        periodType: 'annual',
        statements: []
      },
      errors: null
    };
    const result = FinancialsOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('should require errors when success is false', () => {
    const output = {
      success: false,
      data: null,
      errors: []
    };
    const result = FinancialsOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });
});
