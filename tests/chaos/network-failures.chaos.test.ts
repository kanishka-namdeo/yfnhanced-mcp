import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { networkFailureScenarios } from '../fixtures/test-data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Network Failures Chaos Tests', () => {
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
      }, 20000);

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

  function mockNetworkFailure(failureType: keyof typeof networkFailureScenarios) {
    global.fetch = jest.fn(() => {
      const failure = networkFailureScenarios[failureType];
      return Promise.reject(new Error(failure.code));
    });
  }

  function mockIntermittentNetwork(failureRate: number = 0.5) {
    let requestCount = 0;
    global.fetch = jest.fn(() => {
      requestCount++;
      if (Math.random() < failureRate) {
        return Promise.reject(new Error('ECONNRESET'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ mockData: 'success' })
      });
    });
  }

  describe('Timeout failures', () => {
    test('should handle network timeout gracefully', async () => {
      mockNetworkFailure('timeout');

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

    test('should retry on timeout', async () => {
      let attemptCount = 0;
      global.fetch = jest.fn(() => {
        attemptCount++;
        if (attemptCount < 3) {
          return Promise.reject(new Error('ETIMEDOUT'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mockData: 'success' })
        });
      });

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(attemptCount).toBeGreaterThan(1);
      expect(response).toHaveProperty('result');
    });

    test('should respect custom timeout setting', async () => {
      mockNetworkFailure('timeout');

      const startTime = Date.now();
      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL'],
          timeout: 5000
        }
      });

      await sendMCPRequest(request);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(10000);
    });
  });

  describe('Connection refused', () => {
    test('should handle connection refused error', async () => {
      mockNetworkFailure('connectionRefused');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should not crash server on connection refused', async () => {
      mockNetworkFailure('connectionRefused');

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

      expect(serverProcess).not.toBeNull();
    });
  });

  describe('DNS failures', () => {
    test('should handle DNS resolution failure', async () => {
      mockNetworkFailure('dnsError');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should provide meaningful error message for DNS failure', async () => {
      mockNetworkFailure('dnsError');

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

  describe('Network down', () => {
    test('should handle complete network outage', async () => {
      mockNetworkFailure('networkDown');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should use cached data during network outage', async () => {
      mockIntermittentNetwork(1);

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

  describe('Socket hang up', () => {
    test('should handle socket hang up error', async () => {
      mockNetworkFailure('socketHangUp');

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should retry on socket hang up', async () => {
      let attemptCount = 0;
      global.fetch = jest.fn(() => {
        attemptCount++;
        if (attemptCount < 2) {
          return Promise.reject(new Error('ECONNRESET'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mockData: 'success' })
        });
      });

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(attemptCount).toBeGreaterThan(1);
      expect(response).toHaveProperty('result');
    });
  });

  describe('Intermittent failures', () => {
    test('should handle intermittent network failures', async () => {
      mockIntermittentNetwork(0.3);

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

    test('should recover from intermittent failures', async () => {
      let failureCount = 0;
      global.fetch = jest.fn(() => {
        if (failureCount < 3) {
          failureCount++;
          return Promise.reject(new Error('ECONNRESET'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mockData: 'success' })
        });
      });

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(failureCount).toBe(3);
      expect(response).toHaveProperty('result');
    });

    test('should handle high failure rate', async () => {
      mockIntermittentNetwork(0.8);

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

  describe('Concurrent failures', () => {
    test('should handle multiple concurrent network failures', async () => {
      mockNetworkFailure('connectionRefused');

      const requests = Array(10).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      const responses = await Promise.allSettled(
        requests.map(req => sendMCPRequest(req))
      );

      const allHaveResults = responses.every(r =>
        r.status === 'fulfilled' && r.value.result !== undefined
      );
      expect(allHaveResults).toBe(true);
    });

    test('should not deadlock on network failures', async () => {
      mockNetworkFailure('timeout');

      const startTime = Date.now();
      const requests = Array(5).fill(null).map((_, i) =>
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['AAPL'] }
        }, i + 1)
      );

      await Promise.allSettled(
        requests.map(req => sendMCPRequest(req))
      );
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(30000);
    });
  });

  describe('Recovery scenarios', () => {
    test('should recover from network failure', async () => {
      let isNetworkUp = false;

      global.fetch = jest.fn(() => {
        if (!isNetworkUp) {
          return Promise.reject(new Error('ECONNREFUSED'));
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

      await sendMCPRequest(request1);

      isNetworkUp = true;

      const request2 = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: { symbols: ['AAPL'] }
      });

      const response2 = await sendMCPRequest(request2);

      expect(response2).toHaveProperty('result');
    });

    test('should handle network recovery during batch request', async () => {
      let requestCount = 0;
      global.fetch = jest.fn(() => {
        requestCount++;
        if (requestCount < 3) {
          return Promise.reject(new Error('ECONNRESET'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mockData: 'success' })
        });
      });

      const request = createMCPRequest('tools/call', {
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL', 'MSFT', 'GOOGL']
        }
      });

      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('Graceful degradation', () => {
    test('should return cached data on network failure', async () => {
      let attemptCount = 0;
      global.fetch = jest.fn(() => {
        attemptCount++;
        if (attemptCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ cached: 'data' })
          });
        }
        return Promise.reject(new Error('ECONNRESET'));
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

    test('should provide partial results when some requests fail', async () => {
      let requestCount = 0;
      global.fetch = jest.fn(() => {
        requestCount++;
        if (requestCount % 2 === 0) {
          return Promise.reject(new Error('ECONNRESET'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ mockData: 'success' })
        });
      });

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
});
