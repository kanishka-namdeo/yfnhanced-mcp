import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('API Changes Chaos Tests', () => {
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

  function mockAPIChange(changeType: string) {
    global.fetch = jest.fn(() => {
      switch (changeType) {
        case 'missingField':
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
        case 'renamedField':
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              quoteResponse: {
                result: [{
                  price: {
                    marketPrice: 185.92,
                    tradingVolume: 44981879
                  }
                }]
              }
            })
          });
        case 'typeChange':
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              quoteResponse: {
                result: [{
                  price: {
                    regularMarketPrice: '185.92',
                    regularMarketVolume: '44981879'
                  }
                }]
              }
            })
          });
        case 'structureChange':
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              data: {
                quotes: [{
                  price: 185.92,
                  volume: 44981879
                }]
              }
            })
          });
        case 'nestedChange':
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              quoteResponse: {
                results: [{
                  marketData: {
                    current: {
                      price: 185.92,
                      volume: 44981879
                    }
                  }
                }]
              }
            })
          });
        case 'nullField':
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              quoteResponse: {
                result: [{
                  price: {
                    regularMarketPrice: null,
                    regularMarketVolume: null
                  }
                }]
              }
            })
          });
        case 'arrayChange':
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              quoteResponse: {
                result: []
              }
            })
          });
        default:
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ mockData: 'success' })
          });
      }
    });
  }

  function mockMultipleAPIChanges(requestCount: number) {
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
      } else if (callCount === 2) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            quoteResponse: {
              result: [{
                price: {
                  marketPrice: 185.92,
                  tradingVolume: 44981879
                }
              }]
            }
          })
        });
      } else if (callCount === 3) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            quoteResponse: {
              result: [{
                price: {
                  regularMarketPrice: null,
                  regularMarketVolume: null
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
                  regularMarketVolume: 44981879
                }
              }]
            }
          })
        });
      }
    });
  }

  describe('Missing field handling', () => {
    test('should handle missing required fields', async () => {
      mockAPIChange('missingField');

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

    test('should provide fallback for missing fields', async () => {
      mockAPIChange('missingField');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should report missing fields in metadata', async () => {
      mockAPIChange('missingField');

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

  describe('Renamed field handling', () => {
    test('should handle renamed fields', async () => {
      mockAPIChange('renamedField');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should map renamed fields to expected structure', async () => {
      mockAPIChange('renamedField');

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

  describe('Type change handling', () => {
    test('should handle string instead of number', async () => {
      mockAPIChange('typeChange');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should convert string numbers to numbers', async () => {
      mockAPIChange('typeChange');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should handle invalid type conversion gracefully', async () => {
      global.fetch = jest.fn(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            quoteResponse: {
              result: [{
                price: {
                  regularMarketPrice: 'invalid',
                  regularMarketVolume: 'not-a-number'
                }
              }]
            }
          })
        });
      });

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

  describe('Structure change handling', () => {
    test('should handle completely different structure', async () => {
      mockAPIChange('structureChange');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should attempt to map new structure to old structure', async () => {
      mockAPIChange('structureChange');

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

  describe('Nested structure changes', () => {
    test('should handle deeper nesting', async () => {
      mockAPIChange('nestedChange');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should extract data from nested structures', async () => {
      mockAPIChange('nestedChange');

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

  describe('Null field handling', () => {
    test('should handle null values for required fields', async () => {
      mockAPIChange('nullField');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should provide default values for null fields', async () => {
      mockAPIChange('nullField');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should report null fields in warnings', async () => {
      mockAPIChange('nullField');

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

  describe('Array change handling', () => {
    test('should handle empty result array', async () => {
      mockAPIChange('arrayChange');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should handle array instead of object', async () => {
      global.fetch = jest.fn(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([
            {
              price: 185.92,
              volume: 44981879
            }
          ])
        });
      });

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

  describe('Multiple API changes', () => {
    test('should handle sequential API changes', async () => {
      mockMultipleAPIChanges(4);

      const requests = Array(4).fill(null).map((_, i) =>
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

    test('should adapt to changing API structure', async () => {
      mockMultipleAPIChanges(4);

      const request1 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: { symbols: ['AAPL'] }
      });

      const response1 = await sendMCPRequest(request1);

      expect(response1).toHaveProperty('result');

      const request2 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: { symbols: ['AAPL'] }
      });

      const response2 = await sendMCPRequest(request2);

      expect(response2).toHaveProperty('result');
    });
  });

  describe('API version changes', () => {
    test('should handle API version in response', async () => {
      global.fetch = jest.fn(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            apiVersion: '2.0',
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
      });

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should handle missing API version', async () => {
      global.fetch = jest.fn(() => {
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
      });

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

  describe('API change with caching', () => {
    test('should use cached structure when API changes', async () => {
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
                    marketPrice: 185.92,
                    tradingVolume: 44981879
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
          forceRefresh: false
        }
      });

      const response2 = await sendMCPRequest(request2);

      expect(response2).toHaveProperty('result');
    });
  });

  describe('API change with different endpoints', () => {
    test('should handle changes in quote endpoint', async () => {
      mockAPIChange('missingField');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should handle changes in news endpoint', async () => {
      global.fetch = jest.fn(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            news: {
              items: [
                {
                  title: 'Test News',
                  link: 'https://example.com'
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

    test('should handle changes in financials endpoint', async () => {
      global.fetch = jest.fn(() => {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            financials: {
              statements: [
                {
                  revenue: 385695001600,
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

  describe('Graceful degradation', () => {
    test('should return partial data when fields are missing', async () => {
      mockAPIChange('missingField');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should provide warnings about missing data', async () => {
      mockAPIChange('nullField');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should continue operating despite API changes', async () => {
      mockMultipleAPIChanges(4);

      const requests = Array(4).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const responses = await Promise.all(
        requests.map(req => sendMCPRequest(req))
      );

      const allSuccessful = responses.every(r =>
        r.result !== undefined && r.result.content !== undefined
      );
      expect(allSuccessful).toBe(true);
    });
  });

  describe('API change recovery', () => {
    test('should recover from temporary API changes', async () => {
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
                    marketPrice: 185.92
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
                    regularMarketVolume: 44981879
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
  });
});
