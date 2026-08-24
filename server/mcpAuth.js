import crypto from 'crypto';
import { getDb, saveDb } from './db.js';
import { getSession } from './auth.js';

/**
 * Generate a secure random MCP token
 */
export function generateMcpToken() {
  return 'mcp_' + crypto.randomBytes(24).toString('hex');
}

/**
 * Get the currently configured MCP Bearer Token
 * Priority:
 * 1. Environment variable MCP_BEARER_TOKEN or MCP_API_KEY
 * 2. Stored token in database (db.mcpToken)
 * 3. Automatically generated and persisted default token
 */
export function getMcpToken() {
  if (process.env.MCP_BEARER_TOKEN && process.env.MCP_BEARER_TOKEN.trim()) {
    return process.env.MCP_BEARER_TOKEN.trim();
  }
  if (process.env.MCP_API_KEY && process.env.MCP_API_KEY.trim()) {
    return process.env.MCP_API_KEY.trim();
  }

  const db = getDb();
  if (!db.mcpToken) {
    db.mcpToken = generateMcpToken();
    saveDb(db);
  }

  return db.mcpToken;
}

/**
 * Regenerate the MCP Bearer Token stored in the database
 */
export function regenerateMcpToken() {
  const db = getDb();
  db.mcpToken = generateMcpToken();
  saveDb(db);
  return db.mcpToken;
}

/**
 * Verify whether a provided token is valid
 * Accepts:
 * 1. Configured MCP Token from env or database
 * 2. Any active user session token (sess_...)
 */
export function verifyMcpToken(token) {
  if (!token || typeof token !== 'string') return false;
  const cleanToken = token.trim();
  if (!cleanToken) return false;

  // 1. Check environment variable
  if (process.env.MCP_BEARER_TOKEN && cleanToken === process.env.MCP_BEARER_TOKEN.trim()) {
    return { valid: true, type: 'env_token' };
  }
  if (process.env.MCP_API_KEY && cleanToken === process.env.MCP_API_KEY.trim()) {
    return { valid: true, type: 'env_api_key' };
  }

  // 2. Check DB stored token
  const db = getDb();
  if (db.mcpToken && cleanToken === db.mcpToken) {
    return { valid: true, type: 'database_token' };
  }

  // 3. Check active session token
  const session = getSession(cleanToken);
  if (session) {
    return { valid: true, type: 'user_session', user: session };
  }

  return false;
}

/**
 * Extract bearer token from Request (headers or query string)
 */
export function extractBearerToken(req) {
  const authHeader = req.headers?.authorization;
  if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  if (req.query?.token) {
    return String(req.query.token).trim();
  }
  if (req.query?.apiKey) {
    return String(req.query.apiKey).trim();
  }
  return null;
}

/**
 * Express Middleware to protect MCP endpoints
 */
export function mcpAuthMiddleware(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) {
    return res.status(401).json({
      error: 'Não autorizado: Bearer Token não fornecido. Envie o cabeçalho Authorization: Bearer <TOKEN> ou o parâmetro ?token=<TOKEN>.'
    });
  }

  const verification = verifyMcpToken(token);
  if (!verification) {
    return res.status(401).json({
      error: 'Não autorizado: Bearer Token inválido ou expirado.'
    });
  }

  req.mcpAuth = verification;
  next();
}
