/**
 * Correlações — motor de padrões entre o que o Grimório já registra.
 *
 * Não treina um modelo opaco. Cruza os dias observados com três famílias de
 * evidência, todas auditáveis:
 *
 * 1. Coocorrência no mesmo dia (phi / qui-quadrado, lift, Fisher quando a
 *    tabela é pequena).
 * 2. Efeito no dia seguinte (lag 1): "se isso hoje, aquilo amanhã".
 * 3. Regressão linear por mínimos quadrados de um resultado contínuo
 *    (minutos produtivos, acertos, tempo no celular) sobre as variáveis do
 *    mesmo dia e do dia anterior. O coeficiente padronizado é o efeito; o
 *    p-valor sai do teste t do coeficiente.
 *
 * Um padrão só vira descoberta quando passa no tamanho mínimo da amostra,
 * no limiar de significância e num corte de efeito. Correlação não é causa:
 * o texto deixa isso explícito.
 */

import { getSaoPauloDateStr, addDaysToDateStr, getSaoPauloDayOfWeek } from './timeUtils.js';
import { parseDurationMinutes } from '../src/utils/activityDuration.js';
import { sessionDateStr } from '../src/utils/homeostasis.js';
import { collectStudyBlocks } from '../src/utils/aguStudyEngine.js';
import { subjectIdForMindMap } from '../src/utils/aguHomeostasis.js';
import { sanitizePhoneTimeLogs } from '../src/utils/phoneTime.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const CORRELATION_DEFAULTS = {
  windowDays: 120,
  minDays: 14,
  minSupport: 4,
  maxPValue: 0.05,
  minAbsPhi: 0.25,
  minLiftDelta: 0.35,
  minAbsBeta: 0.2,
  minOutcomeSpread: 1,
  maxFindings: 40
};

const PRODUCTIVE_KINDS = new Set([
  'quest',
  'habit',
  'reading',
  'scripture',
  'agu',
  'questions',
  'mindmap',
  'process',
  'victory'
]);

function isDateKey(value) {
  return DATE_RE.test(String(value || ''));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 3) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function stddev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const sum = values.reduce((acc, value) => acc + (value - avg) ** 2, 0);
  return Math.sqrt(sum / (values.length - 1));
}

/** ln Γ(n) para n inteiro >= 1, via soma. Suficiente até n de algumas centenas. */
function logGammaInt(n) {
  if (n <= 2) return 0;
  let sum = 0;
  for (let i = 2; i < n; i += 1) sum += Math.log(i);
  return sum;
}

/**
 * Teste exato de Fisher, bicaudal, para tabela 2×2.
 * Soma as tabelas com a mesma margem cuja probabilidade é <= à observada.
 */
export function fisherExactP(a, b, c, d) {
  const cells = [a, b, c, d].map((value) => Math.round(Number(value) || 0));
  if (cells.some((value) => value < 0)) return 1;
  const [n11, n12, n21, n22] = cells;
  const row1 = n11 + n12;
  const row2 = n21 + n22;
  const col1 = n11 + n21;
  const total = row1 + row2;
  if (total === 0 || row1 === 0 || row2 === 0 || col1 === 0 || col1 === total) return 1;

  const logProb = (x) => {
    const y12 = row1 - x;
    const y21 = col1 - x;
    const y22 = row2 - y21;
    return (
      logGammaInt(row1 + 1) + logGammaInt(row2 + 1)
      + logGammaInt(col1 + 1) + logGammaInt(total - col1 + 1)
      - logGammaInt(total + 1)
      - logGammaInt(x + 1) - logGammaInt(y12 + 1)
      - logGammaInt(y21 + 1) - logGammaInt(y22 + 1)
    );
  };

  const minX = Math.max(0, col1 - row2);
  const maxX = Math.min(row1, col1);
  const observed = logProb(n11);
  let tail = 0;
  for (let x = minX; x <= maxX; x += 1) {
    const lp = logProb(x);
    if (lp <= observed + 1e-9) tail += Math.exp(lp);
  }
  return clamp(tail, 0, 1);
}

/** Qui-quadrado com correção de Yates, 1 gl, aproximado por cauda da normal. */
export function chiSquareP(a, b, c, d) {
  const n = a + b + c + d;
  if (n <= 0) return 1;
  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  const col2 = b + d;
  if (row1 === 0 || row2 === 0 || col1 === 0 || col2 === 0) return 1;
  const expected = [row1 * col1, row1 * col2, row2 * col1, row2 * col2].map((value) => value / n);
  if (expected.some((value) => value < 5)) return fisherExactP(a, b, c, d);
  const observed = [a, b, c, d];
  let chi = 0;
  for (let i = 0; i < 4; i += 1) {
    const diff = Math.abs(observed[i] - expected[i]) - 0.5;
    chi += (diff ** 2) / expected[i];
  }
  // P(χ²_1 > chi) = 2 * (1 - Φ(sqrt(chi)))
  return clamp(2 * (1 - normalCdf(Math.sqrt(chi))), 0, 1);
}

function normalCdf(z) {
  // Abramowitz & Stegun 7.1.26
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  const erf = sign * (1 - poly * Math.exp(-x * x));
  return 0.5 * (1 + erf);
}

/** Cauda bicaudal do t de Student, aproximação de Hill (A&S 26.7.8) para gl > 0. */
export function studentTP(t, df) {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return 1;
  const x = df / (df + t * t);
  const incomplete = regularizedBeta(x, df / 2, 0.5);
  return clamp(incomplete, 0, 1);
}

function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  // Fração continuada de Lentz, forma modificada.
  const lnBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) / a;
  const maxIter = 200;
  const tiny = 1e-30;
  let f = 1;
  let c = 1;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  f = d;
  for (let m = 1; m <= maxIter; m += 1) {
    let numerator = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + numerator * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + numerator / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    f *= c * d;

    numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + numerator / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = c * d;
    f *= delta;
    if (Math.abs(delta - 1) < 1e-10) break;
  }
  return clamp(front * f, 0, 1);
}

function logGamma(z) {
  // Lanczos, g = 7, n = 9.
  const p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843696540789854e-6,
    1.5056327351493116e-7
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  const x = z - 1;
  let a = p[0];
  const t = x + 7.5;
  for (let i = 1; i < p.length; i += 1) a += p[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function contingency(xs, ys) {
  let a = 0;
  let b = 0;
  let c = 0;
  let d = 0;
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i += 1) {
    const x = xs[i] ? 1 : 0;
    const y = ys[i] ? 1 : 0;
    if (x && y) a += 1;
    else if (x && !y) b += 1;
    else if (!x && y) c += 1;
    else d += 1;
  }
  return { a, b, c, d, n };
}

export function associationStats(xs, ys) {
  const table = contingency(xs, ys);
  const { a, b, c, d, n } = table;
  if (n === 0) return null;
  const denom = Math.sqrt((a + b) * (c + d) * (a + c) * (b + d));
  const phi = denom > 0 ? (a * d - b * c) / denom : 0;
  const pX = (a + b) / n;
  const pY = (a + c) / n;
  const pBoth = a / n;
  const lift = pX > 0 && pY > 0 ? pBoth / (pX * pY) : null;
  const rateWhen = a + b > 0 ? a / (a + b) : null;
  const rateWithout = c + d > 0 ? c / (c + d) : null;
  const pValue = chiSquareP(a, b, c, d);
  return {
    ...table,
    phi: round(phi, 3),
    lift: lift == null ? null : round(lift, 2),
    rateWhen: rateWhen == null ? null : round(rateWhen, 3),
    rateWithout: rateWithout == null ? null : round(rateWithout, 3),
    pValue: round(pValue, 4),
    support: a
  };
}

/**
 * Regressão linear simples y = α + β x.
 * Devolve coeficiente padronizado, r, p-valor do teste t e a variação média.
 */
export function linearEffect(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 5) return null;
  const x = xs.slice(0, n).map(Number);
  const y = ys.slice(0, n).map(Number);
  if (x.some((value) => !Number.isFinite(value)) || y.some((value) => !Number.isFinite(value))) return null;
  const xMean = mean(x);
  const yMean = mean(y);
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i] - xMean;
    const dy = y[i] - yMean;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  if (sxx <= 1e-9 || syy <= 1e-9) return null;
  const beta = sxy / sxx;
  const alpha = yMean - beta * xMean;
  const r = sxy / Math.sqrt(sxx * syy);
  let sse = 0;
  for (let i = 0; i < n; i += 1) {
    const residual = y[i] - (alpha + beta * x[i]);
    sse += residual * residual;
  }
  const df = n - 2;
  const mse = sse / df;
  const se = Math.sqrt(mse / sxx);
  const t = se > 0 ? beta / se : 0;
  const pValue = studentTP(t, df);
  const sdX = Math.sqrt(sxx / (n - 1));
  const sdY = Math.sqrt(syy / (n - 1));
  return {
    n,
    alpha: round(alpha, 3),
    beta: round(beta, 4),
    betaStd: round(beta * sdX / sdY, 3),
    r: round(r, 3),
    pValue: round(pValue, 4),
    meanWhenHigh: null,
    delta: null
  };
}

function addMinutes(bucket, minutes) {
  bucket.minutes += parseDurationMinutes(minutes);
}

function bump(map, dateStr, id, minutes = 0, extra = null) {
  if (!isDateKey(dateStr) || !id) return;
  if (!map.has(dateStr)) map.set(dateStr, new Map());
  const day = map.get(dateStr);
  const current = day.get(id) || { present: false, minutes: 0, amount: 0, count: 0 };
  current.present = true;
  current.count += 1;
  addMinutes(current, minutes);
  if (extra?.amount) current.amount += extra.amount;
  day.set(id, current);
}

function questDate(quest) {
  if (!quest?.completed) return '';
  return getSaoPauloDateStr(quest.completedAt || quest.updatedAt || quest.createdAt);
}

function shortLabel(value, max = 42) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

/**
 * Monta o painel diário: um vetor por variável, alinhado aos dias da janela.
 * Hoje entra incompleto de propósito — o celular de hoje ainda não foi pedido.
 */
export function buildCorrelationFrame(db = {}, options = {}) {
  const todayStr = options.todayStr || getSaoPauloDateStr();
  const windowDays = clamp(Math.round(Number(options.windowDays) || CORRELATION_DEFAULTS.windowDays), 21, 365);
  const dates = [];
  for (let offset = windowDays - 1; offset >= 0; offset -= 1) {
    dates.push(addDaysToDateStr(todayStr, -offset));
  }
  const dateIndex = new Map(dates.map((date, index) => [date, index]));
  const events = new Map();

  (db.quests || []).forEach((quest) => {
    const dateStr = questDate(quest);
    if (!dateIndex.has(dateStr)) return;
    const label = shortLabel(quest.title || 'Missão');
    bump(events, dateStr, `quest:${quest.id || label}`, quest.durationMinutes);
    bump(events, dateStr, 'kind:quest', quest.durationMinutes);
    if (quest.category) bump(events, dateStr, `cat:${quest.category}`, quest.durationMinutes);
  });

  (db.habits || []).forEach((habit) => {
    const history = Array.isArray(habit?.history) ? habit.history : [];
    history.forEach((dateStr) => {
      if (!dateIndex.has(dateStr)) return;
      bump(events, dateStr, `habit:${habit.id}`, habit?.durationsByDate?.[dateStr]);
      bump(events, dateStr, 'kind:habit', habit?.durationsByDate?.[dateStr]);
    });
  });

  (db.readingSessions || []).forEach((session) => {
    const dateStr = sessionDateStr(session);
    if (!dateIndex.has(dateStr)) return;
    bump(events, dateStr, `reading:${session.bookId || 'book'}`, session.durationMinutes);
    bump(events, dateStr, 'kind:reading', session.durationMinutes);
  });

  (db.scriptureSessions || []).forEach((session) => {
    const dateStr = sessionDateStr(session);
    if (!dateIndex.has(dateStr)) return;
    bump(events, dateStr, 'kind:scripture', session.durationMinutes);
  });

  const aguBlocks = collectStudyBlocks(db.aguPlan, db.examQuestions || []);
  const aguExamIds = new Set();
  aguBlocks.forEach((block) => {
    (block.examIds || []).forEach((id) => {
      if (id) aguExamIds.add(id);
    });
    if (!block?.done || !dateIndex.has(block.dateStr)) return;
    bump(events, block.dateStr, `agu:${block.subjectId || block.subject || 'agu'}`, block.durationMinutes);
    bump(events, block.dateStr, 'kind:agu', block.durationMinutes);
  });

  (db.examQuestions || []).forEach((entry) => {
    if (entry?.id && aguExamIds.has(entry.id)) return;
    if (entry?.blockKey) return;
    const dateStr = sessionDateStr(entry);
    if (!dateIndex.has(dateStr)) return;
    const subject = shortLabel(entry.subject || 'Geral', 32);
    bump(events, dateStr, `questions:${subject}`, entry.durationMinutes);
    bump(events, dateStr, 'kind:questions', entry.durationMinutes);
  });

  const mapById = {};
  (db.mindMaps || []).forEach((map) => {
    if (map?.id) mapById[map.id] = map;
  });
  (db.mindMapSessions || []).forEach((session) => {
    const map = mapById[session.mapId] || null;
    if (map && subjectIdForMindMap(map)) return;
    const dateStr = sessionDateStr(session);
    if (!dateIndex.has(dateStr)) return;
    bump(events, dateStr, `mindmap:${session.mapId || 'map'}`, session.durationMinutes);
    bump(events, dateStr, 'kind:mindmap', session.durationMinutes);
  });

  (db.processSteps || []).forEach((step) => {
    const dateStr = sessionDateStr(step);
    if (!dateIndex.has(dateStr)) return;
    bump(events, dateStr, `process:${step.processId || 'process'}`, step.durationMinutes);
    bump(events, dateStr, 'kind:process', step.durationMinutes);
  });

  (db.dailyVictories || []).forEach((victory) => {
    if (!victory?.completed || !dateIndex.has(victory.date)) return;
    bump(events, victory.date, 'kind:victory');
  });

  const supplementNames = new Map((db.supplements || []).map((item) => [item.id, item.name || 'Suplemento']));
  (db.supplementLogs || []).forEach((log) => {
    if (!dateIndex.has(log.date)) return;
    const name = supplementNames.get(log.supplementId) || 'Suplemento';
    bump(events, log.date, `supplement:${log.supplementId || name}`, 0, { amount: Number(log.amount) || 1 });
    bump(events, log.date, 'kind:supplement');
  });

  const phoneByDate = {};
  sanitizePhoneTimeLogs(db.phoneTimeLogs).forEach((entry) => {
    if (dateIndex.has(entry.date)) phoneByDate[entry.date] = entry.minutes;
  });

  const books = new Map((db.books || []).map((book) => [book.id, book.title]));
  const habits = new Map((db.habits || []).map((habit) => [habit.id, habit.title]));
  const quests = new Map((db.quests || []).filter((quest) => quest.completed).map((quest) => [quest.id, quest.title]));
  const processes = new Map((db.processes || []).map((item) => [item.id, item.title]));
  const maps = new Map((db.mindMaps || []).map((map) => [map.id, map.title]));
  const aguSubjects = new Map();
  aguBlocks.forEach((block) => {
    if (block.subjectId) aguSubjects.set(block.subjectId, block.subject || block.subjectId);
  });

  const productive = dates.map(() => 0);
  const activityCount = dates.map(() => 0);
  const phone = dates.map((date) => (phoneByDate[date] == null ? null : phoneByDate[date]));
  const accuracyNumer = dates.map(() => 0);
  const accuracyDenom = dates.map(() => 0);

  (db.examQuestions || []).forEach((entry) => {
    const dateStr = sessionDateStr(entry);
    const index = dateIndex.get(dateStr);
    if (index == null) return;
    const solved = Number(entry.totalQuestions) || 0;
    const correct = Number(entry.correctAnswers) || 0;
    if (solved <= 0) return;
    accuracyNumer[index] += correct;
    accuracyDenom[index] += solved;
  });

  events.forEach((day, dateStr) => {
    const index = dateIndex.get(dateStr);
    day.forEach((value, id) => {
      if (id.startsWith('kind:') && PRODUCTIVE_KINDS.has(id.slice(5))) {
        productive[index] += value.minutes;
        activityCount[index] += value.count;
      }
    });
  });

  const catalog = [];

  const addSeries = (id, label, kind, group, series, meta = {}) => {
    const presentDays = series.filter((value) => value).length;
    if (presentDays < 2) return;
    catalog.push({
      id,
      label,
      kind,
      group,
      presentDays,
      binary: series.map((value) => (value ? 1 : 0)),
      minutes: meta.minutes || null,
      amount: meta.amount || null,
      unit: meta.unit || null
    });
  };

  const ids = new Set();
  events.forEach((day) => {
    day.forEach((_value, id) => ids.add(id));
  });

  ids.forEach((id) => {
    const binary = dates.map(() => 0);
    const minutes = dates.map(() => 0);
    const amount = dates.map(() => 0);
    dates.forEach((date, index) => {
      const value = events.get(date)?.get(id);
      if (!value) return;
      binary[index] = 1;
      minutes[index] = value.minutes;
      amount[index] = value.amount;
    });
    const presentDays = binary.reduce((acc, value) => acc + value, 0);
    if (presentDays < 2) return;

    if (id.startsWith('habit:')) {
      catalog.push({
        id, label: shortLabel(habits.get(id.slice(6)) || 'Ritual'), kind: 'habit', group: 'Rituais',
        presentDays, binary, minutes, unit: 'min'
      });
    } else if (id.startsWith('quest:')) {
      catalog.push({
        id, label: shortLabel(quests.get(id.slice(6)) || 'Missão'), kind: 'quest', group: 'Missões',
        presentDays, binary, minutes, unit: 'min'
      });
    } else if (id.startsWith('reading:')) {
      catalog.push({
        id, label: shortLabel(books.get(id.slice(8)) || 'Leitura'), kind: 'reading', group: 'Biblioteca',
        presentDays, binary, minutes, unit: 'min'
      });
    } else if (id.startsWith('questions:')) {
      catalog.push({
        id, label: shortLabel(id.slice(10)), kind: 'questions', group: 'Questões',
        presentDays, binary, minutes, unit: 'min'
      });
    } else if (id.startsWith('agu:')) {
      const subjectId = id.slice(4);
      catalog.push({
        id, label: shortLabel(aguSubjects.get(subjectId) || subjectId), kind: 'agu', group: 'AGU',
        presentDays, binary, minutes, unit: 'min'
      });
    } else if (id.startsWith('mindmap:')) {
      catalog.push({
        id, label: shortLabel(maps.get(id.slice(8)) || 'Mapa'), kind: 'mindmap', group: 'Mapas',
        presentDays, binary, minutes, unit: 'min'
      });
    } else if (id.startsWith('process:')) {
      catalog.push({
        id, label: shortLabel(processes.get(id.slice(8)) || 'Processo'), kind: 'process', group: 'Processos',
        presentDays, binary, minutes, unit: 'min'
      });
    } else if (id.startsWith('supplement:')) {
      const supplementId = id.slice(11);
      catalog.push({
        id, label: shortLabel(supplementNames.get(supplementId) || 'Suplemento'), kind: 'supplement', group: 'Suplementos',
        presentDays, binary, amount, unit: 'dose'
      });
    } else if (id.startsWith('cat:')) {
      catalog.push({
        id, label: shortLabel(id.slice(4)), kind: 'context', group: 'Categorias',
        presentDays, binary, minutes, unit: 'min'
      });
    }
  });

  const kindLabels = {
    'kind:quest': ['Missões concluídas', 'Missões'],
    'kind:habit': ['Rituais cumpridos', 'Rituais'],
    'kind:reading': ['Leitura', 'Biblioteca'],
    'kind:scripture': ['Escrituras', 'Escrituras'],
    'kind:agu': ['Estudo AGU', 'AGU'],
    'kind:questions': ['Bateria de questões', 'Questões'],
    'kind:mindmap': ['Estudo de mapa', 'Mapas'],
    'kind:process': ['Processos', 'Processos'],
    'kind:victory': ['Vitória do dia', 'Vitórias'],
    'kind:supplement': ['Algum suplemento', 'Suplementos']
  };
  Object.entries(kindLabels).forEach(([id, [label, group]]) => {
    const binary = dates.map((date) => (events.get(date)?.has(id) ? 1 : 0));
    addSeries(id, label, id.slice(5), group, binary);
  });

  const phoneLogged = phone.map((value) => (value == null ? 0 : 1));
  const loggedPhone = phone.filter((value) => value != null);
  const phoneCut = phoneHighCut(loggedPhone);
  catalog.push({
    id: 'phone:logged',
    label: 'Celular registrado',
    kind: 'phone',
    group: 'Celular',
    presentDays: phoneLogged.reduce((acc, value) => acc + value, 0),
    binary: phoneLogged,
    continuous: phone,
    unit: 'min',
    threshold: phoneCut
  });
  const aboveCut = phone.filter((value) => value != null && value > phoneCut).length;
  const belowCut = phone.filter((value) => value != null && value <= phoneCut).length;
  if (phoneCut != null && aboveCut >= 3 && belowCut >= 3) {
    catalog.push({
      id: 'phone:above-cut',
      label: `Celular acima de ${formatMinutes(phoneCut)}`,
      kind: 'phone',
      group: 'Celular',
      presentDays: aboveCut,
      binary: phone.map((value) => (value != null && value > phoneCut ? 1 : 0)),
      continuous: phone,
      unit: 'min',
      threshold: phoneCut,
      requiresLogged: true
    });
  }

  const weekday = dates.map((date) => {
    const dow = getSaoPauloDayOfWeek(new Date(`${date}T15:00:00.000Z`));
    return dow === 0 || dow === 6 ? 0 : 1;
  });
  catalog.push({
    id: 'context:weekday',
    label: 'Dia de semana',
    kind: 'context',
    group: 'Contexto',
    presentDays: weekday.reduce((acc, value) => acc + value, 0),
    binary: weekday
  });

  const outcomes = [
    {
      id: 'outcome:productive-minutes',
      label: 'Minutos produtivos',
      unit: 'min',
      values: productive,
      higherIsBetter: true
    },
    {
      id: 'outcome:activity-count',
      label: 'Atividades no dia',
      unit: 'atividades',
      values: activityCount,
      higherIsBetter: true
    },
    {
      id: 'outcome:phone-minutes',
      label: 'Tempo no celular',
      unit: 'min',
      values: phone,
      higherIsBetter: false,
      onlyLogged: true
    },
    {
      id: 'outcome:accuracy',
      label: 'Taxa de acerto',
      unit: '%',
      values: accuracyDenom.map((denom, index) => (denom > 0 ? (accuracyNumer[index] / denom) * 100 : null)),
      higherIsBetter: true,
      onlyLogged: true
    }
  ];

  return {
    todayStr,
    windowDays,
    dates,
    catalog: catalog.filter((item) => item.presentDays >= 2),
    outcomes,
    phoneLoggedDays: loggedPhone.length,
    activeDays: dates.filter((_date, index) => productive[index] > 0 || activityCount[index] > 0).length
  };
}

/**
 * Corte entre uso comum e uso alto. A mediana não serve: se a maioria dos
 * dias é baixa, ela cai no grupo baixo e "acima da mediana" vira quase tudo.
 * O ponto médio entre o menor e o maior terço separa os dois.
 */
function phoneHighCut(values) {
  const sorted = values.filter((value) => Number.isFinite(value)).slice().sort((a, b) => a - b);
  if (sorted.length < 6) return null;
  const low = sorted[Math.floor((sorted.length - 1) * 0.33)];
  const high = sorted[Math.ceil((sorted.length - 1) * 0.67)];
  if (high - low < 15) return null;
  return Math.round((low + high) / 2);
}

export function formatMinutes(minutes) {
  const value = Math.round(Number(minutes) || 0);
  if (value < 60) return `${value} min`;
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return mins ? `${hours}h ${mins}` : `${hours}h`;
}

function confidenceOf(pValue, support, effect) {
  const strength = Math.abs(effect);
  if (pValue <= 0.01 && support >= 8 && strength >= 0.35) return 'alta';
  if (pValue <= 0.05 && support >= 5 && strength >= 0.25) return 'média';
  return 'baixa';
}

function directionOf(effect, higherIsBetter = true) {
  const positive = effect > 0;
  if (higherIsBetter) return positive ? 'ajuda' : 'atrapalha';
  return positive ? 'atrapalha' : 'ajuda';
}

function percent(rate) {
  if (rate == null || !Number.isFinite(rate)) return '—';
  return `${Math.round(rate * 100)}%`;
}

function sameDayText(source, target, stats) {
  const when = percent(stats.rateWhen);
  const without = percent(stats.rateWithout);
  if (stats.phi > 0) {
    return `Quando ${source.label} acontece, ${target.label} também acontece em ${when} dos dias (contra ${without} sem isso).`;
  }
  return `Quando ${source.label} acontece, ${target.label} some: só ocorre em ${when} desses dias, contra ${without} nos outros.`;
}

function lagText(source, target, stats) {
  const when = percent(stats.rateWhen);
  const without = percent(stats.rateWithout);
  if (stats.phi > 0) {
    return `Se ${source.label} acontece hoje, ${target.label} tende a acontecer no dia seguinte (${when} contra ${without}).`;
  }
  return `Se ${source.label} acontece hoje, ${target.label} tende a não acontecer no dia seguinte (${when} contra ${without}).`;
}

function outcomeText(source, outcome, effect, comparison) {
  const verb = effect.beta >= 0 ? 'sobe' : 'cai';
  const amount = outcome.unit === '%'
    ? `${Math.abs(comparison.delta).toFixed(0)} pontos`
    : outcome.unit === 'min'
      ? formatMinutes(Math.abs(comparison.delta))
      : `${Math.abs(comparison.delta).toFixed(1)} ${outcome.unit}`;
  const whenLabel = comparison.lag ? 'no dia seguinte' : 'no mesmo dia';
  return `Quando ${source.label} acontece, a média de ${outcome.label.toLowerCase()} ${verb} cerca de ${amount} ${whenLabel}.`;
}

function phoneThresholdText(variable, outcome, comparison) {
  const verb = comparison.delta >= 0 ? 'sobe' : 'cai';
  const amount = outcome.unit === 'min'
    ? formatMinutes(Math.abs(comparison.delta))
    : `${Math.abs(comparison.delta).toFixed(1)} ${outcome.unit}`;
  return `Nos dias em que o celular passa de ${formatMinutes(variable.threshold)}, a média de ${outcome.label.toLowerCase()} ${verb} cerca de ${amount}.`;
}

function usablePair(source, target) {
  if (source.id === target.id) return false;
  if (source.kind === 'context' && target.kind === 'context') return false;
  if (source.id.startsWith('kind:') && target.id.startsWith(source.id.slice(5) + ':')) return false;
  if (target.id.startsWith('kind:') && source.id.startsWith(target.id.slice(5) + ':')) return false;
  return true;
}

function slicePair(source, target, lag, options = {}) {
  const xs = [];
  const ys = [];
  const length = source.binary.length;
  for (let i = 0; i < length - lag; i += 1) {
    const yIndex = i + lag;
    if (options.onlyLoggedTarget && target.continuous && target.continuous[yIndex] == null) continue;
    if (options.onlyLoggedSource && source.continuous && source.continuous[i] == null) continue;
    if (source.requiresLogged && source.continuous && source.continuous[i] == null) continue;
    xs.push(source.binary[i]);
    ys.push(target.binary[yIndex]);
  }
  return { xs, ys };
}

function compareGroups(xs, values) {
  const on = [];
  const off = [];
  xs.forEach((flag, index) => {
    const value = values[index];
    if (value == null || !Number.isFinite(value)) return;
    if (flag) on.push(value);
    else off.push(value);
  });
  if (on.length < 3 || off.length < 3) return null;
  const delta = mean(on) - mean(off);
  return {
    onMean: round(mean(on), 1),
    offMean: round(mean(off), 1),
    delta: round(delta, 1),
    onCount: on.length,
    offCount: off.length
  };
}

function scoreFinding(finding) {
  const effect = Math.abs(finding.effect || 0);
  const support = finding.support || 0;
  const p = finding.pValue == null ? 1 : finding.pValue;
  const surprise = finding.lift != null ? Math.abs(Math.log(Math.max(finding.lift, 0.05))) : effect;
  // Efeito em produtividade, acerto ou celular responde à pergunta do herói.
  // Coocorrência perfeita entre duas atividades não pode empurrá-lo para fora.
  const outcomeBoost = finding.family === 'regression' ? 1.5 : 0;
  return effect * 2 + surprise + outcomeBoost + Math.min(support, 20) / 20 - p;
}

/**
 * Descobre padrões que passam nos cortes.
 * O p-valor de cada candidato é comparado com alfa / número de testes
 * elegíveis (Bonferroni). Sem isso, centenas de pares produziriam achados
 * só por acaso.
 */
export function discoverCorrelations(db = {}, options = {}) {
  const config = { ...CORRELATION_DEFAULTS, ...options };
  const frame = buildCorrelationFrame(db, config);
  const tested = { pairs: 0, lags: 0, regressions: 0 };
  const candidates = [];
  const predictors = frame.catalog.filter((item) => item.kind !== 'outcome' && item.presentDays >= config.minSupport);
  const targets = frame.catalog.filter((item) => (
    item.presentDays >= config.minSupport
    && item.kind !== 'phone'
    && !item.id.startsWith('kind:')
  ));

  predictors.forEach((source) => {
    targets.forEach((target) => {
      if (!usablePair(source, target)) return;
      [0, 1].forEach((lag) => {
        if (lag === 1 && source.kind === 'context') return;
        const { xs, ys } = slicePair(source, target, lag);
        const stats = associationStats(xs, ys);
        tested.pairs += 1;
        if (lag) tested.lags += 1;
        if (!stats) return;
        if (stats.a + stats.b < config.minSupport) return;
        if ((stats.c + stats.d) < config.minSupport) return;
        if (stats.a + stats.c < config.minSupport) return;
        const effect = stats.phi || 0;
        const liftDelta = stats.lift == null ? 0 : Math.abs(stats.lift - 1);
        const strong = Math.abs(effect) >= config.minAbsPhi && liftDelta >= config.minLiftDelta * 0.5;
        candidates.push({
          family: lag ? 'lag' : 'cooccurrence',
          relation: lag ? 'dia-seguinte' : (effect > 0 ? 'andam-juntas' : 'uma-exclui-a-outra'),
          effect,
          direction: effect > 0 ? 'positiva' : 'negativa',
          verdict: effect > 0 ? 'ajuda' : 'atrapalha',
          pValue: stats.pValue,
          phi: stats.phi,
          lift: stats.lift,
          support: stats.a,
          sourceDays: stats.a + stats.b,
          sample: stats.n,
          source: { id: source.id, label: source.label, kind: source.kind, group: source.group },
          target: { id: target.id, label: target.label, kind: target.kind, group: target.group },
          lag,
          rateWhen: stats.rateWhen,
          rateWithout: stats.rateWithout,
          text: lag ? lagText(source, target, stats) : sameDayText(source, target, stats),
          method: 'Phi + teste exato ou qui-quadrado',
          eligible: strong && stats.pValue != null
        });
      });
    });
  });

  predictors.forEach((source) => {
    if (source.kind === 'context' && source.id !== 'context:weekday') return;
    frame.outcomes.forEach((outcome) => {
      [0, 1].forEach((lag) => {
        if (lag === 1 && source.kind === 'context') return;
        if (source.id === 'phone:logged') return;
        // "Celular alto" já é um corte do próprio tempo de celular.
        if (lag === 0 && source.kind === 'phone' && outcome.id === 'outcome:phone-minutes') return;
        const xs = [];
        const ys = [];
        for (let i = 0; i < source.binary.length - lag; i += 1) {
          const yIndex = i + lag;
          const y = outcome.values[yIndex];
          if (y == null || !Number.isFinite(y)) continue;
          if (source.requiresLogged && (source.continuous?.[i] == null)) continue;
          if (outcome.id === 'outcome:productive-minutes' && PRODUCTIVE_KINDS.has(source.kind) && lag === 0) {
            // O próprio tempo da atividade já está dentro do resultado. Mede o resto.
            ys.push(Math.max(0, y - (source.minutes?.[i] || 0)));
          } else {
            ys.push(y);
          }
          xs.push(source.binary[i]);
        }
        tested.regressions += 1;
        if (xs.filter(Boolean).length < config.minSupport) return;
        if (xs.filter((value) => !value).length < config.minSupport) return;
        // Sem variação não há o que regressar. O piso é relativo à escala:
        // minutos de um ritual curto não podem ser tratados como ruído.
        const spreadFloor = outcome.unit === '%' ? 3 : 0.5;
        if (stddev(ys) < spreadFloor) return;
        const effect = linearEffect(xs, ys);
        if (!effect || effect.pValue == null) return;
        if (Math.abs(effect.betaStd || 0) < config.minAbsBeta) return;
        const comparison = compareGroups(xs, ys);
        if (!comparison || Math.abs(comparison.delta) < (outcome.unit === '%' ? 4 : 1)) return;
        const higherIsBetter = outcome.higherIsBetter !== false;
        const verdict = directionOf(effect.beta, higherIsBetter);
        const text = source.id === 'phone:above-cut'
          ? phoneThresholdText(source, outcome, comparison)
          : outcomeText(source, outcome, effect, { ...comparison, lag });
        candidates.push({
          family: 'regression',
          relation: lag ? 'efeito-no-dia-seguinte' : 'efeito-no-dia',
          effect: effect.betaStd,
          direction: effect.beta >= 0 ? 'positiva' : 'negativa',
          verdict,
          confidence: confidenceOf(effect.pValue, comparison.onCount, effect.betaStd || 0),
          pValue: effect.pValue,
          beta: effect.beta,
          betaStd: effect.betaStd,
          r: effect.r,
          support: comparison.onCount,
          sample: effect.n,
          source: { id: source.id, label: source.label, kind: source.kind, group: source.group },
          target: { id: outcome.id, label: outcome.label, kind: 'outcome', group: 'Resultados' },
          lag,
          delta: comparison.delta,
          onMean: comparison.onMean,
          offMean: comparison.offMean,
          unit: outcome.unit,
          text,
          method: 'Regressão linear (mínimos quadrados)',
          eligible: true
        });
      });
    });
  });

  const tests = Math.max(1, candidates.filter((item) => item.eligible).length);
  const adjustedAlpha = config.maxPValue / tests;
  const findings = candidates.filter((item) => item.eligible && item.pValue <= adjustedAlpha);
  findings.forEach((finding) => {
    finding.confidence = confidenceOf(finding.pValue, finding.support, finding.effect || 0);
    finding.adjustedAlpha = round(adjustedAlpha, 6);
  });
  findings.sort((a, b) => scoreFinding(b) - scoreFinding(a));
  const deduped = dedupeFindings(findings).slice(0, config.maxFindings);
  deduped.forEach((finding, index) => {
    finding.id = `corr-${index + 1}`;
  });

  const helpful = deduped.filter((item) => item.verdict === 'ajuda');
  const harmful = deduped.filter((item) => item.verdict === 'atrapalha');
  const phoneFindings = deduped.filter((item) => item.source.kind === 'phone');
  const supplementFindings = deduped.filter((item) => item.source.kind === 'supplement');

  return {
    generatedAt: new Date().toISOString(),
    windowDays: frame.windowDays,
    todayStr: frame.todayStr,
    observedDays: frame.dates.length,
    activeDays: frame.activeDays,
    phoneLoggedDays: frame.phoneLoggedDays,
    variables: frame.catalog.length,
    tested,
    ready: deduped.length > 0,
    minDays: config.minDays,
    thresholds: {
      minSupport: config.minSupport,
      maxPValue: config.maxPValue,
      tests,
      adjustedAlpha: round(adjustedAlpha, 6),
      minAbsPhi: config.minAbsPhi,
      minAbsBeta: config.minAbsBeta
    },
    summary: summarize(deduped, frame, config),
    findings: deduped,
    helpful: helpful.slice(0, 6),
    harmful: harmful.slice(0, 6),
    highlights: {
      phone: phoneFindings.slice(0, 3),
      supplements: supplementFindings.slice(0, 3)
    },
    coverage: coverage(frame, config)
  };
}

function dedupeFindings(findings) {
  const kept = [];
  const used = new Set();
  findings.forEach((finding) => {
    const key = [
      finding.family,
      finding.lag,
      finding.source.id,
      finding.target.id
    ].join('|');
    if (used.has(key)) return;
    // Um agregado ("Rituais cumpridos") não compete com o ritual específico
    // quando os dois apontam o mesmo alvo com o mesmo sinal.
    const broad = finding.source.id.startsWith('kind:')
      ? `${finding.family}|${finding.lag}|${finding.source.kind}|${finding.target.id}|${finding.direction}`
      : null;
    if (broad && used.has(broad)) return;
    used.add(key);
    if (broad) used.add(broad);
    kept.push(finding);
  });
  return kept;
}

function coverage(frame, config) {
  const groups = {};
  frame.catalog.forEach((item) => {
    if (!groups[item.group]) groups[item.group] = { group: item.group, variables: 0, usable: 0 };
    groups[item.group].variables += 1;
    if (item.presentDays >= config.minSupport) groups[item.group].usable += 1;
  });
  return Object.values(groups).sort((a, b) => b.usable - a.usable || b.variables - a.variables);
}

function summarize(findings, frame, config) {
  const usable = frame.catalog.filter((item) => item.presentDays >= config.minSupport && item.kind !== 'context').length;
  if (usable < 2) {
    return {
      headline: 'Ainda não há repetição suficiente para cruzar os dias.',
      detail: `Uma correlação precisa da mesma atividade em pelo menos ${config.minSupport} dias, e de outra para comparar. Hoje ${usable === 1 ? 'só uma variável chega' : 'nenhuma variável chega'} nesse piso. O registro diário — sobretudo celular e suplemento — é o que alimenta o motor.`
    };
  }
  if (!findings.length) {
    return {
      headline: 'Nenhum padrão passou no corte de confiança.',
      detail: 'Isso é um resultado, não uma falha: com a amostra atual, nenhuma ligação sobrevive ao teste e à correção para os vários pares examinados. Mais dias deixam um sinal fraco aparecer, ou confirmam que ele não existe.'
    };
  }
  const top = findings[0];
  const harmful = findings.find((item) => item.verdict === 'atrapalha');
  const detail = harmful && harmful.id !== top.id
    ? `O atrito mais claro: ${harmful.text}`
    : 'Nada disso prova causa. É o que os seus dias têm repetido com força suficiente para não parecer acaso.';
  return {
    headline: top.text,
    detail
  };
}

export function correlationReport(db = {}, options = {}) {
  return discoverCorrelations(db, options);
}
