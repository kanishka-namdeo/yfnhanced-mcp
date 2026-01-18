import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Prompt Execution E2E Tests', () => {
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

  describe('Prompt listing', () => {
    test('should list all available prompts', async () => {
      const request = createMCPRequest('prompts/list');
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('prompts');
      expect(Array.isArray(response.result.prompts)).toBe(true);

      const promptNames = response.result.prompts.map((p: { name: string }) => p.name);
      expect(promptNames).toContain('analyze_stock');
      expect(promptNames).toContain('compare_stocks');
      expect(promptNames).toContain('financial_health_check');
      expect(promptNames).toContain('earnings_analysis');
      expect(promptNames).toContain('market_overview');
      expect(promptNames).toContain('portfolio_due_diligence');
    });

    test('should provide prompt metadata', async () => {
      const request = createMCPRequest('prompts/list');
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result.prompts[0]).toHaveProperty('name');
      expect(response.result.prompts[0]).toHaveProperty('description');
      expect(response.result.prompts[0]).toHaveProperty('arguments');
      expect(Array.isArray(response.result.prompts[0].arguments)).toBe(true);
    });

    test('should include argument definitions', async () => {
      const request = createMCPRequest('prompts/list');
      const response = await sendMCPRequest(request);

      const analyzeStockPrompt = response.result.prompts.find((p: { name: string }) => p.name === 'analyze_stock');
      expect(analyzeStockPrompt).toBeDefined();
      expect(analyzeStockPrompt.arguments[0]).toHaveProperty('name');
      expect(analyzeStockPrompt.arguments[0]).toHaveProperty('description');
      expect(analyzeStockPrompt.arguments[0]).toHaveProperty('required');
    });
  });

  describe('analyze_stock prompt', () => {
    test('should execute analyze_stock prompt', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'analyze_stock',
        arguments: {
          symbol: 'AAPL',
          include_recommendations: 'true'
        }
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('messages');
      expect(Array.isArray(response.result.messages)).toBe(true);
      expect(response.result.messages[0]).toHaveProperty('role');
      expect(response.result.messages[0]).toHaveProperty('content');
      expect(response.result.messages[0].role).toBe('user');
    });

    test('should include symbol in analyze_stock prompt', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'analyze_stock',
        arguments: {
          symbol: 'AAPL'
        }
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('AAPL');
    });

    test('should include recommendations when requested', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'analyze_stock',
        arguments: {
          symbol: 'AAPL',
          include_recommendations: 'true'
        }
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('Analyst recommendations');
    });

    test('should work without recommendations', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'analyze_stock',
        arguments: {
          symbol: 'AAPL',
          include_recommendations: 'false'
        }
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('messages');
    });
  });

  describe('compare_stocks prompt', () => {
    test('should execute compare_stocks prompt', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'compare_stocks',
        arguments: {
          symbols: 'AAPL,MSFT,GOOGL'
        }
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('messages');
      expect(response.result.messages[0]).toHaveProperty('role');
      expect(response.result.messages[0].role).toBe('user');
    });

    test('should include symbols in compare_stocks prompt', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'compare_stocks',
        arguments: {
          symbols: 'AAPL,MSFT,GOOGL'
        }
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('AAPL');
      expect(content).toContain('MSFT');
      expect(content).toContain('GOOGL');
    });

    test('should include custom metrics when specified', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'compare_stocks',
        arguments: {
          symbols: 'AAPL,MSFT',
          metrics: 'P/E,market cap,revenue'
        }
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('P/E');
      expect(content).toContain('market cap');
      expect(content).toContain('revenue');
    });

    test('should use default metrics when not specified', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'compare_stocks',
        arguments: {
          symbols: 'AAPL,MSFT'
        }
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('Valuation metrics');
      expect(content).toContain('P/E');
    });
  });

  describe('financial_health_check prompt', () => {
    test('should execute financial_health_check prompt', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'financial_health_check',
        arguments: {
          symbol: 'AAPL'
        }
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('messages');
      expect(response.result.messages[0]).toHaveProperty('role');
      expect(response.result.messages[0].role).toBe('user');
    });

    test('should include symbol in financial_health_check prompt', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'financial_health_check',
        arguments: {
          symbol: 'AAPL'
        }
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('AAPL');
    });

    test('should include financial ratios', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'financial_health_check',
        arguments: {
          symbol: 'AAPL'
        }
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('Liquidity ratios');
      expect(content).toContain('Solvency ratios');
      expect(content).toContain('Profitability ratios');
      expect(content).toContain('Efficiency ratios');
    });

    test('should include health rating request', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'financial_health_check',
        arguments: {
          symbol: 'AAPL'
        }
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('health rating');
      expect(content).toContain('Excellent');
      expect(content).toContain('Good');
      expect(content).toContain('Fair');
      expect(content).toContain('Poor');
    });
  });

  describe('earnings_analysis prompt', () => {
    test('should execute earnings_analysis prompt', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'earnings_analysis',
        arguments: {
          symbol: 'AAPL'
        }
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('messages');
      expect(response.result.messages[0]).toHaveProperty('role');
      expect(response.result.messages[0].role).toBe('user');
    });

    test('should include symbol in earnings_analysis prompt', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'earnings_analysis',
        arguments: {
          symbol: 'AAPL'
        }
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('AAPL');
    });

    test('should use default quarters when not specified', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'earnings_analysis',
        arguments: {
          symbol: 'AAPL'
        }
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('8 quarters');
    });

    test('should use custom quarters when specified', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'earnings_analysis',
        arguments: {
          symbol: 'AAPL',
          quarters: '12'
        }
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('12 quarters');
    });

    test('should include earnings trend analysis', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'earnings_analysis',
        arguments: {
          symbol: 'AAPL'
        }
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('Quarterly earnings trend');
      expect(content).toContain('Earnings surprise analysis');
      expect(content).toContain('Revenue growth trends');
    });
  });

  describe('market_overview prompt', () => {
    test('should execute market_overview prompt', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'market_overview',
        arguments: {}
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('messages');
      expect(response.result.messages[0]).toHaveProperty('role');
      expect(response.result.messages[0].role).toBe('user');
    });

    test('should use default region when not specified', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'market_overview',
        arguments: {}
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('US markets');
    });

    test('should use custom region when specified', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'market_overview',
        arguments: {
          region: 'EU'
        }
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('EU markets');
    });

    test('should include market overview components', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'market_overview',
        arguments: {}
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('Major index performance');
      expect(content).toContain('Trending stocks');
      expect(content).toContain('Sector performance');
      expect(content).toContain('Market sentiment indicators');
    });
  });

  describe('portfolio_due_diligence prompt', () => {
    test('should execute portfolio_due_diligence prompt', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'portfolio_due_diligence',
        arguments: {
          symbols: 'AAPL,MSFT,GOOGL'
        }
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('messages');
      expect(response.result.messages[0]).toHaveProperty('role');
      expect(response.result.messages[0].role).toBe('user');
    });

    test('should include symbols in portfolio_due_diligence prompt', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'portfolio_due_diligence',
        arguments: {
          symbols: 'AAPL,MSFT,GOOGL'
        }
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('AAPL');
      expect(content).toContain('MSFT');
      expect(content).toContain('GOOGL');
    });

    test('should use default risk tolerance when not specified', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'portfolio_due_diligence',
        arguments: {
          symbols: 'AAPL,MSFT'
        }
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('moderate risk tolerance');
    });

    test('should use custom risk tolerance when specified', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'portfolio_due_diligence',
        arguments: {
          symbols: 'AAPL,MSFT',
          risk_tolerance: 'high'
        }
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('high risk tolerance');
    });

    test('should include portfolio analysis components', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'portfolio_due_diligence',
        arguments: {
          symbols: 'AAPL,MSFT'
        }
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(content).toContain('Current financial health');
      expect(content).toContain('Valuation assessment');
      expect(content).toContain('Growth prospects');
      expect(content).toContain('Diversification assessment');
      expect(content).toContain('Concentration risks');
    });
  });

  describe('Error handling', () => {
    test('should handle unknown prompt name', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'unknown_prompt',
        arguments: {}
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('error');
      expect(response.error).toHaveProperty('message');
      expect(response.error.message).toContain('Unknown prompt');
    });

    test('should handle missing required arguments', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'analyze_stock',
        arguments: {}
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('messages');
    });

    test('should handle invalid argument values', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'compare_stocks',
        arguments: {
          symbols: ''
        }
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });

  describe('Concurrent prompt execution', () => {
    test('should handle multiple concurrent prompt calls', async () => {
      const requests = [
        createMCPRequest('prompts/get', {
          name: 'analyze_stock',
          arguments: { symbol: 'AAPL' }
        }, 1),
        createMCPRequest('prompts/get', {
          name: 'analyze_stock',
          arguments: { symbol: 'MSFT' }
        }, 2),
        createMCPRequest('prompts/get', {
          name: 'analyze_stock',
          arguments: { symbol: 'GOOGL' }
        }, 3)
      ];

      const responses = await Promise.all(
        requests.map(req => sendMCPRequest(req))
      );

      responses.forEach(response => {
        expect(response).toHaveProperty('result');
        expect(response.result).toHaveProperty('messages');
      });
    });

    test('should handle mixed prompt types concurrently', async () => {
      const requests = [
        createMCPRequest('prompts/get', {
          name: 'analyze_stock',
          arguments: { symbol: 'AAPL' }
        }, 1),
        createMCPRequest('prompts/get', {
          name: 'compare_stocks',
          arguments: { symbols: 'MSFT,GOOGL' }
        }, 2),
        createMCPRequest('prompts/get', {
          name: 'financial_health_check',
          arguments: { symbol: 'AMZN' }
        }, 3),
        createMCPRequest('prompts/get', {
          name: 'earnings_analysis',
          arguments: { symbol: 'TSLA' }
        }, 4)
      ];

      const responses = await Promise.all(
        requests.map(req => sendMCPRequest(req))
      );

      responses.forEach(response => {
        expect(response).toHaveProperty('result');
        expect(response.result).toHaveProperty('messages');
      });
    });
  });

  describe('Prompt message structure', () => {
    test('should return properly formatted messages', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'analyze_stock',
        arguments: { symbol: 'AAPL' }
      });
      const response = await sendMCPRequest(request);

      expect(response.result.messages[0]).toHaveProperty('role');
      expect(response.result.messages[0]).toHaveProperty('content');
      expect(response.result.messages[0].content).toHaveProperty('type');
      expect(response.result.messages[0].content).toHaveProperty('text');
      expect(response.result.messages[0].role).toBe('user');
      expect(response.result.messages[0].content.type).toBe('text');
    });

    test('should include descriptive content in messages', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'analyze_stock',
        arguments: { symbol: 'AAPL' }
      });
      const response = await sendMCPRequest(request);

      const content = response.result.messages[0].content.text;
      expect(typeof content).toBe('string');
      expect(content.length).toBeGreaterThan(0);
      expect(content).toContain('Perform a comprehensive analysis');
    });
  });

  describe('Argument handling', () => {
    test('should handle boolean arguments', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'analyze_stock',
        arguments: {
          symbol: 'AAPL',
          include_recommendations: 'true'
        }
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should handle numeric arguments', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'earnings_analysis',
        arguments: {
          symbol: 'AAPL',
          quarters: '12'
        }
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });

    test('should handle string arguments with commas', async () => {
      const request = createMCPRequest('prompts/get', {
        name: 'compare_stocks',
        arguments: {
          symbols: 'AAPL,MSFT,GOOGL,AMZN,TSLA'
        }
      });
      const response = await sendMCPRequest(request);

      expect(response).toHaveProperty('result');
    });
  });
});
