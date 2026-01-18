import { spawn } from 'child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readFileSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class MCPTestClient {
  constructor() {
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.tools = [];
    this.resources = [];
    this.prompts = [];
  }

  async connect() {
    console.log('Starting MCP server...');
    this.serverProcess = spawn('node', ['dist/index.js'], {
      cwd: __dirname,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.serverProcess.stdout.on('data', (data) => {
      this.handleMessage(data.toString());
    });

    this.serverProcess.stderr.on('data', (data) => {
      const stderr = data.toString().trim();
      if (stderr && !stderr.includes('Please consider completing')) {
        console.log('[Server stderr]:', stderr);
      }
    });

    this.serverProcess.on('error', (error) => {
      console.error('Server process error:', error);
    });

    this.serverProcess.on('exit', (code) => {
      console.log(`Server process exited with code ${code}`);
    });

    await this.initialize();
  }

  async initialize() {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const response = await this.sendRequest({
      jsonrpc: '2.0',
      id: ++this.messageId,
      method: 'initialize',
      params: {
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
      }
    });

    if (response.error) {
      throw new Error(`Initialization failed: ${JSON.stringify(response.error)}`);
    }

    await this.sendNotification({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    });

    console.log('✅ MCP Client initialized successfully');
    return response.result;
  }

  async listTools() {
    const response = await this.sendRequest({
      jsonrpc: '2.0',
      id: ++this.messageId,
      method: 'tools/list'
    });

    if (response.error) {
      throw new Error(`Failed to list tools: ${JSON.stringify(response.error)}`);
    }

    this.tools = response.result.tools;
    console.log(`\n📊 Available Tools (${this.tools.length}):`);
    this.tools.forEach(tool => {
      console.log(`  • ${tool.name}: ${tool.description.substring(0, 60)}...`);
    });

    return this.tools;
  }

  async listResources() {
    const response = await this.sendRequest({
      jsonrpc: '2.0',
      id: ++this.messageId,
      method: 'resources/list'
    });

    if (response.error) {
      throw new Error(`Failed to list resources: ${JSON.stringify(response.error)}`);
    }

    this.resources = response.result.resources;
    console.log(`\n📁 Available Resources (${this.resources.length}):`);
    this.resources.forEach(resource => {
      console.log(`  • ${resource.uri}: ${resource.name}`);
    });

    return this.resources;
  }

  async listPrompts() {
    const response = await this.sendRequest({
      jsonrpc: '2.0',
      id: ++this.messageId,
      method: 'prompts/list'
    });

    if (response.error) {
      throw new Error(`Failed to list prompts: ${JSON.stringify(response.error)}`);
    }

    this.prompts = response.result.prompts;
    console.log(`\n💡 Available Prompts (${this.prompts.length}):`);
    this.prompts.forEach(prompt => {
      console.log(`  • ${prompt.name}: ${prompt.description.substring(0, 60)}...`);
    });

    return this.prompts;
  }

  async callTool(toolName, args = {}) {
    console.log(`\n🔧 Calling tool: ${toolName}`);
    console.log(`   Arguments:`, JSON.stringify(args, null, 2));

    const response = await this.sendRequest({
      jsonrpc: '2.0',
      id: ++this.messageId,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    });

    if (response.error) {
      console.error(`❌ Tool call failed:`, response.error);
      throw new Error(`Tool call failed: ${JSON.stringify(response.error)}`);
    }

    const result = response.result;
    if (result.content && result.content.length > 0) {
      const textContent = result.content.find(c => c.type === 'text');
      if (textContent) {
        try {
          const data = JSON.parse(textContent.text);
          console.log(`✅ Tool result:`, JSON.stringify(data, null, 2));
        } catch {
          console.log(`✅ Tool result:`, textContent.text);
        }
      }
    }

    if (result.isError) {
      console.error('⚠️ Tool returned an error');
    }

    return result;
  }

  async readResource(uri) {
    console.log(`\n📖 Reading resource: ${uri}`);

    const response = await this.sendRequest({
      jsonrpc: '2.0',
      id: ++this.messageId,
      method: 'resources/read',
      params: { uri }
    });

    if (response.error) {
      throw new Error(`Failed to read resource: ${JSON.stringify(response.error)}`);
    }

    console.log(`✅ Resource content:`, JSON.stringify(response.result, null, 2));
    return response.result;
  }

  sendRequest(request) {
    return new Promise((resolve, reject) => {
      const id = request.id;
      this.pendingRequests.set(id, { resolve, reject });

      const message = JSON.stringify(request) + '\n';
      this.serverProcess.stdin.write(message);

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout for ${request.method || 'unknown'}`));
      }, 30000);
    });
  }

  sendNotification(notification) {
    const message = JSON.stringify(notification) + '\n';
    this.serverProcess.stdin.write(message);
  }

  handleMessage(data) {
    const lines = data.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      try {
        const message = JSON.parse(line);
        
        if (message.id && this.pendingRequests.has(message.id)) {
          const { resolve, reject } = this.pendingRequests.get(message.id);
          clearTimeout(this.pendingRequests.get(message.id).timeout);
          this.pendingRequests.delete(message.id);
          
          if (message.error) {
            reject(message.error);
          } else {
            resolve(message);
          }
        }
      } catch (error) {
        console.error('Failed to parse message:', error, 'Line:', line);
      }
    }
  }

  async disconnect() {
    console.log('\n👋 Disconnecting...');
    
    await this.sendNotification({
      jsonrpc: '2.0',
      method: 'notifications/cancelled'
    });

    setTimeout(() => {
      this.serverProcess.kill();
    }, 500);
  }
}

async function runTests() {
  const client = new MCPTestClient();

  try {
    await client.connect();

    await client.listTools();
    await client.listResources();
    await client.listPrompts();

    console.log('\n🧪 Testing tools...\n');

    try {
      await client.callTool('get_quote', {
        symbols: ['AAPL', 'MSFT', 'GOOGL']
      });
    } catch (error) {
      console.error('❌ get_quote test failed:', error.message);
    }

    try {
      await client.callTool('get_earnings', {
        symbol: 'AAPL',
        limit: 4
      });
    } catch (error) {
      console.error('❌ get_earnings test failed:', error.message);
    }

    try {
      await client.callTool('get_trending_symbols', {
        region: 'US'
      });
    } catch (error) {
      console.error('❌ get_trending_symbols test failed:', error.message);
    }

    console.log('\n✅ All tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await client.disconnect();
  }
}

runTests().catch(console.error);
