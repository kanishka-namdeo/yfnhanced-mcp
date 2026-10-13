#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { MCPServer } from './server.js';

const __filename = fileURLToPath(import.meta.url);

const packageVersion = (createRequire(import.meta.url)('../package.json') as { version: string }).version;

async function main(): Promise<void> {
  const server = new MCPServer({ serverVersion: packageVersion });

  try {
    await server.initialize();
    console.error('Yahoo Finance MCP Server started successfully');
    console.error('Server state:', server.getState());
    console.error('Press Ctrl+C to stop the server');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// The installed bin reaches this file through a node_modules/.bin symlink, so compare
// resolved paths: a plain `process.argv[1] === __filename` never matches and the server
// exits without starting.
const invokedPath = process.argv[1] === undefined ? '' : realpathSync(resolve(process.argv[1]));
if (invokedPath === __filename) {
  main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}
