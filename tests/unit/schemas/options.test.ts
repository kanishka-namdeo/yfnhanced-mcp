import { OptionsInputSchema, OptionContractSchema, OptionsExpirationSchema, OptionsMetaSchema, OptionsOutputSchema } from '../../../src/schemas/options';

describe('OptionsInputSchema', () => {
  test('should validate valid options input', () => {
    const input = { symbol: 'AAPL' };
    const result = OptionsInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should validate input with date', () => {
    const input = {
      symbol: 'AAPL',
      date: '2024-02-15'
    };
    const result = OptionsInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should validate input with expiration', () => {
    const input = {
      symbol: 'AAPL',
      expiration: '2024-02-15'
    };
    const result = OptionsInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should validate input with optionsType', () => {
    const input = {
      symbol: 'AAPL',
      optionsType: 'calls'
    };
    const result = OptionsInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should validate input with includeGreeks', () => {
    const input = {
      symbol: 'AAPL',
      includeGreeks: true
    };
    const result = OptionsInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should reject missing symbol', () => {
    const input = {};
    const result = OptionsInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject empty symbol', () => {
    const input = { symbol: '' };
    const result = OptionsInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject symbol longer than 20 characters', () => {
    const input = { symbol: 'VERYLONGSYMBOLTHATISTOOLONG' };
    const result = OptionsInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should accept valid optionsTypes', () => {
    const types = ['calls', 'puts', 'both'];
    types.forEach(type => {
      const input = {
        symbol: 'AAPL',
        optionsType: type
      };
      const result = OptionsInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  test('should accept boolean includeGreeks', () => {
    const input = {
      symbol: 'AAPL',
      includeGreeks: false
    };
    const result = OptionsInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});

describe('OptionContractSchema', () => {
  test('should validate option contract with all fields', () => {
    const contract = {
      contractSymbol: 'AAPL240216C00150000',
      strike: 150,
      lastPrice: 5.25,
      change: 0.50,
      percentChange: 10.53,
      volume: 1000,
      openInterest: 5000,
      bid: 5.00,
      ask: 5.50,
      impliedVolatility: 0.25,
      inTheMoney: true,
      contractSize: 100,
      currency: 'USD',
      delta: 0.65,
      gamma: 0.05,
      theta: -0.02,
      vega: 0.15
    };
    const result = OptionContractSchema.safeParse(contract);
    expect(result.success).toBe(true);
  });

  test('should validate contract with required fields', () => {
    const contract = {
      contractSymbol: 'AAPL240216C00150000',
      strike: 150,
      lastPrice: null,
      change: null,
      percentChange: null,
      volume: 0,
      openInterest: 5000,
      bid: null,
      ask: null,
      impliedVolatility: null,
      inTheMoney: true,
      contractSize: 100,
      currency: 'USD',
      delta: null,
      gamma: null,
      theta: null,
      vega: null
    };
    const result = OptionContractSchema.safeParse(contract);
    expect(result.success).toBe(true);
  });

  test('should reject missing contractSymbol', () => {
    const contract = {
      strike: 150,
      volume: 1000,
      openInterest: 5000,
      inTheMoney: true,
      contractSize: 100,
      currency: 'USD',
      delta: null,
      gamma: null,
      theta: null,
      vega: null
    };
    const result = OptionContractSchema.safeParse(contract);
    expect(result.success).toBe(false);
  });

  test('should reject missing strike', () => {
    const contract = {
      contractSymbol: 'AAPL240216C00150000',
      volume: 1000,
      openInterest: 5000,
      inTheMoney: true,
      contractSize: 100,
      currency: 'USD',
      delta: null,
      gamma: null,
      theta: null,
      vega: null
    };
    const result = OptionContractSchema.safeParse(contract);
    expect(result.success).toBe(false);
  });

  test('should reject negative volume', () => {
    const contract = {
      contractSymbol: 'AAPL240216C00150000',
      strike: 150,
      volume: -100,
      openInterest: 5000,
      inTheMoney: true,
      contractSize: 100,
      currency: 'USD',
      delta: null,
      gamma: null,
      theta: null,
      vega: null
    };
    const result = OptionContractSchema.safeParse(contract);
    expect(result.success).toBe(false);
  });

  test('should reject negative openInterest', () => {
    const contract = {
      contractSymbol: 'AAPL240216C00150000',
      strike: 150,
      volume: 1000,
      openInterest: -5000,
      inTheMoney: true,
      contractSize: 100,
      currency: 'USD',
      delta: null,
      gamma: null,
      theta: null,
      vega: null
    };
    const result = OptionContractSchema.safeParse(contract);
    expect(result.success).toBe(false);
  });

  test('should accept negative strike', () => {
    const contract = {
      contractSymbol: 'AAPL240216P00150000',
      strike: -150,
      volume: 1000,
      openInterest: 5000,
      inTheMoney: true,
      contractSize: 100,
      currency: 'USD',
      delta: null,
      gamma: null,
      theta: null,
      vega: null
    };
    const result = OptionContractSchema.safeParse(contract);
    expect(result.success).toBe(true);
  });

  test('should accept null for optional fields', () => {
    const contract = {
      contractSymbol: 'AAPL240216C00150000',
      strike: 150,
      lastPrice: null,
      change: null,
      percentChange: null,
      volume: 0,
      openInterest: 5000,
      bid: null,
      ask: null,
      impliedVolatility: null,
      inTheMoney: true,
      contractSize: 100,
      currency: 'USD',
      delta: null,
      gamma: null,
      theta: null,
      vega: null
    };
    const result = OptionContractSchema.safeParse(contract);
    expect(result.success).toBe(true);
  });

  test('should accept boolean inTheMoney', () => {
    const contract = {
      contractSymbol: 'AAPL240216C00150000',
      strike: 150,
      volume: 0,
      openInterest: 5000,
      inTheMoney: false,
      contractSize: 100,
      currency: 'USD',
      delta: null,
      gamma: null,
      theta: null,
      vega: null
    };
    const result = OptionContractSchema.safeParse(contract);
    expect(result.success).toBe(true);
  });
});

describe('OptionsExpirationSchema', () => {
  test('should validate expiration with all fields', () => {
    const expiration = {
      expirationDate: '2024-02-16',
      date: 1708089600,
      hasMiniOptions: false,
      calls: [
        {
          contractSymbol: 'AAPL240216C00150000',
          strike: 150,
          volume: 0,
          openInterest: 5000,
          inTheMoney: true,
          contractSize: 100,
          currency: 'USD',
          delta: null,
          gamma: null,
          theta: null,
          vega: null,
          lastPrice: null,
          change: null,
          percentChange: null,
          bid: null,
          ask: null,
          impliedVolatility: null
        }
      ],
      puts: []
    };
    const result = OptionsExpirationSchema.safeParse(expiration);
    expect(result.success).toBe(true);
  });

  test('should validate expiration with required fields', () => {
    const expiration = {
      expirationDate: '2024-02-16',
      date: 1708089600,
      hasMiniOptions: false,
      calls: [],
      puts: []
    };
    const result = OptionsExpirationSchema.safeParse(expiration);
    expect(result.success).toBe(true);
  });

  test('should reject missing expirationDate', () => {
    const expiration = {
      date: 1708089600,
      hasMiniOptions: false,
      calls: [],
      puts: []
    };
    const result = OptionsExpirationSchema.safeParse(expiration);
    expect(result.success).toBe(false);
  });

  test('should reject missing date', () => {
    const expiration = {
      expirationDate: '2024-02-16',
      hasMiniOptions: false,
      calls: [],
      puts: []
    };
    const result = OptionsExpirationSchema.safeParse(expiration);
    expect(result.success).toBe(false);
  });

  test('should reject missing hasMiniOptions', () => {
    const expiration = {
      expirationDate: '2024-02-16',
      date: 1708089600,
      calls: [],
      puts: []
    };
    const result = OptionsExpirationSchema.safeParse(expiration);
    expect(result.success).toBe(false);
  });

  test('should reject missing calls', () => {
    const expiration = {
      expirationDate: '2024-02-16',
      date: 1708089600,
      hasMiniOptions: false,
      puts: []
    };
    const result = OptionsExpirationSchema.safeParse(expiration);
    expect(result.success).toBe(false);
  });

  test('should reject missing puts', () => {
    const expiration = {
      expirationDate: '2024-02-16',
      date: 1708089600,
      hasMiniOptions: false,
      calls: []
    };
    const result = OptionsExpirationSchema.safeParse(expiration);
    expect(result.success).toBe(false);
  });

  test('should accept boolean hasMiniOptions', () => {
    const expiration = {
      expirationDate: '2024-02-16',
      date: 1708089600,
      hasMiniOptions: true,
      calls: [],
      puts: []
    };
    const result = OptionsExpirationSchema.safeParse(expiration);
    expect(result.success).toBe(true);
  });

  test('should accept empty calls array', () => {
    const expiration = {
      expirationDate: '2024-02-16',
      date: 1708089600,
      hasMiniOptions: false,
      calls: [],
      puts: []
    };
    const result = OptionsExpirationSchema.safeParse(expiration);
    expect(result.success).toBe(true);
  });

  test('should accept empty puts array', () => {
    const expiration = {
      expirationDate: '2024-02-16',
      date: 1708089600,
      hasMiniOptions: false,
      calls: [],
      puts: []
    };
    const result = OptionsExpirationSchema.safeParse(expiration);
    expect(result.success).toBe(true);
  });
});

describe('OptionsMetaSchema', () => {
  test('should validate meta with all fields', () => {
    const meta = {
      fromCache: true,
      dataAge: 300000,
      completenessScore: 0.95,
      warnings: [],
      dataSource: 'yahoo-finance',
      lastUpdated: '2024-01-15T10:30:00Z',
      availableExpirations: ['2024-02-16', '2024-03-15'],
      requestedExpiration: '2024-02-16',
      fallbackExpiration: false,
      ivCalculationMethod: 'black-scholes'
    };
    const result = OptionsMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  test('should validate meta with required fields', () => {
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: 1,
      warnings: [],
      dataSource: 'yahoo-finance',
      lastUpdated: '2024-01-15T10:30:00Z',
      availableExpirations: [],
      requestedExpiration: null,
      fallbackExpiration: false,
      ivCalculationMethod: 'black-scholes'
    };
    const result = OptionsMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  test('should reject negative dataAge', () => {
    const meta = {
      fromCache: false,
      dataAge: -1,
      completenessScore: 1,
      warnings: [],
      dataSource: 'yahoo-finance',
      lastUpdated: '2024-01-15T10:30:00Z',
      availableExpirations: [],
      requestedExpiration: null,
      fallbackExpiration: false,
      ivCalculationMethod: 'black-scholes'
    };
    const result = OptionsMetaSchema.safeParse(meta);
    expect(result.success).toBe(false);
  });

  test('should reject completenessScore less than 0', () => {
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: -0.1,
      warnings: [],
      dataSource: 'yahoo-finance',
      lastUpdated: '2024-01-15T10:30:00Z',
      availableExpirations: [],
      requestedExpiration: null,
      fallbackExpiration: false,
      ivCalculationMethod: 'black-scholes'
    };
    const result = OptionsMetaSchema.safeParse(meta);
    expect(result.success).toBe(false);
  });

  test('should reject completenessScore greater than 1', () => {
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: 1.1,
      warnings: [],
      dataSource: 'yahoo-finance',
      lastUpdated: '2024-01-15T10:30:00Z',
      availableExpirations: [],
      requestedExpiration: null,
      fallbackExpiration: false,
      ivCalculationMethod: 'black-scholes'
    };
    const result = OptionsMetaSchema.safeParse(meta);
    expect(result.success).toBe(false);
  });

  test('should accept null requestedExpiration', () => {
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: 1,
      warnings: [],
      dataSource: 'yahoo-finance',
      lastUpdated: '2024-01-15T10:30:00Z',
      availableExpirations: [],
      requestedExpiration: null,
      fallbackExpiration: false,
      ivCalculationMethod: 'black-scholes'
    };
    const result = OptionsMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  test('should accept boolean fallbackExpiration', () => {
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: 1,
      warnings: [],
      dataSource: 'yahoo-finance',
      lastUpdated: '2024-01-15T10:30:00Z',
      availableExpirations: [],
      requestedExpiration: null,
      fallbackExpiration: true,
      ivCalculationMethod: 'black-scholes'
    };
    const result = OptionsMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  test('should accept empty warnings array', () => {
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: 1,
      warnings: [],
      dataSource: 'yahoo-finance',
      lastUpdated: '2024-01-15T10:30:00Z',
      availableExpirations: [],
      requestedExpiration: null,
      fallbackExpiration: false,
      ivCalculationMethod: 'black-scholes'
    };
    const result = OptionsMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });
});

describe('OptionsOutputSchema', () => {
  test('should validate complete options output', () => {
    const output = {
      symbol: 'AAPL',
      options: {
        expirationDate: '2024-02-16',
        date: 1708089600,
        hasMiniOptions: false,
        calls: [],
        puts: []
      },
      expirationDates: ['2024-02-16', '2024-03-15'],
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z',
        availableExpirations: [],
        requestedExpiration: null,
        fallbackExpiration: false,
        ivCalculationMethod: 'black-scholes'
      }
    };
    const result = OptionsOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('should reject missing symbol', () => {
    const output = {
      options: {
        expirationDate: '2024-02-16',
        date: 1708089600,
        hasMiniOptions: false,
        calls: [],
        puts: []
      },
      expirationDates: [],
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z',
        availableExpirations: [],
        requestedExpiration: null,
        fallbackExpiration: false,
        ivCalculationMethod: 'black-scholes'
      }
    };
    const result = OptionsOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing options', () => {
    const output = {
      symbol: 'AAPL',
      expirationDates: [],
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z',
        availableExpirations: [],
        requestedExpiration: null,
        fallbackExpiration: false,
        ivCalculationMethod: 'black-scholes'
      }
    };
    const result = OptionsOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing expirationDates', () => {
    const output = {
      symbol: 'AAPL',
      options: {
        expirationDate: '2024-02-16',
        date: 1708089600,
        hasMiniOptions: false,
        calls: [],
        puts: []
      },
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z',
        availableExpirations: [],
        requestedExpiration: null,
        fallbackExpiration: false,
        ivCalculationMethod: 'black-scholes'
      }
    };
    const result = OptionsOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing meta', () => {
    const output = {
      symbol: 'AAPL',
      options: {
        expirationDate: '2024-02-16',
        date: 1708089600,
        hasMiniOptions: false,
        calls: [],
        puts: []
      },
      expirationDates: []
    };
    const result = OptionsOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should accept empty expirationDates array', () => {
    const output = {
      symbol: 'AAPL',
      options: {
        expirationDate: '2024-02-16',
        date: 1708089600,
        hasMiniOptions: false,
        calls: [],
        puts: []
      },
      expirationDates: [],
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z',
        availableExpirations: [],
        requestedExpiration: null,
        fallbackExpiration: false,
        ivCalculationMethod: 'black-scholes'
      }
    };
    const result = OptionsOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });
});
