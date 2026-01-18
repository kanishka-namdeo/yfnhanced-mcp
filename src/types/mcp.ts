export type ToolInputSchema = Record<string, unknown>;

export type ToolContentItem = {
  type: string;
  text?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ToolOutput = {
  content: ToolContentItem[];
  isError?: boolean;
  _meta?: Record<string, unknown>;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: ToolInputSchema;
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

export type ResourceContent = {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
  [key: string]: unknown;
};

export type ResourceDefinition = {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  annotations?: {
    audience?: string;
    priority?: number;
    [key: string]: unknown;
  };
};

export type PromptMessage = {
  role: 'user' | 'assistant' | 'system';
  content: {
    type: string;
    text?: string;
    data?: Record<string, unknown>;
    [key: string]: unknown;
  };
};

export type PromptArgument = {
  name: string;
  description?: string;
  required?: boolean;
};

export type PromptDefinition = {
  name: string;
  description?: string;
  arguments?: PromptArgument[];
  annotations?: {
    audience?: string;
    priority?: number;
    [key: string]: unknown;
  };
};

export type MCPServerCapabilities = {
  tools: {
    listChanged?: boolean;
  };
  resources?: {
    subscribe?: boolean;
    listChanged?: boolean;
  };
  prompts?: {
    listChanged?: boolean;
  };
  logging?: {
    level?: 'debug' | 'info' | 'notice' | 'warning' | 'error' | 'critical' | 'alert' | 'emergency';
  };
};

export type MCPServerInfo = {
  name: string;
  version: string;
  protocolVersion: string;
  [key: string]: unknown;
};

export type MCPServerConfig = {
  serverInfo: MCPServerInfo;
  capabilities: MCPServerCapabilities;
  transport: 'stdio' | 'sse';
  port?: number;
  host?: string;
  [key: string]: unknown;
};

export type MCPRequest = {
  jsonrpc: '2.0';
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
};

export type MCPResponse = {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export type MCPNotification = {
  jsonrpc: '2.0';
  method: string;
  params?: Record<string, unknown>;
};

export type ToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type ToolCallResult = {
  toolCallId: string;
  output: ToolOutput;
};

export type SamplingRequest = {
  maxTokens: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  systemPrompt?: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
  }>;
  includeContext?: string;
  metadata?: Record<string, unknown>;
};

export type SamplingResponse = {
  model: string;
  role: 'assistant';
  content: {
    type: string;
    text?: string;
    data?: Record<string, unknown>;
  };
  stopReason?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};
