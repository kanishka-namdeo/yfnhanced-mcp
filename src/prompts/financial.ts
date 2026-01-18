import { z } from 'zod';
import type { ToolCall, PromptDefinition } from '../types/mcp.js';

type FinancialPrompt = {
  name: string;
  description: string;
  arguments: Record<string, { type: string; description: string }>;
  prompt: (args: Record<string, unknown>) => Promise<string>;
};

const analyzeStockSchema = z.object({
  symbol: z.string().min(1).max(20),
  timeframe: z.enum(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'max']).optional().default('1y'),
  includeTechnicalAnalysis: z.boolean().optional().default(true),
  includeFundamentalAnalysis: z.boolean().optional().default(true)
});

const compareStocksSchema = z.object({
  symbols: z.array(z.string().min(1).max(20)).min(2).max(10),
  metrics: z.array(z.enum(['price', 'pe', 'eps', 'marketCap', 'dividendYield', 'beta', 'volume', 'change'])).optional().default(['price', 'pe', 'eps', 'marketCap']),
  timeframe: z.enum(['1d', '5d', '1mo', '3mo', '6mo', '1y']).optional().default('1y')
});

const financialHealthCheckSchema = z.object({
  symbol: z.string().min(1).max(20),
  includeRatios: z.boolean().optional().default(true),
  includeTrends: z.boolean().optional().default(true)
});

const earningsAnalysisSchema = z.object({
  symbol: z.string().min(1).max(20),
  periods: z.number().int().min(1).max(20).optional().default(12),
  includeEstimates: z.boolean().optional().default(true)
});

const marketOverviewSchema = z.object({
  region: z.enum(['US', 'EU', 'ASIA', 'GLOBAL']).optional().default('US'),
  sectors: z.array(z.string()).optional().default([]),
  includeTrending: z.boolean().optional().default(true)
});

const portfolioDueDiligenceSchema = z.object({
  symbols: z.array(z.string().min(1).max(20)).min(1).max(20),
  includeRiskAnalysis: z.boolean().optional().default(true),
  includeValuation: z.boolean().optional().default(true)
});

function formatNumber(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) {return 'N/A';}
  return value.toFixed(decimals);
}

function formatPercent(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) {return 'N/A';}
  return `${value.toFixed(decimals)}%`;
}

function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) {return 'N/A';}
  if (value >= 1e9) {return `$${(value / 1e9).toFixed(2)}B`;}
  if (value >= 1e6) {return `$${(value / 1e6).toFixed(2)}M`;}
  if (value >= 1e3) {return `$${(value / 1e3).toFixed(2)}K`;}
  return `$${value.toFixed(2)}`;
}

async function analyzeStock(args: Record<string, unknown>): Promise<string> {
  const { symbol, timeframe, includeTechnicalAnalysis, includeFundamentalAnalysis } = analyzeStockSchema.parse(args);
  const toolCalls: ToolCall[] = [];

  toolCalls.push({
    name: 'get_quote',
    arguments: { symbols: [symbol] }
  });

  if (includeFundamentalAnalysis) {
    toolCalls.push({
      name: 'get_analysis',
      arguments: { symbol }
    });
    toolCalls.push({
      name: 'get_income_statement',
      arguments: { symbol, frequency: 'annual', limit: 4 }
    });
    toolCalls.push({
      name: 'get_balance_sheet',
      arguments: { symbol, frequency: 'annual', limit: 4 }
    });
  }

  if (includeTechnicalAnalysis) {
    toolCalls.push({
      name: 'get_historical_prices',
      arguments: { symbol, range: timeframe, interval: '1d' }
    });
  }

  toolCalls.push({
    name: 'get_earnings',
    arguments: { symbol, limit: 12, includeEstimates: true }
  });

  toolCalls.push({
    name: 'get_news',
    arguments: { symbol, limit: 5 }
  });

  return `Perform a comprehensive stock analysis for ${symbol.toUpperCase()} with the following configuration:

Timeframe: ${timeframe}
Include Technical Analysis: ${includeTechnicalAnalysis}
Include Fundamental Analysis: ${includeFundamentalAnalysis}

## Analysis Steps

Execute the following tools to gather data for analysis:

${toolCalls.map((call, index) => `${index + 1}. **${call.name}**: ${JSON.stringify(call.arguments)}`).join('\n')}

## Analysis Framework

Once data is collected, provide:

### 1. Price Performance Analysis
- Current price and change
- 52-week range position
- Volume analysis vs average
- Price trend over selected timeframe

### 2. Valuation Metrics (if fundamental analysis enabled)
- P/E ratio (current and forward)
- Market capitalization
- Price-to-book ratio
- Enterprise value metrics

### 3. Earnings Quality
- Recent earnings performance
- Earnings surprises and consistency
- Analyst estimates and revisions
- Revenue growth trends

### 4. Financial Health (if fundamental analysis enabled)
- Balance sheet strength
- Cash flow generation
- Debt levels and coverage
- Profitability margins

### 5. Technical Indicators (if technical analysis enabled)
- Support and resistance levels
- Moving averages
- Momentum indicators
- Volume patterns

### 6. Risk Assessment
- Beta and volatility
- Analyst consensus
- Recent news sentiment
- Market and sector risks

### 7. Data Quality Verification
- Completeness score for each data source
- Data freshness indicators
- Any data limitations or warnings
- Cross-source validation notes

### 8. Recommendations
- Overall investment rating (Strong Buy, Buy, Hold, Sell, Strong Sell)
- Key strengths and risks
- Price targets and catalysts
- Suggested entry/exit points
- Investment time horizon

### 9. Actionable Insights
- Top 3 reasons to buy
- Top 3 reasons to avoid
- Key metrics to monitor
- Upcoming catalysts/events

Format the final report with clear sections, data tables where appropriate, and a concise executive summary at the beginning.`;
}

async function compareStocks(args: Record<string, unknown>): Promise<string> {
  const { symbols, metrics, timeframe } = compareStocksSchema.parse(args);
  const toolCalls: ToolCall[] = [];

  toolCalls.push({
    name: 'get_quote',
    arguments: { symbols }
  });

  if (metrics.includes('pe') || metrics.includes('eps') || metrics.includes('marketCap')) {
    toolCalls.push({
      name: 'get_analysis',
      arguments: { symbol: symbols[0] }
    });
  }

  if (metrics.includes('eps')) {
    for (const symbol of symbols) {
      toolCalls.push({
        name: 'get_earnings',
        arguments: { symbol, limit: 4, includeEstimates: true }
      });
    }
  }

  if (timeframe !== '1d') {
    toolCalls.push({
      name: 'get_historical_prices',
      arguments: { symbol: symbols[0], range: timeframe, interval: '1d' }
    });
  }

  return `Perform a multi-stock comparison analysis for the following symbols: ${symbols.map(s => s.toUpperCase()).join(', ')}

Metrics to Compare: ${metrics.join(', ')}
Timeframe: ${timeframe}

## Analysis Steps

Execute the following tools to gather comparison data:

${toolCalls.map((call, index) => `${index + 1}. **${call.name}**: ${JSON.stringify(call.arguments)}`).join('\n')}

## Comparison Framework

Once data is collected, provide:

### 1. Executive Summary
- Overall ranking of stocks
- Best performer in each metric
- Key differentiators
- Investment suitability by profile

### 2. Price & Performance Comparison
- Current price and market cap comparison
- Performance over selected timeframe
- Volatility comparison
- Volume and liquidity analysis

### 3. Valuation Metrics Comparison (if requested)
- P/E ratios table (current, forward, historical)
- PEG ratios
- Price-to-book ratios
- Enterprise value multiples
- Relative valuation scores

### 4. Earnings Quality Comparison (if requested)
- Revenue growth rates
- EPS growth rates
- Earnings surprise consistency
- Analyst estimate revisions
- Earnings quality scores

### 5. Financial Health Comparison
- Profitability margins comparison
- Balance sheet strength ratios
- Cash flow generation
- Debt and leverage metrics
- Financial health scores

### 6. Risk Assessment Comparison
- Beta and volatility rankings
- Sector and concentration risk
- Analyst consensus comparison
- Recent news sentiment analysis

### 7. Normalized Scores
- Create normalized scores (0-100) for each metric
- Overall composite score
- Rankings by category
- Total score calculation

### 8. Data Quality Indicators
- Completeness score per stock
- Data freshness indicators
- Missing data flags
- Cross-validation notes

### 9. Recommendations
- Best overall pick
- Best value pick
- Best growth pick
- Best income/dividend pick
- Best risk-adjusted pick
- Portfolio allocation suggestions

### 10. Comparison Tables
Create comprehensive comparison tables with:
- Raw metrics
- Normalized scores
- Percentile rankings
- Visual indicators (arrows for above/below sector average)

Format the report with clear tables, color-coded indicators where appropriate, and a summary matrix at the beginning for quick comparison.`;
}

async function financialHealthCheck(args: Record<string, unknown>): Promise<string> {
  const { symbol, includeRatios, includeTrends } = financialHealthCheckSchema.parse(args);
  const toolCalls: ToolCall[] = [];

  toolCalls.push({
    name: 'get_income_statement',
    arguments: { symbol, frequency: 'annual', limit: 4 }
  });

  toolCalls.push({
    name: 'get_balance_sheet',
    arguments: { symbol, frequency: 'annual', limit: 4 }
  });

  toolCalls.push({
    name: 'get_cash_flow_statement',
    arguments: { symbol, frequency: 'annual', limit: 4 }
  });

  toolCalls.push({
    name: 'get_analysis',
    arguments: { symbol }
  });

  toolCalls.push({
    name: 'get_quote',
    arguments: { symbols: [symbol] }
  });

  return `Perform a comprehensive financial health assessment for ${symbol.toUpperCase()}

Include Ratios: ${includeRatios}
Include Trends: ${includeTrends}

## Analysis Steps

Execute the following tools to gather financial health data:

${toolCalls.map((call, index) => `${index + 1}. **${call.name}**: ${JSON.stringify(call.arguments)}`).join('\n')}

## Financial Health Framework

Once data is collected, provide:

### 1. Executive Summary
- Overall financial health score (0-100)
- Health rating (Excellent, Good, Fair, Poor, Critical)
- Key strengths and concerns
- Overall risk level

### 2. Liquidity Analysis
- Current ratio trend
- Quick ratio trend
- Cash position and trend
- Working capital adequacy
- Liquidity risk indicators

### 3. Solvency Analysis
- Debt-to-equity ratio
- Debt-to-assets ratio
- Interest coverage ratio
- Debt trends over 4 years
- Solvency risk indicators

### 4. Profitability Analysis
- Gross margin trend
- Operating margin trend
- Net profit margin trend
- ROE and ROA trends
- Profitability quality scores

### 5. Efficiency Analysis
- Asset turnover ratio
- Inventory turnover
- Receivables turnover
- Cash conversion cycle
- Operational efficiency scores

### 6. Cash Flow Health
- Operating cash flow trend
- Free cash flow generation
- Cash flow from investing
- Cash flow from financing
- Cash flow quality assessment

### 7. Financial Ratios (if requested)
#### Liquidity Ratios
- Current ratio
- Quick ratio
- Cash ratio

#### Solvency Ratios
- Debt-to-equity
- Debt-to-assets
- Interest coverage
- Debt service coverage

#### Profitability Ratios
- Gross margin
- Operating margin
- Net margin
- ROE, ROA, ROIC

#### Efficiency Ratios
- Asset turnover
- Inventory turnover
- Receivables turnover

### 8. Trend Analysis (if requested)
- 4-year trend analysis for all key metrics
- Trend direction and momentum
- Trend consistency
- Divergence analysis
- Predictive indicators

### 9. Risk Indicators
- High-risk flags
- Medium-risk flags
- Early warning signs
- Stress test scenarios
- Covenant or compliance risks

### 10. Data Quality Assessment
- Completeness score for each statement
- Data freshness indicators
- Missing data analysis
- Cross-statement validation
- Data reliability score

### 11. Benchmarking
- Industry comparison where possible
- Peer group averages
- Relative performance
- Sector positioning

### 12. Recommendations
- Immediate actions needed
- Areas for improvement
- Strengths to leverage
- Monitoring priorities
- Timeline for reassessment

Format the report with:
- Health score gauge at top
- Color-coded risk indicators (red/yellow/green)
- Trend arrows for 4-year history
- Benchmark comparison tables
- Actionable recommendations with priorities`;
}

async function earningsAnalysis(args: Record<string, unknown>): Promise<string> {
  const { symbol, periods, includeEstimates } = earningsAnalysisSchema.parse(args);
  const toolCalls: ToolCall[] = [];

  toolCalls.push({
    name: 'get_earnings',
    arguments: { symbol, limit: periods, includeEstimates }
  });

  toolCalls.push({
    name: 'get_analysis',
    arguments: { symbol }
  });

  toolCalls.push({
    name: 'get_income_statement',
    arguments: { symbol, frequency: 'quarterly', limit: 4 }
  });

  toolCalls.push({
    name: 'get_quote',
    arguments: { symbols: [symbol] }
  });

  return `Perform a comprehensive earnings analysis for ${symbol.toUpperCase()}

Analysis Periods: ${periods}
Include Estimates: ${includeEstimates}

## Analysis Steps

Execute the following tools to gather earnings data:

${toolCalls.map((call, index) => `${index + 1}. **${call.name}**: ${JSON.stringify(call.arguments)}`).join('\n')}

## Earnings Analysis Framework

Once data is collected, provide:

### 1. Executive Summary
- Earnings quality score (0-100)
- Earnings trend direction
- Surprise consistency rating
- Overall earnings health

### 2. Historical Earnings Performance
- Last ${periods} quarters of earnings
- Actual vs estimates comparison
- Surprise percentages and directions
- Earnings consistency analysis

### 3. Surprise Tracking
- Beat/miss frequency
- Average surprise percentage
- Surprise trend over time
- Consistency vs volatility
- Seasonality patterns

### 4. Earnings Growth Trends
- Year-over-year growth rates
- Quarter-over-quarter growth
- Sequential momentum
- Growth acceleration/deceleration
- Growth sustainability assessment

### 5. Revenue and Margin Analysis
- Revenue growth trends
- Margin expansion/contraction
- Operating leverage analysis
- Quality of earnings growth
- Revenue vs EPS divergence

### 6. Analyst Estimates (if requested)
- Current quarter estimates
- Forward-looking estimates
- Estimate revision trends
- Analyst consensus
- Estimate accuracy history

### 7. Earnings Quality Assessment
- Cash flow to earnings ratio
- Non-recurring items impact
- Accounting quality flags
- Earnings manipulation indicators
- Sustainable earnings base

### 8. Earnings Timing and Impact
- Announcement timing (before/during/after market)
- Post-earnings price reaction
- Earnings call sentiment
- Guidance and outlook changes
- Management commentary analysis

### 9. Competitive Earnings Comparison
- Industry average growth
- Peer group comparison
- Relative performance
- Market share implications
- Competitive positioning

### 10. Data Quality Indicators
- Earnings data completeness
- Estimate data availability
- Data freshness
- Missing data analysis
- Reliability assessment

### 11. Forward-Looking Indicators
- Next earnings date and expectations
- Guidance provided
- Analyst projections
- Industry outlook
- Potential catalysts

### 12. Recommendations
- Earnings quality rating
- Investment implications
- Key metrics to monitor
- Risk factors
- Timeline for next earnings

Format the report with:
- Earnings timeline visualization
- Surprise bar chart
- Growth trend lines
- Quality indicators
- Analyst consensus visualization
- Clear executive summary with key takeaways`;
}

async function marketOverview(args: Record<string, unknown>): Promise<string> {
  const { region, sectors, includeTrending } = marketOverviewSchema.parse(args);
  const toolCalls: ToolCall[] = [];

  toolCalls.push({
    name: 'get_quote',
    arguments: {
      symbols: ['^GSPC', '^DJI', '^IXIC', '^RUT', 'VIX']
    }
  });

  if (includeTrending) {
    toolCalls.push({
      name: 'get_trending',
      arguments: { region: region.toLowerCase() }
    });
  }

  if (sectors.length > 0) {
    const sectorETFs = {
      'Technology': 'XLK',
      'Financials': 'XLF',
      'Healthcare': 'XLV',
      'Consumer Discretionary': 'XLY',
      'Consumer Staples': 'XLP',
      'Energy': 'XLE',
      'Utilities': 'XLU',
      'Real Estate': 'XLRE',
      'Materials': 'XLB',
      'Industrials': 'XLI',
      'Communication': 'XLC'
    };

    for (const sector of sectors) {
      const etf = sectorETFs[sector as keyof typeof sectorETFs];
      if (etf) {
        toolCalls.push({
          name: 'get_quote',
          arguments: { symbols: [etf] }
        });
        toolCalls.push({
          name: 'get_historical_prices',
          arguments: { symbol: etf, range: '1mo', interval: '1d' }
        });
      }
    }
  }

  return `Perform a comprehensive market overview for ${region} region

Region: ${region}
Sectors: ${sectors.length > 0 ? sectors.join(', ') : 'All'}
Include Trending: ${includeTrending}

## Analysis Steps

Execute the following tools to gather market data:

${toolCalls.map((call, index) => `${index + 1}. **${call.name}**: ${JSON.stringify(call.arguments)}`).join('\n')}

## Market Overview Framework

Once data is collected, provide:

### 1. Executive Summary
- Overall market sentiment (Bullish/Bearish/Neutral)
- Key market indices performance
- Volatility level (VIX)
- Market momentum
- Key takeaways

### 2. Major Indices Performance
- S&P 500 (^GSPC) analysis
- Dow Jones (^DJI) analysis
- NASDAQ (^IXIC) analysis
- Russell 2000 (^RUT) analysis
- Relative performance comparison

### 3. Market Volatility
- VIX current level and trend
- Volatility regime assessment
- Implied vs historical volatility
- Volatility skew analysis
- Risk-on/risk-off indicators

### 4. Market Breadth
- Advance/decline analysis
- New highs/new lows
- Volume patterns
- Breadth momentum
- Market internals

### 5. Sector Analysis ${sectors.length > 0 ? '(Requested Sectors)' : '(All Major Sectors)'}
- Sector performance ranking
- Sector leadership analysis
- Sector rotation patterns
- Relative strength analysis
- Sector momentum indicators

### 6. Trending Analysis (if requested)
- Top trending stocks
- Most active stocks
- Biggest gainers/losers
- Unusual volume activity
- News-driven movers

### 7. Technical Market Indicators
- Market support/resistance levels
- Moving averages
- Trend indicators
- Momentum oscillators
- Market cycle position

### 8. Economic Indicators Context
- Interest rate environment
- Inflation indicators
- GDP growth outlook
- Employment data
- Central bank policy impact

### 9. Data Quality Indicators
- Market data completeness
- Real-time vs delayed data
- Data freshness scores
- Missing data flags
- Reliability assessment

### 10. Risk Assessment
- Market-wide risk level
- Systemic risk indicators
- Correlation risk
- Liquidity conditions
- Potential market shocks

### 11. Investment Implications
- Market allocation recommendations
- Sector rotation suggestions
- Risk management strategies
- Timing considerations
- Position sizing guidance

### 12. Forward-Looking Indicators
- Upcoming economic events
- Earnings calendar impact
- Seasonal patterns
- Technical levels to watch
- Potential catalysts

Format the report with:
- Market dashboard at top with key metrics
- Heat map for sector performance
- Trending table with movers
- Visual indicators (green/red for positive/negative)
- Clear actionable insights`;
}

async function portfolioDueDiligence(args: Record<string, unknown>): Promise<string> {
  const { symbols, includeRiskAnalysis, includeValuation } = portfolioDueDiligenceSchema.parse(args);
  const toolCalls: ToolCall[] = [];

  toolCalls.push({
    name: 'get_quote',
    arguments: { symbols }
  });

  if (includeRiskAnalysis) {
    toolCalls.push({
      name: 'get_analysis',
      arguments: { symbol: symbols[0] }
    });
    toolCalls.push({
      name: 'get_historical_prices',
      arguments: { symbol: symbols[0], range: '1y', interval: '1d' }
    });
  }

  if (includeValuation) {
    for (const symbol of symbols) {
      toolCalls.push({
        name: 'get_income_statement',
        arguments: { symbol, frequency: 'annual', limit: 2 }
      });
      toolCalls.push({
        name: 'get_balance_sheet',
        arguments: { symbol, frequency: 'annual', limit: 2 }
      });
      toolCalls.push({
        name: 'get_earnings',
        arguments: { symbol, limit: 4, includeEstimates: true }
      });
    }
  }

  for (const symbol of symbols) {
    toolCalls.push({
      name: 'get_news',
      arguments: { symbol, limit: 3 }
    });
  }

  return `Perform comprehensive due diligence for portfolio positions: ${symbols.map(s => s.toUpperCase()).join(', ')}

Include Risk Analysis: ${includeRiskAnalysis}
Include Valuation: ${includeValuation}

## Analysis Steps

Execute the following tools to gather due diligence data:

${toolCalls.map((call, index) => `${index + 1}. **${call.name}**: ${JSON.stringify(call.arguments)}`).join('\n')}

## Portfolio Due Diligence Framework

Once data is collected, provide:

### 1. Executive Summary
- Overall portfolio health score (0-100)
- Portfolio risk rating
- Valuation assessment
- Key strengths and concerns
- Top 3 priorities

### 2. Portfolio Overview
- Number of positions
- Total market value (estimated)
- Sector allocation summary
- Geographic exposure
- Concentration analysis

### 3. Position-Level Analysis (for each symbol)

#### ${symbols[0].toUpperCase()} - Detailed Analysis
- Company overview and business model
- Current price and performance
- Market capitalization
- Trading volume and liquidity

#### Risk Analysis (if requested)
- Beta and volatility
- Historical drawdowns
- Correlation with portfolio
- Specific company risks
- Systemic risk exposure

#### Valuation Analysis (if requested)
- P/E, PEG ratios
- Discounted cash flow assessment
- Relative valuation vs peers
- Margin of safety
- Fair value range

#### Financial Health
- Revenue and earnings trends
- Balance sheet strength
- Cash flow generation
- Debt levels
- Profitability metrics

#### Recent Developments
- Recent news and catalysts
- Analyst recommendations
- Upcoming events
- Insider activity
- Major announcements

*(Repeat position-level analysis for each symbol)*

### 4. Portfolio Risk Assessment (if requested)
- Portfolio beta and volatility
- Value at Risk (VaR) estimate
- Maximum drawdown analysis
- Correlation matrix
- Concentration risk
- Diversification score

### 5. Portfolio Valuation Assessment (if requested)
- Weighted average P/E
- Portfolio PEG ratio
- Overall valuation level
- Expensive vs cheap positions
- Portfolio fair value estimate

### 6. Portfolio Performance
- Performance metrics (if historical data available)
- Risk-adjusted returns
- Alpha and beta vs benchmark
- Sharpe ratio
- Tracking error

### 7. Sector and Factor Exposure
- Sector breakdown with percentages
- Style factor exposures (value/growth, size)
- Geographic exposure
- Industry concentration
- Factor tilts

### 8. Data Quality Audit
- Completeness score per position
- Data freshness indicators
- Missing data analysis
- Data reliability scores
- Cross-validation results

### 9. Red Flags and Warning Signs
- Financial red flags
- Governance concerns
- Accounting irregularities
- Liquidity concerns
- Regulatory issues
- Competitive threats

### 10. Catalysts and Opportunities
- Upcoming catalysts
- Growth opportunities
- M&A possibilities
- New product launches
- Market expansion potential

### 11. Due Diligence Recommendations
- Position-specific recommendations
- Portfolio rebalancing suggestions
- Risk mitigation strategies
- Actions to take immediately
- Actions to monitor

### 12. Ongoing Monitoring Checklist
- Key metrics to track
- Red flags to watch
- Quarterly review items
- Trigger points for action
- Rebalancing schedule

Format the report with:
- Portfolio dashboard at top
- Position summary table
- Risk heat map
- Valuation comparison matrix
- Clear action items with priorities
- Monitoring calendar`;
}

export const financialPrompts: FinancialPrompt[] = [
  {
    name: 'analyze_stock',
    description: 'Comprehensive stock analysis with multi-source verification, combining technical, fundamental, and sentiment analysis',
    arguments: {
      symbol: { type: 'string', description: 'Stock ticker symbol (e.g., AAPL, MSFT)' },
      timeframe: { type: 'string', description: 'Analysis timeframe (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max)' },
      includeTechnicalAnalysis: { type: 'boolean', description: 'Include technical analysis indicators' },
      includeFundamentalAnalysis: { type: 'boolean', description: 'Include fundamental analysis metrics' }
    },
    prompt: analyzeStock
  },
  {
    name: 'compare_stocks',
    description: 'Multi-stock comparison with normalized metrics and ranking system for investment decision support',
    arguments: {
      symbols: { type: 'array', description: 'Array of stock ticker symbols to compare (2-10 symbols)' },
      metrics: { type: 'array', description: 'Metrics to compare: price, pe, eps, marketCap, dividendYield, beta, volume, change' },
      timeframe: { type: 'string', description: 'Performance comparison timeframe (1d, 5d, 1mo, 3mo, 6mo, 1y)' }
    },
    prompt: compareStocks
  },
  {
    name: 'financial_health_check',
    description: 'Comprehensive financial health assessment with risk indicators and trend analysis',
    arguments: {
      symbol: { type: 'string', description: 'Stock ticker symbol (e.g., AAPL, MSFT)' },
      includeRatios: { type: 'boolean', description: 'Include detailed financial ratios calculation' },
      includeTrends: { type: 'boolean', description: 'Include 4-year trend analysis' }
    },
    prompt: financialHealthCheck
  },
  {
    name: 'earnings_analysis',
    description: 'Detailed earnings trend analysis with surprise tracking and quality assessment',
    arguments: {
      symbol: { type: 'string', description: 'Stock ticker symbol (e.g., AAPL, MSFT)' },
      periods: { type: 'number', description: 'Number of historical quarters to analyze (1-20)' },
      includeEstimates: { type: 'boolean', description: 'Include analyst estimates and revisions' }
    },
    prompt: earningsAnalysis
  },
  {
    name: 'market_overview',
    description: 'Market overview with major indices, sector performance, and data quality indicators',
    arguments: {
      region: { type: 'string', description: 'Market region (US, EU, ASIA, GLOBAL)' },
      sectors: { type: 'array', description: 'Specific sectors to analyze (optional)' },
      includeTrending: { type: 'boolean', description: 'Include trending stocks analysis' }
    },
    prompt: marketOverview
  },
  {
    name: 'portfolio_due_diligence',
    description: 'Comprehensive due diligence report with data completeness audit for portfolio positions',
    arguments: {
      symbols: { type: 'array', description: 'Array of portfolio stock symbols (1-20 symbols)' },
      includeRiskAnalysis: { type: 'boolean', description: 'Include risk analysis and correlation' },
      includeValuation: { type: 'boolean', description: 'Include valuation assessment' }
    },
    prompt: portfolioDueDiligence
  }
];

export function getFinancialPrompt(name: string): FinancialPrompt | undefined {
  return financialPrompts.find(prompt => prompt.name === name);
}

export function listFinancialPrompts(): FinancialPrompt[] {
  return financialPrompts;
}
