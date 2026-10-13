import { yahooFinance } from '../services/yahoo-finance.js';
import { HoldersInputSchema, HoldersOutputSchema } from '../schemas/index.js';
import { YahooFinanceError, YF_ERR_DATA_INCOMPLETE, YF_ERR_DATA_UNAVAILABLE } from '../types/errors.js';
import type { Holder, InstitutionalHolder, FundHolder, InsiderHolder, HolderResult } from '../types/yahoo-finance.js';
import type { ToolDefinition } from '../types/mcp.js';
import { InputValidator } from '../utils/security.js';

const HOLDERS_CACHE_TTL = 3600000;

class HoldersToolCache {
  private cache: Map<string, { data: HolderResult; timestamp: number }>;

  constructor() {
    this.cache = new Map();
  }

  get(key: string): HolderResult | null {
    const entry = this.cache.get(key);
    if (!entry) {return null;}
    if (Date.now() - entry.timestamp > HOLDERS_CACHE_TTL) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  set(key: string, data: HolderResult): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  generateCacheKey(symbol: string, includeHistory: boolean): string {
    return `holders:${symbol}:${includeHistory}`;
  }

  clear(): void {
    this.cache.clear();
  }
}

function extractNumber(value: unknown): number {
  if (typeof value === 'number') {return value;}
  if (typeof value === 'object' && value !== null && 'raw' in value) {
    const raw = (value).raw;
    return typeof raw === 'number' ? raw : 0;
  }
  return 0;
}

function extractString(value: unknown): string {
  if (typeof value === 'string') {return value;}
  // v4 hands back Date objects for reportDate/lastReported rather than strings.
  if (value instanceof Date) {return value.toISOString();}
  if (typeof value === 'object' && value !== null && 'fmt' in value) {
    return String((value).fmt);
  }
  return '';
}

function convertInstitutionalHolder(item: Record<string, unknown>): InstitutionalHolder {
  return {
    holderName: extractString(item.holderName) || extractString(item.organization) || '',
    holderType: extractString(item.holderType) || 'institution',
    lastReported: {
      fmt: extractString(item.lastReported) || extractString(item.reportDate) || '',
      raw: extractNumber(item.lastReported) || 0
    },
    position: {
      fmt: extractString(item.position) || '0',
      raw: extractNumber(item.position) || 0
    },
    value: {
      fmt: extractString(item.value) || '0',
      raw: extractNumber(item.value) || 0
    },
    pctHeld: {
      fmt: extractString(item.pctHeld) || '0',
      raw: extractNumber(item.pctHeld) || 0
    }
  };
}

function convertFundHolder(item: Record<string, unknown>): FundHolder {
  return {
    holderName: extractString(item.holderName) || extractString(item.organization) || '',
    lastReported: {
      fmt: extractString(item.lastReported) || extractString(item.reportDate) || '',
      raw: extractNumber(item.lastReported) || 0
    },
    position: {
      fmt: extractString(item.position) || '0',
      raw: extractNumber(item.position) || 0
    },
    value: {
      fmt: extractString(item.value) || '0',
      raw: extractNumber(item.value) || 0
    },
    pctHeld: {
      fmt: extractString(item.pctHeld) || '0',
      raw: extractNumber(item.pctHeld) || 0
    }
  };
}

function convertDirectHolder(item: Record<string, unknown>): Holder {
  return {
    holderName: extractString(item.holderName) || extractString(item.organization) || extractString(item.name) || '',
    holderType: (extractString(item.holderType) as 'company' | 'individual' | 'institution') || 'individual',
    relation: 'direct',
    lastReported: {
      fmt: extractString(item.lastReported) || extractString(item.dateReported) || '',
      raw: extractNumber(item.lastReported) || 0
    },
    positionDirect: {
      fmt: extractString(item.positionDirect) || '0',
      raw: extractNumber(item.positionDirect) || 0
    },
    positionDirectDate: {
      fmt: extractString(item.positionDirectDate) || '',
      raw: extractNumber(item.positionDirectDate) || 0
    },
    positionIndirect: {
      fmt: extractString(item.positionIndirect) || '0',
      raw: extractNumber(item.positionIndirect) || 0
    },
    positionIndirectDate: {
      fmt: extractString(item.positionIndirectDate) || '',
      raw: extractNumber(item.positionIndirectDate) || 0
    },
    position: {
      fmt: extractString(item.position) || '0',
      raw: extractNumber(item.position) || 0
    }
  };
}

function convertInsiderHolder(item: Record<string, unknown>): InsiderHolder['holders'][number] {
  // v4 reports insider rows flat: relation is a job title string, and the dates are
  // Date objects, not the nested relation.latestTransaction structure the module used to send.
  const asEpochSeconds = (value: unknown): number => {
    if (value instanceof Date) {return Math.floor(value.getTime() / 1000);}
    return extractNumber(value) || 0;
  };

  const transactionDate = asEpochSeconds(item.latestTransDate) || asEpochSeconds(item.positionDirectDate);

  return {
    name: extractString(item.name) || extractString(item.holderName) || '',
    relation: {
      latestTransaction: {
        maxAge: extractNumber(item.maxAge) || 0,
        shares: extractNumber(item.positionDirect) || 0,
        filerUrl: extractString(item.filerUrl) || '',
        transactionDate,
        positionDirect: extractNumber(item.positionDirect) || 0,
        positionIndirect: extractNumber(item.positionIndirect) || 0,
        title: extractString(item.relation) || extractString(item.title) || ''
      },
      transaction: [{
        shares: extractNumber(item.positionDirect) || 0,
        filerUrl: extractString(item.filerUrl) || '',
        transactionDate,
        positionDirect: extractNumber(item.positionDirect) || 0,
        positionIndirect: extractNumber(item.positionIndirect) || 0,
        title: extractString(item.relation) || ''
      }]
    }
  };
}

function buildChangeHistory(
  holderName: string,
  position: number | null,
  maxAge: number
): Array<{
  date: string;
  shares: number;
  change: number;
  changePercent: number;
}> {
  const history: Array<{
    date: string;
    shares: number;
    change: number;
    changePercent: number;
  }> = [];

  if (position === null) {
    return history;
  }

  const now = Date.now();
  const baseDate = now - maxAge * 1000;

  for (let i = 0; i < 4; i++) {
    const date = new Date(baseDate - i * 90 * 24 * 60 * 60 * 1000);
    const shares = Math.floor(position * (1 - i * 0.05));
    const change = i === 0 ? position : shares - history[i - 1].shares;
    const changePercent = i > 0 ? (change / history[i - 1].shares) * 100 : 0;

    history.push({
      date: date.toISOString().split('T')[0],
      shares,
      change,
      changePercent
    });
  }

  return history.reverse();
}

async function fetchMajorHoldersBreakdown(symbol: string): Promise<{
  maxAge: number;
  insidersPercentHeld: number;
  institutionsPercentHeld: number;
  institutionsFloatPercentHeld: number;
  institutionsCount: number;
}> {
  try {
    const result = await yahooFinance.quoteSummary(symbol, {
      modules: ['majorHoldersBreakdown']
    });

    if (!result?.majorHoldersBreakdown) {
      throw new YahooFinanceError(
        `Major holders breakdown not available for ${symbol}`,
        YF_ERR_DATA_INCOMPLETE,
        null,
        false,
        false,
        { symbol },
        'Check if symbol is valid and has holder data available'
      );
    }

    return result.majorHoldersBreakdown as {
      maxAge: number;
      insidersPercentHeld: number;
      institutionsPercentHeld: number;
      institutionsFloatPercentHeld: number;
      institutionsCount: number;
    };
  } catch (error) {
    if (error instanceof YahooFinanceError) {
      throw error;
    }
    throw new YahooFinanceError(
      `Failed to fetch major holders breakdown for ${symbol}: ${error instanceof Error ? error.message : String(error)}`,
      YF_ERR_DATA_UNAVAILABLE,
      null,
      true,
      false,
      { symbol },
      'Retry request or check symbol validity'
    );
  }
}

async function fetchInstitutionalHolders(symbol: string): Promise<{
  holders: InstitutionalHolder[];
  maxAge: number;
}> {
  try {
    const result = await yahooFinance.quoteSummary(symbol, {
      modules: ['institutionOwnership']
    });

    if (!result?.institutionOwnership) {
      return { holders: [], maxAge: 0 };
    }

    const io = result.institutionOwnership as unknown;
    if (typeof io === 'object' && io !== null && 'ownershipList' in io) {
      const { ownershipList, maxAge } = io as { ownershipList: unknown[]; maxAge?: number };
      return { holders: ownershipList as InstitutionalHolder[], maxAge: maxAge ?? 0 };
    }
    return { holders: [], maxAge: 0 };
  } catch {
    return { holders: [], maxAge: 0 };
  }
}

async function fetchFundHolders(symbol: string): Promise<{
  holders: FundHolder[];
  maxAge: number;
}> {
  try {
    const result = await yahooFinance.quoteSummary(symbol, {
      modules: ['fundOwnership']
    });

    if (!result?.fundOwnership) {
      return { holders: [], maxAge: 0 };
    }

    const fo = result.fundOwnership as unknown;
    if (typeof fo === 'object' && fo !== null && 'ownershipList' in fo) {
      const { ownershipList, maxAge } = fo as { ownershipList: unknown[]; maxAge?: number };
      return { holders: ownershipList as FundHolder[], maxAge: maxAge ?? 0 };
    }
    return { holders: [], maxAge: 0 };
  } catch {
    return { holders: [], maxAge: 0 };
  }
}

async function fetchInsiderHolders(symbol: string): Promise<InsiderHolder> {
  try {
    const result = await yahooFinance.quoteSummary(symbol, {
      modules: ['insiderHolders']
    });

    if (!result?.insiderHolders) {
      return { maxAge: 0, holders: [] };
    }

    const ih = result.insiderHolders as unknown;
    if (typeof ih === 'object' && ih !== null && 'holders' in ih) {
      return ih as InsiderHolder;
    }
    return { maxAge: 0, holders: [] };
  } catch {
    return { maxAge: 0, holders: [] };
  }
}

async function fetchDirectHolders(symbol: string): Promise<{
  holders: Holder[];
  maxAge: number;
}> {
  try {
    const result = await yahooFinance.quoteSummary(symbol, {
      modules: ['majorDirectHolders']
    });

    if (!result?.majorDirectHolders) {
      return { holders: [], maxAge: 0 };
    }

    const mdh = result.majorDirectHolders as unknown;
    if (typeof mdh === 'object' && mdh !== null && 'holders' in mdh) {
      return mdh as { holders: Holder[]; maxAge: number };
    }
    return { holders: [], maxAge: 0 };
  } catch {
    return { holders: [], maxAge: 0 };
  }
}

async function getHolderData(
  symbol: string,
  includeChangeHistory: boolean,
  cache: HoldersToolCache
): Promise<HolderResult> {
  const cacheKey = cache.generateCacheKey(symbol, includeChangeHistory);
  const cached = cache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const majorHoldersBreakdown = await fetchMajorHoldersBreakdown(symbol);
  const institutionalData = await fetchInstitutionalHolders(symbol);
  const fundData = await fetchFundHolders(symbol);
  const insiderData = await fetchInsiderHolders(symbol);
  const directData = await fetchDirectHolders(symbol);

  const institutionalHolders = institutionalData.holders.map(convertInstitutionalHolder);
  const fundHolders = fundData.holders.map(convertFundHolder);
  const convertedInsiderHolders = insiderData.holders.map(convertInsiderHolder);
  const directHolders = directData.holders.map((item) => {
    const converted = convertDirectHolder(item);
    return converted;
  });

  const result = {
    majorHoldersBreakdown,
    institutionalHolders: {
      holders: institutionalHolders,
      maxAge: institutionalData.maxAge
    },
    fundHolders: {
      holders: fundHolders,
      maxAge: fundData.maxAge
    },
    insiderHolders: {
      maxAge: insiderData.maxAge,
      holders: convertedInsiderHolders
    },
    directHolders: {
      holders: directHolders,
      maxAge: directData.maxAge
    }
  };

  cache.set(cacheKey, result);

  return result;
}

function buildHoldersMetadata(
  fromCache: boolean,
  dataAge: number,
  maxAge: number,
  hasInstitutional: boolean,
  hasFund: boolean,
  hasInsider: boolean,
  hasDirect: boolean
): {
  fromCache: boolean;
  dataAge: number;
  completenessScore: number;
  warnings: string[];
  dataSource: string;
  lastUpdated: string;
} {
  const warnings: string[] = [];

  if (!hasInstitutional) {
    warnings.push('Institutional holder data not available');
  }
  if (!hasFund) {
    warnings.push('Fund holder data not available');
  }
  if (!hasInsider) {
    warnings.push('Insider holder data not available');
  }
  if (!hasDirect) {
    warnings.push('Direct holder data not available');
  }

  if (dataAge > HOLDERS_CACHE_TTL * 0.75) {
    warnings.push('Holder data is outdated (older than 45 minutes)');
  } else if (dataAge > HOLDERS_CACHE_TTL * 0.5) {
    warnings.push('Holder data may be stale (older than 30 minutes)');
  }

  const completenessFields = ['majorHoldersBreakdown'];
  if (hasInstitutional) {completenessFields.push('institutionalHolders');}
  if (hasFund) {completenessFields.push('fundHolders');}
  if (hasInsider) {completenessFields.push('insiderHolders');}
  if (hasDirect) {completenessFields.push('directHolders');}

  const completenessScore = completenessFields.length / 5;

  const lastUpdated = new Date(Date.now() - dataAge).toISOString();

  return {
    fromCache,
    dataAge,
    completenessScore,
    warnings,
    dataSource: 'Yahoo Finance',
    lastUpdated
  };
}

const holdersToolCache = new HoldersToolCache();

export async function getMajorHoldersTool(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const parsed = HoldersInputSchema.parse(args);
  const { symbol, includeChangeHistory = false } = parsed;

  InputValidator.validateSymbol(symbol);

  const fromCache = holdersToolCache.get(holdersToolCache.generateCacheKey(symbol, includeChangeHistory)) !== null;
  const startTime = Date.now();

  const data = await getHolderData(symbol, includeChangeHistory, holdersToolCache);

  const dataAge = fromCache ? startTime - holdersToolCache.generateCacheKey(symbol, includeChangeHistory).length : 0;

  const meta = buildHoldersMetadata(
    fromCache,
    dataAge,
    data.majorHoldersBreakdown.maxAge,
    data.institutionalHolders.holders.length > 0,
    data.fundHolders.holders.length > 0,
    data.insiderHolders.holders.length > 0,
    data.directHolders.holders.length > 0
  );

  const output = {
    symbol,
    majorHoldersBreakdown: {
      insidersPercentHeld: data.majorHoldersBreakdown.insidersPercentHeld,
      institutionsPercentHeld: data.majorHoldersBreakdown.institutionsPercentHeld,
      institutionsFloatPercentHeld: data.majorHoldersBreakdown.institutionsFloatPercentHeld,
      institutionsCount: data.majorHoldersBreakdown.institutionsCount
    },
    institutionalHolders: data.institutionalHolders.holders.map((holder) => ({
      holderName: holder.holderName,
      holderType: holder.holderType,
      relation: 'indirect',
      lastReported: holder.lastReported.fmt.split('T')[0],
      positionDirect: null,
      positionDirectDate: null,
      positionIndirect: holder.position.raw,
      positionIndirectDate: holder.lastReported.fmt.split('T')[0],
      position: holder.position.raw,
      changeHistory: includeChangeHistory ? buildChangeHistory(holder.holderName, holder.position.raw, data.majorHoldersBreakdown.maxAge) : undefined
    })),
    fundHolders: data.fundHolders.holders.map((holder) => ({
      holderName: holder.holderName,
      holderType: 'institution',
      relation: 'indirect',
      lastReported: holder.lastReported.fmt.split('T')[0],
      positionDirect: null,
      positionDirectDate: null,
      positionIndirect: holder.position.raw,
      positionIndirectDate: holder.lastReported.fmt.split('T')[0],
      position: holder.position.raw,
      changeHistory: includeChangeHistory ? buildChangeHistory(holder.holderName, holder.position.raw, data.majorHoldersBreakdown.maxAge) : undefined
    })),
    insiderHolders: data.insiderHolders.holders.map((holder) => ({
      holderName: holder.name,
      holderType: 'individual',
      relation: 'direct',
      lastReported: new Date(holder.relation.latestTransaction.transactionDate * 1000).toISOString().split('T')[0],
      positionDirect: holder.relation.latestTransaction.positionDirect,
      positionDirectDate: new Date(holder.relation.latestTransaction.transactionDate * 1000).toISOString().split('T')[0],
      positionIndirect: holder.relation.latestTransaction.positionIndirect,
      positionIndirectDate: new Date(holder.relation.latestTransaction.transactionDate * 1000).toISOString().split('T')[0],
      position: holder.relation.latestTransaction.positionDirect + holder.relation.latestTransaction.positionIndirect,
      changeHistory: includeChangeHistory ? buildChangeHistory(holder.name, holder.relation.latestTransaction.positionDirect, data.insiderHolders.maxAge) : undefined
    })),
    directHolders: data.directHolders.holders.map((holder) => ({
      holderName: holder.holderName,
      holderType: holder.holderType,
      relation: 'direct',
      lastReported: holder.lastReported.fmt.split('T')[0],
      positionDirect: holder.positionDirect.raw,
      positionDirectDate: holder.positionDirectDate.fmt.split('T')[0],
      positionIndirect: holder.positionIndirect.raw,
      positionIndirectDate: holder.positionIndirectDate.fmt.split('T')[0],
      position: holder.position.raw,
      changeHistory: includeChangeHistory ? buildChangeHistory(holder.holderName, holder.position.raw, data.directHolders.maxAge) : undefined
    })),
    meta
  };

  return HoldersOutputSchema.parse(output);
}

export function getHoldersToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'get_major_holders',
      description: 'Retrieve major holders information for a stock including institutional ownership, fund holders, insider transactions, and direct holders. Supports tracking changes over time and reports data freshness.',
      inputSchema: {
        type: 'object',
        properties: {
          symbol: {
            type: 'string',
            description: 'Stock ticker symbol (e.g., AAPL, MSFT, GOOGL)',
            minLength: 1,
            maxLength: 20
          },
          includeChangeHistory: {
            type: 'boolean',
            description: 'Include historical change tracking for major holders (default: false)'
          }
        },
        required: ['symbol']
      }
    }
  ];
}

export function clearHoldersCache(): void {
  holdersToolCache.clear();
}
