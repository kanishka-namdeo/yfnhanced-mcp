import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Resource Access E2E Tests', () => {
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

  describe('Resource listing', () => {
    test('should list all available resources', async () => {
      const request = createMCPRequest('resources/list');
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('resources');
      expect(Array.isArray(response.result.resources)).toBe(true);

      const resourceUris = response.result.resources.map((r: { uri: string }) => r.uri);
      expect(resourceUris).toContain('ticker://{symbol}/quote');
      expect(resourceUris).toContain('ticker://{symbol}/profile');
      expect(resourceUris).toContain('ticker://{symbol}/financials');
      expect(resourceUris).toContain('ticker://{symbol}/historical');
      expect(resourceUris).toContain('ticker://{symbol}/news');
      expect(resourceUris).toContain('ticker://{symbol}/analysis');
    });

    test('should provide resource metadata', async () => {
      const request = createMCPRequest('resources/list');
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result.resources[0]).toHaveProperty('uri');
      expect(response.result.resources[0]).toHaveProperty('name');
      expect(response.result.resources[0]).toHaveProperty('description');
      expect(response.result.resources[0]).toHaveProperty('mimeType');
    });
  });

  describe('Quote resource', () => {
    test('should read quote resource', async () => {
      const request = createMCPRequest('resources/read', {
        uri: 'ticker://AAPL/quote'
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('contents');
      expect(Array.isArray(response.result.contents)).toBe(true);
      expect(response.result.contents[0]).toHaveProperty('uri');
      expect(response.result.contents[0]).toHaveProperty('mimeType');
      expect(response.result.contents[0].mimeType).toBe('application/json');
      expect(response.result.contents[0]).toHaveProperty('text');
    });

    test('should return valid JSON for quote resource', async () => {
      const request = createMCPRequest('resources/read', {
        uri: 'ticker://AAPL/quote'
      });
      const response = await sendMCPRequest(request);

      const text = response.result.contents[0].text;
      const data = JSON.parse(text);

      expect(data).toHaveProperty('regularMarketPrice');
      expect(data).toHaveProperty('regularMarketChange');
      expect(data).toHaveProperty('regularMarketVolume');
    });
  });

  describe('Profile resource', () => {
    test('should read profile resource', async () => {
      const request = createMCPRequest('resources/read', {
        uri: 'ticker://AAPL/profile'
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('contents');
      expect(response.result.contents[0]).toHaveProperty('uri');
      expect(response.result.contents[0]).toHaveProperty('text');
    });

    test('should return valid JSON for profile resource', async () => {
      const request = createMCPRequest('resources/read', {
        uri: 'ticker://AAPL/profile'
      });
      const response = await sendMCPRequest(request);

      const text = response.result.contents[0].text;
      const data = JSON.parse(text);

      expect(data).toHaveProperty('companyName');
      expect(data).toHaveProperty('industry');
      expect(data).toHaveProperty('sector');
    });
  });

  describe('Financials resource', () => {
    test('should read financials resource', async () => {
      const request = createMCPRequest('resources/read', {
        uri: 'ticker://AAPL/financials'
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('contents');
      expect(response.result.contents[0]).toHaveProperty('uri');
      expect(response.result.contents[0]).toHaveProperty('text');
    });

    test('should return valid JSON for financials resource', async () => {
      const request = createMCPRequest('resources/read', {
        uri: 'ticker://AAPL/financials'
      });
      const response = await sendMCPRequest(request);

      const text = response.result.contents[0].text;
      const data = JSON.parse(text);

      expect(data).toHaveProperty('incomeStatementHistory');
      expect(data).toHaveProperty('balanceSheetHistory');
      expect(data).toHaveProperty('cashflowStatementHistory');
    });
  });

  describe('Historical resource', () => {
    test('should read historical resource', async () => {
      const request = createMCPRequest('resources/read', {
        uri: 'ticker://AAPL/historical'
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('contents');
      expect(response.result.contents[0]).toHaveProperty('uri');
      expect(response.result.contents[0]).toHaveProperty('text');
    });

    test('should return valid JSON for historical resource', async () => {
      const request = createMCPRequest('resources/read', {
        uri: 'ticker://AAPL/historical'
      });
      const response = await sendMCPRequest(request);

      const text = response.result.contents[0].text;
      const data = JSON.parse(text);

      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('indicators');
      expect(data.indicators).toHaveProperty('quote');
    });
  });

  describe('News resource', () => {
    test('should read news resource', async () => {
      const request = createMCPRequest('resources/read', {
        uri: 'ticker://AAPL/news'
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('contents');
      expect(response.result.contents[0]).toHaveProperty('uri');
      expect(response.result.contents[0]).toHaveProperty('text');
    });

    test('should return valid JSON for news resource', async () => {
      const request = createMCPRequest('resources/read', {
        uri: 'ticker://AAPL/news'
      });
      const response = await sendMCPRequest(request);

      const text = response.result.contents[0].text;
      const data = JSON.parse(text);

      expect(data).toHaveProperty('itemsResult');
      expect(data.itemsResult).toHaveProperty('items');
      expect(Array.isArray(data.itemsResult.items)).toBe(true);
    });
  });

  describe('Analysis resource', () => {
    test('should read analysis resource', async () => {
      const request = createMCPRequest('resources/read', {
        uri: 'ticker://AAPL/analysis'
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('contents');
      expect(response.result.contents[0]).toHaveProperty('uri');
      expect(response.result.contents[0]).toHaveProperty('text');
    });

    test('should return valid JSON for analysis resource', async () => {
      const request = createMCPRequest('resources/read', {
        uri: 'ticker://AAPL/analysis'
      });
      const response = await sendMCPRequest(request);

      const text = response.result.contents[0].text;
      const data = JSON.parse(text);

      expect(data).toHaveProperty('recommendationTrend');
      expect(data).toHaveProperty('earningsTrend');
      expect(data).toHaveProperty('financialsChart');
    });
  });

  describe('Error handling', () => {
    test('should handle invalid resource URI format', async () => {
      const request = createMCPRequest('resources/read', {
        uri: 'invalid-uri-format'
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('error');
      expect(response.error).toHaveProperty('code');
      expect(response.error).toHaveProperty('message');
    });

    test('should handle unknown resource type', async () => {
      const request = createMCPRequest('resources/read', {
        uri: 'ticker://AAPL/unknown'
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('error');
      expect(response.error).toHaveProperty('message');
      expect(response.error.message).toContain('Unknown resource type');
    });

    test('should handle invalid symbol', async () => {
      const request = createMCPRequest('resources/read', {
        uri: 'ticker://INVALID_SYMBOL_12345/quote'
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('contents');
    });

    test('should handle missing URI parameter', async () => {
      const request = createMCPRequest('resources/read', {});
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('error');
    });
  });

  describe('Concurrent resource access', () => {
    test('should handle multiple concurrent resource reads', async () => {
      const requests = [
        createMCPRequest('resources/read', { uri: 'ticker://AAPL/quote' }, 1),
        createMCPRequest('resources/read', { uri: 'ticker://MSFT/quote' }, 2),
        createMCPRequest('resources/read', { uri: 'ticker://GOOGL/quote' }, 3),
        createMCPRequest('resources/read', { uri: 'ticker://AAPL/profile' }, 4),
        createMCPRequest('resources/read', { uri: 'ticker://AAPL/financials' }, 5)
      ];

      const responses = await Promise.all(
        requests.map(req => sendMCPRequest(req))
      );

      responses.forEach(response => {
        expect(response).toHaveProperty('result');
        expect(response.result).toHaveProperty('contents');
      });
    });

    test('should handle mixed resource and tool requests', async () => {
      const requests = [
        createMCPRequest('resources/read', { uri: 'ticker://AAPL/quote' }, 1),
        createMCPRequest('tools/call', {
          name: 'get_quote',
          arguments: { symbols: ['MSFT'] }
        }, 2),
        createMCPRequest('resources/read', { uri: 'ticker://AAPL/news' }, 3),
        createMCPRequest('tools/call', {
          name: 'get_news',
          arguments: { symbol: 'GOOGL' }
        }, 4)
      ];

      const responses = await Promise.all(
        requests.map(req => sendMCPRequest(req))
      );

      responses.forEach(response => {
        expect(response).toHaveProperty('result');
      });
    });
  });

  describe('Resource URI patterns', () => {
    test('should support URI with symbol substitution', async () => {
      const symbols = ['AAPL', 'MSFT', 'GOOGL'];

      for (const symbol of symbols) {
        const request = createMCPRequest('resources/read', {
          uri: `ticker://${symbol}/quote`
        });
        const response = await sendMCPRequest(request);

        expect(response).toHaveProperty('result');
        expect(response.result).toHaveProperty('contents');
      }
    });

    test('should handle different resource types for same symbol', async () => {
      const symbol = 'AAPL';
      const resourceTypes = ['quote', 'profile', 'financials', 'historical', 'news', 'analysis'];

      for (const resourceType of resourceTypes) {
        const request = createMCPRequest('resources/read', {
          uri: `ticker://${symbol}/${resourceType}`
        });
        const response = await sendMCPRequest(request);

        expect(response).toHaveProperty('result');
      }
    });
  });

  describe('Resource content validation', () => {
    test('should provide proper MIME type for all resources', async () => {
      const resourceTypes = ['quote', 'profile', 'financials', 'historical', 'news', 'analysis'];

      for (const resourceType of resourceTypes) {
        const request = createMCPRequest('resources/read', {
          uri: `ticker://AAPL/${resourceType}`
        });
        const response = await sendMCPRequest(request);

        expect(response.result.contents[0].mimeType).toBe('application/json');
      }
    });

    test('should return parseable JSON content', async () => {
      const resourceTypes = ['quote', 'profile', 'financials', 'historical', 'news', 'analysis'];

      for (const resourceType of resourceTypes) {
        const request = createMCPRequest('resources/read', {
          uri: `ticker://AAPL/${resourceType}`
        });
        const response = await sendMCPRequest(request);

        const text = response.result.contents[0].text;
        const data = JSON.parse(text);

        expect(data).toBeDefined();
        expect(typeof data).toBe('object');
      }
    });
  });

  describe('Resource caching behavior', () => {
    test('should return same data for repeated resource reads', async () => {
      const request1 = createMCPRequest('resources/read', { uri: 'ticker://AAPL/quote' });
      const response1 = await sendMCPRequest(request1);

      const request2 = createMCPRequest('resources/read', { uri: 'ticker://AAPL/quote' });
      const response2 = await sendMCPRequest(request2);

      expect(response1.result.contents[0].uri).toBe(response2.result.contents[0].uri);
    });
  });

  describe('Multiple symbols', () => {
    test('should handle resources for multiple symbols concurrently', async () => {
      const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'];
      const requests = symbols.map((symbol, index) =>
        createMCPRequest('resources/read', { uri: `ticker://${symbol}/quote` }, index + 1)
      );

      const responses = await Promise.all(
        requests.map(req => sendMCPRequest(req))
      );

      responses.forEach(response => {
        expect(response).toHaveProperty('result');
        expect(response.result).toHaveProperty('contents');
      });
    });
  });
});
