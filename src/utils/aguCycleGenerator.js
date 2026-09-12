import {
  AGU_BLOCK_QUESTION_TARGET,
  AGU_CORE_SUBJECTS,
  AGU_DAILY_BLOCKS,
  AGU_DISCURSIVE_ROTATION,
  AGU_LONG_AFTERNOON_BLOCKS,
  AGU_PRODUCT_META,
  AGU_SHORT_AFTERNOON_BLOCKS,
  AGU_SUBJECTS,
  AGU_WINDOW_SUBJECTS,
  blockKey,
  getAguSubject,
  getEditalProfile,
  recommendPlatform
} from '../data/aguCurriculum.js';
import { addDaysToDateStr, getSaoPauloDayOfWeek, mondayOfDateStr } from './timeUtils.js';
import {
  currentTopicForSubject,
  detectPhase,
  rankSubjects,
  windowN
} from './aguFragility.js';
import { buildDayBlocks, buildTopicProgress, collectStudyBlocks } from './aguStudyEngine.js';

const DAY_LABELS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

const DISCURSIVE_PROMPTS = {
  parecer: {
    constitucional: 'Elabore parecer, em até 30 linhas, sobre a constitucionalidade de ato normativo federal que restrinja direito fundamental sob o argumento de interesse público. Indique controle, parâmetros e conclusão.',
    administrativo: 'Elabore parecer jurídico da AGU sobre a anulação de ato administrativo já exaurido, à luz da segurança jurídica, da Lei 9.784/1999 e da LINDB. Conclua de forma objetiva.',
    seguridade: 'Elabore parecer sobre a possibilidade de revisão de benefício previdenciário contra a Fazenda Pública, com fundamentos constitucionais e da legislação do RGPS.',
    default: 'Elabore parecer da advocacia pública sobre o tema do tópico corrente, com ementa, relatório, fundamentação e conclusão.'
  },
  peca: {
    default: 'Redija peça judicial da Fazenda Pública (contestação, apelação ou mandado de segurança, conforme o tópico), com fatos, direito e pedidos.'
  },
  dissertacao: {
    default: 'Disserte, em até 30 linhas, sobre o tópico corrente, com introdução, desenvolvimento fundamentado em Constituição/lei/jurisprudência e conclusão.'
  },
  oral: {
    default: 'Grave ou recite por 10–15 min um outline oral do tópico: tese, 3 fundamentos e fechamento. Salve o outline no vault.'
  },
  esqueleto: {
    default: 'Monte só o esqueleto do parecer: ementa de 3 linhas, 4 tópicos de fundamentação e conclusão de 2 linhas. Não precisa redigir o texto inteiro.'
  }
};

function cloneCapacity(plan) {
  const base = plan?.capacityByWeekday || {};
  return {
    0: Number(base[0] ?? 0),
    1: Number(base[1] ?? 225),
    2: Number(base[2] ?? 110),
    3: Number(base[3] ?? 225),
    4: Number(base[4] ?? 110),
    5: Number(base[5] ?? 225),
    6: Number(base[6] ?? 0)
  };
}

export function fortnightStartFor(dateStr) {
  return mondayOfDateStr(dateStr);
}

export function isLongAfternoon(weekday) {
  return weekday === 1 || weekday === 3 || weekday === 5;
}

export function afternoonBlockCap(weekday, capacityByWeekday) {
  if (weekday === 0 || weekday === 6) return AGU_DAILY_BLOCKS;
  const minutes = Number(capacityByWeekday?.[weekday] ?? 0);
  if (minutes > 0 && minutes < 180) return Math.min(AGU_DAILY_BLOCKS, AGU_SHORT_AFTERNOON_BLOCKS);
  if (isLongAfternoon(weekday)) return AGU_DAILY_BLOCKS;
  return AGU_DAILY_BLOCKS;
}

export function questionTargetFor(kind, weekday, longAfternoon) {
  if (kind === 'teoria' || kind === 'informativo' || kind === 'discursiva') return 0;
  return AGU_BLOCK_QUESTION_TARGET;
}

function allowedSubjectIds(plan) {
  const profile = getEditalProfile(plan?.editalProfileId);
  const keepPortuguese = plan?.keepPortuguese !== false;
  if (plan?.phase === 'lock' || plan?.editalPublished) {
    const ids = new Set((profile.subjects || []).map((s) => s.id));
    (profile.addedSubjects || []).forEach((s) => ids.add(s.id));
    [...(profile.removedSubjectIds || []), ...(plan.removedSubjectIds || [])].forEach((id) => ids.delete(id));
    if (keepPortuguese) ids.add('portugues');
    return ids;
  }
  const ids = new Set(AGU_SUBJECTS.map((s) => s.id));
  if (!keepPortuguese) ids.delete('portugues');
  return ids;
}

function makeBlock({
  dateStr,
  weekday,
  window,
  subjectId,
  kind,
  topicId,
  topicName,
  reasons,
  target,
  optional = false,
  targetProduct = null,
  prompt = null
}) {
  const subject = getAguSubject(subjectId);
  const long = isLongAfternoon(weekday);
  const resolvedTarget = target != null ? target : questionTargetFor(kind, weekday, long);
  return {
    subjectId,
    kind,
    topicId: topicId || null,
    topicName: topicName || null,
    window,
    optional,
    target: resolvedTarget,
    reasons: reasons || [],
    targetProduct,
    prompt,
    vaultPath: targetProduct
      ? `Entradas/Concursos/AGU/Tec Concursos/Discursivas/`
      : null,
    key: blockKey(dateStr, subjectId, kind, topicId)
  };
}

function pickCursor(plan, subjectId, ranked) {
  const subject = getAguSubject(subjectId);
  if (!subject) return null;
  const row = ranked.find((r) => r.subject.id === subjectId);
  return row?.cursor || currentTopicForSubject(plan, subject);
}

function consecutiveSame(prevSubjectId, subjectId, weight) {
  if (!prevSubjectId || prevSubjectId !== subjectId) return false;
  return (weight || 0) < 4;
}

function takeRanked(ranked, allowed, usedToday, prevAfternoon, excludeIds = []) {
  return ranked.find((row) => {
    const id = row.subject.id;
    if (!allowed.has(id)) return false;
    if (excludeIds.includes(id)) return false;
    if (usedToday.has(id) && row.subject.weight < 4) return false;
    if (consecutiveSame(prevAfternoon, id, row.subject.weight)) return false;
    return row.score > 0;
  }) || ranked.find((row) => allowed.has(row.subject.id) && row.score > 0);
}

function discursiveProduct(plan, phase) {
  if (phase === 'fundacao') return 'esqueleto';
  const rotation = AGU_DISCURSIVE_ROTATION;
  let index = Number(plan?.discursiveRotationIndex) || 0;
  if (phase !== 'simulados' && phase !== 'lock' && rotation[index % rotation.length] === 'oral') {
    index += 1;
  }
  return rotation[index % rotation.length];
}

function discursivePrompt(product, subjectId) {
  const pack = DISCURSIVE_PROMPTS[product] || DISCURSIVE_PROMPTS.dissertacao;
  return pack[subjectId] || pack.default;
}

function countKinds(days, pred) {
  let n = 0;
  days.forEach((day) => {
    (day.blocks || []).forEach((block) => {
      if (pred(block, day)) n += 1;
    });
  });
  return n;
}

function contentBlock(block) {
  return ['questoes', 'teoria', 'simulado', 'lei-seca', 'erros', 'discursiva', 'informativo', 'revisao'].includes(block.kind);
}

export function validateCycleGuarantees(days, phase, plan) {
  const keepPortuguese = plan?.keepPortuguese !== false;
  const bySubject = {};
  days.forEach((day) => {
    (day.blocks || []).forEach((block) => {
      if (!contentBlock(block)) return;
      if (!bySubject[block.subjectId]) bySubject[block.subjectId] = [];
      bySubject[block.subjectId].push(block);
    });
  });
  const count = (id, kinds) => (bySubject[id] || []).filter((b) => !kinds || kinds.includes(b.kind)).length;
  const weekdayContent = (id) => days.reduce((sum, day) => {
    if (day.weekday === 0 || day.weekday === 6) return sum;
    return sum + (day.blocks || []).filter((b) => b.subjectId === id && contentBlock(b)).length;
  }, 0);

  const missing = [];
  const minConst = phase === 'fundacao' ? 3 : phase === 'aprofundamento' ? 2 : 1;
  const minAdm = minConst;
  const minPort = phase === 'fundacao' ? 4 : phase === 'aprofundamento' ? 3 : 2;
  if (count('constitucional') < minConst) missing.push(`constitucional ≥ ${minConst}`);
  if (count('administrativo') < minAdm) missing.push(`administrativo ≥ ${minAdm}`);
  if (keepPortuguese && weekdayContent('portugues') < minPort && phase !== 'lock') missing.push(`português ≥ ${minPort}`);
  if (count('seguridade') < 1 && phase !== 'lock') missing.push('seguridade ≥ 1');
  if (count('leg-agu', ['lei-seca']) < 1) missing.push('leg-agu lei-seca');
  if (count('leg-agu', ['questoes']) < 1 && phase === 'fundacao') missing.push('leg-agu questões');
  if (phase === 'fundacao') {
    if (count('tributario') < 1) missing.push('tributário');
    if (count('financeiro') < 1) missing.push('financeiro');
    if (count('civil') < 1) missing.push('civil');
    if (count('processual-civil') < 1) missing.push('processual-civil');
  }
  const erros = countKinds(days, (b) => b.kind === 'erros');
  const minErros = phase === 'simulados' || phase === 'lock' ? 3 : 2;
  if (erros < minErros) missing.push(`erros ≥ ${minErros}`);
  const leiSecaExtra = countKinds(days, (b) => b.kind === 'lei-seca' && b.subjectId !== 'leg-agu');
  if (phase === 'fundacao' && leiSecaExtra < 3) missing.push('lei-seca extra ≥ 3');
  if (countKinds(days, (b) => b.kind === 'discursiva') < 1) missing.push('discursiva');
  return missing;
}

function injectGuarantee(days, subjectId, kind, ranked, plan, reason) {
  const longDays = days.filter((d) => d.weekday === 1 || d.weekday === 3 || d.weekday === 5);
  const candidates = longDays.slice().reverse();
  for (const day of candidates) {
    const extras = (day.blocks || []).filter((b) => b.window === 'afternoon');
    const victim = extras.filter((b) => b.kind === 'questoes' && b.subjectId === 'portugues').pop()
      || extras.filter((b) => b.kind === 'questoes' && !AGU_CORE_SUBJECTS.includes(b.subjectId)).pop()
      || extras.filter((b) => b.kind === 'questoes').pop();
    if (!victim) continue;
    const cursor = pickCursor(plan, subjectId, ranked);
    const idx = day.blocks.indexOf(victim);
    day.blocks[idx] = makeBlock({
      dateStr: day.dateStr,
      weekday: day.weekday,
      window: 'afternoon',
      subjectId,
      kind,
      topicId: cursor?.topicId,
      topicName: cursor?.topicName,
      reasons: [reason],
      optional: victim.optional
    });
    return true;
  }
  const weekend = days.find((d) => d.weekday === 6 || d.weekday === 0);
  if (weekend) {
    const cursor = pickCursor(plan, subjectId, ranked);
    weekend.blocks.push(makeBlock({
      dateStr: weekend.dateStr,
      weekday: weekend.weekday,
      window: 'afternoon',
      subjectId,
      kind,
      topicId: cursor?.topicId,
      topicName: cursor?.topicName,
      reasons: [reason],
      optional: true
    }));
    return true;
  }
  return false;
}

function lastTouchedMap(generatedCycles = []) {
  const map = {};
  generatedCycles.forEach((cycle, index) => {
    (cycle.days || []).forEach((day) => {
      (day.blocks || []).forEach((block) => {
        map[block.subjectId] = index + 1;
      });
    });
  });
  return map;
}

function applyWindowConstraint(days, plan, ranked, phase) {
  const n = windowN(phase);
  const history = lastTouchedMap(plan?.generatedCycles || []);
  const cycleNumber = (plan?.generatedCycles?.length || 0) + 1;
  AGU_WINDOW_SUBJECTS.forEach((subjectId) => {
    const last = history[subjectId] || 0;
    const gap = last === 0 ? n : cycleNumber - last;
    const already = days.some((day) => (day.blocks || []).some((b) => b.subjectId === subjectId));
    if (!already && gap >= n) {
      injectGuarantee(days, subjectId, 'questoes', ranked, plan, `janela N=${n}: ${subjectId} sem toque`);
    }
  });
}

function seedPairings() {
  return {
    1: { morning: { subjectId: 'constitucional', kind: 'lei-seca' }, afternoon: ['constitucional', 'portugues'] },
    2: { morning: { subjectId: 'administrativo', kind: 'erros' }, afternoon: ['administrativo'] },
    3: { morning: { subjectId: 'administrativo', kind: 'lei-seca' }, afternoon: ['tributario', 'portugues'] },
    4: { morning: { subjectId: 'civil', kind: 'erros' }, afternoon: ['civil'] },
    5: { morning: { subjectId: 'leg-agu', kind: 'lei-seca' }, afternoon: ['administrativo', 'seguridade'] },
    6: { afternoon: ['financeiro', 'constitucional'] },
    0: { afternoon: ['leg-agu', 'administrativo'] }
  };
}

function week2Pairings() {
  return {
    1: { morning: { subjectId: 'constitucional', kind: 'lei-seca' }, afternoon: ['constitucional', 'portugues'] },
    2: { morning: { subjectId: 'ambiental', kind: 'erros' }, afternoon: ['ambiental'] },
    3: { morning: { subjectId: 'tributario', kind: 'lei-seca' }, afternoon: ['tributario', 'portugues'] },
    4: { morning: { subjectId: 'processual-civil', kind: 'erros' }, afternoon: ['processual-civil'] },
    5: { morning: { subjectId: 'financeiro', kind: 'lei-seca' }, afternoon: ['financeiro', 'portugues'] },
    6: { afternoon: ['constitucional', 'administrativo'] },
    0: { afternoon: ['constitucional', 'agrario'] }
  };
}

function fillFromPairing(day, pairing, plan, ranked, phase, weekIndex) {
  const weekday = day.weekday;
  const long = isLongAfternoon(weekday);
  if (pairing.morning && weekday >= 1 && weekday <= 5) {
    const cursor = pickCursor(plan, pairing.morning.subjectId, ranked);
    day.blocks.push(makeBlock({
      dateStr: day.dateStr,
      weekday,
      window: 'morning',
      subjectId: pairing.morning.subjectId,
      kind: pairing.morning.kind,
      topicId: cursor?.topicId,
      topicName: cursor?.topicName,
      reasons: ['semente / manhã estrutural'],
      optional: false
    }));
  }

  if (weekday >= 1 && weekday <= 5) {
    const mainId = pairing.afternoon[0];
    const cursor = pickCursor(plan, mainId, ranked);
    day.blocks.push(makeBlock({
      dateStr: day.dateStr,
      weekday,
      window: 'afternoon',
      subjectId: mainId,
      kind: 'teoria',
      topicId: cursor?.topicId,
      topicName: cursor?.topicName,
      reasons: ['teoria curta antes da questão'],
      optional: false
    }));
    day.blocks.push(makeBlock({
      dateStr: day.dateStr,
      weekday,
      window: 'afternoon',
      subjectId: mainId,
      kind: 'questoes',
      topicId: cursor?.topicId,
      topicName: cursor?.topicName,
      reasons: ['questões do mesmo tópico'],
      optional: false
    }));
    if (long && pairing.afternoon[1]) {
      const secondId = pairing.afternoon[1];
      const secondCursor = pickCursor(plan, secondId, ranked);
      const kind = secondId === 'seguridade' || secondId === 'leg-agu' ? 'questoes' : 'questoes';
      day.blocks.push(makeBlock({
        dateStr: day.dateStr,
        weekday,
        window: 'afternoon',
        subjectId: secondId,
        kind,
        topicId: secondCursor?.topicId,
        topicName: secondCursor?.topicName,
        reasons: secondId === 'portugues' ? ['garantia de português no 3º bloco'] : ['3º bloco / garantia'],
        optional: false
      }));
    }
  }

  if (weekday === 6) {
    if (weekIndex === 0) {
      day.blocks.push(makeBlock({
        dateStr: day.dateStr, weekday, window: 'afternoon',
        subjectId: pairing.afternoon[0], kind: 'questoes',
        topicId: pickCursor(plan, pairing.afternoon[0], ranked)?.topicId,
        topicName: pickCursor(plan, pairing.afternoon[0], ranked)?.topicName,
        reasons: ['sábado bônus — volume ou virgem'],
        optional: true, target: 40
      }));
      day.blocks.push(makeBlock({
        dateStr: day.dateStr, weekday, window: 'afternoon',
        subjectId: pairing.afternoon[1] || 'constitucional', kind: 'erros',
        topicId: pickCursor(plan, pairing.afternoon[1] || 'constitucional', ranked)?.topicId,
        reasons: ['sábado bônus — caderno de erros'],
        optional: true, target: 20
      }));
    } else {
      const simuladoKind = phase === 'fundacao' ? 'questoes' : 'simulado';
      day.blocks.push(makeBlock({
        dateStr: day.dateStr, weekday, window: 'afternoon',
        subjectId: 'constitucional', kind: simuladoKind,
        topicId: pickCursor(plan, 'constitucional', ranked)?.topicId,
        reasons: [phase === 'fundacao' ? 'sábado 2 — volume núcleo' : 'sábado 2 — simulado misto'],
        optional: true, target: 40
      }));
      day.blocks.push(makeBlock({
        dateStr: day.dateStr, weekday, window: 'afternoon',
        subjectId: 'administrativo', kind: 'erros',
        reasons: ['sábado 2 — erros'],
        optional: true, target: 20
      }));
    }
  }

  if (weekday === 0) {
    const product = discursiveProduct(plan, phase);
    const discSubject = pairing.afternoon[1] || pairing.afternoon[0] || 'administrativo';
    day.blocks.push(makeBlock({
      dateStr: day.dateStr, weekday, window: 'afternoon',
      subjectId: discSubject, kind: 'discursiva',
      topicId: pickCursor(plan, discSubject, ranked)?.topicId,
      topicName: pickCursor(plan, discSubject, ranked)?.topicName,
      reasons: ['domingo bônus — discursiva com produto'],
      optional: true, target: 0,
      targetProduct: product,
      prompt: discursivePrompt(product, discSubject)
    }));
    const leiId = pairing.afternoon[0] === 'leg-agu' ? 'leg-agu' : (weekIndex === 0 ? 'leg-agu' : 'constitucional');
    if (weekIndex === 0) {
      day.blocks.push(makeBlock({
        dateStr: day.dateStr, weekday, window: 'afternoon',
        subjectId: 'leg-agu', kind: 'lei-seca',
        reasons: ['domingo — lei seca AGU'],
        optional: true, target: 15
      }));
    } else {
      day.blocks.push(makeBlock({
        dateStr: day.dateStr, weekday, window: 'afternoon',
        subjectId: leiId === 'agrario' ? 'agrario' : 'constitucional',
        kind: leiId === 'agrario' ? 'questoes' : 'informativo',
        reasons: [leiId === 'agrario' ? 'janela agrário / extras' : 'informativo STF/STJ'],
        optional: true, target: leiId === 'agrario' ? 10 : 0
      }));
    }
  }
}

function fillByScore(day, plan, ranked, allowed, prevAfternoon) {
  const weekday = day.weekday;
  if (weekday === 0 || weekday === 6) return prevAfternoon;
  const used = new Set((day.blocks || []).map((b) => b.subjectId));
  const long = isLongAfternoon(weekday);
  const cap = afternoonBlockCap(weekday, cloneCapacity(plan));
  const afternoon = (day.blocks || []).filter((b) => b.window === 'afternoon');
  if (afternoon.length >= cap) {
    return afternoon[0]?.subjectId || prevAfternoon;
  }
  if (afternoon.length === 0) {
    const pick = takeRanked(ranked, allowed, used, prevAfternoon);
    if (!pick) return prevAfternoon;
    const cursor = pick.cursor;
    day.blocks.push(makeBlock({
      dateStr: day.dateStr, weekday, window: 'afternoon',
      subjectId: pick.subject.id, kind: 'teoria',
      topicId: cursor?.topicId, topicName: cursor?.topicName,
      reasons: [`fragilidade ${pick.score}`]
    }));
    day.blocks.push(makeBlock({
      dateStr: day.dateStr, weekday, window: 'afternoon',
      subjectId: pick.subject.id, kind: 'questoes',
      topicId: cursor?.topicId, topicName: cursor?.topicName,
      reasons: [`mesmo tópico · acerto suavizado ${Math.round((pick.stats.accSmooth || 0) * 100)}%`]
    }));
    used.add(pick.subject.id);
    prevAfternoon = pick.subject.id;
  }
  const afternoonNow = (day.blocks || []).filter((b) => b.window === 'afternoon');
  if (long && afternoonNow.length < cap) {
    const portOk = allowed.has('portugues');
    const portCount = day.blocks.filter((b) => b.subjectId === 'portugues').length;
    const second = (portOk && portCount === 0)
      ? ranked.find((r) => r.subject.id === 'portugues')
      : takeRanked(ranked, allowed, used, prevAfternoon, [afternoonNow[0]?.subjectId]);
    if (second) {
      const cursor = second.cursor;
      day.blocks.push(makeBlock({
        dateStr: day.dateStr, weekday, window: 'afternoon',
        subjectId: second.subject.id, kind: 'questoes',
        topicId: cursor?.topicId, topicName: cursor?.topicName,
        reasons: second.subject.id === 'portugues'
          ? ['3º bloco — português']
          : [`3º bloco — score ${second.score}`]
      }));
    }
  }
  if (!(day.blocks || []).some((b) => b.window === 'morning') && weekday >= 1 && weekday <= 5) {
    const main = (day.blocks || []).find((b) => b.window === 'afternoon');
    const subject = getAguSubject(main?.subjectId);
    const kind = subject?.leiSeca ? 'lei-seca' : 'erros';
    const cursor = pickCursor(plan, main?.subjectId || 'constitucional', ranked);
    day.blocks.unshift(makeBlock({
      dateStr: day.dateStr, weekday, window: 'morning',
      subjectId: main?.subjectId || 'constitucional',
      kind,
      topicId: cursor?.topicId, topicName: cursor?.topicName,
      reasons: [kind === 'lei-seca' ? 'manhã — lei seca do tópico' : 'manhã — caderno de erros']
    }));
  }
  return (day.blocks.find((b) => b.window === 'afternoon') || {}).subjectId || prevAfternoon;
}

function injectDebt(days, plan, ranked) {
  const debt = [...(plan?.debt || [])];
  if (debt.length === 0) return days;
  const weekdaySlots = days.filter((d) => d.weekday >= 1 && d.weekday <= 5);
  let weekendCharged = 0;
  debt.forEach((item) => {
    const cursor = pickCursor(plan, item.subjectId, ranked);
    const block = makeBlock({
      dateStr: '',
      weekday: 1,
      window: 'afternoon',
      subjectId: item.subjectId,
      kind: item.kind || 'questoes',
      topicId: item.topicId || cursor?.topicId,
      topicName: cursor?.topicName,
      reasons: [`dívida de ${item.fromDate || 'ciclo anterior'}`],
      target: item.remainingQuestions || undefined,
      targetProduct: item.productMissing ? item.targetProduct : null
    });
    const isWeekendDebt = item.fromWeekday === 0 || item.fromWeekday === 6;
    if (isWeekendDebt && weekendCharged >= 1) {
      const weekend = days.find((d) => d.weekday === 6) || days.find((d) => d.weekday === 0);
      if (weekend) {
        block.dateStr = weekend.dateStr;
        block.weekday = weekend.weekday;
        block.optional = true;
        block.key = blockKey(weekend.dateStr, block.subjectId, block.kind, block.topicId);
        weekend.blocks.push(block);
      }
      return;
    }
    const host = weekdaySlots.find((d) => (d.blocks || []).filter((b) => b.window === 'afternoon').length < afternoonBlockCap(d.weekday, cloneCapacity(plan)));
    if (host) {
      block.dateStr = host.dateStr;
      block.weekday = host.weekday;
      block.key = blockKey(host.dateStr, block.subjectId, block.kind, block.topicId);
      host.blocks.push(block);
      if (isWeekendDebt) weekendCharged += 1;
    } else {
      const weekend = days.find((d) => d.weekday === 6);
      if (weekend) {
        block.dateStr = weekend.dateStr;
        block.optional = true;
        block.weekday = 6;
        block.key = blockKey(weekend.dateStr, block.subjectId, block.kind, block.topicId);
        weekend.blocks.push(block);
      }
    }
  });
  return days;
}

function labelForDay(weekday, weekIndex, blocks) {
  if (weekday === 6) return weekIndex === 0 ? 'Sábado — volume e erros' : 'Sábado — simulado e erros';
  if (weekday === 0) return weekIndex === 0 ? 'Domingo — AGU e parecer' : 'Domingo — discursiva e extras';
  const main = (blocks || []).find((b) => b.window === 'afternoon' && b.kind === 'teoria')
    || (blocks || []).find((b) => b.window === 'afternoon');
  const subject = getAguSubject(main?.subjectId);
  return subject ? subject.name : DAY_LABELS[weekday];
}

export function collectDebtFromCycle(cycle, todayStr, completedBlocks = {}, examQuestions = []) {
  if (!cycle?.days) return [];
  const debt = [];
  cycle.days.forEach((day) => {
    if (day.dateStr >= todayStr) return;
    (day.blocks || []).forEach((block) => {
      if (block.optional && (day.weekday === 0 || day.weekday === 6)) {
        const done = Boolean(completedBlocks[block.key]) || Boolean(block.done);
        if (!done && block.kind === 'discursiva' && !block.productLogged) {
          debt.push({
            fromDate: day.dateStr,
            fromWeekday: day.weekday,
            subjectId: block.subjectId,
            topicId: block.topicId,
            kind: block.kind,
            remainingQuestions: 0,
            productMissing: true,
            targetProduct: block.targetProduct,
            reason: 'discursiva pulada'
          });
        } else if (!done) {
          debt.push({
            fromDate: day.dateStr,
            fromWeekday: day.weekday,
            subjectId: block.subjectId,
            topicId: block.topicId,
            kind: block.kind,
            remainingQuestions: block.target || 0,
            reason: 'fim de semana pulado'
          });
        }
        return;
      }
      if (block.optional) return;
      const marked = Boolean(completedBlocks[block.key]);
      if (block.kind === 'discursiva') {
        if (!block.productLogged && !marked) {
          debt.push({
            fromDate: day.dateStr,
            fromWeekday: day.weekday,
            subjectId: block.subjectId,
            topicId: block.topicId,
            kind: 'discursiva',
            productMissing: true,
            targetProduct: block.targetProduct,
            reason: 'discursiva sem produto'
          });
        }
        return;
      }
      if (block.target > 0 && ['questoes', 'erros', 'simulado', 'revisao', 'lei-seca'].includes(block.kind)) {
        const solved = (examQuestions || []).filter((e) => (
          (e.date || '') === day.dateStr && (e.subjectId === block.subjectId || e.blockKey === block.key)
        )).reduce((sum, e) => sum + (e.totalQuestions || 0), 0);
        const remaining = Math.max(0, (block.target || 0) - solved);
        if (remaining > 0) {
          debt.push({
            fromDate: day.dateStr,
            fromWeekday: day.weekday,
            subjectId: block.subjectId,
            topicId: block.topicId,
            kind: block.kind,
            remainingQuestions: remaining,
            reason: `faltaram ${remaining} questões`
          });
        }
      } else if (!marked && block.kind === 'teoria') {
        debt.push({
          fromDate: day.dateStr,
          fromWeekday: day.weekday,
          subjectId: block.subjectId,
          topicId: block.topicId,
          kind: 'teoria',
          remainingQuestions: 0,
          reason: 'teoria pulada'
        });
      }
    });
  });
  return debt;
}

export function generateFortnight(plan, examQuestions, todayStr, options = {}) {
  const phase = options.phase || detectPhase(plan, examQuestions, todayStr);
  const start = options.startDate || fortnightStartFor(options.anchorDate || todayStr);
  const cycleNumber = options.cycleNumber || (plan?.generatedCycles?.length || 0) + 1;
  const { ranked } = rankSubjects({ ...plan, phase }, examQuestions, todayStr);
  const topicProgress = JSON.parse(JSON.stringify(buildTopicProgress(plan, examQuestions, todayStr)));
  const historyBlocks = collectStudyBlocks(plan, examQuestions);
  const days = [];

  for (let i = 0; i < 14; i += 1) {
    const dateStr = addDaysToDateStr(start, i);
    const weekday = getSaoPauloDayOfWeek(dateStr);
    const weekIndex = i < 7 ? 0 : 1;
    const built = buildDayBlocks(plan, examQuestions, dateStr, {
      topicProgress,
      blocks: historyBlocks,
      preview: dateStr !== todayStr,
      pinExisting: dateStr === todayStr,
      advanceProgress: true
    });
    const unique = [];
    const usedSubjects = new Set();
    (built.blocks || []).forEach((block) => {
      if (block.subjectId && usedSubjects.has(block.subjectId)) return;
      if (block.subjectId) usedSubjects.add(block.subjectId);
      unique.push(block);
    });
    const blocks = unique.map((block, index) => ({
      ...block,
      window: index === 0 ? 'morning' : 'afternoon',
      optional: false,
      target: AGU_BLOCK_QUESTION_TARGET,
      targetMinutes: block.targetMinutes || 60,
      key: block.key || blockKey(dateStr, block.subjectId, block.kind, block.topicId)
    }));
    days.push({
      dateStr,
      weekday,
      weekdayLabel: DAY_LABELS[weekday],
      weekIndex,
      optional: false,
      blocks,
      label: labelForDay(weekday, weekIndex, blocks),
      questionTarget: blocks.reduce((sum, b) => sum + (b.target || 0), 0),
      portugueseRequired: built.portugueseRequired,
      portugueseToday: built.portugueseToday
    });
  }

  const reasons = [
    '3 blocos/dia · 60 min ou 20 questões · 1 tópico por bloco',
    builtPortugueseReason(days, topicProgress)
  ].filter(Boolean);
  ranked.slice(0, 4).forEach((row) => {
    reasons.push(`${row.subject.name}: score ${row.score} · ${row.stats.solved} q · ${row.mastery.label}`);
  });

  return {
    number: cycleNumber,
    start,
    end: addDaysToDateStr(start, 13),
    phase,
    days,
    reasons,
    warnings: [],
    generatedAt: new Date().toISOString()
  };
}

function builtPortugueseReason(days, topicProgress) {
  const hasPort = days.some((day) => (day.blocks || []).some((b) => b.subjectId === 'portugues'));
  if (hasPort) return 'Português obrigatório em 1 bloco/dia até 95% nos 10 últimos blocos da matéria.';
  const row = Object.values(topicProgress || {}).find((t) => t.subjectId === 'portugues');
  return row ? 'Português dispensado (10 últimos blocos ≥ 95%).' : '';
}

export { DISCURSIVE_PROMPTS, AGU_PRODUCT_META };
