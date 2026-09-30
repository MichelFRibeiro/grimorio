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
  ensureOracleMemory,
  findOracleDecision,
  findQuantityRead,
  latestEnergyReading,
  oracleUid,
  saveEnergyReading,
  saveOracleDecision,
  saveQuantityRead,
  formatQuantity
} from './oracleMemory.js';
import {
  buildChoiceState,
  chooseActivity,
  chooseDose,
  interpretEnergy,
  interpretQuantity,
  learningForPrompt,
  localReason,
  quantitySourceText,
  recentActionCards
} from './oracleJev.js';

const CANDIDATE_CAP = 24;

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
  const source = item.kind === 'habit'
    ? (db.habits || []).find(habit => habit.id === item.id)
    : (db.quests || []).find(quest => quest.id === item.id);
  return {
    ...item,
    description: source?.description || '',
    estimatedMinutes: source?.estimatedMinutes || item.estimatedMinutes || null
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
    suggestionLabel: extra.suggestionLabel || null
  };
}

function emptyPayload(heuristic, extras = {}) {
  return {
    ...heuristic,
    primary: null,
    queue: [],
    extras: [],
    source: extras.source || 'heuristic',
    energy: extras.energy || null,
    needsEnergy: !!extras.needsEnergy,
    declineReasons: DECLINE_REASONS,
    jevError: extras.jevError || null
  };
}

async function resolveQuantity(db, item, options, trace) {
  const sourceText = quantitySourceText(item);
  const cached = findQuantityRead(db, item.id, sourceText);
  if (cached) {
    trace.push({
      step: 'quantity',
      at: new Date().toISOString(),
      cached: true,
      note: 'Quantidade já interpretada para este texto. Nenhuma nova chamada ao Jev.',
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

function persistDecision(db, { context, item, energy, quantity, dose, source, probability, confidence }) {
  return saveOracleDecision(db, {
    id: oracleUid('od'),
    createdAt: new Date().toISOString(),
    date: context?.date || null,
    hour: context?.hour ?? null,
    dayOfWeek: context?.dayOfWeek ?? null,
    location: context?.location || null,
    entityId: item.id,
    kind: item.kind,
    title: item.title,
    category: item.category || null,
    energyReadingId: energy?.id || null,
    energyScore: energy?.score ?? null,
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
    outcome: 'pending'
  });
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
    request: entry.request || null,
    response: entry.response || null
  }));
}

export async function suggestNextAction(db, options = {}, jevOptions = {}) {
  ensureOracleMemory(db);
  const trace = [];
  const traced = { ...jevOptions, trace };
  const heuristic = computeNextAction(db, options);
  const pool = eligiblePool(heuristic);
  const energy = options.energyReading || latestEnergyReading(db, options.now ? new Date(options.now) : new Date());
  const base = {
    ...heuristic,
    queue: [],
    extras: [],
    declineReasons: DECLINE_REASONS,
    energy: energy ? {
      id: energy.id,
      score: energy.score,
      text: energy.text,
      createdAt: energy.createdAt
    } : null,
    needsEnergy: !energy,
    source: 'heuristic',
    jevError: null,
    trace: []
  };

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

  if (!energy || options.skipJev || !hasOpenRouterApiKey()) {
    const item = withDescription(pool[0], db);
    const decision = persistDecision(db, {
      context: heuristic.context,
      item,
      energy,
      source: 'heuristic'
    });
    trace.push({
      step: 'fallback',
      at: new Date().toISOString(),
      note: !hasOpenRouterApiKey()
        ? 'Sem chave do OpenRouter. A indicação veio do motor local.'
        : 'Sem leitura de energia nesta janela. A indicação veio do motor local.',
      response: { chosenId: item.id, title: item.title }
    });
    return {
      ...base,
      source: 'heuristic',
      trace: publicTrace(trace),
      primary: publicPrimary(item, {
        decisionId: decision?.id,
        reason: energy ? localReason(item) : 'Sem leitura de energia nesta janela. Indicação pelo histórico local.'
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
    const chosen = picked.choice === 'none' ? null : findCandidate(pool, picked.choice);
    const item = withDescription(chosen || pool[0], db);
    let quantity = null;
    let dose = null;
    if (energy.score <= DOSE_ENERGY_MAX) {
      quantity = await resolveQuantity(db, item, traced, trace);
      if (quantity?.hasQuantity) {
        const dosed = await chooseDose({
          item,
          quantity,
          energy,
          learning: learningForPrompt(db)
        }, traced);
        dose = dosed.dose;
      }
    } else {
      const cached = findQuantityRead(db, item.id, quantitySourceText(item));
      quantity = cached;
    }
    const decision = persistDecision(db, {
      context: heuristic.context,
      item,
      energy,
      quantity,
      dose: dose?.reduced ? dose : null,
      source: chosen ? 'jev' : 'heuristic',
      probability: picked.probability,
      confidence: picked.confidence
    });
    const suggestionLabel = dose?.reduced
      ? `Agora: ${dose.label}`
      : null;
    return {
      ...base,
      source: chosen ? 'jev' : 'heuristic',
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
        reason: localReason(item)
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
    const decision = persistDecision(db, {
      context: heuristic.context,
      item,
      energy,
      source: 'heuristic'
    });
    return {
      ...base,
      source: 'heuristic',
      trace: publicTrace(trace),
      jevError: err.code || 'JEV_ERROR',
      primary: publicPrimary(item, {
        decisionId: decision?.id,
        reason: localReason(item)
      })
    };
  }
}

export async function recordEnergyAndSuggest(db, text, options = {}, jevOptions = {}) {
  const energyTrace = [];
  const reading = await interpretEnergy(text, { ...jevOptions, trace: energyTrace });
  const saved = saveEnergyReading(db, {
    text,
    score: reading.score,
    rawScore: reading.rawScore,
    confidence: reading.confidence,
    date: options.date,
    hour: options.hour,
    dayOfWeek: options.dayOfWeek,
    location: options.location
  });
  const suggestion = await suggestNextAction(db, {
    ...options,
    energyReading: saved
  }, jevOptions);
  suggestion.trace = [...publicTrace(energyTrace), ...(suggestion.trace || [])];
  return { reading: saved, suggestion };
}

export function declineAndRemember(db, { decisionId, reason, note }) {
  const decision = findOracleDecision(db, decisionId);
  if (!decision) return { error: 'Indicação não encontrada.', status: 404 };
  if (decision.outcome !== 'pending') return { error: 'Esta indicação já foi respondida.', status: 409 };
  if (!DECLINE_REASONS.some(item => item.id === reason)) {
    return { error: 'Escolha um motivo.', status: 400 };
  }
  if (reason === 'other' && !String(note || '').trim()) {
    return { error: 'Escreva o motivo.', status: 400 };
  }
  decision.outcome = 'declined';
  decision.declineReason = reason;
  decision.declineNote = String(note || '').trim().slice(0, 240);
  decision.resolvedAt = new Date().toISOString();
  return { decision };
}

export function acceptDoseOnly(db, decisionId) {
  const decision = acceptPartialDose(db, decisionId);
  if (!decision) return { error: 'Não há uma dose parcial pendente nesta indicação.', status: 404 };
  return { decision };
}

export { emptyPayload };
