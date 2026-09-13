/**
 * Metas de 90 dias — decomposição em ciclos de 30, 15 e 7 dias,
 * interpretação de metas quantitativas e compilação de progresso.
 *
 * 90 dias civis (startDate .. startDate+89):
 *   3 meses de 30 dias, 6 quinzenas de 15 dias, 12 semanas de 7 dias
 *   (os 6 dias finais 77–89 ficam na 12ª semana).
 */

import { addDaysToDateStr, daysBetweenDateStr, getSaoPauloDateStr } from './timeUtils.js';

export const MAX_ACTIVE_NINETY_DAY_GOALS = 3;
export const NINETY_DAY_SPAN = 90;
export const NINETY_DAY_LAST_OFFSET = NINETY_DAY_SPAN - 1;

export const CYCLE_DEFS = {
  month: { key: 'month', count: 3, days: 30, label: 'Mês', plural: 'Meses' },
  fortnight: { key: 'fortnight', count: 6, days: 15, label: 'Quinzena', plural: 'Quinzenas' },
  week: { key: 'week', count: 12, days: 7, label: 'Semana', plural: 'Semanas' }
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

const REDUCE_VERBS = [
  'perder', 'emagrecer', 'reduzir', 'diminuir', 'cortar', 'quitar',
  'eliminar', 'baixar', 'drop', 'pagar'
];

const UNIT_RULES = [
  { re: /quilogramas?|quilos?|kilos?|kgs?\b/i, unit: 'kg', label: 'kg' },
  { re: /gramas?|\bg\b/i, unit: 'g', label: 'g' },
  { re: /quil[oô]metros?|\bkms?\b|\bkm\b/i, unit: 'km', label: 'km' },
  { re: /metros?|\bm\b/i, unit: 'm', label: 'm' },
  { re: /horas?|\bhrs?\b|\bh\b/i, unit: 'horas', label: 'horas' },
  { re: /minutos?|\bmins?\b/i, unit: 'minutos', label: 'minutos' },
  { re: /p[aá]ginas?|\bp[aá]gs?\b/i, unit: 'paginas', label: 'páginas' },
  { re: /livros?/i, unit: 'livros', label: 'livros' },
  { re: /quest[oõ]es?|\bqs?\b/i, unit: 'questoes', label: 'questões' },
  { re: /aulas?/i, unit: 'aulas', label: 'aulas' },
  { re: /cap[ií]tulos?/i, unit: 'capitulos', label: 'capítulos' },
  { re: /reais?|r\$/i, unit: 'reais', label: 'reais' },
  { re: /vezes?/i, unit: 'vezes', label: 'vezes' },
  { re: /dias?/i, unit: 'dias', label: 'dias' },
  { re: /semanas?/i, unit: 'semanas', label: 'semanas' },
  { re: /palavras?/i, unit: 'palavras', label: 'palavras' },
  { re: /processos?/i, unit: 'processos', label: 'processos' }
];

export function uidNinety(prefix = 'g90') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function occupiesNinetyDayGoalSlot(goal) {
  if (!goal) return false;
  return goal.status === 'active' || goal.status === 'expired';
}

export function countOccupiedNinetyDayGoalSlots(goals = []) {
  return (goals || []).filter(occupiesNinetyDayGoalSlot).length;
}

export function roundAmount(value) {
  if (!Number.isFinite(value)) return 0;
  if (Number.isInteger(value)) return value;
  return Math.round(value * 1000) / 1000;
}

export function parseAmountNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const text = String(raw).trim().replace(/\s/g, '');
  if (!text) return null;
  const normalized = text.includes(',') && text.includes('.')
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function detectUnit(text = '') {
  const source = String(text || '');
  for (const rule of UNIT_RULES) {
    if (rule.re.test(source)) return { unit: rule.unit, unitLabel: rule.label };
  }
  return { unit: '', unitLabel: '' };
}

function detectDirection(text = '') {
  const lower = String(text || '').toLowerCase();
  return REDUCE_VERBS.some(verb => lower.includes(verb)) ? 'reduce' : 'accumulate';
}

/**
 * Interpreta um enunciado de meta ("Quero perder 9 quilos", "estudar 180 horas").
 */
export function parseGoalText(text = '') {
  const source = String(text || '').trim();
  const empty = {
    title: source,
    amount: null,
    unit: '',
    unitLabel: '',
    direction: 'accumulate',
    verb: ''
  };
  if (!source) return empty;

  const direction = detectDirection(source);
  const lower = source.toLowerCase();
  const verb = REDUCE_VERBS.find(v => lower.includes(v)) || '';
  const cleaned = source.replace(/\b(90\s*dias?|3\s*meses?|12\s*semanas?|6\s*quinzenas?)\b/gi, ' ');

  const match = cleaned.match(/(-?\d+(?:[.,]\d+)?)\s*([a-zA-ZÀ-ÿ$]+)?/);
  if (!match) {
    const unitOnly = detectUnit(source);
    return { ...empty, ...unitOnly, direction, verb };
  }

  const amount = parseAmountNumber(match[1]);
  const trailing = `${match[2] || ''} ${source.slice(match.index + match[0].length)}`.trim();
  const detected = detectUnit(trailing);
  const fallback = detectUnit(source);
  const unit = detected.unit || fallback.unit;
  const unitLabel = detected.unitLabel || fallback.unitLabel;

  return {
    title: source,
    amount,
    unit,
    unitLabel,
    direction,
    verb
  };
}

export function splitEven(total, parts) {
  const n = Math.max(1, parts | 0);
  const target = roundAmount(Number(total) || 0);
  const amounts = [];
  let allocated = 0;
  const slice = roundAmount(target / n);
  for (let i = 0; i < n; i += 1) {
    if (i === n - 1) {
      amounts.push(roundAmount(target - allocated));
    } else {
      amounts.push(slice);
      allocated = roundAmount(allocated + slice);
    }
  }
  return amounts;
}

export function formatNumberPt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(n);
}

export function formatDateBr(dateStr, { withYear = false } = {}) {
  if (!DATE_ONLY_RE.test(dateStr || '')) return dateStr || '';
  const [year, month, day] = dateStr.split('-');
  return withYear ? `${day}/${month}/${year}` : `${day}/${month}`;
}

export function formatGoalAmount(amount, unit = '', unitLabel = '') {
  const n = Number(amount) || 0;
  const abs = Math.abs(n);
  if (unit === 'kg' && abs > 0 && abs < 1) {
    return `${formatNumberPt(roundAmount(n * 1000))} g`;
  }
  if (unit === 'horas' || unit === 'h') {
    return `${formatNumberPt(n)} ${Math.abs(n) === 1 ? 'hora' : 'horas'}`;
  }
  if (unit === 'minutos') {
    return `${formatNumberPt(n)} ${Math.abs(n) === 1 ? 'minuto' : 'minutos'}`;
  }
  const label = unitLabel || unit || '';
  return label ? `${formatNumberPt(n)} ${label}` : formatNumberPt(n);
}

function cycleDateRange(startDate, index, days, count) {
  const offsetStart = index * days;
  const isLast = index === count - 1;
  const offsetEnd = isLast ? NINETY_DAY_LAST_OFFSET : Math.min(NINETY_DAY_LAST_OFFSET, (index + 1) * days - 1);
  return {
    startDate: addDaysToDateStr(startDate, offsetStart),
    endDate: addDaysToDateStr(startDate, offsetEnd)
  };
}

export function buildCycles(startDate, targetAmount) {
  const cycles = { month: [], fortnight: [], week: [] };
  for (const def of Object.values(CYCLE_DEFS)) {
    const targets = splitEven(targetAmount, def.count);
    cycles[def.key] = targets.map((target, index) => {
      const range = cycleDateRange(startDate, index, def.days, def.count);
      return {
        id: `${def.key}-${index + 1}`,
        index: index + 1,
        startDate: range.startDate,
        endDate: range.endDate,
        targetAmount: target,
        currentAmount: 0,
        completed: false
      };
    });
  }
  return cycles;
}

export function offsetForDate(startDate, dateStr) {
  if (!DATE_ONLY_RE.test(startDate || '') || !DATE_ONLY_RE.test(dateStr || '')) return null;
  return daysBetweenDateStr(startDate, dateStr);
}

export function cycleIndexForOffset(offset, def) {
  if (offset == null || offset < 0 || offset > NINETY_DAY_LAST_OFFSET) return null;
  return Math.min(def.count - 1, Math.floor(offset / def.days));
}

export function findCyclesForDate(goal, dateStr) {
  const offset = offsetForDate(goal.startDate, dateStr);
  if (offset == null || offset < 0 || offset > NINETY_DAY_LAST_OFFSET) return null;
  return {
    offset,
    week: cycleIndexForOffset(offset, CYCLE_DEFS.week),
    fortnight: cycleIndexForOffset(offset, CYCLE_DEFS.fortnight),
    month: cycleIndexForOffset(offset, CYCLE_DEFS.month)
  };
}

function resetCycleProgress(goal) {
  goal.currentAmount = 0;
  ['week', 'fortnight', 'month'].forEach((key) => {
    (goal.cycles?.[key] || []).forEach((cycle) => {
      cycle.currentAmount = 0;
      cycle.completed = false;
    });
  });
}

function markCyclesCompleted(goal) {
  ['week', 'fortnight', 'month'].forEach((key) => {
    (goal.cycles?.[key] || []).forEach((cycle) => {
      cycle.completed = (Number(cycle.currentAmount) || 0) + 1e-9 >= (Number(cycle.targetAmount) || 0)
        && (Number(cycle.targetAmount) || 0) > 0;
    });
  });
}

export function recomputeNinetyDayGoal(goal, today = getSaoPauloDateStr()) {
  if (!goal) return goal;
  const logs = [...(goal.logs || [])].sort((a, b) => {
    const da = a.date || '';
    const db = b.date || '';
    if (da !== db) return da.localeCompare(db);
    return String(a.timestamp || '').localeCompare(String(b.timestamp || ''));
  });

  resetCycleProgress(goal);
  let completedAt = null;

  logs.forEach((log) => {
    const amount = roundAmount(Number(log.amount) || 0);
    const dateStr = log.date;
    const found = findCyclesForDate(goal, dateStr);
    if (!found) return;
    const week = goal.cycles.week[found.week];
    const fortnight = goal.cycles.fortnight[found.fortnight];
    const month = goal.cycles.month[found.month];
    week.currentAmount = roundAmount((week.currentAmount || 0) + amount);
    fortnight.currentAmount = roundAmount((fortnight.currentAmount || 0) + amount);
    month.currentAmount = roundAmount((month.currentAmount || 0) + amount);
    goal.currentAmount = roundAmount((goal.currentAmount || 0) + amount);
    log.weekIndex = found.week + 1;
    log.fortnightIndex = found.fortnight + 1;
    log.monthIndex = found.month + 1;
    if (!completedAt && goal.currentAmount + 1e-9 >= (goal.targetAmount || 0) && (goal.targetAmount || 0) > 0) {
      completedAt = log.timestamp || `${dateStr}T12:00:00.000Z`;
    }
  });

  markCyclesCompleted(goal);
  goal.logs = [...(goal.logs || [])].sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));

  if (goal.status === 'archived') return goal;

  if ((goal.targetAmount || 0) > 0 && goal.currentAmount + 1e-9 >= goal.targetAmount) {
    goal.status = 'completed';
    goal.completedAt = completedAt || goal.completedAt || new Date().toISOString();
  } else if (today > goal.endDate) {
    goal.status = 'expired';
    goal.completedAt = null;
  } else {
    goal.status = 'active';
    goal.completedAt = null;
  }

  return goal;
}

function paceStatus(current, expected, target, status) {
  if (status === 'completed' || ((target || 0) > 0 && current + 1e-9 >= target)) return 'completed';
  if (expected <= 0) return current > 0 ? 'ahead' : 'on_track';
  if (current + 1e-9 >= expected * 1.08) return 'ahead';
  if (current + 1e-9 >= expected * 0.92) return 'on_track';
  return 'behind';
}

export function enrichNinetyDayGoal(goal, today = getSaoPauloDateStr()) {
  if (!goal) return goal;
  const elapsedRaw = daysBetweenDateStr(goal.startDate, today) + 1;
  const daysElapsed = Math.max(0, Math.min(NINETY_DAY_SPAN, elapsedRaw));
  const daysLeft = Math.max(0, daysBetweenDateStr(today, goal.endDate));
  const inWindow = today >= goal.startDate && today <= goal.endDate;
  const expectedAmount = roundAmount(((goal.targetAmount || 0) * daysElapsed) / NINETY_DAY_SPAN);
  const percent = (goal.targetAmount || 0) > 0
    ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 1000) / 10)
    : 0;
  const found = inWindow ? findCyclesForDate(goal, today) : findCyclesForDate(goal, today > goal.endDate ? goal.endDate : goal.startDate);
  const currentWeek = found ? goal.cycles.week[found.week] : null;
  const currentFortnight = found ? goal.cycles.fortnight[found.fortnight] : null;
  const currentMonth = found ? goal.cycles.month[found.month] : null;

  return {
    ...goal,
    daysElapsed,
    daysLeft,
    daysTotal: NINETY_DAY_SPAN,
    inWindow,
    expectedAmount,
    percent,
    pace: paceStatus(goal.currentAmount || 0, expectedAmount, goal.targetAmount, goal.status),
    currentWeek,
    currentFortnight,
    currentMonth,
    remainingAmount: roundAmount(Math.max(0, (goal.targetAmount || 0) - (goal.currentAmount || 0)))
  };
}

export function previewNinetyDayGoal({ title, targetAmount, unit, unitLabel, direction, startDate } = {}, today = getSaoPauloDateStr()) {
  const parsed = parseGoalText(title || '');
  const amount = parseAmountNumber(targetAmount) ?? parsed.amount;
  const resolvedUnit = unit || parsed.unit;
  const resolvedLabel = unitLabel || parsed.unitLabel || resolvedUnit;
  const resolvedDirection = direction || parsed.direction;
  const resolvedStart = DATE_ONLY_RE.test(startDate || '') ? startDate : today;
  if (amount == null || amount <= 0) {
    return { parsed, valid: false, error: 'Informe um valor numérico para a meta.' };
  }
  const cycles = buildCycles(resolvedStart, amount);
  return {
    parsed: { ...parsed, amount, unit: resolvedUnit, unitLabel: resolvedLabel, direction: resolvedDirection },
    valid: true,
    startDate: resolvedStart,
    endDate: addDaysToDateStr(resolvedStart, NINETY_DAY_LAST_OFFSET),
    targetAmount: roundAmount(amount),
    unit: resolvedUnit,
    unitLabel: resolvedLabel,
    direction: resolvedDirection,
    cycles,
    weekTarget: cycles.week[0]?.targetAmount,
    fortnightTarget: cycles.fortnight[0]?.targetAmount,
    monthTarget: cycles.month[0]?.targetAmount
  };
}

export function createNinetyDayGoal(input = {}, { today = getSaoPauloDateStr(), id } = {}) {
  const parsed = parseGoalText(input.title || '');
  const amount = parseAmountNumber(input.targetAmount) ?? parsed.amount;
  if (!input.title || !String(input.title).trim()) {
    throw new Error('Título da meta é obrigatório.');
  }
  if (amount == null || amount <= 0) {
    throw new Error('A meta precisa de um valor numérico (ex: 9 quilos, 180 horas).');
  }

  const startDate = DATE_ONLY_RE.test(input.startDate || '') ? input.startDate : today;
  const unit = input.unit || parsed.unit || '';
  const unitLabel = input.unitLabel || parsed.unitLabel || unit;
  const direction = input.direction || parsed.direction || 'accumulate';
  const nowIso = new Date().toISOString();

  const goal = {
    id: id || uidNinety('g90'),
    title: String(input.title).trim(),
    description: (input.description || '').trim(),
    category: input.category || 'Pessoal',
    icon: input.icon || 'Mountain',
    parsed: { ...parsed, amount: roundAmount(amount), unit, unitLabel, direction },
    targetAmount: roundAmount(amount),
    currentAmount: 0,
    unit,
    unitLabel,
    direction,
    startDate,
    endDate: addDaysToDateStr(startDate, NINETY_DAY_LAST_OFFSET),
    status: 'active',
    cycles: buildCycles(startDate, amount),
    logs: [],
    createdAt: input.createdAt || nowIso,
    updatedAt: nowIso,
    completedAt: null
  };

  return enrichNinetyDayGoal(recomputeNinetyDayGoal(goal, today), today);
}

export function updateNinetyDayGoal(goal, patch = {}, today = getSaoPauloDateStr()) {
  if (!goal) throw new Error('Meta não encontrada.');
  const next = { ...goal, cycles: { week: [...goal.cycles.week], fortnight: [...goal.cycles.fortnight], month: [...goal.cycles.month] } };
  next.cycles.week = goal.cycles.week.map(c => ({ ...c }));
  next.cycles.fortnight = goal.cycles.fortnight.map(c => ({ ...c }));
  next.cycles.month = goal.cycles.month.map(c => ({ ...c }));
  next.logs = [...(goal.logs || [])];

  if (patch.title !== undefined) next.title = String(patch.title).trim();
  if (patch.description !== undefined) next.description = String(patch.description || '').trim();
  if (patch.category !== undefined) next.category = patch.category;
  if (patch.icon !== undefined) next.icon = patch.icon;
  if (patch.status === 'archived' || patch.status === 'active') next.status = patch.status;

  const nextAmount = patch.targetAmount !== undefined ? parseAmountNumber(patch.targetAmount) : next.targetAmount;
  const nextUnit = patch.unit !== undefined ? patch.unit : next.unit;
  const nextLabel = patch.unitLabel !== undefined ? patch.unitLabel : next.unitLabel;
  const nextDirection = patch.direction !== undefined ? patch.direction : next.direction;
  const nextStart = patch.startDate !== undefined ? patch.startDate : next.startDate;

  const rebuild = (
    (patch.targetAmount !== undefined && roundAmount(nextAmount) !== roundAmount(goal.targetAmount))
    || (patch.startDate !== undefined && nextStart !== goal.startDate)
  );

  if (patch.startDate !== undefined && nextStart !== goal.startDate && (goal.logs || []).length > 0) {
    throw new Error('Não é possível alterar a data de início de uma meta que já tem avanços registrados.');
  }

  if (nextAmount == null || nextAmount <= 0) {
    throw new Error('O valor da meta precisa ser maior que zero.');
  }

  next.targetAmount = roundAmount(nextAmount);
  next.unit = nextUnit;
  next.unitLabel = nextLabel;
  next.direction = nextDirection;
  next.startDate = nextStart;
  next.endDate = addDaysToDateStr(nextStart, NINETY_DAY_LAST_OFFSET);
  next.parsed = {
    ...(next.parsed || parseGoalText(next.title)),
    amount: next.targetAmount,
    unit: nextUnit,
    unitLabel: nextLabel,
    direction: nextDirection
  };

  if (rebuild) {
    const preservedLogs = next.logs;
    next.cycles = buildCycles(next.startDate, next.targetAmount);
    next.logs = preservedLogs;
  }

  next.updatedAt = new Date().toISOString();
  return enrichNinetyDayGoal(recomputeNinetyDayGoal(next, today), today);
}

export function computeProgressRewards({ justCompletedWeek, justCompletedFortnight, justCompletedMonth, justCompletedGoal }) {
  let xp = 18;
  let coins = 5;
  let willpower = 2;
  if (justCompletedWeek) { xp += 30; coins += 8; }
  if (justCompletedFortnight) { xp += 50; coins += 14; }
  if (justCompletedMonth) { xp += 90; coins += 28; }
  if (justCompletedGoal) { xp += 300; coins += 100; willpower += 20; }
  return { xp, coins, willpower };
}

export function logNinetyDayGoalProgress(goal, { amount, date, note, timestamp, id } = {}, today = getSaoPauloDateStr()) {
  if (!goal) throw new Error('Meta não encontrada.');
  const parsedAmount = parseAmountNumber(amount);
  const value = parsedAmount == null ? null : roundAmount(parsedAmount);
  if (value == null || value === 0) {
    throw new Error('Informe um avanço diferente de zero.');
  }
  const dateStr = DATE_ONLY_RE.test(date || '') ? date : today;
  const found = findCyclesForDate(goal, dateStr);
  if (!found) {
    throw new Error(`A data ${formatDateBr(dateStr, { withYear: true })} está fora da janela de 90 dias desta meta.`);
  }

  const before = {
    week: goal.cycles.week[found.week].completed,
    fortnight: goal.cycles.fortnight[found.fortnight].completed,
    month: goal.cycles.month[found.month].completed,
    goal: goal.status === 'completed'
  };

  const log = {
    id: id || uidNinety('g90l'),
    amount: value,
    date: dateStr,
    note: (note || '').trim(),
    timestamp: timestamp || new Date().toISOString(),
    weekIndex: found.week + 1,
    fortnightIndex: found.fortnight + 1,
    monthIndex: found.month + 1,
    xpEarned: 0,
    coinsEarned: 0,
    willpowerEarned: 0
  };

  const next = {
    ...goal,
    logs: [log, ...(goal.logs || [])],
    cycles: {
      week: goal.cycles.week.map(c => ({ ...c })),
      fortnight: goal.cycles.fortnight.map(c => ({ ...c })),
      month: goal.cycles.month.map(c => ({ ...c }))
    }
  };

  recomputeNinetyDayGoal(next, today);

  const justCompletedWeek = !before.week && next.cycles.week[found.week].completed;
  const justCompletedFortnight = !before.fortnight && next.cycles.fortnight[found.fortnight].completed;
  const justCompletedMonth = !before.month && next.cycles.month[found.month].completed;
  const justCompletedGoal = !before.goal && next.status === 'completed';
  const rewards = computeProgressRewards({
    justCompletedWeek,
    justCompletedFortnight,
    justCompletedMonth,
    justCompletedGoal
  });

  const storedLog = next.logs.find(l => l.id === log.id);
  if (storedLog) {
    storedLog.xpEarned = rewards.xp;
    storedLog.coinsEarned = rewards.coins;
    storedLog.willpowerEarned = rewards.willpower;
    storedLog.justCompleted = {
      week: justCompletedWeek,
      fortnight: justCompletedFortnight,
      month: justCompletedMonth,
      goal: justCompletedGoal
    };
  }

  next.updatedAt = storedLog?.timestamp || new Date().toISOString();

  return {
    goal: enrichNinetyDayGoal(next, today),
    log: storedLog,
    justCompleted: storedLog?.justCompleted,
    rewards
  };
}

export function deleteNinetyDayGoalLog(goal, logId, today = getSaoPauloDateStr()) {
  if (!goal) throw new Error('Meta não encontrada.');
  const index = (goal.logs || []).findIndex(l => l.id === logId);
  if (index === -1) throw new Error('Registro de avanço não encontrado.');
  const [removed] = goal.logs.splice(index, 1);
  const next = {
    ...goal,
    logs: [...goal.logs],
    cycles: {
      week: goal.cycles.week.map(c => ({ ...c })),
      fortnight: goal.cycles.fortnight.map(c => ({ ...c })),
      month: goal.cycles.month.map(c => ({ ...c }))
    },
    updatedAt: new Date().toISOString()
  };
  return {
    goal: enrichNinetyDayGoal(recomputeNinetyDayGoal(next, today), today),
    removed
  };
}

export function sanitizeNinetyDayGoal(raw, today = getSaoPauloDateStr()) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim();
  if (!title) return null;
  const amount = parseAmountNumber(raw.targetAmount);
  if (amount == null || amount <= 0) return null;
  const startDate = DATE_ONLY_RE.test(raw.startDate || '') ? raw.startDate : today;
  const unit = raw.unit || '';
  const unitLabel = raw.unitLabel || unit;
  const direction = raw.direction === 'reduce' ? 'reduce' : 'accumulate';

  const goal = {
    id: raw.id || uidNinety('g90'),
    title,
    description: raw.description || '',
    category: raw.category || 'Pessoal',
    icon: raw.icon || 'Mountain',
    parsed: raw.parsed || parseGoalText(title),
    targetAmount: roundAmount(amount),
    currentAmount: 0,
    unit,
    unitLabel,
    direction,
    startDate,
    endDate: addDaysToDateStr(startDate, NINETY_DAY_LAST_OFFSET),
    status: raw.status === 'archived' ? 'archived' : 'active',
    cycles: raw.cycles && raw.cycles.week && raw.cycles.fortnight && raw.cycles.month
      ? {
          week: raw.cycles.week.map(c => ({ ...c })),
          fortnight: raw.cycles.fortnight.map(c => ({ ...c })),
          month: raw.cycles.month.map(c => ({ ...c }))
        }
      : buildCycles(startDate, amount),
    logs: Array.isArray(raw.logs) ? raw.logs.map(l => ({ ...l })) : [],
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    completedAt: raw.completedAt || null
  };

  if (!goal.cycles.week?.length || goal.cycles.week.length !== 12) {
    goal.cycles = buildCycles(startDate, amount);
  }

  return enrichNinetyDayGoal(recomputeNinetyDayGoal(goal, today), today);
}

export function sanitizeNinetyDayGoals(list = [], today = getSaoPauloDateStr()) {
  if (!Array.isArray(list)) return [];
  return list.map(item => sanitizeNinetyDayGoal(item, today)).filter(Boolean);
}

export function describeCycleBreakdown(goal) {
  const unit = goal.unit;
  const label = goal.unitLabel;
  return {
    month: `${CYCLE_DEFS.month.count} metas de ${formatGoalAmount(goal.cycles?.month?.[0]?.targetAmount, unit, label)} por mês`,
    fortnight: `${CYCLE_DEFS.fortnight.count} metas de ${formatGoalAmount(goal.cycles?.fortnight?.[0]?.targetAmount, unit, label)} por quinzena`,
    week: `${CYCLE_DEFS.week.count} metas de ${formatGoalAmount(goal.cycles?.week?.[0]?.targetAmount, unit, label)} por semana`
  };
}
