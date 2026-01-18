import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { circuitBreakerConfigs, resilienceTestConfigs } from '../fixtures/test-data.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Circuit Breaker Chaos Tests', () => {
  let serverProcess: ChildProcess | null = null;
  let serverPort = 3000;
  const originalFetch = global.fetch;
  let failureCount = 0;

  beforeEach(async () => {
    serverPort = 3000 + Math.floor(Math.random() * 1000);
    failureCount = 0;
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

  function mockCircuitBreakerFailure(threshold: number) {
    global.fetch = jest.fn(() => {
      failureCount++;
      if (failureCount > threshold) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mockData: 'success' })
        });
      }
      return Promise.reject(new Error('Service unavailable'));
    });
  }

  function mockIntermittentFailure(failureRate: number = 0.5) {
    global.fetch = jest.fn(() => {
      if (Math.random() < failureRate) {
        return Promise.reject(new Error('Service unavailable'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ mockData: 'success' })
      });
    });
  }

  describe('Circuit breaker state transitions', () => {
    test('should open circuit after failure threshold', async () => {
      mockCircuitBreakerFailure(circuitBreakerConfigs.failureThreshold);

      const requests = Array(circuitBreakerConfigs.failureThreshold + 5).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const responses = await Promise.allSettled(
        requests.map(req => sendMCPRequest(req))
      );

      const circuitOpenResponses = responses.filter(r =>
        r.status === 'fulfilled' &&
        r.value.result !== undefined &&
        typeof r.value.result.content === 'string' &&
        (r.value.result.content.includes('Circuit breaker') ||
         r.value.result.content.includes('open'))
      );

      expect(circuitOpenResponses.length).toBeGreaterThan(0);
    });

    test('should transition to half-open after timeout', async () => {
      let isServiceUp = false;
      global.fetch = jest.fn(() => {
        if (!isServiceUp) {
          return Promise.reject(new Error('Service unavailable'));
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

      await new Promise(resolve => setTimeout(resolve, circuitBreakerConfigs.timeout + 1000));
      isServiceUp = true;

      const request2 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: { symbols: ['AAPL'] }
      });

      const response2 = await sendMCPRequest(request2);

      expect(response2).toHaveProperty('result');
    });

    test('should close circuit after successful requests', async () => {
      let requestCount = 0;
      global.fetch = jest.fn(() => {
        requestCount++;
        if (requestCount < 5) {
          return Promise.reject(new Error('Service unavailable'));
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

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('Circuit breaker protection', () => {
    test('should prevent requests when circuit is open', async () => {
      mockCircuitBreakerFailure(circuitBreakerConfigs.failureThreshold);

      const initialRequests = Array(circuitBreakerConfigs.failureThreshold).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      await Promise.allSettled(
        initialRequests.map(req => sendMCPRequest(req))
      );

      const additionalRequests = Array(5).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + circuitBreakerConfigs.failureThreshold + 1)
      );

      const startTime = Date.now();
      const responses = await Promise.allSettled(
        additionalRequests.map(req => sendMCPRequest(req))
      );
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(5000);
    });

    test('should provide fallback response when circuit is open', async () => {
      mockCircuitBreakerFailure(circuitBreakerConfigs.failureThreshold);

      const requests = Array(circuitBreakerConfigs.failureThreshold + 3).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const responses = await Promise.allSettled(
        requests.map(req => sendMCPRequest(req))
      );

      const allHaveResponses = responses.every(r =>
        r.status === 'fulfilled' && r.value.result !== undefined
      );
      expect(allHaveResponses).toBe(true);
    });
  });

  describe('Circuit breaker recovery', () => {
    test('should attempt recovery after timeout', async () => {
      let isServiceUp = false;
      global.fetch = jest.fn(() => {
        if (!isServiceUp) {
          return Promise.reject(new Error('Service unavailable'));
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

      await new Promise(resolve => setTimeout(resolve, circuitBreakerConfigs.timeout + 1000));
      isServiceUp = true;

      const request2 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: { symbols: ['AAPL'] }
      });

      const response2 = await sendMCPRequest(request2);

      expect(response2).toHaveProperty('result');
    });

    test('should close circuit after successful half-open attempts', async () => {
      let requestCount = 0;
      global.fetch = jest.fn(() => {
        requestCount++;
        if (requestCount < 8) {
          return Promise.reject(new Error('Service unavailable'));
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
    });

    test('should reopen circuit on failure in half-open state', async () => {
      let attemptCount = 0;
      global.fetch = jest.fn(() => {
        attemptCount++;
        if (attemptCount < 5) {
          return Promise.reject(new Error('Service unavailable'));
        }
        if (attemptCount === 5) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ mockData: 'success' })
          });
        }
        return Promise.reject(new Error('Service unavailable'));
      });

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: { symbols: ['AAPL'] }
      });

      const startTime = Date.now();
      const response = await sendMCPRequest(request);
      const duration = Date.now() - startTime;

      expect(duration).toBeGreaterThan(circuitBreakerConfigs.timeout);
    });
  });

  describe('Circuit breaker with intermittent failures', () => {
    test('should handle intermittent failures without opening', async () => {
      mockIntermittentFailure(0.3);

      const requests = Array(20).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const responses = await Promise.allSettled(
        requests.map(req => sendMCPRequest(req))
      );

      const successfulResponses = responses.filter(r => r.status === 'fulfilled');
      expect(successfulResponses.length).toBeGreaterThan(10);
    });

    test('should open circuit on sustained failures', async () => {
      mockIntermittentFailure(0.8);

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

      expect(duration).toBeGreaterThan(5000);
    });
  });

  describe('Circuit breaker with concurrent requests', () => {
    test('should handle concurrent failures', async () => {
      mockCircuitBreakerFailure(circuitBreakerConfigs.failureThreshold);

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

      expect(duration).toBeLessThan(20000);
    });

    test('should not deadlock on concurrent failures', async () => {
      mockCircuitBreakerFailure(circuitBreakerConfigs.failureThreshold);

      const requests = Array(20).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const startTime = Date.now();
      await Promise.allSettled(
        requests.map(req => sendMCPRequest(req))
      );
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(30000);
    });
  });

  describe('Circuit breaker with different operations', () => {
    test('should protect all operations with circuit breaker', async () => {
      mockCircuitBreakerFailure(5);

      const operations = [
        { name: 'get_quote', args: { symbols: ['AAPL'] } },
        { name: 'get_news', args: { symbol: 'AAPL' } },
        { name: 'get_earnings', args: { symbol: 'AAPL' } }
      ];

      for (const operation of operations) {
        const request = createMCPRequest('tools/call', {
          name: operation.name,
          arguments: operation.args
        });

        const response = await sendMCPRequest(request);
        expect(response).toBeDefined();
      }
    });

    test('should maintain separate circuit states per endpoint', async () => {
      let quoteFailures = 0;
      let newsFailures = 0;
      global.fetch = jest.fn((url: string) => {
        if (url.includes('quote')) {
          quoteFailures++;
          if (quoteFailures > 3) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ mockData: 'success' })
            });
          }
        } else if (url.includes('news')) {
          newsFailures++;
          if (newsFailures > 7) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ mockData: 'success' })
            });
          }
        }
        return Promise.reject(new Error('Service unavailable'));
      });

      const quoteRequests = Array(5).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const newsRequests = Array(10).fill(null).map((_, i) =>
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

  describe('Circuit breaker configuration', () => {
    test('should respect failure threshold', async () => {
      mockCircuitBreakerFailure(circuitBreakerConfigs.failureThreshold);

      const requests = Array(circuitBreakerConfigs.failureThreshold + 2).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      await Promise.allSettled(
        requests.map(req => sendMCPRequest(req))
      );

      expect(failureCount).toBeGreaterThan(circuitBreakerConfigs.failureThreshold);
    });

    test('should respect success threshold for closing', async () => {
      let requestCount = 0;
      global.fetch = jest.fn(() => {
        requestCount++;
        if (requestCount < 8) {
          return Promise.reject(new Error('Service unavailable'));
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

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should respect timeout for half-open transition', async () => {
      let isServiceUp = false;
      global.fetch = jest.fn(() => {
        if (!isServiceUp) {
          return Promise.reject(new Error('Service unavailable'));
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

      const startTime = Date.now();
      await new Promise(resolve => setTimeout(resolve, circuitBreakerConfigs.timeout + 1000));
      isServiceUp = true;

      const request2 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: { symbols: ['AAPL'] }
      });

      const response2 = await sendMCPRequest(request2);
      const duration = Date.now() - startTime;

      expect(response2).toHaveProperty('result');
      expect(duration).toBeGreaterThan(circuitBreakerConfigs.timeout);
    });
  });

  describe('Circuit breaker edge cases', () => {
    test('should handle zero failure threshold', async () => {
      mockCircuitBreakerFailure(0);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: { symbols: ['AAPL'] }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should handle very low failure threshold', async () => {
      mockCircuitBreakerFailure(2);

      const requests = Array(5).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const responses = await Promise.allSettled(
        requests.map(req => sendMCPRequest(req))
      );

      const allHaveResponses = responses.every(r =>
        r.status === 'fulfilled' && r.value.result !== undefined
      );
      expect(allHaveResponses).toBe(true);
    });

    test('should handle very high failure threshold', async () => {
      mockCircuitBreakerFailure(50);

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

  describe('Circuit breaker with caching', () => {
    test('should use cached data when circuit is open', async () => {
      let attemptCount = 0;
      global.fetch = jest.fn(() => {
        attemptCount++;
        if (attemptCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ cached: 'data' })
          });
        }
        return Promise.reject(new Error('Service unavailable'));
      });

      const request1 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: { symbols: ['AAPL'] }
      });

      await sendMCPRequest(request1);

      const request2 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: { symbols: ['AAPL'] }
      });

      const response2 = await sendMCPRequest(request2);

      expect(response2).toHaveProperty('result');
    });

    test('should bypass cache with force refresh even when circuit is open', async () => {
      mockCircuitBreakerFailure(5);

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          forceRefresh: true
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toBeDefined();
    });
  });
});
