import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, existsSync } from 'fs';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Server E2E Tests', () => {
  let serverProcess: ChildProcess | null = null;
  let serverPort = 3000;
  const serverReadyTimeout = 30000;
  const serverShutdownTimeout = 10000;

  beforeEach(async () => {
    serverPort = 3000 + Math.floor(Math.random() * 1000);
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
          PORT: String(port)
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
        if (!output.includes('started successfully') && !errorOutput.includes('started successfully')) {
          reject(new Error(`Server failed to start within timeout. Output: ${output}, Error: ${errorOutput}`));
        }
      }, serverReadyTimeout);
    });
  }

  async function stopServer(): Promise<void> {
    if (!serverProcess) return;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        serverProcess?.kill('SIGKILL');
        serverProcess = null;
        resolve();
      }, serverShutdownTimeout);

      serverProcess?.on('exit', () => {
        clearTimeout(timeout);
        serverProcess = null;
        resolve();
      });

      serverProcess?.kill('SIGTERM');
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

  function parseMCPResponse(response: string): unknown {
    return JSON.parse(response);
  }

  async function sendMCPRequest(request: string): Promise<string> {
    if (!serverProcess || !serverProcess.stdin) {
      throw new Error('Server process not available');
    }

    return new Promise((resolve, reject) => {
      let output = '';

      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 10000);

      serverProcess?.stdout?.on('data', (data) => {
        output += data.toString();
        try {
          const response = parseMCPResponse(output);
          if (response && typeof response === 'object' && 'id' in response) {
            clearTimeout(timeout);
            resolve(output);
          }
        } catch {
          output = '';
        }
      });

      serverProcess?.stdin?.write(request + '\n');
    });
  }

  test('should start server successfully', async () => {
    await startServer(serverPort);
    expect(serverProcess).not.toBeNull();
    expect(serverProcess?.pid).toBeGreaterThan(0);
  });

  test('should respond to initialize request', async () => {
    await startServer(serverPort);

    const request = createMCPRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      },
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    });

    const response = await sendMCPRequest(request);
    const parsed = parseMCPResponse(response);

    expect(parsed).toHaveProperty('jsonrpc', '2.0');
    expect(parsed).toHaveProperty('id', 1);
    expect(parsed).toHaveProperty('result');
    expect(parsed.result).toHaveProperty('protocolVersion');
    expect(parsed.result).toHaveProperty('capabilities');
    expect(parsed.result.capabilities).toHaveProperty('tools');
    expect(parsed.result.capabilities).toHaveProperty('resources');
    expect(parsed.result.capabilities).toHaveProperty('prompts');
  });

  test('should list all available tools', async () => {
    await startServer(serverPort);

    const request = createMCPRequest('tools/list');
    const response = await sendMCPRequest(request);
    const parsed = parseMCPResponse(response);

    expect(parsed).toHaveProperty('result');
    expect(parsed.result).toHaveProperty('tools');
    expect(Array.isArray(parsed.result.tools)).toBe(true);

    const toolNames = parsed.result.tools.map((t: { name: string }) => t.name);
    expect(toolNames).toContain('get_quote');
    expect(toolNames).toContain('get_quote_summary');
    expect(toolNames).toContain('get_earnings');
    expect(toolNames).toContain('get_analysis');
    expect(toolNames).toContain('get_major_holders');
    expect(toolNames).toContain('get_news');
    expect(toolNames).toContain('get_options');
    expect(toolNames).toContain('get_balance_sheet');
    expect(toolNames).toContain('get_income_statement');
    expect(toolNames).toContain('get_cash_flow_statement');
    expect(toolNames).toContain('get_summary_profile');
    expect(toolNames).toContain('get_crypto_quote');
    expect(toolNames).toContain('get_forex_quote');
    expect(toolNames).toContain('get_trending_symbols');
    expect(toolNames).toContain('screener');
  });

  test('should list all available resources', async () => {
    await startServer(serverPort);

    const request = createMCPRequest('resources/list');
    const response = await sendMCPRequest(request);
    const parsed = parseMCPResponse(response);

    expect(parsed).toHaveProperty('result');
    expect(parsed.result).toHaveProperty('resources');
    expect(Array.isArray(parsed.result.resources)).toBe(true);

    const resourceUris = parsed.result.resources.map((r: { uri: string }) => r.uri);
    expect(resourceUris).toContain('ticker://{symbol}/quote');
    expect(resourceUris).toContain('ticker://{symbol}/profile');
    expect(resourceUris).toContain('ticker://{symbol}/financials');
    expect(resourceUris).toContain('ticker://{symbol}/historical');
    expect(resourceUris).toContain('ticker://{symbol}/news');
    expect(resourceUris).toContain('ticker://{symbol}/analysis');
  });

  test('should list all available prompts', async () => {
    await startServer(serverPort);

    const request = createMCPRequest('prompts/list');
    const response = await sendMCPRequest(request);
    const parsed = parseMCPResponse(response);

    expect(parsed).toHaveProperty('result');
    expect(parsed.result).toHaveProperty('prompts');
    expect(Array.isArray(parsed.result.prompts)).toBe(true);

    const promptNames = parsed.result.prompts.map((p: { name: string }) => p.name);
    expect(promptNames).toContain('analyze_stock');
    expect(promptNames).toContain('compare_stocks');
    expect(promptNames).toContain('financial_health_check');
    expect(promptNames).toContain('earnings_analysis');
    expect(promptNames).toContain('market_overview');
    expect(promptNames).toContain('portfolio_due_diligence');
  });

  test('should handle invalid JSON-RPC requests', async () => {
    await startServer(serverPort);

    const invalidRequest = 'invalid json';
    try {
      await sendMCPRequest(invalidRequest);
    } catch (error) {
      expect(error).toBeTruthy();
    }
  });

  test('should handle unknown methods', async () => {
    await startServer(serverPort);

    const request = createMCPRequest('unknown/method');
    const response = await sendMCPRequest(request);
    const parsed = parseMCPResponse(response);

    expect(parsed).toHaveProperty('error');
    expect(parsed.error).toHaveProperty('code');
    expect(parsed.error).toHaveProperty('message');
  });

  test('should validate tool input parameters', async () => {
    await startServer(serverPort);

    const request = createMCPRequest('tools/call', {
      name: 'get_quote',
      arguments: {
        symbols: []
      }
    });

    const response = await sendMCPRequest(request);
    const parsed = parseMCPResponse(response);

    expect(parsed).toHaveProperty('error');
  });

  test('should handle graceful shutdown', async () => {
    await startServer(serverPort);
    expect(serverProcess).not.toBeNull();

    await stopServer();
    expect(serverProcess).toBeNull();
  });

  test('should maintain server state across multiple requests', async () => {
    await startServer(serverPort);

    const request1 = createMCPRequest('tools/list');
    const response1 = await sendMCPRequest(request1);
    const parsed1 = parseMCPResponse(response1);

    const request2 = createMCPRequest('resources/list');
    const response2 = await sendMCPRequest(request2);
    const parsed2 = parseMCPResponse(response2);

    expect(parsed1.result.tools.length).toBeGreaterThan(0);
    expect(parsed2.result.resources.length).toBeGreaterThan(0);
  });

  test('should handle concurrent requests', async () => {
    await startServer(serverPort);

    const requests = [
      createMCPRequest('tools/list', {}, 1),
      createMCPRequest('resources/list', {}, 2),
      createMCPRequest('prompts/list', {}, 3)
    ];

    const responses = await Promise.all(
      requests.map(req => sendMCPRequest(req))
    );

    responses.forEach(response => {
      const parsed = parseMCPResponse(response);
      expect(parsed).toHaveProperty('result');
    });
  });

  test('should handle tool execution errors gracefully', async () => {
    await startServer(serverPort);

    const request = createMCPRequest('tools/call', {
      name: 'get_quote',
      arguments: {
        symbols: ['INVALID_SYMBOL_THAT_DOES_NOT_EXIST_12345']
      }
    });

    const response = await sendMCPRequest(request);
    const parsed = parseMCPResponse(response);

    expect(parsed).toHaveProperty('result');
    expect(parsed.result).toHaveProperty('content');
    expect(parsed.result.content).toBeInstanceOf(Array);
  });

  test('should provide proper error responses for missing parameters', async () => {
    await startServer(serverPort);

    const request = createMCPRequest('tools/call', {
      name: 'get_quote'
    });

    const response = await sendMCPRequest(request);
    const parsed = parseMCPResponse(response);

    expect(parsed).toHaveProperty('error');
  });
});
