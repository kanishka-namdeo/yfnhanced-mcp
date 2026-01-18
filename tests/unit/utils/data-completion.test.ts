import { calculateCompleteness, DataQualityReport, calculateFieldQuality } from '../../../src/utils/data-completion';

describe('calculateCompleteness', () => {
  test('should calculate 100% completeness for full data', () => {
    const data = {
      price: 150,
      volume: 50000000,
      marketCap: 2500000000000
    };
    const requiredFields = ['price', 'volume', 'marketCap'];

    const result = calculateCompleteness(data, requiredFields);
    expect(result).toBe(1);
  });

  test('should calculate 0% completeness for empty data', () => {
    const data = {};
    const requiredFields = ['price', 'volume', 'marketCap'];

    const result = calculateCompleteness(data, requiredFields);
    expect(result).toBe(0);
  });

  test('should calculate partial completeness', () => {
    const data = {
      price: 150,
      volume: null
    };
    const requiredFields = ['price', 'volume', 'marketCap'];

    const result = calculateCompleteness(data, requiredFields);
    expect(result).toBeCloseTo(0.333, 3);
  });

  test('should treat 0 as valid value', () => {
    const data = {
      price: 0,
      volume: 0
    };
    const requiredFields = ['price', 'volume'];

    const result = calculateCompleteness(data, requiredFields);
    expect(result).toBe(1);
  });

  test('should treat false as valid value', () => {
    const data = {
      isDividendPaying: false
    };
    const requiredFields = ['isDividendPaying'];

    const result = calculateCompleteness(data, requiredFields);
    expect(result).toBe(1);
  });

  test('should treat empty string as invalid', () => {
    const data = {
      name: ''
    };
    const requiredFields = ['name'];

    const result = calculateCompleteness(data, requiredFields);
    expect(result).toBe(0);
  });

  test('should treat empty array as invalid', () => {
    const data = {
      holders: []
    };
    const requiredFields = ['holders'];

    const result = calculateCompleteness(data, requiredFields);
    expect(result).toBe(0);
  });

  test('should treat empty object as invalid', () => {
    const data = {
      details: {}
    };
    const requiredFields = ['details'];

    const result = calculateCompleteness(data, requiredFields);
    expect(result).toBe(0);
  });

  test('should handle nested fields', () => {
    const data = {
      price: { regularMarketPrice: 150, regularMarketChange: 2.5 }
    };
    const requiredFields = ['price.regularMarketPrice', 'price.regularMarketChange'];

    const result = calculateCompleteness(data, requiredFields);
    expect(result).toBe(1);
  });

  test('should handle missing nested fields', () => {
    const data = {
      price: { regularMarketPrice: 150 }
    };
    const requiredFields = ['price.regularMarketPrice', 'price.regularMarketChange'];

    const result = calculateCompleteness(data, requiredFields);
    expect(result).toBe(0.5);
  });

  test('should handle undefined nested object', () => {
    const data = {};
    const requiredFields = ['price.regularMarketPrice'];

    const result = calculateCompleteness(data, requiredFields);
    expect(result).toBe(0);
  });

  test('should use default fields if not provided', () => {
    const data = {
      price: 150,
      volume: 50000000
    };

    const result = calculateCompleteness(data);
    expect(result).toBeGreaterThan(0);
  });

  test('should handle array data', () => {
    const data = [{ price: 150 }, { price: 150 }, { price: null }];
    const requiredFields = ['price'];

    const result = calculateCompleteness(data, requiredFields);
    expect(result).toBeCloseTo(0.667, 3);
  });

  test('should return 0 for null data', () => {
    const result = calculateCompleteness(null, ['price']);
    expect(result).toBe(0);
  });

  test('should return 0 for undefined data', () => {
    const result = calculateCompleteness(undefined, ['price']);
    expect(result).toBe(0);
  });

  test('should return 0 for empty required fields', () => {
    const data = { price: 150 };
    const result = calculateCompleteness(data, []);
    expect(result).toBe(0);
  });
});

describe('DataQualityReport', () => {
  test('should create quality report with defaults', () => {
    const report = new DataQualityReport({ price: 150 });

    expect(report).toBeInstanceOf(DataQualityReport);
    expect(report.completeness).toBeDefined();
    expect(report.fields).toBeDefined();
  });

  test('should calculate completeness on init', () => {
    const data = {
      price: 150,
      volume: 50000000,
      marketCap: null
    };
    const requiredFields = ['price', 'volume', 'marketCap'];

    const report = new DataQualityReport(data, requiredFields);
    expect(report.completeness).toBeCloseTo(0.667, 3);
  });

  test('should include field quality', () => {
    const data = {
      price: 150,
      volume: 50000000
    };

    const report = new DataQualityReport(data, ['price', 'volume']);
    expect(report.fields.price).toBeDefined();
    expect(report.fields.volume).toBeDefined();
    expect(report.fields.price.hasValue).toBe(true);
    expect(report.fields.volume.hasValue).toBe(true);
  });

  test('should mark missing fields', () => {
    const data = {
      price: 150
    };

    const report = new DataQualityReport(data, ['price', 'volume']);
    expect(report.fields.volume.hasValue).toBe(false);
    expect(report.fields.volume.reason).toBe('missing');
  });

  test('should include timestamp', () => {
    const before = Date.now();
    const report = new DataQualityReport({ price: 150 });
    const after = Date.now();

    expect(report.timestamp.getTime()).toBeGreaterThanOrEqual(before);
    expect(report.timestamp.getTime()).toBeLessThanOrEqual(after);
  });

  test('should check if meets threshold', () => {
    const report = new DataQualityReport({ price: 150 }, ['price']);
    expect(report.meetsThreshold(0.8)).toBe(true);
  });

  test('should not meet threshold if below', () => {
    const report = new DataQualityReport({ price: 150 }, ['price', 'volume', 'marketCap']);
    expect(report.meetsThreshold(0.8)).toBe(false);
  });

  test('should get missing fields', () => {
    const report = new DataQualityReport({ price: 150 }, ['price', 'volume', 'marketCap']);
    const missing = report.getMissingFields();

    expect(missing).toContain('volume');
    expect(missing).toContain('marketCap');
    expect(missing).not.toContain('price');
  });

  test('should get present fields', () => {
    const report = new DataQualityReport({ price: 150 }, ['price', 'volume', 'marketCap']);
    const present = report.getPresentFields();

    expect(present).toContain('price');
    expect(present).not.toContain('volume');
    expect(present).not.toContain('marketCap');
  });

  test('should get field quality', () => {
    const report = new DataQualityReport({ price: 150 }, ['price']);
    const quality = report.getFieldQuality('price');

    expect(quality).toBeDefined();
    expect(quality.hasValue).toBe(true);
  });

  test('should return null for non-existent field', () => {
    const report = new DataQualityReport({ price: 150 }, ['price']);
    const quality = report.getFieldQuality('nonexistent');

    expect(quality).toBeNull();
  });

  test('should include data source', () => {
    const report = new DataQualityReport({ price: 150 }, ['price'], 'yahoo-finance');
    expect(report.dataSource).toBe('yahoo-finance');
  });

  test('should calculate overall quality score', () => {
    const report = new DataQualityReport(
      { price: 150, volume: 50000000 },
      ['price', 'volume', 'marketCap']
    );

    const score = report.getQualityScore();
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  test('should get summary', () => {
    const report = new DataQualityReport({ price: 150 }, ['price', 'volume']);

    const summary = report.getSummary();
    expect(summary).toHaveProperty('completeness');
    expect(summary).toHaveProperty('totalFields');
    expect(summary).toHaveProperty('presentFields');
    expect(summary).toHaveProperty('missingFields');
  });

  test('should handle nested data', () => {
    const data = {
      price: { regularMarketPrice: 150, regularMarketChange: null }
    };

    const report = new DataQualityReport(data, ['price.regularMarketPrice', 'price.regularMarketChange']);
    expect(report.completeness).toBe(0.5);
  });

  test('should update with new data', () => {
    const report = new DataQualityReport({ price: 150 }, ['price', 'volume']);
    report.update({ price: 150, volume: 50000000 });

    expect(report.completeness).toBe(1);
  });

  test('should reset report', () => {
    const report = new DataQualityReport({ price: 150 }, ['price', 'volume']);
    report.reset({});

    expect(report.completeness).toBe(0);
  });

  test('should calculate field counts', () => {
    const report = new DataQualityReport({ price: 150 }, ['price', 'volume', 'marketCap']);

    expect(report.getTotalFields()).toBe(3);
    expect(report.getPresentFieldsCount()).toBe(1);
    expect(report.getMissingFieldsCount()).toBe(2);
  });
});

describe('calculateFieldQuality', () => {
  test('should calculate quality for present field', () => {
    const quality = calculateFieldQuality('price', 150);
    expect(quality.hasValue).toBe(true);
    expect(quality.reason).toBeUndefined();
  });

  test('should calculate quality for missing field', () => {
    const quality = calculateFieldQuality('price', null);
    expect(quality.hasValue).toBe(false);
    expect(quality.reason).toBe('null');
  });

  test('should calculate quality for undefined field', () => {
    const quality = calculateFieldQuality('price', undefined);
    expect(quality.hasValue).toBe(false);
    expect(quality.reason).toBe('undefined');
  });

  test('should calculate quality for empty string', () => {
    const quality = calculateFieldQuality('name', '');
    expect(quality.hasValue).toBe(false);
    expect(quality.reason).toBe('empty');
  });

  test('should calculate quality for empty array', () => {
    const quality = calculateFieldQuality('holders', []);
    expect(quality.hasValue).toBe(false);
    expect(quality.reason).toBe('empty');
  });

  test('should calculate quality for empty object', () => {
    const quality = calculateFieldQuality('details', {});
    expect(quality.hasValue).toBe(false);
    expect(quality.reason).toBe('empty');
  });

  test('should treat 0 as valid', () => {
    const quality = calculateFieldQuality('price', 0);
    expect(quality.hasValue).toBe(true);
  });

  test('should treat false as valid', () => {
    const quality = calculateFieldQuality('isActive', false);
    expect(quality.hasValue).toBe(true);
  });

  test('should calculate quality for nested field', () => {
    const data = { price: { regularMarketPrice: 150 } };
    const quality = calculateFieldQuality('price.regularMarketPrice', data);
    expect(quality.hasValue).toBe(true);
  });

  test('should handle missing nested field', () => {
    const data = { price: {} };
    const quality = calculateFieldQuality('price.regularMarketPrice', data);
    expect(quality.hasValue).toBe(false);
  });

  test('should handle undefined parent object', () => {
    const data = {};
    const quality = calculateFieldQuality('price.regularMarketPrice', data);
    expect(quality.hasValue).toBe(false);
  });

  test('should calculate quality for array element', () => {
    const data = [{ price: 150 }];
    const quality = calculateFieldQuality('[0].price', data);
    expect(quality.hasValue).toBe(true);
  });

  test('should handle missing array element', () => {
    const data = [{ price: 150 }];
    const quality = calculateFieldQuality('[1].price', data);
    expect(quality.hasValue).toBe(false);
  });

  test('should include field name in quality object', () => {
    const quality = calculateFieldQuality('price', 150);
    expect(quality.field).toBe('price');
  });

  test('should calculate quality for valid object', () => {
    const quality = calculateFieldQuality('details', { name: 'test' });
    expect(quality.hasValue).toBe(true);
  });

  test('should calculate quality for valid array', () => {
    const quality = calculateFieldQuality('holders', [{ name: 'test' }]);
    expect(quality.hasValue).toBe(true);
  });
});
