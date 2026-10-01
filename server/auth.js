import crypto from 'crypto';
import https from 'https';
import { getDb, saveDb } from './db.js';

// Optional environment variable for Google OAuth Client ID
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_AUTH_SESSIONS = 50;

let googleClientWarningShown = false;

/** Aviso alto, uma vez por processo — chamado na subida do servidor, não na importação. */
export function warnIfGoogleClientIdMissing() {
  if (googleClientWarningShown) return;
  if (process.env.GOOGLE_CLIENT_ID) return;
  googleClientWarningShown = true;
  console.warn(
    '⚠️ [Grimório Auth] GOOGLE_CLIENT_ID não definido. O token do Google será verificado, ' +
    'mas o campo aud NÃO será conferido. Defina GOOGLE_CLIENT_ID em produção.'
  );
}

// In-memory active sessions map: token -> { userId, email, name, picture, createdAt }
const sessions = new Map();

/**
 * Generate a secure random token
 */
export function generateSessionToken() {
  return 'sess_' + crypto.randomBytes(32).toString('hex');
}

export function hashSessionToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function isProduction() {
  return process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);
}

/**
 * Login sem senha (e-mail solto) e convidado ficam desligados em produção
 * e no Render, a menos que ALLOW_GUEST=1. Em desenvolvimento local seguem
 * disponíveis para não quebrar o fluxo do dono na máquina.
 */
export function isGuestLoginEnabled() {
  if (process.env.ALLOW_GUEST === '1') return true;
  if (process.env.ALLOW_GUEST === '0') return false;
  return !isProduction();
}

export function isEmailLoginEnabled() {
  return isGuestLoginEnabled();
}

function parseOwnerEmails() {
  return String(process.env.OWNER_EMAILS || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Dono único.
 * 1. OWNER_EMAILS (lista separada por vírgula), se definida.
 * 2. db.ownerEmail, se já adotado.
 * 3. Primeiro usuário Google não-convidado já existente (persistido).
 * 4. Trust-on-first-use: o primeiro login Google bem-sucedido vira dono.
 */
export function resolveOwnerEmail(db = getDb()) {
  const fromEnv = parseOwnerEmails();
  if (fromEnv.length > 0) return fromEnv[0];
  if (db?.ownerEmail) return normalizeEmail(db.ownerEmail);
  const existing = (db?.users || []).find(user =>
    user?.provider === 'google' && user.email && !isGuestEmail(user.email)
  );
  if (existing) {
    db.ownerEmail = normalizeEmail(existing.email);
    saveDb(db);
    console.warn(`⚠️ [Grimório Auth] Dono adotado a partir do primeiro usuário Google existente: ${db.ownerEmail}`);
    return db.ownerEmail;
  }
  return null;
}

function isGuestEmail(email) {
  const normalized = normalizeEmail(email);
  return !normalized || normalized === 'convidado@grimorio.app' || normalized.endsWith('@grimorio.app');
}

/**
 * Confere se o e-mail Google pode entrar. Persiste o dono no primeiro uso.
 * Lança erro com status 403 para qualquer outra conta.
 */
export function assertOwnerEmail(email, db = getDb()) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    const err = new Error('Conta Google sem e-mail verificado.');
    err.status = 403;
    throw err;
  }
  const fromEnv = parseOwnerEmails();
  if (fromEnv.length > 0) {
    if (!fromEnv.includes(normalized)) {
      const err = new Error('Esta conta Google não é o dono do Grimório.');
      err.status = 403;
      throw err;
    }
    return normalized;
  }
  const owner = resolveOwnerEmail(db);
  if (!owner) {
    db.ownerEmail = normalized;
    saveDb(db);
    console.warn(`⚠️ [Grimório Auth] Trust-on-first-use: ${normalized} tornou-se o dono do Grimório. Defina OWNER_EMAILS para fixar o dono.`);
    return normalized;
  }
  if (owner !== normalized) {
    const err = new Error('Esta conta Google não é o dono do Grimório.');
    err.status = 403;
    throw err;
  }
  return normalized;
}

function loadAuthSessions(db) {
  if (!Array.isArray(db.authSessions)) db.authSessions = [];
  return db.authSessions;
}

function pruneAuthSessions(list, now = Date.now()) {
  const fresh = list.filter(entry => entry && entry.tokenHash && entry.expiresAt && Date.parse(entry.expiresAt) > now);
  fresh.sort((a, b) => Date.parse(b.lastSeenAt || b.createdAt || 0) - Date.parse(a.lastSeenAt || a.createdAt || 0));
  return fresh.slice(0, MAX_AUTH_SESSIONS);
}

/**
 * Decode and verify Google ID Token (JWT) via tokeninfo.
 * aud só é exigido quando GOOGLE_CLIENT_ID está definido (não derruba o deploy).
 * email_verified precisa ser true.
 */
export async function verifyGoogleToken(idToken) {
  if (!idToken) throw new Error('Token do Google não fornecido.');

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

    const clientId = process.env.GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID;
    if (clientId) {
      if (!tokenInfo.aud || tokenInfo.aud !== clientId) {
        throw new Error('Token do Google não pertence a este aplicativo.');
      }
    }
    const verified = tokenInfo.email_verified === 'true' || tokenInfo.email_verified === true;
    if (!verified) {
      throw new Error('O e-mail da conta Google não está verificado.');
    }
    if (!tokenInfo.email) {
      throw new Error('Conta Google sem e-mail.');
    }
    return {
      googleId: tokenInfo.sub,
      email: tokenInfo.email,
      name: tokenInfo.name || tokenInfo.email.split('@')[0],
      picture: tokenInfo.picture || '',
      verified: true,
      provider: 'google'
    };
  } catch (err) {
    if (err.message && !err.message.startsWith('Não foi possível verificar')) {
      if (
        err.message.includes('não pertence') ||
        err.message.includes('não está verificado') ||
        err.message.includes('sem e-mail')
      ) {
        throw err;
      }
    }
    console.warn('Verificação online do token Google falhou:', err.message);
    throw new Error('Não foi possível verificar as credenciais do Google.');
  }
}

function persistSession(token, sessionData) {
  const db = getDb();
  const now = new Date();
  const entry = {
    tokenHash: hashSessionToken(token),
    userId: sessionData.userId,
    email: sessionData.email,
    name: sessionData.name,
    picture: sessionData.picture || '',
    createdAt: sessionData.createdAt,
    lastSeenAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString()
  };
  db.authSessions = pruneAuthSessions([entry, ...loadAuthSessions(db).filter(s => s.tokenHash !== entry.tokenHash)]);
  saveDb(db);
  return entry;
}

/**
 * Register a new session (memória + db, hash sha256, 30 dias).
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
  persistSession(token, sessionData);
  return { token, user: sessionData };
}

function sessionFromStored(entry) {
  return {
    userId: entry.userId,
    email: entry.email,
    name: entry.name,
    picture: entry.picture || '',
    createdAt: entry.createdAt
  };
}

/**
 * Get session by token. Reidrata do db (sobrevive a restart do Render)
 * e desliza o prazo de 30 dias.
 */
export function getSession(token) {
  if (!token) return null;
  const cached = sessions.get(token);
  if (cached) {
    touchStoredSession(token);
    return cached;
  }
  const db = getDb();
  const hash = hashSessionToken(token);
  const entry = loadAuthSessions(db).find(s => s.tokenHash === hash);
  if (!entry) return null;
  if (Date.parse(entry.expiresAt) <= Date.now()) {
    db.authSessions = loadAuthSessions(db).filter(s => s.tokenHash !== hash);
    saveDb(db);
    return null;
  }
  const sessionData = sessionFromStored(entry);
  sessions.set(token, sessionData);
  touchStoredSession(token, entry);
  return sessionData;
}

const SESSION_TOUCH_INTERVAL_MS = 60 * 60 * 1000;

function touchStoredSession(token, knownEntry) {
  const db = getDb();
  const hash = hashSessionToken(token);
  const list = loadAuthSessions(db);
  const entry = knownEntry || list.find(s => s.tokenHash === hash);
  if (!entry) return;
  const now = new Date();
  const lastSeen = Date.parse(entry.lastSeenAt || 0);
  // Não regrava o banco a cada request: desliza no máximo uma vez por hora.
  if (Number.isFinite(lastSeen) && now.getTime() - lastSeen < SESSION_TOUCH_INTERVAL_MS) return;
  entry.lastSeenAt = now.toISOString();
  entry.expiresAt = new Date(now.getTime() + SESSION_TTL_MS).toISOString();
  db.authSessions = pruneAuthSessions(list);
  saveDb(db);
}

/**
 * Destroy session (memória + db).
 */
export function destroySession(token) {
  if (!token) return false;
  const removed = sessions.delete(token);
  const db = getDb();
  const hash = hashSessionToken(token);
  const before = loadAuthSessions(db).length;
  db.authSessions = loadAuthSessions(db).filter(s => s.tokenHash !== hash);
  if (db.authSessions.length !== before) saveDb(db);
  return removed || db.authSessions.length !== before;
}

/**
 * Get configured Google Client ID
 */
export function getGoogleClientId() {
  return process.env.GOOGLE_CLIENT_ID || '';
}

export function getAuthConfig() {
  return {
    googleClientId: getGoogleClientId(),
    guestEnabled: isGuestLoginEnabled(),
    emailLoginEnabled: isEmailLoginEnabled()
  };
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
