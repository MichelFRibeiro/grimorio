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
  findQuantityHit,
  isEnergySkipped,
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
      : (db.quests || []).find(quest => quest.id === item.id);
  return {
    ...item,
    description: source?.description || '',
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
  const heuristic = computeNextAction(db, options);
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
    abstained,
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
  const heuristic = computeNextAction(db, options);
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
    const decision = persistDecision(db, {
      context: heuristic.context,
      item,
      energy,
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
      response: { chosenId: item.id, title: item.title }
    });
    return {
      ...base,
      source: 'heuristic',
      trace: publicTrace(trace),
      primary: publicPrimary(item, {
        decisionId: decision?.id,
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

    // Com abstenção não há dose a oferecer: nada é consultado.
    // Com energia alta a dose não existe e o cartão nunca mostra a
    // quantidade, então a chamada ao Jev seria desperdício — só o campo
    // estimatedMinutes (gratuito) continua sendo lido.
    let quantity = null;
    let dose = null;
    if (!abstained && (wantsDose || item.estimatedMinutes > 0)) {
      quantity = await resolveQuantity(db, item, traced, trace);
    }
    if (!abstained && wantsDose && quantity?.hasQuantity) {
      const dosed = await chooseDose({
        item,
        quantity,
        energy,
        learning: learningForPrompt(db)
      }, traced);
      dose = dosed.dose;
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

    if (abstained) {
      trace.push({
        step: 'choice',
        at: new Date().toISOString(),
        note: 'O Jev respondeu "none": nada parece realista agora. A sugestão abaixo é do histórico local, para não deixar o herói sem caminho.',
        response: { choice: 'none', probabilities: picked.probabilities }
      });
    }

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
  const score = reading?.score ?? localScore ?? NEUTRAL_ENERGY_SCORE;
  const saved = saveEnergyReading(db, {
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
        ? `Leitura local de emergência: energia ${score}/10 (subestimada de propósito).`
        : `Sem pista no texto: energia neutra ${score}/10.`
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
