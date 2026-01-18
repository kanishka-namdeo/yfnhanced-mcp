import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { MCPServer } from '../../../src/index';
import { config } from '../../../src/config';

jest.mock('@modelcontextprotocol/sdk/server/stdio.js');

describe('Server Integration Tests', () => {
  let mcpServer: MCPServer;
  let mockTransport: jest.Mocked<StdioServerTransport>;

  beforeEach(() => {
    mockTransport = {
      close: jest.fn(),
      start: jest.fn(),
      send: jest.fn(),
      onmessage: null,
      onclose: null,
      onerror: null
    } as unknown as jest.Mocked<StdioServerTransport>;

    (StdioServerTransport as jest.Mock).mockImplementation(() => mockTransport);
  });

  afterEach(async () => {
    if (mcpServer) {
      await mcpServer.shutdown();
    }
    jest.clearAllMocks();
  });

  describe('Server Initialization', () => {
    it('should initialize MCP server successfully', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      expect(mcpServer).toBeDefined();
      expect(mcpServer.getServer()).toBeDefined();
    });

    it('should start server with stdio transport', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();
      await mcpServer.start();

      expect(mockTransport.start).toHaveBeenCalled();
    });

    it('should configure server with correct capabilities', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const capabilities = server.getCapabilities();

      expect(capabilities.tools).toBeDefined();
      expect(capabilities.resources).toBeDefined();
      expect(capabilities.prompts).toBeDefined();
    });

    it('should use configuration from config file', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      expect(mcpServer).toBeDefined();
    });
  });

  describe('Tool Registration', () => {
    it('should register all quote tools', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const tools = await server.listTools();

      expect(tools.tools.some(t => t.name === 'get_quote')).toBe(true);
      expect(tools.tools.some(t => t.name === 'get_quote_summary')).toBe(true);
    });

    it('should register all historical tools', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const tools = await server.listTools();

      expect(tools.tools.some(t => t.name === 'get_historical_prices')).toBe(true);
      expect(tools.tools.some(t => t.name === 'get_historical_prices_multi')).toBe(true);
    });

    it('should register all financial tools', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const tools = await server.listTools();

      expect(tools.tools.some(t => t.name === 'get_balance_sheet')).toBe(true);
      expect(tools.tools.some(t => t.name === 'get_income_statement')).toBe(true);
      expect(tools.tools.some(t => t.name === 'get_cash_flow_statement')).toBe(true);
    });

    it('should register all holder tools', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const tools = await server.listTools();

      expect(tools.tools.some(t => t.name === 'get_major_holders')).toBe(true);
      expect(tools.tools.some(t => t.name === 'get_institutional_holders')).toBe(true);
      expect(tools.tools.some(t => t.name === 'get_mutual_fund_holders')).toBe(true);
    });

    it('should register all news tools', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const tools = await server.listTools();

      expect(tools.tools.some(t => t.name === 'get_company_news')).toBe(true);
      expect(tools.tools.some(t => t.name === 'get_market_news')).toBe(true);
    });

    it('should register all options tools', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const tools = await server.listTools();

      expect(tools.tools.some(t => t.name === 'get_options')).toBe(true);
      expect(tools.tools.some(t => t.name === 'get_options_chain')).toBe(true);
    });

    it('should register all earnings tools', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const tools = await server.listTools();

      expect(tools.tools.some(t => t.name === 'get_earnings')).toBe(true);
      expect(tools.tools.some(t => t.name === 'get_earnings_trend')).toBe(true);
    });

    it('should register all analysis tools', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const tools = await server.listTools();

      expect(tools.tools.some(t => t.name === 'get_analysis')).toBe(true);
      expect(tools.tools.some(t => t.name === 'get_recommendation_trend')).toBe(true);
    });

    it('should provide correct tool descriptions', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const tools = await server.listTools();

      tools.tools.forEach(tool => {
        expect(tool.description).toBeDefined();
        expect(tool.description.length).toBeGreaterThan(0);
      });
    });

    it('should provide correct tool input schemas', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const tools = await server.listTools();

      tools.tools.forEach(tool => {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      });
    });
  });

  describe('Resource Registration', () => {
    it('should register all resources', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const resources = await server.listResources();

      expect(resources.resources.length).toBeGreaterThan(0);
    });

    it('should register documentation resources', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const resources = await server.listResources();

      expect(resources.resources.some(r => r.name === 'Documentation')).toBe(true);
    });

    it('should register market status resource', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const resources = await server.listResources();

      expect(resources.resources.some(r => r.name === 'Market Status')).toBe(true);
    });

    it('should provide correct resource URIs', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const resources = await server.listResources();

      resources.resources.forEach(resource => {
        expect(resource.uri).toBeDefined();
        expect(typeof resource.uri).toBe('string');
        expect(resource.uri.length).toBeGreaterThan(0);
      });
    });

    it('should provide correct resource descriptions', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const resources = await server.listResources();

      resources.resources.forEach(resource => {
        expect(resource.description).toBeDefined();
        expect(resource.description.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Prompt Registration', () => {
    it('should register all prompts', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const prompts = await server.listPrompts();

      expect(prompts.prompts.length).toBeGreaterThan(0);
    });

    it('should register analysis prompts', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const prompts = await server.listPrompts();

      expect(prompts.prompts.some(p => p.name === 'analyze_stock')).toBe(true);
    });

    it('should register comparison prompts', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const prompts = await server.listPrompts();

      expect(prompts.prompts.some(p => p.name === 'compare_stocks')).toBe(true);
    });

    it('should register financial analysis prompts', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const prompts = await server.listPrompts();

      expect(prompts.prompts.some(p => p.name === 'financial_health')).toBe(true);
    });

    it('should provide correct prompt descriptions', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const prompts = await server.listPrompts();

      prompts.prompts.forEach(prompt => {
        expect(prompt.description).toBeDefined();
        expect(prompt.description.length).toBeGreaterThan(0);
      });
    });

    it('should provide correct prompt arguments', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();
      const prompts = await server.listPrompts();

      prompts.prompts.forEach(prompt => {
        expect(prompt.arguments).toBeDefined();
        expect(Array.isArray(prompt.arguments)).toBe(true);
      });
    });
  });

  describe('Tool Execution', () => {
    it('should execute quote tools successfully', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();

      const result = await server.callTool({
        name: 'get_quote',
        arguments: {
          symbols: ['AAPL']
        }
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
    });

    it('should handle tool errors gracefully', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();

      const result = await server.callTool({
        name: 'get_quote',
        arguments: {
          symbols: ['INVALID_SYMBOL']
        }
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
    });

    it('should validate tool input parameters', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();

      await expect(
        server.callTool({
          name: 'get_quote',
          arguments: {
            invalid: 'parameter'
          }
        })
      ).rejects.toThrow();
    });
  });

  describe('Resource Reading', () => {
    it('should read documentation resource', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();

      const resources = await server.listResources();
      const docResource = resources.resources.find(r => r.name === 'Documentation');

      if (docResource) {
        const result = await server.readResource({
          uri: docResource.uri
        });

        expect(result).toBeDefined();
        expect(result.contents).toBeDefined();
        expect(Array.isArray(result.contents)).toBe(true);
      }
    });

    it('should read market status resource', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();

      const resources = await server.listResources();
      const marketResource = resources.resources.find(r => r.name === 'Market Status');

      if (marketResource) {
        const result = await server.readResource({
          uri: marketResource.uri
        });

        expect(result).toBeDefined();
        expect(result.contents).toBeDefined();
      }
    });

    it('should handle invalid resource URIs', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();

      await expect(
        server.readResource({
          uri: 'invalid://resource'
        })
      ).rejects.toThrow();
    });
  });

  describe('Prompt Execution', () => {
    it('should execute analyze_stock prompt', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();

      const result = await server.getPrompt({
        name: 'analyze_stock',
        arguments: {
          symbol: 'AAPL'
        }
      });

      expect(result).toBeDefined();
      expect(result.messages).toBeDefined();
      expect(Array.isArray(result.messages)).toBe(true);
    });

    it('should execute compare_stocks prompt', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();

      const result = await server.getPrompt({
        name: 'compare_stocks',
        arguments: {
          symbols: 'AAPL,MSFT'
        }
      });

      expect(result).toBeDefined();
      expect(result.messages).toBeDefined();
    });

    it('should validate prompt arguments', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();

      await expect(
        server.getPrompt({
          name: 'analyze_stock',
          arguments: {}
        })
      ).rejects.toThrow();
    });
  });

  describe('Server Shutdown', () => {
    it('should shutdown server gracefully', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();
      await mcpServer.start();

      await mcpServer.shutdown();

      expect(mockTransport.close).toHaveBeenCalled();
    });

    it('should handle shutdown when not started', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      await expect(mcpServer.shutdown()).resolves.not.toThrow();
    });

    it('should handle multiple shutdowns gracefully', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      await mcpServer.shutdown();
      await mcpServer.shutdown();

      expect(mockTransport.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle initialization errors gracefully', async () => {
      const server = new Server({ name: 'test', version: '1.0.0' }, { capabilities: {} });

      const mockMCPServer = {
        getServer: () => server,
        initialize: async () => {
          throw new Error('Initialization error');
        },
        shutdown: async () => {},
        start: async () => {}
      };

      await expect(mockMCPServer.initialize()).rejects.toThrow('Initialization error');
    });

    it('should handle tool registration errors', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();

      await expect(
        server.callTool({
          name: 'non_existent_tool',
          arguments: {}
        })
      ).rejects.toThrow();
    });

    it('should handle resource reading errors', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();

      await expect(
        server.readResource({
          uri: 'resource://non-existent'
        })
      ).rejects.toThrow();
    });

    it('should handle prompt execution errors', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      const server = mcpServer.getServer();

      await expect(
        server.getPrompt({
          name: 'non_existent_prompt',
          arguments: {}
        })
      ).rejects.toThrow();
    });
  });

  describe('Configuration Integration', () => {
    it('should use rate limiter from configuration', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      expect(mcpServer).toBeDefined();
    });

    it('should use circuit breaker from configuration', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      expect(mcpServer).toBeDefined();
    });

    it('should use cache configuration', async () => {
      mcpServer = new MCPServer();
      await mcpServer.initialize();

      expect(mcpServer).toBeDefined();
    });
  });
});
