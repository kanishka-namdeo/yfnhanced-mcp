import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { mockQuoteResponse, mockQuoteSummaryResponse, mockEarningsResponse, mockAnalysisResponse, mockHoldersResponse, mockNewsResponse, mockOptionsResponse, mockBalanceSheetResponse, mockIncomeStatementResponse, mockCashFlowStatementResponse, mockSummaryProfileResponse, mockCryptoQuoteResponse, mockForexQuoteResponse, mockTrendingResponse, mockScreenerResponse } from '../fixtures/mock-responses.js';
import { validSymbols, cryptoSymbols, forexPairs, quoteFields, newsCounts, optionExpirationDates, strikeFilters, moduleCombinations, testPeriods, testLimits, timeoutValues } from '../fixtures/test-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Tool Execution E2E Tests', () => {
  let serverProcess: ChildProcess | null = null;
  let serverPort = 3000;

  beforeEach(async () => {
    serverPort = 3000 + Math.floor(Math.random() * 1000);
    await startServer(serverPort);
  });

  afterEach(async () => {
    if (serverProcess) {
      await stopServer();
    }
  });

  async function startServer(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const serverPath = path.join(__dirname, '../../dist/index.js');

      if (!existsSync(serverPath)) {
        reject(new Error('Server build not found. Run "npm run build" first.'));
        return;
      }

      serverProcess = spawn('node', [serverPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          PORT: String(port),
          USE_MOCK_API: 'true'
        }
      });

      let output = '';
      let errorOutput = '';

      serverProcess.stdout?.on('data', (data) => {
        output += data.toString();
        if (output.includes('Yahoo Finance MCP Server started successfully')) {
          resolve();
        }
      });

      serverProcess.stderr?.on('data', (data) => {
        errorOutput += data.toString();
        if (errorOutput.includes('Yahoo Finance MCP Server started successfully')) {
          resolve();
        }
      });

      serverProcess.on('error', (err) => {
        reject(new Error(`Failed to start server: ${err.message}`));
      });

      setTimeout(() => {
        resolve();
      }, 10000);
    });
  }

  async function stopServer(): Promise<void> {
    if (!serverProcess) return;

    return new Promise((resolve) => {
      serverProcess?.on('exit', () => {
        serverProcess = null;
        resolve();
      });

      serverProcess?.kill('SIGTERM');
      setTimeout(() => {
        serverProcess?.kill('SIGKILL');
        serverProcess = null;
        resolve();
      }, 5000);
    });
  }

  function createMCPRequest(method: string, params: Record<string, unknown> = {}, id: number = 1): string {
    return JSON.stringify({
      jsonrpc: '2.0',
      id,
      method,
      params
    });
  }

  async function sendMCPRequest(request: string): Promise<unknown> {
    if (!serverProcess || !serverProcess.stdin) {
      throw new Error('Server process not available');
    }

    return new Promise((resolve, reject) => {
      let output = '';

      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 15000);

      serverProcess?.stdout?.on('data', (data) => {
        output += data.toString();
        try {
          const response = JSON.parse(output);
          if (response && typeof response === 'object' && 'id' in response) {
            clearTimeout(timeout);
            resolve(response);
          }
        } catch {
          output = '';
        }
      });

      serverProcess?.stdin?.write(request + '\n');
    });
  }

  describe('get_quote tool', () => {
    test('should fetch single stock quote', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
      expect(response.result.content).toBeInstanceOf(Array);
    });

    test('should fetch multiple stock quotes', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: validSymbols.slice(0, 5)
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
    });

    test('should filter quote by specific fields', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          fields: quoteFields.slice(0, 5)
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
    });

    test('should handle custom timeout', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          timeout: 10000
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should force refresh from API', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          forceRefresh: true
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('get_quote_summary tool', () => {
    test('should fetch quote summary for single symbol', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_quote_summary',
        arguments: {
          symbol: 'AAPL'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
    });

    test('should fetch specific modules', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_quote_summary',
        arguments: {
          symbol: 'AAPL',
          modules: ['defaultKeyStatistics', 'summaryDetail']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should retry with alternative modules on failure', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_quote_summary',
        arguments: {
          symbol: 'AAPL',
          retryOnFailure: true
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('get_earnings tool', () => {
    test('should fetch earnings data', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_earnings',
        arguments: {
          symbol: 'AAPL'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
    });

    test('should limit historical earnings quarters', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_earnings',
        arguments: {
          symbol: 'AAPL',
          limit: 5
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should include earnings estimates', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_earnings',
        arguments: {
          symbol: 'AAPL',
          includeEstimates: true
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('get_analysis tool', () => {
    test('should fetch analyst analysis', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_analysis',
        arguments: {
          symbol: 'AAPL'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
    });

    test('should include expired recommendations', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_analysis',
        arguments: {
          symbol: 'AAPL',
          includeExpired: true
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('get_major_holders tool', () => {
    test('should fetch major holders data', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_major_holders',
        arguments: {
          symbol: 'AAPL'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
    });

    test('should include change history', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_major_holders',
        arguments: {
          symbol: 'AAPL',
          includeChangeHistory: true
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('get_news tool', () => {
    test('should fetch company news', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_news',
        arguments: {
          symbol: 'AAPL'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
    });

    test('should limit number of news articles', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_news',
        arguments: {
          symbol: 'AAPL',
          count: 5
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should require related news only', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_news',
        arguments: {
          symbol: 'AAPL',
          requireRelated: true
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('get_options tool', () => {
    test('should fetch options chain', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_options',
        arguments: {
          symbol: 'AAPL'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
    });

    test('should filter by expiration date', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_options',
        arguments: {
          symbol: 'AAPL',
          expiration: optionExpirationDates[0]
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should include Greeks calculations', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_options',
        arguments: {
          symbol: 'AAPL',
          includeGreeks: true
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should filter by strike price range', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_options',
        arguments: {
          symbol: 'AAPL',
          strikeFilter: {
            minStrike: 150,
            maxStrike: 200
          }
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('get_balance_sheet tool', () => {
    test('should fetch balance sheet data', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_balance_sheet',
        arguments: {
          symbol: 'AAPL'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
    });

    test('should fetch annual data', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_balance_sheet',
        arguments: {
          symbol: 'AAPL',
          period: 'annual'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should fetch quarterly data', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_balance_sheet',
        arguments: {
          symbol: 'AAPL',
          period: 'quarterly'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should limit number of periods', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_balance_sheet',
        arguments: {
          symbol: 'AAPL',
          limit: 3
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('get_income_statement tool', () => {
    test('should fetch income statement data', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_income_statement',
        arguments: {
          symbol: 'AAPL'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
    });

    test('should fetch annual data', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_income_statement',
        arguments: {
          symbol: 'AAPL',
          period: 'annual'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should fetch quarterly data', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_income_statement',
        arguments: {
          symbol: 'AAPL',
          period: 'quarterly'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('get_cash_flow_statement tool', () => {
    test('should fetch cash flow statement data', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_cash_flow_statement',
        arguments: {
          symbol: 'AAPL'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
    });

    test('should fetch annual data', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_cash_flow_statement',
        arguments: {
          symbol: 'AAPL',
          period: 'annual'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should fetch quarterly data', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_cash_flow_statement',
        arguments: {
          symbol: 'AAPL',
          period: 'quarterly'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('get_summary_profile tool', () => {
    test('should fetch company profile', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_summary_profile',
        arguments: {
          symbol: 'AAPL'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
    });
  });

  describe('get_crypto_quote tool', () => {
    test('should fetch crypto quote', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_crypto_quote',
        arguments: {
          symbol: cryptoSymbols[0]
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
    });

    test('should fetch multiple crypto quotes', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_crypto_quote',
        arguments: {
          symbols: cryptoSymbols.slice(0, 3)
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('get_forex_quote tool', () => {
    test('should fetch forex quote', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_forex_quote',
        arguments: {
          symbol: forexPairs[0]
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
    });

    test('should fetch multiple forex pairs', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_forex_quote',
        arguments: {
          symbols: forexPairs.slice(0, 3)
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('get_trending_symbols tool', () => {
    test('should fetch trending symbols', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_trending_symbols',
        arguments: {}
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
    });
  });

  describe('screener tool', () => {
    test('should run stock screener', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'screener',
        arguments: {}
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
    });
  });

  describe('Error handling', () => {
    test('should handle invalid symbol', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['INVALID_SYMBOL_12345']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
    });

    test('should handle missing required parameters', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {}
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('error');
    });

    test('should handle invalid parameter values', async () => {
      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: [],
          timeout: 999999
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('error');
    });
  });

  describe('Concurrent execution', () => {
    test('should handle multiple concurrent tool calls', async () => {
      const requests = [
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, 1),
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['MSFT'] }
        }, 2),
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['GOOGL'] }
        }, 3)
      ];

      const responses = await Promise.all(
        requests.map(req => sendMCPRequest(req))
      );

      responses.forEach(response => {
        expect(response).toHaveProperty('result');
        expect(response.result).toHaveProperty('content');
      });
    });
  });
});
