import { FinancialsInputSchema, FinancialStatementSchema, FinancialsOutputSchema } from '../../../src/schemas/financials';

// Real shapes (src/schemas/financials.ts). The input is symbol / frequency
// ('annual'|'quarterly') / limit — there is NO statementType/periodType/count.
// FinancialStatementSchema keys are period / startDate? / endDate / records.
// startDate is deliberately OPTIONAL; an empty string fails the ISO regex (the bug
// that killed all three statement tools), so omission is the valid path.
const validStatement = {
  period: '2024',
  endDate: '2024-12-31'
};

const validMeta = {
  fromCache: false,
  dataAge: 0,
  completenessScore: 1,
  warnings: [],
  recency: '2024-12-31'
};

describe('FinancialsInputSchema', () => {
  test('accepts a bare symbol', () => {
    expect(FinancialsInputSchema.safeParse({ symbol: 'AAPL' }).success).toBe(true);
  });

  test('accepts the optional frequency and limit', () => {
    expect(FinancialsInputSchema.safeParse({ symbol: 'AAPL', frequency: 'annual', limit: 5 }).success).toBe(true);
    expect(FinancialsInputSchema.safeParse({ symbol: 'AAPL', frequency: 'quarterly' }).success).toBe(true);
  });

  test('frequency accepts only annual or quarterly', () => {
    expect(FinancialsInputSchema.safeParse({ symbol: 'AAPL', frequency: 'monthly' }).success).toBe(false);
  });

  test('rejects a missing / empty / over-long symbol', () => {
    expect(FinancialsInputSchema.safeParse({}).success).toBe(false);
    expect(FinancialsInputSchema.safeParse({ symbol: '' }).success).toBe(false);
    expect(FinancialsInputSchema.safeParse({ symbol: 'A'.repeat(21) }).success).toBe(false);
  });

  test('limit must be an int within 1-20', () => {
    expect(FinancialsInputSchema.safeParse({ symbol: 'AAPL', limit: 0 }).success).toBe(false);
    expect(FinancialsInputSchema.safeParse({ symbol: 'AAPL', limit: 21 }).success).toBe(false);
    expect(FinancialsInputSchema.safeParse({ symbol: 'AAPL', limit: 4.5 }).success).toBe(false);
  });

  test('unknown statementType / periodType / count keys are stripped, not rejected', () => {
    const result = FinancialsInputSchema.safeParse({
      symbol: 'AAPL',
      statementType: 'income-statement',
      periodType: 'annual',
      count: 5
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ symbol: 'AAPL' });
  });
});

describe('FinancialStatementSchema', () => {
  test('accepts period + endDate with startDate omitted (optional by design)', () => {
    expect(FinancialStatementSchema.safeParse(validStatement).success).toBe(true);
  });

  test('DEFECT GUARD PIN: startDate is optional, but an empty string fails the ISO regex', () => {
    expect(FinancialStatementSchema.safeParse({ ...validStatement, startDate: '2024-01-01' }).success).toBe(true);
    expect(FinancialStatementSchema.safeParse({ ...validStatement, startDate: '' }).success).toBe(false);
  });

  test('endDate is required and must match the ISO regex', () => {
    const { endDate, ...noEnd } = validStatement;
    expect(FinancialStatementSchema.safeParse(noEnd).success).toBe(false);
    expect(FinancialStatementSchema.safeParse({ period: '2024', endDate: '12-31-2024' }).success).toBe(false);
  });

  test('rejects a missing period', () => {
    const { period, ...noPeriod } = validStatement;
    expect(FinancialStatementSchema.safeParse(noPeriod).success).toBe(false);
  });

  test('statement records map string keys to number-or-null', () => {
    expect(FinancialStatementSchema.safeParse({ ...validStatement, balanceSheet: { totalAssets: 100, x: null } }).success).toBe(
      true
    );
    expect(FinancialStatementSchema.safeParse({ ...validStatement, incomeStatement: { revenue: 'x' } }).success).toBe(false);
  });

  test('fieldAvailability maps string keys to booleans', () => {
    expect(FinancialStatementSchema.safeParse({ ...validStatement, fieldAvailability: { totalAssets: true } }).success).toBe(
      true
    );
    expect(FinancialStatementSchema.safeParse({ ...validStatement, fieldAvailability: { totalAssets: 1 } }).success).toBe(false);
  });

  test('strips legacy keys (currency / data / date)', () => {
    const result = FinancialStatementSchema.safeParse({ ...validStatement, currency: 'USD', data: {}, date: '2024-01-15' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(validStatement);
  });
});

describe('FinancialsOutputSchema', () => {
  test('accepts the real symbol/statements/meta shape', () => {
    expect(FinancialsOutputSchema.safeParse({ symbol: 'AAPL', statements: [validStatement], meta: validMeta }).success).toBe(
      true
    );
  });

  test('accepts an empty statements array', () => {
    expect(FinancialsOutputSchema.safeParse({ symbol: 'AAPL', statements: [], meta: validMeta }).success).toBe(true);
  });

  test('rejects a missing top-level field', () => {
    expect(FinancialsOutputSchema.safeParse({ statements: [], meta: validMeta }).success).toBe(false);
    expect(FinancialsOutputSchema.safeParse({ symbol: 'AAPL', meta: validMeta }).success).toBe(false);
    expect(FinancialsOutputSchema.safeParse({ symbol: 'AAPL', statements: [] }).success).toBe(false);
  });

  test('meta.recency is a required ISO date', () => {
    const { recency, ...noRecency } = validMeta;
    expect(FinancialsOutputSchema.safeParse({ symbol: 'AAPL', statements: [], meta: noRecency }).success).toBe(false);
    expect(FinancialsOutputSchema.safeParse({ symbol: 'AAPL', statements: [], meta: { ...validMeta, recency: 'nope' } }).success).toBe(
      false
    );
  });

  test('every statements element must match FinancialStatementSchema', () => {
    expect(
      FinancialsOutputSchema.safeParse({ symbol: 'AAPL', statements: [{ period: '2024' }], meta: validMeta }).success
    ).toBe(false);
  });

  test('meta.completenessScore stays bounded 0-1', () => {
    expect(
      FinancialsOutputSchema.safeParse({ symbol: 'AAPL', statements: [], meta: { ...validMeta, completenessScore: 1.5 } }).success
    ).toBe(false);
  });

  test('strips an unknown success key', () => {
    const result = FinancialsOutputSchema.safeParse({ success: true, symbol: 'AAPL', statements: [], meta: validMeta });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('success');
  });
});
