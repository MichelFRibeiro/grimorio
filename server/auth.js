import crypto from 'crypto';
import https from 'https';

// Optional environment variable for Google OAuth Client ID
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

// In-memory active sessions map: token -> { userId, email, name, picture, createdAt }
const sessions = new Map();

/**
 * Generate a secure random token
 */
export function generateSessionToken() {
  return 'sess_' + crypto.randomBytes(32).toString('hex');
}

/**
 * Decode and verify Google ID Token (JWT)
 * Can verify against Google's tokeninfo API or decode payload safely
 */
export async function verifyGoogleToken(idToken) {
  if (!idToken) throw new Error('Token do Google não fornecido.');

  // Try official Google Tokeninfo endpoint
  try {
    const tokenInfo = await new Promise((resolve, reject) => {
      const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;
      https.get(url, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error('Resposta inválida do Google Tokeninfo'));
            }
          } else {
            reject(new Error(`Falha na validação do Google: HTTP ${res.statusCode}`));
          }
        });
      }).on('error', (err) => {
        reject(err);
      });
    });

    if (GOOGLE_CLIENT_ID && tokenInfo.aud && tokenInfo.aud !== GOOGLE_CLIENT_ID) {
      throw new Error('Token do Google não pertence a este aplicativo.');
    }
    if (tokenInfo.email) {
      return {
        googleId: tokenInfo.sub,
        email: tokenInfo.email,
        name: tokenInfo.name || tokenInfo.email.split('@')[0],
        picture: tokenInfo.picture || '',
        verified: tokenInfo.email_verified === 'true' || tokenInfo.email_verified === true
      };
    }
  } catch (err) {
    console.warn('Verificação online do token Google falhou:', err.message);
    throw new Error('Não foi possível verificar as credenciais do Google.');
  }

  throw new Error('Não foi possível verificar as credenciais do Google.');
}

/**
 * Register a new session
 */
export function createSession(user) {
  const token = generateSessionToken();
  const sessionData = {
    userId: user.id,
    email: user.email,
    name: user.name,
    picture: user.picture || '',
    createdAt: new Date().toISOString()
  };
  sessions.set(token, sessionData);
  return { token, user: sessionData };
}

/**
 * Get session by token
 */
export function getSession(token) {
  if (!token) return null;
  return sessions.get(token) || null;
}

/**
 * Destroy session
 */
export function destroySession(token) {
  if (!token) return false;
  return sessions.delete(token);
}

/**
 * Get configured Google Client ID
 */
export function getGoogleClientId() {
  return process.env.GOOGLE_CLIENT_ID || '';
}

/**
 * Express middleware to attach user to request if session exists
 */
const PUBLIC_API_PATHS = new Set([
  '/api/health',
  '/api/ping',
  '/api/auth/config',
  '/api/auth/google',
  '/api/auth/login',
  '/api/auth/guest',
  '/api/focus/audio',
  '/api/focus/track',
  // O MCP tem autenticação própria por Bearer Token (mcpAuthMiddleware) e é
  // usado por agentes sem sessão de navegador.
  '/api/mcp'
]);

export function requireSession(req, res, next) {
  if (req.user) return next();
  return res.status(401).json({ error: 'Não autorizado. Faça login para continuar.' });
}

export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const session = getSession(token);
    if (session) {
      req.user = session;
    }
  }

  if (!req.path.startsWith('/api/')) return next();
  if (PUBLIC_API_PATHS.has(req.path)) return next();
  if (req.path === '/api/auth/logout' || req.path === '/api/auth/me') return next();
  return requireSession(req, res, next);
}
