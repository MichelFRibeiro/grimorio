import fs from 'fs';
import path from 'path';
import { currentWriteSeq, flushDb, getDataDir, getDb, saveDb } from './db.js';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.m4a', '.wav']);

/** Confere extensão de áudio e que o caminho é um arquivo regular existente. */
export function isAllowedAudioFile(filePath) {
  if (!filePath || typeof filePath !== 'string') return false;
  const ext = path.extname(filePath).toLowerCase();
  if (!AUDIO_EXTENSIONS.has(ext)) return false;
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Origens permitidas: mesma origem, APP_URL, RENDER_EXTERNAL_URL,
 * ALLOWED_ORIGINS e as portas de desenvolvimento local.
 */
export function isAllowedOrigin(origin) {
  if (!origin) return true;
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  const host = parsed.hostname;
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  if (isLocal && ['5173', '3000', '4173'].includes(parsed.port)) return true;

  const allowed = [
    process.env.APP_URL,
    process.env.RENDER_EXTERNAL_URL,
    ...(process.env.ALLOWED_ORIGINS || '').split(',')
  ]
    .map(value => String(value || '').trim().replace(/\/$/, ''))
    .filter(Boolean);

  const normalized = origin.replace(/\/$/, '');
  return allowed.some(item => item === normalized);
}

export function corsOriginDelegate(origin, callback) {
  if (isAllowedOrigin(origin)) return callback(null, true);
  return callback(null, false);
}

const SECRET_TOP_LEVEL_KEYS = ['integrations', 'mcpToken', 'authSessions'];

export function stripBackupSecrets(db) {
  const clone = JSON.parse(JSON.stringify(db || {}));
  for (const key of SECRET_TOP_LEVEL_KEYS) delete clone[key];
  if (Array.isArray(clone.users)) {
    clone.users = clone.users.map(user => {
      if (!user || typeof user !== 'object') return user;
      const copy = { ...user };
      delete copy.token;
      delete copy.accessToken;
      delete copy.refreshToken;
      delete copy.idToken;
      return copy;
    });
  }
  return clone;
}

const IMPORT_ARRAY_CAPS = {
  quests: 5000,
  books: 2000,
  readingSessions: 20000,
  scriptureSessions: 20000,
  scriptureQuotes: 20000,
  scriptureReflections: 20000,
  examQuestions: 20000,
  processes: 5000,
  processSteps: 50000,
  habits: 2000,
  rewards: 1000,
  rewardRedemptions: 20000,
  actionLogs: 5000,
  ninetyDayGoals: 100,
  dailyVictories: 5000,
  mindMaps: 2000,
  mindMapSessions: 20000,
  mindMapCategories: 500,
  mindMapImages: 2000,
  users: 50,
  questCategories: 200,
  oracleEnergyReadings: 5000,
  oracleDecisions: 5000,
  oracleQuantityReads: 5000
};

const PROFILE_NUMBER_BOUNDS = {
  level: [1, 9999],
  xp: [0, 1e12],
  xpToNextLevel: [1, 1e12],
  coins: [-1e9, 1e12],
  streak: [0, 100000]
};

const STAT_BOUNDS = [0, 1e12];

function finiteInRange(value, min, max) {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

export function validateImportedProfile(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    return 'userProfile ausente ou inválido.';
  }
  for (const [key, [min, max]] of Object.entries(PROFILE_NUMBER_BOUNDS)) {
    if (profile[key] !== undefined && !finiteInRange(profile[key], min, max)) {
      return `userProfile.${key} precisa ser um número finito entre ${min} e ${max}.`;
    }
  }
  if (profile.stats && typeof profile.stats === 'object') {
    for (const stat of ['wisdom', 'focus', 'willpower', 'consistency']) {
      if (profile.stats[stat] !== undefined && !finiteInRange(profile.stats[stat], STAT_BOUNDS[0], STAT_BOUNDS[1])) {
        return `userProfile.stats.${stat} precisa ser um número finito.`;
      }
    }
  }
  return null;
}

const IMPORTABLE_KEYS = new Set([
  'userProfile',
  'questCategories',
  'bossRaid',
  'quests',
  'books',
  'readingSessions',
  'scriptureProgress',
  'scriptureSessions',
  'scriptureQuotes',
  'scriptureReflections',
  'examQuestions',
  'processes',
  'processSteps',
  'habits',
  'rewards',
  'rewardRedemptions',
  'actionLogs',
  'liveActivityTimers',
  'aguPlan',
  'ninetyDayGoals',
  'dailyVictories',
  'dailyVictoryBonuses',
  'mindMaps',
  'mindMapSessions',
  'mindMapCategories',
  'mindMapImages',
  'oracleEnergyReadings',
  'oracleDecisions',
  'oracleQuantityReads'
]);

/**
 * Monta o documento importado: só chaves conhecidas, arrays com teto,
 * e segredos (mcpToken, integrations, authSessions, ownerEmail, users)
 * sempre vindos do banco atual — nunca do arquivo importado.
 */
export function buildImportedDb(incoming, current) {
  const profileError = validateImportedProfile(incoming?.userProfile);
  if (profileError) {
    const err = new Error(profileError);
    err.status = 400;
    throw err;
  }
  if (!Array.isArray(incoming?.quests)) {
    const err = new Error('Arquivo de backup inválido: quests ausente.');
    err.status = 400;
    throw err;
  }

  const next = {};
  for (const key of IMPORTABLE_KEYS) {
    if (incoming[key] === undefined) continue;
    const value = incoming[key];
    if (Array.isArray(value) && IMPORT_ARRAY_CAPS[key]) {
      next[key] = value.slice(0, IMPORT_ARRAY_CAPS[key]);
    } else {
      next[key] = value;
    }
  }

  next.mcpToken = current?.mcpToken;
  next.integrations = current?.integrations;
  next.authSessions = current?.authSessions || [];
  next.ownerEmail = current?.ownerEmail;
  next.users = current?.users || [];
  return next;
}

function snapshotStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Snapshot automático antes de um import.
 * Modo arquivo: JSON com carimbo em GRIMORIO_DATA_DIR.
 * Modo Postgres: uma linha em grimorio_backups (criada se não existir).
 * Se não houver como gravar, segue com um aviso — não bloqueia o import.
 */
export async function writePreImportSnapshot(db, pool) {
  const stamp = snapshotStamp();
  const payload = JSON.stringify(db);
  if (pool) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS grimorio_backups (
          id BIGSERIAL PRIMARY KEY,
          label TEXT,
          data JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);
      await pool.query(
        `INSERT INTO grimorio_backups (label, data) VALUES ($1, $2);`,
        [`pre-import-${stamp}`, JSON.parse(payload)]
      );
      return { mode: 'postgres', label: `pre-import-${stamp}` };
    } catch (err) {
      console.warn(`⚠️ [Grimório Backup] Snapshot pré-import no Postgres falhou e foi ignorado: ${err.message}`);
      return { mode: 'skipped', warning: err.message };
    }
  }

  try {
    const dir = getDataDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `backup-pre-import-${stamp}.json`);
    fs.writeFileSync(filePath, payload, 'utf-8');
    return { mode: 'file', file: path.basename(filePath) };
  } catch (err) {
    console.warn(`⚠️ [Grimório Backup] Snapshot pré-import em arquivo falhou e foi ignorado: ${err.message}`);
    return { mode: 'skipped', warning: err.message };
  }
}

export async function importBackup(incoming, pool) {
  const current = getDb();
  const snapshot = await writePreImportSnapshot(current, pool);
  const next = buildImportedDb(incoming, current);
  saveDb(next);
  await flushDb({ timeoutMs: 30000 });
  return { snapshot };
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Prazo máximo que uma resposta mutante espera pela confirmação da persistência. */
const RESPONSE_FLUSH_TIMEOUT_MS = Number(process.env.GRIMORIO_FLUSH_TIMEOUT_MS) > 0
  ? Number(process.env.GRIMORIO_FLUSH_TIMEOUT_MS)
  : 8000;

/**
 * Em rotas mutáveis de /api e /mcp, espera APENAS a escrita que contém as
 * mudanças desta requisição antes de enviar o JSON.
 *
 * Antes esperava a fila inteira esvaziar: com qualquer enqueue contínuo
 * (heartbeat de timers, outra rota salvando, manutenção) a promessa nunca
 * resolvia e a resposta nunca saía — o "Aceitar Plano girando para sempre" e o
 * timeout do MCP. Agora a sequência é capturada AQUI (depois do handler, que é
 * quem enfileira a escrita) e há prazo: estourou, responde de qualquer forma e
 * registra o aviso, porque o dado já está em memória e a fila continua tentando.
 */
export function persistenceFlushMiddleware(req, res, next) {
  const mutating = MUTATING.has(req.method) && (req.path.startsWith('/api/') || req.path.startsWith('/mcp'));
  if (!mutating) return next();

  const originalJson = res.json.bind(res);
  res.json = function flushedJson(body) {
    if (res.headersSent) return originalJson(body);
    const seq = currentWriteSeq();
    return flushDb({ seq, timeoutMs: RESPONSE_FLUSH_TIMEOUT_MS }).then(
      () => originalJson(body),
      (err) => {
        if (err?.code === 'ETIMEDOUT') {
          console.warn(
            `⚠️ [Grimório DB] Persistência não confirmou em ${RESPONSE_FLUSH_TIMEOUT_MS} ms ` +
            `(${req.method} ${req.path}, pedido ${seq}); respondendo mesmo assim.`
          );
          return originalJson(body);
        }
        console.error('❌ [Grimório DB] Falha ao confirmar persistência antes da resposta:', err.message);
        res.status(500);
        return originalJson({ error: 'Não foi possível salvar os dados. Tente novamente.' });
      }
    );
  };
  next();
}

export function genericErrorHandler(err, req, res, next) {
  console.error('❌ [Grimório] Erro não tratado:', err);
  if (res.headersSent) return next(err);
  res.status(err.status && err.status >= 400 && err.status < 600 ? err.status : 500).json({
    error: 'O Grimório encontrou um erro interno. Tente novamente.'
  });
}
