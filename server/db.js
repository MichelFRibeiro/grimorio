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

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let pool = null;

export function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
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
  { id: 'cat-1', name: 'Trabalho', color: '#38bdf8', icon: 'Briefcase' },
  { id: 'cat-2', name: 'Estudos', color: '#a855f7', icon: 'GraduationCap' },
  { id: 'cat-3', name: 'Pessoal', color: '#10b981', icon: 'User' },
  { id: 'cat-4', name: 'Projetos', color: '#f59e0b', icon: 'FolderGit2' },
  { id: 'cat-5', name: 'Saúde', color: '#f43f5e', icon: 'Heart' },
  { id: 'cat-6', name: 'Finanças', color: '#eab308', icon: 'Coins' }
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
      theme: 'dark-fantasy'
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
    actionLogs: []
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
  return db;
}

// In-memory cache synced with disk and PostgreSQL
let cachedDb = null;

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
      let initialData = null;
      if (fs.existsSync(DB_FILE)) {
        try {
          const raw = fs.readFileSync(DB_FILE, 'utf-8');
          initialData = JSON.parse(raw);
        } catch (e) {
          console.warn('Erro ao ler database.json para migração inicial:', e.message);
        }
      }
      if (!initialData) initialData = defaultDatabase();
      initialData = sanitizeDb(initialData);

      await p.query(`
        INSERT INTO grimorio_store (key, data, updated_at)
        VALUES ('main', $1, NOW())
        ON CONFLICT (key) DO UPDATE
        SET data = $1, updated_at = NOW();
      `, [initialData]);

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

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      cachedDb = JSON.parse(raw);
      cachedDb = sanitizeDb(cachedDb);
      return cachedDb;
    } catch (err) {
      console.error('Error loading database file, initializing defaults:', err);
    }
  }

  cachedDb = defaultDatabase();
  saveDb(cachedDb);
  return cachedDb;
}

export function saveDb(data) {
  cachedDb = sanitizeDb(data);

  // 1. Save local backup file
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(cachedDb, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving local database backup:', err);
  }

  // 2. Save to Postgres if available
  const p = getPool();
  if (p) {
    p.query(`
      INSERT INTO grimorio_store (key, data, updated_at)
      VALUES ('main', $1, NOW())
      ON CONFLICT (key) DO UPDATE
      SET data = $1, updated_at = NOW();
    `, [cachedDb]).catch(err => {
      console.error('❌ [Grimório DB] Erro ao persistir dados no PostgreSQL:', err.message);
    });
  }
}

// Find or create user on login
export function findOrCreateUser({ email, name, picture, googleId }) {
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
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    };
    db.users.push(user);
  } else {
    user.lastLogin = new Date().toISOString();
    if (name) user.name = name;
    if (picture) user.picture = picture;
    if (googleId) user.googleId = googleId;
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

// Reward player helper: handles XP, leveling, coins, stats, boss damage and action logging
export function rewardPlayer({ xp = 0, coins = 0, wisdom = 0, focus = 0, willpower = 0, consistency = 0, actionType, entityId, title, details = {}, timestamp }) {
  const db = getDb();
  const profile = db.userProfile;
  const now = timestamp ? new Date(timestamp) : new Date();

  // Add stats
  profile.stats.wisdom = (profile.stats.wisdom || 0) + wisdom;
  profile.stats.focus = (profile.stats.focus || 0) + focus;
  profile.stats.willpower = (profile.stats.willpower || 0) + willpower;
  profile.stats.consistency = (profile.stats.consistency || 0) + consistency;

  // Add coins
  profile.coins = (profile.coins || 0) + coins;

  // Add XP and handle level-ups
  profile.xp = (profile.xp || 0) + xp;
  let leveledUp = false;
  let oldLevel = profile.level;

  while (profile.xp >= profile.xpToNextLevel) {
    profile.xp -= profile.xpToNextLevel;
    profile.level += 1;
    profile.xpToNextLevel = getXpForLevel(profile.level);
    profile.title = getTitleForLevel(profile.level);
    profile.coins += profile.level * 15; // Level up coin bonus
    leveledUp = true;
  }

  // Damage Weekly Boss
  const boss = db.bossRaid;
  let bossDefeatedNow = false;
  if (boss && !boss.defeated) {
    const totalDmg = Math.round(xp * 0.8 + coins * 1.2);
    boss.currentHp = Math.max(0, boss.currentHp - totalDmg);
    if (boss.currentHp === 0) {
      boss.defeated = true;
      boss.defeatsCount = (boss.defeatsCount || 0) + 1;
      bossDefeatedNow = true;
      profile.coins += boss.rewardCoins;
      profile.xp += boss.rewardXp;
    }
  }

  // Check Daily Streak
  const todayStr = getSaoPauloDateStr(now);
  if (profile.lastActiveDate !== todayStr) {
    const yesterday = getYesterdaySaoPauloDateStr(now);
    if (profile.lastActiveDate === yesterday) {
      profile.streak = (profile.streak || 0) + 1;
    } else {
      profile.streak = 1;
    }
    profile.lastActiveDate = todayStr;
  }

  // Record in master action logs
  const logEntry = {
    id: 'log-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    type: actionType,
    entityId: entityId || '',
    title: title || '',
    xp,
    coins,
    details: { ...(details || {}), bossDefeated: bossDefeatedNow },
    timestamp: now.toISOString(),
    hour: getSaoPauloHour(now),
    dayOfWeek: getSaoPauloDayOfWeek(now),
    date: todayStr
  };
  db.actionLogs.unshift(logEntry);

  // Keep logs at a reasonable limit (e.g. 5000)
  if (db.actionLogs.length > 5000) {
    db.actionLogs = db.actionLogs.slice(0, 5000);
  }

  saveDb(db);

  return {
    profile,
    boss,
    leveledUp,
    oldLevel,
    newLevel: profile.level,
    bossDefeatedNow,
    logEntry
  };
}

// Revert player reward helper: removes points, coins, stats, restores boss HP and removes action log entry
export function revertPlayerReward({ xp = 0, coins = 0, wisdom = 0, focus = 0, willpower = 0, consistency = 0, actionType, entityId }) {
  const db = getDb();
  const profile = db.userProfile;

  // Find and remove matching action log entry (the most recent one for this entity and type)
  const logIndex = db.actionLogs.findIndex(l => l.entityId === entityId && l.type === actionType);
  let actualXp = xp;
  let actualCoins = coins;
  let actionDefeatedBoss = false;

  if (logIndex !== -1) {
    const removedLog = db.actionLogs[logIndex];
    if (removedLog.xp !== undefined) actualXp = removedLog.xp;
    if (removedLog.coins !== undefined) actualCoins = removedLog.coins;
    if (removedLog.details?.bossDefeated) actionDefeatedBoss = true;
    db.actionLogs.splice(logIndex, 1);
  }

  // Deduct stats safely
  profile.stats.wisdom = Math.max(0, (profile.stats.wisdom || 0) - wisdom);
  profile.stats.focus = Math.max(0, (profile.stats.focus || 0) - focus);
  profile.stats.willpower = Math.max(0, (profile.stats.willpower || 0) - willpower);
  profile.stats.consistency = Math.max(0, (profile.stats.consistency || 0) - consistency);

  // Deduct coins safely
  profile.coins = Math.max(0, (profile.coins || 0) - actualCoins);

  // Deduct XP and step down levels if needed
  profile.xp = (profile.xp || 0) - actualXp;
  while (profile.xp < 0 && profile.level > 1) {
    profile.level -= 1;
    profile.xpToNextLevel = getXpForLevel(profile.level);
    profile.xp += profile.xpToNextLevel;
    profile.title = getTitleForLevel(profile.level);
    profile.coins = Math.max(0, profile.coins - profile.level * 15);
  }
  if (profile.xp < 0) {
    profile.xp = 0;
  }

  // Restore Boss HP and revert boss rewards only if this specific action defeated it
  const boss = db.bossRaid;
  if (boss) {
    const totalDmg = Math.round(actualXp * 0.8 + actualCoins * 1.2);
    boss.currentHp = Math.min(boss.maxHp, boss.currentHp + totalDmg);
    if (actionDefeatedBoss && boss.currentHp > 0) {
      boss.defeated = false;
      boss.defeatsCount = Math.max(0, (boss.defeatsCount || 1) - 1);
      profile.coins = Math.max(0, profile.coins - boss.rewardCoins);
      profile.xp -= boss.rewardXp;
      while (profile.xp < 0 && profile.level > 1) {
        profile.level -= 1;
        profile.xpToNextLevel = getXpForLevel(profile.level);
        profile.xp += profile.xpToNextLevel;
        profile.title = getTitleForLevel(profile.level);
        profile.coins = Math.max(0, profile.coins - profile.level * 15);
      }
      if (profile.xp < 0) {
        profile.xp = 0;
      }
    }
  }

  saveDb(db);

  return {
    profile,
    boss,
    revertedXp: actualXp,
    revertedCoins: actualCoins
  };
}
