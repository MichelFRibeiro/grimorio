/**
 * Julgamento do Grimório.
 *
 * Cada punição vira um registro em db.penalties e um actionLog type 'penalty'
 * com deltas negativos no ledger. XP nunca cai (punição não desce nível).
 * Atributos e moedas têm piso 0. Contestar em 24h estorna pelo ledger
 * (máximo 2 contestações por semana).
 *
 * Nada antes de db.maintenance.penaltiesSince é julgado — a ativação da
 * função não pune o histórico antigo.
 */

import { addDaysToDateStr, getSaoPauloDateStr } from '../timeUtils.js';
import { getWeekBounds } from '../rankings.js';
import { willpowerPenaltyMitigation } from './attributes.js';
import { emptyDaysInWeek } from './bossWeek.js';
import {
  canonicalizeHabitFrequency,
  getHabitDueStatus,
  getHabitPeriodStatus,
  getHabitWeekDays,
  isPeriodFrequency
} from '../../src/utils/habitFrequency.js';

export const PENALTY_CONTEST_WINDOW_MS = 24 * 60 * 60 * 1000;
export const PENALTY_CONTEST_WEEKLY_LIMIT = 2;
export const HABIT_MISS_CONSISTENCY = 5;
export const HABIT_MISS_WEEKLY_CAP = 20;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function penaltyId(prefix = 'pen') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function ensurePenaltyState(db, today = getSaoPauloDateStr()) {
  if (!db.maintenance || typeof db.maintenance !== 'object') db.maintenance = {};
  if (!db.maintenance.penaltyKeys || typeof db.maintenance.penaltyKeys !== 'object') {
    db.maintenance.penaltyKeys = {};
  }
  if (!Array.isArray(db.penalties)) db.penalties = [];
  if (!DATE_RE.test(String(db.maintenance.penaltiesSince || ''))) {
    db.maintenance.penaltiesSince = today;
  }
  return db.maintenance;
}

export function isOnOrAfterActivation(dateStr, since) {
  return DATE_RE.test(String(dateStr || '')) && DATE_RE.test(String(since || '')) && dateStr >= since;
}

/**
 * Piso de contagem do atraso: a véspera da ativação.
 *
 * Uma missão que já estava vencida quando o Julgamento nasceu não pode ser
 * cobrada pelo atraso antigo — mas também não pode escapar para sempre. O
 * atraso dela passa a contar do piso, então no dia da ativação ela entra no
 * marco 1 e escala 1 → 3 → 7 como qualquer outra. Sem o piso, uma missão
 * vencida em 10/09 cairia direto no marco 21 (−50 moedas / −20 Vontade).
 */
export function penalizableFrom(since) {
  if (!DATE_RE.test(String(since || ''))) return null;
  return addDaysToDateStr(since, -1);
}

/** Marcos de atraso: dia 1, dia 3, dia 7 e depois a cada 7. */
export function overdueMilestone(daysLate) {
  const days = Math.max(0, Math.floor(Number(daysLate) || 0));
  if (days >= 7 && (days - 7) % 7 === 0) return days;
  if (days === 1 || days === 3) return days;
  return null;
}

export function criticalQuestPenaltyDeltas(daysLate) {
  if (daysLate >= 7) return { willpower: -20, coins: -50 };
  if (daysLate >= 3) return { willpower: -10, coins: -25 };
  return { willpower: -5, coins: -10 };
}

function daysBetween(fromStr, toStr) {
  const [fy, fm, fd] = fromStr.split('-').map(Number);
  const [ty, tm, td] = toStr.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
}

export function applyWillpowerMitigation(coinsCost, willpower) {
  const cost = Math.abs(Math.round(finite(coinsCost, 0)));
  const rate = willpowerPenaltyMitigation(willpower);
  const waived = Math.round(cost * rate);
  return { coins: -(cost - waived), coinsWaived: waived, mitigation: rate };
}

export function createPenalty({
  type,
  date,
  weekKey = null,
  title,
  description,
  advice = [],
  lessons = [],
  deltas = {},
  entityIds = [],
  actions = [],
  milestone = null
}) {
  const coinHit = applyCoinFloorIntent(deltas);
  return {
    id: penaltyId(),
    type,
    date,
    weekKey,
    title,
    description,
    advice: Array.isArray(advice) ? advice : [advice].filter(Boolean),
    lessons: Array.isArray(lessons) ? lessons : [],
    deltas: {
      willpower: finite(coinHit.willpower, 0),
      consistency: finite(coinHit.consistency, 0),
      focus: finite(coinHit.focus, 0),
      wisdom: finite(coinHit.wisdom, 0),
      coins: finite(coinHit.coins, 0),
      xp: 0
    },
    entityIds: entityIds.filter(Boolean),
    actions: Array.isArray(actions) ? actions : [],
    milestone,
    acknowledgedAt: null,
    contestedAt: null,
    contestReason: null,
    createdAt: new Date().toISOString()
  };
}

function applyCoinFloorIntent(deltas) {
  return {
    willpower: finite(deltas.willpower, 0),
    consistency: finite(deltas.consistency, 0),
    focus: finite(deltas.focus, 0),
    wisdom: finite(deltas.wisdom, 0),
    coins: Math.min(0, Math.round(finite(deltas.coins, 0))),
    xp: 0
  };
}

export function questAdvice(quest) {
  return [
    'Quebre a missão no primeiro passo de 10 minutos — o julgamento cobra a largada, não a obra inteira.',
    'Remarque com honestidade se a data era fantasia. Prazo mentiroso vira atraso crônico.',
    'Faça só o primeiro item hoje. Missão crítica vencida não se recupera de uma vez.'
  ].concat(quest?.title ? [`Missão: ${quest.title}`] : []);
}

export function questActions(quest) {
  return [
    { id: 'breakdown', label: 'Quebrar em passos', questId: quest?.id || null },
    { id: 'reschedule', label: 'Remarcar com honestidade', questId: quest?.id || null },
    { id: 'plan-victory', label: 'Planejar vitória de amanhã', questId: quest?.id || null }
  ];
}

export function evaluateCriticalQuests(db, today, { since, keys }) {
  const created = [];
  (db.quests || []).forEach((quest) => {
    if (!quest || quest.completed) return;
    if (quest.priority !== 'critico') return;
    if (!DATE_RE.test(String(quest.dueDate || ''))) return;
    if (quest.dueDate >= today) return;
    // O atraso conta do prazo ou do piso da ativação, o que for mais recente.
    // Ver penalizableFrom(): missão já vencida entra no marco 1 da ativação em
    // vez de cair direto no marco 21 — sem punição retroativa e sem impunidade.
    const floor = penalizableFrom(since) || quest.dueDate;
    const countedFrom = quest.dueDate > floor ? quest.dueDate : floor;
    if (countedFrom >= today) return;
    const late = daysBetween(countedFrom, today);
    const milestone = overdueMilestone(late);
    if (!milestone) return;
    const milestoneDate = addDaysToDateStr(countedFrom, milestone);
    if (!isOnOrAfterActivation(milestoneDate, since)) return;
    const key = `quest:${quest.id}:d${milestone}`;
    if (keys[key]) return;
    const raw = criticalQuestPenaltyDeltas(milestone);
    const mitigated = applyWillpowerMitigation(raw.coins, db.userProfile?.stats?.willpower);
    const penalty = createPenalty({
      type: 'critical_quest_overdue',
      date: milestoneDate,
      weekKey: getWeekBounds(today).weekKey,
      title: `Missão crítica vencida: ${quest.title || 'sem título'}`,
      description: `A missão crítica passou do prazo em ${milestone} dia${milestone === 1 ? '' : 's'} (venceu em ${quest.dueDate.split('-').reverse().join('/')}).`,
      advice: questAdvice(quest),
      lessons: [
        'Prioridade crítica sem data honesta é só ansiedade com número.',
        'O atraso cobra Vontade e moedas — e escala no 1º, 3º e 7º dia.'
      ],
      deltas: { willpower: raw.willpower, coins: mitigated.coins },
      entityIds: [quest.id],
      actions: questActions(quest),
      milestone
    });
    penalty.mitigation = mitigated;
    created.push({ key, penalty });
  });
  return created;
}

export function bossDefeatAdvice(boss, emptyDays) {
  const dealt = Math.max(0, (boss?.maxHp || 0) - (boss?.currentHp || 0));
  const emptyLabel = emptyDays.length
    ? `Dias sem ação produtiva: ${emptyDays.map((d) => d.slice(8)).join(', ')}.`
    : 'Não houve dia vazio — o dano é que não chegou.';
  return [
    `Dano desferido: ${dealt} de ${boss?.maxHp || 0} HP.`,
    emptyLabel,
    'Escolha três vitórias para a próxima semana antes de abrir o feed.',
    'Uma ação produtiva por dia já evita a semana vazia. O chefe cai com constância, não com heroísmo de domingo.'
  ];
}

export function evaluateBossWeekPenalty(db, weekKey, boss, { since, keys }) {
  const weekEnd = addDaysToDateStr(weekKey, 6);
  if (!isOnOrAfterActivation(weekEnd, since)) return [];
  const key = `boss:${weekKey}`;
  if (keys[key]) return [];
  const rawCoins = -Math.round((boss?.rewardCoins || 0) * 0.1);
  const mitigated = applyWillpowerMitigation(rawCoins, db.userProfile?.stats?.willpower);
  const emptyDays = emptyDaysInWeek(db.actionLogs || [], weekKey);
  const penalty = createPenalty({
    type: 'boss_undefeated',
    date: weekEnd,
    weekKey,
    title: `Semana sem derrotar o chefe: ${boss?.name || 'Chefe'}`,
    description: `A semana de ${weekKey} fechou com o chefe nível ${boss?.level || 1} ainda de pé.`,
    advice: bossDefeatAdvice(boss, emptyDays),
    lessons: [
      'Chefe semanal não perdoa semana vazia: o mesmo nível volta, com HP novo.',
      'A punição é 10% das moedas do baú, −10 Vontade e −10 Consistência.'
    ],
    deltas: {
      coins: mitigated.coins,
      willpower: -10,
      consistency: -10
    },
    entityIds: [boss?.id].filter(Boolean),
    actions: [
      { id: 'plan-victory', label: 'Planejar vitória de amanhã' },
      { id: 'open-rituals', label: 'Abrir Ritual' }
    ]
  });
  penalty.mitigation = mitigated;
  penalty.emptyDays = emptyDays;
  return [{ key, penalty }];
}

function habitMissedDaily(habit, dateStr) {
  const status = getHabitDueStatus(habit, null, dateStr, dateStr);
  if (!status.scheduledToday && !status.due) return false;
  const history = Array.isArray(habit.history) ? habit.history : [];
  return !history.includes(dateStr);
}

function habitWeeklyTarget(habit) {
  const freq = canonicalizeHabitFrequency(habit?.frequency || 'daily');
  if (freq === 'weekdays') return 5;
  if (freq === 'weekly') return 1;
  if (freq === 'times_per_week') {
    const days = getHabitWeekDays(habit);
    return days?.length || Math.max(1, Math.min(7, parseInt(habit.targetTimesPerWeek || habit.timesPerWeek, 10) || 3));
  }
  return 7;
}

export function evaluateCriticalHabits(db, today, { since, keys, weeksJustClosed = [] }) {
  const created = [];
  const yesterday = addDaysToDateStr(today, -1);
  (db.habits || []).forEach((habit) => {
    if (!habit || habit.priority !== 'critico') return;
    const freq = canonicalizeHabitFrequency(habit.frequency || 'daily');
    const history = Array.isArray(habit.history) ? habit.history : [];

    if (freq === 'daily' || freq === 'weekdays') {
      if (!isOnOrAfterActivation(yesterday, since)) return;
      const due = getHabitDueStatus(habit, null, yesterday, yesterday);
      if (!(due.scheduledToday || due.due)) return;
      if (history.includes(yesterday)) return;
      const key = `habit:${habit.id}:${yesterday}`;
      if (keys[key]) return;
      created.push({
        key,
        penalty: habitMissPenalty(db, habit, yesterday, `O ritual crítico não foi feito em ${yesterday.split('-').reverse().join('/')}.`)
      });
      return;
    }

    if (isPeriodFrequency(freq)) {
      const period = getHabitPeriodStatus(habit, yesterday);
      if (!period || period.completed) return;
      if (period.end !== yesterday && period.end >= today) return;
      if (!isOnOrAfterActivation(period.end, since)) return;
      const key = `habit:${habit.id}:period:${period.start}`;
      if (keys[key]) return;
      created.push({
        key,
        penalty: habitMissPenalty(db, habit, period.end, `O período crítico (${period.start} a ${period.end}) fechou sem o ritual.`)
      });
      return;
    }

    if ((freq === 'weekly' || freq === 'times_per_week') && weeksJustClosed.length) {
      weeksJustClosed.forEach((weekJustClosed) => {
        const weekEnd = addDaysToDateStr(weekJustClosed, 6);
        if (!isOnOrAfterActivation(weekEnd, since)) return;
        const target = habitWeeklyTarget(habit);
        const done = history.filter((date) => date >= weekJustClosed && date <= weekEnd).length;
        if (done >= target) return;
        const key = `habit:${habit.id}:week:${weekJustClosed}`;
        if (keys[key]) return;
        created.push({
          key,
          penalty: habitMissPenalty(
            db,
            habit,
            weekEnd,
            `A semana fechou com ${done}/${target} execuções do ritual crítico.`
          )
        });
      });
    }
  });
  return created;
}

function habitMissPenalty(db, habit, date, description) {
  const already = (db.penalties || [])
    .filter((item) => item && item.type === 'critical_habit_miss' && item.weekKey === getWeekBounds(date).weekKey && !item.contestedAt)
    .reduce((sum, item) => sum + Math.abs(finite(item.deltas?.consistency, 0)), 0);
  const hit = Math.max(0, Math.min(HABIT_MISS_CONSISTENCY, HABIT_MISS_WEEKLY_CAP - already));
  return createPenalty({
    type: 'critical_habit_miss',
    date,
    weekKey: getWeekBounds(date).weekKey,
    title: `Ritual crítico falhou: ${habit.title || 'sem título'}`,
    description,
    advice: [
      'Abra o ritual e faça a versão mínima hoje — dois minutos contam mais do que o plano perfeito.',
      'Se a frequência está mentindo (dias que você nunca cumpre), ajuste a agenda em vez de acumular falta.',
      'Ritual crítico tem teto de −20 Consistência por semana. Não deixe a semana inteira virar falta.'
    ],
    lessons: ['Consistência cai quando o ritual crítico perde o período previsto.'],
    deltas: { consistency: -hit },
    entityIds: [habit.id],
    actions: [{ id: 'open-rituals', label: 'Abrir Ritual', habitId: habit.id }]
  });
}

export function evaluateDailyDefeat(db, today, { since, keys }) {
  const yesterday = addDaysToDateStr(today, -1);
  if (!isOnOrAfterActivation(yesterday, since)) return [];
  const key = `defeat:${yesterday}`;
  if (keys[key]) return [];
  const planned = (db.dailyVictories || []).filter((item) => item && item.date === yesterday);
  if (!planned.length) return [];
  const done = planned.filter((item) => item.completed).length;
  if (done > 0) return [];
  const mitigated = applyWillpowerMitigation(0, db.userProfile?.stats?.willpower);
  const penalty = createPenalty({
    type: 'daily_defeat',
    date: yesterday,
    weekKey: getWeekBounds(yesterday).weekKey,
    title: 'Derrota do dia',
    description: `${planned.length} vitória${planned.length === 1 ? '' : 's'} planejada${planned.length === 1 ? '' : 's'} para ${yesterday.split('-').reverse().join('/')} e nenhuma concluída.`,
    advice: [
      'Planeje no máximo três vitórias, e que a primeira caiba em dez minutos.',
      'Se o dia estava perdido de manhã, remarque antes do anoitecer — derrota é zero de N, não “quase”.',
      'Amanhã começa com uma vitória já escrita, não com a lista de ontem.'
    ],
    lessons: ['Dia com plano e zero execução custa 5 de Vontade.'],
    deltas: { willpower: -5 },
    entityIds: planned.map((item) => item.id),
    actions: [{ id: 'plan-victory', label: 'Planejar vitória de amanhã' }],
    milestone: null
  });
  penalty.mitigation = mitigated;
  return [{ key, penalty }];
}

export function listUnacknowledged(db) {
  return (db.penalties || []).filter((item) => item && !item.acknowledgedAt && !item.contestedAt);
}

export function contestsThisWeek(db, weekKey) {
  return (db.penalties || []).filter((item) => item && item.contestedAt && item.weekKey === weekKey).length;
}

export function acknowledgePenalty(db, id, { now = new Date() } = {}) {
  const penalty = (db.penalties || []).find((item) => item && item.id === id);
  if (!penalty) return { error: 'Julgamento não encontrado.', status: 404 };
  if (!penalty.acknowledgedAt) penalty.acknowledgedAt = now.toISOString();
  return { penalty };
}

export function acknowledgeAllPenalties(db, { now = new Date() } = {}) {
  const pending = listUnacknowledged(db);
  const at = now.toISOString();
  pending.forEach((item) => { item.acknowledgedAt = at; });
  return { acknowledged: pending.length, penalties: pending };
}

/**
 * Contestar em 24h estorna pelo ledger. Limite de 2 por semana.
 * O chamador faz o revertLog — aqui só valida e marca.
 */
export function prepareContest(db, id, reason, { now = new Date() } = {}) {
  const penalty = (db.penalties || []).find((item) => item && item.id === id);
  if (!penalty) return { error: 'Julgamento não encontrado.', status: 404 };
  if (penalty.contestedAt) return { error: 'Este julgamento já foi contestado.', status: 409 };
  const text = String(reason || '').trim();
  if (text.length < 3) return { error: 'Diga o motivo da contestação.', status: 400 };
  const created = new Date(penalty.createdAt || 0).getTime();
  if (!Number.isFinite(created) || now.getTime() - created > PENALTY_CONTEST_WINDOW_MS) {
    return { error: 'O prazo de 24h para contestar já passou.', status: 409 };
  }
  const weekKey = penalty.weekKey || getWeekBounds(now).weekKey;
  if (contestsThisWeek(db, weekKey) >= PENALTY_CONTEST_WEEKLY_LIMIT) {
    return { error: 'Limite de 2 contestações nesta semana.', status: 409 };
  }
  return { penalty, reason: text.slice(0, 280), weekKey };
}

export { habitMissedDaily };
