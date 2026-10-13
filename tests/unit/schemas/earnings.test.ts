import {
  EarningsInputSchema,
  EarningsQuarterlySchema,
  EarningsDataSchema,
  EarningsMetaSchema,
  EarningsOutputSchema
} from '../../../src/schemas/earnings';

// Real shapes (src/schemas/earnings.ts). There are NO `quarter`/`surprise`/
// `symbol`/`currency`/`count`/`success`/`errors` fields — those were invented by
// the previous suite. `.nullable()` fields are still REQUIRED (present, may be
// null); unknown keys are stripped, never defaulted.
const validQuarterly = {
  date: '2024-01-28',
  estimate: 2.1,
  actual: 2.18,
  surprisePercent: 3.81,
  surpriseDirection: 'positive',
  timing: 'before'
};

const validData = {
  earningsDate: '2024-01-28',
  currentQuarterEstimate: 2.25,
  currentQuarterEstimateDate: '2024-04-30',
  currentQuarterEstimateYearAgo: 2.1,
  quarterly: [validQuarterly],
  trends: [{ any: 'value' }]
};

const validMeta = {
  fromCache: false,
  dataAge: 0,
  completenessScore: 1,
  warnings: []
};

describe('EarningsInputSchema', () => {
  test('accepts a bare symbol', () => {
    expect(EarningsInputSchema.safeParse({ symbol: 'AAPL' }).success).toBe(true);
  });

  test('accepts symbol with optional limit and includeEstimates', () => {
    expect(
      EarningsInputSchema.safeParse({ symbol: 'AAPL', limit: 4, includeEstimates: true }).success
    ).toBe(true);
  });

  test('rejects missing / empty / non-string / over-long symbol', () => {
    expect(EarningsInputSchema.safeParse({}).success).toBe(false);
    expect(EarningsInputSchema.safeParse({ symbol: '' }).success).toBe(false);
    expect(EarningsInputSchema.safeParse({ symbol: 123 }).success).toBe(false);
    expect(EarningsInputSchema.safeParse({ symbol: 'A'.repeat(21) }).success).toBe(false);
  });

  test('enforces the limit int 1-20 window', () => {
    expect(EarningsInputSchema.safeParse({ symbol: 'AAPL', limit: 0 }).success).toBe(false);
    expect(EarningsInputSchema.safeParse({ symbol: 'AAPL', limit: 21 }).success).toBe(false);
    expect(EarningsInputSchema.safeParse({ symbol: 'AAPL', limit: 2.5 }).success).toBe(false);
    expect(EarningsInputSchema.safeParse({ symbol: 'AAPL', limit: 20 }).success).toBe(true);
  });

  test('strips unknown keys and inserts no defaults', () => {
    const result = EarningsInputSchema.safeParse({ symbol: 'AAPL', bogus: true });
    expect(result.success).toBe(true);
    expect(result.data).toEqual({ symbol: 'AAPL' });
  });
});

describe('EarningsQuarterlySchema', () => {
  test('accepts the full documented shape', () => {
    expect(EarningsQuarterlySchema.safeParse(validQuarterly).success).toBe(true);
  });

  test('accepts null for the nullable numeric / direction fields', () => {
    expect(
      EarningsQuarterlySchema.safeParse({
        date: '2024-01-28',
        estimate: null,
        actual: null,
        surprisePercent: null,
        surpriseDirection: null,
        timing: 'unknown'
      }).success
    ).toBe(true);
  });

  test('surpriseDirection accepts exactly its four enum values', () => {
    for (const direction of ['positive', 'negative', 'neutral', 'null']) {
      expect(EarningsQuarterlySchema.safeParse({ ...validQuarterly, surpriseDirection: direction }).success).toBe(
        true
      );
    }
    expect(EarningsQuarterlySchema.safeParse({ ...validQuarterly, surpriseDirection: 'up' }).success).toBe(false);
  });

  test('timing accepts exactly its four enum values', () => {
    for (const t of ['before', 'after', 'during', 'unknown']) {
      expect(EarningsQuarterlySchema.safeParse({ ...validQuarterly, timing: t }).success).toBe(true);
    }
    expect(EarningsQuarterlySchema.safeParse({ ...validQuarterly, timing: 'mid' }).success).toBe(false);
  });

  test('rejects a missing date or timing', () => {
    const { date, ...noDate } = validQuarterly;
    const { timing, ...noTiming } = validQuarterly;
    expect(EarningsQuarterlySchema.safeParse(noDate).success).toBe(false);
    expect(EarningsQuarterlySchema.safeParse(noTiming).success).toBe(false);
  });

  test('a nullable field is still required: omitting it fails', () => {
    const { surprisePercent, ...noSurprise } = validQuarterly;
    expect(EarningsQuarterlySchema.safeParse(noSurprise).success).toBe(false);
  });

  test('rejects a non-numeric estimate', () => {
    expect(EarningsQuarterlySchema.safeParse({ ...validQuarterly, estimate: 'high' }).success).toBe(false);
  });
});

describe('EarningsDataSchema', () => {
  test('accepts the full documented shape', () => {
    expect(EarningsDataSchema.safeParse(validData).success).toBe(true);
  });

  test('accepts an empty quarterly array and arbitrary trends', () => {
    expect(EarningsDataSchema.safeParse({ ...validData, quarterly: [], trends: [1, 'x', null] }).success).toBe(true);
  });

  test('accepts null for the nullable earnings fields', () => {
    expect(
      EarningsDataSchema.safeParse({
        ...validData,
        earningsDate: null,
        currentQuarterEstimate: null,
        currentQuarterEstimateDate: null,
        currentQuarterEstimateYearAgo: null
      }).success
    ).toBe(true);
  });

  test('rejects when a required field is absent', () => {
    const { quarterly, ...noQuarterly } = validData;
    const { trends, ...noTrends } = validData;
    expect(EarningsDataSchema.safeParse(noQuarterly).success).toBe(false);
    expect(EarningsDataSchema.safeParse(noTrends).success).toBe(false);
  });

  test('every quarterly element must itself match EarningsQuarterlySchema', () => {
    expect(EarningsDataSchema.safeParse({ ...validData, quarterly: [{ date: 'x' }] }).success).toBe(false);
  });
});

describe('EarningsMetaSchema', () => {
  test('accepts the shared meta block', () => {
    expect(EarningsMetaSchema.safeParse(validMeta).success).toBe(true);
  });

  test('completenessScore is bounded 0-1', () => {
    expect(EarningsMetaSchema.safeParse({ ...validMeta, completenessScore: 0 }).success).toBe(true);
    expect(EarningsMetaSchema.safeParse({ ...validMeta, completenessScore: 1 }).success).toBe(true);
    expect(EarningsMetaSchema.safeParse({ ...validMeta, completenessScore: -0.1 }).success).toBe(false);
    expect(EarningsMetaSchema.safeParse({ ...validMeta, completenessScore: 1.1 }).success).toBe(false);
  });

  test('dataAge is non-negative', () => {
    expect(EarningsMetaSchema.safeParse({ ...validMeta, dataAge: -1 }).success).toBe(false);
  });

  test('warnings must be an array of strings and every field is required', () => {
    expect(EarningsMetaSchema.safeParse({ ...validMeta, warnings: ['stale'] }).success).toBe(true);
    expect(EarningsMetaSchema.safeParse({ ...validMeta, warnings: [1] }).success).toBe(false);
    const { fromCache, ...noFromCache } = validMeta;
    expect(EarningsMetaSchema.safeParse(noFromCache).success).toBe(false);
  });
});

describe('EarningsOutputSchema', () => {
  test('accepts the full documented shape', () => {
    expect(EarningsOutputSchema.safeParse({ symbol: 'AAPL', earnings: validData, meta: validMeta }).success).toBe(
      true
    );
  });

  test('rejects a missing top-level field', () => {
    expect(EarningsOutputSchema.safeParse({ earnings: validData, meta: validMeta }).success).toBe(false);
    expect(EarningsOutputSchema.safeParse({ symbol: 'AAPL', meta: validMeta }).success).toBe(false);
    expect(EarningsOutputSchema.safeParse({ symbol: 'AAPL', earnings: validData }).success).toBe(false);
  });

  test('propagates inner validation failures', () => {
    expect(
      EarningsOutputSchema.safeParse({ symbol: 'AAPL', earnings: { quarterly: [] }, meta: validMeta }).success
    ).toBe(false);
  });

  test('strips unknown top-level keys', () => {
    const result = EarningsOutputSchema.safeParse({
      symbol: 'AAPL',
      earnings: validData,
      meta: validMeta,
      success: true
    });
    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('success');
  });
});
