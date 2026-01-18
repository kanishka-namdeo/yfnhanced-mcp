import { HoldersInputSchema, HolderResultSchema, MajorHoldersBreakdownSchema, HoldersMetaSchema, HoldersOutputSchema } from '../../../src/schemas/holders';

describe('HoldersInputSchema', () => {
  test('should validate valid holders input', () => {
    const input = { symbol: 'AAPL' };
    const result = HoldersInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should validate input with includeChangeHistory', () => {
    const input = {
      symbol: 'AAPL',
      includeChangeHistory: true
    };
    const result = HoldersInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should reject missing symbol', () => {
    const input = {};
    const result = HoldersInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject empty symbol', () => {
    const input = { symbol: '' };
    const result = HoldersInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject symbol longer than 20 characters', () => {
    const input = { symbol: 'VERYLONGSYMBOLTHATISTOOLONG' };
    const result = HoldersInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should accept boolean includeChangeHistory', () => {
    const input = {
      symbol: 'AAPL',
      includeChangeHistory: false
    };
    const result = HoldersInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('HolderResultSchema', () => {
  test('should validate holder with all fields', () => {
    const holder = {
      holderName: 'Vanguard Group Inc',
      holderType: 'institution',
      relation: 'direct',
      lastReported: '2024-01-15',
      positionDirect: 1500000000,
      positionDirectDate: '2024-01-15',
      positionIndirect: null,
      positionIndirectDate: null,
      position: 1500000000
    };
    const result = HolderResultSchema.safeParse(holder);
    expect(result.success).toBe(true);
  });

  test('should validate holder with required fields', () => {
    const holder = {
      holderName: 'Vanguard Group Inc',
      holderType: 'company',
      relation: 'indirect',
      lastReported: '2024-01-15',
      positionDirect: null,
      positionDirectDate: null,
      positionIndirect: null,
      positionIndirectDate: null,
      position: 1500000000
    };
    const result = HolderResultSchema.safeParse(holder);
    expect(result.success).toBe(true);
  });

  test('should reject missing holderName', () => {
    const holder = {
      holderType: 'institution',
      relation: 'direct',
      lastReported: '2024-01-15',
      positionDirect: null,
      positionDirectDate: null,
      positionIndirect: null,
      positionIndirectDate: null,
      position: null
    };
    const result = HolderResultSchema.safeParse(holder);
    expect(result.success).toBe(false);
  });

  test('should reject invalid holderType', () => {
    const holder = {
      holderName: 'Test Holder',
      holderType: 'invalid',
      relation: 'direct',
      lastReported: '2024-01-15',
      positionDirect: null,
      positionDirectDate: null,
      positionIndirect: null,
      positionIndirectDate: null,
      position: null
    };
    const result = HolderResultSchema.safeParse(holder);
    expect(result.success).toBe(false);
  });

  test('should reject invalid relation', () => {
    const holder = {
      holderName: 'Test Holder',
      holderType: 'institution',
      relation: 'invalid',
      lastReported: '2024-01-15',
      positionDirect: null,
      positionDirectDate: null,
      positionIndirect: null,
      positionIndirectDate: null,
      position: null
    };
    const result = HolderResultSchema.safeParse(holder);
    expect(result.success).toBe(false);
  });

  test('should accept valid holderTypes', () => {
    const types = ['company', 'individual', 'institution'];
    types.forEach(type => {
      const holder = {
        holderName: 'Test Holder',
        holderType: type,
        relation: 'direct',
        lastReported: '2024-01-15',
        positionDirect: null,
        positionDirectDate: null,
        positionIndirect: null,
        positionIndirectDate: null,
        position: null
      };
      const result = HolderResultSchema.safeParse(holder);
      expect(result.success).toBe(true);
    });
  });

  test('should accept valid relations', () => {
    const relations = ['direct', 'indirect'];
    relations.forEach(relation => {
      const holder = {
        holderName: 'Test Holder',
        holderType: 'institution',
        relation,
        lastReported: '2024-01-15',
        positionDirect: null,
        positionDirectDate: null,
        positionIndirect: null,
        positionIndirectDate: null,
        position: null
      };
      const result = HolderResultSchema.safeParse(holder);
      expect(result.success).toBe(true);
    });
  });

  test('should accept null position values', () => {
    const holder = {
      holderName: 'Test Holder',
      holderType: 'institution',
      relation: 'direct',
      lastReported: '2024-01-15',
      positionDirect: null,
      positionDirectDate: null,
      positionIndirect: null,
      positionIndirectDate: null,
      position: null
    };
    const result = HolderResultSchema.safeParse(holder);
    expect(result.success).toBe(true);
  });

  test('should accept changeHistory array', () => {
    const holder = {
      holderName: 'Test Holder',
      holderType: 'institution',
      relation: 'direct',
      lastReported: '2024-01-15',
      positionDirect: null,
      positionDirectDate: null,
      positionIndirect: null,
      positionIndirectDate: null,
      position: null,
      changeHistory: [
        {
          date: '2024-01-15',
          shares: 1500000000,
          change: 50000000,
          changePercent: 3.45
        }
      ]
    };
    const result = HolderResultSchema.safeParse(holder);
    expect(result.success).toBe(true);
  });
});

describe('MajorHoldersBreakdownSchema', () => {
  test('should validate breakdown with all fields', () => {
    const breakdown = {
      insidersPercentHeld: 0.05,
      institutionsPercentHeld: 0.62,
      institutionsFloatPercentHeld: 0.65,
      institutionsCount: 5000
    };
    const result = MajorHoldersBreakdownSchema.safeParse(breakdown);
    expect(result.success).toBe(true);
  });

  test('should accept zero values', () => {
    const breakdown = {
      insidersPercentHeld: 0,
      institutionsPercentHeld: 0,
      institutionsFloatPercentHeld: 0,
      institutionsCount: 0
    };
    const result = MajorHoldersBreakdownSchema.safeParse(breakdown);
    expect(result.success).toBe(true);
  });

  test('should accept values greater than 1', () => {
    const breakdown = {
      insidersPercentHeld: 1.5,
      institutionsPercentHeld: 2.0,
      institutionsFloatPercentHeld: 1.8,
      institutionsCount: 5000
    };
    const result = MajorHoldersBreakdownSchema.safeParse(breakdown);
    expect(result.success).toBe(true);
  });
});

describe('HoldersMetaSchema', () => {
  test('should validate meta with all fields', () => {
    const meta = {
      fromCache: true,
      dataAge: 300000,
      completenessScore: 0.95,
      warnings: [],
      dataSource: 'yahoo-finance',
      lastUpdated: '2024-01-15T10:30:00Z'
    };
    const result = HoldersMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  test('should validate meta with required fields', () => {
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: 1,
      warnings: [],
      dataSource: 'yahoo-finance',
      lastUpdated: '2024-01-15T10:30:00Z'
    };
    const result = HoldersMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  test('should reject negative dataAge', () => {
    const meta = {
      fromCache: false,
      dataAge: -1,
      completenessScore: 1,
      warnings: [],
      dataSource: 'yahoo-finance',
      lastUpdated: '2024-01-15T10:30:00Z'
    };
    const result = HoldersMetaSchema.safeParse(meta);
    expect(result.success).toBe(false);
  });

  test('should reject completenessScore less than 0', () => {
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: -0.1,
      warnings: [],
      dataSource: 'yahoo-finance',
      lastUpdated: '2024-01-15T10:30:00Z'
    };
    const result = HoldersMetaSchema.safeParse(meta);
    expect(result.success).toBe(false);
  });

  test('should reject completenessScore greater than 1', () => {
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: 1.1,
      warnings: [],
      dataSource: 'yahoo-finance',
      lastUpdated: '2024-01-15T10:30:00Z'
    };
    const result = HoldersMetaSchema.safeParse(meta);
    expect(result.success).toBe(false);
  });

  test('should accept empty warnings array', () => {
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: 1,
      warnings: [],
      dataSource: 'yahoo-finance',
      lastUpdated: '2024-01-15T10:30:00Z'
    };
    const result = HoldersMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });
});

describe('HoldersOutputSchema', () => {
  test('should validate complete holders output', () => {
    const output = {
      symbol: 'AAPL',
      majorHoldersBreakdown: {
        insidersPercentHeld: 0.05,
        institutionsPercentHeld: 0.62,
        institutionsFloatPercentHeld: 0.65,
        institutionsCount: 5000
      },
      institutionalHolders: [],
      fundHolders: [],
      insiderHolders: [],
      directHolders: [],
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z'
      }
    };
    const result = HoldersOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('should reject missing symbol', () => {
    const output = {
      majorHoldersBreakdown: {
        insidersPercentHeld: 0.05,
        institutionsPercentHeld: 0.62,
        institutionsFloatPercentHeld: 0.65,
        institutionsCount: 5000
      },
      institutionalHolders: [],
      fundHolders: [],
      insiderHolders: [],
      directHolders: [],
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z'
      }
    };
    const result = HoldersOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing majorHoldersBreakdown', () => {
    const output = {
      symbol: 'AAPL',
      institutionalHolders: [],
      fundHolders: [],
      insiderHolders: [],
      directHolders: [],
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z'
      }
    };
    const result = HoldersOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing meta', () => {
    const output = {
      symbol: 'AAPL',
      majorHoldersBreakdown: {
        insidersPercentHeld: 0.05,
        institutionsPercentHeld: 0.62,
        institutionsFloatPercentHeld: 0.65,
        institutionsCount: 5000
      },
      institutionalHolders: [],
      fundHolders: [],
      insiderHolders: [],
      directHolders: []
    };
    const result = HoldersOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should accept empty holder arrays', () => {
    const output = {
      symbol: 'AAPL',
      majorHoldersBreakdown: {
        insidersPercentHeld: 0.05,
        institutionsPercentHeld: 0.62,
        institutionsFloatPercentHeld: 0.65,
        institutionsCount: 5000
      },
      institutionalHolders: [],
      fundHolders: [],
      insiderHolders: [],
      directHolders: [],
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z'
      }
    };
    const result = HoldersOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });
});
