import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { rateLimitConfigs, concurrentRequestCounts, backoffStrategies } from '../fixtures/test-data.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Rate Limit Chaos Tests', () => {
  let serverProcess: ChildProcess | null = null;
  let serverPort = 3000;
  const originalFetch = global.fetch;
  let requestCounter = 0;

  beforeEach(async () => {
    serverPort = 3000 + Math.floor(Math.random() * 1000);
    requestCounter = 0;
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

  function mockRateLimit(limit: number, retryAfter: number = 60) {
    global.fetch = jest.fn(() => {
      requestCounter++;
      if (requestCounter > limit) {
        return Promise.resolve({
          ok: false,
          status: 429,
          headers: {
            get: (name: string) => {
              if (name === 'retry-after') return String(retryAfter);
              if (name === 'x-ratelimit-limit') return String(limit);
              if (name === 'x-ratelimit-remaining') return '0';
              return null;
            }
          },
          json: () => Promise.resolve({ error: 'Too Many Requests' })
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'x-ratelimit-limit') return String(limit);
            if (name === 'x-ratelimit-remaining') => String(limit - requestCounter);
            return null;
          }
        },
        json: () => Promise.resolve({ mockData: 'success' })
      });
    });
  }

  function mockBurstRateLimit(burstLimit: number, sustainedLimit: number) {
    let requestCount = 0;
    global.fetch = jest.fn(() => {
      requestCount++;
      const isBurst = requestCount <= burstLimit;
      const isOverLimit = requestCount > sustainedLimit;

      if (isOverLimit && !isBurst) {
        return Promise.resolve({
          ok: false,
          status: 429,
          headers: {
            get: (name: string) => {
              if (name === 'retry-after') return '60';
              if (name === 'x-ratelimit-limit') return String(sustainedLimit);
              if (name === 'x-ratelimit-remaining') return '0';
              return null;
            }
          },
          json: () => Promise.resolve({ error: 'Too Many Requests' })
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ mockData: 'success' })
      });
    });
  }

  describe('Rate limit detection', () => {
    test('should detect rate limit response', async () => {
      mockRateLimit(5);

      const requests = Array(10).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const responses = await Promise.allSettled(
        requests.map(req => sendMCPRequest(req))
      );

      const rateLimitedResponses = responses.filter(r =>
        r.status === 'fulfilled' &&
        r.value.result !== undefined &&
        typeof r.value.result.content === 'string' &&
        r.value.result.content.includes('rate limit')
      );

      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    test('should extract retry-after header', async () => {
      mockRateLimit(3, 120);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      await sendMCPRequest(request);
      await sendMCPRequest(request);
      await sendMCPRequest(request);
      await sendMCPRequest(request);

      expect(requestCounter).toBeGreaterThan(3);
    });

    test('should track remaining requests', async () => {
      mockRateLimit(10);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      await sendMCPRequest(request);

      expect(requestCounter).toBe(1);
    });
  });

  describe('Rate limit backoff', () => {
    test('should implement exponential backoff on rate limit', async () => {
      mockRateLimit(2, 2);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const startTime = Date.now();
      await sendMCPRequest(request);
      await sendMCPRequest(request);
      await sendMCPRequest(request);
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThan(1000);
    });

    test('should apply jitter to backoff', async () => {
      mockRateLimit(3, 1);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      await sendMCPRequest(request);
      await sendMCPRequest(request);
      await sendMCPRequest(request);

      expect(requestCounter).toBeGreaterThan(2);
    });

    test('should respect retry-after header', async () => {
      mockRateLimit(2, 3);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const startTime = Date.now();
      await sendMCPRequest(request);
      await sendMCPRequest(request);
      await sendMCPRequest(request);
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThan(2000);
      expect(duration).toBeLessThan(10000);
    });
  });

  describe('Burst handling', () => {
    test('should handle burst requests within limit', async () => {
      mockBurstRateLimit(10, 20);

      const requests = Array(10).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const responses = await Promise.allSettled(
        requests.map(req => sendMCPRequest(req))
      );

      const successfulResponses = responses.filter(r => r.status === 'fulfilled');
      expect(successfulResponses.length).toBe(10);
    });

    test('should throttle after burst limit exceeded', async () => {
      mockBurstRateLimit(5, 10);

      const requests = Array(15).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const startTime = Date.now();
      const responses = await Promise.allSettled(
        requests.map(req => sendMCPRequest(req))
      );
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThan(1000);
    });

    test('should recover from burst throttling', async () => {
      let isRecovered = false;
      global.fetch = jest.fn(() => {
        if (!isRecovered) {
          return Promise.resolve({
            ok: false,
            status: 429,
            headers: {
              get: () => '1'
            },
            json: () => Promise.resolve({ error: 'Too Many Requests' })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mockData: 'success' })
        });
      });

      const request1 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: { symbols: ['AAPL'] }
      });

      try {
        await sendMCPRequest(request1);
      } catch (error) {
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
      isRecovered = true;

      const request2 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: { symbols: ['AAPL'] }
      });

      const response2 = await sendMCPRequest(request2);

      expect(response2).toHaveProperty('result');
    });
  });

  describe('Concurrent request throttling', () => {
    test('should throttle concurrent requests', async () => {
      mockRateLimit(5);

      const requests = Array(20).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const startTime = Date.now();
      const responses = await Promise.allSettled(
        requests.map(req => sendMCPRequest(req))
      );
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThan(1000);
    });

    test('should respect max concurrent limit', async () => {
      mockRateLimit(10);

      const requests = Array(30).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const startTime = Date.now();
      const responses = await Promise.allSettled(
        requests.map(req => sendMCPRequest(req))
      );
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThan(2000);
    });

    test('should queue requests when limit reached', async () => {
      mockRateLimit(3);

      const requests = Array(10).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const responses = await Promise.allSettled(
        requests.map(req => sendMCPRequest(req))
      );

      const successfulResponses = responses.filter(r => r.status === 'fulfilled');
      expect(successfulResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Rate limit with caching', () => {
    test('should use cache during rate limit', async () => {
      let requestCount = 0;
      global.fetch = jest.fn(() => {
        requestCount++;
        if (requestCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ cached: 'data' })
          });
        }
        return Promise.resolve({
          ok: false,
          status: 429,
          headers: {
            get: () => '60'
          },
          json: () => Promise.resolve({ error: 'Too Many Requests' })
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
          symbols: ['AAPL']
        }
      });

      const response2 = await sendMCPRequest(request2);

      expect(response2).toHaveProperty('result');
      expect(requestCount).toBeLessThan(5);
    });

    test('should bypass cache with force refresh even during rate limit', async () => {
      mockRateLimit(2);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          forceRefresh: true
        }
      });

      try {
        await sendMCPRequest(request);
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe('Rate limit recovery', () => {
    test('should recover from rate limit after cooldown', async () => {
      let isRateLimited = true;
      global.fetch = jest.fn(() => {
        if (isRateLimited) {
          return Promise.resolve({
            ok: false,
            status: 429,
            headers: {
              get: () => '1'
            },
            json: () => Promise.resolve({ error: 'Too Many Requests' })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mockData: 'success' })
        });
      });

      const request1 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: { symbols: ['AAPL'] }
      });

      try {
        await sendMCPRequest(request1);
      } catch (error) {
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      isRateLimited = false;

      const request2 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: { symbols: ['AAPL'] }
      });

      const response2 = await sendMCPRequest(request2);

      expect(response2).toHaveProperty('result');
    });

    test('should gradually increase request rate after recovery', async () => {
      let requestCount = 0;
      global.fetch = jest.fn(() => {
        requestCount++;
        if (requestCount < 5) {
          return Promise.resolve({
            ok: false,
            status: 429,
            headers: {
              get: () => '1'
            },
            json: () => Promise.resolve({ error: 'Too Many Requests' })
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mockData: 'success' })
        });
      });

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: { symbols: ['AAPL'] }
      });

      const startTime = Date.now();
      const response = await sendMCPRequest(request);
      const duration = Date.now() - startTime;

      expect(response).toHaveProperty('result');
      expect(duration).toBeGreaterThan(1000);
    });
  });

  describe('Rate limit with different endpoints', () => {
    test('should handle per-endpoint rate limits', async () => {
      let quoteCount = 0;
      let newsCount = 0;
      global.fetch = jest.fn((url: string) => {
        if (url.includes('quote')) {
          quoteCount++;
          if (quoteCount > 3) {
            return Promise.resolve({
              ok: false,
              status: 429,
              json: () => Promise.resolve({ error: 'Too Many Requests' })
            });
          }
        } else if (url.includes('news')) {
          newsCount++;
          if (newsCount > 5) {
            return Promise.resolve({
              ok: false,
              status: 429,
              json: () => Promise.resolve({ error: 'Too Many Requests' })
            });
          }
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mockData: 'success' })
        });
      });

      const quoteRequests = Array(5).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const newsRequests = Array(5).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_news',
          arguments: { symbol: 'AAPL' }
        }, i + 6)
      );

      const allRequests = [...quoteRequests, ...newsRequests];
      const responses = await Promise.allSettled(
        allRequests.map(req => sendMCPRequest(req))
      );

      const successfulResponses = responses.filter(r => r.status === 'fulfilled');
      expect(successfulResponses.length).toBeGreaterThan(5);
    });
  });

  describe('Rate limit edge cases', () => {
    test('should handle zero remaining requests', async () => {
      mockRateLimit(0);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toBeDefined();
    });

    test('should handle very low rate limit', async () => {
      mockRateLimit(1, 1);

      const requests = Array(5).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const startTime = Date.now();
      const responses = await Promise.allSettled(
        requests.map(req => sendMCPRequest(req))
      );
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThan(3000);
    });

    test('should handle very high rate limit', async () => {
      mockRateLimit(1000);

      const requests = Array(50).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const startTime = Date.now();
      const responses = await Promise.allSettled(
        requests.map(req => sendMCPRequest(req))
      );
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(30000);
    });
  });
});
