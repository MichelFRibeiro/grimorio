/**
 * Indicação única do Oráculo.
 * O motor local filtra o que é possível agora. O Jev escolhe uma atividade
 * e, com energia baixa, uma dose menor. A tarefa original não é editada.
 */

import { computeNextAction } from './nextAction.js';
import { hasOpenRouterApiKey } from './jevClient.js';
import {
  DECLINE_REASONS,
  DOSE_ENERGY_MAX,
  acceptPartialDose,
  activeSnoozedIds,
  energyBand,
  ensureOracleMemory,
  findOracleDecision,
  findQuantityHit,
  isEnergySkipped,
  latestEnergyReading,
  oracleUid,
  saveEnergyReading,
  saveOracleDecision,
  saveQuantityRead,
  snoozeEntity,
  startDoseForEnergy,
  formatQuantity
} from './oracleMemory.js';
import {
  buildChoiceState,
  chooseActivity,
  chooseDose,
  chooseStartDose,
  interpretEnergy,
  interpretQuantity,
  learningForPrompt,
  localEnergyFromText,
  localReason,
  quantitySourceText,
  recentActionCards
} from './oracleJev.js';
import { getSaoPauloDateStr, getSaoPauloHour, getSaoPauloDayOfWeek } from './timeUtils.js';

const CANDIDATE_CAP = 24;
const NEUTRAL_ENERGY_SCORE = 5;

function resolveNow(options = {}) {
  if (options.now instanceof Date) return options.now;
  if (options.now) return new Date(options.now);
  return new Date();
}

function eligiblePool(heuristic) {
  const pool = [];
  if (heuristic.primary) pool.push(heuristic.primary);
  (heuristic.queue || []).forEach(item => pool.push(item));
  (heuristic.extras || []).forEach(item => {
    if (!pool.some(existing => existing.id === item.id)) pool.push(item);
  });
  return pool.slice(0, CANDIDATE_CAP);
}

function findCandidate(pool, id) {
  return pool.find(item => item.id === id) || null;
}

function withDescription(item, db) {
  if (!item) return item;
  // A Vitória do Dia não vive em quests nem em habits: procurar no array
  // errado deixava a candidata sem descrição para o Jev.
  const source = item.kind === 'habit'
    ? (db.habits || []).find(habit => habit.id === item.id)
    : item.kind === 'victory'
      ? (db.dailyVictories || []).find(victory => victory.id === item.id)
      : item.kind === 'reading'
        ? (db.books || []).find(book => book.id === item.id)
        : item.kind === 'mindmap'
          ? (db.mindMaps || []).find(map => map.id === item.id)
          : item.kind === 'agu'
            ? null
            : (db.quests || []).find(quest => quest.id === item.id);
  return {
    ...item,
    description: source?.description || item.description || '',
    estimatedMinutes: source?.estimatedMinutes || item.estimatedMinutes || null
  };
}

function energyPayload(energy) {
  if (!energy) return null;
  return {
    id: energy.id,
    score: energy.score,
    text: energy.text,
    createdAt: energy.createdAt,
    confidence: energy.confidence ?? null,
    source: energy.source === 'local' ? 'local' : 'jev'
  };
}

function publicPrimary(item, extra = {}) {
  if (!item) return null;
  return {
    ...item,
    reason: extra.reason || localReason(item),
    dose: extra.dose || null,
    quantity: extra.quantity || null,
    decisionId: extra.decisionId || null,
    suggestionLabel: extra.suggestionLabel || null,
    abstained: !!extra.abstained
  };
}

function heuristicReason({ energy, skipped }) {
  if (energy) return null;
  if (skipped) return 'Você pulou a leitura de energia. Indicação pelo histórico local.';
  return 'Sem leitura de energia nesta janela. Indicação pelo histórico local.';
}

/**
 * Retrato sem efeitos colaterais: mesma forma da resposta do Jev, mas sem
 * consultar ninguém nem gravar decisão. É o que a tela usa em cada
 * atualização de estado — antes a ausência de `needsEnergy` aqui fazia o
 * cartão esconder a indicação e pedir a energia de novo.
 */
export function previewNextAction(db, options = {}) {
  ensureOracleMemory(db);
  const now = resolveNow(options);
  const heuristic = computeNextAction(db, {
    ...options,
    snoozedIds: [...new Set([...(options.snoozedIds || []), ...activeSnoozedIds(db, now)])]
  });
  const energy = options.energyReading || latestEnergyReading(db, now);
  const skipped = !energy && isEnergySkipped(db, now);
  const pool = eligiblePool(heuristic);
  const pick = pool[0] ? withDescription(pool[0], db) : null;
  return {
    ...heuristic,
    primary: pick ? publicPrimary(pick, { reason: heuristicReason({ energy, skipped }) }) : null,
    queue: [],
    extras: [],
    declineReasons: DECLINE_REASONS,
    energy: energyPayload(energy),
    needsEnergy: !energy && !skipped,
    energySkipped: skipped,
    source: 'preview',
    jevError: null,
    abstained: false,
    trace: []
  };
}

async function resolveQuantity(db, item, options, trace) {
  const sourceText = quantitySourceText(item);
  // Leitura já confirmada para este texto exato: reaproveita e economiza uma
  // chamada. Um "sem quantidade" nunca é reaproveitado (o modelo pode ter
  // errado a sigla), então continua sendo consultado de novo.
  const cached = findQuantityHit(db, item.id, sourceText);
  if (cached) {
    trace.push({
      step: 'quantity',
      at: new Date().toISOString(),
      cached: true,
      note: 'Quantidade reaproveitada da memória do Oráculo: o texto da tarefa não mudou.',
      response: cached
    });
    return cached;
  }
  if (item.estimatedMinutes > 0 && !item.description) {
    const direct = {
      entityId: item.id,
      kind: item.kind,
      sourceText,
      hasQuantity: true,
      unit: 'minutes',
      amount: item.estimatedMinutes,
      amountId: null,
      confidence: 1
    };
    trace.push({
      step: 'quantity',
      at: new Date().toISOString(),
      cached: false,
      note: 'Quantidade lida do campo estimatedMinutes, sem chamada ao Jev.',
      response: direct
    });
    return saveQuantityRead(db, direct) || direct;
  }
  const interpreted = await interpretQuantity(item, options);
  return saveQuantityRead(db, {
    entityId: item.id,
    kind: item.kind,
    ...interpreted
  }) || interpreted;
}

/**
 * A leitura de quantidade não pode derrubar a indicação inteira: sem ela
 * ainda há a dose de partida (tempo).
 */
async function resolveQuantitySafely(db, item, options, trace) {
  try {
    return await resolveQuantity(db, item, options, trace);
  } catch (err) {
    trace.push({
      step: 'quantity',
      at: new Date().toISOString(),
      ok: false,
      error: err?.message || 'Falha ao ler a quantidade',
      note: 'Sem quantidade declarada: a dose será um tempo de partida.'
    });
    return null;
  }
}

/**
 * Com quantidade declarada, o Jev escolhe a fração. Sem quantidade, o Jev
 * escolhe um tempo de partida — e a faixa de energia garante a dose se ele
 * não responder. Em nenhum caso a tarefa original é alterada.
 */
async function resolveDoseSafely({ db, item, quantity, energy, options, trace }) {
  const learning = learningForPrompt(db);
  if (quantity?.hasQuantity) {
    try {
      const dosed = await chooseDose({ item, quantity, energy, learning }, options);
      return dosed.dose?.reduced ? dosed.dose : null;
    } catch (err) {
      trace.push({
        step: 'dose',
        at: new Date().toISOString(),
        ok: false,
        error: err?.message || 'Falha ao sugerir a dose',
        note: 'A indicação segue sem dose reduzida; a tarefa continua inteira.'
      });
      return null;
    }
  }
  try {
    const dosed = await chooseStartDose({ item, energy, learning }, options);
    return dosed.dose || startDoseForEnergy(energy.score);
  } catch (err) {
    const fallback = startDoseForEnergy(energy.score);
    trace.push({
      step: 'dose',
      at: new Date().toISOString(),
      ok: false,
      error: err?.message || 'Falha ao sugerir a dose',
      note: `Dose de partida pela faixa de energia: ${fallback.label}.`,
      response: fallback
    });
    return fallback;
  }
}

function persistDecision(db, {
  context,
  item,
  energy,
  quantity,
  dose,
  source,
  probability,
  confidence,
  abstained = false
}) {
  return saveOracleDecision(db, {
    id: oracleUid('od'),
    createdAt: new Date().toISOString(),
    suggestedAt: new Date().toISOString(),
    date: context?.date || null,
    hour: context?.hour ?? null,
    dayOfWeek: context?.dayOfWeek ?? null,
    weekday: context?.dayOfWeek ?? null,
    location: context?.location || null,
    entityId: item.id,
    kind: item.kind,
    title: item.title,
    category: item.category || null,
    energyReadingId: energy?.id || null,
    energyScore: energy?.score ?? null,
    energyBand: energy?.score == null ? null : energyBand(energy.score),
    quantity: quantity?.hasQuantity ? { amount: quantity.amount, unit: quantity.unit } : null,
    dose: dose ? {
      amount: dose.amount,
      unit: dose.unit,
      fraction: dose.fraction,
      label: dose.label
    } : null,
    source,
    probability,
    confidence,
    abstained,
    outcome: 'pending'
  });
}

const TRACE_SECRET = /sk-or-|bearer\s+|api[_-]?key|authorization/i;

function scrubTraceValue(value, depth = 0) {
  if (value == null || depth > 6) return value ?? null;
  if (typeof value === 'string') {
    if (TRACE_SECRET.test(value)) return '[omitido]';
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map(item => scrubTraceValue(item, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([key, item]) => {
      if (TRACE_SECRET.test(key)) return;
      // O texto cru da energia não volta para o navegador.
      if (key === 'text' || key === 'answer' || key === 'energyText') return;
      out[key] = scrubTraceValue(item, depth + 1);
    });
    return out;
  }
  return value;
}

function publicTrace(trace) {
  return (trace || []).map(entry => ({
    step: entry.step,
    at: entry.at,
    note: entry.note || null,
    cached: !!entry.cached,
    ok: entry.ok !== false,
    status: entry.status || null,
    error: entry.error || null,
    request: scrubTraceValue(entry.request),
    response: scrubTraceValue(entry.response)
  }));
}

function basePayload(heuristic, { energy, skipped, source = 'heuristic', jevError = null, abstained = false }) {
  return {
    ...heuristic,
    queue: [],
    extras: [],
    declineReasons: DECLINE_REASONS,
    energy: energyPayload(energy),
    needsEnergy: !energy && !skipped,
    energySkipped: skipped,
    source,
    jevError,
    abstained,
    trace: []
  };
}

export async function suggestNextAction(db, options = {}, jevOptions = {}) {
  ensureOracleMemory(db);
  const now = resolveNow(options);
  const trace = [];
  const traced = { ...jevOptions, trace };
  const heuristic = computeNextAction(db, {
    ...options,
    snoozedIds: [...new Set([...(options.snoozedIds || []), ...activeSnoozedIds(db, now)])]
  });
  const pool = eligiblePool(heuristic);
  const energy = options.energyReading || latestEnergyReading(db, now);
  const skipped = !energy && isEnergySkipped(db, now);
  const base = basePayload(heuristic, { energy, skipped });

  if (!pool.length) {
    trace.push({
      step: 'filter',
      at: new Date().toISOString(),
      note: 'Nenhuma atividade elegível neste lugar e horário.',
      response: { deferredByLocation: heuristic.deferredByLocation, deferredByTime: heuristic.deferredByTime }
    });
    return { ...base, primary: null, trace: publicTrace(trace) };
  }

  trace.push({
    step: 'filter',
    at: new Date().toISOString(),
    note: 'O motor local filtrou lugar, janela e ritual vencido. O Jev só escolhe entre estes.',
    response: {
      context: heuristic.context,
      eligible: pool.map(item => ({
        id: item.id,
        title: item.title,
        kind: item.kind,
        score: item.score,
        reasons: item.reasons
      })),
      excludedByLocation: heuristic.deferredByLocation,
      excludedByTime: heuristic.deferredByTime
    }
  });

  // Pular a energia vale como resposta: sem leitura, o motor local indica e a
  // tela não volta a perguntar dentro da janela do "pular".
  if (!energy || options.skipJev || !hasOpenRouterApiKey()) {
    const item = withDescription(pool[0], db);
    // Com energia conhecida e baixa, a dose de partida sai do próprio motor
    // local: sem chave do OpenRouter o herói não fica sem o fragmento.
    const localDose = energy && energy.score <= DOSE_ENERGY_MAX
      ? startDoseForEnergy(energy.score)
      : null;
    const decision = persistDecision(db, {
      context: heuristic.context,
      item,
      energy,
      dose: localDose,
      source: 'heuristic'
    });
    trace.push({
      step: 'fallback',
      at: new Date().toISOString(),
      note: !energy
        ? (skipped
          ? 'Leitura de energia pulada. A indicação veio do motor local.'
          : 'Sem leitura de energia nesta janela. A indicação veio do motor local.')
        : (!hasOpenRouterApiKey()
          ? 'Sem chave do OpenRouter. A indicação veio do motor local.'
          : 'Consulta ao Jev desligada nesta rodada. A indicação veio do motor local.'),
      response: { chosenId: item.id, title: item.title, dose: localDose?.label || null }
    });
    return {
      ...base,
      source: 'heuristic',
      trace: publicTrace(trace),
      primary: publicPrimary(item, {
        decisionId: decision?.id,
        dose: localDose,
        suggestionLabel: localDose ? `Agora: ${localDose.label}` : null,
        reason: heuristicReason({ energy, skipped }) || localReason(item)
      })
    };
  }

  try {
    const state = buildChoiceState({
      context: heuristic.context,
      candidates: pool.map(item => withDescription(item, db)),
      energy,
      learning: learningForPrompt(db),
      recentActions: recentActionCards(db.actionLogs)
    });
    const picked = await chooseActivity(state, pool, traced);
    const abstained = picked.choice === 'none';
    const chosen = abstained ? null : findCandidate(pool, picked.choice);
    const item = withDescription(chosen || pool[0], db);
    const wantsDose = energy.score <= DOSE_ENERGY_MAX;

    if (abstained) {
      trace.push({
        step: 'choice',
        at: new Date().toISOString(),
        note: 'O Jev respondeu "none": nada parece realista agora. A indicação abaixo é do histórico local, com dose de partida.',
        response: { choice: 'none', probabilities: picked.probabilities }
      });
    }

    // A dose NÃO depende da abstenção: com energia baixa o fragmento é
    // justamente o que é realista, e é quando o Jev mais tende a dizer "none".
    // Cada etapa falha sozinha: um erro na dose não pode derrubar a escolha.
    let quantity = null;
    let dose = null;
    if (wantsDose || item.estimatedMinutes > 0) {
      quantity = await resolveQuantitySafely(db, item, traced, trace);
    }
    if (wantsDose) {
      dose = await resolveDoseSafely({
        db,
        item,
        quantity,
        energy,
        options: traced,
        trace
      });
    }

    const decision = persistDecision(db, {
      context: heuristic.context,
      item,
      energy,
      quantity,
      dose: dose?.reduced ? dose : null,
      source: chosen ? 'jev' : 'heuristic',
      probability: abstained ? null : picked.probability,
      confidence: abstained ? null : picked.confidence,
      abstained
    });

    const suggestionLabel = dose?.reduced ? `Agora: ${dose.label}` : null;
    return {
      ...base,
      source: chosen ? 'jev' : 'heuristic',
      abstained,
      trace: publicTrace(trace),
      primary: publicPrimary(item, {
        decisionId: decision?.id,
        dose: dose?.reduced ? dose : null,
        quantity: quantity?.hasQuantity ? {
          amount: quantity.amount,
          unit: quantity.unit,
          label: formatQuantity(quantity.amount, quantity.unit)
        } : null,
        suggestionLabel,
        abstained,
        reason: abstained
          ? 'O Jev não viu nada realista agora. Sugestão do histórico local.'
          : localReason(item)
      })
    };
  } catch (err) {
    trace.push({
      step: 'error',
      at: new Date().toISOString(),
      ok: false,
      error: err.message || 'Falha ao consultar o Jev',
      note: 'A indicação caiu no motor local.'
    });
    const item = withDescription(pool[0], db);
    // Queda do Jev não pode tirar o fragmento de quem está sem energia.
    const localDose = energy && energy.score <= DOSE_ENERGY_MAX
      ? startDoseForEnergy(energy.score)
      : null;
    const decision = persistDecision(db, {
      context: heuristic.context,
      item,
      energy,
      dose: localDose,
      source: 'heuristic'
    });
    return {
      ...base,
      source: 'heuristic',
      trace: publicTrace(trace),
      jevError: err.code || 'JEV_ERROR',
      primary: publicPrimary(item, {
        decisionId: decision?.id,
        dose: localDose,
        suggestionLabel: localDose ? `Agora: ${localDose.label}` : null,
        reason: localReason(item)
      })
    };
  }
}

/**
 * Registra a energia e devolve a indicação.
 *
 * Se o Jev não responder, a leitura é gravada do mesmo jeito (com uma
 * estimativa local deliberadamente pessimista): antes a falha devolvia 502,
 * o texto do herói era perdido e ele ficava preso na pergunta.
 */
export async function recordEnergyAndSuggest(db, text, options = {}, jevOptions = {}) {
  ensureOracleMemory(db);
  const now = resolveNow(options);
  const energyTrace = [];
  let reading = null;
  let readingError = null;
  try {
    reading = await interpretEnergy(text, { ...jevOptions, trace: energyTrace });
  } catch (err) {
    readingError = err;
  }

  const localScore = localEnergyFromText(text);
  // Sem pista no texto a energia fica nula: forçar 5 empurrava uma dose.
  const score = reading?.score ?? localScore ?? null;
  const saved = score == null ? null : saveEnergyReading(db, {
    text,
    score,
    rawScore: reading?.rawScore ?? score,
    confidence: reading?.confidence ?? 0,
    source: reading ? 'jev' : 'local',
    date: options.date || getSaoPauloDateStr(now),
    hour: Number.isInteger(options.hour) ? options.hour : getSaoPauloHour(now),
    dayOfWeek: Number.isInteger(options.dayOfWeek) ? options.dayOfWeek : getSaoPauloDayOfWeek(now),
    location: options.location
  });

  if (!reading) {
    energyTrace.push({
      step: 'energy-fallback',
      at: new Date().toISOString(),
      ok: false,
      error: readingError?.message || 'Jev não devolveu a energia',
      note: localScore != null
        ? `Leitura local de emergência: energia ${score}/10.`
        : 'Sem pista no texto: energia não registrada. A dose não é forçada.'
    });
  }

  const suggestion = await suggestNextAction(db, {
    ...options,
    energyReading: saved
  }, jevOptions);
  suggestion.trace = [...publicTrace(energyTrace), ...(suggestion.trace || [])];
  return {
    reading: saved,
    suggestion,
    energyError: reading ? null : (readingError?.message || 'Leitura local de energia')
  };
}

export function snoozeAndRemember(db, { entityId, location, ttlMs } = {}) {
  const snooze = snoozeEntity(db, entityId, { location, ttlMs });
  if (!snooze) return { error: 'Não há o que adiar.', status: 400 };
  return { snooze };
}

export function declineAndRemember(db, { decisionId, reason, note }) {
  const decision = findOracleDecision(db, decisionId);
  if (!decision) return { error: 'Indicação não encontrada.', status: 404 };
  // Expirada é uma indicação sem resposta: o herói ainda pode dizer o porquê.
  if (decision.outcome !== 'pending' && decision.outcome !== 'expired') {
    return { error: 'Esta indicação já foi respondida.', status: 409 };
  }
  if (!DECLINE_REASONS.some(item => item.id === reason)) {
    return { error: 'Escolha um motivo.', status: 400 };
  }
  if (reason === 'other' && !String(note || '').trim()) {
    return { error: 'Escreva o motivo.', status: 400 };
  }
  const now = new Date().toISOString();
  decision.outcome = 'declined';
  decision.declineReason = reason;
  decision.declineNote = String(note || '').trim().slice(0, 240);
  decision.resolvedAt = now;
  decision.outcomeAt = now;
  return { decision };
}

export function acceptDoseOnly(db, decisionId) {
  const decision = acceptPartialDose(db, decisionId);
  if (!decision) return { error: 'Não há uma dose parcial pendente nesta indicação.', status: 404 };
  return { decision };
}
