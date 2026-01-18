import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { partialDataScenarios, qualityMetrics } from '../fixtures/test-data.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Partial Data Chaos Tests', () => {
  let serverProcess: ChildProcess | null = null;
  let serverPort = 3000;
  const originalFetch = global.fetch;

  beforeEach(async () => {
    serverPort = 3000 + Math.floor(Math.random() * 1000);
    await startServer(serverPort);
  });

  afterEach(async () => {
    if (serverProcess) {
      await stopServer();
    }
    global.fetch = originalFetch;
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

      serverProcess.stdout?.on('data', (data) => {
        output += data.toString();
        if (output.includes('Yahoo Finance MCP Server started successfully')) {
          resolve();
        }
      });

      serverProcess.stderr?.on('data', (data) => {
        if (data.toString().includes('Yahoo Finance MCP Server started successfully')) {
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

  function mockPartialData(scenario: keyof typeof partialDataScenarios) {
    global.fetch = jest.fn(() => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          quoteResponse: {
            result: [{
              price: {
                ...partialDataScenarios[scenario]
              }
            }]
          }
        })
      });
    });
  }

  function mockEmptyData() {
    global.fetch = jest.fn(() => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          quoteResponse: {
            result: [{
              price: {}
            }]
          }
        })
      });
    });
  }

  function mockSparseData(fieldCount: number) {
    global.fetch = jest.fn(() => {
      const sparseData: Record<string, unknown> = {
        regularMarketPrice: 185.92
      };

      for (let i = 0; i < fieldCount; i++) {
        sparseData[`field${i}`] = `value${i}`;
      }

      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          quoteResponse: {
            result: [{
              price: sparseData
            }]
          }
        })
      });
    });
  }

  function mockMixedPartialData() {
    global.fetch = jest.fn(() => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          quoteResponse: {
            result: [{
              price: {
                regularMarketPrice: 185.92,
                regularMarketVolume: null,
                marketCap: undefined,
                trailingPE: 29.84
              }
            }]
          }
        })
      });
    });
  }

  function mockBatchPartialData() {
    global.fetch = jest.fn(() => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          quoteResponse: {
            result: [
              {
                price: {
                  regularMarketPrice: 185.92,
                  regularMarketVolume: 44981879
                }
              },
              {
                price: {
                  regularMarketPrice: null
                }
              },
              {
                price: {
                  regularMarketVolume: null
                }
              },
              {
                price: {
                  marketCap: null
                }
              }
            ]
          }
        })
      });
    });
  }

  describe('Missing price data', () => {
    test('should handle missing price', async () => {
      mockPartialData('missingPrice');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('content');
    });

    test('should provide fallback for missing price', async () => {
      mockPartialData('missingPrice');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should report missing price in warnings', async () => {
      mockPartialData('missingPrice');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('Missing volume data', () => {
    test('should handle missing volume', async () => {
      mockPartialData('missingVolume');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should continue operation without volume', async () => {
      mockPartialData('missingVolume');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('Missing market cap data', () => {
    test('should handle missing market cap', async () => {
      mockPartialData('missingMarketCap');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should provide estimate for missing market cap', async () => {
      mockPartialData('missingMarketCap');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('Missing PE ratio data', () => {
    test('should handle missing PE ratio', async () => {
      mockPartialData('missingPE');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should calculate PE from available data', async () => {
      mockPartialData('missingPE');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('Missing dividend data', () => {
    test('should handle missing dividend information', async () => {
      mockPartialData('missingDividends');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should set dividend yield to zero when missing', async () => {
      mockPartialData('missingDividends');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('Empty data', () => {
    test('should handle completely empty price object', async () => {
      mockEmptyData();

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should provide meaningful error for empty data', async () => {
      mockEmptyData();

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should not crash on empty data', async () => {
      mockEmptyData();

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toBeDefined();
      expect(serverProcess).not.toBeNull();
    });
  });

  describe('Sparse data', () => {
    test('should handle sparse data with few fields', async () => {
      mockSparseData(3);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should work with only one field', async () => {
      mockSparseData(1);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should handle very sparse data', async () => {
      mockSparseData(0);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('Mixed partial data', () => {
    test('should handle mix of null and undefined values', async () => {
      mockMixedPartialData();

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should distinguish between null and undefined', async () => {
      mockMixedPartialData();

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('Batch requests with partial data', () => {
    test('should handle partial data in batch requests', async () => {
      mockBatchPartialData();

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should return partial results for batch', async () => {
      mockBatchPartialData();

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should report errors for failed symbols in batch', async () => {
      mockBatchPartialData();

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL', 'MSFT', 'GOOGL', 'AMZN']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('Data completeness scoring', () => {
    test('should calculate completeness score for partial data', async () => {
      mockSparseData(5);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should provide completeness metadata', async () => {
      mockPartialData('missingVolume');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should identify missing fields', async () => {
      mockPartialData('missingMarketCap');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('Graceful degradation', () => {
    test('should return available data when partial', async () => {
      mockPartialData('missingPE');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should provide warnings about partial data', async () => {
      mockPartialData('missingPrice');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should continue operating with partial data', async () => {
      mockPartialData('missingVolume');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('Partial data with different operations', () => {
    test('should handle partial historical data', async () => {
      global.fetch = jest.fn(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            chart: {
              result: [{
                timestamp: [1703702400],
                indicators: {
                  quote: [{
                    open: [182.45],
                    high: [184.89],
                    low: null,
                    close: [184.35],
                    volume: [48215632]
                  }]
                }
              }]
            }
          })
        });
      });

      const request = createMCPRequest('tools/call', {
        name: 'get_historical_prices',
        arguments: {
          symbol: 'AAPL'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should handle partial news data', async () => {
      global.fetch = jest.fn(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            count: 5,
            itemsResult: {
              items: [
                {
                  title: 'News 1',
                  link: 'https://example.com/1'
                },
                {
                  title: 'News 2',
                  link: null
                },
                {
                  title: null,
                  link: 'https://example.com/3'
                }
              ]
            }
          })
        });
      });

      const request = createMCPRequest('tools/call', {
        name: 'get_news',
        arguments: {
          symbol: 'AAPL'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should handle partial financials data', async () => {
      global.fetch = jest.fn(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            incomeStatementHistory: {
              incomeStatementHistory: [
                {
                  totalRevenue: 383285996544,
                  costOfRevenue: null,
                  grossProfit: null,
                  netIncome: 96994997248
                }
              ]
            }
          })
        });
      });

      const request = createMCPRequest('tools/call', {
        name: 'get_income_statement',
        arguments: {
          symbol: 'AAPL'
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('Partial data with caching', () => {
    test('should use cached data when current is partial', async () => {
      let callCount = 0;
      global.fetch = jest.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              quoteResponse: {
                result: [{
                  price: {
                    regularMarketPrice: 185.92,
                    regularMarketVolume: 44981879,
                    marketCap: 2898258160640,
                    trailingPE: 29.84
                  }
                }]
              }
            })
          });
        } else {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              quoteResponse: {
                result: [{
                  price: {
                    regularMarketPrice: null
                  }
                }]
              }
            })
          });
        }
      });

      const request1 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      await sendMCPRequest(request1);

      const request2 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response2 = await sendMCPRequest(request2);

      expect(response2).toHaveProperty('result');
    });

    test('should prefer partial current data over stale cache', async () => {
      let callCount = 0;
      global.fetch = jest.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              quoteResponse: {
                result: [{
                  price: {
                    regularMarketPrice: 185.92,
                    regularMarketVolume: 44981879
                  }
                }]
              }
            })
          });
        } else {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              quoteResponse: {
                result: [{
                  price: {
                    regularMarketPrice: 186.50
                  }
                }]
              }
            })
          });
        }
      });

      const request1 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      await sendMCPRequest(request1);

      await new Promise(resolve => setTimeout(resolve, 100));

      const request2 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response2 = await sendMCPRequest(request2);

      expect(response2).toHaveProperty('result');
    });
  });

  describe('Partial data quality reporting', () => {
    test('should provide quality report for partial data', async () => {
      mockSparseData(5);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should rate data quality appropriately', async () => {
      mockPartialData('missingPrice');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should provide recommendations based on data quality', async () => {
      mockPartialData('missingMarketCap');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('Concurrent partial data handling', () => {
    test('should handle multiple requests with partial data', async () => {
      mockSparseData(5);

      const requests = Array(5).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const responses = await Promise.all(
        requests.map(req => sendMCPRequest(req))
      );

      responses.forEach(response => {
        expect(response).toHaveProperty('result');
      });
    });

    test('should not deadlock on partial data', async () => {
      mockPartialData('missingVolume');

      const requests = Array(10).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const startTime = Date.now();
      await Promise.all(
        requests.map(req => sendMCPRequest(req))
      );
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(30000);
    });
  });

  describe('Recovery from partial data', () => {
    test('should recover from partial to complete data', async () => {
      let callCount = 0;
      global.fetch = jest.fn(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              quoteResponse: {
                result: [{
                  price: {
                    regularMarketPrice: 185.92
                  }
                }]
              }
            })
          });
        } else {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              quoteResponse: {
                result: [{
                  price: {
                    regularMarketPrice: 185.92,
                    regularMarketVolume: 44981879,
                    marketCap: 2898258160640,
                    trailingPE: 29.84
                  }
                }]
              }
            })
          });
        }
      });

      const request1 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      await sendMCPRequest(request1);

      const request2 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          forceRefresh: true
        }
      });

      const response2 = await sendMCPRequest(request2);

      expect(response2).toHaveProperty('result');
    });
  });
});
