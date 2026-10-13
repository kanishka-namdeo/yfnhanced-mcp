import { getCompanyNewsTool, getNewsToolDefinitions, clearNewsCache } from '../../../src/tools/news';
import { yahooFinance } from '../../../src/services/yahoo-finance';
import { NewsOutputSchema } from '../../../src/schemas/index';
import { YahooFinanceError, YF_ERR_DATA_UNAVAILABLE } from '../../../src/types/errors';
import { SecurityError } from '../../../src/utils/security';

// src/tools/news.ts exports FUNCTIONS, not a class: the callable surface behind `get_news`
// is `getCompanyNewsTool(args)`, plus `getNewsToolDefinitions()` (imported by the server entrypoint
// but never called) and `clearNewsCache()` (called at shutdown). There is no `NewsTools`.
// The network seam is the process-wide `yahooFinance` singleton: the handler reaches it
// through `yahooFinance.search(symbol, { newsCount, quotesCount })` — never through a
// YahooFinanceClient, so the stub replaces that one method.
// Handler order per src/tools/AGENTS.md: NewsInputSchema.parse -> InputValidator.validateSymbol
// -> optional validateDate -> search -> normalize + build meta -> NewsOutputSchema.parse.
// It returns a PLAIN OBJECT; the server entrypoint is what wraps it in MCP `content`.
// Raw `news[].providerPublishTime` is a Date (src/types/yahoo-finance.ts:9), so the item
// carried in the payload is already MILLISECONDS; the two `* 1000` sites downstream are
// unit defects and are pinned as such below.

type RawNews = {
  uuid?: string;
  title?: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: Date;
  type?: string;
  relatedTickers?: string[];
};

type NewsItemOut = {
  uuid: string;
  title: string;
  publisher: string;
  link: string;
  providerPublishTime: number;
  type: string;
  publishDate: string;
  urlValid: boolean;
  relatedTickers: string[];
};

type NewsMetaOut = {
  fromCache: boolean;
  dataAge: number;
  completenessScore: number;
  warnings: string[];
  dataSource: string;
  lastUpdated: string;
  oldestArticleAge: number | null;
  newestArticleAge: number | null;
};

type NewsPayload = {
  symbol: string;
  news: NewsItemOut[];
  count: number;
  meta: NewsMetaOut;
};

const EPOCH_MS = Date.parse('2024-01-16T09:30:00.000Z');

function rawNews(overrides: Partial<RawNews> = {}): RawNews {
  return {
    uuid: 'abc123',
    title: 'Apple Reports Strong Q4 Earnings',
    publisher: 'Reuters',
    link: 'https://example.com/article',
    providerPublishTime: new Date(EPOCH_MS),
    type: 'STORY',
    relatedTickers: ['AAPL'],
    ...overrides
  };
}

function searchPayload(news: RawNews[]): { count: number; news: RawNews[] } {
  return { count: news.length, news };
}

async function callNewsTool(args: Record<string, unknown>): Promise<NewsPayload> {
  return (await getCompanyNewsTool(args)) as unknown as NewsPayload;
}

describe('news tool module', () => {
  let search: jest.Mock;

  beforeEach(() => {
    clearNewsCache();
    search = jest.fn();
    (yahooFinance as unknown as { search: jest.Mock }).search = search;
  });

  afterEach(() => {
    clearNewsCache();
  });

  describe('getCompanyNewsTool', () => {
    test('returns a plain symbol/news/count/meta payload, never an MCP content array', async () => {
      search.mockResolvedValue(searchPayload([rawNews()]));

      const result = await callNewsTool({ symbol: 'AAPL' });

      expect(result).not.toHaveProperty('content');
      expect(result).not.toHaveProperty('isError');
      expect(result.symbol).toBe('AAPL');
      expect(result.count).toBe(1);
      expect(result.news[0]).toEqual({
        uuid: 'abc123',
        title: 'Apple Reports Strong Q4 Earnings',
        publisher: 'Reuters',
        link: 'https://example.com/article',
        providerPublishTime: EPOCH_MS,
        type: 'STORY',
        publishDate: expect.any(String),
        urlValid: true,
        relatedTickers: ['AAPL']
      });
      expect(NewsOutputSchema.parse(result)).toEqual(result);
    });

    test('carries the meta contract on a fresh fetch', async () => {
      search.mockResolvedValue(searchPayload([rawNews()]));

      const result = await callNewsTool({ symbol: 'AAPL' });
      const meta = result.meta;

      expect(meta.fromCache).toBe(false);
      expect(meta.dataAge).toBe(0);
      expect(meta.dataSource).toBe('Yahoo Finance');
      expect(meta.completenessScore).toBe(0.1);
      expect(meta.completenessScore).toBeGreaterThanOrEqual(0);
      expect(meta.completenessScore).toBeLessThanOrEqual(1);
      expect(meta.warnings).toEqual(['Fewer articles available than requested (1 of 10)']);
      expect(Date.parse(meta.lastUpdated)).toBeGreaterThan(Date.now() - 5000);
      expect(meta.oldestArticleAge).not.toBeNull();
      expect(meta.newestArticleAge).not.toBeNull();
    });

    test('defect guard: publishDate and article ages re-scale an already-millisecond timestamp', async () => {
      search.mockResolvedValue(searchPayload([rawNews(), rawNews({ uuid: 'def456', title: 'Second' })]));

      const result = await callNewsTool({ symbol: 'AAPL', limit: 2 });

      // providerPublishTime is ms (Date.getTime()); publishDate multiplies by 1000 again,
      // so every article is dated ~55,000 years ahead, and the metadata ages go negative,
      // which is why the 'older than 5/10 minutes' and 'older than 24 hours' warnings can
      // never fire for real data.
      for (const item of result.news) {
        expect(new Date(item.publishDate).getTime()).toBe(item.providerPublishTime * 1000);
      }
      expect(result.meta.newestArticleAge).toBeLessThan(0);
      expect(result.meta.oldestArticleAge).toBeLessThan(0);
      expect(result.meta.warnings).toEqual([]);
      expect(result.meta.completenessScore).toBe(1);
    });

    test('requests twice the limit (minimum 20) and slices the list to the limit', async () => {
      const twenty = Array.from({ length: 20 }, (_, i) =>
        rawNews({ uuid: `u${i}`, title: `Article ${i}`, providerPublishTime: new Date(EPOCH_MS + i * 1000) })
      );
      search.mockResolvedValue(searchPayload(twenty));

      const result = await callNewsTool({ symbol: 'AAPL', limit: 5 });

      expect(search).toHaveBeenCalledWith('AAPL', { newsCount: 20, quotesCount: 1 });
      expect(result.news).toHaveLength(5);
      expect(result.count).toBe(5);
      expect(result.news.map((item) => item.uuid)).toEqual(['u0', 'u1', 'u2', 'u3', 'u4']);
      expect(result.meta.completenessScore).toBe(1);
      expect(result.meta.warnings).toEqual([]);

      search.mockClear();
      await callNewsTool({ symbol: 'MSFT', limit: 30 });

      expect(search).toHaveBeenCalledWith('MSFT', { newsCount: 60, quotesCount: 1 });
    });

    test('defaults the limit to 10 and asks for 20 articles', async () => {
      search.mockResolvedValue(searchPayload([]));

      await callNewsTool({ symbol: 'AAPL' });

      expect(search).toHaveBeenCalledWith('AAPL', { newsCount: 20, quotesCount: 1 });
    });

    test('defect guard: startDate never filters recent articles because publish time is scaled by 1000', async () => {
      search.mockResolvedValue(
        searchPayload([
          rawNews({ uuid: 'dated' }),
          rawNews({ uuid: 'undated', providerPublishTime: undefined })
        ])
      );

      // 2030 is in the future relative to the 2024 articles, so a correct comparison would
      // drop both. The handler compares `providerPublishTime * 1000 >= start`, so the dated
      // article survives; only the zero-timestamp article is dropped.
      const result = await callNewsTool({ symbol: 'AAPL', startDate: '2030-01-01' });

      expect(result.news.map((item) => item.uuid)).toEqual(['dated']);
      expect(result.count).toBe(1);
      expect(result.meta.completenessScore).toBe(0.1);
      expect(result.meta.warnings).toContain('Fewer articles available than requested (1 of 10)');
    });

    test('keeps only articles with related tickers when requireRelatedTickers is set', async () => {
      search.mockResolvedValue(
        searchPayload([
          rawNews({ uuid: 'with', relatedTickers: ['AAPL'] }),
          rawNews({ uuid: 'without', relatedTickers: [] })
        ])
      );

      const result = await callNewsTool({ symbol: 'AAPL', limit: 5, requireRelatedTickers: true });

      expect(result.news.map((item) => item.uuid)).toEqual(['with']);
      expect(result.count).toBe(1);
      expect(result.meta.warnings).toEqual([
        'Fewer articles with related tickers available than requested (1 of 5)'
      ]);
    });

    test('degrades empty news with a warning and zero completeness instead of throwing', async () => {
      search.mockResolvedValue(searchPayload([]));

      const result = await callNewsTool({ symbol: 'AAPL' });

      expect(result.news).toEqual([]);
      expect(result.count).toBe(0);
      expect(result.meta.warnings).toContain('No news articles available for this symbol');
      expect(result.meta.completenessScore).toBe(0);
      expect(result.meta.oldestArticleAge).toBeNull();
      expect(result.meta.newestArticleAge).toBeNull();
    });

    test('reports a payload shaped by the retired search contract as empty news, not as an error', async () => {
      // tests/fixtures/mock-responses.ts still publishes the legacy `{ itemsResult: { items } }`
      // shape; the handler reads `result.news`, so that payload degrades to zero articles.
      search.mockResolvedValue({
        count: 10,
        itemsResult: {
          items: [{ id: 'uuid-1', title: 'Apple Stock Hits New High', link: 'https://example.com/article1' }]
        }
      });

      const result = await callNewsTool({ symbol: 'AAPL' });

      expect(result.news).toEqual([]);
      expect(result.meta.warnings).toContain('No news articles available for this symbol');
    });

    test('warns about invalid links and missing publish timestamps', async () => {
      search.mockResolvedValue(
        searchPayload([
          rawNews({ uuid: 'bad-link', link: 'not-a-url', providerPublishTime: undefined }),
          rawNews({ uuid: 'empty-link', link: '', providerPublishTime: undefined })
        ])
      );

      const result = await callNewsTool({ symbol: 'AAPL', limit: 2 });

      expect(result.news.map((item) => item.urlValid)).toEqual([false, false]);
      expect(result.news.map((item) => item.publishDate)).toEqual(['', '']);
      expect(result.meta.warnings).toContain('2 article(s) have invalid URLs');
      expect(result.meta.warnings).toContain('All articles have missing publish timestamps');
      expect(result.meta.completenessScore).toBe(1);
    });

    test('falls back to empty strings and the article type default for absent fields', async () => {
      search.mockResolvedValue(searchPayload([{ title: 'Only a title' }]));

      const result = await callNewsTool({ symbol: 'AAPL', limit: 1 });

      // fetchNews collapses an absent type to '' before convertNewsItem sees it, so the
      // `'article'` default in convertNewsItem is unreachable for wire payloads.
      expect(result.news[0]).toEqual({
        uuid: '',
        title: 'Only a title',
        publisher: '',
        link: '',
        providerPublishTime: 0,
        type: '',
        publishDate: '',
        urlValid: false,
        relatedTickers: []
      });
    });

    test('serves the second identical request from the module news cache', async () => {
      search.mockResolvedValue(searchPayload([rawNews()]));

      const first = await callNewsTool({ symbol: 'AAPL', limit: 1 });
      const second = await callNewsTool({ symbol: 'AAPL', limit: 1 });

      expect(search).toHaveBeenCalledTimes(1);
      expect(first.meta.fromCache).toBe(false);
      expect(second.meta.fromCache).toBe(true);
      expect(second.news).toEqual(first.news);
      // Defect guard: the cached branch reports dataAge as `now - cacheKey.length`, not the
      // cache entry age, so a cache hit looks maximally stale and drags lastUpdated back to
      // the Unix epoch.
      expect(second.meta.dataAge).toBeGreaterThan(1e12);
      expect(second.meta.warnings).toContain('News data is stale (older than 3.75 minutes)');
      expect(second.meta.lastUpdated.startsWith('1970-01-01')).toBe(true);
    });

    test('keys the cache by symbol, limit and requireRelatedTickers', async () => {
      search.mockResolvedValue(searchPayload([rawNews()]));

      await callNewsTool({ symbol: 'AAPL', limit: 1 });
      await callNewsTool({ symbol: 'AAPL', limit: 2 });
      await callNewsTool({ symbol: 'AAPL', limit: 1, requireRelatedTickers: true });
      await callNewsTool({ symbol: 'MSFT', limit: 1 });

      expect(search).toHaveBeenCalledTimes(4);
    });

    test('clearNewsCache forces the next request back to the network', async () => {
      search.mockResolvedValue(searchPayload([rawNews()]));

      await callNewsTool({ symbol: 'AAPL', limit: 1 });
      clearNewsCache();
      const refetched = await callNewsTool({ symbol: 'AAPL', limit: 1 });

      expect(search).toHaveBeenCalledTimes(2);
      expect(refetched.meta.fromCache).toBe(false);
    });

    test('wraps a search failure in a YahooFinanceError with a code and suggested action', async () => {
      search.mockRejectedValue(new Error('Network error'));

      await expect(callNewsTool({ symbol: 'AAPL' })).rejects.toBeInstanceOf(YahooFinanceError);

      const error = (await callNewsTool({ symbol: 'ORCL' }).catch((e: unknown) => e)) as YahooFinanceError;

      expect(error).toBeInstanceOf(YahooFinanceError);
      expect(error.code).toBe(YF_ERR_DATA_UNAVAILABLE);
      expect(error.message).toBe('Failed to fetch news for ORCL: Network error');
      expect(error.isRetryable).toBe(true);
      expect(error.suggestedAction).toBe('Retry request or check symbol validity');
    });

    test('runs the input schema before the symbol grammar and the date grammar', async () => {
      await expect(callNewsTool({ symbol: 'aapl' })).rejects.toThrow(SecurityError);
      await expect(callNewsTool({ symbol: 'aapl' })).rejects.toThrow('Symbol contains invalid characters');
      await expect(callNewsTool({ symbol: '' })).rejects.toThrow();
      await expect(callNewsTool({ symbol: 'X'.repeat(21) })).rejects.toThrow();
      await expect(callNewsTool({ symbol: 'AAPL', limit: 0 })).rejects.toThrow();
      await expect(callNewsTool({ symbol: 'AAPL', limit: 51 })).rejects.toThrow();
      await expect(callNewsTool({ symbol: 'AAPL', startDate: '16-01-2024' })).rejects.toThrow(
        'startDate must be in YYYY-MM-DD format'
      );

      expect(search).not.toHaveBeenCalled();
    });
  });

  // These cases walk the normalization and metadata branches the fixture-shaped tests above
  // never reach: a wire item whose fields are present but the wrong type, thumbnails, cache
  // eviction, the cached requireRelatedTickers filter, and the four article/data-age warning
  // bands. The article bands need a controlled clock because publish time is scaled by 1000
  // (pinned above), so an article only reads as "old" when its millisecond value is tiny.
  describe('news normalization fallbacks', () => {
    test('collapses present-but-wrongly-typed wire fields onto the documented defaults', async () => {
      search.mockResolvedValue({
        count: 2,
        news: [
          {
            uuid: 123,
            title: 456,
            publisher: 789,
            link: { href: 'https://example.com/deep' },
            providerPublishTime: new Date(EPOCH_MS),
            type: 0,
            relatedTickers: 'AAPL'
          },
          {}
        ]
      });

      const result = await callNewsTool({ symbol: 'AAPL', limit: 2 });

      // fetchNews pre-collapses null/undefined with `?? ''`, so a field only reaches the
      // convertNewsItem type guards when the wire sent a non-string, non-null value.
      expect(result.news[0]).toEqual({
        uuid: '',
        title: '',
        publisher: '',
        link: '',
        providerPublishTime: EPOCH_MS,
        type: 'article',
        publishDate: expect.any(String),
        urlValid: false,
        relatedTickers: []
      });
      expect(result.news[1]).toEqual({
        uuid: '',
        title: '',
        publisher: '',
        link: '',
        providerPublishTime: 0,
        type: '',
        publishDate: '',
        urlValid: false,
        relatedTickers: []
      });
      expect(result.count).toBe(2);
      expect(result.meta.warnings).toContain('2 article(s) have invalid URLs');
      expect(result.meta.warnings).not.toContain('All articles have missing publish timestamps');
    });

    test('maps thumbnail resolutions through to the payload and drops them again', async () => {
      search.mockResolvedValue({
        count: 2,
        news: [
          {
            uuid: 'thumb',
            title: 'Article with images',
            link: 'https://example.com/with-images',
            providerPublishTime: new Date(EPOCH_MS),
            thumbnail: {
              resolutions: [
                { url: 'https://img/100', width: 100, height: 50, tag: '100x50' },
                {}
              ]
            }
          },
          { uuid: 'bare', title: 'Thumbnail without resolutions', thumbnail: {} }
        ]
      });

      const result = await callNewsTool({ symbol: 'AAPL', limit: 2 });

      expect(result.news).toHaveLength(2);
      expect(result.news[0].title).toBe('Article with images');
      // The convertNewsItem stage keeps nine fields, so the normalized thumbnail is dropped
      // from the client payload even though fetchNews built it.
      expect(result.news[0]).not.toHaveProperty('thumbnail');
    });

    test('names a non-Error search rejection with String(error)', async () => {
      search.mockRejectedValue('search endpoint down');

      const error = (await callNewsTool({ symbol: 'AAPL' }).catch((e: unknown) => e)) as YahooFinanceError;

      expect(error).toBeInstanceOf(YahooFinanceError);
      expect(error.code).toBe(YF_ERR_DATA_UNAVAILABLE);
      expect(error.message).toBe('Failed to fetch news for AAPL: search endpoint down');
      expect(error.isRetryable).toBe(true);
    });

    test('applies the related-ticker filter again on a cached read', async () => {
      search.mockResolvedValue(
        searchPayload([
          rawNews({ uuid: 'with', relatedTickers: ['AAPL'] }),
          rawNews({ uuid: 'without', relatedTickers: [] })
        ])
      );

      const first = await callNewsTool({ symbol: 'AAPL', limit: 5, requireRelatedTickers: true });
      const second = await callNewsTool({ symbol: 'AAPL', limit: 5, requireRelatedTickers: true });

      expect(search).toHaveBeenCalledTimes(1);
      expect(first.meta.fromCache).toBe(false);
      expect(second.meta.fromCache).toBe(true);
      expect(second.news.map((item) => item.uuid)).toEqual(['with']);
      expect(second.count).toBe(1);
    });

    test('drops the cached entry once it is older than the five-minute TTL', async () => {
      search.mockResolvedValue(searchPayload([rawNews()]));

      await callNewsTool({ symbol: 'AAPL', limit: 1 });

      const spy = jest.spyOn(Date, 'now').mockReturnValue(Date.now() + 300000 + 60000);
      try {
        const refetched = await callNewsTool({ symbol: 'AAPL', limit: 1 });
        expect(refetched.meta.fromCache).toBe(false);
      } finally {
        spy.mockRestore();
      }

      expect(search).toHaveBeenCalledTimes(2);
    });

    test('warns when the newest article is past ten minutes and the oldest past a day', async () => {
      // providerPublishTime is milliseconds on the wire and is scaled by 1000 again
      // downstream, so a genuinely old article only lands on these branches when its stored
      // value is the epoch-seconds magnitude the code assumes.
      const NOW = Date.parse('2026-01-15T00:00:00.000Z');
      const spy = jest.spyOn(Date, 'now').mockReturnValue(NOW);

      try {
        search.mockResolvedValue(
          searchPayload([
            rawNews({ uuid: 'old', providerPublishTime: new Date(Math.floor((NOW - 90000000) / 1000)) }),
            rawNews({ uuid: 'recent', providerPublishTime: new Date(Math.floor((NOW - 700000) / 1000)) })
          ])
        );

        const result = await callNewsTool({ symbol: 'AAPL', limit: 2 });

        expect(result.meta.newestArticleAge).toBeGreaterThanOrEqual(700000);
        expect(result.meta.newestArticleAge).toBeLessThan(701000);
        expect(result.meta.oldestArticleAge).toBeGreaterThan(86400000);
        expect(result.meta.warnings).toEqual([
          'Most recent article is older than 10 minutes',
          'Oldest article is older than 24 hours'
        ]);
      } finally {
        spy.mockRestore();
      }
    });

    test('warns in the five-minute band when only the newest article is between five and ten minutes', async () => {
      const NOW = Date.parse('2026-01-15T00:00:00.000Z');
      const spy = jest.spyOn(Date, 'now').mockReturnValue(NOW);

      try {
        search.mockResolvedValue(
          searchPayload([rawNews({ uuid: 'fresh', providerPublishTime: new Date(Math.floor((NOW - 450000) / 1000)) })])
        );

        const result = await callNewsTool({ symbol: 'AAPL', limit: 1 });

        expect(result.meta.newestArticleAge).toBeGreaterThanOrEqual(450000);
        expect(result.meta.newestArticleAge).toBeLessThan(451000);
        expect(result.meta.oldestArticleAge).toBeLessThan(86400000);
        expect(result.meta.warnings).toEqual(['Most recent article is older than 5 minutes']);
      } finally {
        spy.mockRestore();
      }
    });

    test('warns in the 2.5-minute band for a cache hit whose dataAge lands there', async () => {
      // The handler derives dataAge as `startTime - cacheKey.length`, so the exchange runs on
      // a clock parked at 200 s to land that value between 2.5 and 3.75 minutes.
      const NOW = 200000;
      const spy = jest.spyOn(Date, 'now').mockReturnValue(NOW);

      try {
        search.mockResolvedValue(searchPayload([rawNews({ providerPublishTime: undefined })]));

        const first = await callNewsTool({ symbol: 'AAPL' });
        const second = await callNewsTool({ symbol: 'AAPL' });

        expect(first.meta.dataAge).toBe(0);
        expect(second.meta.fromCache).toBe(true);
        expect(second.meta.dataAge).toBe(NOW - 'news:AAPL:10:false'.length);
        expect(second.meta.warnings).toContain('News data may be slightly stale (older than 2.5 minutes)');
        expect(second.meta.warnings).not.toContain('News data is stale (older than 3.75 minutes)');
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe('getNewsToolDefinitions', () => {
    test('declares the single get_news tool and its required args', () => {
      const definitions = getNewsToolDefinitions();

      expect(definitions).toHaveLength(1);
      expect(definitions[0].name).toBe('get_news');
      expect(definitions[0].inputSchema).toMatchObject({
        type: 'object',
        required: ['symbol'],
        properties: {
          symbol: { type: 'string', minLength: 1, maxLength: 20 },
          limit: { type: 'number', minimum: 1, maximum: 50 },
          startDate: { type: 'string' },
          requireRelatedTickers: { type: 'boolean' }
        }
      });
    });

    test('gives every definition a description and an object input schema', () => {
      for (const definition of getNewsToolDefinitions()) {
        expect(definition).toHaveProperty('name');
        expect(typeof definition.description).toBe('string');
        expect(definition.description.length).toBeGreaterThan(0);
        expect(definition).toHaveProperty('inputSchema');
      }
    });
  });
});
