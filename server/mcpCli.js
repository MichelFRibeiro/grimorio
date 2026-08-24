#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createMcpServer } from './mcpServer.js';
import { initDb } from './db.js';

async function runCli() {
  try {
    await initDb();
    const server = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (err) {
    console.error('Falha ao iniciar MCP Server via Stdio:', err);
    process.exit(1);
  }
}

runCli();
