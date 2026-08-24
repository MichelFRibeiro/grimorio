import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { toolsDefinition, resourcesDefinition, formatError } from './mcpTools.js';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';

/**
 * Active SSE transports map: sessionId -> { transport, server }
 */
const activeSseTransports = new Map();

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
 * Handle incoming SSE connection (GET /mcp/sse)
 */
export async function handleSseConnection(req, res) {
  try {
    const server = createMcpServer();
    const transport = new SSEServerTransport('/mcp/messages', res);

    activeSseTransports.set(transport.sessionId, { transport, server });

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
    const sessionId = req.query.sessionId;
    if (!sessionId) {
      return res.status(400).json({ error: 'Parâmetro sessionId é obrigatório no query string.' });
    }

    const session = activeSseTransports.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: `Sessão SSE '${sessionId}' não encontrada ou já expirada.` });
    }

    await session.transport.handlePostMessage(req, res);
  } catch (err) {
    console.error('Erro ao processar mensagem MCP SSE:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Erro ao processar mensagem MCP: ' + err.message });
    }
  }
}

/**
 * Convert Zod schema object to JSON Schema format for tools/list
 */
function getJsonSchemaForTool(tool) {
  if (!tool.schema || Object.keys(tool.schema).length === 0) {
    return {
      type: 'object',
      properties: {}
    };
  }

  const zodObject = z.object(tool.schema);
  const jsonSchema = zodToJsonSchema(zodObject, { target: 'openApi3' });
  return jsonSchema;
}

/**
 * Direct HTTP JSON-RPC 2.0 Request Handler (POST /api/mcp or POST /mcp)
 */
export async function handleDirectJsonRpc(req, res) {
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
    switch (method) {
      case 'initialize': {
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
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
        const toolsList = toolsDefinition.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: getJsonSchemaForTool(t)
        }));

        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            tools: toolsList
          }
        });
      }

      case 'tools/call': {
        const toolName = params.name;
        const toolArgs = params.arguments || {};

        const tool = toolsDefinition.find(t => t.name === toolName);
        if (!tool) {
          return res.status(404).json({
            jsonrpc: '2.0',
            id,
            error: { code: -32601, message: `Ferramenta '${toolName}' não encontrada.` }
          });
        }

        // Validate arguments against zod schema if present
        let parsedArgs = toolArgs;
        if (tool.schema && Object.keys(tool.schema).length > 0) {
          const zodSchema = z.object(tool.schema);
          const validation = zodSchema.safeParse(toolArgs);
          if (!validation.success) {
            return res.json({
              jsonrpc: '2.0',
              id,
              result: {
                isError: true,
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      success: false,
                      error: 'Erro de validação dos argumentos',
                      details: validation.error.errors
                    }, null, 2)
                  }
                ]
              }
            });
          }
          parsedArgs = validation.data;
        }

        const executionResult = await tool.handler(parsedArgs);
        return res.json({
          jsonrpc: '2.0',
          id,
          result: executionResult
        });
      }

      case 'resources/list': {
        const resourcesList = resourcesDefinition.map(r => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
          mimeType: r.mimeType
        }));

        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            resources: resourcesList
          }
        });
      }

      case 'resources/read': {
        const uri = params.uri;
        const resource = resourcesDefinition.find(r => r.uri === uri);
        if (!resource) {
          return res.status(404).json({
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: `Recurso com URI '${uri}' não encontrado.` }
          });
        }

        const content = await resource.handler(uri);
        return res.json({
          jsonrpc: '2.0',
          id,
          result: {
            contents: [
              {
                uri: content.uri || uri,
                mimeType: content.mimeType || 'application/json',
                text: content.text
              }
            ]
          }
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
