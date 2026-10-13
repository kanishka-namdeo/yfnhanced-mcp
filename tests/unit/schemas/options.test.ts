/**
 * Contracts under test: `src/schemas/options.ts` as written, plus the folder-wide rules from
 * `src/schemas/AGENTS.md`:
 *  - Zod v4 surface (`error.issues`, never `error.errors`).
 *  - No `.strict()`, `.refine()`, `.superRefine()`, `.default()`, `.passthrough()`, `.catch()`
 *    anywhere in `src/schemas/`, so unknown keys are STRIPPED (never rejected) and nothing is
 *    ever defaulted by zod.
 *  - `.nullable()` fields are REQUIRED-but-may-be-null; only `.optional()` may be absent.
 *
 * Two behaviours are pinned because they are real, not because they are desirable:
 * `OptionContractSchema.strike` is a bare `z.number()` (a negative strike passes) and
 * `inTheMoney` is a bare `z.boolean()` (a label that contradicts the strike passes).
 */
import {
  OptionsInputSchema,
  OptionContractSchema,
  OptionsExpirationSchema,
  OptionsMetaSchema,
  OptionsOutputSchema
} from '../../../src/schemas/options';

type ZodLikeError = {
  issues: Array<{ path: Array<string | number>; code: string; message: string }>;
};

function issuesOf(error: unknown): ZodLikeError['issues'] {
  const candidate = error as { issues?: ZodLikeError['issues'] };
  if (!Array.isArray(candidate.issues)) {
    throw new Error('Expected a Zod v4 error exposing `issues`');
  }
  return candidate.issues;
}

function pathsOf(error: unknown): string[] {
  return issuesOf(error).map((issue) => issue.path.join('.'));
}

/** A contract satisfying every required field of `OptionContractSchema`. */
function validContract(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contractSymbol: 'AAPL240216C00150000',
    strike: 150,
    lastPrice: 5.25,
    change: 0.5,
    percentChange: 10.53,
    volume: 1000,
    openInterest: 5000,
    bid: 5,
    ask: 5.5,
    impliedVolatility: 0.25,
    inTheMoney: true,
    contractSize: 100,
    currency: 'USD',
    delta: 0.65,
    gamma: 0.05,
    theta: -0.02,
    vega: 0.15,
    ...overrides
  };
}

/** A meta object satisfying every required field of `OptionsMetaSchema`. */
function validMeta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fromCache: false,
    dataAge: 0,
    completenessScore: 1,
    warnings: [],
    dataSource: 'yahoo-finance',
    lastUpdated: '2024-01-15T10:30:00Z',
    availableExpirations: [],
    requestedExpiration: null,
    fallbackExpiration: false,
    ivCalculationMethod: 'black-scholes',
    ...overrides
  };
}

/** An expiration block satisfying every required field of `OptionsExpirationSchema`. */
function validExpiration(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    expirationDate: '2024-02-16',
    date: 1708089600,
    hasMiniOptions: false,
    calls: [],
    puts: [],
    ...overrides
  };
}

describe('OptionsInputSchema', () => {
  test('accepts the minimal input with only a symbol', () => {
    const result = OptionsInputSchema.safeParse({ symbol: 'AAPL' });
    expect(result.success).toBe(true);
  });

  test('does not default anything: optional keys stay absent on the parsed data', () => {
    const result = OptionsInputSchema.parse({ symbol: 'AAPL' });
    expect(result).toEqual({ symbol: 'AAPL' });
    expect(Object.keys(result).sort()).toEqual(['symbol']);
  });

  test('accepts every optional key', () => {
    const input = {
      symbol: 'AAPL',
      date: '2024-02-15',
      expiration: '2024-02-15',
      optionsType: 'calls',
      includeGreeks: true
    };
    expect(OptionsInputSchema.parse(input)).toEqual(input);
  });

  test('accepts each optionsType enum member', () => {
    for (const optionsType of ['calls', 'puts', 'both']) {
      const result = OptionsInputSchema.safeParse({ symbol: 'AAPL', optionsType });
      expect(result.success).toBe(true);
    }
  });

  test('rejects an optionsType outside the enum and reports the path', () => {
    expect.assertions(2);
    try {
      OptionsInputSchema.parse({ symbol: 'AAPL', optionsType: 'call' });
    } catch (error) {
      expect(pathsOf(error)).toContain('optionsType');
      expect(issuesOf(error)[0].code).toBe('invalid_value');
    }
  });

  test('rejects a missing symbol', () => {
    expect.assertions(2);
    try {
      OptionsInputSchema.parse({});
    } catch (error) {
      expect(pathsOf(error)).toContain('symbol');
      expect(issuesOf(error)[0].code).toBe('invalid_type');
    }
  });

  test('rejects an empty symbol (min 1)', () => {
    expect(OptionsInputSchema.safeParse({ symbol: '' }).success).toBe(false);
  });

  test('accepts a 20-character symbol and rejects a 21-character one (max 20)', () => {
    expect(OptionsInputSchema.safeParse({ symbol: 'A'.repeat(20) }).success).toBe(true);
    expect(OptionsInputSchema.safeParse({ symbol: 'A'.repeat(21) }).success).toBe(false);
  });

  test('rejects a non-string symbol', () => {
    expect(OptionsInputSchema.safeParse({ symbol: 42 }).success).toBe(false);
  });

  test('rejects a non-boolean includeGreeks, including the string "true"', () => {
    expect(OptionsInputSchema.safeParse({ symbol: 'AAPL', includeGreeks: 'true' }).success).toBe(false);
    expect(OptionsInputSchema.safeParse({ symbol: 'AAPL', includeGreeks: 1 }).success).toBe(false);
  });

  test('date and expiration are plain strings: no ISO format is enforced', () => {
    // The folder documents an ISO regex where it is used; `OptionsInputSchema` does not use it.
    expect(OptionsInputSchema.safeParse({ symbol: 'AAPL', date: 'not-a-date' }).success).toBe(true);
    expect(OptionsInputSchema.safeParse({ symbol: 'AAPL', expiration: '' }).success).toBe(true);
    expect(OptionsInputSchema.safeParse({ symbol: 'AAPL', date: 20240215 }).success).toBe(false);
  });

  test('strips unknown keys instead of rejecting them (no .strict() / .passthrough())', () => {
    const parsed = OptionsInputSchema.parse({ symbol: 'AAPL', expiry: '2024-02-15', greek: true });
    expect(parsed).toEqual({ symbol: 'AAPL' });
  });
});

describe('OptionContractSchema', () => {
  test('accepts a fully populated contract', () => {
    const contract = validContract();
    const result = OptionContractSchema.safeParse(contract);
    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual(contract);
  });

  test('accepts a contract whose nullable fields are all null', () => {
    const contract = validContract({
      lastPrice: null,
      change: null,
      percentChange: null,
      bid: null,
      ask: null,
      impliedVolatility: null,
      delta: null,
      gamma: null,
      theta: null,
      vega: null,
      volume: 0
    });
    expect(OptionContractSchema.safeParse(contract).success).toBe(true);
  });

  test('nullable fields are required: omitting them fails, unlike .optional()', () => {
    const contract = validContract();
    delete contract.lastPrice;
    const result = OptionContractSchema.safeParse(contract);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(pathsOf(result.error)).toEqual(['lastPrice']);
    }
  });

  test('PINS CURRENT BEHAVIOUR: a negative strike is accepted', () => {
    // `strike: z.number()` carries no `.nonnegative()`/`.positive()`, so -150 parses.
    // This is the schema as it exists, not a rule the test endorses.
    const result = OptionContractSchema.safeParse(validContract({ strike: -150 }));
    expect(result.success).toBe(true);
    expect(result.success && result.data.strike).toBe(-150);
  });

  test('accepts a zero strike and rejects a non-numeric strike', () => {
    expect(OptionContractSchema.safeParse(validContract({ strike: 0 })).success).toBe(true);
    expect(OptionContractSchema.safeParse(validContract({ strike: '150' })).success).toBe(false);
  });

  test('PINS CURRENT BEHAVIOUR: inTheMoney is an unchecked boolean', () => {
    // Nothing relates `inTheMoney` to `strike`, `contractSymbol`, or a reference price, so a
    // label that contradicts the contract parses cleanly. There is no .refine() in this folder.
    const absurd = validContract({ contractSymbol: 'AAPL240216C00150000', strike: 150, inTheMoney: false });
    const inverted = validContract({ contractSymbol: 'AAPL240216P00150000', strike: 0.01, inTheMoney: false });
    expect(OptionContractSchema.safeParse(absurd).success).toBe(true);
    expect(OptionContractSchema.safeParse(inverted).success).toBe(true);
  });

  test('requires inTheMoney to be a boolean and be present', () => {
    expect(OptionContractSchema.safeParse(validContract({ inTheMoney: 'true' })).success).toBe(false);
    const contract = validContract();
    delete contract.inTheMoney;
    expect(OptionContractSchema.safeParse(contract).success).toBe(false);
  });

  test('volume, openInterest and contractSize must be non-negative integers', () => {
    for (const key of ['volume', 'openInterest', 'contractSize']) {
      const base = validContract();
      expect(OptionContractSchema.safeParse({ ...base, [key]: 0 }).success).toBe(true);
      expect(OptionContractSchema.safeParse({ ...base, [key]: -1 }).success).toBe(false);
      expect(OptionContractSchema.safeParse({ ...base, [key]: 1.5 }).success).toBe(false);
      expect(OptionContractSchema.safeParse({ ...base, [key]: null }).success).toBe(false);
    }
  });

  test('the greek and price fields reject non-numeric, non-null values', () => {
    for (const key of ['lastPrice', 'change', 'percentChange', 'bid', 'ask', 'impliedVolatility', 'delta', 'gamma', 'theta', 'vega']) {
      expect(OptionContractSchema.safeParse(validContract({ [key]: '0.5' })).success).toBe(false);
      expect(OptionContractSchema.safeParse(validContract({ [key]: 0.5 })).success).toBe(true);
    }
  });

  test('reports the offending path for a missing required field', () => {
    expect.assertions(1);
    try {
      const contract = validContract();
      delete contract.contractSymbol;
      OptionContractSchema.parse(contract);
    } catch (error) {
      expect(pathsOf(error)).toEqual(['contractSymbol']);
    }
  });

  test('strips unknown keys (no .strict())', () => {
    const parsed = OptionContractSchema.parse(validContract({ extraFlag: 'x' }));
    expect(parsed).not.toHaveProperty('extraFlag');
    expect(Object.keys(parsed)).toHaveLength(17);
  });
});

describe('OptionsExpirationSchema', () => {
  test('accepts an expiration block with empty call and put arrays', () => {
    expect(OptionsExpirationSchema.safeParse(validExpiration()).success).toBe(true);
  });

  test('accepts contracts inside calls and puts', () => {
    const expiration = validExpiration({ calls: [validContract()], puts: [validContract({ strike: -150 })] });
    const parsed = OptionsExpirationSchema.parse(expiration);
    expect(parsed.calls).toHaveLength(1);
    expect(parsed.puts[0].strike).toBe(-150);
  });

  test('enforces the contract shape inside the arrays', () => {
    const result = OptionsExpirationSchema.safeParse(validExpiration({ calls: [{ contractSymbol: 'X' }] }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(pathsOf(result.error)).toContain('calls.0.strike');
    }
  });

  test('rejects each missing required key', () => {
    for (const key of ['expirationDate', 'date', 'hasMiniOptions', 'calls', 'puts']) {
      const expiration = validExpiration();
      delete expiration[key];
      expect(OptionsExpirationSchema.safeParse(expiration).success).toBe(false);
    }
  });

  test('expirationDate is an unvalidated string; date is an unvalidated number', () => {
    expect(OptionsExpirationSchema.safeParse(validExpiration({ expirationDate: 'not-a-date' })).success).toBe(true);
    // `date` has no `.int()`/`.nonnegative()`, unlike the volume fields.
    expect(OptionsExpirationSchema.safeParse(validExpiration({ date: -1 })).success).toBe(true);
    expect(OptionsExpirationSchema.safeParse(validExpiration({ date: 1.25 })).success).toBe(true);
    expect(OptionsExpirationSchema.safeParse(validExpiration({ date: '1708089600' })).success).toBe(false);
  });

  test('hasMiniOptions must be a boolean', () => {
    expect(OptionsExpirationSchema.safeParse(validExpiration({ hasMiniOptions: 1 })).success).toBe(false);
  });

  test('strips unknown keys (no .strict())', () => {
    const parsed = OptionsExpirationSchema.parse(validExpiration({ mini: true }));
    expect(parsed).not.toHaveProperty('mini');
  });
});

describe('OptionsMetaSchema', () => {
  test('accepts a fully populated meta block', () => {
    const meta = validMeta({
      fromCache: true,
      dataAge: 300000,
      completenessScore: 0.95,
      warnings: ['partial chain'],
      availableExpirations: ['2024-02-16', '2024-03-15'],
      requestedExpiration: '2024-02-16',
      fallbackExpiration: false
    });
    expect(OptionsMetaSchema.parse(meta)).toEqual(meta);
  });

  test('completenessScore is bounded to the closed interval 0-1', () => {
    expect(OptionsMetaSchema.safeParse(validMeta({ completenessScore: 0 })).success).toBe(true);
    expect(OptionsMetaSchema.safeParse(validMeta({ completenessScore: 1 })).success).toBe(true);
    expect(OptionsMetaSchema.safeParse(validMeta({ completenessScore: -0.1 })).success).toBe(false);
    expect(OptionsMetaSchema.safeParse(validMeta({ completenessScore: 1.1 })).success).toBe(false);
  });

  test('dataAge is non-negative but not required to be an integer', () => {
    expect(OptionsMetaSchema.safeParse(validMeta({ dataAge: 0 })).success).toBe(true);
    expect(OptionsMetaSchema.safeParse(validMeta({ dataAge: 12.5 })).success).toBe(true);
    expect(OptionsMetaSchema.safeParse(validMeta({ dataAge: -1 })).success).toBe(false);
  });

  test('warnings and availableExpirations must be arrays of strings', () => {
    expect(OptionsMetaSchema.safeParse(validMeta({ warnings: [] })).success).toBe(true);
    expect(OptionsMetaSchema.safeParse(validMeta({ warnings: [1] })).success).toBe(false);
    expect(OptionsMetaSchema.safeParse(validMeta({ warnings: 'slow' })).success).toBe(false);
    expect(OptionsMetaSchema.safeParse(validMeta({ availableExpirations: [null] })).success).toBe(false);
  });

  test('requestedExpiration is nullable, which still requires the key to be present', () => {
    expect(OptionsMetaSchema.safeParse(validMeta({ requestedExpiration: null })).success).toBe(true);
    expect(OptionsMetaSchema.safeParse(validMeta({ requestedExpiration: '2024-02-16' })).success).toBe(true);
    const meta = validMeta();
    delete meta.requestedExpiration;
    expect(OptionsMetaSchema.safeParse(meta).success).toBe(false);
  });

  test('lastUpdated is an unvalidated string', () => {
    expect(OptionsMetaSchema.safeParse(validMeta({ lastUpdated: 'yesterday' })).success).toBe(true);
  });

  test('rejects each missing required key', () => {
    for (const key of Object.keys(validMeta())) {
      const meta = validMeta();
      delete meta[key];
      expect(OptionsMetaSchema.safeParse(meta).success).toBe(false);
    }
  });

  test('strips unknown keys (no .strict())', () => {
    expect(OptionsMetaSchema.parse(validMeta({ staleness: 3 }))).not.toHaveProperty('staleness');
  });
});

describe('OptionsOutputSchema', () => {
  function validOutput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      symbol: 'AAPL',
      options: validExpiration(),
      expirationDates: ['2024-02-16', '2024-03-15'],
      meta: validMeta(),
      ...overrides
    };
  }

  test('accepts a complete output payload', () => {
    const output = validOutput();
    const result = OptionsOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
    expect(result.success && result.data).toEqual(output);
  });

  test('rejects each missing top-level key and reports the path', () => {
    for (const key of ['symbol', 'options', 'expirationDates', 'meta']) {
      const output = validOutput();
      delete output[key];
      const result = OptionsOutputSchema.safeParse(output);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(pathsOf(result.error)).toEqual([key]);
      }
    }
  });

  test('an empty expirationDates array is valid', () => {
    expect(OptionsOutputSchema.safeParse(validOutput({ expirationDates: [] })).success).toBe(true);
  });

  test('expirationDates elements are validated as strings', () => {
    expect(OptionsOutputSchema.safeParse(validOutput({ expirationDates: [1] })).success).toBe(false);
  });

  test('nested option and meta blocks are validated through their own schemas', () => {
    expect(OptionsOutputSchema.safeParse(validOutput({ options: { expirationDate: '2024-02-16' } })).success).toBe(false);
    expect(OptionsOutputSchema.safeParse(validOutput({ meta: { fromCache: false } })).success).toBe(false);
  });

  test('strips unknown top-level keys (no .strict())', () => {
    const parsed = OptionsOutputSchema.parse(validOutput({ notes: 'extra' }));
    expect(parsed).not.toHaveProperty('notes');
    expect(Object.keys(parsed).sort()).toEqual(['expirationDates', 'meta', 'options', 'symbol']);
  });
});
