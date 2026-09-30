/**
 * Julgamentos do Oráculo via Jev: energia, atividade mais provável,
 * quantidade implícita e dose reduzida. O código faz a conta.
 */

import { callJevDecisions } from './jevClient.js';
import {
  AMOUNT_LADDER,
  DOSE_FRACTIONS,
  QUANTITY_UNITS,
  applyDose,
  buildLearningSummary,
  composeQuantity,
  declineReasonLabel,
  energyBand,
  explicitAmount,
  formatQuantity,
  nearestAmountId,
  energyFromJevScore
} from './oracleMemory.js';

const ENERGY_LEVELS = [
  '1 — exhausted, unable to start',
  '2 — drained, only a tiny step is realistic',
  '3 — very low, a short easy task at most',
  '4 — low, a reduced dose is realistic',
  '5 — mixed, neither spent nor fresh',
  '6 — okay, can start but may not finish a long task',
  '7 — good, ready for a normal task',
  '8 — strong, a demanding task is realistic',
  '9 — very energetic',
  '10 — at peak, ready for the hardest available task'
];

const UNIT_CRITERIA = {
  hours: 'A duration named in hours or fractions of an hour, such as half an hour, meia hora, or two hours. The magnitude is the number of hours, not minutes.',
  minutes: 'A duration already named in minutes, such as 15 minutes or 45 min. Not an hour-fraction.',
  pages: 'Pages of reading or writing.',
  questions: 'Exam or study questions.',
  reps: 'Physical repetitions, such as sit-ups or sets. Not a batch of documents or cases.',
  steps: 'Steps of a checklist or process.',
  chapters: 'Chapters of a book or course.',
  items: 'A counted batch of things, including an unfamiliar acronym or noun, such as 5 PABs, 15 recursos, or 8 aulas. A number plus a thing is items unless a unit above fits better.',
  none: 'The text states no amount and no duration, even implicitly. A digit next to a thing is not none.'
};

const AMOUNT_CRITERIA = {
  none: 'No amount is stated or implied.',
  quarter: 'One quarter of one unit, such as a quarter hour.',
  third: 'One third of one unit.',
  half: 'One half of one unit, such as half an hour or meia hora.',
  one: 'Exactly one.',
  two: 'Two.',
  three: 'Three.',
  four: 'Four.',
  five: 'Five.',
  six: 'Six.',
  eight: 'Eight.',
  ten: 'Ten.',
  twelve: 'Twelve.',
  fifteen: 'Fifteen.',
  twenty: 'Twenty.',
  twenty_five: 'Twenty-five.',
  thirty: 'Thirty.',
  forty: 'Forty.',
  forty_five: 'Forty-five.',
  fifty: 'Fifty.',
  sixty: 'Sixty.',
  ninety: 'Ninety.',
  hundred: 'One hundred.',
  hundred_twenty: 'One hundred and twenty.',
  hundred_fifty: 'One hundred and fifty.',
  two_hundred: 'Two hundred.',
  other: 'An amount is stated, but none of the listed magnitudes fit. Not the absence of an amount.'
};

const UNIT_CONFIDENCE_MIN = 0.45;
const MAGNITUDE_CONFIDENCE_MIN = 0.45;
const STATED_UNIT_CONFIDENCE_MIN = 0.2;

/**
 * Leitura local de energia, usada só quando o Jev não responde.
 * Erra para baixo de propósito: energia subestimada oferece dose menor,
 * energia superestimada empurraria uma tarefa grande em cima do herói.
 */
const ENERGY_HINTS = [
  { re: /\b(exaust[oa]|esgotad[oa]|acabad[oa]|destru[íi]d[oa]|sem for[çc]as|n[ãa]o consigo|exhausted|drained|burned out)\b/i, score: 1 },
  { re: /\b(muito cansad[oa]|cansad[íi]ssim[oa]|arrasad[oa]|na lona|batid[oa]|de rastos)\b/i, score: 2 },
  { re: /\b(cansad[oa]|com sono|sonolent[oa]|desanimad[oa]|pra baixo|para baixo|triste|tired|sleepy|wiped)\b/i, score: 3 },
  { re: /\b(pouca energia|sem energia|devagar|dif[íi]cil|lent[oa]|low energy|sluggish)\b/i, score: 4 },
  { re: /\b(mais ou menos|assim assim|neutr[oa]|razo[áa]vel|mixed|meh)\b/i, score: 5 },
  { re: /\b(bem|tranquil[oa]|consigo|d[áa] para|firme|ok|okay|good|fine)\b/i, score: 6 },
  { re: /\b(dispost[oa]|animad[oa]|motivad[oa]|pront[oa]|boa|bom|ready|motivated)\b/i, score: 7 },
  { re: /\b(muito bem|[óo]tim[oa]|empolgad[oa]|energizad[oa]|forte|great|strong)\b/i, score: 8 },
  { re: /\b(no pique|a todo vapor|voando|excelente|impec[áa]vel|peak|amazing)\b/i, score: 9 }
];

export function localEnergyFromText(text) {
  const source = String(text || '');
  if (!source.trim()) return null;
  const scores = ENERGY_HINTS
    .filter(hint => hint.re.test(source))
    .map(hint => hint.score);
  if (!scores.length) return null;
  return Math.min(...scores);
}

function choiceAnswer(result, id) {
  const answer = result?.answers?.[id];
  if (!answer || answer.type !== 'choice' || !answer.choice) return null;
  return answer;
}

/**
 * O vencedor argmax não basta. "5 PABs" já voltou com none à frente de
 * items por uma margem ínfima e confiança 0,28. Nesse caso a massa em
 * none não é uma leitura, é incerteza — e none não pode vencer um
 * empate técnico contra uma unidade real.
 */
export function resolveChoice(answer, { reject = [], minConfidence = 0, noneMargin = 0.15 } = {}) {
  if (!answer?.choice) return null;
  const probabilities = answer.probabilities || {};
  const ranked = Object.entries(probabilities)
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => b[1] - a[1]);
  const [leader, runnerUp] = ranked;
  const rejected = new Set(reject);
  let choice = answer.choice;
  if (choice === 'none' && runnerUp && !rejected.has(runnerUp[0]) && leader[1] - runnerUp[1] < noneMargin) {
    choice = runnerUp[0];
  }
  if (rejected.has(choice) || choice === 'none') return null;
  const confidence = Number.isFinite(answer.confidence) ? answer.confidence : (leader?.[1] ?? 0);
  if (confidence < minConfidence) return null;
  return choice;
}

function scoreAnswer(result, id) {
  const answer = result?.answers?.[id];
  if (!answer || answer.type !== 'score' || answer.score == null) return null;
  return answer;
}

export async function interpretEnergy(text, options = {}) {
  const result = await callJevDecisions({
    state: {
      prompt: 'The person was asked "How are you right now?" and answered in their own words.',
      answer: text
    },
    questions: {
      energy: {
        type: 'score',
        instructions: 'What energy level from 1 to 10 does this self-report describe? 1 is exhausted and 10 is peak.',
        criteria: ENERGY_LEVELS
      }
    }
  }, { ...options, step: 'energy' });
  const answer = scoreAnswer(result, 'energy');
  if (!answer) {
    const error = new Error('Jev não devolveu a energia');
    error.code = 'BAD_ANSWER';
    throw error;
  }
  return {
    score: energyFromJevScore(answer.score),
    rawScore: answer.score,
    confidence: answer.confidence ?? null,
    usage: result.usage || null
  };
}

function candidateCard(item) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    category: item.category,
    priority: item.priority,
    due: item.dueDate || null,
    window: item.timeWindow || null,
    streak: item.currentStreak,
    localReasons: item.reasons || [],
    estimatedMinutes: item.estimatedMinutes || null
  };
}

export const KIND_LABEL = {
  victory: 'planned victory of the day',
  habit: 'ritual',
  quest: 'quest'
};

export function buildChoiceState({ context, candidates, energy, learning, recentActions }) {
  return {
    moment: {
      location: context?.locationLabel || context?.location || null,
      date: context?.date || null,
      hour: context?.hour ?? null,
      weekday: context?.dayOfWeek ?? null
    },
    energy: energy ? {
      text: energy.text,
      score: energy.score,
      band: energyBand(energy.score),
      confidence: energy.confidence
    } : null,
    recentActions: recentActions || [],
    learning: learning || null,
    candidates: (candidates || []).map(candidateCard),
    instruction: 'Pick the one activity this person is most likely to start right now. Prefer a likely start over the formally most important task. Use energy, prior accepts and declines, and what they usually do at this hour and weekday. A planned victory of the day is the person\'s own plan for today: keep it unless it is clearly unrealistic right now. Choose none if nothing fits.'
  };
}

export async function chooseActivity(state, candidates, options = {}) {
  const criteria = { none: 'None of these activities is realistic to start right now.' };
  (candidates || []).forEach(item => {
    criteria[item.id] = [
      item.title,
      KIND_LABEL[item.kind] || KIND_LABEL.quest,
      item.category || '',
      item.priority || ''
    ].filter(Boolean).join(' · ');
  });
  const result = await callJevDecisions({
    state,
    questions: {
      most_likely_now: {
        type: 'choice',
        instructions: 'Which single activity is this person most likely to start right now?',
        criteria
      }
    }
  }, { ...options, step: 'choice' });
  const answer = choiceAnswer(result, 'most_likely_now');
  if (!answer) {
    const error = new Error('Jev não escolheu uma atividade');
    error.code = 'BAD_ANSWER';
    throw error;
  }
  return {
    choice: answer.choice,
    probability: answer.probabilities?.[answer.choice] ?? null,
    confidence: answer.confidence ?? null,
    probabilities: answer.probabilities || {},
    usage: result.usage || null
  };
}

export function quantitySourceText(item) {
  return [item?.title, item?.description].filter(Boolean).join(' — ').slice(0, 400);
}

export async function interpretQuantity(item, options = {}) {
  const sourceText = quantitySourceText(item);
  const result = await callJevDecisions({
    state: {
      title: item?.title || '',
      description: item?.description || '',
      note: 'Read the number that is written, including one next to an unfamiliar word. "5 PABs", "15 recursos" and "8 aulas" are counted batches: unit items, magnitude of that number. "meia hora" means 30 minutes. "uma hora e meia" means 90 minutes. "10 abdominais" means 10 repetitions. none means no number at all.'
    },
    questions: {
      has_quantity: {
        type: 'noul',
        instructions: 'Does this task state or imply a countable amount or a duration? A digit next to a thing counts, even if the thing is an acronym you do not know.',
        criteria: {
          true: 'An amount or duration is explicit or can be interpreted, such as half an hour, 5 PABs, or 15 recursos.',
          false: 'The task is open-ended and names no amount or duration.'
        }
      },
      unit: {
        type: 'choice',
        instructions: 'If there is an amount, which unit is it? Choose none when there is no amount.',
        criteria: UNIT_CRITERIA
      },
      magnitude: {
        type: 'choice',
        instructions: 'If there is an amount, which magnitude matches it, before converting hours into minutes? Choose none when there is no amount.',
        criteria: AMOUNT_CRITERIA
      }
    }
  }, { ...options, step: 'quantity' });
  const present = result?.answers?.has_quantity;
  const unit = choiceAnswer(result, 'unit');
  const magnitude = choiceAnswer(result, 'magnitude');
  const stated = explicitAmount(sourceText);
  const statedId = nearestAmountId(stated);
  // O número escrito não depende do modelo. Com ele no texto, o Jev só
  // classifica a unidade, e uma vitória fraca de "none" não apaga o dígito.
  const unitChoice = resolveChoice(unit, {
    minConfidence: stated ? STATED_UNIT_CONFIDENCE_MIN : UNIT_CONFIDENCE_MIN
  });
  // A magnitude do Jev vem primeiro: o dígito do título pode ser o capítulo,
  // o número do processo ou a segunda medida ("2 capítulos e 30 páginas").
  // O dígito escrito é o plano B quando o Jev não lê magnitude nenhuma.
  const jevMagnitude = resolveChoice(magnitude, {
    reject: ['other'],
    minConfidence: MAGNITUDE_CONFIDENCE_MIN
  });
  const magnitudeId = jevMagnitude || statedId || null;
  // Dígito fora da régua (7, 9, 300…) vira valor explícito. Horas ficam de
  // fora: um dígito solto antes de "horas" viraria uma dose absurda.
  const explicitValue = !magnitudeId && unitChoice !== 'hours' ? stated : null;
  const hasMagnitude = !!magnitudeId || explicitValue != null;
  const statedEnough = stated != null || (present?.noul ?? 0) >= 0.6;
  const hasQuantity = !!unitChoice && hasMagnitude && statedEnough;
  const composed = composeQuantity(hasQuantity, unitChoice, magnitudeId, explicitValue);
  return {
    sourceText,
    hasQuantity: !!composed,
    unit: composed?.unit || null,
    amount: composed?.amount || null,
    amountId: composed?.amountId || null,
    confidence: Math.min(
      present?.noul ?? 0,
      unit?.confidence ?? 0,
      magnitude?.confidence ?? 0
    ),
    usage: result.usage || null
  };
}

export async function chooseDose({ item, quantity, energy, learning }, options = {}) {
  const result = await callJevDecisions({
    state: {
      energy: energy?.score ?? null,
      energyBand: energy ? energyBand(energy.score) : null,
      energyText: energy?.text || null,
      task: item?.title || '',
      fullAmount: formatQuantity(quantity.amount, quantity.unit),
      learning: learning || null,
      note: 'The original task must stay unchanged. Choose the smaller dose this person is most likely to start at this energy. Choose full when they are likely to take the whole task.'
    },
    questions: {
      dose: {
        type: 'choice',
        instructions: 'Which fraction of the original amount is this person most likely to start right now?',
        criteria: {
          tenth: 'About 10 percent. A very small start.',
          quarter: 'About 25 percent. A short dose, such as 15 minutes of a 60-minute task.',
          half: 'About half.',
          three_quarters: 'About 75 percent.',
          full: 'The whole original amount.'
        }
      }
    }
  }, { ...options, step: 'dose' });
  const answer = choiceAnswer(result, 'dose');
  const fraction = DOSE_FRACTIONS.some(step => step.id === answer?.choice) ? answer.choice : 'full';
  return {
    fraction,
    dose: applyDose(quantity, fraction),
    confidence: answer?.confidence ?? null,
    usage: result.usage || null
  };
}

export function recentActionCards(logs, limit = 8) {
  const relevant = new Set([
    'quest_complete',
    'habit_complete',
    'reading_session',
    'exam_questions',
    'mind_map_study',
    'process_step'
  ]);
  return (logs || [])
    .filter(log => log && relevant.has(log.type))
    .slice(0, limit)
    .map(log => ({
      type: log.type,
      title: log.title || '',
      hour: log.hour ?? null,
      weekday: log.dayOfWeek ?? null,
      date: log.date || null,
      minutes: log.details?.durationMinutes || null,
      category: log.details?.category || null
    }));
}

export function learningForPrompt(db) {
  const summary = buildLearningSummary(db);
  return {
    recentOutcomes: summary.recent,
    byEnergyBand: summary.byBand,
    declineReasons: 'tired, no_time, wrong_place, not_priority, similar_done, not_feeling, other'
  };
}

export function localReason(item) {
  return item?.reason || (item?.kind === 'victory'
    ? 'Vitória planejada para hoje'
    : (item?.kind === 'habit' ? 'Ritual pendente agora' : 'Missão pendente agora'));
}

export function declineText(reason, note) {
  const label = declineReasonLabel(reason);
  return note ? `${label}: ${note}` : label;
}

export { QUANTITY_UNITS, AMOUNT_LADDER };
