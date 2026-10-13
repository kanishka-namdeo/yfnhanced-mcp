import { SummaryTools } from '../../../src/tools/summary';
import { YahooFinanceClient } from '../../../src/services/yahoo-finance';

describe('SummaryTools', () => {
  let tools: SummaryTools;
  let mockClient: jest.Mocked<YahooFinanceClient>;

  beforeEach(() => {
    mockClient = {
      getSummaryProfile: jest.fn(),
      getTrending: jest.fn(),
      screener: jest.fn(),
      getCryptoQuote: jest.fn((symbols: string[]) => {
        const record: Record<string, unknown> = {};
        for (const symbol of symbols) {
          record[symbol] = { symbol, regularMarketPrice: 100, currency: 'USD' };
        }
        return Promise.resolve(record);
      }),
      getForexQuote: jest.fn((pairs: string[]) => {
        const record: Record<string, unknown> = {};
        for (const pair of pairs) {
          record[pair] = { symbol: pair, regularMarketPrice: 1, currency: 'USD' };
        }
        return Promise.resolve(record);
      })
    } as unknown as jest.Mocked<YahooFinanceClient>;

    const config = {
      serverInfo: {
        name: 'Test Server',
        version: '1.0.0',
        protocolVersion: '1.0'
      },
      capabilities: {},
      transport: 'stdio',
      rateLimit: {
        strategy: 'token-bucket' as const,
        maxRequests: 10,
        windowMs: 60000,
        tokenRefillRate: 1
      },
      cache: {
        enabled: true,
        store: 'memory',
        ttl: 60000,
        maxEntries: 100
      },
      retry: {
        enabled: true,
        maxRetries: 3,
        initialDelayMs: 1000,
        maxDelayMs: 10000,
        strategy: 'exponential',
        backoffMultiplier: 2,
        jitter: false,
        retryableStatusCodes: [429, 500],
        retryableErrorCodes: ['ECONNRESET']
      },
      circuitBreaker: {
        enabled: true,
        timeoutMs: 60000,
        errorThresholdPercentage: 5,
        resetTimeoutMs: 60000,
        rollingCountBuckets: 60,
        rollingCountTimeoutMs: 60000,
        volumeThreshold: 5,
        halfOpenMaxAttempts: 3
      },
      queue: {
        enabled: true,
        maxSize: 100,
        strategy: 'fifo',
        concurrency: 5,
        timeoutMs: 30000,
        processingTimeoutMs: 60000
      },
      dataCompletion: {
        enabled: true,
        level: 'moderate',
        requiredFields: [],
        preferredFields: [],
        allowPartial: true,
        fallbackToCache: true
      },
      logging: {
        level: 'info',
        format: 'text',
        destination: 'console'
      },
      network: {
        timeoutMs: 30000,
        keepAlive: true,
        keepAliveMsecs: 1000,
        maxSockets: 10,
        maxFreeSockets: 5,
        scheduling: 'fifo',
        maxRedirects: 5,
        followRedirects: true
      },
      yahooFinance: {
        baseUrl: 'https://query1.finance.yahoo.com',
        timeoutMs: 30000,
        userAgent: 'Mozilla/5.0',
        maxConcurrentRequests: 5,
        requestQueueSize: 100,
        validateResponses: true,
        strictMode: false
      }
    };

    tools = new SummaryTools(mockClient, config);
  });

  describe('getSummaryProfile', () => {
    test('should get summary profile successfully', async () => {
      const mockResult = {
        assetProfile: {
          address1: 'One Apple Park Way',
          city: 'Cupertino',
          state: 'CA',
          zip: '95014',
          country: 'United States',
          phone: '408-996-1010',
          website: 'https://www.apple.com',
          industry: 'Consumer Electronics',
          sector: 'Technology',
          fullTimeEmployees: 164000,
          longBusinessSummary: 'Apple Inc. designs, manufactures, and markets smartphones...'
        }
      };

      mockClient.getSummaryProfile.mockResolvedValue(mockResult);

      const result = await tools.getSummaryProfile({ symbol: 'AAPL' });

      expect(result).toHaveProperty('symbol', 'AAPL');
      expect(result).toHaveProperty('profile');
      expect(result).toHaveProperty('meta');
      expect(result.meta).toHaveProperty('fromCache');
      expect(result.meta).toHaveProperty('dataAge');
      expect(result.meta).toHaveProperty('completenessScore');
      expect(result.meta).toHaveProperty('warnings');
    });

    test('should handle missing sector', async () => {
      const mockResult = {
        assetProfile: {
          address1: 'One Apple Park Way',
          city: 'Cupertino',
          state: 'CA',
          zip: '95014',
          country: 'United States',
          phone: '408-996-1010',
          website: 'https://www.apple.com',
          industry: 'Software',
          sector: '',
          fullTimeEmployees: 164000,
          longBusinessSummary: 'Apple Inc. designs software...'
        }
      };

      mockClient.getSummaryProfile.mockResolvedValue(mockResult);

      const result = await tools.getSummaryProfile({ symbol: 'AAPL' });

      expect(result.meta.warnings).toContain('Sector data is missing');
    });

    test('should handle missing industry', async () => {
      const mockResult = {
        assetProfile: {
          address1: 'One Apple Park Way',
          city: 'Cupertino',
          state: 'CA',
          zip: '95014',
          country: 'United States',
          phone: '408-996-1010',
          website: 'https://www.apple.com',
          industry: '',
          sector: 'Technology',
          fullTimeEmployees: 164000,
          longBusinessSummary: 'Apple Inc. designs...'
        }
      };

      mockClient.getSummaryProfile.mockResolvedValue(mockResult);

      const result = await tools.getSummaryProfile({ symbol: 'AAPL' });

      expect(result.meta.warnings).toContain('Industry data is missing');
    });

    test('should handle missing business summary', async () => {
      const mockResult = {
        assetProfile: {
          address1: 'One Apple Park Way',
          city: 'Cupertino',
          state: 'CA',
          zip: '95014',
          country: 'United States',
          phone: '408-996-1010',
          website: 'https://www.apple.com',
          industry: 'Consumer Electronics',
          sector: 'Technology',
          fullTimeEmployees: 164000,
          longBusinessSummary: ''
        }
      };

      mockClient.getSummaryProfile.mockResolvedValue(mockResult);

      const result = await tools.getSummaryProfile({ symbol: 'AAPL', includeBusinessSummary: true });

      expect(result.meta.warnings).toContain('Business summary is unavailable');
    });

    test('should throw error on client failure', async () => {
      mockClient.getSummaryProfile.mockRejectedValue(new Error('Network error'));

      await expect(tools.getSummaryProfile({ symbol: 'AAPL' })).rejects.toThrow('Failed to fetch summary profile for AAPL');
    });
  });

  describe('getCryptoQuote', () => {
    test('should get crypto quote successfully', async () => {
      const result = await tools.getCryptoQuote({ symbols: ['BTC-USD', 'ETH-USD'] });

      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('summary');
      expect(result.results).toHaveProperty('BTC-USD');
      expect(result.results).toHaveProperty('ETH-USD');
      expect(result.summary.totalRequested).toBe(2);
    });

    test('should handle errors for individual symbols', async () => {
      mockClient.getCryptoQuote.mockImplementation((symbols: string[]) =>
        Promise.reject(new Error(`No crypto data for ${symbols[0]}`)));

      const result = await tools.getCryptoQuote({ symbols: ['BTC-USD', 'INVALID'] });

      expect(result.summary.totalReturned).toBe(0);
      expect(result.summary.errors).toHaveLength(2);
      expect(result.summary.errors.map((entry) => entry.symbol)).toEqual(['BTC-USD', 'INVALID']);
    });

    test('should respect currency parameter', async () => {
      const result = await tools.getCryptoQuote({ symbols: ['BTC-USD'], currency: 'EUR' });

      expect(result.results['BTC-USD']).toBeDefined();
    });
  });

  describe('getForexQuote', () => {
    test('should get forex quote successfully', async () => {
      const result = await tools.getForexQuote({ pairs: ['EURUSD', 'GBPUSD'] });

      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('summary');
      expect(result.results).toHaveProperty('EURUSD');
      expect(result.results).toHaveProperty('GBPUSD');
      expect(result.summary.totalRequested).toBe(2);
    });

    test('should handle errors for individual pairs', async () => {
      mockClient.getForexQuote.mockImplementation(() =>
        Promise.reject(new Error('No forex data')));

      const result = await tools.getForexQuote({ pairs: ['EURUSD', 'INVALID'] });

      expect(result.summary.totalReturned).toBe(0);
      expect(result.summary.errors).toHaveLength(2);
    });
  });

  describe('getTrendingSymbols', () => {
    test('should get trending symbols successfully', async () => {
      const mockTrending = {
        quotes: [
          { symbol: 'AAPL', name: 'Apple Inc.' },
          { symbol: 'MSFT', name: 'Microsoft Corporation' }
        ]
      };

      mockClient.getTrending.mockResolvedValue(mockTrending);

      const result = await tools.getTrendingSymbols({ region: 'US', limit: 10 });

      expect(result).toHaveProperty('trending');
      expect(result).toHaveProperty('meta');
      expect(result.trending.quotes).toHaveLength(2);
      expect(result.meta).toHaveProperty('fromCache');
      expect(result.meta).toHaveProperty('dataAge');
      expect(result.meta).toHaveProperty('completenessScore');
      expect(result.meta).toHaveProperty('warnings');
    });

    test('should handle empty trending list', async () => {
      const mockTrending = {
        quotes: []
      };

      mockClient.getTrending.mockResolvedValue(mockTrending);

      const result = await tools.getTrendingSymbols({ region: 'US' });

      expect(result.meta.warnings).toContain('No trending symbols returned');
      expect(result.meta.completenessScore).toBe(0);
    });

    test('should respect limit parameter', async () => {
      const mockTrending = {
        quotes: Array.from({ length: 20 }, (_, i) => ({
          symbol: `SYMBOL${i}`,
          name: `Stock ${i}`
        }))
      };

      mockClient.getTrending.mockResolvedValue(mockTrending);

      const result = await tools.getTrendingSymbols({ limit: 5 });

      expect(result.trending.quotes).toHaveLength(5);
    });

    test('should throw error on client failure', async () => {
      mockClient.getTrending.mockRejectedValue(new Error('Network error'));

      await expect(tools.getTrendingSymbols({ region: 'US' })).rejects.toThrow('Failed to fetch trending symbols');
    });
  });

  describe('screener', () => {
    test('should screen stocks successfully', async () => {
      const mockScreener = {
        finance: {
          result: [
            {
              quotes: [
                { symbol: 'AAPL', lastPrice: 150, volume: 50000000, marketCap: 2500000000000 },
                { symbol: 'MSFT', lastPrice: 300, volume: 30000000, marketCap: 2800000000000 }
              ]
            }
          ]
        }
      };

      mockClient.screener.mockResolvedValue(mockScreener);

      const result = await tools.screener({
        filters: { sector: 'Technology' },
        limit: 25
      });

      expect(result).toHaveProperty('screened');
      expect(result).toHaveProperty('meta');
      expect(result.meta).toHaveProperty('fromCache');
      expect(result.meta).toHaveProperty('dataAge');
      expect(result.meta).toHaveProperty('completenessScore');
      expect(result.meta).toHaveProperty('warnings');
    });

    test('should validate filters', async () => {
      await expect(
        tools.screener({
          filters: { invalidField: 'value' },
          validateFilters: true
        })
      ).rejects.toThrow('Invalid screener filters');
    });

    test('should skip validation when requested', async () => {
      const mockScreener = {
        finance: {
          result: [
            {
              quotes: []
            }
          ]
        }
      };

      mockClient.screener.mockResolvedValue(mockScreener);

      await expect(
        tools.screener({
          filters: { invalidField: 'value' },
          validateFilters: false
        })
      ).resolves.toBeDefined();
    });

    test('should handle screener errors', async () => {
      const mockScreener = {
        finance: {
          error: {
            description: 'Invalid filter'
          }
        }
      };

      mockClient.screener.mockResolvedValue(mockScreener);

      const result = await tools.screener({
        filters: { sector: 'Technology' }
      });

      expect(result.meta.warnings).toContain('Screener error: Invalid filter');
    });

    test('should throw error on client failure', async () => {
      mockClient.screener.mockRejectedValue(new Error('Network error'));

      await expect(
        tools.screener({
          filters: { sector: 'Technology' }
        })
      ).rejects.toThrow('Failed to fetch screener results');
    });
  });

  describe('getTools', () => {
    test('should return all summary tools', () => {
      const toolList = tools.getTools();

      expect(toolList).toHaveLength(5);
      expect(toolList[0].name).toBe('get_summary_profile');
      expect(toolList[1].name).toBe('get_crypto_quote');
      expect(toolList[2].name).toBe('get_forex_quote');
      expect(toolList[3].name).toBe('get_trending_symbols');
      expect(toolList[4].name).toBe('screener');
    });

    test('should have proper tool schemas', () => {
      const toolList = tools.getTools();

      toolList.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('inputSchema');
        expect(tool.inputSchema).toHaveProperty('type', 'object');
        expect(tool.inputSchema).toHaveProperty('properties');
      });
    });

    test('should have required fields in schemas', () => {
      const toolList = tools.getTools();

      toolList.forEach(tool => {
        if (tool.name === 'get_summary_profile') {
          expect(tool.inputSchema.required).toContain('symbol');
        } else if (tool.name === 'get_crypto_quote') {
          expect(tool.inputSchema.required).toContain('symbols');
        } else if (tool.name === 'get_forex_quote') {
          expect(tool.inputSchema.required).toContain('pairs');
        } else if (tool.name === 'screener') {
          expect(tool.inputSchema.required).toContain('filters');
        }
      });
    });
  });

  // Every case below exercises a documented degradation or fallback path in
  // src/tools/summary.ts that the happy-path suite above never reaches: whitespace-only
  // strings counting as missing, the two sector/industry keyword ladders, the batch loops'
  // non-Error error text, the >1 s "served from cache" counters, and the optional-envelope
  // screener/trending shapes.
  describe('summary profile fallback classification', () => {
    function profilePayload(assetProfile: Record<string, unknown>): { assetProfile: Record<string, unknown> } {
      return { assetProfile };
    }

    test('names a non-Error rejection with String() in the thrown message', async () => {
      mockClient.getSummaryProfile.mockRejectedValue('upstream said no');

      await expect(tools.getSummaryProfile({ symbol: 'AAPL' })).rejects.toThrow(
        'Failed to fetch summary profile for AAPL: upstream said no'
      );
    });

    test('treats whitespace-only sector, industry and summary as missing and lands on the ladders', async () => {
      mockClient.getSummaryProfile.mockResolvedValue(profilePayload({
        sector: '   ',
        industry: '   ',
        longBusinessSummary: '   ',
        fullTimeEmployees: 164000,
        city: 'Cupertino',
        country: 'United States',
        website: 'https://www.apple.com'
      }));

      const result = await tools.getSummaryProfile({ symbol: 'AAPL' });

      expect(result.meta.warnings).toEqual([
        'Sector data is missing',
        'Industry data is missing',
        'Business summary is unavailable'
      ]);
      expect(result.profile.assetProfile.sector).toBe('Unknown');
      expect(result.profile.assetProfile.industry).toBe('General');
    });

    test('falls back to Unknown when the industry is absent altogether', async () => {
      mockClient.getSummaryProfile.mockResolvedValue(profilePayload({
        sector: '',
        longBusinessSummary: 'Apple Inc. designs smartphones.',
        fullTimeEmployees: 164000,
        city: 'Cupertino',
        country: 'United States',
        website: 'https://www.apple.com'
      }));

      const result = await tools.getSummaryProfile({ symbol: 'AAPL' });

      expect(result.profile.assetProfile.sector).toBe('Unknown');
      expect(result.profile.assetProfile.industry).toBe('General');
    });

    const sectorCases: Array<[string, string]> = [
      ['Computer Hardware', 'Technology'],
      ['Pharmaceutical Preparations', 'Healthcare'],
      ['Insurance Brokers', 'Financial Services'],
      ['Natural Gas Field Services', 'Energy'],
      ['Apparel Retail', 'Consumer Cyclical'],
      ['Metal Manufacturing', 'Industrials'],
      ['Electric Utilities', 'Utilities'],
      ['Real Estate Investment Trusts', 'Real Estate'],
      ['Wireless Telecom', 'Communication Services'],
      ['Chemical Products', 'Materials'],
      ['Aerospace Defense', 'Unknown']
    ];

    for (const [industry, expectedSector] of sectorCases) {
      test(`classifies an absent sector from the industry "${industry}"`, async () => {
        mockClient.getSummaryProfile.mockResolvedValue(profilePayload({
          sector: '',
          industry,
          longBusinessSummary: 'Operates in a national market.',
          fullTimeEmployees: 1000,
          city: 'New York',
          country: 'United States',
          website: 'https://example.com'
        }));

        const result = await tools.getSummaryProfile({ symbol: 'AAPL' });

        expect(result.profile.assetProfile.sector).toBe(expectedSector);
        // The industry is present, so its own ladder is never consulted.
        expect(result.meta.warnings).toEqual(['Sector data is missing']);
        expect(result.profile.assetProfile.industry).toBe(industry);
      });
    }

    const industryCases: Array<[string, string]> = [
      ['Platform Engineering', 'Software'],
      ['Drug Delivery Services', 'Biotechnology'],
      ['Chip Fabrication', 'Semiconductors'],
      ['E-Commerce Marketplace', 'Retail'],
      ['Lending Solutions', 'Banks'],
      ['Insurance Underwriting', 'Insurance'],
      ['Investment Advisory', 'Investment Management'],
      ['Energy Storage Systems', 'Energy'],
      ['Car Dealership', 'Auto Manufacturers'],
      ['Nothing relevant here at all', 'General']
    ];

    for (const [longBusinessSummary, expectedIndustry] of industryCases) {
      test(`classifies an absent industry from the summary "${longBusinessSummary}"`, async () => {
        mockClient.getSummaryProfile.mockResolvedValue(profilePayload({
          sector: 'Technology',
          industry: '',
          longBusinessSummary,
          fullTimeEmployees: 1000,
          city: 'New York',
          country: 'United States',
          website: 'https://example.com'
        }));

        const result = await tools.getSummaryProfile({ symbol: 'AAPL' });

        expect(result.profile.assetProfile.industry).toBe(expectedIndustry);
        expect(result.meta.warnings).toEqual(['Industry data is missing']);
        expect(result.profile.assetProfile.sector).toBe('Technology');
      });
    }

    test('skips the summary warning when the caller asked for no business summary', async () => {
      mockClient.getSummaryProfile.mockResolvedValue(profilePayload({
        sector: 'Technology',
        industry: 'Consumer Electronics',
        longBusinessSummary: '',
        fullTimeEmployees: 164000,
        city: 'Cupertino',
        country: 'United States',
        website: 'https://www.apple.com'
      }));

      const result = await tools.getSummaryProfile({ symbol: 'AAPL', includeBusinessSummary: false });

      expect(result.meta.warnings).toEqual([]);
    });
  });

  describe('batch loop degradation', () => {
    test('counts a crypto fetch that outlived a second as served from cache', async () => {
      const spy = jest.spyOn(Date, 'now').mockReturnValueOnce(0);

      try {
        const result = await tools.getCryptoQuote({ symbols: ['BTC-USD'] });

        expect(result.summary.fromCache).toBe(1);
        expect(result.summary.totalReturned).toBe(1);
        expect(result.summary.errors).toEqual([]);
      } finally {
        spy.mockRestore();
      }
    });

    test('records a non-Error crypto failure as String(error)', async () => {
      mockClient.getCryptoQuote.mockRejectedValue('rate limited');

      const result = await tools.getCryptoQuote({ symbols: ['BTC-USD'] });

      expect(result.summary.totalReturned).toBe(0);
      expect(result.summary.errors).toEqual([{ symbol: 'BTC-USD', error: 'rate limited' }]);
    });

    test('suffixes a currency onto a symbol that does not carry a dash', async () => {
      const result = await tools.getCryptoQuote({ symbols: ['BTC'], currency: 'USD' });

      expect(mockClient.getCryptoQuote).toHaveBeenCalledWith(['BTC-USD']);
      expect(result.summary.totalReturned).toBe(1);
      expect(result.results.BTC).toMatchObject({ symbol: 'BTC-USD' });
      expect(result.summary.errors).toEqual([]);
    });

    test('ignores an empty currency and validates nothing for it', async () => {
      const result = await tools.getCryptoQuote({ symbols: ['ETH-USD'], currency: '' });

      expect(mockClient.getCryptoQuote).toHaveBeenCalledWith(['ETH-USD']);
      expect(result.summary.totalReturned).toBe(1);
    });

    test('counts a forex fetch that outlived a second as served from cache', async () => {
      const spy = jest.spyOn(Date, 'now').mockReturnValueOnce(0);

      try {
        const result = await tools.getForexQuote({ pairs: ['EURUSD'] });

        expect(result.summary.fromCache).toBe(1);
        expect(result.summary.totalReturned).toBe(1);
      } finally {
        spy.mockRestore();
      }
    });

    test('records a non-Error forex failure as String(error)', async () => {
      mockClient.getForexQuote.mockRejectedValue({ message: 'not an error' });

      const result = await tools.getForexQuote({ pairs: ['EURUSD'] });

      expect(result.summary.totalReturned).toBe(0);
      expect(result.summary.errors).toEqual([{ pair: 'EURUSD', error: '[object Object]' }]);
    });

    test('mixes successes and failures in one forex batch', async () => {
      mockClient.getForexQuote.mockImplementation((pairs: string[]) =>
        pairs[0] === 'EURUSD'
          ? Promise.resolve({ EURUSD: { symbol: 'EURUSD', regularMarketPrice: 1.08 } })
          : Promise.reject(new Error('no such pair')));

      const result = await tools.getForexQuote({ pairs: ['EURUSD', 'XYZABC'] });

      expect(result.summary.totalRequested).toBe(2);
      expect(result.summary.totalReturned).toBe(1);
      expect(result.results.EURUSD).toMatchObject({ regularMarketPrice: 1.08 });
      expect(result.summary.errors).toEqual([{ pair: 'XYZABC', error: 'no such pair' }]);
    });
  });

  describe('trending degradation envelope', () => {
    test('warns and scores zero when the envelope omits quotes', async () => {
      mockClient.getTrending.mockResolvedValue({});

      const result = await tools.getTrendingSymbols({ region: 'US' });

      expect(result.meta.warnings).toContain('No trending symbols returned');
      expect(result.meta.completenessScore).toBe(0);
    });

    test('warns and scores zero when quotes are explicitly null', async () => {
      mockClient.getTrending.mockResolvedValue({ quotes: null });

      const result = await tools.getTrendingSymbols({ region: 'GB' });

      expect(result.meta.warnings).toContain('No trending symbols returned');
      expect(result.meta.completenessScore).toBe(0);
    });

    test('scales completeness against the default ten when no limit is given', async () => {
      mockClient.getTrending.mockResolvedValue({
        quotes: [{ symbol: 'AAPL' }, { symbol: 'MSFT' }]
      });

      const result = await tools.getTrendingSymbols({});

      expect(mockClient.getTrending).toHaveBeenCalledWith({ region: 'US' });
      expect(result.meta.completenessScore).toBe(20);
    });

    test('caps completeness at 100 when more quotes arrive than the limit', async () => {
      mockClient.getTrending.mockResolvedValue({
        quotes: Array.from({ length: 8 }, (_, index) => ({ symbol: `S${index}` }))
      });

      const result = await tools.getTrendingSymbols({ region: '', limit: 2 });

      expect(mockClient.getTrending).toHaveBeenCalledWith({ region: 'US' });
      expect(result.meta.completenessScore).toBe(100);
    });

    test('names a non-Error trending rejection with String(error)', async () => {
      mockClient.getTrending.mockRejectedValue('region unavailable');

      await expect(tools.getTrendingSymbols({ region: 'US' })).rejects.toThrow(
        'Failed to fetch trending symbols: region unavailable'
      );
    });
  });

  describe('screener envelope and filter validation', () => {
    test('scores zero for every partial finance envelope', async () => {
      const envelopes: Array<Record<string, unknown>> = [
        { finance: {} },
        { finance: { result: [] } },
        { finance: { result: [{}] } }
      ];

      for (const envelope of envelopes) {
        mockClient.screener.mockResolvedValue(envelope);

        const result = await tools.screener({ filters: { sector: 'Technology' } });

        expect(result.screened).toEqual(envelope as never);
        expect(result.meta.completenessScore).toBe(0);
        expect(result.meta.warnings).toEqual([]);
      }

      expect(mockClient.screener).toHaveBeenCalledTimes(3);
    });

    test('scores a matched quote per reported required field', async () => {
      mockClient.screener.mockResolvedValue({
        finance: {
          result: [{
            quotes: [
              { symbol: 'AAPL', lastPrice: 150, volume: null, marketCap: undefined },
              { symbol: 'MSFT', lastPrice: 300, volume: 1, marketCap: 2 }
            ]
          }]
        }
      });

      const result = await tools.screener({ filters: { marketCap: 1000000000, sector: 'Technology' } });

      // First quote reports 2 of 4 required fields (volume is null, marketCap absent), the
      // second all 4, so the mean row completeness is 0.75. Non-string filter values are not
      // run through the string grammar validator — only keys and string values are.
      expect(result.meta.completenessScore).toBe(75);
      expect(mockClient.screener).toHaveBeenCalledWith(
        [
          { field: 'marketCap', operator: '=', value: '1000000000' },
          { field: 'sector', operator: '=', value: 'Technology' }
        ],
        { count: 25, offset: 0 }
      );
    });

    test('rejects a null filter value before any fetch', async () => {
      await expect(
        tools.screener({ filters: { marketCap: null } })
      ).rejects.toThrow(
        'Invalid screener filters: Filter value cannot be null or undefined for field: marketCap'
      );

      expect(mockClient.screener).not.toHaveBeenCalled();
    });

    test('collects both an invalid field name and a null value in one error', async () => {
      await expect(
        tools.screener({ filters: { nope: null } })
      ).rejects.toThrow(/Invalid filter field: nope[\s\S]*null or undefined for field: nope/);
    });

    test('defaults the screener count to 25 and honours an explicit limit', async () => {
      mockClient.screener.mockResolvedValue({ finance: { result: [{ quotes: [] }] } });

      await tools.screener({ filters: { sector: 'Technology' } });
      await tools.screener({ filters: { sector: 'Technology' }, limit: 50 });

      expect(mockClient.screener.mock.calls.map((call) => call[1])).toEqual([
        { count: 25, offset: 0 },
        { count: 50, offset: 0 }
      ]);
    });

    test('names a non-Error screener rejection with String(error)', async () => {
      mockClient.screener.mockRejectedValue('screener down');

      await expect(
        tools.screener({ filters: { sector: 'Technology' }, validateFilters: false })
      ).rejects.toThrow('Failed to fetch screener results: screener down');
    });
  });
});
