import { HistoricalInputSchema, HistoricalPriceSchema, HistoricalOutputSchema } from '../../../src/schemas/historical';

// Real shapes (src/schemas/historical.ts). There is NO `period` field and NO
// includePrePost: the window is startDate (REQUIRED, ISO) / endDate (optional ISO) /
// interval (enum). Prices use `adjclose` (lowercase, REQUIRED), not `adjustedClose`.
const validPrice = {
  date: '2024-01-15',
  open: 150,
  high: 155,
  low: 148,
  close: 152,
  adjclose: 150,
  volume: 50000000
};

const validMeta = {
  fromCache: false,
  dataAge: 0,
  completenessScore: 1,
  warnings: [],
  integrityFlags: []
};

describe('HistoricalInputSchema', () => {
  test('accepts symbol + required startDate', () => {
    expect(HistoricalInputSchema.safeParse({ symbol: 'AAPL', startDate: '2024-01-01' }).success).toBe(true);
  });

  test('accepts the optional endDate / interval / validateData trio', () => {
    expect(
      HistoricalInputSchema.safeParse({
        symbol: 'AAPL',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        interval: '1d',
        validateData: true
      }).success
    ).toBe(true);
  });

  test('rejects a missing symbol or a missing (required) startDate', () => {
    expect(HistoricalInputSchema.safeParse({ startDate: '2024-01-01' }).success).toBe(false);
    expect(HistoricalInputSchema.safeParse({ symbol: 'AAPL' }).success).toBe(false);
  });

  test('enforces the ISO YYYY-MM-DD regex on both dates', () => {
    expect(HistoricalInputSchema.safeParse({ symbol: 'AAPL', startDate: '2024-1-1' }).success).toBe(false);
    expect(
      HistoricalInputSchema.safeParse({ symbol: 'AAPL', startDate: '2024-01-01', endDate: 'nope' }).success
    ).toBe(false);
  });

  test('interval accepts exactly its enum values', () => {
    const intervals = ['1m', '2m', '5m', '15m', '30m', '60m', '90m', '1h', '1d', '5d', '1wk', '1mo', '3mo'];
    for (const interval of intervals) {
      expect(HistoricalInputSchema.safeParse({ symbol: 'AAPL', startDate: '2024-01-01', interval }).success).toBe(
        true
      );
    }
    expect(HistoricalInputSchema.safeParse({ symbol: 'AAPL', startDate: '2024-01-01', interval: '2h' }).success).toBe(
      false
    );
  });

  test('unknown keys such as `period` are stripped, not rejected', () => {
    const result = HistoricalInputSchema.safeParse({
      symbol: 'AAPL',
      startDate: '2024-01-01',
      period: 'anything',
      includePrePost: true
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ symbol: 'AAPL', startDate: '2024-01-01' });
  });
});

describe('HistoricalPriceSchema', () => {
  test('accepts the full documented row', () => {
    expect(HistoricalPriceSchema.safeParse(validPrice).success).toBe(true);
  });

  test('adjclose is REQUIRED (the misspelled adjustedClose is not a substitute)', () => {
    const { adjclose, ...noAdj } = validPrice;
    expect(HistoricalPriceSchema.safeParse(noAdj).success).toBe(false);
    expect(HistoricalPriceSchema.safeParse({ ...noAdj, adjustedClose: 150 }).success).toBe(false);
  });

  test('rejects a missing date or close', () => {
    const { date, ...noDate } = validPrice;
    const { close, ...noClose } = validPrice;
    expect(HistoricalPriceSchema.safeParse(noDate).success).toBe(false);
    expect(HistoricalPriceSchema.safeParse(noClose).success).toBe(false);
  });

  test('rejects negative OHLC and fractional volume', () => {
    expect(HistoricalPriceSchema.safeParse({ ...validPrice, open: -150 }).success).toBe(false);
    expect(HistoricalPriceSchema.safeParse({ ...validPrice, volume: 1.5 }).success).toBe(false);
  });

  test('accepts zero values', () => {
    expect(
      HistoricalPriceSchema.safeParse({ date: '2024-01-15', open: 0, high: 0, low: 0, close: 0, adjclose: 0, volume: 0 })
        .success
    ).toBe(true);
  });

  test('isGap / isSplit / hasNulls are optional booleans', () => {
    expect(HistoricalPriceSchema.safeParse({ ...validPrice, isGap: true, hasNulls: false }).success).toBe(true);
    expect(HistoricalPriceSchema.safeParse({ ...validPrice, isGap: 'yes' }).success).toBe(false);
  });

  test('strips an unknown adjustedClose key', () => {
    const result = HistoricalPriceSchema.safeParse({ ...validPrice, adjustedClose: null });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('adjustedClose');
  });
});

describe('HistoricalOutputSchema', () => {
  test('accepts the real symbol/data/meta shape', () => {
    expect(HistoricalOutputSchema.safeParse({ symbol: 'AAPL', data: [validPrice], meta: validMeta }).success).toBe(
      true
    );
  });

  test('accepts an empty data array', () => {
    expect(HistoricalOutputSchema.safeParse({ symbol: 'AAPL', data: [], meta: validMeta }).success).toBe(true);
  });

  test('rejects a missing top-level field', () => {
    expect(HistoricalOutputSchema.safeParse({ data: [], meta: validMeta }).success).toBe(false);
    expect(HistoricalOutputSchema.safeParse({ symbol: 'AAPL', meta: validMeta }).success).toBe(false);
    expect(HistoricalOutputSchema.safeParse({ symbol: 'AAPL', data: [] }).success).toBe(false);
  });

  test('every data element must match HistoricalPriceSchema', () => {
    expect(HistoricalOutputSchema.safeParse({ symbol: 'AAPL', data: [{ date: '2024-01-15' }], meta: validMeta }).success).toBe(
      false
    );
  });

  test('meta.integrityFlags is a required array of strings', () => {
    const { integrityFlags, ...noFlags } = validMeta;
    expect(HistoricalOutputSchema.safeParse({ symbol: 'AAPL', data: [], meta: noFlags }).success).toBe(false);
    expect(HistoricalOutputSchema.safeParse({ symbol: 'AAPL', data: [], meta: { ...validMeta, integrityFlags: [1] } }).success).toBe(
      false
    );
  });

  test('meta.completenessScore stays bounded 0-1', () => {
    expect(HistoricalOutputSchema.safeParse({ symbol: 'AAPL', data: [], meta: { ...validMeta, completenessScore: 2 } }).success).toBe(
      false
    );
  });

  test('strips an unknown success key', () => {
    const result = HistoricalOutputSchema.safeParse({ success: true, symbol: 'AAPL', data: [], meta: validMeta });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('success');
  });
});
