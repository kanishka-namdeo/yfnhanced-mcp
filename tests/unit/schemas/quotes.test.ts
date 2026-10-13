import { QuoteInputSchema, QuoteResultSchema, QuoteMetaSchema, QuoteOutputSchema } from '../../../src/schemas/quotes';

// Real shapes (src/schemas/quotes.ts). There is NO symbol/price/currency/timestamp
// on QuoteResultSchema — every field is `.optional()`. QuoteOutputSchema is
// { results: record, summary: {...} }, not the old success/data/meta envelope.
const validSummary = {
  totalRequested: 1,
  totalReturned: 1,
  fromCache: 0,
  rateLimited: false,
  errors: [{ symbol: 'AAPL', error: 'not found' }]
};

const validMeta = {
  fromCache: false,
  dataAge: 0,
  completenessScore: 1,
  warnings: []
};

describe('QuoteInputSchema', () => {
  test('accepts one or more symbols', () => {
    expect(QuoteInputSchema.safeParse({ symbols: ['AAPL', 'MSFT'] }).success).toBe(true);
    expect(QuoteInputSchema.safeParse({ symbols: ['AAPL'] }).success).toBe(true);
  });

  test('accepts the optional fields / forceRefresh / timeout trio', () => {
    expect(
      QuoteInputSchema.safeParse({
        symbols: ['AAPL'],
        fields: ['regularMarketPrice'],
        forceRefresh: true,
        timeout: 5000
      }).success
    ).toBe(true);
  });

  test('rejects an empty or missing symbols array', () => {
    expect(QuoteInputSchema.safeParse({ symbols: [] }).success).toBe(false);
    expect(QuoteInputSchema.safeParse({}).success).toBe(false);
  });

  test('each symbol element must be a non-empty string of at most 10 chars', () => {
    expect(QuoteInputSchema.safeParse({ symbols: [123] }).success).toBe(false);
    expect(QuoteInputSchema.safeParse({ symbols: [''] }).success).toBe(false);
    // Quote caps elements at 10 chars (narrower than the 20 used elsewhere).
    expect(QuoteInputSchema.safeParse({ symbols: ['ABCDEFGHIJK'] }).success).toBe(false);
    expect(QuoteInputSchema.safeParse({ symbols: ['ABCDEFGHIJ'] }).success).toBe(true);
  });

  test('timeout must be an int within 100-60000', () => {
    expect(QuoteInputSchema.safeParse({ symbols: ['AAPL'], timeout: 99 }).success).toBe(false);
    expect(QuoteInputSchema.safeParse({ symbols: ['AAPL'], timeout: 60001 }).success).toBe(false);
    expect(QuoteInputSchema.safeParse({ symbols: ['AAPL'], timeout: 500.5 }).success).toBe(false);
  });

  test('strips unknown keys and inserts no defaults', () => {
    const result = QuoteInputSchema.safeParse({ symbols: ['AAPL'], bogus: 1 });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ symbols: ['AAPL'] });
  });
});

describe('QuoteResultSchema', () => {
  test('every field is optional so an empty object passes', () => {
    expect(QuoteResultSchema.safeParse({}).success).toBe(true);
  });

  test('accepts a populated result', () => {
    expect(
      QuoteResultSchema.safeParse({
        regularMarketPrice: 150.5,
        regularMarketVolume: 50000000,
        marketCap: 2500000000000
      }).success
    ).toBe(true);
  });

  test('DEFECT PIN: regularMarketPrice carries no non-negative bound, so a negative price is accepted', () => {
    // Unlike marketCap / dividendRate, price is plain z.number().optional().
    expect(QuoteResultSchema.safeParse({ regularMarketPrice: -150.5 }).success).toBe(true);
  });

  test('regularMarketVolume must be a non-negative integer', () => {
    expect(QuoteResultSchema.safeParse({ regularMarketVolume: 50000000 }).success).toBe(true);
    expect(QuoteResultSchema.safeParse({ regularMarketVolume: 2.5 }).success).toBe(false);
    expect(QuoteResultSchema.safeParse({ regularMarketVolume: -1 }).success).toBe(false);
  });

  test('marketCap is non-negative', () => {
    expect(QuoteResultSchema.safeParse({ marketCap: -1 }).success).toBe(false);
  });

  test('nested range objects require both low and high when present', () => {
    expect(QuoteResultSchema.safeParse({ regularMarketDayRange: { low: 1, high: 2 } }).success).toBe(true);
    expect(QuoteResultSchema.safeParse({ regularMarketDayRange: { low: 1 } }).success).toBe(false);
  });

  test('strips unknown keys', () => {
    const result = QuoteResultSchema.safeParse({ symbol: 'AAPL', price: 150.5, currency: 'USD' });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({});
  });
});

describe('QuoteMetaSchema', () => {
  test('accepts the shared meta block', () => {
    expect(QuoteMetaSchema.safeParse(validMeta).success).toBe(true);
  });

  test('completenessScore is bounded 0-1', () => {
    expect(QuoteMetaSchema.safeParse({ ...validMeta, completenessScore: 1.1 }).success).toBe(false);
    expect(QuoteMetaSchema.safeParse({ ...validMeta, completenessScore: -0.1 }).success).toBe(false);
  });

  test('dataAge is non-negative and all four fields are required', () => {
    expect(QuoteMetaSchema.safeParse({ ...validMeta, dataAge: -1 }).success).toBe(false);
    const { warnings, ...noWarnings } = validMeta;
    expect(QuoteMetaSchema.safeParse(noWarnings).success).toBe(false);
  });

  test('warnings must be an array of strings', () => {
    expect(QuoteMetaSchema.safeParse({ ...validMeta, warnings: [1] }).success).toBe(false);
  });
});

describe('QuoteOutputSchema', () => {
  test('accepts the real results/summary shape', () => {
    expect(QuoteOutputSchema.safeParse({ results: { AAPL: {} }, summary: validSummary }).success).toBe(true);
  });

  test('rejects a missing results or summary', () => {
    expect(QuoteOutputSchema.safeParse({ summary: validSummary }).success).toBe(false);
    expect(QuoteOutputSchema.safeParse({ results: {} }).success).toBe(false);
  });

  test('summary.fromCache is an integer count, not a boolean', () => {
    expect(QuoteOutputSchema.safeParse({ results: {}, summary: { ...validSummary, fromCache: true } }).success).toBe(
      false
    );
    expect(QuoteOutputSchema.safeParse({ results: {}, summary: { ...validSummary, fromCache: -1 } }).success).toBe(
      false
    );
  });

  test('summary.errors elements need both symbol and error strings', () => {
    expect(QuoteOutputSchema.safeParse({ results: {}, summary: { ...validSummary, errors: [] } }).success).toBe(true);
    expect(
      QuoteOutputSchema.safeParse({ results: {}, summary: { ...validSummary, errors: [{ symbol: 'X' }] } }).success
    ).toBe(false);
  });

  test('results values are validated against QuoteResultSchema', () => {
    expect(
      QuoteOutputSchema.safeParse({ results: { AAPL: { regularMarketVolume: 'x' } }, summary: validSummary }).success
    ).toBe(false);
  });

  test('strips unknown top-level keys', () => {
    const result = QuoteOutputSchema.safeParse({ results: {}, summary: validSummary, meta: validMeta });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('meta');
  });
});
