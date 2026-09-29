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

async function resolveQuantity(db, item, options) {
  const sourceText = quantitySourceText(item);
  const cached = findQuantityRead(db, item.id, sourceText);
  if (cached) return cached;
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

export async function suggestNextAction(db, options = {}, jevOptions = {}) {
  ensureOracleMemory(db);
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
    jevError: null
  };

  if (!pool.length) {
    return { ...base, primary: null };
  }

  if (!energy || options.skipJev || !hasOpenRouterApiKey()) {
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
    const picked = await chooseActivity(state, pool, jevOptions);
    const chosen = picked.choice === 'none' ? null : findCandidate(pool, picked.choice);
    const item = withDescription(chosen || pool[0], db);
    let quantity = null;
    let dose = null;
    if (energy.score <= DOSE_ENERGY_MAX) {
      quantity = await resolveQuantity(db, item, jevOptions);
      if (quantity?.hasQuantity) {
        const dosed = await chooseDose({
          item,
          quantity,
          energy,
          learning: learningForPrompt(db)
        }, jevOptions);
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
      jevError: err.code || 'JEV_ERROR',
      primary: publicPrimary(item, {
        decisionId: decision?.id,
        reason: localReason(item)
      })
    };
  }
}

export async function recordEnergyAndSuggest(db, text, options = {}, jevOptions = {}) {
  const reading = await interpretEnergy(text, jevOptions);
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
