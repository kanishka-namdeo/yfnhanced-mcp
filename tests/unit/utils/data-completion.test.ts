import * as dataCompletionModule from '../../../src/utils/data-completion';
import { DataQualityReporter } from '../../../src/utils/data-completion';
import type { DataQualityReport } from '../../../src/utils/data-completion';

// `src/utils/data-completion.ts` exports exactly one value: the `DataQualityReporter` class.
// `DataQualityReport` is a type-only export, and there is no module-level `calculateCompleteness`
// or `calculateFieldQuality` function — completeness is an instance method that scores the keys
// already present on the object it is handed, in integer percent, weighted CRITICAL 2 /
// IMPORTANT 1.5 / STANDARD 1. Reliability labels come out of the report: high at >= 90 with no
// missing fields and no staleness, medium at >= 70 with at most two missing.
// Two documented quirks are pinned rather than fixed: `extractTimestamp` returns 0 when no
// timestamp exists (so staleness silently reads false), and a seconds-resolution timestamp is read
// as milliseconds.

const CRITICAL_FIELD_LIST = ['symbol', 'regularMarketPrice'];
const IMPORTANT_FIELD_LIST = ['regularMarketChange', 'regularMarketChangePercent', 'marketCap', 'volume'];

const missingImportantText = `Missing important fields: ${IMPORTANT_FIELD_LIST.join(', ')}`;

const asData = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;

describe('data-completion module surface', () => {
  test('exports only the DataQualityReporter class as a runtime value', () => {
    expect(Object.keys(dataCompletionModule)).toEqual(['DataQualityReporter']);
    expect(typeof DataQualityReporter).toBe('function');
  });

  test('calculateCompleteness is not a module-level export', () => {
    expect((dataCompletionModule as Record<string, unknown>)['calculateCompleteness']).toBeUndefined();
  });

  test('calculateFieldQuality does not exist anywhere in the module', () => {
    expect((dataCompletionModule as Record<string, unknown>)['calculateFieldQuality']).toBeUndefined();
    expect(typeof (DataQualityReporter.prototype as Record<string, unknown>)['calculateFieldQuality']).toBe('undefined');
  });

  test('DataQualityReport is a type, not a runtime value', () => {
    expect((dataCompletionModule as Record<string, unknown>)['DataQualityReport']).toBeUndefined();
  });

  test('the public method surface is the documented one', () => {
    const proto = DataQualityReporter.prototype as Record<string, unknown>;
    [
      'calculateCompleteness',
      'detectMissingFields',
      'getDataAge',
      'generateWarnings',
      'generateQualityReport',
      'compareWithCached',
      'setTTL',
      'getTTL',
      'getFieldHistory',
      'clearFieldHistory'
    ].forEach((name) => {
      expect(typeof proto[name]).toBe('function');
    });
  });

  test('the private helpers exist at runtime: TypeScript privacy is compile-time only', () => {
    const proto = DataQualityReporter.prototype as Record<string, unknown>;
    expect(typeof proto['determineSourceReliability']).toBe('function');
    expect(typeof proto['buildFieldWeights']).toBe('function');
    expect(typeof proto['extractTimestamp']).toBe('function');
    const reporter = new DataQualityReporter(1234) as unknown as Record<string, unknown>;
    expect(reporter['ttl']).toBe(1234);
  });
});

describe('TTL configuration', () => {
  test('defaults to 60000 ms', () => {
    expect(new DataQualityReporter().getTTL()).toBe(60000);
  });

  test('accepts a constructor TTL', () => {
    expect(new DataQualityReporter(500).getTTL()).toBe(500);
  });

  test('setTTL mutates the instance TTL', () => {
    const reporter = new DataQualityReporter();
    reporter.setTTL(999);
    expect(reporter.getTTL()).toBe(999);
  });

  test('a zero TTL is stored rather than falling back to the default', () => {
    expect(new DataQualityReporter(0).getTTL()).toBe(0);
  });
});

describe('calculateCompleteness', () => {
  const reporter = () => new DataQualityReporter();

  test('returns an integer percentage, not a 0-1 fraction', () => {
    expect(reporter().calculateCompleteness({ symbol: 'AAPL', regularMarketPrice: 150 })).toBe(100);
  });

  test('returns 0 for an object with no keys, since total weight is 0', () => {
    expect(reporter().calculateCompleteness({})).toBe(0);
  });

  test('weights a missing CRITICAL field at 2 of the total', () => {
    // symbol = CRITICAL (2), extra = STANDARD (1); only extra is present -> 1 / 3 -> 33.
    expect(reporter().calculateCompleteness({ symbol: null, extra: 1 })).toBe(33);
  });

  test('weights a missing IMPORTANT field at 1.5 of the total', () => {
    // volume = IMPORTANT (1.5), extra = STANDARD (1) -> 1 / 2.5 -> 40.
    expect(reporter().calculateCompleteness({ volume: null, extra: 1 })).toBe(40);
  });

  test('weights a missing STANDARD field at 1 of the total', () => {
    expect(reporter().calculateCompleteness({ extra: null, other: 1 })).toBe(50);
  });

  test('a CRITICAL field missing costs twice what a STANDARD field missing costs', () => {
    expect(reporter().calculateCompleteness({ symbol: null, extra: 1 })).toBe(33);
    expect(reporter().calculateCompleteness({ other: null, extra: 1 })).toBe(50);
  });

  test('mixes the three weights and rounds to the nearest percent', () => {
    expect(reporter().calculateCompleteness({ symbol: 'A', regularMarketPrice: 1, volume: null })).toBe(73);
    expect(reporter().calculateCompleteness({ symbol: null, volume: 100 })).toBe(43);
  });

  test('scores only the keys present on the object — no expected-field list is consulted', () => {
    expect(reporter().calculateCompleteness({ price: 150 })).toBe(100);
  });

  test('a field that is absent from the object is not counted against the score', () => {
    expect(reporter().calculateCompleteness({ symbol: 'AAPL' })).toBe(100);
  });

  test('null and undefined are the only values treated as absent', () => {
    expect(reporter().calculateCompleteness({ a: null, b: undefined })).toBe(0);
  });

  test('0, false, empty string, empty array and empty object all count as present', () => {
    expect(reporter().calculateCompleteness({ price: 0, isLive: false, name: '', holders: [], details: {} })).toBe(100);
  });

  test('NaN and Infinity count as present values', () => {
    expect(reporter().calculateCompleteness({ x: NaN, y: Infinity })).toBe(100);
  });

  test('throws for null and undefined input rather than reporting 0', () => {
    expect(() => reporter().calculateCompleteness(asData(null))).toThrow(TypeError);
    expect(() => reporter().calculateCompleteness(asData(undefined))).toThrow(TypeError);
  });

  test('coerces arrays and strings to their key lists', () => {
    expect(reporter().calculateCompleteness(asData([{ price: 1 }, { price: 2 }]))).toBe(100);
    expect(reporter().calculateCompleteness(asData('abc'))).toBe(100);
  });

  test('is stateless across calls on the same instance', () => {
    const instance = new DataQualityReporter();
    const data = { symbol: 'AAPL', volume: null };
    expect(instance.calculateCompleteness(data)).toBe(instance.calculateCompleteness(data));
  });
});

describe('detectMissingFields', () => {
  const reporter = () => new DataQualityReporter();

  test('lists fields whose value is null or undefined', () => {
    expect(reporter().detectMissingFields({ symbol: 'AAPL', price: null }, ['symbol', 'price', 'volume']))
      .toEqual(['price', 'volume']);
  });

  test('treats falsy-but-present values as satisfied', () => {
    expect(reporter().detectMissingFields({ price: 0, name: '', holders: [] }, ['price', 'name', 'holders']))
      .toEqual([]);
  });

  test('resolves only top-level keys, so dotted paths always report missing', () => {
    expect(reporter().detectMissingFields({ price: { regularMarketPrice: 150 } }, ['price.regularMarketPrice']))
      .toEqual(['price.regularMarketPrice']);
  });

  test('returns an empty list for an empty expectation', () => {
    expect(reporter().detectMissingFields({ a: 1 }, [])).toEqual([]);
  });

  test('preserves the expected-field order', () => {
    expect(reporter().detectMissingFields({ b: null, a: null }, ['b', 'a'])).toEqual(['b', 'a']);
  });

  test('records presence history for every expected field', () => {
    const instance = reporter();
    instance.detectMissingFields({ a: 1 }, ['a', 'b']);
    expect(instance.getFieldHistory()).toEqual({ a: [true], b: [false] });
  });

  test('caps history at the most recent 100 observations', () => {
    const instance = reporter();
    for (let i = 0; i < 105; i++) {
      instance.detectMissingFields({ a: 1 }, ['a']);
    }
    expect(instance.getFieldHistory()['a']).toHaveLength(100);
  });

  test('getFieldHistory is a shallow copy, so pushing into it mutates internal state', () => {
    const instance = reporter();
    instance.detectMissingFields({ a: 1 }, ['a']);
    instance.getFieldHistory()['a'].push(false);
    expect(instance.getFieldHistory()['a']).toEqual([true, false]);
  });

  test('clearFieldHistory empties the history', () => {
    const instance = reporter();
    instance.detectMissingFields({ a: 1 }, ['a']);
    instance.clearFieldHistory();
    expect(instance.getFieldHistory()).toEqual({});
  });

  test('throws for null data because the value read has no guard', () => {
    expect(() => reporter().detectMissingFields(asData(null), ['a'])).toThrow(TypeError);
  });
});

describe('getDataAge', () => {
  const reporter = () => new DataQualityReporter();

  test('returns elapsed milliseconds for a past timestamp', () => {
    const age = reporter().getDataAge(Date.now() - 5000);
    expect(age).toBeGreaterThanOrEqual(5000);
    expect(age).toBeLessThan(60000);
  });

  test('clamps a future timestamp to 0 rather than reporting a negative age', () => {
    expect(reporter().getDataAge(Date.now() + 60000)).toBe(0);
  });

  test('accepts a Date instance', () => {
    expect(reporter().getDataAge(new Date(Date.now() - 1000))).toBeGreaterThanOrEqual(1000);
  });

  test('treats the epoch as maximally old, which is how seconds timestamps get misread', () => {
    expect(reporter().getDataAge(1705327800)).toBeGreaterThan(1e11);
  });

  test('returns the current age for timestamp 0', () => {
    expect(reporter().getDataAge(0)).toBeGreaterThan(Date.now() - 1000);
  });

  test('an invalid Date produces NaN rather than a guard', () => {
    expect(Number.isNaN(reporter().getDataAge(new Date('not a date')))).toBe(true);
  });
});

describe('generateWarnings', () => {
  const reporter = (ttl: number) => new DataQualityReporter(ttl);

  test('is silent about staleness when an explicit age is within half the TTL', () => {
    expect(reporter(1000).generateWarnings({ symbol: 'S', regularMarketPrice: 1 }, 500)).not.toContain(
      'Data is stale (exceeds 50% of TTL)'
    );
  });

  test('reports staleness just above half the TTL, at the boundary itself excluded', () => {
    expect(reporter(1000).generateWarnings({ symbol: 'S', regularMarketPrice: 1 }, 501)).toContain(
      'Data is stale (exceeds 50% of TTL)'
    );
    expect(reporter(1000).generateWarnings({ symbol: 'S', regularMarketPrice: 1 }, 1000)).toContain(
      'Data is stale (exceeds 50% of TTL)'
    );
  });

  test('reports expiry once the age exceeds the TTL', () => {
    expect(reporter(1000).generateWarnings({ symbol: 'S', regularMarketPrice: 1 }, 1001)).toContain(
      'Data has exceeded its TTL and may be expired'
    );
  });

  test('quirk: with no timestamp anywhere the inferred age is 0, so staleness silently reads false', () => {
    expect(reporter(1).generateWarnings({ symbol: 'S', regularMarketPrice: 1 })).not.toContain(
      'Data has exceeded its TTL and may be expired'
    );
    expect(reporter(1).generateWarnings({ symbol: 'S', regularMarketPrice: 1 })).not.toContain(
      'Data is stale (exceeds 50% of TTL)'
    );
  });

  test('reads regularMarketTime in milliseconds as an age', () => {
    expect(reporter(60000).generateWarnings({ regularMarketTime: Date.now() - 40000 })).toContain(
      'Data is stale (exceeds 50% of TTL)'
    );
  });

  test('quirk: a seconds-resolution timestamp is read as milliseconds and reported as expired', () => {
    expect(reporter(60000).generateWarnings({ regularMarketTime: 1705327800 })).toContain(
      'Data has exceeded its TTL and may be expired'
    );
  });

  test('supports nested meta.regularMarketTime and the other known timestamp keys', () => {
    expect(reporter(60000).generateWarnings({ meta: { regularMarketTime: Date.now() - 40000 } })).toContain(
      'Data is stale (exceeds 50% of TTL)'
    );
    expect(reporter(60000).generateWarnings({ timestamp: Date.now() - 40000 })).toContain(
      'Data is stale (exceeds 50% of TTL)'
    );
    expect(reporter(60000).generateWarnings({ lastUpdate: new Date(Date.now() - 40000) })).toContain(
      'Data is stale (exceeds 50% of TTL)'
    );
  });

  test('ignores a zero or non-numeric timestamp key and falls through', () => {
    expect(reporter(60000).generateWarnings({ regularMarketTime: 0, timestamp: 'yesterday' })).not.toContain(
      'Data is stale (exceeds 50% of TTL)'
    );
  });

  test('names the missing CRITICAL fields exactly', () => {
    expect(reporter(60000).generateWarnings({ volume: 1 })).toContain(
      `Missing critical fields: ${CRITICAL_FIELD_LIST.join(', ')}`
    );
  });

  test('names the missing IMPORTANT fields exactly', () => {
    expect(reporter(60000).generateWarnings({ symbol: 'AAPL', regularMarketPrice: 1 })).toContain(
      missingImportantText
    );
  });

  test('omits important-field warnings when they are present', () => {
    const complete = {
      symbol: 'AAPL',
      regularMarketPrice: 1,
      regularMarketChange: 0.5,
      regularMarketChangePercent: 0.4,
      marketCap: 1e9,
      volume: 100
    };
    expect(reporter(60000).generateWarnings(complete)).toEqual([]);
  });

  test('flags prices outside the plausible range as unexpected patterns', () => {
    expect(reporter(60000).generateWarnings({ symbol: 'A', regularMarketPrice: 2e10 })).toContain(
      'Unexpected data patterns detected'
    );
    expect(reporter(60000).generateWarnings({ symbol: 'A', regularMarketVolume: 2e15 })).toContain(
      'Unexpected data patterns detected'
    );
  });

  test('flags high below low and prices outside the day range as integrity issues', () => {
    expect(reporter(60000).generateWarnings({ symbol: 'S', regularMarketPrice: 5, regularMarketDayHigh: 1, regularMarketDayLow: 9 })).toContain(
      'Data integrity issues detected'
    );
    expect(reporter(60000).generateWarnings({ symbol: 'S', regularMarketPrice: 50, regularMarketDayHigh: 10, regularMarketDayLow: 1 })).toContain(
      'Data integrity issues detected'
    );
  });

  test('flags a zero price paired with a zero open, and a zero change pair', () => {
    expect(reporter(60000).generateWarnings({ symbol: 'S', regularMarketPrice: 0, regularMarketOpen: 0 })).toContain(
      'Data integrity issues detected'
    );
    expect(
      reporter(60000).generateWarnings({
        symbol: 'S',
        regularMarketPrice: 10,
        regularMarketDayHigh: 20,
        regularMarketDayLow: 1,
        regularMarketChange: 0,
        regularMarketChangePercent: 0
      })
    ).toContain('Data integrity issues detected');
  });

  test('flags negative prices in any of the six price fields', () => {
    expect(reporter(60000).generateWarnings({ symbol: 'S', preMarketPrice: -1 })).toContain(
      'Negative or invalid price values detected'
    );
    expect(reporter(60000).generateWarnings({ symbol: 'S', postMarketPrice: -0.5 })).toContain(
      'Negative or invalid price values detected'
    );
  });

  test('emits age, critical, important, pattern, integrity and negative warnings in that order', () => {
    const warnings = reporter(1000).generateWarnings(
      { symbol: 'S', regularMarketPrice: -5, regularMarketDayHigh: 1, regularMarketDayLow: 9 },
      2000
    );
    expect(warnings[0]).toBe('Data has exceeded its TTL and may be expired');
    expect(warnings[1]).toContain('Missing important fields');
    expect(warnings).toContain('Unexpected data patterns detected');
    expect(warnings).toContain('Data integrity issues detected');
    expect(warnings[warnings.length - 1]).toBe('Negative or invalid price values detected');
    expect(warnings).not.toContain('Missing critical fields: symbol, regularMarketPrice');
  });
});

describe('generateQualityReport', () => {
  const keys: Array<keyof DataQualityReport> = [
    'completenessScore',
    'staleData',
    'dataAge',
    'sourceReliability',
    'missingFields',
    'warnings',
    'recommendation'
  ];

  test('returns exactly the DataQualityReport keys', () => {
    const report = new DataQualityReporter(60000).generateQualityReport({ symbol: 'A' }, ['symbol'], Date.now());
    expect(Object.keys(report).sort()).toEqual([...keys].map(String).sort());
  });

  test('reports high reliability at a perfect score with no missing fields and no staleness', () => {
    const report = new DataQualityReporter(60000).generateQualityReport(
      { symbol: 'AAPL', regularMarketPrice: 150 },
      ['symbol', 'regularMarketPrice'],
      Date.now()
    );
    expect(report.completenessScore).toBe(100);
    expect(report.missingFields).toEqual([]);
    expect(report.staleData).toBe(false);
    expect(report.sourceReliability).toBe('high');
    expect(report.recommendation).toBe('Data is complete and fresh. Safe to use.');
  });

  test('high requires at least 90: nine present of ten weighted-equal keys lands exactly on 90', () => {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < 9; i++) {
      data[`f${i}`] = i;
    }
    data.f9 = null;
    const report = new DataQualityReporter(60000).generateQualityReport(data, []);
    expect(report.completenessScore).toBe(90);
    expect(report.sourceReliability).toBe('high');
  });

  test('medium covers 70 to 89 with at most two missing fields', () => {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < 8; i++) {
      data[`f${i}`] = i;
    }
    data.f8 = null;
    data.f9 = null;
    const report = new DataQualityReporter(60000).generateQualityReport(data, []);
    expect(report.completenessScore).toBe(80);
    expect(report.sourceReliability).toBe('medium');
  });

  test('a perfect score with two expected fields missing is still medium, not high', () => {
    const report = new DataQualityReporter(60000).generateQualityReport(
      { symbol: 'A', regularMarketPrice: 1, volume: 5 },
      ['symbol', 'regularMarketPrice', 'volume', 'marketCap', 'zzz']
    );
    expect(report.completenessScore).toBe(100);
    expect(report.missingFields).toEqual(['marketCap', 'zzz']);
    expect(report.sourceReliability).toBe('medium');
    expect(report.recommendation).toBe('Data is mostly complete. May be acceptable for non-critical use cases.');
  });

  test('below 70 is low', () => {
    const data: Record<string, unknown> = { symbol: 'A', regularMarketPrice: 1 };
    for (let i = 0; i < 6; i++) {
      data[`x${i}`] = null;
    }
    const report = new DataQualityReporter(60000).generateQualityReport(data, []);
    expect(report.completenessScore).toBe(40);
    expect(report.sourceReliability).toBe('low');
    expect(report.recommendation).toBe('Data quality is poor. Use with caution or refresh.');
  });

  test('staleness forces low reliability even at a perfect score', () => {
    const report = new DataQualityReporter(1000).generateQualityReport(
      { symbol: 'A', regularMarketPrice: 1 },
      ['symbol', 'regularMarketPrice'],
      Date.now() - 5000
    );
    expect(report.completenessScore).toBe(100);
    expect(report.staleData).toBe(true);
    expect(report.sourceReliability).toBe('low');
    expect(report.recommendation).toBe('Data is stale. Consider refreshing if real-time accuracy is required.');
  });

  test('stale plus a score under 50 asks for an immediate refresh', () => {
    const report = new DataQualityReporter(1000).generateQualityReport(
      { symbol: 'A', w: 1, x: null, y: null, z: null, v: null },
      ['symbol'],
      Date.now() - 5000
    );
    expect(report.completenessScore).toBe(43);
    expect(report.recommendation).toBe('Data is stale and incomplete. Refresh data immediately.');
  });

  test('more than five missing fields recommends a fallback source', () => {
    const report = new DataQualityReporter(60000).generateQualityReport(
      { symbol: 'A', regularMarketPrice: 1, a: 1, b: 1, c: 1, d: 1, e: null, f: null, g: null, h: null, i: null, j: null },
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    );
    expect(report.missingFields).toHaveLength(6);
    expect(report.recommendation).toBe('Too many missing fields. Consider using fallback data or alternative source.');
  });

  test('a missing CRITICAL field outranks staleness in the recommendation', () => {
    const report = new DataQualityReporter(1000).generateQualityReport(
      { price: 1, q: 2, r: 3 },
      ['price'],
      Date.now() - 5000
    );
    expect(report.completenessScore).toBe(100);
    expect(report.recommendation).toBe('Critical fields are missing. Data may not be suitable for production use.');
  });

  test('dataAge is the elapsed time for a supplied timestamp', () => {
    const report = new DataQualityReporter(60000).generateQualityReport({ symbol: 'A' }, ['symbol'], Date.now() - 5000);
    expect(report.dataAge).toBeGreaterThanOrEqual(5000);
    expect(report.dataAge).toBeLessThan(60000);
  });

  test('quirk: without a timestamp the report says the data is 0 ms old and not stale', () => {
    const report = new DataQualityReporter(60000).generateQualityReport(
      { symbol: 'AAPL', price: 1 },
      ['symbol']
    );
    expect(report.dataAge).toBe(0);
    expect(report.staleData).toBe(false);
    expect(report.sourceReliability).toBe('high');
  });

  test('staleData flips at strictly more than half the TTL', () => {
    const data = { symbol: 'A', regularMarketPrice: 1 };
    expect(new DataQualityReporter(1000).generateQualityReport(data, ['symbol', 'regularMarketPrice'], Date.now() - 500).staleData).toBe(false);
    expect(new DataQualityReporter(1000).generateQualityReport(data, ['symbol', 'regularMarketPrice'], Date.now() - 501).staleData).toBe(true);
  });

  test('a seconds-resolution timestamp makes the report read as ancient and low-reliability', () => {
    const report = new DataQualityReporter(60000).generateQualityReport(
      { symbol: 'A', regularMarketPrice: 1, regularMarketTime: 1705327800 },
      ['symbol']
    );
    expect(report.dataAge).toBeGreaterThan(1e11);
    expect(report.staleData).toBe(true);
    expect(report.sourceReliability).toBe('low');
  });

  test('warnings are generated from the same age the report carries', () => {
    const report = new DataQualityReporter(1000).generateQualityReport(
      { symbol: 'A', regularMarketPrice: 1 },
      ['symbol', 'regularMarketPrice'],
      Date.now() - 2000
    );
    expect(report.warnings).toContain('Data has exceeded its TTL and may be expired');
  });

  test('records field history as a side effect', () => {
    const reporter = new DataQualityReporter(60000);
    reporter.generateQualityReport({ symbol: 'A' }, ['symbol', 'volume']);
    expect(reporter.getFieldHistory()).toEqual({ symbol: [true], volume: [false] });
  });

  test('an invalid timestamp Date yields a NaN age and a non-stale report', () => {
    const report = new DataQualityReporter(60000).generateQualityReport({ symbol: 'A' }, ['symbol'], new Date('nope'));
    expect(Number.isNaN(report.dataAge)).toBe(true);
    expect(report.staleData).toBe(false);
  });
});

describe('compareWithCached', () => {
  const reporter = () => new DataQualityReporter();

  test('reports nothing when both sides match', () => {
    expect(reporter().compareWithCached({ price: 150 }, { price: 150 })).toEqual([]);
    expect(reporter().compareWithCached({ meta: { a: 1 } }, { meta: { a: 1 } })).toEqual([]);
    expect(reporter().compareWithCached({ list: [1, 2] }, { list: [1, 2] })).toEqual([]);
  });

  test('flags a field present live and absent in cache', () => {
    expect(reporter().compareWithCached({ price: 150 }, {})).toEqual([
      "Field 'price' is present in live data but missing in cache"
    ]);
  });

  test('flags a field missing live but present in cache', () => {
    expect(reporter().compareWithCached({ price: null }, { price: 150 })).toEqual([
      "Field 'price' is missing in live data but present in cache"
    ]);
  });

  test('renders both values into a difference message', () => {
    expect(reporter().compareWithCached({ price: 150 }, { price: 149 })).toEqual([
      "Field 'price' has different values (live: 150, cached: 149)"
    ]);
  });

  test('treats null and undefined as equivalent absences', () => {
    expect(reporter().compareWithCached({ x: null }, { x: undefined })).toEqual([]);
  });

  test('ignores numeric differences below the 0.0001 tolerance but not at it', () => {
    expect(reporter().compareWithCached({ price: 150 }, { price: 150.00001 })).toEqual([]);
    expect(reporter().compareWithCached({ price: 150 }, { price: 150.0001 })).toHaveLength(1);
  });

  test('a type change is a difference', () => {
    expect(reporter().compareWithCached({ price: '150' }, { price: 150 })).toEqual([
      'Field \'price\' has different values (live: "150", cached: 150)'
    ]);
  });

  test('compares nested objects and arrays by structure', () => {
    expect(reporter().compareWithCached({ meta: { a: 1, b: 2 } }, { meta: { a: 1 } })).toHaveLength(1);
    expect(reporter().compareWithCached({ list: [1, 2] }, { list: [2, 1] })).toHaveLength(1);
  });

  test('walks the union of both key sets', () => {
    const differences = reporter().compareWithCached({ a: 1 }, { b: 2 });
    expect(differences).toHaveLength(2);
    expect(differences[0]).toContain("'a'");
    expect(differences[1]).toContain("'b'");
  });

  test('empty objects compare clean', () => {
    expect(reporter().compareWithCached({}, {})).toEqual([]);
  });
});
