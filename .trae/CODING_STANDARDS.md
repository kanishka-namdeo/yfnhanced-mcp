# Coding Standards - Yahoo Finance MCP Server

This document defines the coding standards and conventions all agents and developers must follow when contributing to the Yahoo Finance MCP Server project. These standards ensure code quality, consistency, and maintainability across the entire codebase.

---

## Table of Contents

1. [Code Style Conventions](#code-style-conventions)
2. [TypeScript Strict Mode Requirements](#typescript-strict-mode-requirements)
3. [Error Handling Patterns](#error-handling-patterns)
4. [File Naming Conventions](#file-naming-conventions)
5. [Import/Export Patterns](#importexport-patterns)
6. [Testing Conventions](#testing-conventions)
7. [Documentation Standards](#documentation-standards)

---

## Code Style Conventions

### Comments Policy

**CRITICAL: No comments in code unless explicitly requested**

- Code should be self-documenting through clear naming and structure
- Comments create maintenance burden and can become outdated
- If complex logic requires explanation, consider refactoring instead
- Only add comments when explicitly requested by the user or for complex business logic that cannot be made self-explanatory

### Code Formatting

Use Prettier with the following configuration:

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": false,
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

### Variable and Function Naming

- Use **camelCase** for variables and functions
- Use **PascalCase** for classes, interfaces, and types
- Use **UPPER_SNAKE_CASE** for constants
- Names should be descriptive and self-explanatory
- Avoid abbreviations unless widely understood (e.g., `http`, `api`, `url`)

```typescript
const maxRetries = 3;
const requestTimeout = 30000;

async function fetchQuoteData(symbol: string): Promise<QuoteData> {
}

class YahooFinanceClient {
}

interface ApiResponse<T> {
}
```

### Function and Method Organization

- Keep functions focused on a single responsibility
- Prefer pure functions without side effects where possible
- Limit function length to ~50 lines when practical
- Order parameters: required first, optional last

```typescript
function processData(
  requiredParam: string,
  optionalParam?: number,
  callback?: () => void
): void {
}
```

### Type Definitions

- Use interfaces for object shapes
- Use type aliases for unions, primitives, and complex types
- Prefer explicit types over inferred types in public APIs
- Use readonly modifiers for immutable properties

```typescript
interface QuoteData {
  readonly symbol: string;
  readonly price: number;
  readonly change: number;
}

type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;
```

### Code Organization

- Group related functionality together
- Use early returns to reduce nesting
- Avoid deep nesting (max 3-4 levels)
- Use guard clauses for validation

```typescript
function processRequest(request: Request): Response {
  if (!request.isValid()) {
    return errorResponse('Invalid request');
  }

  if (request.isCached()) {
    return cachedResponse(request);
  }

  return processNewRequest(request);
}
```

### Async/Await Patterns

- Use async/await over Promises for better readability
- Always handle errors with try/catch
- Use Promise.all() for parallel independent operations
- Use Promise.allSettled() when partial failure is acceptable

```typescript
async function fetchMultipleQuotes(symbols: string[]): Promise<QuoteData[]> {
  const results = await Promise.allSettled(
    symbols.map(symbol => fetchQuote(symbol))
  );

  return results
    .filter((result): result is PromiseFulfilledResult<QuoteData> => 
      result.status === 'fulfilled'
    )
    .map(result => result.value);
}
```

---

## TypeScript Strict Mode Requirements

### Compiler Configuration

The project MUST use TypeScript strict mode with the following `tsconfig.json` settings:

```json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictPropertyInitialization": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true
  }
}
```

### Strict Null Checks

- All types must explicitly handle null and undefined
- Use optional chaining (`?.`) for safe property access
- Use nullish coalescing (`??`) for default values
- Avoid non-null assertions (`!`) - use proper guards instead

```typescript
interface User {
  name: string;
  email?: string | null;
}

function sendEmail(user: User): void {
  const email = user.email ?? 'default@example.com';
  console.log(`Sending to ${email}`);
}

function getUserEmail(user: User | null): string | null {
  return user?.email ?? null;
}
```

### Strict Function Types

- Function parameter types must match exactly for assignment
- Use generic constraints properly
- Avoid `any` and `unknown` without proper type guards

```typescript
type Fn = (a: string) => void;

const f1: Fn = (a) => console.log(a.toUpperCase());
const f2: Fn = (a: string) => console.log(a.toUpperCase());
```

### Strict Property Initialization

- All class properties must be initialized in constructor
- Use definite assignment assertions only when absolutely necessary
- Consider using readonly for properties that should not change

```typescript
class Service {
  private readonly apiKey: string;
  private initialized: boolean;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.initialized = false;
  }

  initialize(): void {
    this.initialized = true;
  }
}
```

### Type Guards and Assertions

- Use type predicates for custom type guards
- Use discriminated unions for type narrowing
- Implement proper runtime validation with Zod

```typescript
interface Success {
  type: 'success';
  data: unknown;
}

interface Error {
  type: 'error';
  error: unknown;
}

type Result = Success | Error;

function isSuccess(result: Result): result is Success {
  return result.type === 'success';
}

function processResult(result: Result): void {
  if (isSuccess(result)) {
    console.log(result.data);
  }
}
```

---

## Error Handling Patterns

### YahooFinanceError Class

All custom errors MUST extend the `YahooFinanceError` base class:

```typescript
class YahooFinanceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'YahooFinanceError';
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
      stack: this.stack
    };
  }
}
```

### Error Codes

Use these predefined error codes consistently:

| Code | Description | Usage |
|------|-------------|-------|
| `YF_ERR_RATE_LIMIT` | Rate limit exceeded | When API rate limit is hit |
| `YF_ERR_API_CHANGED` | API structure changed | When response format is unexpected |
| `YF_ERR_DATA_UNAVAILABLE` | Data not available | When requested data doesn't exist |
| `YF_ERR_SYMBOL_NOT_FOUND` | Invalid symbol | When ticker symbol is invalid |
| `YF_ERR_NETWORK` | Network error | For connection failures |
| `YF_ERR_TIMEOUT` | Request timeout | When request times out |
| `YF_ERR_SERVER` | Server error | For 5xx responses |
| `YF_ERR_DATA_INCOMPLETE` | Incomplete data | When response is missing required fields |
| `YF_ERR_CIRCUIT_OPEN` | Circuit breaker open | When circuit is open |

### Error Creation Pattern

```typescript
import { YahooFinanceError } from '@/types/errors';

function fetchQuote(symbol: string): Promise<QuoteData> {
  if (!isValidSymbol(symbol)) {
    throw new YahooFinanceError(
      'YF_ERR_SYMBOL_NOT_FOUND',
      `Invalid symbol: ${symbol}`,
      { symbol }
    );
  }
}

async function fetchWithRetry(url: string): Promise<Response> {
  try {
    const response = await fetch(url);
    
    if (response.status === 429) {
      throw new YahooFinanceError(
        'YF_ERR_RATE_LIMIT',
        'Rate limit exceeded',
        { url, retryAfter: response.headers.get('Retry-After') }
      );
    }
    
    if (!response.ok) {
      throw new YahooFinanceError(
        'YF_ERR_SERVER',
        `Server error: ${response.status}`,
        { url, status: response.status }
      );
    }
    
    return response;
  } catch (error) {
    if (error instanceof YahooFinanceError) {
      throw error;
    }
    
    throw new YahooFinanceError(
      'YF_ERR_NETWORK',
      'Network request failed',
      { url, originalError: error instanceof Error ? error.message : String(error) }
    );
  }
}
```

### Error Handling in Async Functions

```typescript
async function fetchQuoteSafe(symbol: string): Promise<QuoteData | YahooFinanceError> {
  try {
    const data = await fetchQuote(symbol);
    return data;
  } catch (error) {
    if (error instanceof YahooFinanceError) {
      return error;
    }
    
    return new YahooFinanceError(
      'YF_ERR_DATA_UNAVAILABLE',
      `Failed to fetch quote for ${symbol}`,
      { symbol, originalError: error }
    );
  }
}
```

### Error Propagation

```typescript
class QuoteService {
  async getQuote(symbol: string): Promise<QuoteData> {
    const result = await this.fetchWithCircuitBreaker(symbol);
    
    if (result instanceof YahooFinanceError) {
      throw result;
    }
    
    return result;
  }

  private async fetchWithCircuitBreaker(symbol: string): Promise<QuoteData | YahooFinanceError> {
    if (this.circuitBreaker.isOpen()) {
      throw new YahooFinanceError(
        'YF_ERR_CIRCUIT_OPEN',
        'Circuit breaker is open',
        { symbol }
      );
    }
    
    return fetchQuoteSafe(symbol);
  }
}
```

### Error Classification

```typescript
function classifyError(error: unknown): YahooFinanceError {
  if (error instanceof YahooFinanceError) {
    return error;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('timeout')) {
      return new YahooFinanceError('YF_ERR_TIMEOUT', error.message);
    }
    
    if (message.includes('network') || message.includes('econnrefused')) {
      return new YahooFinanceError('YF_ERR_NETWORK', error.message);
    }
  }

  return new YahooFinanceError(
    'YF_ERR_DATA_UNAVAILABLE',
    'Unknown error occurred',
    { originalError: String(error) }
  );
}
```

---

## File Naming Conventions

### File Names

- Use **kebab-case** for all file names
- File names should be descriptive and concise
- Avoid abbreviations in file names

```
src/
  tools/
    get-quote.ts
    historical-data.ts
    financial-statements.ts
  middleware/
    rate-limiter.ts
    circuit-breaker.ts
    retry-handler.ts
  utils/
    error-classifier.ts
    data-validator.ts
```

### Directory Structure

Organize by feature/functionality, not by type:

```
src/
  tools/           # MCP tool implementations
  middleware/      # Middleware components
  services/        # External service integrations
  types/           # TypeScript type definitions
  schemas/         # Zod validation schemas
  utils/           # Utility functions
  config/          # Configuration management
  resources/       # MCP resource definitions
  prompts/         # MCP prompt definitions
```

### Class and Interface Names

- Use **PascalCase** for class names
- Use **PascalCase** for interface names
- Prefix interfaces with `I` is NOT required
- Use descriptive names that indicate purpose

```typescript
class YahooFinanceClient {
}

class RateLimiter {
}

class CircuitBreaker {
}

interface ApiResponse<T> {
}

interface QuoteData {
}

interface ErrorDetails {
}
```

### Test File Names

- Test files must end with `.test.ts` or `.spec.ts`
- Place test files in `__tests__` directories alongside source files or in a top-level `tests/` directory

```
src/
  tools/
    get-quote.ts
    __tests__/
      get-quote.test.ts
tests/
  integration/
    quote-tools.test.ts
```

---

## Import/Export Patterns

### Absolute Imports

Always use absolute imports from the `src/` directory:

```typescript
import { YahooFinanceError } from '@/types/errors';
import { fetchQuote } from '@/services/yahoo-finance';
import { quoteSchema } from '@/schemas/quotes';
```

Configure TypeScript path mapping in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

### Barrel Exports

Use `index.ts` files for barrel exports to simplify imports:

```typescript
src/
  types/
    errors.ts
    config.ts
    index.ts          // Barrel export

// src/types/index.ts
export * from './errors';
export * from './config';
```

This allows cleaner imports:

```typescript
import { YahooFinanceError, ApiConfig } from '@/types';
```

### Import Ordering

Organize imports in this order:

1. External dependencies (Node.js, npm packages)
2. Internal absolute imports (from `@/`)
3. Relative imports (from `./` or `../`)
4. Type-only imports

```typescript
import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

import { YahooFinanceError } from '@/types/errors';
import { fetchQuote } from '@/services/yahoo-finance';

import { validateSymbol } from './validators';

import type { QuoteData } from '@/types';
```

### Named Exports

Prefer named exports over default exports:

```typescript
export class YahooFinanceClient {
}

export interface ApiResponse<T> {
}

export async function fetchQuote(symbol: string): Promise<QuoteData> {
}
```

Default exports are allowed only for:
- Main entry points (`src/index.ts`)
- React components (if using React)

### Re-exports

Use re-exports to expose types and utilities:

```typescript
export type { QuoteData, HistoricalData } from './types';
export { fetchQuote, fetchHistorical } from './api';
```

### Circular Dependency Prevention

- Avoid circular dependencies between modules
- Use dependency injection to break circular dependencies
- Consider moving shared types to a separate `types/` module

---

## Testing Conventions

### Test Framework

Use Jest with ts-jest for TypeScript support:

```javascript
// jest.config.js
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  }
};
```

### Test Structure

Use `describe` and `it` (or `test`) for organizing tests:

```typescript
describe('YahooFinanceClient', () => {
  describe('fetchQuote', () => {
    it('should return quote data for valid symbol', async () => {
      const client = new YahooFinanceClient();
      const result = await client.fetchQuote('AAPL');
      
      expect(result).toBeDefined();
      expect(result.symbol).toBe('AAPL');
    });

    it('should throw YahooFinanceError for invalid symbol', async () => {
      const client = new YahooFinanceClient();
      
      await expect(client.fetchQuote('INVALID')).rejects.toThrow(YahooFinanceError);
    });
  });
});
```

### Test Naming

- Use descriptive test names that explain what is being tested
- Use "should" pattern: `should return...`, `should throw...`, `should handle...`
- Test the behavior, not the implementation

```typescript
it('should fetch quote data successfully');
it('should retry on rate limit errors');
it('should return cached data when available');
it('should throw error when symbol not found');
```

### Assertion Patterns

Use `expect` from Jest:

```typescript
expect(actual).toBe(expected);
expect(actual).toEqual(expected);
expect(actual).toBeGreaterThan(10);
expect(array).toContain(item);
expect(fn).toThrow();
expect(fn).toThrowError(YahooFinanceError);
expect(fn).toThrowError('Expected error message');
expect(object).toHaveProperty('property');
expect(object).toMatchObject({ key: 'value' });
```

### Async Testing

Use async/await for async tests:

```typescript
it('should fetch data asynchronously', async () => {
  const result = await fetchData('AAPL');
  expect(result).toBeDefined();
});

it('should handle errors properly', async () => {
  await expect(fetchData('INVALID')).rejects.toThrow(YahooFinanceError);
});
```

### Mocking

Use Jest mocks for external dependencies:

```typescript
import { YahooFinanceClient } from '@/services/yahoo-finance';

jest.mock('@/services/yahoo-finance');

describe('QuoteTool', () => {
  let mockClient: jest.Mocked<YahooFinanceClient>;

  beforeEach(() => {
    mockClient = new YahooFinanceClient() as jest.Mocked<YahooFinanceClient>;
  });

  it('should use client to fetch data', async () => {
    mockClient.fetchQuote.mockResolvedValue({
      symbol: 'AAPL',
      price: 150
    });

    const result = await mockClient.fetchQuote('AAPL');
    expect(mockClient.fetchQuote).toHaveBeenCalledWith('AAPL');
    expect(result.price).toBe(150);
  });
});
```

### Test Coverage

- Maintain >85% code coverage across all metrics
- Focus on critical paths and error handling
- Ensure all public APIs have tests
- Test edge cases and error conditions

### Unit Tests

- Test individual functions and classes in isolation
- Mock external dependencies
- Fast execution (<1 second per test suite)

```typescript
describe('RateLimiter', () => {
  describe('allowRequest', () => {
    it('should return true when under limit', () => {
      const limiter = new RateLimiter(10, 60000);
      expect(limiter.allowRequest()).toBe(true);
    });

    it('should return false when limit exceeded', () => {
      const limiter = new RateLimiter(1, 60000);
      limiter.allowRequest();
      expect(limiter.allowRequest()).toBe(false);
    });
  });
});
```

### Integration Tests

- Test multiple components working together
- Use real or realistic mocks for external services
- Verify end-to-end functionality

```typescript
describe('Quote Tool Integration', () => {
  it('should fetch and validate quote data', async () => {
    const tool = new QuoteTool(yahooFinanceClient);
    const result = await tool.execute({ symbol: 'AAPL' });
    
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(quoteSchema.safeParse(result.data).success).toBe(true);
  });
});
```

### Test Setup and Teardown

Use `beforeEach`, `afterEach`, `beforeAll`, `afterAll` for setup/teardown:

```typescript
describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker(5, 60000);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });
});
```

---

## Documentation Standards

### General Policy

**Documentation is only added when explicitly requested by the user or required for public APIs**

- Internal code should be self-documenting
- Avoid JSDoc comments unless explicitly requested
- Focus on clear, descriptive names instead of documentation

### When Documentation IS Required

Documentation may be added in these cases:

1. **Public APIs** - External-facing interfaces and functions
2. **Complex business logic** - When explicitly requested by user
3. **Configuration options** - When user needs guidance
4. **Setup instructions** - README and installation guides

### README Documentation

When creating documentation files:

```markdown
# Project Name

Brief description of the project.

## Installation

```bash
npm install
```

## Usage

Basic usage examples.

## Configuration

Configuration options and their meanings.

## API Reference

Documentation of public APIs.

## Error Codes

List of error codes and their meanings.
```

### API Documentation (When Requested)

```typescript
export interface ApiConfig {
  apiKey: string;
  timeout?: number;
  retryAttempts?: number;
}

export async function fetchQuote(symbol: string): Promise<QuoteData> {
}
```

### Type Documentation (When Requested)

For complex types, inline comments may be added:

```typescript
interface QuoteData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}
```

### What NOT to Document

Do NOT add comments for:

- Obvious variable assignments
- Simple function implementations
- Type annotations that are self-explanatory
- Import statements
- Console.log statements

```typescript
// BAD - Don't do this:
const price = 100; // Set price to 100

// GOOD - Self-documenting:
const defaultPrice = 100;
```

---

## Enforcement

### Linting

ESLint will enforce these standards. Run:

```bash
npm run lint
npm run lint:fix
```

### Type Checking

TypeScript compiler will enforce strict typing:

```bash
npm run type-check
```

### Testing

Run tests to verify coverage:

```bash
npm run test
npm run test:coverage
```

### Pre-commit Hooks

Consider using husky for pre-commit hooks:

```bash
npm run prepare
```

---

## Summary

- **NO COMMENTS** in code unless explicitly requested
- **STRICT MODE** enabled with all strict options
- **YahooFinanceError** for all custom errors with predefined codes
- **kebab-case** for files, **PascalCase** for classes
- **ABSOLUTE IMPORTS** from `@/` with barrel exports
- **>85% TEST COVERAGE** with describe/expect pattern
- **DOCUMENTATION** only when explicitly requested

All agents and developers must adhere to these standards to maintain code quality and consistency across the Yahoo Finance MCP Server project.
