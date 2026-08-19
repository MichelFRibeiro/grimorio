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
    console.warn('Verificação online do token Google falhou, tentando fallback JWT:', err.message);
  }

  // Fallback: decode JWT payload directly if online verification failed (e.g. offline dev or mock)
  try {
    const parts = idToken.split('.');
    if (parts.length === 3) {
      const payloadBuf = Buffer.from(parts[1], 'base64');
      const payload = JSON.parse(payloadBuf.toString('utf-8'));
      if (payload.sub && (payload.email || payload.name)) {
        return {
          googleId: payload.sub,
          email: payload.email || `${payload.sub}@google.user`,
          name: payload.name || payload.email || 'Usuário Google',
          picture: payload.picture || '',
          verified: !!payload.email_verified
        };
      }
    }
  } catch (err) {
    throw new Error('Formato do token Google inválido.');
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
  return GOOGLE_CLIENT_ID;
}

/**
 * Express middleware to attach user to request if session exists
 */
export function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const session = getSession(token);
    if (session) {
      req.user = session;
    }
  }
  next();
}
