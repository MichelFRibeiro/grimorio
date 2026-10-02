/**
 * Simulação da PRIMEIRA carga em produção depois do deploy.
 *
 * O banco vivo tem dados de setembro (chefe da semana, missões críticas,
 * rituais de várias frequências, plano AGU v3, logs antigos sem id) e nenhum
 * campo novo — nem `maintenance`, nem `destinyChests`, nem homeostasis.
 *
 * O teste sobe o app de verdade (`createApp`), com o relógio travado em
 * 2026-10-01T19:00-03:00 e depois em 2026-10-04T10:00-03:00 (domingo, virada
 * de semana), e afirma o que a primeira leitura de /api/state faz — e o que
 * ela não faz.
 */
import './testEnv.js';
import assert from 'assert';
import fs from 'fs';
import http from 'http';
import path from 'path';

// ---------------------------------------------------------------------------
// Relógio controlado. `new Date()` sem argumentos devolve o instante travado;
// qualquer Data com argumento continua funcionando normalmente.
// ---------------------------------------------------------------------------
const CLOCK = { at: Date.parse('2026-10-01T19:00:00-03:00') };
const RealDate = Date;
class ClockDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) {
      super(CLOCK.at);
      return;
    }
    super(...args);
  }

  static now() {
    return CLOCK.at;
  }
}
globalThis.Date = ClockDate;

// ---------------------------------------------------------------------------
// Contador de gravações do banco: writeDbFileAtomic escreve sempre um arquivo
// temporário `.database.<pid>.<ts>.tmp`, então uma gravação = um write aqui.
// ---------------------------------------------------------------------------
const realWriteFileSync = fs.writeFileSync;
let dbWrites = 0;
fs.writeFileSync = function countedWrite(file, ...rest) {
  if (typeof file === 'string' && path.basename(file).startsWith('.database.')) dbWrites += 1;
  return realWriteFileSync.call(this, file, ...rest);
};

const { createApp } = await import('./index.js');
const { initDb, getDb, __resetDbCacheForTests, getDbFilePath } = await import('./db.js');
const { createSession } = await import('./auth.js');
const { syncHeroStreak } = await import('./domain/streaks.js');
const { applyWillpowerMitigation } = await import('./domain/penalties.js');
const { catalogBossHp, scaleBossHp } = await import('./domain/bossWeek.js');

const TODAY = '2026-10-01';
const YESTERDAY = '2026-09-30';
const SUNDAY = '2026-10-04';

function ok(condition, message) {
  assert.ok(condition, message);
  console.log(`  ✓ ${message}`);
}

function eq(actual, expected, message) {
  assert.equal(actual, expected, `${message} (recebido ${JSON.stringify(actual)}, esperado ${JSON.stringify(expected)})`);
  console.log(`  ✓ ${message}`);
}

/** Log produtivo legado: sem id, sem hour/dayOfWeek, sem applied. */
function legacyLog(date, type = 'quest_complete', entityId = 'q-legado') {
  return { type, date, entityId, xp: 120, coins: 15, timestamp: `${date}T18:30:00.000Z` };
}

function legacyLogs() {
  const logs = [];
  // A sequência salva é 4 e o último dia ativo foi 30/09: o ledger antigo cobre
  // exatamente 27–30/09. Sem isso a derivação zeraria a sequência do herói.
  [TODAY.replace('-01', '-30'), '2026-09-29', '2026-09-28', '2026-09-27'].forEach((date) => {
    logs.push(legacyLog(date));
  });
  logs.push(legacyLog('2026-09-26', 'habit_complete', 'h-1'));
  logs.push(legacyLog('2026-09-25', 'reading_session', 'b-1'));
  logs.push(legacyLog('2026-09-24', 'exam_questions', 'eq-1'));
  // Lixo legado: sem data nenhuma. Não pode contar para a sequência nem quebrar.
  logs.push({ type: 'quest_complete', entityId: 'q-sem-data', xp: 10, coins: 2 });
  return logs;
}

function habits() {
  return [
    {
      id: 'hb-diario',
      title: 'Beber 2L de água',
      frequency: 'daily',
      priority: 'importante',
      category: 'Saúde',
      icon: 'Droplet',
      history: ['2026-09-28', '2026-09-29', YESTERDAY],
      createdAt: '2026-08-01',
      currentStreak: 3,
      bestStreak: 21,
      targetTimesPerWeek: 7
    },
    {
      id: 'hb-dias-uteis',
      title: 'Revisar o caderno de erros',
      frequency: 'weekdays',
      priority: 'importante',
      category: 'Estudos',
      icon: 'BookOpen',
      history: ['2026-09-28', '2026-09-29', YESTERDAY],
      createdAt: '2026-08-01',
      currentStreak: 3,
      bestStreak: 40,
      targetTimesPerWeek: 5
    },
    {
      // Ritual crítico semanal: a virada de semana de 27/09 cobra a falta.
      id: 'hb-semanal-critico',
      title: 'Simulado semanal completo',
      frequency: 'weekly',
      priority: 'critico',
      category: 'Estudos',
      icon: 'Target',
      weekDays: [6],
      history: ['2026-09-05', '2026-09-12', '2026-09-19'],
      createdAt: '2026-08-01',
      currentStreak: 3,
      bestStreak: 12,
      targetTimesPerWeek: 1
    },
    {
      id: 'hb-3x-semana',
      title: 'Musculação',
      frequency: 'times_per_week',
      priority: 'importante',
      category: 'Saúde',
      icon: 'Dumbbell',
      weekDays: [1, 3, 5],
      history: ['2026-09-28', YESTERDAY],
      createdAt: '2026-07-01',
      currentStreak: 2,
      bestStreak: 30
    },
    {
      id: 'hb-quinzenal',
      title: 'Revisão quinzenal do plano',
      frequency: 'fortnightly',
      priority: 'importante',
      category: 'Projetos',
      icon: 'CalendarClock',
      monthDays: [1, 16],
      history: ['2026-09-16'],
      createdAt: '2026-07-01',
      currentStreak: 1,
      bestStreak: 6
    },
    {
      id: 'hb-mensal',
      title: 'Backup das anotações',
      frequency: 'monthly',
      priority: 'bom_fazer',
      category: 'Projetos',
      icon: 'HardDrive',
      monthDays: [1],
      history: ['2026-09-01'],
      createdAt: '2026-06-01',
      currentStreak: 4,
      bestStreak: 4
    }
  ];
}

function aguDebt() {
  const subjects = ['constitucional', 'administrativo', 'financeiro', 'tributario', 'seguridade'];
  const items = [];
  // Dívida podre (mais de 21 dias → expira) + dívida da quinzena corrente.
  for (let i = 0; i < 15; i += 1) {
    const subjectId = subjects[i % subjects.length];
    items.push({
      fromDate: i < 6 ? '2026-08-1' + (i % 10) : `2026-09-${String(20 + (i % 9)).padStart(2, '0')}`,
      fromWeekday: i % 7,
      subjectId,
      topicId: null,
      kind: 'questoes',
      remainingQuestions: 10,
      reason: 'faltaram 10 questões'
    });
  }
  return items;
}

function fixture() {
  const bossName = 'A Quimera da Hesitação';
  const rewardCoins = Math.round(150 * Math.pow(1.1, 15));
  const rewardXp = Math.round(400 * Math.pow(1.1, 15));
  return {
    userProfile: {
      id: 'hero-1',
      name: 'Mestre do Foco',
      email: '',
      level: 16,
      xp: 4380,
      xpToNextLevel: 4503,
      coins: 2242,
      title: 'Mestre do Conhecimento',
      avatar: '🧙‍♂️',
      picture: '',
      stats: { wisdom: 250, focus: 1398, willpower: 80, consistency: 500 },
      streak: 4,
      lastActiveDate: YESTERDAY,
      streakShields: 0,
      streakShieldsEarned: 0,
      maxStreakShields: 4,
      streakRestDays: [],
      streakShieldLog: [],
      theme: 'dark-fantasy',
      currentLocation: 'home',
      locationManual: true
    },
    users: [
      { id: 'usr-1', email: '', name: 'Mestre do Foco', provider: 'guest', createdAt: '2026-01-01T00:00:00.000Z', lastLogin: '2026-09-30T20:00:00.000Z' }
    ],
    bossRaid: {
      id: 'boss-legado',
      level: 16,
      name: bossName,
      subtitle: 'Chefe Nível 16 — Supere seus limites com foco total!',
      icon: '🦁',
      maxHp: 2089,
      currentHp: 1296,
      defeated: false,
      rewardCoins,
      rewardXp,
      defeatsCount: 14,
      // Quarta-feira: precisa normalizar para o domingo daquela semana.
      weekStartDate: '2026-09-30'
    },
    bossHistory: [
      { weekKey: '2026-09-06', bossName: 'O Golem do Cansaço Ilusório', level: 14, maxHp: 1899, damageDealt: 1400, defeated: true, defeatedAt: '2026-09-11T23:00:00.000Z', penaltyApplied: false },
      { weekKey: '2026-09-13', bossName: 'O Behemoth do Imediatismo', level: 15, maxHp: 1899, damageDealt: 1200, defeated: false, defeatedAt: null, penaltyApplied: true },
      { weekKey: '2026-09-20', bossName: bossName, level: 15, maxHp: 1899, damageDealt: 1650, defeated: true, defeatedAt: '2026-09-25T22:10:00.000Z', penaltyApplied: false }
    ],
    quests: [
      {
        id: 'q-denuncias',
        title: 'DENÚNCIAS',
        description: 'Fechar o relatório de denúncias',
        category: 'Trabalho',
        priority: 'critico',
        difficulty: 'alta',
        dueDate: '2026-09-10',
        dueTime: null,
        completed: false,
        createdAt: '2026-08-20T12:00:00.000Z',
        subtasks: []
      },
      {
        id: 'q-prazo-futuro',
        title: 'Protocolar a petição',
        description: 'Protocolar antes do fim do prazo',
        category: 'Trabalho',
        priority: 'critico',
        difficulty: 'media',
        dueDate: '2026-10-02',
        completed: false,
        createdAt: '2026-09-20T12:00:00.000Z',
        subtasks: []
      },
      {
        id: 'q-normal',
        title: 'Organizar a estante',
        category: 'Pessoal',
        priority: 'bom_fazer',
        difficulty: 'baixa',
        dueDate: '2026-09-15',
        completed: false,
        createdAt: '2026-09-01T12:00:00.000Z',
        subtasks: []
      }
    ],
    questCategories: [
      { id: 'cat-1', name: 'Trabalho', color: '#38bdf8', icon: 'Briefcase', defaultLocation: 'office' },
      { id: 'cat-2', name: 'Estudos', color: '#a855f7', icon: 'GraduationCap', defaultLocation: 'anywhere' },
      { id: 'cat-3', name: 'Pessoal', color: '#10b981', icon: 'User', defaultLocation: 'anywhere' }
    ],
    habits: habits(),
    actionLogs: legacyLogs(),
    dailyVictories: [
      {
        id: 'dv-1',
        date: TODAY,
        title: 'Ler 20 páginas',
        category: 'Estudos',
        completed: true,
        completedAt: '2026-10-01T13:00:00.000Z',
        createdAt: '2026-10-01T09:00:00.000Z',
        note: ''
      },
      {
        id: 'dv-2',
        date: TODAY,
        title: 'Fechar o relatório',
        category: 'Trabalho',
        completed: false,
        createdAt: '2026-10-01T09:05:00.000Z',
        note: ''
      }
    ],
    dailyVictoryBonuses: {},
    aguPlan: {
      version: 3,
      startedAt: '2026-09-01',
      phase: 'fundacao',
      editalPublished: false,
      keepPortuguese: true,
      capacityByWeekday: { 0: 180, 1: 180, 2: 180, 3: 180, 4: 180, 5: 180, 6: 180 },
      weekdaysMorning: 30,
      dailyBlocks: 3,
      blockMinutes: 30,
      blockQuestionTarget: 10,
      cycleNumber: 2,
      cycleStartDate: '2026-09-15',
      cycleLengthDays: 14,
      horizonMonths: 18,
      targetAccuracy: 90,
      dailyQuestionTarget: 30,
      masterMinSolved: 60,
      staleDays: 21,
      completedBlocks: {},
      blockDurations: { '2026-09-16|constitucional|questoes': 45 },
      topicStatus: {},
      subjectNotes: {},
      currentTopic: {},
      // Ciclo velho (terminou antes de 01/10): a carga precisa arquivar e gerar.
      currentCycle: { number: 2, start: '2026-09-15', end: '2026-09-28', days: [] },
      generatedCycles: [],
      debt: aguDebt(),
      errorNotebook: [],
      discursiveRotationIndex: 0,
      editalProfileId: 'agu-pf-2026',
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-28T22:00:00.000Z'
    },
    examQuestions: [
      {
        id: 'eq-legado-1',
        category: 'Estudos',
        subject: 'Direito Constitucional',
        subjectId: 'constitucional',
        // topicId que não bate com o blockKey: migrateAguExams precisa alinhar.
        topicId: 'topico-errado',
        topic: 'Controle difuso',
        blockKey: '2026-09-29|constitucional|questoes|controle-difuso',
        kind: 'questoes',
        institution: 'Cebraspe',
        totalQuestions: 20,
        correctAnswers: 15,
        wrongAnswers: 5,
        accuracyRate: 75,
        durationMinutes: 40,
        notes: 'Campanha AGU · bloco de questões',
        xpEarned: 140,
        coinsEarned: 12,
        date: '2026-09-29',
        timestamp: '2026-09-29T21:00:00.000Z'
      },
      {
        id: 'eq-legado-2',
        category: 'Estudos',
        subject: 'Direito Administrativo',
        subjectId: 'administrativo',
        topicId: 'regime',
        topic: 'Regime jurídico',
        blockKey: '2026-09-25|administrativo|questoes|regime',
        kind: 'questoes',
        institution: 'Cebraspe',
        totalQuestions: 30,
        correctAnswers: 24,
        wrongAnswers: 6,
        accuracyRate: 80,
        durationMinutes: 55,
        notes: 'Campanha AGU · bloco de questões',
        xpEarned: 220,
        coinsEarned: 17,
        date: '2026-09-25',
        timestamp: '2026-09-25T20:00:00.000Z'
      }
    ],
    mindMaps: [
      {
        id: 'mm-1',
        title: 'Direito Constitucional — Controle de constitucionalidade',
        description: 'Mapa do edital AGU',
        category: 'Direito Constitucional',
        categoryId: null,
        color: '#a855f7',
        nodes: [
          { id: 'n-root', label: 'Controle de constitucionalidade', notes: '', x: 0, y: 0, ease: 2.5, interval: 6, repetitions: 2, dueAt: '2026-10-05', reviewCount: 3 },
          { id: 'n-1', label: 'Difuso', parentId: 'n-root', ease: 2.5, interval: 6, repetitions: 2, dueAt: '2026-10-05', reviewCount: 3 },
          { id: 'n-2', label: 'Concentrado', parentId: 'n-root', ease: 2.5, interval: 6, repetitions: 2, dueAt: '2026-10-05', reviewCount: 3 }
        ],
        links: [],
        braces: [],
        createdAt: '2026-09-05T10:00:00.000Z',
        updatedAt: '2026-09-26T10:00:00.000Z'
      }
    ],
    mindMapSessions: [
      { id: 'mms-1', mapId: 'mm-1', date: '2026-09-26', durationMinutes: 25, reviewed: 3, recalled: 2, accuracy: 67, xpEarned: 45, coinsEarned: 4, createdAt: '2026-09-26T10:30:00.000Z' }
    ],
    readingSessions: [
      { id: 'rs-1', bookId: 'b-1', startPage: 10, endPage: 30, pagesRead: 20, durationMinutes: 30, date: '2026-09-25', createdAt: '2026-09-25T22:00:00.000Z' }
    ],
    books: [
      { id: 'b-1', title: 'Curso de Direito Constitucional', author: 'Autor', totalPages: 900, currentPage: 30, status: 'reading', category: 'Estudos', quotes: [] }
    ],
    processes: [],
    processSteps: [],
    rewards: [
      { id: 'rw-1', title: '1h de videogame', cost: 400, costCoins: 400, category: 'Lazer', icon: 'Gamepad2' }
    ],
    rewardRedemptions: [],
    oracleEnergyReadings: [],
    oracleDecisions: [
      { id: 'od-1', kind: 'quest', entityId: 'q-normal', outcome: 'declined', createdAt: '2026-09-29T12:00:00.000Z', resolvedAt: '2026-09-29T12:05:00.000Z', reason: 'sem tempo' }
    ],
    oracleQuantityReads: [],
    oracleSnoozes: [],
    dailyReviews: [],
    weeklyPlans: [],
    penalties: [],
    liveActivityTimers: {},
    integrations: {},
    ninetyDayGoals: [
      // Histórico preservado: a interface saiu, os dados ficam.
      { id: 'g-1', title: 'Ler 12 livros', status: 'archived', createdAt: '2026-01-01T00:00:00.000Z' }
    ]
    // Sem `maintenance`, sem `destinyChests` e sem `homeostasis`: banco de antes do deploy.
  };
}

function writeFixture(data) {
  const file = path.join(process.env.GRIMORIO_DATA_DIR, 'database.json');
  realWriteFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
  return file;
}

function readPersistedFile() {
  return JSON.parse(fs.readFileSync(getDbFilePath(), 'utf-8'));
}

let server = null;
let port = 0;
let authToken = null;

/** Sessão do dono em memória, como o login criaria. */
function mintSession() {
  authToken = createSession({ id: 'usr-1', email: '', name: 'Mestre do Foco' }).token;
  return authToken;
}

function get(pathname) {
  return new Promise((resolve, reject) => {
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : {};
    const req = http.request({ hostname: '127.0.0.1', port, path: pathname, method: 'GET', headers }, (res) => {
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(body); } catch { /* resposta não-JSON */ }
        resolve({ status: res.statusCode, json, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function loadState() {
  const res = await get('/api/state');
  assert.equal(res.status, 200, `GET /api/state respondeu ${res.status}: ${res.body?.slice(0, 400)}`);
  return res.json;
}

async function firstLoad() {
  console.log(`\n--- Carga 1: primeira leitura depois do deploy (${TODAY} 19:00) ---`);
  const before = dbWrites;
  const state = await loadState();
  const writes = dbWrites - before;
  const db = getDb();

  eq(state.userProfile.level, 16, 'nível do herói preservado');
  eq(state.userProfile.xp, 4380, 'XP do herói preservado (nenhuma recompensa na leitura)');
  eq(state.userProfile.coins, 2232, 'moedas: 2242 − 10 (única punição da primeira carga)');
  eq(state.userProfile.streak, 4, 'sequência preservada pelos logs legados (não zera na derivação)');
  eq(state.userProfile.title, 'Mestre do Conhecimento', 'título preservado');

  eq(db.penalties.length, 1, 'exatamente uma punição na primeira carga');
  const penalty = db.penalties[0];
  eq(penalty.type, 'critical_quest_overdue', 'punição é de missão crítica vencida');
  eq(penalty.entityIds[0], 'q-denuncias', 'punição é da missão DENÚNCIAS');
  eq(penalty.milestone, 1, 'marco 1: a missão já vencida conta do piso da ativação');
  eq(penalty.deltas.willpower, -5, 'marco 1 custa −5 de Vontade');
  eq(penalty.applied.willpower, -5, 'Vontade aplicada: −5');
  eq(penalty.applied.coins, -10, 'moedas aplicadas: −10');
  eq(db.userProfile.stats.willpower, 75, 'Vontade 80 → 75');
  eq(db.userProfile.stats.consistency, 500, 'Consistência intacta');
  eq(db.maintenance.penaltiesSince, TODAY, 'ativação do Julgamento fixada em 01/10 (sem punição retroativa)');

  const penaltiedQuestIds = db.penalties.flatMap((item) => item.entityIds || []);
  ok(!penaltiedQuestIds.includes('q-prazo-futuro'), 'missão crítica com prazo em 02/10 não foi punida');
  ok(!penaltiedQuestIds.includes('q-normal'), 'missão não crítica vencida em 15/09 não foi punida');

  eq(state.bossRaid.level, 16, 'chefe nível 16 preservado');
  eq(state.bossRaid.currentHp, 1296, 'HP vivo do chefe preservado (1296)');
  eq(state.bossRaid.maxHp, 2089, 'HP máximo preservado (2089)');
  eq(state.bossRaid.defeatsCount, 14, 'contador de derrotas preservado');
  eq(state.bossRaid.weekStartDate, '2026-09-27', 'weekStartDate normalizado de quarta (30/09) para o domingo (27/09)');
  eq(state.bossHistory.length, 3, 'histórico do chefe intacto (a semana ainda não virou)');
  eq((state.destinyChests || []).length, 0, 'nenhum baú concedido na leitura de estado');

  eq(state.today.date, TODAY, 'o dia corrente é 01/10');
  const todayVictories = (state.dailyVictories || []).filter((item) => item.date === TODAY);
  eq(todayVictories.length, 2, 'duas vitórias planejadas para hoje');
  eq(todayVictories.filter((item) => item.completed).length, 1, 'uma delas concluída (1/2)');
  eq((state.dailyVictoryBonuses || {})[TODAY], undefined, 'tríade não foi concedida na leitura');

  // AGU: v3 → v4, capacidade 180 vira meta homeostática, dívida podre expira.
  const plan = state.aguPlan;
  eq(plan.version, 4, 'plano AGU migrado para a versão 4');
  eq(plan.homeostasis.seeded, true, 'homeostase de estudo semeada na migração');
  eq(plan.homeostasis.targetMinutes, 180, 'capacidade uniforme de 180 min virou meta de longo prazo');
  ok(plan.homeostasis.setpointMinutes > 0, `setpoint derivado da linha de base (${plan.homeostasis.setpointMinutes} min)`);
  ok(plan.homeostasis.setpointMinutes <= 180, 'setpoint não passa da meta de longo prazo');
  ok(plan.debt.length <= 6, `dívida limitada a 6 entradas (ficou com ${plan.debt.length})`);
  ok(
    plan.debt.every((item) => !item.fromDate || item.fromDate >= '2026-09-10'),
    'dívida com mais de 21 dias expirou na migração'
  );
  const freshCycle = plan.currentCycle;
  ok(freshCycle?.end >= TODAY, `ciclo velho arquivado e ciclo novo gerado (${freshCycle?.start} → ${freshCycle?.end})`);
  ok(plan.generatedCycles.length >= 1, 'ciclo anterior entrou em generatedCycles');

  const exam = state.examQuestions.find((item) => item.id === 'eq-legado-1');
  eq(exam.topicId, 'controle-difuso', 'topicId divergente do blockKey foi alinhado');

  const map = state.mindMaps.find((item) => item.id === 'mm-1');
  eq(map.nodes.length, 3, 'ramos do mapa mental preservados');
  ok(map.nodes.every((node) => node.ease === 2.5), 'ease 2.5 dos ramos preservado');
  ok(map.nodes.every((node) => node.interval === 6), 'intervalo SM-2 preservado');

  ok((state.ninetyDayGoals || []).length === 1, 'histórico de metas de 90 dias preservado no banco');

  const persisted = readPersistedFile();
  eq(persisted.bossRaid.weekStartDate, '2026-09-27', 'normalização do chefe foi gravada em disco');
  eq(persisted.userProfile.coins, 2232, 'punição foi gravada em disco');
  eq(persisted.maintenance.penaltyKeys['quest:q-denuncias:d1'] !== undefined, true, 'chave da punição gravada (não repete)');

  // Uma única gravação: a punição da DENÚNCIAS. Nada mais mudou na leitura.
  eq(writes, 1, 'a primeira carga gravou exatamente uma vez (a punição)');
  return writes;
}

async function sundayLoad() {
  console.log(`\n--- Carga 2: domingo, virada de semana (${SUNDAY} 10:00) ---`);
  CLOCK.at = Date.parse('2026-10-04T10:00:00-03:00');
  // Sessão renovada no novo instante: o deslize de sessão (1x/hora) não entra
  // na contagem, então a gravação medida é só a da manutenção.
  mintSession();

  const db = getDb();
  const coinsBefore = db.userProfile.coins;
  const willpowerBefore = db.userProfile.stats.willpower;
  const historyBefore = db.bossHistory.length;
  const penaltiesBefore = db.penalties.map((item) => item.id);
  const oldBoss = { ...db.bossRaid };

  const before = dbWrites;
  const state = await loadState();
  const writes = dbWrites - before;

  const created = db.penalties.filter((item) => !penaltiesBefore.includes(item.id));
  eq(created.length, 2, 'a virada criou duas punições (chefe + ritual crítico semanal)');

  const bossPenalty = created.find((item) => item.type === 'boss_undefeated');
  ok(bossPenalty, 'semana sem derrotar o chefe gerou a punição do chefe');
  eq(bossPenalty.weekKey, '2026-09-27', 'punição é da semana que fechou (27/09)');
  eq(bossPenalty.deltas.willpower, -10, 'punição do chefe: −10 Vontade');
  eq(bossPenalty.deltas.consistency, -10, 'punição do chefe: −10 Consistência');
  const rawBossCoins = -Math.round(oldBoss.rewardCoins * 0.1);
  const mitigatedBossCoins = applyWillpowerMitigation(rawBossCoins, willpowerBefore).coins;
  eq(rawBossCoins, -63, 'punição do chefe parte de −10% das moedas do baú (−63 de 627)');
  eq(bossPenalty.deltas.coins, mitigatedBossCoins, 'Vontade 75 abate 3% do custo em moedas (−61)');
  eq(bossPenalty.applied.coins, mitigatedBossCoins, 'moedas aplicadas batem com o custo mitigado');

  const habitPenalty = created.find((item) => item.type === 'critical_habit_miss');
  ok(habitPenalty, 'ritual crítico semanal fechou a semana sem execução e gerou punição');
  eq(habitPenalty.entityIds[0], 'hb-semanal-critico', 'punição é do ritual crítico semanal');
  eq(habitPenalty.weekKey, '2026-09-27', 'punição do ritual é da semana que fechou');

  eq(db.bossHistory.length, historyBefore + 1, 'a semana foi fechada uma vez só');
  const closed = db.bossHistory[db.bossHistory.length - 1];
  eq(closed.weekKey, '2026-09-27', 'histórico registra a semana 27/09');
  eq(closed.defeated, false, 'histórico registra que o chefe não caiu');
  eq(closed.damageDealt, 2089 - 1296, 'dano da semana registrado no histórico');
  eq(closed.penaltyApplied, true, 'histórico marca a punição aplicada');

  eq(state.bossRaid.level, 16, 'sem derrota o chefe volta no mesmo nível');
  eq(state.bossRaid.weekStartDate, SUNDAY, 'chefe novo nasce no domingo da semana corrente');
  eq(state.bossRaid.currentHp, state.bossRaid.maxHp, 'chefe novo nasce com HP cheio');
  eq(state.bossRaid.defeated, false, 'chefe novo não nasce derrotado');
  eq(state.bossRaid.defeatsCount, 14, 'contador de derrotas continua 14');
  ok(state.bossRaid.name !== oldBoss.name, `chefe novo tem outro nome (${state.bossRaid.name})`);
  const expectedHp = scaleBossHp(16, db.bossHistory);
  eq(state.bossRaid.maxHp, expectedHp, 'HP do chefe novo vem da média das semanas fechadas');
  ok(
    state.bossRaid.maxHp >= Math.round(catalogBossHp(16) * 0.5) && state.bossRaid.maxHp <= catalogBossHp(16) * 2,
    'HP do chefe novo fica entre 50% e 200% do catálogo'
  );

  const bossCoins = bossPenalty.applied.coins + habitPenalty.applied.coins;
  eq(db.userProfile.coins, coinsBefore + bossCoins, 'moedas descontam exatamente o custo das punições');
  eq(db.userProfile.streak, 0, 'quatro dias sem ação produtiva encerram a sequência de 4');
  eq(db.maintenance.lastWeeklyRun, SUNDAY, 'última virada semanal registrada em 04/10');
  eq(writes, 1, 'a virada gravou exatamente uma vez (fechamento da semana + punições)');

  // Repetição no mesmo instante: nada muda e nada é gravado.
  console.log('\n--- Carga 3: mesma leitura, mesmo instante (idempotência) ---');
  const snapshot = {
    penalties: db.penalties.length,
    history: db.bossHistory.length,
    coins: db.userProfile.coins,
    streak: db.userProfile.streak,
    bossHp: db.bossRaid.currentHp,
    bossWeek: db.bossRaid.weekStartDate,
    keys: Object.keys(db.maintenance.penaltyKeys).length
  };
  const beforeRepeat = dbWrites;
  const repeat = await loadState();
  const repeatWrites = dbWrites - beforeRepeat;
  eq(repeatWrites, 0, 'leitura repetida não grava nada (manutenção é barata e idempotente)');
  eq(db.penalties.length, snapshot.penalties, 'leitura repetida não cria punição');
  eq(db.bossHistory.length, snapshot.history, 'leitura repetida não fecha a semana de novo');
  eq(db.userProfile.coins, snapshot.coins, 'leitura repetida não mexe nas moedas');
  eq(db.userProfile.streak, snapshot.streak, 'leitura repetida não mexe na sequência');
  eq(db.bossRaid.currentHp, snapshot.bossHp, 'leitura repetida não mexe no chefe');
  eq(db.bossRaid.weekStartDate, snapshot.bossWeek, 'leitura repetida não mexe na semana do chefe');
  eq(Object.keys(db.maintenance.penaltyKeys).length, snapshot.keys, 'leitura repetida não cria chaves de punição');
  ok(repeat.maintenance.created.length === 0, 'relatório da manutenção repetida vem vazio');
  eq(repeat.maintenance.changed, false, 'relatório da manutenção repetida se declara sem mudanças');
}

function checkStreakFallbacks() {
  console.log('\n--- Sequência: ledger sem dados não zera o que já foi conquistado ---');
  const hero = {
    userProfile: {
      streak: 4,
      lastActiveDate: YESTERDAY,
      streakShields: 0,
      streakShieldsEarned: 0,
      maxStreakShields: 4,
      streakRestDays: [],
      streakShieldLog: [],
      stats: { consistency: 500, willpower: 75, wisdom: 250, focus: 1398 }
    },
    actionLogs: []
  };
  const derived = syncHeroStreak(hero, { today: TODAY, now: new Date() });
  eq(hero.userProfile.streak, 4, 'ledger sem datas mantém a sequência salva (último dia ativo foi ontem)');
  eq(derived.streak, 4, 'o resultado da derivação também devolve 4');

  const stale = {
    userProfile: { ...hero.userProfile, streak: 9, lastActiveDate: '2026-09-01' },
    actionLogs: []
  };
  syncHeroStreak(stale, { today: TODAY, now: new Date() });
  eq(stale.userProfile.streak, 0, 'sequência antiga sem atividade recente realmente cai para 0');
}

async function run() {
  console.log('🧪 Primeira carga em produção — banco legado de setembro\n');
  const raw = fixture();
  writeFixture(raw);
  console.log('  · banco de fixture gravado (sem maintenance, sem destinyChests, AGU v3)');

  await initDb();
  // Sessão do dono em memória (mesma que o login criaria). A gravação que
  // createSession dispara é desfeita logo abaixo: a fixture volta crua para o
  // disco, para que a PRIMEIRA leitura de /api/state seja a primeira gravação.
  mintSession();
  writeFixture(raw);

  const app = createApp();
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      port = server.address().port;
      resolve();
    });
  });

  try {
    await firstLoad();

    // Relê do disco: é o que o processo faria depois de um restart no deploy.
    const persisted = readPersistedFile();
    __resetDbCacheForTests();
    const reloaded = getDb();
    eq(reloaded.userProfile.coins, persisted.userProfile.coins, 'recarregar do disco preserva as moedas');
    eq(reloaded.bossRaid.weekStartDate, '2026-09-27', 'recarregar do disco preserva a semana do chefe');
    eq(reloaded.aguPlan.version, 4, 'recarregar do disco preserva a migração do plano AGU');
    eq(reloaded.userProfile.streak, 4, 'recarregar do disco preserva a sequência');

    await sundayLoad();
    checkStreakFallbacks();
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
  }

  console.log('\n✅ Primeira carga: banco legado migra, pune uma vez e não regrava à toa.\n');
}

run().catch((err) => {
  console.error('\n❌ Falhou:', err.message);
  if (err.actual !== undefined) {
    console.error(`   esperado: ${JSON.stringify(err.expected)}\n   recebido: ${JSON.stringify(err.actual)}`);
  }
  console.error(err.stack?.split('\n').slice(1, 6).join('\n'));
  process.exit(1);
});
