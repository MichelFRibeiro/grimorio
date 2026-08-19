import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
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

const defaultDatabase = () => {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

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
    bossRaid: {
      id: 'boss-1',
      name: 'O Dragão da Procrastinação',
      subtitle: 'Chefe Semanal - Derrote-o até domingo!',
      maxHp: 500,
      currentHp: 500,
      defeated: false,
      rewardCoins: 150,
      rewardXp: 400,
      weekStartDate: todayStr
    },
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

// In-memory cache synced with disk
let cachedDb = null;

export function getDb() {
  if (cachedDb) return cachedDb;

  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      cachedDb = JSON.parse(raw);
      if (!cachedDb.examQuestions) cachedDb.examQuestions = [];
      if (!cachedDb.books) cachedDb.books = [];
      if (!cachedDb.readingSessions) cachedDb.readingSessions = [];
      if (!cachedDb.users) cachedDb.users = [];
      if (!cachedDb.questCategories || cachedDb.questCategories.length === 0) {
        cachedDb.questCategories = [...defaultQuestCategories];
      }
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
  cachedDb = data;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving database:', err);
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
      bossDefeatedNow = true;
      profile.coins += boss.rewardCoins;
      profile.xp += boss.rewardXp;
    }
  }

  // Check Daily Streak
  const todayStr = now.toISOString().split('T')[0];
  if (profile.lastActiveDate !== todayStr) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
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
    hour: now.getHours(),
    dayOfWeek: now.getDay(),
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
