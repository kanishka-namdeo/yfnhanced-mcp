import { NewsInputSchema, NewsItemSchema, NewsMetaSchema, NewsOutputSchema } from '../../../src/schemas/news';

describe('NewsInputSchema', () => {
  test('should validate valid news input', () => {
    const input = { symbol: 'AAPL' };
    const result = NewsInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should validate input with limit', () => {
    const input = {
      symbol: 'AAPL',
      limit: 10
    };
    const result = NewsInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should validate input with startDate', () => {
    const input = {
      symbol: 'AAPL',
      startDate: '2024-01-01'
    };
    const result = NewsInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should validate input with requireRelatedTickers', () => {
    const input = {
      symbol: 'AAPL',
      requireRelatedTickers: true
    };
    const result = NewsInputSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('should reject missing symbol', () => {
    const input = {};
    const result = NewsInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject empty symbol', () => {
    const input = { symbol: '' };
    const result = NewsInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject symbol longer than 20 characters', () => {
    const input = { symbol: 'VERYLONGSYMBOLTHATISTOOLONG' };
    const result = NewsInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject limit less than 1', () => {
    const input = {
      symbol: 'AAPL',
      limit: 0
    };
    const result = NewsInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject limit greater than 50', () => {
    const input = {
      symbol: 'AAPL',
      limit: 51
    };
    const result = NewsInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should reject non-integer limit', () => {
    const input = {
      symbol: 'AAPL',
      limit: 10.5
    };
    const result = NewsInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('should accept valid limit range', () => {
    for (let i = 1; i <= 50; i++) {
      const input = {
        symbol: 'AAPL',
        limit: i
      };
      const result = NewsInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    }
  });
});

describe('NewsItemSchema', () => {
  test('should validate news item with all fields', () => {
    const item = {
      uuid: 'abc123',
      title: 'Apple Reports Strong Q4 Earnings',
      publisher: 'Reuters',
      link: 'https://example.com/article',
      providerPublishTime: 1705327800,
      type: 'STORY',
      publishDate: '2024-01-15',
      urlValid: true,
      relatedTickers: ['AAPL', 'MSFT']
    };
    const result = NewsItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  test('should validate news item with required fields', () => {
    const item = {
      uuid: 'abc123',
      title: 'Apple Reports Strong Q4 Earnings',
      publisher: 'Reuters',
      link: 'https://example.com/article',
      providerPublishTime: 1705327800,
      type: 'STORY',
      publishDate: '2024-01-15',
      urlValid: true,
      relatedTickers: []
    };
    const result = NewsItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  test('should reject missing uuid', () => {
    const item = {
      title: 'Apple Reports Strong Q4 Earnings',
      publisher: 'Reuters',
      link: 'https://example.com/article',
      providerPublishTime: 1705327800,
      type: 'STORY',
      publishDate: '2024-01-15',
      urlValid: true,
      relatedTickers: []
    };
    const result = NewsItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('should reject missing title', () => {
    const item = {
      uuid: 'abc123',
      publisher: 'Reuters',
      link: 'https://example.com/article',
      providerPublishTime: 1705327800,
      type: 'STORY',
      publishDate: '2024-01-15',
      urlValid: true,
      relatedTickers: []
    };
    const result = NewsItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('should reject missing publisher', () => {
    const item = {
      uuid: 'abc123',
      title: 'Apple Reports Strong Q4 Earnings',
      link: 'https://example.com/article',
      providerPublishTime: 1705327800,
      type: 'STORY',
      publishDate: '2024-01-15',
      urlValid: true,
      relatedTickers: []
    };
    const result = NewsItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('should reject missing link', () => {
    const item = {
      uuid: 'abc123',
      title: 'Apple Reports Strong Q4 Earnings',
      publisher: 'Reuters',
      providerPublishTime: 1705327800,
      type: 'STORY',
      publishDate: '2024-01-15',
      urlValid: true,
      relatedTickers: []
    };
    const result = NewsItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('should reject missing providerPublishTime', () => {
    const item = {
      uuid: 'abc123',
      title: 'Apple Reports Strong Q4 Earnings',
      publisher: 'Reuters',
      link: 'https://example.com/article',
      type: 'STORY',
      publishDate: '2024-01-15',
      urlValid: true,
      relatedTickers: []
    };
    const result = NewsItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('should reject missing type', () => {
    const item = {
      uuid: 'abc123',
      title: 'Apple Reports Strong Q4 Earnings',
      publisher: 'Reuters',
      link: 'https://example.com/article',
      providerPublishTime: 1705327800,
      publishDate: '2024-01-15',
      urlValid: true,
      relatedTickers: []
    };
    const result = NewsItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('should reject missing publishDate', () => {
    const item = {
      uuid: 'abc123',
      title: 'Apple Reports Strong Q4 Earnings',
      publisher: 'Reuters',
      link: 'https://example.com/article',
      providerPublishTime: 1705327800,
      type: 'STORY',
      urlValid: true,
      relatedTickers: []
    };
    const result = NewsItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('should reject missing urlValid', () => {
    const item = {
      uuid: 'abc123',
      title: 'Apple Reports Strong Q4 Earnings',
      publisher: 'Reuters',
      link: 'https://example.com/article',
      providerPublishTime: 1705327800,
      type: 'STORY',
      publishDate: '2024-01-15',
      relatedTickers: []
    };
    const result = NewsItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('should reject missing relatedTickers', () => {
    const item = {
      uuid: 'abc123',
      title: 'Apple Reports Strong Q4 Earnings',
      publisher: 'Reuters',
      link: 'https://example.com/article',
      providerPublishTime: 1705327800,
      type: 'STORY',
      publishDate: '2024-01-15',
      urlValid: true
    };
    const result = NewsItemSchema.safeParse(item);
    expect(result.success).toBe(false);
  });

  test('should accept boolean urlValid', () => {
    const item = {
      uuid: 'abc123',
      title: 'Apple Reports Strong Q4 Earnings',
      publisher: 'Reuters',
      link: 'https://example.com/article',
      providerPublishTime: 1705327800,
      type: 'STORY',
      publishDate: '2024-01-15',
      urlValid: false,
      relatedTickers: []
    };
    const result = NewsItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  test('should accept empty relatedTickers array', () => {
    const item = {
      uuid: 'abc123',
      title: 'Apple Reports Strong Q4 Earnings',
      publisher: 'Reuters',
      link: 'https://example.com/article',
      providerPublishTime: 1705327800,
      type: 'STORY',
      publishDate: '2024-01-15',
      urlValid: true,
      relatedTickers: []
    };
    const result = NewsItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });

  test('should accept non-empty relatedTickers array', () => {
    const item = {
      uuid: 'abc123',
      title: 'Apple Reports Strong Q4 Earnings',
      publisher: 'Reuters',
      link: 'https://example.com/article',
      providerPublishTime: 1705327800,
      type: 'STORY',
      publishDate: '2024-01-15',
      urlValid: true,
      relatedTickers: ['AAPL', 'MSFT', 'GOOGL']
    };
    const result = NewsItemSchema.safeParse(item);
    expect(result.success).toBe(true);
  });
});

describe('NewsMetaSchema', () => {
  test('should validate meta with all fields', () => {
    const meta = {
      fromCache: true,
      dataAge: 300000,
      completenessScore: 0.95,
      warnings: [],
      dataSource: 'yahoo-finance',
      lastUpdated: '2024-01-15T10:30:00Z',
      oldestArticleAge: 86400000,
      newestArticleAge: 3600000
    };
    const result = NewsMetaSchema.safeParse(meta);
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
      oldestArticleAge: null,
      newestArticleAge: null
    };
    const result = NewsMetaSchema.safeParse(meta);
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
      oldestArticleAge: null,
      newestArticleAge: null
    };
    const result = NewsMetaSchema.safeParse(meta);
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
      oldestArticleAge: null,
      newestArticleAge: null
    };
    const result = NewsMetaSchema.safeParse(meta);
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
      oldestArticleAge: null,
      newestArticleAge: null
    };
    const result = NewsMetaSchema.safeParse(meta);
    expect(result.success).toBe(false);
  });

  test('should accept null oldestArticleAge', () => {
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: 1,
      warnings: [],
      dataSource: 'yahoo-finance',
      lastUpdated: '2024-01-15T10:30:00Z',
      oldestArticleAge: null,
      newestArticleAge: 3600000
    };
    const result = NewsMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });

  test('should accept null newestArticleAge', () => {
    const meta = {
      fromCache: false,
      dataAge: 0,
      completenessScore: 1,
      warnings: [],
      dataSource: 'yahoo-finance',
      lastUpdated: '2024-01-15T10:30:00Z',
      oldestArticleAge: 86400000,
      newestArticleAge: null
    };
    const result = NewsMetaSchema.safeParse(meta);
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
      oldestArticleAge: null,
      newestArticleAge: null
    };
    const result = NewsMetaSchema.safeParse(meta);
    expect(result.success).toBe(true);
  });
});

describe('NewsOutputSchema', () => {
  test('should validate complete news output', () => {
    const output = {
      symbol: 'AAPL',
      news: [
        {
          uuid: 'abc123',
          title: 'Apple Reports Strong Q4 Earnings',
          publisher: 'Reuters',
          link: 'https://example.com/article',
          providerPublishTime: 1705327800,
          type: 'STORY',
          publishDate: '2024-01-15',
          urlValid: true,
          relatedTickers: []
        }
      ],
      count: 1,
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z',
        oldestArticleAge: null,
        newestArticleAge: null
      }
    };
    const result = NewsOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('should validate output with empty news', () => {
    const output = {
      symbol: 'AAPL',
      news: [],
      count: 0,
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z',
        oldestArticleAge: null,
        newestArticleAge: null
      }
    };
    const result = NewsOutputSchema.safeParse(output);
    expect(result.success).toBe(true);
  });

  test('should reject missing symbol', () => {
    const output = {
      news: [],
      count: 0,
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z',
        oldestArticleAge: null,
        newestArticleAge: null
      }
    };
    const result = NewsOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing news', () => {
    const output = {
      symbol: 'AAPL',
      count: 0,
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z',
        oldestArticleAge: null,
        newestArticleAge: null
      }
    };
    const result = NewsOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing count', () => {
    const output = {
      symbol: 'AAPL',
      news: [],
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z',
        oldestArticleAge: null,
        newestArticleAge: null
      }
    };
    const result = NewsOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject missing meta', () => {
    const output = {
      symbol: 'AAPL',
      news: [],
      count: 0
    };
    const result = NewsOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });

  test('should reject negative count', () => {
    const output = {
      symbol: 'AAPL',
      news: [],
      count: -1,
      meta: {
        fromCache: false,
        dataAge: 0,
        completenessScore: 1,
        warnings: [],
        dataSource: 'yahoo-finance',
        lastUpdated: '2024-01-15T10:30:00Z',
        oldestArticleAge: null,
        newestArticleAge: null
      }
    };
    const result = NewsOutputSchema.safeParse(output);
    expect(result.success).toBe(false);
  });
});
