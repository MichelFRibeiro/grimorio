import './loadEnv.js';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, saveDb, initDb, getPool, flushDb, rewardPlayer, revertPlayerReward, revertLog, getXpForLevel, getTitleForLevel, findOrCreateUser, createBossRaid, BOSS_CATALOG, applyCategoryRename, getDataDir } from './db.js';
import { runMaintenance } from './domain/maintenance.js';
import { weekKeyOf } from './domain/bossWeek.js';
import { listUnacknowledged, acknowledgePenalty, acknowledgeAllPenalties, prepareContest } from './domain/penalties.js';
import { computeAnalytics } from './analytics.js';
import { discoverCorrelations } from './correlations.js';
import { computeCategoryRankings, RANK_TIERS } from './rankings.js';
import { suggestNextAction, previewNextAction, recordEnergyAndSuggest, declineAndRemember, acceptDoseOnly, snoozeAndRemember } from './oracleSuggest.js';
import { openRouterKeyStatus, setStoredOpenRouterKey, getOpenRouterApiKey } from './jevClient.js';
import {
  CHAT_MAX_CONTENT,
  CHAT_MAX_PARTICIPANTS,
  CHAT_MAX_ROOMS,
  CHAT_MAX_TITLE,
  clearChatModelCache,
  colorForIndex,
  completeChatTurn,
  listOpenRouterModels,
  modelLabelFromId,
  publicChatMessage,
  publicChatRoom,
  sanitizeChatRooms
} from './chatRoom.js';
import {
  markDecisionAccepted,
  markDecisionCompleted,
  markEnergySkip,
  oracleMemoryStats,
  formatQuantity
} from './oracleMemory.js';
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
  authMiddleware,
  getAuthConfig,
  isGuestLoginEnabled,
  isEmailLoginEnabled,
  assertOwnerEmail,
  warnIfGoogleClientIdMissing
} from './auth.js';
import {
  isAllowedAudioFile,
  corsOriginDelegate,
  stripBackupSecrets,
  importBackup,
  persistenceFlushMiddleware,
  genericErrorHandler
} from './httpGuards.js';
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
import {
  createSupplement,
  updateSupplement,
  deleteSupplement,
  logSupplementIntake,
  updateSupplementLog,
  deleteSupplementLog
} from './domain/supplements.js';
import { formatBrl } from '../src/utils/coinExchange.js';
import { sanitizePhoneTimeLogs } from '../src/utils/phoneTime.js';
import { deletePhoneTimeLog, upsertPhoneTimeLog } from './domain/phoneTime.js';
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
  refreshAguProgress,
  addAguError,
  reviewAguError,
  dueAguErrors
} from '../src/utils/aguCycle.js';
import { collectStudyBlocks } from '../src/utils/aguStudyEngine.js';
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
  completeQuest as domainCompleteQuest,
  updateQuestDuration as domainUpdateQuestDuration,
  deleteQuest as domainDeleteQuest,
  breakDownQuest as domainBreakDownQuest,
  rescheduleQuests as domainRescheduleQuests,
  toggleHabit as domainToggleHabit,
  updateHabitDuration as domainUpdateHabitDuration,
  deleteHabit as domainDeleteHabit,
  logReadingSession as domainLogReadingSession,
  updateReadingSession as domainUpdateReadingSession,
  deleteReadingSession as domainDeleteReadingSession,
  addQuote as domainAddQuote,
  updateQuote as domainUpdateQuote,
  deleteQuote as domainDeleteQuote,
  deleteBook as domainDeleteBook,
  saveScriptureLiveDraft as domainSaveScriptureLiveDraft,
  logScriptureSession as domainLogScriptureSession,
  updateScriptureSession as domainUpdateScriptureSession,
  deleteScriptureSession as domainDeleteScriptureSession,
  addScriptureQuote as domainAddScriptureQuote,
  updateScriptureQuote as domainUpdateScriptureQuote,
  deleteScriptureQuote as domainDeleteScriptureQuote,
  addScriptureReflection as domainAddScriptureReflection,
  deleteScriptureReflection as domainDeleteScriptureReflection,
  logExamQuestions as domainLogExamQuestions,
  updateExamQuestions as domainUpdateExamQuestions,
  deleteExamQuestions as domainDeleteExamQuestions,
  createProcess as domainCreateProcess,
  stepProcess as domainStepProcess,
  updateProcess as domainUpdateProcess,
  deleteProcess as domainDeleteProcess,
  createReward as domainCreateReward,
  redeemReward as domainRedeemReward,
  completeDailyVictoryUseCase,
  deleteMindMapSession as domainDeleteMindMapSession,
  revertMindMapSession
} from './domain/activities.js';
import {
  createMindMap,
  addMindMapNode,
  updateMindMapNode,
  updateMindMapNodes,
  deleteMindMapNode,
  addMindMapCrossLink,
  updateMindMapCrossLink,
  deleteMindMapCrossLink,
  addMindMapBrace,
  updateMindMapBrace,
  deleteMindMapBrace,
  addBraceLabelNode,
  updateMindMapMeta,
  layoutMindMap,
  applyStudySession,
  sanitizeMindMaps,
  sanitizeMindMapSessions,
  sanitizeMindMapCategories,
  createMindMapCategory,
  applyMindMapCategoryRename,
  reassignMindMapCategory,
  computeMapStats,
  rememberMindMapImage,
  forgetMindMapImage,
  sanitizeMindMapImageLibrary,
  stripMindMapImage
} from '../src/utils/mindMaps.js';
import { sanitizeMindMapImageUrl } from '../src/utils/mindMapIcons.js';
import {
  acceptDayPlan,
  buildEveningReview,
  buildTodayPayload,
  buildWeeklyReview,
  closeDay,
  deleteDailyReview,
  saveWeeklyPlan,
  suggestDayPlan,
  toggleWeeklyFocus,
} from './domain/today.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Atrás de proxy reverso (Traefik no VPS, Render) o Express só enxerga
 * X-Forwarded-Proto/For se confiar no primeiro hop — é o que faz
 * `req.protocol` devolver https nos links do MCP. Fica desligado por padrão
 * para não mudar nada no Render; ligue com TRUST_PROXY=1 (o docker-compose.yml
 * do VPS já define).
 */
const TRUST_PROXY = String(process.env.TRUST_PROXY || '').trim();
if (TRUST_PROXY && TRUST_PROXY !== '0' && TRUST_PROXY.toLowerCase() !== 'false') {
  const value = /^\d+$/.test(TRUST_PROXY)
    ? Number(TRUST_PROXY)
    : (TRUST_PROXY.toLowerCase() === 'true' ? true : TRUST_PROXY);
  app.set('trust proxy', value);
}

app.use(cors({ origin: corsOriginDelegate }));
app.use(express.json({ limit: '10mb' }));
app.use(persistenceFlushMiddleware);
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
    // Volume de dados (GRIMORIO_DATA_DIR=/data no Docker): permite trocar o
    // áudio sem reconstruir a imagem. Como o caminho empacotado acima não
    // depende do data dir, o áudio da imagem continua sendo encontrado.
    path.join(getDataDir(), 'audio', 'focus_mp3.mp3'),
    process.env.AZ_VAULT_PATH && path.join(process.env.AZ_VAULT_PATH, FOCUS_AUDIO_REL),
    path.join('/a0/usr/workdir/az-vault', FOCUS_AUDIO_REL),
    path.resolve(process.cwd(), 'az-vault', FOCUS_AUDIO_REL),
    path.resolve(__dirname, '../../../az-vault', FOCUS_AUDIO_REL),
    path.resolve(__dirname, '../../../../az-vault', FOCUS_AUDIO_REL)
  ].filter(Boolean);

  return candidates.find(filePath => isAllowedAudioFile(filePath)) || null;
}

function streamFocusAudio(req, res) {
  const filePath = getFocusAudioPath();
  if (!filePath) {
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

  // HEAD espelha o GET (inclusive 206 + Content-Range): players e CDNs sondam
  // o áudio com HEAD + Range antes de baixar, e um 200 sem Content-Range fazia
  // o cliente concluir que o servidor não suporta streaming parcial.
  const isHead = req.method === 'HEAD';

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
    if (isHead) return res.end();
    return fs.createReadStream(filePath, { start, end: safeEnd }).pipe(res);
  }

  res.setHeader('Content-Length', fileSize);
  if (isHead) return res.end();
  return fs.createReadStream(filePath).pipe(res);
}

app.get('/api/focus/track', (req, res) => {
  const filePath = getFocusAudioPath();
  if (!filePath) {
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
  res.json(getAuthConfig());
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Credencial do Google não fornecida.' });
    }

    const verified = await verifyGoogleToken(credential);
    assertOwnerEmail(verified.email);
    const user = findOrCreateUser({ ...verified, provider: 'google' });
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
  if (!isEmailLoginEnabled()) {
    return res.status(403).json({ error: 'O login por e-mail está desativado. Entre com a conta Google do dono.' });
  }
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
  if (!isGuestLoginEnabled()) {
    return res.status(403).json({ error: 'O acesso de convidado está desativado. Entre com a conta Google do dono.' });
  }
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
/**
 * Manutenção preguiçosa, com memória do último ciclo.
 *
 * Era executada em TODA leitura de /api/state e /api/today: varredura do ledger
 * para derivar sequência/escudos, avaliação de punições e virada de semana. Como
 * as leituras são frequentes (a interface refaz /api/state depois de cada ação e
 * há polling de timers), o mesmo cálculo se repetia centenas de vezes por hora.
 * Chave = dia + semana de São Paulo: quando ela muda, roda; dentro do mesmo
 * ciclo, no máximo uma vez a cada MAINTAIN_MIN_INTERVAL_MS.
 */
const MAINTAIN_MIN_INTERVAL_MS = Number(process.env.GRIMORIO_MAINTAIN_INTERVAL_MS) > 0
  ? Number(process.env.GRIMORIO_MAINTAIN_INTERVAL_MS)
  : 2 * 60 * 1000;
let maintainCache = { key: null, ranAt: 0, report: null };

function maintain(db, now = new Date()) {
  const today = getSaoPauloDateStr(now);
  const key = `${today}|${weekKeyOf(now)}`;
  const elapsed = Date.now() - maintainCache.ranAt;
  if (maintainCache.key === key && maintainCache.ranAt > 0 && elapsed < MAINTAIN_MIN_INTERVAL_MS) {
    // Relatório "nada a fazer" para as leituras dentro do mesmo ciclo, com a
    // mesma forma do relatório real (created/changed vazios).
    return {
      today,
      created: [],
      weekly: { rolled: [], currentKey: weekKeyOf(now), changed: false },
      streak: { newlyConsumed: [] },
      changed: false,
      skipped: true
    };
  }
  const report = runMaintenance(db, now, { createBossRaid });
  // `report.changed` cobre punição nova, virada de semana, normalização do chefe
  // e mexida na sequência. Passagem limpa não grava nada.
  const changed = report.changed === true
    || (report.created?.length || 0) > 0
    || (report.weekly?.rolled?.length || 0) > 0
    || (report.streak?.newlyConsumed?.length || 0) > 0;
  if (changed) saveDb(db);
  maintainCache = { key, ranAt: Date.now(), report };
  return report;
}

app.get('/api/state', (req, res) => {
  try {
    const db = getDb();
    const maintenance = maintain(db);
    const todayStr = getSaoPauloDateStr();
    db.dailyVictories = sanitizeDailyVictories(db.dailyVictories);
    db.dailyVictoryBonuses = sanitizeDailyVictoryBonuses(db.dailyVictoryBonuses);
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    db.mindMapSessions = sanitizeMindMapSessions(db.mindMapSessions);
    db.mindMapCategories = sanitizeMindMapCategories(db.mindMapCategories);
    db.mindMapImages = sanitizeMindMapImageLibrary(db.mindMapImages);
    db.aguPlan = sanitizeAguPlan(db.aguPlan, todayStr);
    if (db.aguPlan?.startedAt) {
      const next = ensureCurrentCycle(db.aguPlan, db.examQuestions || [], todayStr);
      if (next !== db.aguPlan) {
        db.aguPlan = next;
        saveDb(db);
      }
    }
    db.phoneTimeLogs = sanitizePhoneTimeLogs(db.phoneTimeLogs);
    const analytics = computeAnalytics();
    // Mesmo contrato do POST /consult: energia recente, needsEnergy e motivos
    // de recusa. Sem isso o cartão escondia a indicação a cada ação.
    const nextAction = previewNextAction(db);
    const oracleMemory = oracleMemoryStats(db);
    const { integrations, ...publicDb } = db;
    res.json({
      ...publicDb,
      openRouter: openRouterKeyStatus(),
      analytics,
      correlations: discoverCorrelations(db),
      nextAction,
      today: buildTodayPayload(db),
      oracleMemory,
      locations: LOCATIONS,
      user: req.user || null,
      penaltiesPending: listUnacknowledged(db),
      maintenance
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
// Sem efeitos colaterais: a tela chama este endpoint a cada atualização de
// estado e precisa do mesmo contrato do Jev (energia, needsEnergy, motivos de
// recusa) sem gravar decisões. A consulta de verdade é o POST /consult.
function nextActionPayload(db, options = {}) {
  const result = previewNextAction(db, options);
  return {
    ...result,
    locations: LOCATIONS
  };
}

app.get('/api/next-action', (req, res) => {
  try {
    const db = getDb();
    const location = req.query.location ? String(req.query.location) : undefined;
    const snoozedIds = req.query.snoozed
      ? String(req.query.snoozed).split(',').map(s => s.trim()).filter(Boolean)
      : [];
    res.json({
      success: true,
      ...nextActionPayload(db, { location, snoozedIds })
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/next-action/consult', async (req, res) => {
  try {
    const db = getDb();
    const location = req.body?.location ? String(req.body.location) : undefined;
    const snoozedIds = Array.isArray(req.body?.snoozedIds) ? req.body.snoozedIds : [];
    const result = await suggestNextAction(db, { location, snoozedIds });
    saveDb(db);
    res.json({
      success: true,
      ...result,
      locations: LOCATIONS
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2.3. HOJE, FECHAMENTO E REVISÃO SEMANAL
// ==========================================
app.get('/api/today', (req, res) => {
  try {
    const db = getDb();
    maintain(db);
    const location = req.query.location ? String(req.query.location) : undefined;
    res.json({ success: true, today: buildTodayPayload(db, { location }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/today/plan', (req, res) => {
  try {
    const db = getDb();
    const date = req.query.date ? String(req.query.date) : undefined;
    res.json({ success: true, suggestions: suggestDayPlan(db, { date }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/today/plan', (req, res) => {
  try {
    const db = getDb();
    const result = acceptDayPlan(db, {
      items: req.body?.items,
      date: req.body?.date
    });
    if (result.error) return res.status(result.status || 400).json({ error: result.error, skipped: result.skipped });
    saveDb(db);
    res.json({ success: true, ...result, today: buildTodayPayload(db) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/daily-reviews', (req, res) => {
  try {
    const db = getDb();
    res.json({
      success: true,
      evening: buildEveningReview(db),
      reviews: db.dailyReviews || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/daily-reviews', async (req, res) => {
  try {
    const db = getDb();
    const result = await closeDay(db, { note: req.body?.note, mood: req.body?.mood });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({
      success: true,
      review: result.review,
      rewardResult: result.rewardResult,
      chest: result.chest?.chest || null,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/daily-reviews/:id', (req, res) => {
  try {
    const db = getDb();
    const result = deleteDailyReview(db, req.params.id);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, removed: result.removed, rewardResult: result.rewardResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/weekly-review', (req, res) => {
  try {
    const db = getDb();
    const weekKey = req.query.weekKey ? String(req.query.weekKey) : undefined;
    res.json({ success: true, review: buildWeeklyReview(db, { weekKey }) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/weekly-plans', (req, res) => {
  try {
    const db = getDb();
    const result = saveWeeklyPlan(db, {
      weekKey: req.body?.weekKey,
      focuses: req.body?.focuses,
      note: req.body?.note
    });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, plan: result.plan });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/weekly-plans/focus', (req, res) => {
  try {
    const db = getDb();
    const result = toggleWeeklyFocus(db, {
      weekKey: req.body?.weekKey,
      focusId: req.body?.focusId,
      done: req.body?.done
    });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({
      success: true,
      plan: result.plan,
      focus: result.focus,
      stateUnchanged: !!result.stateUnchanged,
      rewardResult: result.rewardResult,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/integrations/openrouter', (req, res) => {
  res.json({ success: true, openRouter: openRouterKeyStatus() });
});

app.get('/api/chat/models', async (req, res) => {
  try {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: 'Cadastre a chave do OpenRouter para listar os modelos.' });
    }
    const models = await listOpenRouterModels(apiKey, { force: req.query.refresh === '1' });
    res.json({ success: true, models, openRouter: openRouterKeyStatus() });
  } catch (err) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
    res.status(status).json({ error: err.message || 'Não foi possível listar os modelos.' });
  }
});

app.get('/api/chat/rooms', (req, res) => {
  const db = getDb();
  const rooms = sanitizeChatRooms(db.chatRooms).map(publicChatRoom);
  res.json({ success: true, rooms, openRouter: openRouterKeyStatus() });
});

app.post('/api/chat/rooms', (req, res) => {
  try {
    const db = getDb();
    db.chatRooms = sanitizeChatRooms(db.chatRooms);
    if (db.chatRooms.length >= CHAT_MAX_ROOMS) {
      return res.status(400).json({ error: `O Grimório guarda no máximo ${CHAT_MAX_ROOMS} salas.` });
    }
    const title = String(req.body?.title || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_TITLE) || 'Nova sala';
    const incoming = Array.isArray(req.body?.participants) ? req.body.participants : [];
    const participants = [];
    const seen = new Set();
    for (const item of incoming) {
      const modelId = String(item?.modelId || item || '').trim().slice(0, 160);
      if (!modelId || seen.has(modelId) || participants.length >= CHAT_MAX_PARTICIPANTS) continue;
      seen.add(modelId);
      participants.push({
        modelId,
        label: String(item?.label || modelLabelFromId(modelId)).replace(/\s+/g, ' ').trim().slice(0, 60) || modelLabelFromId(modelId),
        color: colorForIndex(participants.length)
      });
    }
    if (!participants.length) {
      return res.status(400).json({ error: 'Escolha ao menos um modelo para a sala.' });
    }
    const now = new Date().toISOString();
    const room = {
      id: uid('chat'),
      title,
      participants,
      messages: [],
      createdAt: now,
      updatedAt: now
    };
    db.chatRooms.unshift(room);
    saveDb(db);
    res.json({ success: true, room: publicChatRoom(room) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/chat/rooms/:id', (req, res) => {
  try {
    const db = getDb();
    db.chatRooms = sanitizeChatRooms(db.chatRooms);
    const room = db.chatRooms.find((item) => item.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Sala não encontrada.' });
    if (req.body?.title != null) {
      const title = String(req.body.title).replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX_TITLE);
      if (title) room.title = title;
    }
    if (Array.isArray(req.body?.participants)) {
      const next = [];
      const seen = new Set();
      for (const item of req.body.participants) {
        const modelId = String(item?.modelId || '').trim().slice(0, 160);
        if (!modelId || seen.has(modelId) || next.length >= CHAT_MAX_PARTICIPANTS) continue;
        seen.add(modelId);
        const previous = room.participants.find((participant) => participant.modelId === modelId);
        next.push({
          modelId,
          label: String(item?.label || previous?.label || modelLabelFromId(modelId)).replace(/\s+/g, ' ').trim().slice(0, 60) || modelLabelFromId(modelId),
          color: previous?.color || colorForIndex(next.length)
        });
      }
      if (!next.length) return res.status(400).json({ error: 'A sala precisa de ao menos um modelo.' });
      room.participants = next;
    }
    room.updatedAt = new Date().toISOString();
    saveDb(db);
    res.json({ success: true, room: publicChatRoom(room) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/chat/rooms/:id', (req, res) => {
  try {
    const db = getDb();
    db.chatRooms = sanitizeChatRooms(db.chatRooms);
    const index = db.chatRooms.findIndex((item) => item.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Sala não encontrada.' });
    const [removed] = db.chatRooms.splice(index, 1);
    saveDb(db);
    res.json({ success: true, removed: publicChatRoom(removed) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat/rooms/:id/messages', (req, res) => {
  try {
    const content = String(req.body?.content || '').trim().slice(0, CHAT_MAX_CONTENT);
    if (!content) return res.status(400).json({ error: 'Escreva algo antes de enviar.' });
    const db = getDb();
    db.chatRooms = sanitizeChatRooms(db.chatRooms);
    const room = db.chatRooms.find((item) => item.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Sala não encontrada.' });
    const message = {
      id: uid('msg'),
      role: 'user',
      content,
      modelId: null,
      label: 'Você',
      createdAt: new Date().toISOString(),
      error: null
    };
    room.messages.push(message);
    room.updatedAt = message.createdAt;
    saveDb(db);
    res.json({ success: true, message: publicChatMessage(message), room: publicChatRoom(room) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat/rooms/:id/speak', async (req, res) => {
  try {
    const apiKey = getOpenRouterApiKey();
    if (!apiKey) {
      return res.status(503).json({ error: 'Cadastre a chave do OpenRouter para convocar um modelo.' });
    }
    const modelId = String(req.body?.modelId || '').trim();
    if (!modelId) return res.status(400).json({ error: 'Escolha o modelo que deve se manifestar.' });
    const db = getDb();
    db.chatRooms = sanitizeChatRooms(db.chatRooms);
    const room = db.chatRooms.find((item) => item.id === req.params.id);
    if (!room) return res.status(404).json({ error: 'Sala não encontrada.' });
    const participant = room.participants.find((item) => item.modelId === modelId);
    if (!participant) return res.status(404).json({ error: 'Esse modelo não participa desta sala.' });
    const spoken = room.messages.some((item) => item.role === 'user' && item.content);
    if (!spoken) return res.status(400).json({ error: 'Escreva a primeira fala antes de convocar um modelo.' });

    const history = room.messages.map((item) => ({ ...item }));
    const turn = await completeChatTurn({
      apiKey,
      participant,
      messages: history
    });
    const message = {
      id: uid('msg'),
      role: 'assistant',
      content: turn.content,
      modelId: participant.modelId,
      label: participant.label,
      createdAt: new Date().toISOString(),
      error: null
    };
    const liveDb = getDb();
    liveDb.chatRooms = sanitizeChatRooms(liveDb.chatRooms);
    const live = liveDb.chatRooms.find((item) => item.id === room.id);
    if (!live) return res.status(404).json({ error: 'A sala foi excluída antes da resposta.' });
    if (!live.participants.some((item) => item.modelId === participant.modelId)) {
      return res.status(404).json({ error: 'Esse modelo saiu da sala antes da resposta.' });
    }
    live.messages.push(message);
    live.updatedAt = message.createdAt;
    saveDb(liveDb);
    res.json({
      success: true,
      message: publicChatMessage(message),
      room: publicChatRoom(live),
      wordCount: turn.wordCount
    });
  } catch (err) {
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 502;
    res.status(status).json({ error: err.message || 'O modelo não respondeu.' });
  }
});

app.put('/api/integrations/openrouter', (req, res) => {
  try {
    const key = String(req.body?.apiKey || '').trim();
    if (!key.startsWith('sk-or-')) {
      return res.status(400).json({ error: 'A chave do OpenRouter começa com sk-or-.' });
    }
    const db = getDb();
    if (!db.integrations) db.integrations = {};
    db.integrations.openrouterApiKey = key;
    setStoredOpenRouterKey(key);
    saveDb(db);
    clearChatModelCache();
    res.json({ success: true, openRouter: openRouterKeyStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/next-action/energy', async (req, res) => {
  try {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Conte como você está agora.' });
    const db = getDb();
    const location = req.body?.location ? String(req.body.location) : undefined;
    const snoozedIds = Array.isArray(req.body?.snoozedIds) ? req.body.snoozedIds : [];
    const { suggestion, energyError } = await recordEnergyAndSuggest(db, text, { location, snoozedIds });
    saveDb(db);
    res.json({
      success: true,
      ...suggestion,
      energyError: energyError || null,
      locations: LOCATIONS
    });
  } catch (err) {
    const status = err.code === 'NO_KEY' ? 503 : 502;
    res.status(status).json({ error: err.message || 'Não foi possível ler a energia.' });
  }
});

// "Pular" precisa valer por uma janela: toda atualização da tela reavalia a
// indicação, e sem isso a pergunta voltava imediatamente.
app.post('/api/next-action/skip-energy', async (req, res) => {
  try {
    const db = getDb();
    const location = req.body?.location ? String(req.body.location) : undefined;
    const snoozedIds = Array.isArray(req.body?.snoozedIds) ? req.body.snoozedIds : [];
    markEnergySkip(db, {});
    const result = await suggestNextAction(db, { location, snoozedIds, skipJev: true });
    saveDb(db);
    res.json({
      success: true,
      ...result,
      locations: LOCATIONS
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/next-action/snooze', (req, res) => {
  try {
    const db = getDb();
    const entityId = req.body?.entityId || req.body?.id;
    const remembered = snoozeAndRemember(db, {
      entityId,
      location: req.body?.location
    });
    if (remembered.error) return res.status(remembered.status).json({ error: remembered.error });
    saveDb(db);
    res.json({ success: true, snooze: remembered.snooze });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/next-action/decline', async (req, res) => {
  try {
    const db = getDb();
    const remembered = declineAndRemember(db, {
      decisionId: req.body?.decisionId,
      reason: req.body?.reason,
      note: req.body?.note
    });
    if (remembered.error) return res.status(remembered.status).json({ error: remembered.error });
    const location = req.body?.location ? String(req.body.location) : undefined;
    const snoozedIds = Array.isArray(req.body?.snoozedIds) ? req.body.snoozedIds : [];
    const excluded = [...new Set([...snoozedIds, remembered.decision.entityId])];
    const suggestion = await suggestNextAction(db, { location, snoozedIds: excluded });
    saveDb(db);
    res.json({
      success: true,
      ...suggestion,
      locations: LOCATIONS
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/next-action/accept-dose', (req, res) => {
  try {
    const db = getDb();
    const accepted = acceptDoseOnly(db, req.body?.decisionId);
    if (accepted.error) return res.status(accepted.status).json({ error: accepted.error });
    const { decision } = accepted;
    // A dose aceita precisa deixar rastro: antes o aceite só existia na
    // memória do Oráculo, sem registro do que foi feito.
    const now = new Date();
    const trackedMinutes = parseDurationMinutes(req.body?.durationMinutes);
    db.actionLogs.unshift({
      id: uid('log'),
      type: 'oracle_dose',
      entityId: decision.entityId,
      title: `Dose aceita: ${decision.dose.label} de ${decision.title}`,
      xp: 0,
      coins: 0,
      details: {
        kind: decision.kind,
        dose: decision.dose.label,
        doseAmount: decision.dose.amount,
        doseUnit: decision.dose.unit,
        fraction: decision.dose.fraction,
        fullAmount: decision.quantity ? formatQuantity(decision.quantity.amount, decision.quantity.unit) : null,
        trackedMinutes: trackedMinutes || null,
        decisionId: decision.id
      },
      timestamp: now.toISOString(),
      hour: getSaoPauloHour(now),
      dayOfWeek: getSaoPauloDayOfWeek(now),
      date: getSaoPauloDateStr(now)
    });
    saveDb(db);
    res.json({ success: true, decision });
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
    // Sem `location` explícito: assim o contexto continua dizendo que o lugar
    // veio do perfil salvo (e a tela sabe que pode voltar ao automático).
    res.json({
      success: true,
      userProfile: db.userProfile,
      ...nextActionPayload(db)
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

app.put('/api/quests/:id/duration', (req, res) => {
  try {
    const db = getDb();
    const result = domainUpdateQuestDuration(db, req.params.id, req.body?.durationMinutes);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({
      success: true,
      quest: result.quest,
      durationMinutes: result.durationMinutes,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/quests/:id/complete', (req, res) => {
  try {
    const db = getDb();
    // HTTP alterna quando o corpo não traz `completed` explícito.
    const result = domainCompleteQuest(db, {
      id: req.params.id,
      completed: req.body?.completed,
      durationMinutes: req.body?.durationMinutes,
      decisionId: req.body?.decisionId
    });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({
      success: true,
      quest: result.quest,
      willComplete: result.willComplete,
      stateUnchanged: result.stateUnchanged || false,
      rewardResult: result.rewardResult,
      linkedVictories: result.linkedVictories,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/quests/reschedule', (req, res) => {
  try {
    const db = getDb();
    const result = domainRescheduleQuests(db, {
      ids: req.body?.ids,
      dueDate: req.body?.dueDate
    });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quests/:id/breakdown', (req, res) => {
  try {
    const db = getDb();
    const result = domainBreakDownQuest(db, req.params.id, req.body?.steps);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, quest: result.quest, added: result.added });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/quests/:id', (req, res) => {
  try {
    const db = getDb();
    const result = domainDeleteQuest(db, req.params.id);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, rewardResult: result.rewardResult });
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
    const result = domainLogReadingSession(db, {
      bookId: req.params.id,
      startPage: req.body?.startPage,
      endPage: req.body?.endPage,
      durationMinutes: req.body?.durationMinutes,
      notes: req.body?.notes,
      quotes: req.body?.quotes,
      date: req.body?.date,
      decisionId: req.body?.decisionId
    });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({
      success: true,
      book: result.book,
      session: result.session,
      rewardResult: result.rewardResult,
      linkedVictories: result.linkedVictories,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Edit reading session: estorna o log exato e concede de novo.
app.put('/api/reading-sessions/:id', (req, res) => {
  try {
    const db = getDb();
    const result = domainUpdateReadingSession(db, req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({
      success: true,
      book: result.book,
      session: result.session,
      userProfile: result.userProfile,
      rewardResult: result.rewardResult,
      linkedVictories: result.linkedVictories,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete('/api/reading-sessions/:id', (req, res) => {
  try {
    const db = getDb();
    const result = domainDeleteReadingSession(db, req.params.id);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({
      success: true,
      book: result.book,
      deletedSessionId: result.deletedSessionId,
      userProfile: result.userProfile,
      rewardResult: result.rewardResult,
      linkedVictories: result.linkedVictories,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/books/:id/quotes', (req, res) => {
  try {
    const db = getDb();
    const result = domainAddQuote(db, { bookId: req.params.id, ...req.body });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, quote: result.quote, book: result.book, rewardResult: result.rewardResult, analytics: computeAnalytics() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/books/:id/quotes/:quoteId', (req, res) => {
  try {
    const db = getDb();
    const result = domainUpdateQuote(db, { bookId: req.params.id, quoteId: req.params.quoteId, ...req.body });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, quote: result.quote, book: result.book });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/books/:id/quotes/:quoteId', (req, res) => {
  try {
    const db = getDb();
    const result = domainDeleteQuote(db, { bookId: req.params.id, quoteId: req.params.quoteId });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, book: result.book, rewardResult: result.rewardResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4.1. ESCRITURAS (LEITURA DA BÍBLIA)
// Tempo independente da Biblioteca.
// ==========================================
app.put('/api/scripture/live-draft', (req, res) => {
  try {
    const db = getDb();
    const result = domainSaveScriptureLiveDraft(db, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    if (!result.unchanged) saveDb(db);
    res.json({ success: true, scriptureLiveDraft: result.scriptureLiveDraft, unchanged: result.unchanged });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete('/api/scripture/live-draft', (req, res) => {
  try {
    const db = getDb();
    const result = domainSaveScriptureLiveDraft(db, { clear: true });
    if (!result.unchanged) saveDb(db);
    res.json({ success: true, scriptureLiveDraft: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scripture/sessions', (req, res) => {
  try {
    const db = getDb();
    const result = domainLogScriptureSession(db, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({
      success: true,
      session: result.session,
      rewardResult: result.rewardResult,
      linkedVictories: result.linkedVictories,
      finishedCanon: result.finishedCanon
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.put('/api/scripture/sessions/:id', (req, res) => {
  try {
    const db = getDb();
    const result = domainUpdateScriptureSession(db, req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, session: result.session, rewardResult: result.rewardResult, linkedVictories: result.linkedVictories });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete('/api/scripture/sessions/:id', (req, res) => {
  try {
    const db = getDb();
    const result = domainDeleteScriptureSession(db, req.params.id);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, rewardResult: result.rewardResult, linkedVictories: result.linkedVictories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scripture/quotes', (req, res) => {
  try {
    const db = getDb();
    const result = domainAddScriptureQuote(db, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, quote: result.quote, rewardResult: result.rewardResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/scripture/quotes/:id', (req, res) => {
  try {
    const db = getDb();
    const result = domainUpdateScriptureQuote(db, { id: req.params.id, ...(req.body || {}) });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, quote: result.quote });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/scripture/quotes/:id', (req, res) => {
  try {
    const db = getDb();
    const result = domainDeleteScriptureQuote(db, req.params.id);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, rewardResult: result.rewardResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/scripture/reflections', (req, res) => {
  try {
    const db = getDb();
    const result = domainAddScriptureReflection(db, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, reflection: result.reflection });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/scripture/reflections/:id', (req, res) => {
  try {
    const db = getDb();
    const result = domainDeleteScriptureReflection(db, req.params.id);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/books/:id', (req, res) => {
  try {
    const db = getDb();
    const result = domainDeleteBook(db, req.params.id);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
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
    const result = domainLogExamQuestions(db, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({
      success: true,
      examQuestion: result.examQuestion,
      rewardResult: result.rewardResult,
      linkedVictories: result.linkedVictories,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.put('/api/questions/:id', (req, res) => {
  try {
    const db = getDb();
    const result = domainUpdateExamQuestions(db, req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({
      success: true,
      examQuestion: result.examQuestion,
      rewardResult: result.rewardResult,
      linkedVictories: result.linkedVictories,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete('/api/questions/:id', (req, res) => {
  try {
    const db = getDb();
    const result = domainDeleteExamQuestions(db, req.params.id);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, rewardResult: result.rewardResult, linkedVictories: result.linkedVictories, analytics: computeAnalytics() });
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
    const result = domainCreateProcess(db, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, process: result.process });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/processes/:id/step', (req, res) => {
  try {
    const db = getDb();
    const result = domainStepProcess(db, req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({
      success: true,
      process: result.process,
      step: result.step,
      rewardResult: result.rewardResult,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.put('/api/processes/:id', (req, res) => {
  try {
    const db = getDb();
    const result = domainUpdateProcess(db, req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, process: result.process });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete('/api/processes/:id', (req, res) => {
  try {
    const db = getDb();
    const result = domainDeleteProcess(db, req.params.id);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
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

app.put('/api/habits/:id/duration', (req, res) => {
  try {
    const db = getDb();
    const result = domainUpdateHabitDuration(db, req.params.id, {
      date: req.body?.date,
      durationMinutes: req.body?.durationMinutes
    });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({
      success: true,
      habit: result.habit,
      targetDate: result.targetDate,
      durationMinutes: result.durationMinutes,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.post('/api/habits/:id/toggle', (req, res) => {
  try {
    const db = getDb();
    const result = domainToggleHabit(db, {
      id: req.params.id,
      date: req.body?.date,
      durationMinutes: req.body?.durationMinutes,
      decisionId: req.body?.decisionId
    });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({
      success: true,
      habit: result.habit,
      targetDate: result.targetDate,
      done: result.done,
      doneToday: result.doneToday,
      rewardResult: result.rewardResult,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete('/api/habits/:id', (req, res) => {
  try {
    const db = getDb();
    const result = domainDeleteHabit(db, req.params.id);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6.5. SUPLEMENTOS
// ==========================================
app.post('/api/supplements', (req, res) => {
  try {
    const db = getDb();
    const result = createSupplement(db, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, supplement: result.supplement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/supplements/:id', (req, res) => {
  try {
    const db = getDb();
    const result = updateSupplement(db, req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, supplement: result.supplement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/supplements/:id', (req, res) => {
  try {
    const db = getDb();
    const result = deleteSupplement(db, req.params.id);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, removedLogs: result.removedLogs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/supplement-logs', (req, res) => {
  try {
    const db = getDb();
    const result = logSupplementIntake(db, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, log: result.log, supplement: result.supplement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/supplement-logs/:id', (req, res) => {
  try {
    const db = getDb();
    const result = updateSupplementLog(db, req.params.id, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, log: result.log, supplement: result.supplement });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/supplement-logs/:id', (req, res) => {
  try {
    const db = getDb();
    const result = deleteSupplementLog(db, req.params.id);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6.5. TEMPO NO CELULAR
// ==========================================
app.get('/api/phone-time', (req, res) => {
  try {
    const db = getDb();
    res.json({ success: true, logs: sanitizePhoneTimeLogs(db.phoneTimeLogs) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/phone-time', (req, res) => {
  try {
    const db = getDb();
    const result = upsertPhoneTimeLog(db, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, log: result.log, created: result.created, logs: db.phoneTimeLogs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/phone-time/:id', (req, res) => {
  try {
    const db = getDb();
    const existing = sanitizePhoneTimeLogs(db.phoneTimeLogs).find((entry) => entry.id === req.params.id);
    if (!existing) return res.status(404).json({ error: 'Registro de tempo no celular não encontrado.' });
    const result = upsertPhoneTimeLog(db, {
      ...(req.body || {}),
      date: existing.date
    });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, log: result.log, logs: db.phoneTimeLogs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/phone-time/:id', (req, res) => {
  try {
    const db = getDb();
    const result = deletePhoneTimeLog(db, req.params.id);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, logs: db.phoneTimeLogs });
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
    const result = domainCreateReward(db, req.body || {});
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, reward: result.reward });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
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
    const result = domainRedeemReward(db, { id: req.params.id, notes: req.body?.notes });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({
      success: true,
      reward: result.reward,
      userProfile: result.userProfile,
      redemption: result.redemption
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
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
    const force = req.body?.force === true;
    if (!currentBoss?.defeated && !force) {
      return res.status(409).json({
        error: 'O chefe da semana ainda está de pé. Novo chefe só no domingo — ou force=true para um reset explícito.'
      });
    }
    let targetLevel;
    if (req.body && req.body.level !== undefined) {
      targetLevel = Math.max(1, parseInt(req.body.level, 10) || 1);
    } else if (currentBoss && currentBoss.defeated) {
      targetLevel = (currentBoss.level || 1) + 1;
    } else {
      targetLevel = currentBoss?.level || 1;
    }
    const forceName = req.body?.name || null;
    const hpBefore = currentBoss?.currentHp;
    db.bossRaid = createBossRaid({
      level: targetLevel,
      currentBoss,
      forceName
    });
    if (force && !currentBoss?.defeated && hpBefore != null && req.body?.keepHp) {
      db.bossRaid.currentHp = Math.min(db.bossRaid.maxHp, hpBefore);
    }
    saveDb(db);
    res.json({ success: true, bossRaid: db.bossRaid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/penalties', (req, res) => {
  try {
    const db = getDb();
    maintain(db);
    res.json({
      success: true,
      penalties: db.penalties || [],
      pending: listUnacknowledged(db)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/penalties/acknowledge', (req, res) => {
  try {
    const db = getDb();
    const result = req.body?.id
      ? acknowledgePenalty(db, req.body.id)
      : acknowledgeAllPenalties(db);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, ...result, pending: listUnacknowledged(db) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/penalties/:id/contest', (req, res) => {
  try {
    const db = getDb();
    const prepared = prepareContest(db, req.params.id, req.body?.reason);
    if (prepared.error) return res.status(prepared.status || 400).json({ error: prepared.error });
    const revert = prepared.penalty.rewardLogId
      ? revertLog(db, prepared.penalty.rewardLogId, { save: false })
      : null;
    prepared.penalty.contestedAt = new Date().toISOString();
    prepared.penalty.contestReason = prepared.reason;
    prepared.penalty.acknowledgedAt = prepared.penalty.contestedAt;
    saveDb(db);
    res.json({ success: true, penalty: prepared.penalty, revert });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 9. BACKUP EXPORT & IMPORT
// ==========================================
app.get('/api/backup/export', (req, res) => {
  try {
    const db = stripBackupSecrets(getDb());
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=grimorio-backup-${getSaoPauloDateStr()}.json`);
    res.send(JSON.stringify(db, null, 2));
  } catch (err) {
    console.error('Erro ao exportar backup:', err);
    res.status(500).json({ error: 'Não foi possível exportar o backup.' });
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

app.get('/api/agu-plan/errors', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    const plan = sanitizeAguPlan(db.aguPlan, todayStr);
    const due = dueAguErrors(plan, todayStr);
    res.json({ success: true, due, errors: plan.errorNotebook || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agu-plan/errors', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    const note = String(req.body?.note || req.body?.text || '').trim();
    if (!note) return res.status(400).json({ error: 'Descreva o erro.' });
    db.aguPlan = addAguError(sanitizeAguPlan(db.aguPlan, todayStr), {
      note,
      subjectId: req.body?.subjectId || null,
      topicId: req.body?.topicId || null,
      url: req.body?.url || req.body?.link || null
    }, todayStr);
    saveDb(db);
    res.json({ success: true, error: db.aguPlan.errorNotebook[0], errors: db.aguPlan.errorNotebook });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/agu-plan/errors/:id/review', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    const quality = Number(req.body?.quality);
    db.aguPlan = reviewAguError(
      sanitizeAguPlan(db.aguPlan, todayStr),
      req.params.id,
      Number.isFinite(quality) ? quality : 2,
      todayStr
    );
    saveDb(db);
    const item = (db.aguPlan.errorNotebook || []).find((error) => error.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Erro não encontrado.' });
    res.json({ success: true, error: item, due: dueAguErrors(db.aguPlan, todayStr) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/agu-plan/errors/:id', (req, res) => {
  try {
    const db = getDb();
    const todayStr = getSaoPauloDateStr();
    db.aguPlan = sanitizeAguPlan(db.aguPlan, todayStr);
    const before = db.aguPlan.errorNotebook || [];
    const removed = before.find((item) => item.id === req.params.id);
    if (!removed) return res.status(404).json({ error: 'Erro não encontrado.' });
    db.aguPlan.errorNotebook = before.filter((item) => item.id !== req.params.id);
    saveDb(db);
    res.json({ success: true, removed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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
    if (db.aguPlan?.completedBlocks?.[key]) {
      markDecisionCompleted(db, {
        decisionId: req.body?.decisionId,
        entityId: `agu:${key}`,
        kind: 'agu',
        completionKind: 'block'
      });
    }
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
    const linked = db.examQuestions.filter((entry) => entry.blockKey === key);
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

app.post('/api/daily-victories/:id/complete', async (req, res) => {
  try {
    const db = getDb();
    const result = await completeDailyVictoryUseCase(db, {
      id: req.params.id,
      note: req.body?.note,
      completed: req.body?.completed,
      durationMinutes: req.body?.durationMinutes,
      decisionId: req.body?.decisionId
    });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({
      success: true,
      victory: result.victory,
      willComplete: result.willComplete,
      stateUnchanged: result.stateUnchanged,
      bonusAwardedNow: result.bonusAwardedNow,
      bonusRevertedNow: result.bonusRevertedNow,
      rewardResult: result.rewardResult,
      bonusRewardResult: result.bonusRewardResult,
      chest: result.chest?.chest || null,
      todaySummary: summarizeDay(result.list, result.todayStr, result.bonuses),
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
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

app.get('/api/mind-map-images', (req, res) => {
  try {
    const db = getDb();
    res.json({ success: true, images: sanitizeMindMapImageLibrary(db.mindMapImages) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mind-map-images', (req, res) => {
  try {
    const db = getDb();
    const url = sanitizeMindMapImageUrl(req.body?.url);
    if (!url) return res.status(400).json({ error: 'Imagem inválida.' });
    db.mindMapImages = rememberMindMapImage(db.mindMapImages, url, {
      label: req.body?.label,
      mapTitle: req.body?.mapTitle
    });
    saveDb(db);
    res.json({ success: true, image: db.mindMapImages[0], images: db.mindMapImages });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/mind-map-images', (req, res) => {
  try {
    const db = getDb();
    const url = req.body?.url;
    if (!url) return res.status(400).json({ error: 'Informe a imagem a excluir.' });
    const before = sanitizeMindMapImageLibrary(db.mindMapImages);
    const target = before.find(item => item.url === url || item.id === url);
    if (!target) return res.status(404).json({ error: 'Imagem não encontrada.' });
    db.mindMapImages = forgetMindMapImage(before, target.url);
    if (req.body?.detach !== false) {
      db.mindMaps = stripMindMapImage(sanitizeMindMaps(db.mindMaps), target.url);
    }
    saveDb(db);
    res.json({ success: true, images: db.mindMapImages, mindMaps: db.mindMaps });
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

    const { title, description, category, categoryId, color, rootLabel, lineStyle, scaleFontByDepth, fillHideableNodeIds, nodes, layout } = req.body || {};
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

    if (title !== undefined || description !== undefined || category !== undefined || categoryId !== undefined || color !== undefined || rootLabel !== undefined || lineStyle !== undefined || scaleFontByDepth !== undefined || fillHideableNodeIds !== undefined) {
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
        lineStyle,
        scaleFontByDepth,
        fillHideableNodeIds
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
    const addedImage = (next.nodes || []).find(n => n.imageUrl && n.imageUrl === imageUrl);
    if (addedImage?.imageUrl) {
      db.mindMapImages = rememberMindMapImage(db.mindMapImages, addedImage.imageUrl, {
        label: addedImage.label,
        mapTitle: next.title
      });
    }
    saveDb(db);
    res.json({
      success: true,
      mindMap: { ...next, stats: computeMapStats(next) },
      images: db.mindMapImages
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
    if (req.body && req.body.imageUrl) {
      const node = (next.nodes || []).find(n => n.id === req.params.nodeId);
      if (node?.imageUrl) {
        db.mindMapImages = rememberMindMapImage(db.mindMapImages, node.imageUrl, {
          label: node.label,
          mapTitle: next.title
        });
      }
    }
    saveDb(db);
    res.json({
      success: true,
      mindMap: { ...next, stats: computeMapStats(next) },
      images: req.body && Object.prototype.hasOwnProperty.call(req.body, 'imageUrl') ? db.mindMapImages : undefined
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/api/mind-maps/:id/nodes', (req, res) => {
  try {
    const db = getDb();
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    const index = db.mindMaps.findIndex(m => m.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Mapa mental não encontrado.' });
    const { nodeIds, ...patch } = req.body || {};
    const next = updateMindMapNodes(db.mindMaps[index], nodeIds, patch);
    db.mindMaps[index] = next;
    if (patch.imageUrl) {
      const ids = new Set(Array.isArray(nodeIds) ? nodeIds : []);
      const node = (next.nodes || []).find(n => ids.has(n.id) && n.imageUrl);
      if (node?.imageUrl) {
        db.mindMapImages = rememberMindMapImage(db.mindMapImages, node.imageUrl, {
          label: node.label,
          mapTitle: next.title
        });
      }
    }
    saveDb(db);
    res.json({
      success: true,
      mindMap: { ...next, stats: computeMapStats(next) },
      images: Object.prototype.hasOwnProperty.call(patch, 'imageUrl') ? db.mindMapImages : undefined
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

app.post('/api/mind-maps/:id/braces', (req, res) => {
  try {
    const db = getDb();
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    const index = db.mindMaps.findIndex(m => m.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Mapa mental não encontrado.' });
    const { nodeIds, label, color, side } = req.body || {};
    const next = addMindMapBrace(db.mindMaps[index], { nodeIds, label, color, side });
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

app.put('/api/mind-maps/:id/braces/:braceId', (req, res) => {
  try {
    const db = getDb();
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    const index = db.mindMaps.findIndex(m => m.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Mapa mental não encontrado.' });
    const next = updateMindMapBrace(db.mindMaps[index], req.params.braceId, req.body || {});
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

app.post('/api/mind-maps/:id/braces/:braceId/label-node', (req, res) => {
  try {
    const db = getDb();
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    const index = db.mindMaps.findIndex(m => m.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Mapa mental não encontrado.' });
    const next = addBraceLabelNode(db.mindMaps[index], req.params.braceId, req.body || {});
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

app.delete('/api/mind-maps/:id/braces/:braceId', (req, res) => {
  try {
    const db = getDb();
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    const index = db.mindMaps.findIndex(m => m.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Mapa mental não encontrado.' });
    const next = deleteMindMapBrace(db.mindMaps[index], req.params.braceId);
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

app.post('/api/mind-maps/:id/links', (req, res) => {
  try {
    const db = getDb();
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    const index = db.mindMaps.findIndex(m => m.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Mapa mental não encontrado.' });
    const { fromId, toId, label, icon, color } = req.body || {};
    const next = addMindMapCrossLink(db.mindMaps[index], { fromId, toId, label, icon, color });
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

app.put('/api/mind-maps/:id/links/:linkId', (req, res) => {
  try {
    const db = getDb();
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    const index = db.mindMaps.findIndex(m => m.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Mapa mental não encontrado.' });
    const next = updateMindMapCrossLink(db.mindMaps[index], req.params.linkId, req.body || {});
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

app.delete('/api/mind-maps/:id/links/:linkId', (req, res) => {
  try {
    const db = getDb();
    db.mindMaps = sanitizeMindMaps(db.mindMaps);
    const index = db.mindMaps.findIndex(m => m.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Mapa mental não encontrado.' });
    const next = deleteMindMapCrossLink(db.mindMaps[index], req.params.linkId);
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

    const { reviews, durationMinutes, mode } = req.body || {};
    // Data do cliente não agenda revisão — o dia é o de São Paulo no servidor.
    const todayStr = getSaoPauloDateStr();
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

    if (rewardResult?.logEntry?.id) result.session.rewardLogId = rewardResult.logEntry.id;
    markDecisionCompleted(db, {
      decisionId: req.body?.decisionId,
      entityId: result.map.id,
      kind: 'mindmap',
      completionKind: 'study'
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
      revertMindMapSession(db, session);
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
    const result = domainDeleteMindMapSession(db, req.params.id);
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    saveDb(db);
    res.json({ success: true, removed: result.removed, rewardResult: result.rewardResult });
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

app.post('/api/backup/import', async (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.userProfile || !data.quests) {
      return res.status(400).json({ error: 'Arquivo de backup inválido.' });
    }
    const { snapshot } = await importBackup(data, getPool());
    res.json({ success: true, message: 'Dados restaurados com sucesso!', snapshot });
  } catch (err) {
    console.error('Erro ao importar backup:', err);
    const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
    res.status(status).json({
      error: status === 400 ? err.message : 'Não foi possível restaurar o backup.'
    });
  }
});

// Só a API: o fallback do SPA abaixo responde HTML e não deve virar JSON.
app.use('/api', genericErrorHandler);
app.use('/mcp', genericErrorHandler);

// Fallback for SPA routing
app.get('*', (req, res) => {
  const indexHtml = path.join(distPath, 'index.html');
  res.sendFile(indexHtml, (err) => {
    if (err) {
      res.send(`<h2>Grimório de Missões API está rodando na porta ${PORT}!</h2><p>Inicie o Vite com 'npm run dev:client' ou construa com 'npm run build'.</p>`);
    }
  });
});

export function createApp() {
  return app;
}

/**
 * HOST opcional: no Docker o processo precisa escutar em 0.0.0.0 para o Traefik
 * alcançá-lo (o compose define HOST=0.0.0.0). Sem HOST o comportamento é o de
 * sempre — escuta em todas as interfaces, igual ao Render.
 */
function resolveListenHost() {
  const host = String(process.env.HOST || '').trim();
  return host || undefined;
}

export function start(port = PORT, host = resolveListenHost()) {
  warnIfGoogleClientIdMissing();
  const onListening = (suffix) => () => {
    const where = host ? `${host}:${port}` : `localhost:${port}`;
    console.log(`🗡️ [Grimório de Missões] Servidor iniciado com sucesso em http://${where}${suffix}`);
    initKeepAlive();
  };
  return initDb().then(() => {
    return app.listen(port, host, onListening(''));
  }).catch(err => {
    console.error('Erro na inicialização do DB:', err);
    return app.listen(port, host, onListening(' (fallback local)'));
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  start();
}
