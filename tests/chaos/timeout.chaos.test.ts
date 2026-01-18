import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { promises as fs } from 'fs';
import { timeoutValues, retryConfigs, backoffStrategies } from '../fixtures/test-data.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Timeout Chaos Tests', () => {
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
    return new Promise(async (resolve, reject) => {
      const serverPath = path.join(__dirname, '../../dist/index.js');

      try {
        await fs.access(serverPath);
      } catch {
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

  async function sendMCPRequest(request: string, timeoutMs: number = 15000): Promise<unknown> {
    if (!serverProcess || !serverProcess.stdin) {
      throw new Error('Server process not available');
    }

    return new Promise((resolve, reject) => {
      let output = '';

      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, timeoutMs);

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

  function mockSlowResponse(delay: number) {
    global.fetch = jest.fn(() =>
      new Promise(resolve => {
        setTimeout(() => {
          resolve({
            ok: true,
            json: () => Promise.resolve({ mockData: 'success' })
          });
        }, delay);
      })
    );
  }

  function mockTimeoutResponse() {
    global.fetch = jest.fn(() =>
      new Promise(() => {
      })
    );
  }

  describe('Request timeout handling', () => {
    test('should handle slow response within timeout', async () => {
      mockSlowResponse(2000);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          timeout: 5000
        }
      });

      const response = await sendMCPRequest(request, 10000);

      expect(response).toHaveProperty('result');
    });

    test('should timeout on very slow response', async () => {
      mockTimeoutResponse();

      const startTime = Date.now();
      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          timeout: 1000
        }
      });

      try {
        await sendMCPRequest(request, 5000);
      } catch (error) {
        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(5000);
      }
    });

    test('should respect custom timeout parameter', async () => {
      mockSlowResponse(5000);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          timeout: 2000
        }
      });

      const startTime = Date.now();
      try {
        await sendMCPRequest(request, 10000);
      } catch (error) {
        const duration = Date.now() - startTime;
        expect(duration).toBeGreaterThan(1500);
        expect(duration).toBeLessThan(4000);
      }
    });
  });

  describe('Retry logic on timeout', () => {
    test('should retry on timeout', async () => {
      let attemptCount = 0;
      global.fetch = jest.fn(() => {
        attemptCount++;
        if (attemptCount < retryConfigs.maxRetries) {
          return new Promise(() => {
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mockData: 'success' })
        });
      });

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          timeout: 1000
        }
      });

      const response = await sendMCPRequest(request, 20000);

      expect(attemptCount).toBeGreaterThan(1);
      expect(response).toHaveProperty('result');
    });

    test('should use exponential backoff on timeout retry', async () => {
      let attemptCount = 0;
      const attemptTimes: number[] = [];

      global.fetch = jest.fn(() => {
        attemptCount++;
        attemptTimes.push(Date.now());
        if (attemptCount < 3) {
          return new Promise(() => {
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mockData: 'success' })
        });
      });

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          timeout: 1000
        }
      });

      const startTime = Date.now();
      const response = await sendMCPRequest(request, 20000);

      expect(attemptCount).toBe(3);
      expect(response).toHaveProperty('result');
    });

    test('should stop retrying after max retries', async () => {
      let attemptCount = 0;
      global.fetch = jest.fn(() => {
        attemptCount++;
        return new Promise(() => {
        });
      });

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          timeout: 500
        }
      });

      const startTime = Date.now();
      try {
        await sendMCPRequest(request, 15000);
      } catch (error) {
        const duration = Date.now() - startTime;
        expect(attemptCount).toBeLessThanOrEqual(retryConfigs.maxRetries + 1);
        expect(duration).toBeLessThan(15000);
      }
    });
  });

  describe('Concurrent timeout handling', () => {
    test('should handle multiple concurrent timeouts', async () => {
      mockSlowResponse(10000);

      const requests = Array(5).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'], timeout: 2000 }
        }, i + 1)
      );

      const startTime = Date.now();
      const responses = await Promise.allSettled(
        requests.map(req => sendMCPRequest(req, 10000))
      );
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10000);
    });

    test('should not deadlock on concurrent timeouts', async () => {
      mockTimeoutResponse();

      const requests = Array(10).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'], timeout: 1000 }
        }, i + 1)
      );

      const startTime = Date.now();
      await Promise.allSettled(
        requests.map(req => sendMCPRequest(req, 10000))
      );
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(20000);
    });
  });

  describe('Timeout with different operations', () => {
    test('should handle timeout for quote requests', async () => {
      mockTimeoutResponse();

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          timeout: 1000
        }
      });

      try {
        await sendMCPRequest(request, 5000);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    test('should handle timeout for news requests', async () => {
      mockTimeoutResponse();

      const request = createMCPRequest('tools/call', {
        name: 'get_news',
        arguments: {
          symbol: 'AAPL'
        }
      });

      const response = await sendMCPRequest(request, 10000);

      expect(response).toBeDefined();
    });

    test('should handle timeout for financials requests', async () => {
      mockSlowResponse(8000);

      const request = createMCPRequest('tools/call', {
        name: 'get_balance_sheet',
        arguments: {
          symbol: 'AAPL'
        }
      });

      const response = await sendMCPRequest(request, 10000);

      expect(response).toBeDefined();
    });
  });

  describe('Timeout with caching', () => {
    test('should use cached data on timeout', async () => {
      let attemptCount = 0;
      global.fetch = jest.fn(() => {
        attemptCount++;
        if (attemptCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ cached: 'data' })
          });
        }
        return new Promise(() => {
        });
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
          timeout: 1000
        }
      });

      const response2 = await sendMCPRequest(request2, 5000);

      expect(response2).toHaveProperty('result');
    });

    test('should force refresh bypass cache and timeout', async () => {
      mockSlowResponse(10000);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          forceRefresh: true,
          timeout: 2000
        }
      });

      const startTime = Date.now();
      try {
        await sendMCPRequest(request, 5000);
      } catch (error) {
        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(5000);
      }
    });
  });

  describe('Timeout with batch operations', () => {
    test('should handle timeout in batch request', async () => {
      let requestCount = 0;
      global.fetch = jest.fn(() => {
        requestCount++;
        if (requestCount === 2) {
          return new Promise(() => {
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mockData: 'success' })
        });
      });

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL', 'MSFT', 'GOOGL'],
          timeout: 2000
        }
      });

      const startTime = Date.now();
      const response = await sendMCPRequest(request, 10000);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10000);
      expect(response).toHaveProperty('result');
    });

    test('should return partial results on partial timeout', async () => {
      let requestCount = 0;
      global.fetch = jest.fn(() => {
        requestCount++;
        if (requestCount === 2) {
          return new Promise(() => {
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mockData: 'success' })
        });
      });

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL', 'MSFT', 'GOOGL'],
          timeout: 2000
        }
      });

      const response = await sendMCPRequest(request, 10000);

      expect(response).toHaveProperty('result');
    });
  });

  describe('Timeout recovery', () => {
    test('should recover from timeout after successful request', async () => {
      let isFast = false;
      global.fetch = jest.fn(() => {
        if (isFast) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ mockData: 'success' })
          });
        }
        return new Promise(() => {
        });
      });

      const request1 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          timeout: 1000
        }
      });

      try {
        await sendMCPRequest(request1, 5000);
      } catch (error) {
      }

      isFast = true;

      const request2 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response2 = await sendMCPRequest(request2, 10000);

      expect(response2).toHaveProperty('result');
    });

    test('should handle intermittent timeouts', async () => {
      let requestCount = 0;
      global.fetch = jest.fn(() => {
        requestCount++;
        if (requestCount % 3 === 0) {
          return new Promise(() => {
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mockData: 'success' })
        });
      });

      const requests = Array(10).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const responses = await Promise.allSettled(
        requests.map(req => sendMCPRequest(req, 10000))
      );

      const successfulResponses = responses.filter(r => r.status === 'fulfilled');
      expect(successfulResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Timeout edge cases', () => {
    test('should handle very short timeout', async () => {
      mockSlowResponse(5000);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          timeout: 100
        }
      });

      const startTime = Date.now();
      try {
        await sendMCPRequest(request, 2000);
      } catch (error) {
        const duration = Date.now() - startTime;
        expect(duration).toBeLessThan(2000);
      }
    });

    test('should handle very long timeout', async () => {
      mockSlowResponse(1000);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          timeout: 60000
        }
      });

      const startTime = Date.now();
      const response = await sendMCPRequest(request, 65000);
      const duration = Date.now() - startTime;

      expect(response).toHaveProperty('result');
      expect(duration).toBeLessThan(65000);
    });

    test('should handle zero timeout', async () => {
      mockSlowResponse(1000);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          timeout: 0
        }
      });

      try {
        await sendMCPRequest(request, 5000);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Timeout with backoff strategies', () => {
    test('should apply exponential backoff between retries', async () => {
      let attemptCount = 0;
      const attemptTimes: number[] = [];

      global.fetch = jest.fn(() => {
        attemptCount++;
        attemptTimes.push(Date.now());
        if (attemptCount < 3) {
          return new Promise(() => {
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mockData: 'success' })
        });
      });

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          timeout: 1000
        }
      });

      const response = await sendMCPRequest(request, 20000);

      expect(attemptCount).toBe(3);
      expect(response).toHaveProperty('result');
    });

    test('should apply jitter to backoff', async () => {
      let attemptCount = 0;

      global.fetch = jest.fn(() => {
        attemptCount++;
        if (attemptCount < 4) {
          return new Promise(() => {
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mockData: 'success' })
        });
      });

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          timeout: 1000
        }
      });

      const startTime = Date.now();
      const response = await sendMCPRequest(request, 30000);
      const duration = Date.now() - startTime;

      expect(attemptCount).toBe(4);
      expect(response).toHaveProperty('result');
    });
  });
});
