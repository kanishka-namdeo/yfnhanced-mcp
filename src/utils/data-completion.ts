export type DataQualityReport = {
  completenessScore: number;
  staleData: boolean;
  dataAge: number;
  sourceReliability: 'high' | 'medium' | 'low';
  missingFields: string[];
  warnings: string[];
  recommendation: string;
};

type FieldWeight = {
  [key: string]: number;
};

type FieldHistory = {
  [key: string]: boolean[];
};

const DEFAULT_TTL = 60000;
const CRITICAL_FIELDS = ['symbol', 'regularMarketPrice'];
const IMPORTANT_FIELDS = ['regularMarketChange', 'regularMarketChangePercent', 'marketCap', 'volume'];
const STANDARD_WEIGHT = 1;
const CRITICAL_WEIGHT = 2;
const IMPORTANT_WEIGHT = 1.5;

class DataQualityReporter {
  private ttl: number;
  private fieldHistory: FieldHistory;

  constructor(ttl: number = DEFAULT_TTL) {
    this.ttl = ttl;
    this.fieldHistory = {};
  }

  calculateCompleteness(data: Record<string, unknown>): number {
    const weights = this.buildFieldWeights(data);
    const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);

    if (totalWeight === 0) {
      return 0;
    }

    let weightedScore = 0;
    for (const [field, weight] of Object.entries(weights)) {
      if (this.hasValue(data[field])) {
        weightedScore += weight;
      }
    }

    return Math.round((weightedScore / totalWeight) * 100);
  }

  detectMissingFields(data: Record<string, unknown>, expectedFields: string[]): string[] {
    const missing: string[] = [];

    for (const field of expectedFields) {
      if (!this.hasValue(data[field])) {
        missing.push(field);
      }
    }

    this.updateFieldHistory(data, expectedFields);

    return missing;
  }

  getDataAge(timestamp: number | Date): number {
    const timestampMs = typeof timestamp === 'number' ? timestamp : timestamp.getTime();
    const now = Date.now();
    return Math.max(0, now - timestampMs);
  }

  generateWarnings(data: Record<string, unknown>, dataAge?: number): string[] {
    const warnings: string[] = [];
    const age = dataAge ?? this.extractTimestamp(data);

    if (age > this.ttl) {
      warnings.push('Data has exceeded its TTL and may be expired');
    } else if (age > this.ttl * 0.5) {
      warnings.push('Data is stale (exceeds 50% of TTL)');
    }

    const criticalMissing = CRITICAL_FIELDS.filter(field => !this.hasValue(data[field]));
    if (criticalMissing.length > 0) {
      warnings.push(`Missing critical fields: ${criticalMissing.join(', ')}`);
    }

    const importantMissing = IMPORTANT_FIELDS.filter(field => !this.hasValue(data[field]));
    if (importantMissing.length > 0) {
      warnings.push(`Missing important fields: ${importantMissing.join(', ')}`);
    }

    if (this.detectUnexpectedPatterns(data)) {
      warnings.push('Unexpected data patterns detected');
    }

    if (this.detectIntegrityIssues(data)) {
      warnings.push('Data integrity issues detected');
    }

    if (this.detectNegativePrices(data)) {
      warnings.push('Negative or invalid price values detected');
    }

    return warnings;
  }

  generateQualityReport(
    data: Record<string, unknown>,
    expectedFields: string[],
    timestamp?: number | Date
  ): DataQualityReport {
    const dataAge = timestamp !== undefined ? this.getDataAge(timestamp) : this.extractTimestamp(data);
    const missingFields = this.detectMissingFields(data, expectedFields);
    const warnings = this.generateWarnings(data, dataAge);
    const completenessScore = this.calculateCompleteness(data);
    const staleData = dataAge > this.ttl * 0.5;

    const sourceReliability = this.determineSourceReliability(
      completenessScore,
      staleData,
      missingFields.length
    );

    const recommendation = this.generateRecommendation(
      completenessScore,
      staleData,
      missingFields,
      warnings
    );

    return {
      completenessScore,
      staleData,
      dataAge,
      sourceReliability,
      missingFields,
      warnings,
      recommendation
    };
  }

  compareWithCached(
    liveData: Record<string, unknown>,
    cachedData: Record<string, unknown>
  ): string[] {
    const differences: string[] = [];
    const fields = new Set([...Object.keys(liveData), ...Object.keys(cachedData)]);

    for (const field of fields) {
      const liveValue = liveData[field];
      const cachedValue = cachedData[field];

      if (this.hasValue(liveValue) && !this.hasValue(cachedValue)) {
        differences.push(`Field '${field}' is present in live data but missing in cache`);
      } else if (!this.hasValue(liveValue) && this.hasValue(cachedValue)) {
        differences.push(`Field '${field}' is missing in live data but present in cache`);
      } else if (this.hasValue(liveValue) && this.hasValue(cachedValue)) {
        if (!this.valuesEqual(liveValue, cachedValue)) {
          differences.push(`Field '${field}' has different values (live: ${JSON.stringify(liveValue)}, cached: ${JSON.stringify(cachedValue)})`);
        }
      }
    }

    return differences;
  }

  setTTL(ttl: number): void {
    this.ttl = ttl;
  }

  getTTL(): number {
    return this.ttl;
  }

  getFieldHistory(): FieldHistory {
    return { ...this.fieldHistory };
  }

  clearFieldHistory(): void {
    this.fieldHistory = {};
  }

  private buildFieldWeights(data: Record<string, unknown>): FieldWeight {
    const weights: FieldWeight = {};
    const fields = Object.keys(data);

    for (const field of fields) {
      if (CRITICAL_FIELDS.includes(field)) {
        weights[field] = CRITICAL_WEIGHT;
      } else if (IMPORTANT_FIELDS.includes(field)) {
        weights[field] = IMPORTANT_WEIGHT;
      } else {
        weights[field] = STANDARD_WEIGHT;
      }
    }

    return weights;
  }

  private hasValue(value: unknown): boolean {
    return value !== null && value !== undefined;
  }

  private extractTimestamp(data: Record<string, unknown>): number {
    const possibleTimestamps = [
      'regularMarketTime',
      'timestamp',
      'date',
      'lastUpdate',
      'meta.regularMarketTime'
    ];

    for (const path of possibleTimestamps) {
      const value = this.getNestedValue(data, path);
      if (typeof value === 'number' && value > 0) {
        return this.getDataAge(value);
      }
      if (value instanceof Date) {
        return this.getDataAge(value);
      }
    }

    return 0;
  }

  private getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce((current: unknown, key) => {
      return typeof current === 'object' && current !== null ? (current as Record<string, unknown>)[key] : undefined;
    }, obj);
  }

  private updateFieldHistory(data: Record<string, unknown>, expectedFields: string[]): void {
    for (const field of expectedFields) {
      if (!this.fieldHistory[field]) {
        this.fieldHistory[field] = [];
      }

      const isPresent = this.hasValue(data[field]);
      this.fieldHistory[field].push(isPresent);

      if (this.fieldHistory[field].length > 100) {
        this.fieldHistory[field].shift();
      }
    }
  }

  private detectUnexpectedPatterns(data: Record<string, unknown>): boolean {
    const priceFields = ['regularMarketPrice', 'regularMarketOpen', 'regularMarketDayHigh', 'regularMarketDayLow'];

    for (const field of priceFields) {
      const value = data[field];
      if (typeof value === 'number') {
        if (value < 0 || value > 1e10) {
          return true;
        }
      }
    }

    const volume = data['regularMarketVolume'];
    if (typeof volume === 'number' && (volume < 0 || volume > 1e15)) {
      return true;
    }

    return false;
  }

  private detectIntegrityIssues(data: Record<string, unknown>): boolean {
    const price = data['regularMarketPrice'];
    const open = data['regularMarketOpen'];
    const high = data['regularMarketDayHigh'];
    const low = data['regularMarketDayLow'];

    if (typeof price === 'number' && typeof high === 'number' && typeof low === 'number') {
      if (high < low) {
        return true;
      }
      if (price < low || price > high) {
        return true;
      }
    }

    if (typeof price === 'number' && typeof open === 'number') {
      if (price === 0 && open === 0) {
        return true;
      }
    }

    const change = data['regularMarketChange'];
    const changePercent = data['regularMarketChangePercent'];

    if (typeof change === 'number' && typeof changePercent === 'number') {
      if (change === 0 && changePercent === 0 && price !== 0) {
        return true;
      }
    }

    return false;
  }

  private detectNegativePrices(data: Record<string, unknown>): boolean {
    const priceFields = ['regularMarketPrice', 'regularMarketOpen', 'regularMarketDayHigh', 'regularMarketDayLow', 'preMarketPrice', 'postMarketPrice'];

    for (const field of priceFields) {
      const value = data[field];
      if (typeof value === 'number' && value < 0) {
        return true;
      }
    }

    return false;
  }

  private determineSourceReliability(
    completenessScore: number,
    staleData: boolean,
    missingFieldsCount: number
  ): 'high' | 'medium' | 'low' {
    if (completenessScore >= 90 && !staleData && missingFieldsCount === 0) {
      return 'high';
    }

    if (completenessScore >= 70 && !staleData && missingFieldsCount <= 2) {
      return 'medium';
    }

    return 'low';
  }

  private generateRecommendation(
    completenessScore: number,
    staleData: boolean,
    missingFields: string[],
    warnings: string[]
  ): string {
    if (completenessScore >= 90 && !staleData && missingFields.length === 0) {
      return 'Data is complete and fresh. Safe to use.';
    }

    if (staleData && completenessScore < 50) {
      return 'Data is stale and incomplete. Refresh data immediately.';
    }

    if (missingFields.length > 5) {
      return 'Too many missing fields. Consider using fallback data or alternative source.';
    }

    if (warnings.some(w => w.includes('critical'))) {
      return 'Critical fields are missing. Data may not be suitable for production use.';
    }

    if (staleData) {
      return 'Data is stale. Consider refreshing if real-time accuracy is required.';
    }

    if (completenessScore >= 70) {
      return 'Data is mostly complete. May be acceptable for non-critical use cases.';
    }

    return 'Data quality is poor. Use with caution or refresh.';
  }

  private valuesEqual(a: unknown, b: unknown): boolean {
    if (a === b) {
      return true;
    }

    if (typeof a !== typeof b) {
      return false;
    }

    if (typeof a === 'number') {
      return Math.abs((a) - (b as number)) < 0.0001;
    }

    if (typeof a === 'object' && a !== null && b !== null) {
      const aKeys = Object.keys(a as Record<string, unknown>);
      const bKeys = Object.keys(b as Record<string, unknown>);

      if (aKeys.length !== bKeys.length) {
        return false;
      }

      for (const key of aKeys) {
        if (!this.valuesEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
          return false;
        }
      }

      return true;
    }

    return JSON.stringify(a) === JSON.stringify(b);
  }
}

export { DataQualityReporter };
