import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import {
  getSaoPauloDateStr,
  getSaoPauloHour,
  getSaoPauloDayOfWeek,
  getYesterdaySaoPauloDateStr
} from './timeUtils.js';
import { applyLocationDefaults } from './locations.js';
import { migrateActivityScale } from '../src/utils/activityScale.js';
import { sanitizeLiveActivityTimers } from '../src/utils/activityDuration.js';
import { createDefaultAguPlan } from '../src/data/aguCurriculum.js';
import { sanitizeAguPlan, ensureCurrentCycle } from '../src/utils/aguCycle.js';
import { sanitizeDailyVictories, sanitizeDailyVictoryBonuses } from '../src/utils/dailyVictories.js';
import { sanitizeMindMaps, sanitizeMindMapSessions, sanitizeMindMapCategories, sanitizeMindMapImageLibrary, mergeMindMapImageLibrary } from '../src/utils/mindMaps.js';
import { ensureOracleMemory } from './oracleMemory.js';
import { setStoredOpenRouterKey } from './jevClient.js';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Pasta data/ do projeto — testes nunca podem gravar aqui. */
export const PROJECT_DATA_DIR = path.resolve(__dirname, '..', 'data');

/**
 * Em modo de teste (GRIMORIO_TEST=1) recusa Postgres e exige um
 * GRIMORIO_DATA_DIR fora da pasta data/ do projeto. Assim nenhum
 * script de teste alcança o Supabase nem o database.json real.
 */
export function assertSafeDataDir(dir) {
  const resolved = path.resolve(dir);
  if (process.env.GRIMORIO_TEST === '1') {
    if (!process.env.GRIMORIO_DATA_DIR) {
      throw new Error(
        '[Grimório TEST] GRIMORIO_DATA_DIR não definido. ' +
        'Importe server/testEnv.js antes de usar o banco, ou rode via npm test.'
      );
    }
    if (resolved === PROJECT_DATA_DIR || resolved.startsWith(PROJECT_DATA_DIR + path.sep)) {
      throw new Error(
        `[Grimório TEST] GRIMORIO_DATA_DIR aponta para a pasta data/ do projeto (${resolved}). ` +
        'Use um diretório temporário.'
      );
    }
  }
  return resolved;
}

function resolveDataDir() {
  const fromEnv = process.env.GRIMORIO_DATA_DIR;
  const dir = fromEnv ? path.resolve(fromEnv) : path.join(__dirname, '..', 'data');
  return assertSafeDataDir(dir);
}

const DATA_DIR = resolveDataDir();
const DB_FILE = path.join(DATA_DIR, 'database.json');
const DB_BAK_FILE = path.join(DATA_DIR, 'database.json.bak');

export function getDataDir() {
  return DATA_DIR;
}

export function getDbFilePath() {
  return DB_FILE;
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let pool = null;

function postgresSslOption(connectionString) {
  // PGSSL_STRICT=1 exige certificado válido. Caso contrário, hosts remotos
  // (Supabase pooler) seguem com rejectUnauthorized:false; localhost não usa SSL.
  if (process.env.PGSSL_STRICT === '1') return undefined;
  try {
    const host = new URL(connectionString).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return undefined;
  } catch {
    // connection string não-URL: mantém o comportamento remoto do Supabase
  }
  return { rejectUnauthorized: false };
}

export function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (process.env.GRIMORIO_TEST === '1' && connectionString) {
    throw new Error(
      '[Grimório TEST] DATABASE_URL está definida com GRIMORIO_TEST=1. ' +
      'O modo de teste recusa criar um pool Postgres. Remova DATABASE_URL antes de rodar testes.'
    );
  }
  if (connectionString) {
    const ssl = postgresSslOption(connectionString);
    pool = new Pool({
      connectionString,
      ...(ssl ? { ssl } : {})
    });
  }
  return pool;
}

/** Só para testes: injeta um pool falso e descarta a fila de escrita. */
export function __setPoolForTests(fakePool) {
  pool = fakePool;
  writeChain = Promise.resolve();
  pendingWrite = null;
}

// XP needed for a given level
export function getXpForLevel(level) {
  return 100 * level + Math.floor(Math.pow(level, 1.5) * 40);
}

// Titles unlocked at various levels
export function getTitleForLevel(level) {
  if (level >= 30) return 'Soberano da Execução Lendária';
  if (level >= 20) return 'Grão-Mestre da Concentração';
  if (level >= 15) return 'Mestre do Conhecimento';
  if (level >= 10) return 'Arquivista Real';
  if (level >= 7) return 'Estrategista do Tempo';
  if (level >= 4) return 'Adepto do Foco';
  if (level >= 2) return 'Aprendiz das Chamas';
  return 'Iniciado do Grimório';
}

export const defaultQuestCategories = [
  { id: 'cat-1', name: 'Trabalho', color: '#38bdf8', icon: 'Briefcase', defaultLocation: 'office' },
  { id: 'cat-2', name: 'Estudos', color: '#a855f7', icon: 'GraduationCap', defaultLocation: 'anywhere' },
  { id: 'cat-3', name: 'Pessoal', color: '#10b981', icon: 'User', defaultLocation: 'anywhere' },
  { id: 'cat-4', name: 'Projetos', color: '#f59e0b', icon: 'FolderGit2', defaultLocation: 'anywhere' },
  { id: 'cat-5', name: 'Saúde', color: '#f43f5e', icon: 'Heart', defaultLocation: 'anywhere' },
  { id: 'cat-6', name: 'Finanças', color: '#eab308', icon: 'Coins', defaultLocation: 'anywhere' }
];

export const uid = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

/**
 * Propaga rename/remoção de categoria para missões, processos, hábitos,
 * livros, questões e logs históricos — evita categorias fantasma no ranking.
 */
export function applyCategoryRename(db, oldName, newName) {
  if (!db || !oldName || newName == null || oldName === newName) return db;

  const rename = (item) => {
    if (item && item.category === oldName) {
      item.category = newName;
    }
  };

  (db.quests || []).forEach(rename);
  (db.processes || []).forEach(rename);
  (db.habits || []).forEach(rename);
  (db.books || []).forEach(rename);
  (db.examQuestions || []).forEach(rename);
  (db.ninetyDayGoals || []).forEach(rename);
  (db.dailyVictories || []).forEach(rename);
  (db.mindMaps || []).forEach(rename);
  (db.mindMapSessions || []).forEach(rename);

  (db.actionLogs || []).forEach(log => {
    if (log.details?.category === oldName) {
      log.details.category = newName;
    }
  });

  return db;
}

export const BOSS_CATALOG = [
  {
    name: 'O Dragão da Procrastinação',
    subtitle: 'A fera alada que sussurra "deixe para amanhã". Derrote-o com foco imediato!',
    icon: '🐉',
    theme: 'procrastinacao'
  },
  {
    name: 'O Titã da Distração Infinita',
    subtitle: 'Senhor do feed sem fim e notificações vazias. Corte seus tentáculos com disciplina!',
    icon: '🌀',
    theme: 'distracao'
  },
  {
    name: 'O Colosso da Paralisia por Análise',
    subtitle: 'A estátua de pedra que congela a ação em planejamentos eternos. Quebre sua couraça com execução!',
    icon: '🗿',
    theme: 'overthinking'
  },
  {
    name: 'A Hidra da Insegurança & Dúvida',
    subtitle: 'Monstro de muitas cabeças que sussurra incertezas. Destrua suas dúvidas com conhecimento e estudo!',
    icon: '🐍',
    theme: 'inseguranca'
  },
  {
    name: 'O Arquimago da Falsa Produtividade',
    subtitle: 'O ilusionista que gasta horas organizando em vez de realizar. Dissipe suas ilusões com tarefas reais!',
    icon: '🧙‍♂️',
    theme: 'falsa_produtividade'
  },
  {
    name: 'O Demônio da Sobrecarga Mental',
    subtitle: 'Criatura tempestuosa que torna tudo urgente e caótico. Domine o caos com uma ação de cada vez!',
    icon: '👹',
    theme: 'sobrecarga'
  },
  {
    name: 'O Devorador de Prazos do Abismo',
    subtitle: 'A besta que devora horas, dias e oportunidades. Recupere o controle do seu tempo!',
    icon: '⏳',
    theme: 'tempo'
  },
  {
    name: 'O Golem do Cansaço Ilusório',
    subtitle: 'O guardião pesado que te convence a desistir antes do fim. Supere o cansaço com constância inabalável!',
    icon: '🪨',
    theme: 'resistencia'
  },
  {
    name: 'O Leviatã da Autossabotagem',
    subtitle: 'Sombra das profundezas que tenta diminuir suas conquistas. Mostre sua força e merecimento!',
    icon: '🐙',
    theme: 'autossabotagem'
  },
  {
    name: 'O Behemoth do Imediatismo',
    subtitle: 'Fera selvagem sedenta por dopamina rápida e prazer efêmero. Conquiste a vitória do longo prazo!',
    icon: '🦏',
    theme: 'imediatismo'
  },
  {
    name: 'O Espectro da Zona de Conforto',
    subtitle: 'Fantasma sedutor que quer mantê-lo estagnado. Rompa as correntes e avance rumo ao topo!',
    icon: '👻',
    theme: 'conforto'
  },
  {
    name: 'O Soberano da Síndrome do Impostor',
    subtitle: 'Monarca sombrio que questiona sua capacidade na carreira e nos estudos. Prove o seu real valor!',
    icon: '👑',
    theme: 'impostor'
  },
  {
    name: 'A Quimera da Hesitação',
    subtitle: 'Predador veloz que ataca no momento da decisão. Execute o primeiro passo sem vacilar!',
    icon: '🦁',
    theme: 'hesitacao'
  },
  {
    name: 'O Basilisco do Desânimo',
    subtitle: 'Monstro cujo olhar petrifica a motivação. Incendeie seu espírito com vitórias diárias!',
    icon: '🦎',
    theme: 'desanimo'
  },
  {
    name: 'O Senhor das Justificativas',
    subtitle: 'Criatura astuta que cria desculpas perfeitas para adiar o triunfo. Transforme desculpas em resultados!',
    icon: '🎭',
    theme: 'desculpas'
  }
];

export function createBossRaid({ level = 1, currentBoss = null, forceName = null } = {}) {
  const targetLevel = Math.max(1, parseInt(level, 10) || 1);
  const hp = Math.round(500 * Math.pow(1.10, targetLevel - 1));
  const xp = Math.round(400 * Math.pow(1.10, targetLevel - 1));
  const coins = Math.round(150 * Math.pow(1.10, targetLevel - 1));

  let catalogEntry;
  if (forceName) {
    catalogEntry = BOSS_CATALOG.find(b => b.name.toLowerCase() === forceName.toLowerCase()) || {
      name: forceName,
      subtitle: `Chefe Nível ${targetLevel} - Supere seus limites com foco total!`,
      icon: '🐉'
    };
  } else {
    const currentName = currentBoss?.name;
    const candidates = BOSS_CATALOG.filter(b => b.name !== currentName);
    catalogEntry = candidates[Math.floor(Math.random() * candidates.length)] || BOSS_CATALOG[0];
  }

  const prevDefeats = currentBoss?.defeatsCount !== undefined
    ? currentBoss.defeatsCount
    : (targetLevel > 1 ? targetLevel - 1 : 0);

  return {
    id: uid('boss'),
    level: targetLevel,
    name: catalogEntry.name,
    subtitle: catalogEntry.subtitle,
    icon: catalogEntry.icon || '🐉',
    maxHp: hp,
    currentHp: hp,
    defeated: false,
    rewardCoins: coins,
    rewardXp: xp,
    defeatsCount: prevDefeats,
    weekStartDate: getSaoPauloDateStr()
  };
}

export const defaultDatabase = () => {
  const now = new Date();
  const todayStr = getSaoPauloDateStr(now);

  return {
    userProfile: {
      id: 'hero-1',
      name: 'Mestre do Foco',
      email: '',
      level: 1,
      xp: 0,
      xpToNextLevel: getXpForLevel(1),
      coins: 0,
      title: getTitleForLevel(1),
      avatar: '🧙‍♂️',
      picture: '',
      stats: {
        wisdom: 0,
        focus: 0,
        willpower: 0,
        consistency: 0
      },
      streak: 1,
      lastActiveDate: todayStr,
      theme: 'dark-fantasy',
      currentLocation: null,
      locationManual: false
    },
    users: [],
    questCategories: [...defaultQuestCategories],
    bossRaid: createBossRaid({ level: 1 }),
    quests: [],
    books: [],
    readingSessions: [],
    examQuestions: [],
    processes: [],
    processSteps: [],
    habits: [],
    rewards: [],
    rewardRedemptions: [],
    actionLogs: [],
    liveActivityTimers: {},
    aguPlan: createDefaultAguPlan(todayStr),
    ninetyDayGoals: [],
    dailyVictories: [],
    dailyVictoryBonuses: {},
    mindMaps: [],
    mindMapSessions: [],
    mindMapCategories: sanitizeMindMapCategories(),
    mindMapImages: [],
    oracleEnergyReadings: [],
    oracleDecisions: [],
    oracleQuantityReads: []
  };
};

export function sanitizeDb(db) {
  if (!db) return defaultDatabase();
  if (!db.quests) db.quests = [];
  if (!db.questCategories || db.questCategories.length === 0) {
    db.questCategories = [...defaultQuestCategories];
  }
  if (!db.books) db.books = [];
  if (!db.readingSessions) db.readingSessions = [];
  if (!db.examQuestions) db.examQuestions = [];
  if (!db.processes) db.processes = [];
  if (!db.processSteps) db.processSteps = [];
  if (!db.habits) db.habits = [];
  if (!db.rewards) db.rewards = [];
  if (!db.rewardRedemptions) db.rewardRedemptions = [];
  if (!db.actionLogs) db.actionLogs = [];
  if (!db.users) db.users = [];
  if (!db.userProfile) db.userProfile = defaultDatabase().userProfile;
  db.liveActivityTimers = sanitizeLiveActivityTimers(db.liveActivityTimers);
  const todayStr = getSaoPauloDateStr();
  // Metas de 90 dias saíram da interface, mas o histórico permanece no banco.
  if (!Array.isArray(db.ninetyDayGoals)) db.ninetyDayGoals = [];
  db.dailyVictories = sanitizeDailyVictories(db.dailyVictories);
  db.dailyVictoryBonuses = sanitizeDailyVictoryBonuses(db.dailyVictoryBonuses);
  db.mindMaps = sanitizeMindMaps(db.mindMaps);
  db.mindMapSessions = sanitizeMindMapSessions(db.mindMapSessions);
  db.mindMapCategories = sanitizeMindMapCategories(db.mindMapCategories);
  db.mindMapImages = mergeMindMapImageLibrary(sanitizeMindMapImageLibrary(db.mindMapImages), db.mindMaps);
  if (db.mindMaps.length && db.mindMapCategories.length) {
    db.mindMaps = db.mindMaps.map((map) => {
      if (map.categoryId && db.mindMapCategories.some(c => c.id === map.categoryId)) {
        const cat = db.mindMapCategories.find(c => c.id === map.categoryId);
        return { ...map, category: cat?.name || map.category };
      }
      const byName = db.mindMapCategories.find(c => c.name.toLowerCase() === String(map.category || '').toLowerCase());
      if (byName) return { ...map, categoryId: byName.id, category: byName.name };
      return map;
    });
  }
  db.aguPlan = sanitizeAguPlan(db.aguPlan, todayStr);
  if (db.aguPlan?.startedAt) {
    db.aguPlan = ensureCurrentCycle(db.aguPlan, db.examQuestions || [], todayStr);
  }
  if (!db.bossRaid) {
    db.bossRaid = createBossRaid({ level: 1 });
  } else {
    if (!db.bossRaid.level) db.bossRaid.level = 1;
    if (db.bossRaid.defeatsCount === undefined) {
      db.bossRaid.defeatsCount = db.bossRaid.defeated ? 1 : 0;
    }
    if (!db.bossRaid.icon) {
      const match = BOSS_CATALOG.find(b => b.name === db.bossRaid.name);
      db.bossRaid.icon = match ? match.icon : '🐉';
    }
    if (!db.bossRaid.maxHp) db.bossRaid.maxHp = 500;
    if (db.bossRaid.currentHp === undefined) db.bossRaid.currentHp = db.bossRaid.maxHp;
    if (db.bossRaid.defeated === undefined) db.bossRaid.defeated = false;
    if (!db.bossRaid.rewardCoins) db.bossRaid.rewardCoins = 150;
    if (!db.bossRaid.rewardXp) db.bossRaid.rewardXp = 400;
  }
  ensureOracleMemory(db);
  const savedKey = db.integrations?.openrouterApiKey;
  if (savedKey) setStoredOpenRouterKey(savedKey);
  applyLocationDefaults(db);
  (db.quests || []).forEach((quest) => migrateActivityScale(quest));
  (db.habits || []).forEach((habit) => migrateActivityScale(habit));
  migrateCanonicalSchemas(db);
  return db;
}

/**
 * Migrações idempotentes de schema. Não reescreve XP/moedas já concedidos.
 * Processos: schema canônico HTTP (totalUnits/completedUnits/unitName/xpPerUnit/status in_progress).
 * Recompensas: campo canônico `cost` (costCoins legado é lido e copiado).
 */
export function migrateCanonicalSchemas(db) {
  if (!db) return db;

  (db.processes || []).forEach((process) => {
    if (!process || typeof process !== 'object') return;
    if (process.totalUnits == null && process.totalSteps != null) {
      process.totalUnits = process.totalSteps;
    }
    if (process.completedUnits == null && process.currentStep != null) {
      process.completedUnits = process.currentStep;
    }
    if (!process.unitName && process.stepUnit) {
      process.unitName = process.stepUnit;
    }
    if (process.xpPerUnit == null || !Number.isFinite(Number(process.xpPerUnit))) {
      process.xpPerUnit = 15;
    }
    if (process.coinsPerUnit == null || !Number.isFinite(Number(process.coinsPerUnit))) {
      process.coinsPerUnit = 3;
    }
    if (process.status === 'active') process.status = 'in_progress';
    if (process.status !== 'completed' && process.status !== 'in_progress') {
      const done = (process.completedUnits || 0) >= (process.totalUnits || 0) && (process.totalUnits || 0) > 0;
      process.status = done ? 'completed' : 'in_progress';
    }
    // Espelha os aliases MCP para leitores antigos, sem ser a fonte da verdade.
    process.totalSteps = process.totalUnits;
    process.currentStep = process.completedUnits;
    process.stepUnit = process.unitName;
  });

  (db.rewards || []).forEach((reward) => {
    if (!reward || typeof reward !== 'object') return;
    if (reward.cost == null && reward.costCoins != null) {
      reward.cost = reward.costCoins;
    }
    if (reward.costCoins == null && reward.cost != null) {
      reward.costCoins = reward.cost;
    }
  });

  return db;
}

// In-memory cache synced with disk and PostgreSQL
let cachedDb = null;

/**
 * Fila de escrita no Postgres com coalescência: se já há uma escrita em
 * voo, agenda no máximo mais uma com o snapshot mais recente. O snapshot
 * é serializado no momento do enfileiramento, então mutações posteriores
 * não vazam para uma escrita já agendada.
 */
let writeChain = Promise.resolve();
let pendingWrite = null;
let lastWriteError = null;

const UPSERT_SQL = `
  INSERT INTO grimorio_store (key, data, updated_at)
  VALUES ('main', $1, NOW())
  ON CONFLICT (key) DO UPDATE
  SET data = $1, updated_at = NOW();
`;

function enqueuePostgresWrite(snapshotJson) {
  const p = getPool();
  if (!p) return;
  if (pendingWrite) {
    pendingWrite.snapshotJson = snapshotJson;
    return;
  }
  pendingWrite = { snapshotJson };
  writeChain = writeChain.then(() => drainPostgresWrites(p)).catch((err) => {
    lastWriteError = err;
    console.error('❌ [Grimório DB] Erro ao persistir dados no PostgreSQL:', err.message);
  });
}

async function drainPostgresWrites(p) {
  while (pendingWrite) {
    const job = pendingWrite;
    pendingWrite = null;
    try {
      await p.query(UPSERT_SQL, [JSON.parse(job.snapshotJson)]);
      lastWriteError = null;
    } catch (err) {
      lastWriteError = err;
      console.error('❌ [Grimório DB] Erro ao persistir dados no PostgreSQL:', err.message);
      throw err;
    }
  }
}

/** Resolve quando a fila de escrita do Postgres esvazia. Rejeita se a última escrita falhou. */
export function flushDb() {
  const p = getPool();
  if (!p) return Promise.resolve();
  return writeChain.then(() => {
    if (lastWriteError) {
      const err = lastWriteError;
      return Promise.reject(err);
    }
  });
}

/**
 * Escrita atômica no modo arquivo: grava um temporário e renomeia.
 * A versão anterior boa vira database.json.bak.
 */
export function writeDbFileAtomic(filePath, contents) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.database.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, contents, 'utf-8');
  if (fs.existsSync(filePath)) {
    try {
      fs.copyFileSync(filePath, filePath + '.bak');
    } catch (err) {
      console.warn('[Grimório DB] Não foi possível atualizar o .bak:', err.message);
    }
  }
  fs.renameSync(tmp, filePath);
}

function loadFileDb() {
  if (!fs.existsSync(DB_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch (err) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const corruptPath = path.join(DATA_DIR, `database.corrupt-${stamp}.json`);
    try {
      fs.renameSync(DB_FILE, corruptPath);
      console.error(`❌ [Grimório DB] database.json corrompido foi preservado em ${path.basename(corruptPath)}: ${err.message}`);
    } catch (renameErr) {
      console.error('❌ [Grimório DB] database.json corrompido e não pôde ser renomeado:', renameErr.message);
    }
    if (fs.existsSync(DB_BAK_FILE)) {
      try {
        const bak = JSON.parse(fs.readFileSync(DB_BAK_FILE, 'utf-8'));
        console.warn('⚠️ [Grimório DB] Recuperado a partir de database.json.bak.');
        return bak;
      } catch (bakErr) {
        console.error('❌ [Grimório DB] database.json.bak também está corrompido:', bakErr.message);
      }
    }
    console.error('❌ [Grimório DB] Sem backup utilizável. Iniciando com o banco padrão vazio. Os dados corrompidos NÃO foram sobrescritos.');
    return null;
  }
}

export async function initDb() {
  const p = getPool();
  if (p) {
    try {
      // 1. Ensure table exists
      await p.query(`
        CREATE TABLE IF NOT EXISTS grimorio_store (
          key VARCHAR(50) PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      // 2. Try loading main record
      const res = await p.query(`SELECT data FROM grimorio_store WHERE key = 'main' LIMIT 1;`);
      if (res.rows.length > 0 && res.rows[0].data) {
        cachedDb = sanitizeDb(res.rows[0].data);
        console.log('🔮 [Grimório DB] Conectado e sincronizado com PostgreSQL (Supabase)!');
        return cachedDb;
      }

      // 3. If empty in PostgreSQL, migrate from local database.json or defaults
      let initialData = loadFileDb();
      if (!initialData) initialData = defaultDatabase();
      initialData = sanitizeDb(initialData);

      await p.query(UPSERT_SQL, [initialData]);

      cachedDb = initialData;
      console.log('🔮 [Grimório DB] PostgreSQL (Supabase) inicializado com sucesso e dados migrados!');
      return cachedDb;
    } catch (err) {
      console.error('❌ [Grimório DB] Erro ao conectar ao PostgreSQL, usando fallback local:', err.message);
    }
  }

  // Fallback to local file
  getDb();
  return cachedDb;
}

export function getDb() {
  if (cachedDb) return cachedDb;

  const loaded = loadFileDb();
  if (loaded) {
    cachedDb = sanitizeDb(loaded);
    return cachedDb;
  }

  cachedDb = defaultDatabase();
  saveDb(cachedDb);
  return cachedDb;
}

export function saveDb(data) {
  cachedDb = sanitizeDb(data);
  const snapshotJson = JSON.stringify(cachedDb);

  // 1. Save local file atomically (also the backup when Postgres is primary)
  try {
    writeDbFileAtomic(DB_FILE, JSON.stringify(cachedDb, null, 2));
  } catch (err) {
    console.error('Error saving local database backup:', err);
  }

  // 2. Save to Postgres if available (queued, coalesced, snapshotted)
  if (getPool()) {
    enqueuePostgresWrite(snapshotJson);
  }
}

/** Só para testes: descarta o cache em memória para forçar releitura do disco. */
export function __resetDbCacheForTests() {
  cachedDb = null;
  writeChain = Promise.resolve();
  pendingWrite = null;
  lastWriteError = null;
}

// Find or create user on login
export function findOrCreateUser({ email, name, picture, googleId, provider }) {
  const db = getDb();
  if (!db.users) db.users = [];

  let user = db.users.find(u => (googleId && u.googleId === googleId) || (email && u.email === email));

  if (!user) {
    user = {
      id: 'usr-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
      email: email || '',
      name: name || 'Aventureiro',
      picture: picture || '',
      googleId: googleId || null,
      provider: provider || (googleId ? 'google' : 'local'),
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    };
    db.users.push(user);
  } else {
    user.lastLogin = new Date().toISOString();
    if (name) user.name = name;
    if (picture) user.picture = picture;
    if (googleId) user.googleId = googleId;
    if (provider) user.provider = provider;
  }

  // Sync user profile data if it matches current active profile or set it
  if (db.userProfile) {
    if (!db.userProfile.email || db.userProfile.email === email || db.users.length === 1) {
      db.userProfile.name = user.name || db.userProfile.name;
      db.userProfile.email = user.email || db.userProfile.email;
      db.userProfile.picture = user.picture || db.userProfile.picture;
    }
  }

  saveDb(db);
  return user;
}

const STAT_KEYS = ['wisdom', 'focus', 'willpower', 'consistency'];

/** Número finito ou fallback. Nunca deixa NaN/Infinity entrar no perfil. */
export function finiteOr(value, fallback = 0) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function ensureStats(profile) {
  if (!profile.stats || typeof profile.stats !== 'object') profile.stats = {};
  for (const key of STAT_KEYS) {
    profile.stats[key] = Math.max(0, finiteOr(profile.stats[key], 0));
  }
}

function addStat(profile, key, delta) {
  profile.stats[key] = Math.max(0, finiteOr(profile.stats[key], 0) + finiteOr(delta, 0));
}

/**
 * Aplica XP e processa level-ups. Cada nível sobe registra {level, coins}
 * com bônus = novoNível * 15. Retorna os level-ups desta aplicação.
 */
export function applyXpAndLevelUps(profile, xpAmount) {
  const levelUps = [];
  profile.xp = finiteOr(profile.xp, 0) + finiteOr(xpAmount, 0);
  profile.level = Math.max(1, finiteOr(profile.level, 1));
  profile.xpToNextLevel = Math.max(1, finiteOr(profile.xpToNextLevel, getXpForLevel(profile.level)));
  let guard = 0;
  while (profile.xp >= profile.xpToNextLevel && guard < 500) {
    profile.xp -= profile.xpToNextLevel;
    profile.level += 1;
    profile.xpToNextLevel = getXpForLevel(profile.level);
    profile.title = getTitleForLevel(profile.level);
    const bonus = profile.level * 15;
    profile.coins = finiteOr(profile.coins, 0) + bonus;
    levelUps.push({ level: profile.level, coins: bonus });
    guard += 1;
  }
  return levelUps;
}

/**
 * Desfaz level-ups usando os bônus gravados (simétrico com a subida).
 * Logs legados sem levelUps caem na fórmula newLevel*15 após o decremento.
 */
export function applyLevelDowns(profile, levelUps, { chargeCoins = true } = {}) {
  const recorded = Array.isArray(levelUps) ? levelUps.slice().reverse() : [];
  profile.xp = finiteOr(profile.xp, 0);
  profile.level = Math.max(1, finiteOr(profile.level, 1));
  let guard = 0;
  while (profile.xp < 0 && profile.level > 1 && guard < 500) {
    profile.level -= 1;
    profile.xpToNextLevel = getXpForLevel(profile.level);
    profile.xp += profile.xpToNextLevel;
    profile.title = getTitleForLevel(profile.level);
    if (chargeCoins) {
      const match = recorded.find(entry => entry && entry.level === profile.level + 1);
      const bonus = match ? finiteOr(match.coins, (profile.level + 1) * 15) : (profile.level + 1) * 15;
      profile.coins = finiteOr(profile.coins, 0) - bonus;
    }
    guard += 1;
  }
  if (profile.xp < 0) profile.xp = 0;
}

function hasRecordedDeltas(log) {
  return !!(log && log.applied && typeof log.applied === 'object');
}

function legacyApplied(log, fallback = {}) {
  const xp = finiteOr(log?.xp, finiteOr(fallback.xp, 0));
  const coins = finiteOr(log?.coins, finiteOr(fallback.coins, 0));
  return {
    xp,
    coins,
    wisdom: finiteOr(fallback.wisdom, 0),
    focus: finiteOr(fallback.focus, 0),
    willpower: finiteOr(fallback.willpower, 0),
    consistency: finiteOr(fallback.consistency, 0),
    bossDamage: Math.round(xp * 0.8 + coins * 1.2),
    bossDefeated: !!(log?.details?.bossDefeated),
    bossId: log?.details?.bossId || null,
    bossRewardXp: 0,
    bossRewardCoins: 0,
    levelUps: []
  };
}

function resolveApplied(log, fallback = {}) {
  if (hasRecordedDeltas(log)) {
    const applied = log.applied;
    return {
      xp: finiteOr(applied.xp, 0),
      coins: finiteOr(applied.coins, 0),
      wisdom: finiteOr(applied.wisdom, 0),
      focus: finiteOr(applied.focus, 0),
      willpower: finiteOr(applied.willpower, 0),
      consistency: finiteOr(applied.consistency, 0),
      bossDamage: finiteOr(applied.bossDamage, 0),
      bossDefeated: !!applied.bossDefeated,
      bossId: applied.bossId || null,
      bossRewardXp: finiteOr(applied.bossRewardXp, 0),
      bossRewardCoins: finiteOr(applied.bossRewardCoins, 0),
      levelUps: Array.isArray(applied.levelUps) ? applied.levelUps : []
    };
  }
  return legacyApplied(log, fallback);
}

/**
 * Localiza o melhor log para estorno.
 * Preferência: logId explícito; senão entityId+type+date; senão o mais recente
 * (entityId+type). `date` também casa com details.date (hábitos retroativos).
 */
export function findRewardLog(db, { logId, entityId, actionType, date } = {}) {
  const logs = db?.actionLogs || [];
  if (logId) {
    return logs.find(l => l.id === logId) || null;
  }
  if (!actionType) return null;
  const candidates = logs.filter(l => {
    if (l.type !== actionType) return false;
    if (entityId != null && entityId !== '' && l.entityId !== entityId) return false;
    return true;
  });
  if (!candidates.length) return null;
  if (date) {
    const dated = candidates.find(l => l.date === date || l.details?.date === date);
    if (dated) return dated;
  }
  return candidates[0];
}

// Reward player helper: handles XP, leveling, coins, stats, boss damage and action logging.
// O timestamp do cliente só data o log (lançamento retroativo). A sequência do herói
// usa sempre a data de São Paulo do servidor — um relógio do cliente não a move.
export function rewardPlayer({ xp = 0, coins = 0, wisdom = 0, focus = 0, willpower = 0, consistency = 0, actionType, entityId, title, details = {}, timestamp, logDate }) {
  const db = getDb();
  const profile = db.userProfile;
  if (!profile.stats) profile.stats = { wisdom: 0, focus: 0, willpower: 0, consistency: 0 };
  ensureStats(profile);

  const serverNow = new Date();
  const safeXp = finiteOr(xp, 0);
  const safeCoins = finiteOr(coins, 0);
  const safeWisdom = finiteOr(wisdom, 0);
  const safeFocus = finiteOr(focus, 0);
  const safeWillpower = finiteOr(willpower, 0);
  const safeConsistency = finiteOr(consistency, 0);

  addStat(profile, 'wisdom', safeWisdom);
  addStat(profile, 'focus', safeFocus);
  addStat(profile, 'willpower', safeWillpower);
  addStat(profile, 'consistency', safeConsistency);

  profile.coins = finiteOr(profile.coins, 0) + safeCoins;

  const oldLevel = profile.level;
  const levelUps = applyXpAndLevelUps(profile, safeXp);

  const boss = db.bossRaid;
  let bossDefeatedNow = false;
  let bossDamage = 0;
  let bossRewardXp = 0;
  let bossRewardCoins = 0;
  let bossId = boss?.id || null;
  if (boss && !boss.defeated) {
    bossDamage = Math.round(safeXp * 0.8 + safeCoins * 1.2);
    boss.currentHp = Math.max(0, finiteOr(boss.currentHp, boss.maxHp || 0) - bossDamage);
    if (boss.currentHp === 0) {
      boss.defeated = true;
      boss.defeatsCount = finiteOr(boss.defeatsCount, 0) + 1;
      bossDefeatedNow = true;
      bossRewardCoins = finiteOr(boss.rewardCoins, 0);
      bossRewardXp = finiteOr(boss.rewardXp, 0);
      profile.coins = finiteOr(profile.coins, 0) + bossRewardCoins;
      // XP do chefe também passa pelo laço de level-up (antes ficava acima de xpToNextLevel).
      levelUps.push(...applyXpAndLevelUps(profile, bossRewardXp));
    }
  }

  // Sequência do herói: somente a data do servidor.
  const streakDate = getSaoPauloDateStr(serverNow);
  if (profile.lastActiveDate !== streakDate) {
    const yesterday = getYesterdaySaoPauloDateStr(serverNow);
    if (profile.lastActiveDate === yesterday) {
      profile.streak = finiteOr(profile.streak, 0) + 1;
    } else {
      profile.streak = 1;
    }
    profile.lastActiveDate = streakDate;
  }

  // Data do log pode ser retroativa (timestamp/logDate do cliente), sem mexer na sequência.
  let logMoment = serverNow;
  if (logDate && /^\d{4}-\d{2}-\d{2}$/.test(String(logDate))) {
    logMoment = new Date(`${logDate}T15:00:00.000Z`);
  } else if (timestamp) {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.getTime())) logMoment = parsed;
  }
  const logDateStr = getSaoPauloDateStr(logMoment);

  const applied = {
    xp: safeXp,
    coins: safeCoins,
    wisdom: safeWisdom,
    focus: safeFocus,
    willpower: safeWillpower,
    consistency: safeConsistency,
    bossDamage,
    bossDefeated: bossDefeatedNow,
    bossId,
    bossRewardXp,
    bossRewardCoins,
    levelUps
  };

  const logEntry = {
    id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
    type: actionType,
    entityId: entityId || '',
    title: title || '',
    xp: safeXp,
    coins: safeCoins,
    wisdom: safeWisdom,
    focus: safeFocus,
    willpower: safeWillpower,
    consistency: safeConsistency,
    applied,
    details: { ...(details || {}), bossDefeated: bossDefeatedNow, bossId },
    timestamp: logMoment.toISOString(),
    hour: getSaoPauloHour(logMoment),
    dayOfWeek: getSaoPauloDayOfWeek(logMoment),
    date: logDateStr
  };
  if (!db.actionLogs) db.actionLogs = [];
  db.actionLogs.unshift(logEntry);

  if (db.actionLogs.length > 5000) {
    db.actionLogs = db.actionLogs.slice(0, 5000);
  }

  saveDb(db);

  return {
    profile,
    boss,
    leveledUp: levelUps.length > 0,
    oldLevel,
    newLevel: profile.level,
    bossDefeatedNow,
    logEntry,
    levelUps
  };
}

/**
 * Estorna exatamente os deltas gravados em `applied` e remove o log.
 * Se este log derrotou o chefe e o chefe atual ainda é o mesmo, reabre o chefe
 * e devolve as recompensas de derrota. Moedas podem ficar negativas (dívida de
 * estorno); atributos e XP nunca ficam NaN e atributos têm piso 0.
 */
export function revertLog(db, logId, { save = true } = {}) {
  const target = db || getDb();
  const profile = target.userProfile;
  ensureStats(profile);
  if (!target.actionLogs) target.actionLogs = [];

  const logIndex = target.actionLogs.findIndex(l => l.id === logId);
  if (logIndex === -1) {
    return { profile, boss: target.bossRaid, reverted: false, missing: true };
  }
  const removedLog = target.actionLogs[logIndex];
  const applied = resolveApplied(removedLog);
  target.actionLogs.splice(logIndex, 1);

  addStat(profile, 'wisdom', -applied.wisdom);
  addStat(profile, 'focus', -applied.focus);
  addStat(profile, 'willpower', -applied.willpower);
  addStat(profile, 'consistency', -applied.consistency);

  profile.coins = finiteOr(profile.coins, 0) - applied.coins;
  profile.xp = finiteOr(profile.xp, 0) - applied.xp;
  applyLevelDowns(profile, applied.levelUps);

  const boss = target.bossRaid;
  if (boss && applied.bossDamage) {
    boss.currentHp = Math.min(
      finiteOr(boss.maxHp, boss.currentHp || 0),
      finiteOr(boss.currentHp, 0) + applied.bossDamage
    );
  }
  const sameBoss = !applied.bossId || !boss?.id || applied.bossId === boss.id;
  if (boss && applied.bossDefeated && sameBoss && boss.currentHp > 0) {
    boss.defeated = false;
    boss.defeatsCount = Math.max(0, finiteOr(boss.defeatsCount, 1) - 1);
    profile.coins = finiteOr(profile.coins, 0) - applied.bossRewardCoins;
    profile.xp = finiteOr(profile.xp, 0) - applied.bossRewardXp;
    // O XP do chefe já passou pelo mesmo loop de level-up, e o bônus de cada
    // nível está em applied.levelUps — já estornado acima. Aqui só desce o
    // nível se o XP ficar negativo, sem cobrar o bônus de novo.
    applyLevelDowns(profile, applied.levelUps, { chargeCoins: false });
  }

  if (save) saveDb(target);

  return {
    profile,
    boss,
    reverted: true,
    missing: false,
    revertedXp: applied.xp,
    revertedCoins: applied.coins,
    log: removedLog
  };
}

/**
 * Wrapper compatível. Prefere logId; senão entityId+type+date; senão o mais
 * recente. Logs legados sem `applied` usam os valores do argumento para
 * atributos e xp/coins gravados no log (ou os do argumento, se o log sumiu).
 */
export function revertPlayerReward({ xp = 0, coins = 0, wisdom = 0, focus = 0, willpower = 0, consistency = 0, actionType, entityId, logId, date } = {}) {
  const db = getDb();
  const log = findRewardLog(db, { logId, entityId, actionType, date });

  if (log && hasRecordedDeltas(log)) {
    const result = revertLog(db, log.id);
    return {
      profile: result.profile,
      boss: result.boss,
      revertedXp: result.revertedXp,
      revertedCoins: result.revertedCoins,
      log: result.log
    };
  }

  if (log) {
    // Legado: estorna o que o log registrou de xp/moedas e os atributos
    // informados pelo chamador (o log antigo não os gravava).
    const applied = legacyApplied(log, { xp, coins, wisdom, focus, willpower, consistency });
    log.applied = applied;
    const result = revertLog(db, log.id);
    return {
      profile: result.profile,
      boss: result.boss,
      revertedXp: result.revertedXp,
      revertedCoins: result.revertedCoins,
      log: result.log
    };
  }

  // Log podado (teto de 5000) ou nunca existiu: estorna só o que o chamador sabe.
  const profile = db.userProfile;
  ensureStats(profile);
  const applied = legacyApplied(null, { xp, coins, wisdom, focus, willpower, consistency });
  addStat(profile, 'wisdom', -applied.wisdom);
  addStat(profile, 'focus', -applied.focus);
  addStat(profile, 'willpower', -applied.willpower);
  addStat(profile, 'consistency', -applied.consistency);
  profile.coins = finiteOr(profile.coins, 0) - applied.coins;
  profile.xp = finiteOr(profile.xp, 0) - applied.xp;
  applyLevelDowns(profile, []);
  saveDb(db);
  return {
    profile,
    boss: db.bossRaid,
    revertedXp: applied.xp,
    revertedCoins: applied.coins,
    missing: true
  };
}
