import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { toolsDefinition, resourcesDefinition, formatError } from './mcpTools.js';

/**
 * Active SSE transports map: sessionId -> { transport, server, token, createdAt }
 */
const activeSseTransports = new Map();

/**
 * Shared in-memory bridge client for direct JSON-RPC HTTP calls
 */
let directBridgeClient = null;

export async function getDirectMcpBridge() {
  if (directBridgeClient) return directBridgeClient;

  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'grimorio-direct-bridge', version: '1.0.0' });

  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport)
  ]);

  directBridgeClient = client;
  return directBridgeClient;
}

/**
 * Create and configure a new McpServer instance with all tools and resources
 */
export function createMcpServer() {
  const server = new McpServer({
    name: 'Grimório de Missões MCP Server',
    version: '1.0.0',
    description: 'Servidor MCP para CRUD de missões, livros, sessões de leitura, processos em lote, rituais diários com frequências flexíveis e leitura de inteligência comportamental do Oráculo.'
  });

  // 1. Register Tools
  for (const t of toolsDefinition) {
    server.tool(t.name, t.description, t.schema, async (args) => {
      try {
        return await t.handler(args);
      } catch (err) {
        console.error(`Erro ao executar ferramenta MCP '${t.name}':`, err);
        return formatError(err.message || 'Erro interno ao executar a ferramenta');
      }
    });
  }

  // 2. Register Resources
  for (const r of resourcesDefinition) {
    server.resource(
      r.name,
      r.uri,
      { mimeType: r.mimeType, description: r.description },
      async (uri) => {
        try {
          const res = await r.handler(uri);
          return {
            contents: [
              {
                uri: res.uri || (typeof uri === 'string' ? uri : uri.href),
                mimeType: res.mimeType || 'application/json',
                text: res.text
              }
            ]
          };
        } catch (err) {
          console.error(`Erro ao ler recurso MCP '${r.uri}':`, err);
          return {
            contents: [
              {
                uri: typeof uri === 'string' ? uri : uri.href,
                mimeType: 'application/json',
                text: JSON.stringify({ error: err.message })
              }
            ]
          };
        }
      }
    );
  }

  return server;
}

/**
 * Check if an SSE session ID is active and authenticated
 */
export function isSseSessionActive(sessionId) {
  if (!sessionId) return false;
  return activeSseTransports.has(sessionId);
}

/**
 * Handle incoming SSE connection (GET /mcp/sse)
 */
export async function handleSseConnection(req, res) {
  try {
    // Set permissive CORS headers for SSE
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    const server = createMcpServer();

    // Preserve token in the SSE endpoint URL so that subsequent POST messages carry the token
    const token = req.query?.token || (req.headers?.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.substring(7).trim() : null);
    const postEndpoint = token ? `/mcp/messages?token=${encodeURIComponent(token)}` : '/mcp/messages';

    const transport = new SSEServerTransport(postEndpoint, res);

    activeSseTransports.set(transport.sessionId, { transport, server, token, createdAt: new Date() });

    req.on('close', () => {
      activeSseTransports.delete(transport.sessionId);
      try {
        transport.close();
      } catch (e) {}
    });

    await server.connect(transport);
  } catch (err) {
    console.error('Erro na conexão MCP SSE:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao inicializar conexão SSE do MCP: ' + err.message });
    }
  }
}

/**
 * Handle incoming SSE POST message (POST /mcp/messages)
 */
export async function handleSseMessage(req, res) {
  try {
    // Set permissive CORS headers for POST messages
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    const sessionId = req.query.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: 'Parâmetro sessionId é obrigatório no query string.' });
    }

    const session = activeSseTransports.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: `Sessão SSE '${sessionId}' não encontrada ou já expirada.` });
    }

    await session.transport.handlePostMessage(req, res, req.body);
  } catch (err) {
    console.error('Erro ao processar mensagem MCP SSE:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao processar mensagem MCP: ' + err.message });
    }
  }
}

/**
 * Direct HTTP JSON-RPC 2.0 Request Handler (POST /api/mcp or POST /mcp)
 */
export async function handleDirectJsonRpc(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error: corpo da requisição JSON inválido' }
    });
  }

  const { jsonrpc = '2.0', id = null, method, params = {} } = body;

  try {
    const bridge = await getDirectMcpBridge();

    switch (method) {
      case 'initialize': {
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: params?.protocolVersion || '2024-11-05',
            capabilities: {
              tools: { listChanged: false },
              resources: { subscribe: false, listChanged: false },
              prompts: { listChanged: false }
            },
            serverInfo: {
              name: 'Grimório de Missões MCP Server',
              version: '1.0.0'
            }
          }
        });
      }

      case 'notifications/initialized': {
        return res.status(200).json({ jsonrpc: '2.0' });
      }

      case 'ping': {
        return res.json({ jsonrpc: '2.0', id, result: {} });
      }

      case 'tools/list': {
        const toolsResult = await bridge.listTools();
        return res.json({
          jsonrpc: '2.0',
          id,
          result: toolsResult
        });
      }

      case 'tools/call': {
        const callResult = await bridge.callTool({
          name: params.name,
          arguments: params.arguments || {}
        });
        return res.json({
          jsonrpc: '2.0',
          id,
          result: callResult
        });
      }

      case 'resources/list': {
        const resourcesResult = await bridge.listResources();
        return res.json({
          jsonrpc: '2.0',
          id,
          result: resourcesResult
        });
      }

      case 'resources/read': {
        const readResult = await bridge.readResource({
          uri: params.uri
        });
        return res.json({
          jsonrpc: '2.0',
          id,
          result: readResult
        });
      }

      default: {
        return res.status(404).json({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Método MCP desconhecido: '${method}'` }
        });
      }
    }
  } catch (err) {
    console.error('Erro na execução JSON-RPC do MCP:', err);
    return res.status(500).json({
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: 'Internal error: ' + err.message }
    });
  }
}

/**
 * Direct HTTP GET Discovery Handler (GET /api/mcp or GET /mcp)
 */
export async function handleMcpDiscoveryGet(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  try {
    const bridge = await getDirectMcpBridge();
    const tools = await bridge.listTools();
    const resources = await bridge.listResources();

    return res.json({
      status: 'ok',
      service: 'Grimório de Missões MCP Server',
      version: '1.0.0',
      protocolVersion: '2024-11-05',
      endpoints: {
        sse: '/mcp/sse',
        messages: '/mcp/messages',
        jsonrpc: '/api/mcp'
      },
      toolsCount: tools.tools.length,
      tools: tools.tools,
      resources: resources.resources
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
