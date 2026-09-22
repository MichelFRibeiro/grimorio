import fs from 'fs';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, saveDb, initDb, rewardPlayer, revertPlayerReward, getXpForLevel, getTitleForLevel, findOrCreateUser, createBossRaid, BOSS_CATALOG, applyCategoryRename } from './db.js';
import { computeAnalytics } from './analytics.js';
import { computeCategoryRankings, RANK_TIERS } from './rankings.js';
import { computeNextAction } from './nextAction.js';
import {
  LOCATIONS,
  normalizeLocation,
  applyActivityContext,
  defaultLocationForCategory
} from './locations.js';
import {
  verifyGoogleToken,
  createSession,
  destroySession,
  getGoogleClientId,
  authMiddleware
} from './auth.js';
import { initKeepAlive } from './keepAlive.js';
import {
  getSaoPauloDateStr,
  getSaoPauloHour,
  getSaoPauloDayOfWeek,
  calculateHabitStreak
} from './timeUtils.js';
import { applyHabitFrequency } from '../src/utils/habitFrequency.js';
import { getMcpToken, regenerateMcpToken, mcpAuthMiddleware, mcpSseMessagesAuthMiddleware } from './mcpAuth.js';
import { handleSseConnection, handleSseMessage, handleDirectJsonRpc, handleMcpDiscoveryGet } from './mcpServer.js';
import {
  applyDifficultyFields,
  resolveActivityScale,
  willpowerForDifficulty
} from '../src/utils/activityScale.js';
import { spendMoney, refundCoinsFromRedemption } from './tavernMoney.js';
import { formatBrl } from '../src/utils/coinExchange.js';
import { parseDurationMinutes, setHabitDurationForDate, clearHabitDurationForDate, mergeLiveActivityTimers, sanitizeLiveActivityTimers, clearLiveActivityTimer, liveTimersEqual } from '../src/utils/activityDuration.js';
import { AGU_SUBJECTS, createDefaultAguPlan } from '../src/data/aguCurriculum.js';
import {
  sanitizeAguPlan,
  startAguPlan,
  realignAguCycle,
  summarizePlan,
  toggleCompletedBlock,
  addBlockDuration,
  setBlockDuration,
  ensureCurrentCycle,
  advanceAguCycle,
  applyExamToPlan,
  logDiscursiveProduct,
  deleteStudyBlock,
  updateStudyBlockMeta,
  refreshAguProgress
} from '../src/utils/aguCycle.js';
import { collectStudyBlocks } from '../src/utils/aguStudyEngine.js';
import {
  MAX_ACTIVE_NINETY_DAY_GOALS,
  countOccupiedNinetyDayGoalSlots,
  createNinetyDayGoal,
  deleteNinetyDayGoalLog,
  describeCycleBreakdown,
  enrichNinetyDayGoal,
  logNinetyDayGoalProgress,
  previewNinetyDayGoal,
  sanitizeNinetyDayGoals,
  updateNinetyDayGoal
} from '../src/utils/ninetyDayGoals.js';
import {
  MAX_DAILY_VICTORIES,
  EXTENDED_MAX_DAILY_VICTORIES,
  DAILY_VICTORY_REWARDS,
  DAILY_VICTORY_TRIPLE_BONUS,
  bonusEntityId,
  completeDailyVictory,
  createDailyVictory,
  deleteDailyVictory,
  getPlannableDates,
  sanitizeDailyVictories,
  sanitizeDailyVictoryBonuses,
  summarizeDay,
  updateDailyVictory
} from '../src/utils/dailyVictories.js';
import { syncDailyVictoriesFromActivity } from './dailyVictorySync.js';
import {
  createMindMap,
  addMindMapNode,
  updateMindMapNode,
  deleteMindMapNode,
  updateMindMapMeta,
  layoutMindMap,
  applyStudySession,
  sanitizeMindMaps,
  sanitizeMindMapSessions,
  sanitizeMindMapCategories,
  createMindMapCategory,
  applyMindMapCategoryRename,
  reassignMindMapCategory,
  computeMapStats
} from '../src/utils/mindMaps.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Automatically load .env file if present
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    });
  } catch (e) {
    console.warn('Não foi possível ler o arquivo .env:', e.message);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(authMiddleware);

// Serve built frontend if dist exists
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// Helper to generate unique IDs
const uid = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

// ==========================================
// HEALTH & KEEP-ALIVE (ANTI-SLEEP)
// ==========================================
app.get(['/api/health', '/api/ping'], (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    service: 'Grimório de Missões'
  });
});

// ==========================================
// FOCUS AUDIO
// Prefers the bundled copy in data/audio, then az-vault/audios/focus.
// ==========================================
const FOCUS_AUDIO_REL = path.join('audios', 'focus', 'focus_mp3.mp3');
const BUNDLED_FOCUS_AUDIO = path.join(__dirname, '..', 'data', 'audio', 'focus_mp3.mp3');

function getFocusAudioPath() {
  const candidates = [
    process.env.FOCUS_AUDIO_PATH,
    BUNDLED_FOCUS_AUDIO,
    process.env.AZ_VAULT_PATH && path.join(process.env.AZ_VAULT_PATH, FOCUS_AUDIO_REL),
    path.join('/a0/usr/workdir/az-vault', FOCUS_AUDIO_REL),
    path.resolve(process.cwd(), 'az-vault', FOCUS_AUDIO_REL),
    path.resolve(__dirname, '../../../az-vault', FOCUS_AUDIO_REL),
    path.resolve(__dirname, '../../../../az-vault', FOCUS_AUDIO_REL)
  ].filter(Boolean);

  return candidates.find(filePath => fs.existsSync(filePath)) || BUNDLED_FOCUS_AUDIO;
}

function streamFocusAudio(req, res) {
  const filePath = getFocusAudioPath();
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: 'Áudio de foco não encontrado (data/audio/focus_mp3.mp3 ou az-vault/audios/focus/focus_mp3.mp3).'
    });
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.setHeader('Content-Disposition', 'inline; filename="focus_mp3.mp3"');

  if (req.method === 'HEAD') {
    res.setHeader('Content-Length', fileSize);
    return res.status(200).end();
  }

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    if (!match) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }

    const start = match[1] ? parseInt(match[1], 10) : 0;
    const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
      return res.end();
    }

    const safeEnd = Math.min(end, fileSize - 1);
    const chunkSize = safeEnd - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${safeEnd}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);
    return fs.createReadStream(filePath, { start, end: safeEnd }).pipe(res);
  }

  res.setHeader('Content-Length', fileSize);
  return fs.createReadStream(filePath).pipe(res);
}

app.get('/api/focus/track', (req, res) => {
  const filePath = getFocusAudioPath();
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      error: 'Áudio de foco não encontrado (data/audio/focus_mp3.mp3 ou az-vault/audios/focus/focus_mp3.mp3).'
    });
  }

  const stat = fs.statSync(filePath);
  res.json({
    id: 'focus-mp3',
    title: 'Câmara do Foco',
    filename: 'focus_mp3.mp3',
    src: '/api/focus/audio',
    contentType: 'audio/mpeg',
    sizeBytes: stat.size,
    durationHintSeconds: 7160
  });
});

app.head('/api/focus/audio', streamFocusAudio);
app.get('/api/focus/audio', streamFocusAudio);

// ==========================================
// MCP (MODEL CONTEXT PROTOCOL) & EXTERNAL AI AGENTS
// ==========================================

// Token info for UI / integrations
app.get('/api/mcp/token', (req, res) => {
  try {
    const token = getMcpToken();
    res.json({
      success: true,
      token,
      sseUrl: `${req.protocol}://${req.get('host')}/mcp/sse`,
      jsonRpcUrl: `${req.protocol}://${req.get('host')}/api/mcp`,
      serverName: 'Grimório de Missões MCP Server'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Regenerate MCP Bearer token
app.post('/api/mcp/token/regenerate', (req, res) => {
  try {
    const token = regenerateMcpToken();
    res.json({
      success: true,
      token,
      sseUrl: `${req.protocol}://${req.get('host')}/mcp/sse`,
      jsonRpcUrl: `${req.protocol}://${req.get('host')}/api/mcp`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// MCP OPTIONS Preflight
app.options(['/mcp/sse', '/mcp/messages', '/api/mcp', '/mcp'], (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.status(204).end();
});

// MCP SSE Handshake (protected with Bearer Token)
app.get('/mcp/sse', mcpAuthMiddleware, (req, res) => {
  handleSseConnection(req, res);
});

// MCP SSE Messages (protected with session/token authentication)
app.post('/mcp/messages', mcpSseMessagesAuthMiddleware, (req, res) => {
  handleSseMessage(req, res);
});

// Direct JSON-RPC 2.0 Endpoint (protected with Bearer Token)
app.post(['/api/mcp', '/mcp'], mcpAuthMiddleware, (req, res) => {
  handleDirectJsonRpc(req, res);
});

// Direct HTTP GET Discovery Endpoint (protected with Bearer Token)
app.get(['/api/mcp', '/mcp'], mcpAuthMiddleware, (req, res) => {
  handleMcpDiscoveryGet(req, res);
});

// ==========================================
// 0. AUTHENTICATION & SESSIONS
// ==========================================
app.get('/api/auth/config', (req, res) => {
  res.json({
    googleClientId: getGoogleClientId() || ''
  });
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Credencial do Google não fornecida.' });
    }

    const verified = await verifyGoogleToken(credential);
    const user = findOrCreateUser(verified);
    const session = createSession(user);
    const db = getDb();

    res.json({
      success: true,
      token: session.token,
      user,
      userProfile: db.userProfile
    });
  } catch (err) {
    console.error('Erro na autenticação Google:', err);
    res.status(401).json({ error: err.message || 'Falha na autenticação com Google.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, name } = req.body;
    const user = findOrCreateUser({
      email: email || 'usuario@grimorio.app',
      name: name || 'Aventureiro do Foco'
    });
    const session = createSession(user);
    const db = getDb();

    res.json({
      success: true,
      token: session.token,
      user,
      userProfile: db.userProfile
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/guest', (req, res) => {
  try {
    const db = getDb();
    const user = findOrCreateUser({
      email: 'convidado@grimorio.app',
      name: db.userProfile?.name || 'Mestre do Foco'
    });
    const session = createSession(user);

    res.json({
      success: true,
      token: session.token,
      user,
      userProfile: db.userProfile
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', (req, res) => {
  try {
    const db = getDb();
    if (req.user) {
      res.json({
        authenticated: true,
        user: req.user,
        userProfile: db.userProfile
      });
    } else {
      res.json({
        authenticated: false
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      destroySession(authHeader.substring(7).trim());
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 1. GET FULL GAME STATE & ANALYTICS
// ==========================================
app.get('/api/state', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    db.ninetyDayGoals = sanitizeNinetyDayGoals(db.ninetyDayGoals, todayStr);
    db.dailyVictories = sanitizeDailyVictories(db.dailyVictories);
    db.dailyVictoryBonuses = sanitizeDailyVictoryBonuses(db.dailyVictoryBonuses);
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    db.mindMapSessions = sanitizeMindMapSessions(db.mindMapSessions);
    db.mindMapCategories = sanitizeMindMapCategories(db.mindMapCategories);
    db.aguPlan = sanitizeAguPlan(db.aguPlan, todayStr);
    if (db.aguPlan?.startedAt) {
      const next = ensureCurrentCycle(db.aguPlan, db.examQuestions || [], todayStr);
      if (next !== db.aguPlan) {
        db.aguPlan = next;
        saveDb(db);
      }
    }
    const analytics = computeAnalytics();
    const nextAction = computeNextAction(db);
    res.json({
      ...db,
      analytics,
      nextAction,
      locations: LOCATIONS,
      user: req.user || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 1.5. CATEGORY & USER RANKINGS
// ==========================================
app.get('/api/rankings', (req, res) => {
  try {
    const db = getDb();
    const rankings = computeCategoryRankings(db);
    res.json({
      success: true,
      rankings
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. USER PROFILE & THEME
// ==========================================
app.post('/api/profile', (req, res) => {
  try {
    const db = getDb();
    const { name, avatar, title, theme, currentLocation, locationManual } = req.body;
    if (name) db.userProfile.name = name;
    if (avatar) db.userProfile.avatar = avatar;
    if (title) db.userProfile.title = title;
    if (theme) db.userProfile.theme = theme;
    if (currentLocation !== undefined) {
      db.userProfile.currentLocation = currentLocation == null || currentLocation === ''
        ? null
        : normalizeLocation(currentLocation);
      if (locationManual === undefined) {
        db.userProfile.locationManual = db.userProfile.currentLocation != null;
      }
    }
    if (locationManual !== undefined) {
      db.userProfile.locationManual = !!locationManual;
    }
    saveDb(db);
    res.json({ success: true, userProfile: db.userProfile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/live-timers', (req, res) => {
  try {
    const db = getDb();
    const liveActivityTimers = sanitizeLiveActivityTimers(db.liveActivityTimers);
    res.json({ success: true, liveActivityTimers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/live-timers', (req, res) => {
  try {
    const db = getDb();
    const incoming = req.body?.items || req.body?.liveActivityTimers || req.body;
    const merged = mergeLiveActivityTimers(incoming, db.liveActivityTimers);
    if (liveTimersEqual(merged, db.liveActivityTimers)) {
      return res.json({ success: true, liveActivityTimers: db.liveActivityTimers, unchanged: true });
    }
    db.liveActivityTimers = merged;
    saveDb(db);
    res.json({ success: true, liveActivityTimers: db.liveActivityTimers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2.2. NEXT ACTION (ORACLE SUGGESTION)
// ==========================================
app.get('/api/next-action', (req, res) => {
  try {
    const db = getDb();
    const location = req.query.location ? String(req.query.location) : undefined;
    const snoozedIds = req.query.snoozed
      ? String(req.query.snoozed).split(',').map(s => s.trim()).filter(Boolean)
      : [];
    const result = computeNextAction(db, { location, snoozedIds });
    res.json({
      success: true,
      ...result,
      locations: LOCATIONS
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/next-action/location', (req, res) => {
  try {
    const db = getDb();
    const { location, manual } = req.body || {};
    if (location === undefined) {
      return res.status(400).json({ error: 'location é obrigatório' });
    }
    db.userProfile.currentLocation = location == null || location === ''
      ? null
      : normalizeLocation(location);
    db.userProfile.locationManual = manual === undefined
      ? db.userProfile.currentLocation != null
      : !!manual;
    saveDb(db);
    const result = computeNextAction(db, {
      location: db.userProfile.currentLocation || 'anywhere'
    });
    res.json({
      success: true,
      userProfile: db.userProfile,
      ...result,
      locations: LOCATIONS
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2.5. QUEST CATEGORIES (CRUD)
// ==========================================
app.get('/api/quest-categories', (req, res) => {
  try {
    const db = getDb();
    res.json({ success: true, categories: db.questCategories || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quest-categories', (req, res) => {
  try {
    const db = getDb();
    if (!db.questCategories) db.questCategories = [];

    const { name, color, icon, defaultLocation } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nome da categoria é obrigatório' });
    }

    const trimmedName = name.trim();
    if (db.questCategories.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
      return res.status(400).json({ error: 'Já existe uma categoria com este nome.' });
    }

    const newCategory = {
      id: uid('cat'),
      name: trimmedName,
      color: color || '#f59e0b',
      icon: icon || 'Tag',
      defaultLocation: defaultLocation
        ? normalizeLocation(defaultLocation)
        : defaultLocationForCategory(trimmedName)
    };

    db.questCategories.push(newCategory);
    saveDb(db);
    res.json({ success: true, category: newCategory, categories: db.questCategories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/quest-categories/:id', (req, res) => {
  try {
    const db = getDb();
    if (!db.questCategories) db.questCategories = [];

    const cat = db.questCategories.find(c => c.id === req.params.id);
    if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });

    const oldName = cat.name;
    const { name, color, icon, defaultLocation } = req.body;

    if (name !== undefined && name.trim()) {
      const trimmedName = name.trim();
      // Check duplicate if name changed
      if (trimmedName.toLowerCase() !== oldName.toLowerCase() && db.questCategories.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
        return res.status(400).json({ error: 'Já existe outra categoria com este nome.' });
      }
      cat.name = trimmedName;
      applyCategoryRename(db, oldName, trimmedName);
    }

    if (color !== undefined) cat.color = color;
    if (icon !== undefined) cat.icon = icon;
    if (defaultLocation !== undefined) {
      cat.defaultLocation = defaultLocation
        ? normalizeLocation(defaultLocation)
        : defaultLocationForCategory(cat.name);
    }

    saveDb(db);
    res.json({ success: true, category: cat, categories: db.questCategories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/quest-categories/:id', (req, res) => {
  try {
    const db = getDb();
    if (!db.questCategories) db.questCategories = [];

    const cat = db.questCategories.find(c => c.id === req.params.id);
    if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });

    const catName = cat.name;
    db.questCategories = db.questCategories.filter(c => c.id !== req.params.id);

    const fallbackCat = db.questCategories.length > 0 ? db.questCategories[0].name : 'Geral';
    applyCategoryRename(db, catName, fallbackCat);

    saveDb(db);
    res.json({ success: true, categories: db.questCategories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. QUESTS (STANDARD TASKS / TO-DOS)
// ==========================================
app.post('/api/quests', (req, res) => {
  try {
    const db = getDb();
    let { title, description, category, priority, difficulty, dueDate, dueTime, subtasks, location, timeWindow, timeWindowStart, timeWindowEnd, estimatedMinutes } = req.body;
    if (!title) return res.status(400).json({ error: 'Título é obrigatório' });

    const scale = resolveActivityScale({
      ...(priority !== undefined ? { priority } : {}),
      ...(difficulty !== undefined ? { difficulty } : {})
    });
    const newQuest = {
      id: uid('q'),
      title: title.trim(),
      description: (description || '').trim(),
      category: category || (db.questCategories?.[0]?.name || 'Geral'),
      priority: scale.priority,
      difficulty: scale.difficulty,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      subtasks: (subtasks || []).map(st => ({
        id: uid('st'),
        title: typeof st === 'string' ? st : st.title,
        completed: typeof st === 'object' ? !!st.completed : false
      })),
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString()
    };
    applyDifficultyFields(newQuest, scale.difficulty);
    applyActivityContext(newQuest, { location, timeWindow, timeWindowStart, timeWindowEnd, estimatedMinutes }, db.questCategories);

    db.quests.unshift(newQuest);
    saveDb(db);
    res.json({ success: true, quest: newQuest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/quests/:id', (req, res) => {
  try {
    const db = getDb();
    const index = db.quests.findIndex(q => q.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Missão não encontrada' });

    const existing = db.quests[index];
    const { title, description, category, priority, difficulty, dueDate, dueTime, subtasks, location, timeWindow, timeWindowStart, timeWindowEnd, estimatedMinutes } = req.body;

    if (title !== undefined) existing.title = title.trim();
    if (description !== undefined) existing.description = description.trim();
    if (category !== undefined) existing.category = category;
    if (priority !== undefined || difficulty !== undefined) {
      const scale = resolveActivityScale({
        ...(priority !== undefined ? { priority } : {}),
        ...(difficulty !== undefined ? { difficulty } : {})
      }, existing);
      existing.priority = scale.priority;
      applyDifficultyFields(existing, scale.difficulty);
    }
    if (dueDate !== undefined) existing.dueDate = dueDate || null;
    if (dueTime !== undefined) existing.dueTime = dueTime || null;
    if (location !== undefined || timeWindow !== undefined || timeWindowStart !== undefined || timeWindowEnd !== undefined || estimatedMinutes !== undefined) {
      applyActivityContext(existing, { location, timeWindow, timeWindowStart, timeWindowEnd, estimatedMinutes }, db.questCategories);
    }
    if (subtasks !== undefined) {
      existing.subtasks = Array.isArray(subtasks) ? subtasks.map(st => ({
        id: st.id || uid('st'),
        title: typeof st === 'string' ? st : st.title,
        completed: typeof st === 'object' ? !!st.completed : false
      })) : existing.subtasks;
    }

    saveDb(db);
    res.json({ success: true, quest: existing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quests/:id/complete', (req, res) => {
  try {
    const db = getDb();
    const quest = db.quests.find(q => q.id === req.params.id);
    if (!quest) return res.status(404).json({ error: 'Missão não encontrada' });

    const willComplete = !quest.completed;
    quest.completed = willComplete;
    quest.completedAt = willComplete ? new Date().toISOString() : null;

    let rewardResult = null;
    if (willComplete) {
      const durationMinutes = parseDurationMinutes(req.body?.durationMinutes);
      quest.durationMinutes = durationMinutes || null;
      // Award willpower and focus
      const willpower = willpowerForDifficulty(quest.difficulty);
      const focus = 10;
      rewardResult = rewardPlayer({
        xp: quest.xpReward,
        coins: quest.coinReward,
        willpower,
        focus,
        actionType: 'quest_complete',
        entityId: quest.id,
        title: quest.title,
        details: {
          category: quest.category,
          priority: quest.priority,
          difficulty: quest.difficulty,
          location: quest.location || null,
          durationMinutes
        }
      });
      db.liveActivityTimers = clearLiveActivityTimer(db.liveActivityTimers, 'quest', quest.id);
    } else {
      // Revert willpower, focus, xp and coins
      quest.durationMinutes = null;
      db.liveActivityTimers = clearLiveActivityTimer(db.liveActivityTimers, 'quest', quest.id);
      const willpower = willpowerForDifficulty(quest.difficulty);
      const focus = 10;
      rewardResult = revertPlayerReward({
        xp: quest.xpReward,
        coins: quest.coinReward,
        willpower,
        focus,
        actionType: 'quest_complete',
        entityId: quest.id
      });
    }

    const linkedVictories = syncDailyVictoriesFromActivity(db, {
      questId: quest.id,
      questCompleted: willComplete
    });

    saveDb(db);
    res.json({
      success: true,
      quest,
      willComplete,
      rewardResult,
      linkedVictories,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/quests/:id', (req, res) => {
  try {
    const db = getDb();
    db.quests = db.quests.filter(q => q.id !== req.params.id);
    saveDb(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. BOOKS & READING SESSIONS (TOMES OF WISDOM)
// ==========================================
app.post('/api/books', (req, res) => {
  try {
    const db = getDb();
    const { title, author, totalPages, currentPage, category, coverColor, notes } = req.body;
    if (!title || !totalPages) return res.status(400).json({ error: 'Título e total de páginas são obrigatórios' });

    const total = parseInt(totalPages, 10);
    const current = parseInt(currentPage || 0, 10);

    const newBook = {
      id: uid('b'),
      title: title.trim(),
      author: (author || 'Autor Desconhecido').trim(),
      totalPages: total,
      currentPage: Math.min(total, current),
      category: category || 'Geral',
      coverColor: coverColor || 'gradient-amber',
      status: current >= total ? 'completed' : 'reading',
      startedAt: new Date().toISOString(),
      completedAt: current >= total ? new Date().toISOString() : null,
      notes: notes || '',
      quotes: [],
      createdAt: new Date().toISOString()
    };

    db.books.unshift(newBook);
    saveDb(db);
    res.json({ success: true, book: newBook });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/books/:id', (req, res) => {
  try {
    const db = getDb();
    const book = db.books.find(b => b.id === req.params.id);
    if (!book) return res.status(404).json({ error: 'Livro não encontrado' });

    const { title, author, totalPages, currentPage, category, coverColor, status, notes } = req.body;
    if (title !== undefined) book.title = title.trim();
    if (author !== undefined) book.author = author.trim();
    if (totalPages !== undefined) book.totalPages = parseInt(totalPages, 10);
    if (currentPage !== undefined) book.currentPage = parseInt(currentPage, 10);
    if (category !== undefined) book.category = category;
    if (coverColor !== undefined) book.coverColor = coverColor;
    if (status !== undefined) book.status = status;
    if (notes !== undefined) book.notes = notes;

    if (book.currentPage >= book.totalPages && book.status !== 'completed') {
      book.status = 'completed';
      book.completedAt = new Date().toISOString();
    }

    saveDb(db);
    res.json({ success: true, book });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/books/:id/reading-session', (req, res) => {
  try {
    const db = getDb();
    const book = db.books.find(b => b.id === req.params.id);
    if (!book) return res.status(404).json({ error: 'Livro não encontrado' });

    const { startPage, endPage, durationMinutes, notes, quotes } = req.body;
    const sPage = parseInt(startPage, 10) || book.currentPage;
    const ePage = parseInt(endPage, 10);
    const duration = parseInt(durationMinutes, 10) || 20;

    if (ePage <= sPage) {
      return res.status(400).json({ error: 'A página final deve ser maior que a página inicial.' });
    }

    const pagesRead = Math.min(book.totalPages, ePage) - sPage;
    const newCurrentPage = Math.min(book.totalPages, ePage);
    const finishedBook = newCurrentPage >= book.totalPages;

    book.currentPage = newCurrentPage;
    if (finishedBook) {
      book.status = 'completed';
      book.completedAt = new Date().toISOString();
    }

    // Process structured quotes
    const parsedQuotes = Array.isArray(quotes) ? quotes.filter(q => q.quote && q.quote.trim()).map(q => ({
      id: q.id || uid('quo'),
      bookId: book.id,
      bookTitle: book.title,
      quote: q.quote.trim(),
      page: parseInt(q.page, 10) || newCurrentPage,
      note: (q.note || '').trim(),
      createdAt: q.createdAt || new Date().toISOString()
    })) : [];

    // Ensure book.quotes exists and append new quotes
    if (!book.quotes) book.quotes = [];
    if (parsedQuotes.length > 0) {
      book.quotes.unshift(...parsedQuotes);
    }

    // XP & Wisdom calculation: 2 XP per page + bonus for finishing + bonus for quotes collected
    const basePageXp = pagesRead * 2;
    const finishBonusXp = finishedBook ? 200 : 0;
    const quoteBonusXp = parsedQuotes.length * 15;
    const totalXp = basePageXp + finishBonusXp + quoteBonusXp;
    const coins = Math.max(5, Math.floor(pagesRead / 3)) + (finishedBook ? 50 : 0) + parsedQuotes.length * 2;
    const wisdom = pagesRead + (finishedBook ? 50 : 0) + parsedQuotes.length * 5;

    const session = {
      id: uid('rs'),
      bookId: book.id,
      bookTitle: book.title,
      startPage: sPage,
      endPage: newCurrentPage,
      pagesRead,
      durationMinutes: duration,
      notes: notes || '',
      quotes: parsedQuotes,
      xpEarned: totalXp,
      coinsEarned: coins,
      wisdomEarned: wisdom,
      timestamp: new Date().toISOString()
    };

    db.readingSessions.unshift(session);

    const rewardResult = rewardPlayer({
      xp: totalXp,
      coins,
      wisdom,
      actionType: 'reading_session',
      entityId: book.id,
      title: `${book.title} (+${pagesRead} págs${parsedQuotes.length > 0 ? `, ${parsedQuotes.length} citação(ões)` : ''})`,
      details: { category: 'Estudos', pagesRead, durationMinutes: duration, finishedBook, quotesCount: parsedQuotes.length }
    });

    const linkedVictories = syncDailyVictoriesFromActivity(db, { syncReading: true });

    saveDb(db);
    res.json({
      success: true,
      book,
      session,
      rewardResult,
      linkedVictories,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit reading session with delta score adjustment and book recalculation
app.put('/api/reading-sessions/:id', (req, res) => {
  try {
    const db = getDb();
    const session = db.readingSessions.find(s => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Sessão de leitura não encontrada' });

    const book = db.books.find(b => b.id === session.bookId);
    if (!book) return res.status(404).json({ error: 'Livro associado não encontrado' });

    const { startPage, endPage, durationMinutes, notes, quotes } = req.body;
    const sPage = parseInt(startPage, 10);
    const ePage = parseInt(endPage, 10);
    const duration = parseInt(durationMinutes, 10) || session.durationMinutes || 20;

    if (isNaN(sPage) || isNaN(ePage) || ePage <= sPage) {
      return res.status(400).json({ error: 'A página final deve ser maior que a página inicial.' });
    }

    const oldPagesRead = session.pagesRead || 0;
    const oldXp = session.xpEarned || 0;
    const oldWisdom = session.wisdomEarned || 0;
    const oldCoins = session.coinsEarned || (Math.max(5, Math.floor(oldPagesRead / 3)));

    const newPagesRead = Math.min(book.totalPages, ePage) - sPage;
    const newEndPage = Math.min(book.totalPages, ePage);
    const isFinishedNow = newEndPage >= book.totalPages;

    // Process new quotes
    const parsedQuotes = Array.isArray(quotes) ? quotes.filter(q => q.quote && q.quote.trim()).map(q => ({
      id: q.id || uid('quo'),
      bookId: book.id,
      bookTitle: book.title,
      quote: q.quote.trim(),
      page: parseInt(q.page, 10) || newEndPage,
      note: (q.note || '').trim(),
      createdAt: q.createdAt || session.timestamp || new Date().toISOString()
    })) : (session.quotes || []);

    // Update book.quotes with parsedQuotes
    if (!book.quotes) book.quotes = [];
    const oldQuoteIds = (session.quotes || []).map(q => q.id);
    book.quotes = book.quotes.filter(q => !oldQuoteIds.includes(q.id));
    if (parsedQuotes.length > 0) {
      book.quotes.unshift(...parsedQuotes);
    }

    // New rewards calculation
    const basePageXp = newPagesRead * 2;
    const finishBonusXp = isFinishedNow ? 200 : 0;
    const quoteBonusXp = parsedQuotes.length * 15;
    const newTotalXp = basePageXp + finishBonusXp + quoteBonusXp;
    const newCoins = Math.max(5, Math.floor(newPagesRead / 3)) + (isFinishedNow ? 50 : 0) + parsedQuotes.length * 2;
    const newWisdom = newPagesRead + (isFinishedNow ? 50 : 0) + parsedQuotes.length * 5;

    const deltaXp = newTotalXp - oldXp;
    const deltaWisdom = newWisdom - oldWisdom;
    const deltaCoins = newCoins - oldCoins;

    // Apply delta to user profile
    const profile = db.userProfile;
    profile.stats.wisdom = Math.max(0, (profile.stats.wisdom || 0) + deltaWisdom);
    profile.coins = (profile.coins ?? 0) + deltaCoins;
    profile.xp += deltaXp;

    // Handle level up / level down
    while (profile.xp >= profile.xpToNextLevel) {
      profile.xp -= profile.xpToNextLevel;
      profile.level += 1;
      profile.xpToNextLevel = getXpForLevel(profile.level);
      profile.title = getTitleForLevel(profile.level);
      profile.coins += profile.level * 15;
    }
    while (profile.xp < 0 && profile.level > 1) {
      profile.level -= 1;
      profile.xpToNextLevel = getXpForLevel(profile.level);
      profile.xp += profile.xpToNextLevel;
      profile.title = getTitleForLevel(profile.level);
      profile.coins = (profile.coins ?? 0) - profile.level * 15;
    }
    if (profile.xp < 0) profile.xp = 0;

    // Adjust Boss HP
    const boss = db.bossRaid;
    if (boss) {
      const deltaDmg = Math.round(deltaXp * 0.8 + deltaCoins * 1.2);
      if (deltaDmg > 0 && !boss.defeated) {
        boss.currentHp = Math.max(0, boss.currentHp - deltaDmg);
        if (boss.currentHp === 0) {
          boss.defeated = true;
          boss.defeatsCount = (boss.defeatsCount || 0) + 1;
          profile.coins += boss.rewardCoins;
          profile.xp += boss.rewardXp;
        }
      } else if (deltaDmg < 0) {
        boss.currentHp = Math.min(boss.maxHp, boss.currentHp - deltaDmg);
        if (boss.defeated && boss.currentHp > 0) {
          boss.defeated = false;
          boss.defeatsCount = Math.max(0, (boss.defeatsCount || 1) - 1);
        }
      }
    }

    // Update session object
    session.startPage = sPage;
    session.endPage = newEndPage;
    session.pagesRead = newPagesRead;
    session.durationMinutes = duration;
    session.notes = notes !== undefined ? notes : session.notes;
    session.quotes = parsedQuotes;
    session.xpEarned = newTotalXp;
    session.wisdomEarned = newWisdom;
    session.coinsEarned = newCoins;

    // Recalculate book's currentPage & status based on all its sessions
    const bookSessions = db.readingSessions.filter(s => s.bookId === book.id);
    const maxEnd = bookSessions.reduce((max, s) => Math.max(max, s.endPage || 0), 0);
    book.currentPage = maxEnd;
    if (book.currentPage >= book.totalPages) {
      book.status = 'completed';
      if (!book.completedAt) book.completedAt = new Date().toISOString();
    } else {
      book.status = 'reading';
      book.completedAt = null;
    }

    // Update matching actionLog if found
    const logIndex = db.actionLogs.findIndex(l => (l.entityId === book.id || l.entityId === session.id) && l.type === 'reading_session');
    if (logIndex !== -1) {
      db.actionLogs[logIndex].title = `${book.title} (+${newPagesRead} págs${parsedQuotes.length > 0 ? `, ${parsedQuotes.length} citação(ões)` : ''})`;
      db.actionLogs[logIndex].xp = newTotalXp;
      db.actionLogs[logIndex].coins = newCoins;
      db.actionLogs[logIndex].details = { pagesRead: newPagesRead, durationMinutes: duration, finishedBook: isFinishedNow, quotesCount: parsedQuotes.length };
    }

    const linkedVictories = syncDailyVictoriesFromActivity(db, { syncReading: true });

    saveDb(db);
    res.json({
      success: true,
      book,
      session,
      userProfile: profile,
      linkedVictories,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete reading session with complete score rollback and book recalculation
app.delete('/api/reading-sessions/:id', (req, res) => {
  try {
    const db = getDb();
    const sessionIndex = db.readingSessions.findIndex(s => s.id === req.params.id);
    if (sessionIndex === -1) return res.status(404).json({ error: 'Sessão de leitura não encontrada' });

    const session = db.readingSessions[sessionIndex];
    const book = db.books.find(b => b.id === session.bookId);

    const xpToRevert = session.xpEarned || ((session.pagesRead || 0) * 2);
    const wisdomToRevert = session.wisdomEarned || (session.pagesRead || 0);
    const coinsToRevert = session.coinsEarned || (Math.max(5, Math.floor((session.pagesRead || 0) / 3)));

    // Revert player rewards
    const profile = db.userProfile;
    profile.stats.wisdom = Math.max(0, (profile.stats.wisdom || 0) - wisdomToRevert);
    profile.coins = (profile.coins ?? 0) - coinsToRevert;
    profile.xp -= xpToRevert;

    while (profile.xp < 0 && profile.level > 1) {
      profile.level -= 1;
      profile.xpToNextLevel = getXpForLevel(profile.level);
      profile.xp += profile.xpToNextLevel;
      profile.title = getTitleForLevel(profile.level);
      profile.coins = (profile.coins ?? 0) - profile.level * 15;
    }
    if (profile.xp < 0) profile.xp = 0;

    // Restore Boss HP
    const boss = db.bossRaid;
    if (boss) {
      const totalDmg = Math.round(xpToRevert * 0.8 + coinsToRevert * 1.2);
      boss.currentHp = Math.min(boss.maxHp, boss.currentHp + totalDmg);
      if (boss.defeated && boss.currentHp > 0) {
        boss.defeated = false;
        boss.defeatsCount = Math.max(0, (boss.defeatsCount || 1) - 1);
      }
    }

    // Remove matching action log
    const logIndex = db.actionLogs.findIndex(l => (l.entityId === session.id || (book && l.entityId === book.id)) && l.type === 'reading_session');
    if (logIndex !== -1) {
      db.actionLogs.splice(logIndex, 1);
    }

    // Clean up quotes from book.quotes that belonged to this session
    if (book && book.quotes && Array.isArray(session.quotes)) {
      const sessionQuoteIds = session.quotes.map(q => q.id);
      book.quotes = book.quotes.filter(q => !sessionQuoteIds.includes(q.id));
    }

    // Remove session from list
    db.readingSessions.splice(sessionIndex, 1);

    // Recalculate book's progress
    if (book) {
      const remainingSessions = db.readingSessions.filter(s => s.bookId === book.id);
      const maxEnd = remainingSessions.reduce((max, s) => Math.max(max, s.endPage || 0), 0);
      book.currentPage = maxEnd;
      if (book.currentPage < book.totalPages) {
        book.status = 'reading';
        book.completedAt = null;
      }
    }

    const linkedVictories = syncDailyVictoriesFromActivity(db, { syncReading: true });

    saveDb(db);
    res.json({
      success: true,
      book,
      deletedSessionId: session.id,
      userProfile: profile,
      linkedVictories,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a quote directly to a book
app.post('/api/books/:id/quotes', (req, res) => {
  try {
    const db = getDb();
    const book = db.books.find(b => b.id === req.params.id);
    if (!book) return res.status(404).json({ error: 'Livro não encontrado' });

    const { quote, page, note } = req.body;
    if (!quote || !quote.trim()) {
      return res.status(400).json({ error: 'O texto da citação é obrigatório.' });
    }

    if (!book.quotes) book.quotes = [];

    const newQuote = {
      id: uid('quo'),
      bookId: book.id,
      bookTitle: book.title,
      quote: quote.trim(),
      page: parseInt(page, 10) || book.currentPage || 1,
      note: (note || '').trim(),
      createdAt: new Date().toISOString()
    };

    book.quotes.unshift(newQuote);

    // Reward for registering a standalone quote
    const rewardResult = rewardPlayer({
      xp: 20,
      coins: 5,
      wisdom: 10,
      actionType: 'book_quote',
      entityId: newQuote.id,
      title: `Citação: ${book.title} (pág. ${newQuote.page})`,
      details: { category: 'Estudos', quote: newQuote.quote.substring(0, 50) }
    });

    saveDb(db);
    res.json({ success: true, quote: newQuote, book, rewardResult, analytics: computeAnalytics() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a quote in a book
app.put('/api/books/:id/quotes/:quoteId', (req, res) => {
  try {
    const db = getDb();
    const book = db.books.find(b => b.id === req.params.id);
    if (!book) return res.status(404).json({ error: 'Livro não encontrado' });

    if (!book.quotes) book.quotes = [];
    const quoteIndex = book.quotes.findIndex(q => q.id === req.params.quoteId);
    if (quoteIndex === -1) return res.status(404).json({ error: 'Citação não encontrada' });

    const { quote, page, note } = req.body;
    if (quote !== undefined) book.quotes[quoteIndex].quote = quote.trim();
    if (page !== undefined) book.quotes[quoteIndex].page = parseInt(page, 10) || 1;
    if (note !== undefined) book.quotes[quoteIndex].note = note.trim();

    // Also update in any reading sessions containing this quote
    (db.readingSessions || []).forEach(s => {
      if (Array.isArray(s.quotes)) {
        s.quotes.forEach(sq => {
          if (sq.id === req.params.quoteId) {
            if (quote !== undefined) sq.quote = quote.trim();
            if (page !== undefined) sq.page = parseInt(page, 10) || 1;
            if (note !== undefined) sq.note = note.trim();
          }
        });
      }
    });

    saveDb(db);
    res.json({ success: true, quote: book.quotes[quoteIndex], book });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a quote from a book
app.delete('/api/books/:id/quotes/:quoteId', (req, res) => {
  try {
    const db = getDb();
    const book = db.books.find(b => b.id === req.params.id);
    if (!book) return res.status(404).json({ error: 'Livro não encontrado' });

    if (book.quotes) {
      book.quotes = book.quotes.filter(q => q.id !== req.params.quoteId);
    }

    // Also remove from any readingSessions quotes array
    db.readingSessions.forEach(rs => {
      if (rs.quotes) {
        rs.quotes = rs.quotes.filter(q => q.id !== req.params.quoteId);
      }
    });

    saveDb(db);
    res.json({ success: true, book });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/books/:id', (req, res) => {
  try {
    const db = getDb();
    db.books = db.books.filter(b => b.id !== req.params.id);
    db.readingSessions = db.readingSessions.filter(rs => rs.bookId !== req.params.id);
    saveDb(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4.5. EXAM QUESTIONS (QUESTÕES DE CONCURSO PÚBLICO)
// ==========================================
app.post('/api/questions', (req, res) => {
  try {
    const db = getDb();
    if (!db.examQuestions) db.examQuestions = [];

    const { subject, topic, institution, totalQuestions, correctAnswers, durationMinutes, notes, notebookUrl, date, category, subjectId, topicId, kind, cycleNumber, blockKey, platform } = req.body;
    const total = parseInt(totalQuestions, 10);
    const correct = parseInt(correctAnswers, 10);
    const duration = parseInt(durationMinutes, 10) || 0;

    if (isNaN(total) || total <= 0) {
      return res.status(400).json({ error: 'A quantidade de questões feitas deve ser maior que zero.' });
    }
    if (isNaN(correct) || correct < 0 || correct > total) {
      return res.status(400).json({ error: 'A quantidade de acertos deve ser entre 0 e o total de questões feitas.' });
    }

    const wrong = total - correct;
    const accuracyRate = Math.round((correct / total) * 1000) / 10;

    const baseXp = total * 3;
    const correctXp = correct * 4;
    const accuracyBonusXp = accuracyRate === 100 ? 50 : accuracyRate >= 90 ? 30 : accuracyRate >= 80 ? 15 : 0;
    const totalXp = baseXp + correctXp + accuracyBonusXp;

    const coins = Math.max(2, Math.floor(correct / 2)) + (accuracyRate >= 80 ? 5 : 0) + (accuracyRate === 100 ? 10 : 0);

    const now = new Date();
    const entryDate = date || getSaoPauloDateStr(now);
    const chosenCategory = (category && category.trim()) ? category.trim() : 'Estudos';

    const newQuestionLog = {
      id: uid('eq'),
      category: chosenCategory,
      subject: (subject || 'Geral').trim(),
      topic: (topic || '').trim(),
      subjectId: (subjectId || '').trim() || undefined,
      topicId: (topicId || '').trim() || undefined,
      kind: (kind || '').trim() || undefined,
      cycleNumber: cycleNumber || undefined,
      blockKey: (blockKey || '').trim() || undefined,
      platform: (platform || '').trim() || undefined,
      institution: (institution || '').trim(),
      totalQuestions: total,
      correctAnswers: correct,
      wrongAnswers: wrong,
      accuracyRate,
      durationMinutes: duration,
      notes: (notes || '').trim(),
      notebookUrl: (notebookUrl || '').trim(),
      xpEarned: totalXp,
      coinsEarned: coins,
      date: entryDate,
      timestamp: now.toISOString()
    };

    db.examQuestions.unshift(newQuestionLog);
    if (db.aguPlan) {
      db.aguPlan = applyExamToPlan(
        sanitizeAguPlan(db.aguPlan, entryDate),
        newQuestionLog,
        entryDate,
        db.examQuestions
      );
    }

    const rewardResult = rewardPlayer({
      xp: totalXp,
      coins,
      focus: total * 2,
      wisdom: correct * 2,
      consistency: 10,
      actionType: 'exam_questions',
      entityId: newQuestionLog.id,
      title: `${newQuestionLog.subject}: ${correct}/${total} acertos (${accuracyRate}%)`,
      details: {
        category: chosenCategory,
        totalQuestions: total,
        correctAnswers: correct,
        accuracyRate,
        subject: newQuestionLog.subject,
        topic: newQuestionLog.topic,
        institution: newQuestionLog.institution
      }
    });

    const linkedVictories = syncDailyVictoriesFromActivity(db, { syncStudy: true });

    saveDb(db);
    res.json({
      success: true,
      examQuestion: newQuestionLog,
      rewardResult,
      linkedVictories,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/questions/:id', (req, res) => {
  try {
    const db = getDb();
    if (!db.examQuestions) db.examQuestions = [];

    const index = db.examQuestions.findIndex(q => q.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Registro de questões não encontrado' });

    const existing = db.examQuestions[index];
    const { subject, topic, institution, notes, notebookUrl, date, category, durationMinutes } = req.body;

    if (category !== undefined && category.trim()) existing.category = category.trim();
    if (subject !== undefined) existing.subject = subject.trim();
    if (topic !== undefined) existing.topic = topic.trim();
    if (institution !== undefined) existing.institution = institution.trim();
    if (notes !== undefined) existing.notes = notes.trim();
    if (notebookUrl !== undefined) existing.notebookUrl = notebookUrl.trim();
    if (date !== undefined) existing.date = date;
    if (durationMinutes !== undefined) existing.durationMinutes = parseDurationMinutes(durationMinutes);

    if (db.actionLogs) {
      const log = db.actionLogs.find(l => l.entityId === existing.id);
      if (log && log.details) {
        if (category !== undefined && category.trim()) log.details.category = category.trim();
        if (subject !== undefined) log.details.subject = subject.trim();
      }
    }

    const linkedVictories = syncDailyVictoriesFromActivity(db, { syncStudy: true });

    saveDb(db);
    res.json({ success: true, examQuestion: existing, linkedVictories, analytics: computeAnalytics() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/questions/:id', (req, res) => {
  try {
    const db = getDb();
    if (!db.examQuestions) db.examQuestions = [];

    const questionLog = db.examQuestions.find(q => q.id === req.params.id);
    if (!questionLog) return res.status(404).json({ error: 'Registro não encontrado' });

    db.examQuestions = db.examQuestions.filter(q => q.id !== req.params.id);

    const rewardResult = revertPlayerReward({
      xp: questionLog.xpEarned || 0,
      coins: questionLog.coinsEarned || 0,
      focus: questionLog.totalQuestions * 2,
      wisdom: questionLog.correctAnswers * 2,
      consistency: 10,
      actionType: 'exam_questions',
      entityId: questionLog.id
    });

    const linkedVictories = syncDailyVictoriesFromActivity(db, { syncStudy: true });

    saveDb(db);
    res.json({ success: true, rewardResult, linkedVictories, analytics: computeAnalytics() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. PROCESSES / BATCH OPERATIONS
// ==========================================
app.post('/api/processes', (req, res) => {
  try {
    const db = getDb();
    const { title, category, unitName, totalUnits, xpPerUnit, coinsPerUnit, notes } = req.body;
    if (!title || !totalUnits) return res.status(400).json({ error: 'Título e total de unidades são obrigatórios' });

    const total = parseInt(totalUnits, 10);
    const defaultCat = db.questCategories?.[0]?.name || 'Geral';
    const newProcess = {
      id: uid('p'),
      title: title.trim(),
      category: category || defaultCat,
      unitName: unitName || 'unidades',
      totalUnits: total,
      completedUnits: 0,
      xpPerUnit: parseInt(xpPerUnit, 10) || 20,
      coinsPerUnit: parseInt(coinsPerUnit, 10) || 5,
      notes: notes || '',
      status: 'in_progress',
      completedAt: null,
      createdAt: new Date().toISOString()
    };

    db.processes.unshift(newProcess);
    saveDb(db);
    res.json({ success: true, process: newProcess });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/processes/:id/step', (req, res) => {
  try {
    const db = getDb();
    const process = db.processes.find(p => p.id === req.params.id);
    if (!process) return res.status(404).json({ error: 'Processo não encontrado' });

    const { unitsAdded, stepNote, timestamp } = req.body;
    const added = parseInt(unitsAdded, 10) || 1;
    const previousUnits = process.completedUnits || 0;
    const newCompleted = Math.min(process.totalUnits, previousUnits + added);
    const actualUnitsAdded = newCompleted - previousUnits;

    if (actualUnitsAdded <= 0) {
      return res.status(400).json({ error: 'Processo já está totalmente concluído!' });
    }

    const stepTimestamp = timestamp || new Date().toISOString();

    process.completedUnits = newCompleted;
    const finished = newCompleted >= process.totalUnits;
    if (finished) {
      process.status = 'completed';
      process.completedAt = stepTimestamp;
    }

    const xp = actualUnitsAdded * process.xpPerUnit + (finished ? 100 : 0);
    const coins = actualUnitsAdded * process.coinsPerUnit + (finished ? 30 : 0);
    const focus = actualUnitsAdded * 10;

    const step = {
      id: uid('ps'),
      processId: process.id,
      processTitle: process.title,
      unitsAdded: actualUnitsAdded,
      totalCompletedNow: newCompleted,
      stepNote: stepNote || '',
      timestamp: stepTimestamp,
      createdAt: stepTimestamp,
      xpEarned: xp
    };

    db.processSteps.unshift(step);

    const defaultCat = db.questCategories?.[0]?.name || 'Geral';
    const rewardResult = rewardPlayer({
      xp,
      coins,
      focus,
      actionType: 'process_step',
      entityId: process.id,
      title: `${process.title} (+${actualUnitsAdded} ${process.unitName})`,
      details: { category: process.category || defaultCat, unitsAdded: actualUnitsAdded, finished },
      timestamp: stepTimestamp
    });

    saveDb(db);
    res.json({
      success: true,
      process,
      step,
      rewardResult,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/processes/:id', (req, res) => {
  try {
    const db = getDb();
    const process = db.processes.find(p => p.id === req.params.id);
    if (!process) return res.status(404).json({ error: 'Processo não encontrado' });

    const { title, category, unitName, totalUnits, completedUnits, xpPerUnit, coinsPerUnit, notes, status } = req.body;
    if (title !== undefined) process.title = title.trim();
    if (category !== undefined) process.category = category;
    if (unitName !== undefined) process.unitName = unitName;
    if (totalUnits !== undefined) process.totalUnits = parseInt(totalUnits, 10);
    if (completedUnits !== undefined) process.completedUnits = parseInt(completedUnits, 10);
    if (xpPerUnit !== undefined) process.xpPerUnit = parseInt(xpPerUnit, 10);
    if (coinsPerUnit !== undefined) process.coinsPerUnit = parseInt(coinsPerUnit, 10);
    if (notes !== undefined) process.notes = notes;
    if (status !== undefined) process.status = status;

    saveDb(db);
    res.json({ success: true, process });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/processes/:id', (req, res) => {
  try {
    const db = getDb();
    db.processes = db.processes.filter(p => p.id !== req.params.id);
    db.processSteps = db.processSteps.filter(ps => ps.processId !== req.params.id);
    saveDb(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. HABITS / DAILY RITUALS
// ==========================================
app.post('/api/habits', (req, res) => {
  try {
    const db = getDb();
    const { title, description, category, icon, frequency, targetTimesPerWeek, timesPerWeek, monthDays, monthDay, weekDays, xpReward, coinReward, location, timeWindow, timeWindowStart, timeWindowEnd, estimatedMinutes, priority, difficulty } = req.body;
    if (!title) return res.status(400).json({ error: 'Título do hábito é obrigatório' });

    const scale = resolveActivityScale({
      ...(priority !== undefined ? { priority } : {}),
      ...(difficulty !== undefined ? { difficulty } : {})
    });
    const newHabit = {
      id: uid('h'),
      title: title.trim(),
      description: (description || '').trim(),
      category: (category && category.trim()) ? category.trim() : 'Pessoal',
      icon: icon || 'Flame',
      currentStreak: 0,
      bestStreak: 0,
      history: [],
      priority: scale.priority,
      difficulty: scale.difficulty,
      createdAt: new Date().toISOString()
    };
    applyHabitFrequency(newHabit, { frequency, targetTimesPerWeek, timesPerWeek, monthDays, monthDay, weekDays });
    applyDifficultyFields(newHabit, scale.difficulty);
    if (difficulty === undefined) {
      if (xpReward !== undefined) newHabit.xpReward = parseInt(xpReward, 10) || 30;
      if (coinReward !== undefined) newHabit.coinReward = parseInt(coinReward, 10) || 8;
    }
    applyActivityContext(newHabit, { location, timeWindow, timeWindowStart, timeWindowEnd, estimatedMinutes }, db.questCategories);

    db.habits.unshift(newHabit);
    saveDb(db);
    res.json({ success: true, habit: newHabit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/habits/:id', (req, res) => {
  try {
    const db = getDb();
    const habit = db.habits.find(h => h.id === req.params.id);
    if (!habit) return res.status(404).json({ error: 'Hábito não encontrado' });

    const { title, description, category, icon, frequency, targetTimesPerWeek, timesPerWeek, monthDays, monthDay, weekDays, xpReward, coinReward, location, timeWindow, timeWindowStart, timeWindowEnd, estimatedMinutes, priority, difficulty } = req.body;
    if (title !== undefined && title.trim()) habit.title = title.trim();
    if (description !== undefined) habit.description = description.trim();
    if (category !== undefined && category.trim()) habit.category = category.trim();
    if (icon !== undefined) habit.icon = icon;
    applyHabitFrequency(habit, { frequency, targetTimesPerWeek, timesPerWeek, monthDays, monthDay, weekDays }, { isUpdate: true });

    if (priority !== undefined || difficulty !== undefined) {
      const scale = resolveActivityScale({
        ...(priority !== undefined ? { priority } : {}),
        ...(difficulty !== undefined ? { difficulty } : {})
      }, habit);
      habit.priority = scale.priority;
      applyDifficultyFields(habit, scale.difficulty);
    } else {
      if (xpReward !== undefined) habit.xpReward = parseInt(xpReward, 10) || 30;
      if (coinReward !== undefined) habit.coinReward = parseInt(coinReward, 10) || 8;
    }
    if (location !== undefined || timeWindow !== undefined || timeWindowStart !== undefined || timeWindowEnd !== undefined || estimatedMinutes !== undefined) {
      applyActivityContext(habit, { location, timeWindow, timeWindowStart, timeWindowEnd, estimatedMinutes }, db.questCategories);
    }

    saveDb(db);
    res.json({ success: true, habit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/habits/:id/toggle', (req, res) => {
  try {
    const db = getDb();
    const habit = db.habits.find(h => h.id === req.params.id);
    if (!habit) return res.status(404).json({ error: 'Hábito não encontrado' });

    const todayStr = getSaoPauloDateStr();
    let targetDate = req.body?.date;
    if (!targetDate || typeof targetDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      targetDate = todayStr;
    }

    if (targetDate > todayStr) {
      return res.status(400).json({ error: 'Não é permitido marcar hábitos em datas futuras.' });
    }

    if (!habit.history) habit.history = [];
    const isAlreadyDone = habit.history.includes(targetDate);

    let rewardResult = null;

    if (isAlreadyDone) {
      habit.history = habit.history.filter(d => d !== targetDate);
      clearHabitDurationForDate(habit, targetDate);
      const streakData = calculateHabitStreak(habit.history, new Date(), habit.bestStreak || 0);
      habit.currentStreak = streakData.currentStreak;
      habit.bestStreak = streakData.bestStreak;

      rewardResult = revertPlayerReward({
        xp: habit.xpReward || 30,
        coins: habit.coinReward || 8,
        consistency: 15,
        actionType: 'habit_complete',
        entityId: habit.id
      });
      if (targetDate === todayStr) {
        db.liveActivityTimers = clearLiveActivityTimer(db.liveActivityTimers, 'habit', habit.id);
      }
    } else {
      habit.history.push(targetDate);
      const durationMinutes = parseDurationMinutes(req.body?.durationMinutes);
      setHabitDurationForDate(habit, targetDate, durationMinutes);
      const streakData = calculateHabitStreak(habit.history, new Date(), habit.bestStreak || 0);
      habit.currentStreak = streakData.currentStreak;
      habit.bestStreak = streakData.bestStreak;

      const multiplier = Math.min(2.0, 1 + habit.currentStreak * 0.1);
      const xp = Math.round((habit.xpReward || 30) * multiplier);
      const coins = habit.coinReward || 8;

      const isToday = targetDate === todayStr;
      const dateParts = targetDate.split('-');
      const formattedDate = isToday ? 'Hoje' : `${dateParts[2]}/${dateParts[1]}`;

      rewardResult = rewardPlayer({
        xp,
        coins,
        consistency: 15,
        actionType: 'habit_complete',
        entityId: habit.id,
        title: `${habit.title} (${formattedDate} - Sequência 🔥 ${habit.currentStreak})`,
        details: {
          category: habit.category || 'Pessoal',
          streak: habit.currentStreak,
          date: targetDate,
          location: habit.location || null,
          durationMinutes
        }
      });
      if (isToday) {
        db.liveActivityTimers = clearLiveActivityTimer(db.liveActivityTimers, 'habit', habit.id);
      }
    }

    saveDb(db);
    res.json({
      success: true,
      habit,
      targetDate,
      done: !isAlreadyDone,
      doneToday: habit.history.includes(todayStr),
      rewardResult,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/habits/:id', (req, res) => {
  try {
    const db = getDb();
    db.habits = db.habits.filter(h => h.id !== req.params.id);
    saveDb(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. REWARDS & TAVERN
// ==========================================
app.post('/api/rewards', (req, res) => {
  try {
    const db = getDb();
    const { title, description, cost, icon, category } = req.body;
    if (!title || !cost) return res.status(400).json({ error: 'Título e custo em moedas são obrigatórios' });

    const newReward = {
      id: uid('r'),
      title: title.trim(),
      description: description || '',
      cost: parseInt(cost, 10),
      icon: icon || 'Gift',
      category: category || 'custom',
      timesRedeemed: 0,
      isVirtual: false,
      unlocked: true,
      createdAt: new Date().toISOString()
    };

    db.rewards.unshift(newReward);
    saveDb(db);
    res.json({ success: true, reward: newReward });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rewards/spend-money', (req, res) => {
  try {
    const db = getDb();
    const { amountBrl, amount, item, title, notes } = req.body || {};
    const result = spendMoney(db, {
      amountBrl: amountBrl ?? amount,
      item: item || title,
      notes
    });

    if (result.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    saveDb(db);
    res.json({
      success: true,
      redemption: result.redemption,
      userProfile: result.userProfile
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rewards/:id/redeem', (req, res) => {
  try {
    const db = getDb();
    const reward = db.rewards.find(r => r.id === req.params.id);
    if (!reward) return res.status(404).json({ error: 'Recompensa não encontrada' });

    db.userProfile.coins = (db.userProfile.coins ?? 0) - reward.cost;
    reward.timesRedeemed = (reward.timesRedeemed || 0) + 1;

    const redemption = {
      id: uid('red'),
      rewardId: reward.id,
      rewardTitle: reward.title,
      cost: reward.cost,
      timestamp: new Date().toISOString()
    };
    db.rewardRedemptions.unshift(redemption);

    db.actionLogs.unshift({
      id: uid('log'),
      type: 'reward_redeem',
      entityId: reward.id,
      title: `Resgatou: ${reward.title}`,
      xp: 0,
      coins: -reward.cost,
      details: { cost: reward.cost },
      timestamp: new Date().toISOString(),
      hour: getSaoPauloHour(),
      dayOfWeek: getSaoPauloDayOfWeek(),
      date: getSaoPauloDateStr()
    });

    saveDb(db);
    res.json({
      success: true,
      reward,
      userProfile: db.userProfile,
      redemption
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/rewards/:id', (req, res) => {
  try {
    const db = getDb();
    db.rewards = db.rewards.filter(r => r.id !== req.params.id);
    saveDb(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel reward redemption and refund coins
app.post('/api/rewards/redemptions/:id/cancel', (req, res) => {
  try {
    const db = getDb();
    if (!db.rewardRedemptions) db.rewardRedemptions = [];

    const redIndex = db.rewardRedemptions.findIndex(r => r.id === req.params.id);
    if (redIndex === -1) return res.status(404).json({ error: 'Resgate não encontrado' });

    const redemption = db.rewardRedemptions[redIndex];
    const refundCoins = refundCoinsFromRedemption(redemption);

    db.userProfile.coins += refundCoins;

    const reward = redemption.rewardId
      ? db.rewards.find(r => r.id === redemption.rewardId)
      : null;
    if (reward && reward.timesRedeemed > 0) {
      reward.timesRedeemed -= 1;
    }

    const isMoneySpend = redemption.kind === 'money';
    const logIndex = db.actionLogs.findIndex(l => {
      if (l.coins !== -refundCoins) return false;
      if (isMoneySpend) {
        return l.type === 'money_spend' && l.entityId === redemption.id;
      }
      return l.type === 'reward_redeem' && l.entityId === redemption.rewardId;
    });
    if (logIndex !== -1) {
      db.actionLogs.splice(logIndex, 1);
    } else {
      db.actionLogs.unshift({
        id: uid('log'),
        type: isMoneySpend ? 'money_spend_cancel' : 'reward_cancel',
        entityId: redemption.rewardId || redemption.id,
        title: isMoneySpend
          ? `Cancelou gasto de ${formatBrl(redemption.amountBrl)}: ${redemption.rewardTitle}`
          : `Cancelou resgate: ${redemption.rewardTitle}`,
        xp: 0,
        coins: refundCoins,
        details: { refund: refundCoins, amountBrl: redemption.amountBrl },
        timestamp: new Date().toISOString(),
        hour: getSaoPauloHour(),
        dayOfWeek: getSaoPauloDayOfWeek(),
        date: getSaoPauloDateStr()
      });
    }

    db.rewardRedemptions.splice(redIndex, 1);

    saveDb(db);
    res.json({
      success: true,
      refundedCoins: refundCoins,
      redemptionId: redemption.id,
      userProfile: db.userProfile,
      reward
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/rewards/redemptions/:id', (req, res) => {
  const cancelHandler = app._router.stack.find(layer => layer.route && layer.route.path === '/api/rewards/redemptions/:id/cancel');
  if (cancelHandler) {
    return cancelHandler.handle(req, res);
  }
  res.status(404).json({ error: 'Endpoint não encontrado' });
});

// ==========================================
// 8. BOSS RAID RESET
// ==========================================
app.post('/api/boss/reset', (req, res) => {
  try {
    const db = getDb();
    const currentBoss = db.bossRaid;
    let targetLevel;

    if (req.body && req.body.level !== undefined) {
      targetLevel = Math.max(1, parseInt(req.body.level, 10) || 1);
    } else if (currentBoss && currentBoss.defeated) {
      targetLevel = (currentBoss.level || 1) + 1;
    } else {
      targetLevel = currentBoss?.level || 1;
    }

    const forceName = req.body?.name || null;
    db.bossRaid = createBossRaid({
      level: targetLevel,
      currentBoss,
      forceName
    });

    saveDb(db);
    res.json({ success: true, bossRaid: db.bossRaid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 9. BACKUP EXPORT & IMPORT
// ==========================================
app.get('/api/backup/export', (req, res) => {
  try {
    const db = getDb();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=grimorio-backup-${getSaoPauloDateStr()}.json`);
    res.send(JSON.stringify(db, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 8.5. CAMPANHA AGU — PROCURADOR FEDERAL
// ==========================================
function persistAguPlan(db, todayStr, examQuestions) {
  db.aguPlan = sanitizeAguPlan(db.aguPlan, todayStr);
  if (db.aguPlan?.startedAt) {
    const next = ensureCurrentCycle(db.aguPlan, examQuestions || db.examQuestions || [], todayStr);
    if (next !== db.aguPlan) {
      db.aguPlan = next;
      saveDb(db);
    }
  }
  return db.aguPlan;
}

app.get('/api/agu-plan', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    persistAguPlan(db, todayStr);
    res.json({
      success: true,
      plan: db.aguPlan,
      summary: summarizePlan(db.aguPlan, db.examQuestions || [], todayStr),
      subjects: AGU_SUBJECTS
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/agu-plan', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    const incoming = req.body?.plan || req.body || {};
    db.aguPlan = sanitizeAguPlan({
      ...sanitizeAguPlan(db.aguPlan, todayStr),
      ...incoming,
      updatedAt: new Date().toISOString()
    }, todayStr);
    saveDb(db);
    res.json({
      success: true,
      plan: db.aguPlan,
      summary: summarizePlan(db.aguPlan, db.examQuestions || [], todayStr)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agu-plan/start', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    db.aguPlan = startAguPlan(sanitizeAguPlan(db.aguPlan, todayStr), todayStr, db.examQuestions || []);
    saveDb(db);
    res.json({
      success: true,
      plan: db.aguPlan,
      summary: summarizePlan(db.aguPlan, db.examQuestions || [], todayStr)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agu-plan/realign', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    db.aguPlan = realignAguCycle(sanitizeAguPlan(db.aguPlan, todayStr), todayStr, db.examQuestions || []);
    saveDb(db);
    res.json({
      success: true,
      plan: db.aguPlan,
      summary: summarizePlan(db.aguPlan, db.examQuestions || [], todayStr)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agu-plan/advance', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    db.aguPlan = sanitizeAguPlan(db.aguPlan, todayStr);
    if (!db.aguPlan.startedAt) {
      return res.status(400).json({ error: 'Inicie a campanha antes de gerar o próximo ciclo.' });
    }
    db.aguPlan = advanceAguCycle(db.aguPlan, todayStr, db.examQuestions || []);
    saveDb(db);
    res.json({
      success: true,
      plan: db.aguPlan,
      summary: summarizePlan(db.aguPlan, db.examQuestions || [], todayStr)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agu-plan/log-product', (req, res) => {
  try {
    const { key, note } = req.body || {};
    if (!key) return res.status(400).json({ error: 'Informe a chave do bloco discursivo.' });
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    db.aguPlan = logDiscursiveProduct(sanitizeAguPlan(db.aguPlan, todayStr), key, { note });
    saveDb(db);
    res.json({
      success: true,
      plan: db.aguPlan,
      summary: summarizePlan(db.aguPlan, db.examQuestions || [], todayStr)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agu-plan/toggle-block', (req, res) => {
  try {
    const { key, durationMinutes } = req.body || {};
    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'Informe a chave do bloco (key).' });
    }
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    db.aguPlan = toggleCompletedBlock(sanitizeAguPlan(db.aguPlan, todayStr), key);
    db.aguPlan = addBlockDuration(db.aguPlan, key, durationMinutes);
    const linkedVictories = syncDailyVictoriesFromActivity(db, { today: todayStr, syncStudy: true });
    saveDb(db);
    res.json({
      success: true,
      plan: db.aguPlan,
      summary: summarizePlan(db.aguPlan, db.examQuestions || [], todayStr),
      linkedVictories
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/agu-plan/block', (req, res) => {
  try {
    const key = req.body?.key;
    if (!key || typeof key !== 'string') return res.status(400).json({ error: 'Informe a chave do bloco (key).' });
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    const {
      dateStr,
      subjectId,
      topicId,
      kind,
      durationMinutes,
      totalQuestions,
      correctAnswers
    } = req.body || {};
    const total = totalQuestions === undefined || totalQuestions === ''
      ? undefined
      : parseInt(totalQuestions, 10);
    const correct = correctAnswers === undefined || correctAnswers === ''
      ? 0
      : parseInt(correctAnswers, 10);
    if (total !== undefined && (Number.isNaN(total) || total < 0)) {
      return res.status(400).json({ error: 'Questões devem ser 0 ou mais.' });
    }
    if (total !== undefined && (Number.isNaN(correct) || correct < 0 || correct > total)) {
      return res.status(400).json({ error: 'Acertos devem ficar entre 0 e o total de questões.' });
    }

    const { plan: nextPlan, key: nextKey } = updateStudyBlockMeta(
      sanitizeAguPlan(db.aguPlan, todayStr),
      key,
      { dateStr, subjectId, topicId, kind, durationMinutes, totalQuestions: total }
    );
    db.aguPlan = nextPlan;

    if (!db.examQuestions) db.examQuestions = [];
    const examIds = new Set(
      collectStudyBlocks(db.aguPlan, db.examQuestions)
        .filter((block) => block.key === key || block.key === nextKey)
        .flatMap((block) => block.examIds || [])
    );
    const linked = db.examQuestions.filter((entry) => examIds.has(entry.id) || entry.blockKey === key || entry.blockKey === nextKey);
    if (total !== undefined) {
      linked.forEach((entry) => {
        revertPlayerReward({
          xp: entry.xpEarned || 0,
          coins: entry.coinsEarned || 0,
          focus: (entry.totalQuestions || 0) * 2,
          wisdom: (entry.correctAnswers || 0) * 2,
          consistency: 10,
          actionType: 'exam_questions',
          entityId: entry.id
        });
      });
      db.examQuestions = db.examQuestions.filter((entry) => entry.blockKey !== key && entry.blockKey !== nextKey);
      if (total > 0) {
        const subject = AGU_SUBJECTS.find((s) => s.id === (subjectId || linked[0]?.subjectId)) || null;
        const topic = subject?.topics?.find((t) => t.id === (topicId || linked[0]?.topicId));
        const accuracyRate = Math.round((correct / total) * 1000) / 10;
        const baseXp = total * 3;
        const correctXp = correct * 4;
        const accuracyBonusXp = accuracyRate === 100 ? 50 : accuracyRate >= 90 ? 30 : accuracyRate >= 80 ? 15 : 0;
        const totalXp = baseXp + correctXp + accuracyBonusXp;
        const coins = Math.max(2, Math.floor(correct / 2)) + (accuracyRate >= 80 ? 5 : 0) + (accuracyRate === 100 ? 10 : 0);
        const newQuestionLog = {
          id: uid('eq'),
          category: 'Estudos',
          subject: subject?.name || linked[0]?.subject || 'Geral',
          topic: topic?.name || linked[0]?.topic || '',
          subjectId: subject?.id || subjectId,
          topicId: topic?.id || topicId,
          kind: kind || 'estudo',
          blockKey: nextKey,
          institution: linked[0]?.institution || 'Cebraspe',
          totalQuestions: total,
          correctAnswers: correct,
          wrongAnswers: total - correct,
          accuracyRate,
          durationMinutes: parseDurationMinutes(durationMinutes),
          notes: `Campanha AGU · bloco editado · ${topic?.name || ''}`,
          notebookUrl: subject?.tecCadernoUrl || linked[0]?.notebookUrl || '',
          xpEarned: totalXp,
          coinsEarned: coins,
          date: dateStr || linked[0]?.date || todayStr,
          timestamp: new Date().toISOString()
        };
        db.examQuestions.unshift(newQuestionLog);
        rewardPlayer({
          xp: totalXp,
          coins,
          focus: total * 2,
          wisdom: correct * 2,
          consistency: 10,
          actionType: 'exam_questions',
          entityId: newQuestionLog.id,
          title: `${newQuestionLog.subject}: ${correct}/${total} acertos (${accuracyRate}%)`,
          details: {
            category: 'Estudos',
            totalQuestions: total,
            correctAnswers: correct,
            accuracyRate,
            subject: newQuestionLog.subject,
            topic: newQuestionLog.topic
          }
        });
      }
    } else if (nextKey !== key) {
      db.examQuestions = db.examQuestions.map((entry) => (
        entry.blockKey === key ? { ...entry, blockKey: nextKey, date: dateStr || entry.date, subjectId: subjectId || entry.subjectId, topicId: topicId || entry.topicId, kind: kind || entry.kind } : entry
      ));
    }

    db.aguPlan = refreshAguProgress(db.aguPlan, db.examQuestions || [], todayStr);
    const linkedVictories = syncDailyVictoriesFromActivity(db, { today: todayStr, syncStudy: true });
    saveDb(db);
    res.json({
      success: true,
      key: nextKey,
      plan: db.aguPlan,
      summary: summarizePlan(db.aguPlan, db.examQuestions || [], todayStr),
      linkedVictories
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agu-plan/block/delete', (req, res) => {
  try {
    const key = req.body?.key;
    if (!key || typeof key !== 'string') return res.status(400).json({ error: 'Informe a chave do bloco (key).' });
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    if (!db.examQuestions) db.examQuestions = [];
    const examIds = new Set(
      collectStudyBlocks(sanitizeAguPlan(db.aguPlan, todayStr), db.examQuestions)
        .filter((block) => block.key === key)
        .flatMap((block) => block.examIds || [])
    );
    const linked = db.examQuestions.filter((entry) => examIds.has(entry.id) || entry.blockKey === key);
    linked.forEach((entry) => {
      revertPlayerReward({
        xp: entry.xpEarned || 0,
        coins: entry.coinsEarned || 0,
        focus: (entry.totalQuestions || 0) * 2,
        wisdom: (entry.correctAnswers || 0) * 2,
        consistency: 10,
        actionType: 'exam_questions',
        entityId: entry.id
      });
    });
    db.examQuestions = db.examQuestions.filter((entry) => entry.blockKey !== key);
    db.aguPlan = deleteStudyBlock(sanitizeAguPlan(db.aguPlan, todayStr), key);
    db.aguPlan = refreshAguProgress(db.aguPlan, db.examQuestions || [], todayStr);
    const linkedVictories = syncDailyVictoriesFromActivity(db, { today: todayStr, syncStudy: true });
    saveDb(db);
    res.json({
      success: true,
      plan: db.aguPlan,
      summary: summarizePlan(db.aguPlan, db.examQuestions || [], todayStr),
      linkedVictories
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agu-plan/block-duration', (req, res) => {
  try {
    const { key, durationMinutes, mode } = req.body || {};
    if (!key || typeof key !== 'string') {
      return res.status(400).json({ error: 'Informe a chave do bloco (key).' });
    }
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    const plan = sanitizeAguPlan(db.aguPlan, todayStr);
    // mode=add soma uma nova sessão ao bloco; o padrão continua substituindo (edição manual do total).
    db.aguPlan = String(mode || '').toLowerCase() === 'add'
      ? addBlockDuration(plan, key, durationMinutes)
      : setBlockDuration(plan, key, durationMinutes);
    db.aguPlan = refreshAguProgress(db.aguPlan, db.examQuestions || [], todayStr);
    const linkedVictories = syncDailyVictoriesFromActivity(db, { today: todayStr, syncStudy: true });
    saveDb(db);
    res.json({
      success: true,
      plan: db.aguPlan,
      summary: summarizePlan(db.aguPlan, db.examQuestions || [], todayStr),
      linkedVictories
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ninety-day-goals/preview', (req, res) => {
  try {
    const todayStr = getSaoPauloDateStr();
    const preview = previewNinetyDayGoal(req.body || {}, todayStr);
    if (!preview.valid) {
      return res.status(400).json({ error: preview.error || 'Não foi possível interpretar a meta.' });
    }
    res.json({
      success: true,
      preview,
      breakdown: describeCycleBreakdown({
        unit: preview.unit,
        unitLabel: preview.unitLabel,
        cycles: preview.cycles
      })
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ninety-day-goals', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    const goals = sanitizeNinetyDayGoals(db.ninetyDayGoals, todayStr).map(g => enrichNinetyDayGoal(g, todayStr));
    res.json({
      success: true,
      goals,
      occupiedSlots: countOccupiedNinetyDayGoalSlots(goals),
      maxActive: MAX_ACTIVE_NINETY_DAY_GOALS
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ninety-day-goals', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    db.ninetyDayGoals = sanitizeNinetyDayGoals(db.ninetyDayGoals, todayStr);
    const occupied = countOccupiedNinetyDayGoalSlots(db.ninetyDayGoals);
    if (occupied >= MAX_ACTIVE_NINETY_DAY_GOALS) {
      return res.status(400).json({
        error: `Você já tem ${MAX_ACTIVE_NINETY_DAY_GOALS} metas de 90 dias em andamento. Conclua, archive ou exclua uma delas para cadastrar outra.`
      });
    }

    const defaultCat = db.questCategories?.[0]?.name || 'Pessoal';
    const goal = createNinetyDayGoal({
      title: req.body?.title,
      description: req.body?.description,
      category: req.body?.category || defaultCat,
      icon: req.body?.icon,
      targetAmount: req.body?.targetAmount,
      unit: req.body?.unit,
      unitLabel: req.body?.unitLabel,
      direction: req.body?.direction,
      startDate: req.body?.startDate
    }, { today: todayStr });

    db.ninetyDayGoals.unshift(goal);
    saveDb(db);
    res.json({
      success: true,
      goal,
      occupiedSlots: countOccupiedNinetyDayGoalSlots(db.ninetyDayGoals),
      breakdown: describeCycleBreakdown(goal)
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/ninety-day-goals/:id', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    const goal = sanitizeNinetyDayGoals(db.ninetyDayGoals, todayStr).find(g => g.id === req.params.id);
    if (!goal) return res.status(404).json({ error: 'Meta de 90 dias não encontrada.' });
    res.json({ success: true, goal: enrichNinetyDayGoal(goal, todayStr), breakdown: describeCycleBreakdown(goal) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/ninety-day-goals/:id', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    db.ninetyDayGoals = sanitizeNinetyDayGoals(db.ninetyDayGoals, todayStr);
    const index = db.ninetyDayGoals.findIndex(g => g.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Meta de 90 dias não encontrada.' });
    const updated = updateNinetyDayGoal(db.ninetyDayGoals[index], req.body || {}, todayStr);
    db.ninetyDayGoals[index] = updated;
    saveDb(db);
    res.json({ success: true, goal: updated, breakdown: describeCycleBreakdown(updated) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/ninety-day-goals/:id/progress', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    db.ninetyDayGoals = sanitizeNinetyDayGoals(db.ninetyDayGoals, todayStr);
    const index = db.ninetyDayGoals.findIndex(g => g.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Meta de 90 dias não encontrada.' });

    const result = logNinetyDayGoalProgress(db.ninetyDayGoals[index], {
      amount: req.body?.amount,
      date: req.body?.date,
      note: req.body?.note,
      timestamp: req.body?.timestamp
    }, todayStr);

    db.ninetyDayGoals[index] = result.goal;

    const defaultCat = db.questCategories?.[0]?.name || 'Pessoal';
    const rewardResult = rewardPlayer({
      xp: result.rewards.xp,
      coins: result.rewards.coins,
      willpower: result.rewards.willpower,
      actionType: 'ninety_day_goal_progress',
      entityId: result.log.id,
      title: `${result.goal.title} (+${result.log.amount} ${result.goal.unitLabel || result.goal.unit || ''})`.trim(),
      details: {
        category: result.goal.category || defaultCat,
        goalId: result.goal.id,
        amount: result.log.amount,
        justCompleted: result.justCompleted
      },
      timestamp: result.log.timestamp
    });

    saveDb(db);
    res.json({
      success: true,
      goal: result.goal,
      log: result.log,
      justCompleted: result.justCompleted,
      rewards: result.rewards,
      rewardResult,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/ninety-day-goals/:id/logs/:logId', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    db.ninetyDayGoals = sanitizeNinetyDayGoals(db.ninetyDayGoals, todayStr);
    const index = db.ninetyDayGoals.findIndex(g => g.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Meta de 90 dias não encontrada.' });

    const result = deleteNinetyDayGoalLog(db.ninetyDayGoals[index], req.params.logId, todayStr);
    db.ninetyDayGoals[index] = result.goal;

    revertPlayerReward({
      xp: result.removed.xpEarned || 0,
      coins: result.removed.coinsEarned || 0,
      willpower: result.removed.willpowerEarned || 0,
      actionType: 'ninety_day_goal_progress',
      entityId: result.removed.id
    });

    saveDb(db);
    res.json({ success: true, goal: result.goal, removed: result.removed });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/ninety-day-goals/:id', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    db.ninetyDayGoals = sanitizeNinetyDayGoals(db.ninetyDayGoals, todayStr);
    const index = db.ninetyDayGoals.findIndex(g => g.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Meta de 90 dias não encontrada.' });
    const [removed] = db.ninetyDayGoals.splice(index, 1);
    (removed.logs || []).forEach((log) => {
      revertPlayerReward({
        xp: log.xpEarned || 0,
        coins: log.coinsEarned || 0,
        willpower: log.willpowerEarned || 0,
        actionType: 'ninety_day_goal_progress',
        entityId: log.id
      });
    });
    saveDb(db);
    res.json({ success: true, removed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// VITÓRIAS PLANEJADAS PARA O DIA
// ==========================================
app.get('/api/daily-victories', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    const dates = getPlannableDates(todayStr);
    const items = sanitizeDailyVictories(db.dailyVictories);
    const bonuses = sanitizeDailyVictoryBonuses(db.dailyVictoryBonuses);
    res.json({
      success: true,
      today: todayStr,
      dates,
      maxPerDay: MAX_DAILY_VICTORIES,
      overflowMaxPerDay: EXTENDED_MAX_DAILY_VICTORIES,
      rewards: DAILY_VICTORY_REWARDS,
      tripleBonus: DAILY_VICTORY_TRIPLE_BONUS,
      todaySummary: summarizeDay(items, dates.today, bonuses),
      tomorrowSummary: summarizeDay(items, dates.tomorrow, bonuses),
      dailyVictories: items,
      dailyVictoryBonuses: bonuses
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/daily-victories', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    db.dailyVictories = sanitizeDailyVictories(db.dailyVictories);
    db.dailyVictoryBonuses = sanitizeDailyVictoryBonuses(db.dailyVictoryBonuses);
    const defaultCat = db.questCategories?.[0]?.name || 'Pessoal';
    const result = createDailyVictory(db.dailyVictories, {
      title: req.body?.title,
      category: req.body?.category,
      date: req.body?.date,
      source: req.body?.source,
      questId: req.body?.questId
    }, { today: todayStr, defaultCategory: defaultCat });
    db.dailyVictories = result.list;
    saveDb(db);
    res.json({
      success: true,
      victory: result.victory,
      todaySummary: summarizeDay(result.list, todayStr, db.dailyVictoryBonuses)
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/daily-victories/:id', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    db.dailyVictories = sanitizeDailyVictories(db.dailyVictories);
    db.dailyVictoryBonuses = sanitizeDailyVictoryBonuses(db.dailyVictoryBonuses);
    const result = updateDailyVictory(db.dailyVictories, req.params.id, req.body || {}, { today: todayStr });
    db.dailyVictories = result.list;
    saveDb(db);
    res.json({ success: true, victory: result.victory });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/daily-victories/:id/complete', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    db.dailyVictories = sanitizeDailyVictories(db.dailyVictories);
    db.dailyVictoryBonuses = sanitizeDailyVictoryBonuses(db.dailyVictoryBonuses);

    const result = completeDailyVictory(db.dailyVictories, db.dailyVictoryBonuses, req.params.id, {
      note: req.body?.note,
      completed: req.body?.completed,
      today: todayStr
    });

    db.dailyVictories = result.list;
    db.dailyVictoryBonuses = result.bonuses;

    let rewardResult = null;
    let bonusRewardResult = null;

    if (!result.stateUnchanged) {
      if (result.willComplete) {
        rewardResult = rewardPlayer({
          xp: DAILY_VICTORY_REWARDS.xp,
          coins: DAILY_VICTORY_REWARDS.coins,
          willpower: DAILY_VICTORY_REWARDS.willpower,
          actionType: 'daily_victory_complete',
          entityId: result.victory.id,
          title: result.victory.title,
          details: {
            category: result.victory.category,
            date: result.victory.date,
            note: result.victory.note || ''
          }
        });
        if (result.bonusAwardedNow) {
          bonusRewardResult = rewardPlayer({
            xp: DAILY_VICTORY_TRIPLE_BONUS.xp,
            coins: DAILY_VICTORY_TRIPLE_BONUS.coins,
            willpower: DAILY_VICTORY_TRIPLE_BONUS.willpower,
            consistency: DAILY_VICTORY_TRIPLE_BONUS.consistency,
            actionType: 'daily_victory_triple_bonus',
            entityId: bonusEntityId(result.victory.date),
            title: `Tríade de vitórias — ${result.victory.date}`,
            details: {
              category: result.victory.category,
              date: result.victory.date,
              bonus: true
            }
          });
        }
      } else {
        rewardResult = revertPlayerReward({
          xp: DAILY_VICTORY_REWARDS.xp,
          coins: DAILY_VICTORY_REWARDS.coins,
          willpower: DAILY_VICTORY_REWARDS.willpower,
          actionType: 'daily_victory_complete',
          entityId: result.victory.id
        });
        if (result.bonusRevertedNow) {
          bonusRewardResult = revertPlayerReward({
            xp: DAILY_VICTORY_TRIPLE_BONUS.xp,
            coins: DAILY_VICTORY_TRIPLE_BONUS.coins,
            willpower: DAILY_VICTORY_TRIPLE_BONUS.willpower,
            consistency: DAILY_VICTORY_TRIPLE_BONUS.consistency,
            actionType: 'daily_victory_triple_bonus',
            entityId: bonusEntityId(result.victory.date)
          });
        }
      }
    }

    saveDb(db);
    res.json({
      success: true,
      victory: result.victory,
      willComplete: result.willComplete,
      stateUnchanged: result.stateUnchanged,
      bonusAwardedNow: result.bonusAwardedNow,
      bonusRevertedNow: result.bonusRevertedNow,
      rewardResult,
      bonusRewardResult,
      todaySummary: summarizeDay(result.list, todayStr, result.bonuses),
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/daily-victories/:id', (req, res) => {
  try {
    const db = getDb();
    db.dailyVictories = sanitizeDailyVictories(db.dailyVictories);
    db.dailyVictoryBonuses = sanitizeDailyVictoryBonuses(db.dailyVictoryBonuses);
    const result = deleteDailyVictory(db.dailyVictories, db.dailyVictoryBonuses, req.params.id);
    db.dailyVictories = result.list;
    db.dailyVictoryBonuses = result.bonuses;

    if (result.shouldRevertReward) {
      revertPlayerReward({
        xp: DAILY_VICTORY_REWARDS.xp,
        coins: DAILY_VICTORY_REWARDS.coins,
        willpower: DAILY_VICTORY_REWARDS.willpower,
        actionType: 'daily_victory_complete',
        entityId: result.removed.id
      });
    }
    if (result.bonusRevertedNow) {
      revertPlayerReward({
        xp: DAILY_VICTORY_TRIPLE_BONUS.xp,
        coins: DAILY_VICTORY_TRIPLE_BONUS.coins,
        willpower: DAILY_VICTORY_TRIPLE_BONUS.willpower,
        consistency: DAILY_VICTORY_TRIPLE_BONUS.consistency,
        actionType: 'daily_victory_triple_bonus',
        entityId: bonusEntityId(result.removed.date)
      });
    }

    saveDb(db);
    res.json({ success: true, removed: result.removed });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==========================================
// MAPAS MENTAIS
// ==========================================
app.get('/api/mind-map-categories', (req, res) => {
  try {
    const db = getDb();
    res.json({ success: true, categories: sanitizeMindMapCategories(db.mindMapCategories) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mind-map-categories', (req, res) => {
  try {
    const db = getDb();
    db.mindMapCategories = sanitizeMindMapCategories(db.mindMapCategories);
    const { name, color, parentId } = req.body || {};
    const category = createMindMapCategory({ name, color, parentId }, db.mindMapCategories);
    db.mindMapCategories.push(category);
    saveDb(db);
    res.json({ success: true, category, categories: db.mindMapCategories });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/mind-map-categories/:id', (req, res) => {
  try {
    const db = getDb();
    db.mindMapCategories = sanitizeMindMapCategories(db.mindMapCategories);
    const cat = db.mindMapCategories.find(c => c.id === req.params.id);
    if (!cat) return res.status(404).json({ error: 'Assunto não encontrado.' });
    const { name, color, parentId } = req.body || {};
    if (name !== undefined) {
      const trimmed = String(name || '').trim();
      if (!trimmed) return res.status(400).json({ error: 'Informe o nome do assunto.' });
      const siblings = db.mindMapCategories.filter(c => c.id !== cat.id && (c.parentId || null) === (cat.parentId || null));
      if (siblings.some(c => c.name.toLowerCase() === trimmed.toLowerCase())) {
        return res.status(400).json({ error: 'Já existe um assunto com este nome neste nível.' });
      }
      cat.name = trimmed;
      db.mindMaps = applyMindMapCategoryRename(sanitizeMindMaps(db.mindMaps), cat.id, cat);
    }
    if (color !== undefined && color) cat.color = color;
    if (parentId !== undefined) {
      if (parentId) {
        const parent = db.mindMapCategories.find(c => c.id === parentId);
        if (!parent) return res.status(400).json({ error: 'Assunto pai não encontrado.' });
        if (parent.parentId) return res.status(400).json({ error: 'Subassuntos não podem ter outros subassuntos.' });
        if (parent.id === cat.id) return res.status(400).json({ error: 'Um assunto não pode ser pai de si mesmo.' });
        if (db.mindMapCategories.some(c => c.parentId === cat.id)) {
          return res.status(400).json({ error: 'Mova os subassuntos antes de transformar este assunto em subassunto.' });
        }
        cat.parentId = parent.id;
      } else {
        cat.parentId = null;
      }
    }
    saveDb(db);
    res.json({ success: true, category: cat, categories: db.mindMapCategories });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/mind-map-categories/:id', (req, res) => {
  try {
    const db = getDb();
    db.mindMapCategories = sanitizeMindMapCategories(db.mindMapCategories);
    const cat = db.mindMapCategories.find(c => c.id === req.params.id);
    if (!cat) return res.status(404).json({ error: 'Assunto não encontrado.' });
    const childIds = db.mindMapCategories.filter(c => c.parentId === cat.id).map(c => c.id);
    const removeIds = new Set([cat.id, ...childIds]);
    const fallback = db.mindMapCategories.find(c => !removeIds.has(c.id) && !c.parentId)
      || db.mindMapCategories.find(c => !removeIds.has(c.id))
      || null;
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    removeIds.forEach((id) => {
      db.mindMaps = reassignMindMapCategory(db.mindMaps, id, fallback);
    });
    db.mindMapCategories = db.mindMapCategories.filter(c => !removeIds.has(c.id));
    saveDb(db);
    res.json({ success: true, categories: db.mindMapCategories, mindMaps: db.mindMaps });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/mind-maps', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    const mindMaps = sanitizeMindMaps(db.mindMaps).map(m => ({
      ...m,
      stats: computeMapStats(m, { today: todayStr })
    }));
    res.json({
      success: true,
      mindMaps,
      sessions: sanitizeMindMapSessions(db.mindMapSessions),
      categories: sanitizeMindMapCategories(db.mindMapCategories)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mind-maps', (req, res) => {
  try {
    const db = getDb();
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    const { title, description, category, categoryId, color, rootLabel } = req.body || {};
    db.mindMapCategories = sanitizeMindMapCategories(db.mindMapCategories);
    const cat = categoryId
      ? db.mindMapCategories.find(c => c.id === categoryId)
      : db.mindMapCategories.find(c => c.name.toLowerCase() === String(category || '').toLowerCase());
    const map = createMindMap({
      title,
      description,
      category: cat?.name || category,
      categoryId: cat?.id || categoryId || null,
      color: color || cat?.color,
      rootLabel
    });
    db.mindMaps.unshift(map);
    saveDb(db);
    res.json({
      success: true,
      mindMap: { ...map, stats: computeMapStats(map) }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/mind-maps/:id', (req, res) => {
  try {
    const db = getDb();
    const map = sanitizeMindMaps(db.mindMaps).find(m => m.id === req.params.id);
    if (!map) return res.status(404).json({ error: 'Mapa mental não encontrado.' });
    res.json({
      success: true,
      mindMap: { ...map, stats: computeMapStats(map) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/mind-maps/:id', (req, res) => {
  try {
    const db = getDb();
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    const index = db.mindMaps.findIndex(m => m.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Mapa mental não encontrado.' });

    const { title, description, category, categoryId, color, rootLabel, lineStyle, nodes, layout } = req.body || {};
    let next = db.mindMaps[index];

    if (Array.isArray(nodes)) {
      next = {
        ...next,
        nodes,
        updatedAt: new Date().toISOString()
      };
      next = sanitizeMindMaps([next])[0];
      if (!next) return res.status(400).json({ error: 'Mapa mental inválido.' });
    }

    if (title !== undefined || description !== undefined || category !== undefined || categoryId !== undefined || color !== undefined || rootLabel !== undefined || lineStyle !== undefined) {
      db.mindMapCategories = sanitizeMindMapCategories(db.mindMapCategories);
      const cat = categoryId
        ? db.mindMapCategories.find(c => c.id === categoryId)
        : (category
          ? db.mindMapCategories.find(c => c.name.toLowerCase() === String(category).toLowerCase())
          : null);
      next = updateMindMapMeta(next, {
        title,
        description,
        category: cat?.name ?? category,
        categoryId: categoryId !== undefined ? (cat?.id || categoryId || null) : undefined,
        color,
        rootLabel,
        lineStyle
      });
    }

    if (layout) {
      next = layoutMindMap(next);
    }

    db.mindMaps[index] = next;
    saveDb(db);
    res.json({
      success: true,
      mindMap: { ...next, stats: computeMapStats(next) }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/mind-maps/:id/nodes', (req, res) => {
  try {
    const db = getDb();
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    const index = db.mindMaps.findIndex(m => m.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Mapa mental não encontrado.' });
    const { parentId, label, notes, color, icon, imageUrl, x, y } = req.body || {};
    const next = addMindMapNode(db.mindMaps[index], { parentId, label, notes, color, icon, imageUrl, x, y });
    db.mindMaps[index] = next;
    saveDb(db);
    res.json({
      success: true,
      mindMap: { ...next, stats: computeMapStats(next) }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/mind-maps/:id/nodes/:nodeId', (req, res) => {
  try {
    const db = getDb();
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    const index = db.mindMaps.findIndex(m => m.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Mapa mental não encontrado.' });
    const next = updateMindMapNode(db.mindMaps[index], req.params.nodeId, req.body || {});
    db.mindMaps[index] = next;
    saveDb(db);
    res.json({
      success: true,
      mindMap: { ...next, stats: computeMapStats(next) }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/mind-maps/:id/nodes/:nodeId', (req, res) => {
  try {
    const db = getDb();
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    const index = db.mindMaps.findIndex(m => m.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Mapa mental não encontrado.' });
    const next = deleteMindMapNode(db.mindMaps[index], req.params.nodeId);
    db.mindMaps[index] = next;
    saveDb(db);
    res.json({
      success: true,
      mindMap: { ...next, stats: computeMapStats(next) }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/mind-maps/:id/layout', (req, res) => {
  try {
    const db = getDb();
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    const index = db.mindMaps.findIndex(m => m.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Mapa mental não encontrado.' });
    const next = layoutMindMap(db.mindMaps[index]);
    db.mindMaps[index] = next;
    saveDb(db);
    res.json({
      success: true,
      mindMap: { ...next, stats: computeMapStats(next) }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/mind-maps/:id/study', (req, res) => {
  try {
    const db = getDb();
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    db.mindMapSessions = sanitizeMindMapSessions(db.mindMapSessions);
    const index = db.mindMaps.findIndex(m => m.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Mapa mental não encontrado.' });

    const { reviews, durationMinutes, mode, date } = req.body || {};
    const todayStr = date || getSaoPauloDateStr();
    const result = applyStudySession(db.mindMaps[index], reviews, {
      today: todayStr,
      durationMinutes,
      mode
    });

    db.mindMaps[index] = result.map;
    db.mindMapSessions.unshift(result.session);

    const rewardResult = rewardPlayer({
      xp: result.rewards.xp,
      coins: result.rewards.coins,
      wisdom: result.rewards.wisdom,
      focus: result.rewards.focus,
      actionType: 'mind_map_study',
      entityId: result.session.id,
      title: `${result.map.title}: ${result.session.recalled}/${result.session.reviewed} ramos (${result.session.accuracy}%)`,
      details: {
        category: result.map.category || 'Estudos',
        mapId: result.map.id,
        sessionId: result.session.id,
        reviewed: result.session.reviewed,
        recalled: result.session.recalled,
        accuracy: result.session.accuracy,
        durationMinutes: result.session.durationMinutes,
        mode: result.session.mode
      }
    });

    saveDb(db);
    res.json({
      success: true,
      mindMap: { ...result.map, stats: computeMapStats(result.map, { today: todayStr }) },
      session: result.session,
      rewardResult,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/mind-maps/:id', (req, res) => {
  try {
    const db = getDb();
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    db.mindMapSessions = sanitizeMindMapSessions(db.mindMapSessions);
    const index = db.mindMaps.findIndex(m => m.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Mapa mental não encontrado.' });
    const [removed] = db.mindMaps.splice(index, 1);
    const relatedSessions = db.mindMapSessions.filter(s => s.mapId === removed.id);
    relatedSessions.forEach((session) => {
      revertPlayerReward({
        xp: session.xpEarned || 0,
        coins: session.coinsEarned || 0,
        wisdom: (session.recalled || 0) * 2 + Math.min(session.reviewed || 0, 8),
        focus: (session.reviewed || 0) + Math.floor((session.durationMinutes || 0) / 5),
        actionType: 'mind_map_study',
        entityId: session.id
      });
    });
    db.mindMapSessions = db.mindMapSessions.filter(s => s.mapId !== removed.id);
    saveDb(db);
    res.json({ success: true, removed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/mind-map-sessions/:id', (req, res) => {
  try {
    const db = getDb();
    db.mindMapSessions = sanitizeMindMapSessions(db.mindMapSessions);
    const index = db.mindMapSessions.findIndex(s => s.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Sessão de estudo não encontrada.' });
    const [removed] = db.mindMapSessions.splice(index, 1);
    revertPlayerReward({
      xp: removed.xpEarned || 0,
      coins: removed.coinsEarned || 0,
      wisdom: (removed.recalled || 0) * 2 + Math.min(removed.reviewed || 0, 8),
      focus: (removed.reviewed || 0) + Math.floor((removed.durationMinutes || 0) / 5),
      actionType: 'mind_map_study',
      entityId: removed.id
    });
    saveDb(db);
    res.json({ success: true, removed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agu-plan/reset', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    db.aguPlan = createDefaultAguPlan(todayStr);
    saveDb(db);
    res.json({
      success: true,
      plan: db.aguPlan,
      summary: summarizePlan(db.aguPlan, db.examQuestions || [], todayStr)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backup/import', (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.userProfile || !data.quests) {
      return res.status(400).json({ error: 'Arquivo de backup inválido.' });
    }
    saveDb(data);
    res.json({ success: true, message: 'Dados restaurados com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback for SPA routing
app.get('*', (req, res) => {
  const indexHtml = path.join(distPath, 'index.html');
  res.sendFile(indexHtml, (err) => {
    if (err) {
      res.send(`<h2>Grimório de Missões API está rodando na porta ${PORT}!</h2><p>Inicie o Vite com 'npm run dev:client' ou construa com 'npm run build'.</p>`);
    }
  });
});

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`🗡️ [Grimório de Missões] Servidor iniciado com sucesso em http://localhost:${PORT}`);
    initKeepAlive();
  });
}).catch(err => {
  console.error('Erro na inicialização do DB:', err);
  app.listen(PORT, () => {
    console.log(`🗡️ [Grimório de Missões] Servidor iniciado com fallback local em http://localhost:${PORT}`);
    initKeepAlive();
  });
});
