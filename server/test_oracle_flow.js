import './testEnv.js';
/**
 * Testes de contrato do fluxo "O Oráculo indica".
 *
 * Cobrem a ponte entre servidor e cartão (energia, pular, abstenção), a
 * memória (vitória, expiração, dedupe) e a leitura de quantidade.
 */

import {
  ACCEPT_WINDOW_MS,
  ENERGY_SKIP_TTL_MS,
  ensureOracleMemory,
  findQuantityHit,
  markDecisionAccepted,
  markEnergySkip,
  oracleMemoryStats,
  sanitizeOracleDecision,
  saveQuantityRead
} from './oracleMemory.js';
import { daysBetween, formatDayMonth } from './nextAction.js';
import { interpretQuantity, localEnergyFromText } from './oracleJev.js';
import {
  declineAndRemember,
  acceptDoseOnly,
  previewNextAction,
  recordEnergyAndSuggest,
  suggestNextAction
} from './oracleSuggest.js';
import { getSaoPauloDateStr, getSaoPauloHour } from './timeUtils.js';
import { startTestServer } from './testEnv.js';
import http from 'http';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ ${message}`);
}

function baseDb(overrides = {}) {
  return {
    userProfile: { currentLocation: 'office', locationManual: true },
    questCategories: [{ id: 'cat-1', name: 'INSS', defaultLocation: 'office' }],
    quests: [
      {
        id: 'q-peticao',
        title: 'Peticionar processo da Dona Socorro',
        description: '',
        category: 'INSS',
        priority: 'importante',
        location: 'office',
        completed: false
      }
    ],
    habits: [],
    dailyVictories: [],
    actionLogs: [],
    oracleEnergyReadings: [],
    oracleDecisions: [],
    oracleQuantityReads: [],
    oracleEnergySkip: null,
    ...overrides
  };
}

function fakeFetch(payload, status = 200) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  });
}

function choiceFetch(choice, probabilities = {}) {
  return fakeFetch({
    answers: {
      most_likely_now: {
        type: 'choice',
        choice,
        confidence: 0.7,
        probabilities
      }
    }
  });
}

function energyReading(score, createdAt = new Date().toISOString()) {
  return { id: `en-${score}`, text: `energia ${score}`, score, rawScore: score, confidence: 0.8, createdAt };
}

async function run() {
  process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'test-key';
  console.log('🧪 Testando o fluxo completo do Oráculo...\n');

  // ---------------------------------------------------------------- energia
  const previewDb = baseDb();
  const semEnergia = previewNextAction(previewDb, { location: 'office' });
  assert(semEnergia.needsEnergy === true, 'sem leitura, o retrato do estado pede energia');
  assert(semEnergia.primary?.id === 'q-peticao', 'sem leitura, o retrato já traz a indicação local');
  assert(Array.isArray(semEnergia.declineReasons) && semEnergia.declineReasons.length > 0, 'o retrato traz os motivos de recusa');
  assert(semEnergia.source === 'preview', 'o retrato não se diz consulta ao Jev');

  const comEnergiaDb = baseDb({ oracleEnergyReadings: [energyReading(6)] });
  const comEnergia = previewNextAction(comEnergiaDb, { location: 'office' });
  assert(comEnergia.needsEnergy === false, 'com leitura recente, o retrato NÃO volta a pedir energia');
  assert(comEnergia.energy?.score === 6, 'o retrato devolve a energia vigente');

  const velhaDb = baseDb({
    oracleEnergyReadings: [energyReading(6, new Date(Date.now() - 90 * 60 * 1000).toISOString())]
  });
  assert(previewNextAction(velhaDb, { location: 'office' }).needsEnergy === true, 'leitura vencida volta a pedir energia');

  // ----------------------------------------------------------------- pular
  // O botão "Pular" só aparece quando falta leitura de energia.
  const skipDb = baseDb();
  markEnergySkip(skipDb, {});
  const pulado = previewNextAction(skipDb, { location: 'office' });
  assert(pulado.needsEnergy === false, '"pular" vale para as próximas atualizações da tela');
  assert(pulado.energy === null && pulado.primary?.id === 'q-peticao', '"pular" mostra a indicação local sem energia');

  const skipSuggestion = await suggestNextAction(skipDb, { location: 'office', skipJev: true }, {
    fetchImpl: async () => { throw new Error('não deveria consultar o Jev'); }
  });
  assert(skipSuggestion.primary?.id === 'q-peticao', 'com "pular", a indicação sai do motor local');
  assert(skipSuggestion.trace.some(entry => entry.step === 'fallback' && /pulada/i.test(entry.note || '')), 'o processo registra que a energia foi pulada');

  const skipVencidoDb = baseDb({ oracleEnergySkip: { at: new Date(Date.now() - ENERGY_SKIP_TTL_MS - 1000).toISOString() } });
  assert(previewNextAction(skipVencidoDb, { location: 'office' }).needsEnergy === true, 'o "pular" expira junto com a leitura de energia');

  // ------------------------------------------- energia com o Jev indisponível
  const quedaDb = baseDb({ oracleEnergyReadings: [] });
  const queda = await recordEnergyAndSuggest(quedaDb, 'cansado, mas consigo algo curto', { location: 'office' }, {
    fetchImpl: async () => { throw Object.assign(new Error('sem rede'), { code: 'ENETUNREACH' }); }
  });
  assert(queda.reading?.score === 4, 'falha do Jev usa a média ponderada local, não o mínimo');
  assert(queda.reading?.source === 'local', 'a leitura de emergência fica marcada como local');
  assert(queda.suggestion.primary?.id === 'q-peticao', 'mesmo sem o Jev, o herói recebe uma indicação');
  assert(queda.suggestion.needsEnergy === false, 'a leitura de emergência libera o cartão para indicar');
  assert(queda.energyError, 'a falha de energia é informada na resposta');
  assert(quedaDb.oracleEnergyReadings[0]?.hour === getSaoPauloHour(), 'a energia é gravada com a hora de São Paulo');
  assert(quedaDb.oracleEnergyReadings[0]?.date === getSaoPauloDateStr(), 'a energia é gravada com a data civil de São Paulo');

  const vazioDb = baseDb();
  const semPista = await recordEnergyAndSuggest(vazioDb, 'vamos ver no que dá', { location: 'office' }, {
    fetchImpl: async () => { throw new Error('sem rede'); }
  });
  assert(semPista.reading == null, 'sem pista no texto, a energia não é inventada');
  assert(semPista.suggestion.needsEnergy === true, 'sem pista, o cartão continua pedindo a energia');

  // ------------------------------------------------------------- abstenção
  const abstencaoDb = baseDb();
  const abstencao = await suggestNextAction(abstencaoDb, { location: 'office', energyReading: energyReading(7) }, {
    fetchImpl: choiceFetch('none', { none: 0.8, 'q-peticao': 0.2 })
  });
  assert(abstencao.abstained === true, 'a abstenção do Jev é registrada na resposta');
  assert(abstencao.primary?.abstained === true, 'a sugestão local se declara como abstenção');
  assert(/não viu nada realista/i.test(abstencao.primary?.reason || ''), 'o motivo explica que a sugestão é do histórico local');
  assert(abstencaoDb.oracleDecisions[0]?.abstained === true, 'a decisão guarda a abstenção');
  assert(abstencaoDb.oracleDecisions[0]?.probability === null, 'abstenção não inventa probabilidade');

  // ---------------------------------------------------------------- vitória
  const vitoriaDb = baseDb({
    dailyVictories: [{ id: 'dv-1', date: getSaoPauloDateStr(), title: 'Finalizar a petição do INSS', category: 'INSS', completed: false }]
  });
  const vitoria = await suggestNextAction(vitoriaDb, { location: 'office', energyReading: energyReading(7) }, {
    fetchImpl: choiceFetch('dv-1', { 'dv-1': 0.9, 'q-peticao': 0.1 })
  });
  assert(vitoria.primary?.id === 'dv-1', 'a Vitória do Dia é a candidata indicada');
  const decisaoVitoria = vitoriaDb.oracleDecisions[0];
  assert(decisaoVitoria?.kind === 'victory', 'a decisão da vitória é gravada como vitória, não como missão');
  const aceita = markDecisionAccepted(vitoriaDb, { entityId: 'dv-1', kind: 'victory' });
  assert(aceita?.outcome === 'accepted', 'concluir a vitória marca a indicação como aceita');

  // ------------------------------------------------- memória: valores nulos
  const roundTrip = sanitizeOracleDecision(sanitizeOracleDecision({ id: 'x', entityId: 'e', probability: undefined, confidence: undefined }));
  assert(roundTrip.probability === null && roundTrip.confidence === null, 'campo ausente continua nulo depois de reidratar a memória');
  assert(sanitizeOracleDecision({ id: 'x', entityId: 'e' }).energyScore === null, 'energia ausente não vira zero');

  // --------------------------------------------------- expiração e dedupe
  const expiraDb = baseDb({
    oracleDecisions: [
      {
        id: 'od-antiga',
        entityId: 'q-peticao',
        kind: 'quest',
        title: 'Antiga',
        createdAt: new Date(Date.now() - ACCEPT_WINDOW_MS - 60000).toISOString(),
        outcome: 'pending'
      },
      {
        id: 'od-nova',
        entityId: 'q-peticao',
        kind: 'quest',
        title: 'Nova',
        createdAt: new Date().toISOString(),
        outcome: 'pending'
      }
    ]
  });
  ensureOracleMemory(expiraDb);
  assert(expiraDb.oracleDecisions.find(d => d.id === 'od-antiga')?.outcome === 'expired', 'indicação sem resposta expira na janela de aceite');
  assert(expiraDb.oracleDecisions.find(d => d.id === 'od-nova')?.outcome === 'pending', 'indicação recente continua pendente');
  const recusaTardia = declineAndRemember(expiraDb, { decisionId: 'od-antiga', reason: 'tired' });
  assert(recusaTardia.decision?.outcome === 'declined', 'ainda é possível dizer o motivo de uma indicação expirada');

  const dedupeDb = baseDb();
  const options = { location: 'office', energyReading: energyReading(7) };
  const jevOptions = { fetchImpl: choiceFetch('q-peticao', { 'q-peticao': 0.9 }) };
  await suggestNextAction(dedupeDb, options, jevOptions);
  await suggestNextAction(dedupeDb, options, jevOptions);
  assert(dedupeDb.oracleDecisions.length === 1, 'reprocessar a mesma indicação não cria decisão duplicada');
  assert(dedupeDb.oracleDecisions[0].outcome === 'pending', 'a decisão reaproveitada continua pendente');

  const substituidaDb = baseDb({
    oracleDecisions: [{
      id: 'od-velha',
      entityId: 'q-peticao',
      kind: 'quest',
      title: 'Peticionar processo da Dona Socorro',
      createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      outcome: 'pending'
    }]
  });
  await suggestNextAction(substituidaDb, options, jevOptions);
  assert(substituidaDb.oracleDecisions.length === 2, 'consulta antiga e consulta nova convivem no histórico');
  assert(substituidaDb.oracleDecisions[0].outcome === 'pending', 'a indicação mais recente é a que está valendo');
  assert(substituidaDb.oracleDecisions.find(d => d.id === 'od-velha')?.outcome === 'superseded', 'a indicação anterior da mesma atividade é substituída');

  const outraDb = baseDb({
    quests: [
      { id: 'q-peticao', title: 'Peticionar processo da Dona Socorro', description: '', category: 'INSS', priority: 'importante', location: 'office', completed: false },
      { id: 'q-materiais', title: 'Pedir materiais', description: '', category: 'INSS', priority: 'importante', location: 'office', completed: false, createdAt: '2026-01-01T00:00:00.000Z' }
    ],
    oracleDecisions: [{
      id: 'od-materiais',
      entityId: 'q-materiais',
      kind: 'quest',
      title: 'Pedir materiais',
      createdAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      outcome: 'pending'
    }]
  });
  await suggestNextAction(outraDb, options, jevOptions);
  assert(outraDb.oracleDecisions.find(d => d.id === 'od-materiais')?.outcome === 'pending', 'indicação de outra atividade continua aguardando resposta');

  // ------------------------------------------------------------- quantidade
  const sete = await interpretQuantity({ title: 'Ler 7 páginas', description: '' }, {
    fetchImpl: fakeFetch({
      answers: {
        has_quantity: { type: 'noul', noul: 0.9 },
        unit: { type: 'choice', choice: 'pages', confidence: 0.8, probabilities: { pages: 0.8, none: 0.1 } },
        magnitude: { type: 'choice', choice: 'none', confidence: 0.4, probabilities: { none: 0.5, other: 0.3 } }
      }
    })
  });
  assert(sete.hasQuantity && sete.amount === 7, 'número fora da régua (7 páginas) vira quantidade de verdade');

  const trezentas = await interpretQuantity({ title: 'Estudar 300 questões', description: '' }, {
    fetchImpl: fakeFetch({
      answers: {
        has_quantity: { type: 'noul', noul: 0.95 },
        unit: { type: 'choice', choice: 'questions', confidence: 0.9, probabilities: { questions: 0.9 } },
        magnitude: { type: 'choice', choice: 'other', confidence: 0.7, probabilities: { other: 0.7 } }
      }
    })
  });
  assert(trezentas.hasQuantity && trezentas.amount === 300, 'lote grande (300 questões) deixa de ficar sem dose');

  const misto = await interpretQuantity({ title: 'Ler 2 capítulos e 30 páginas', description: '' }, {
    fetchImpl: fakeFetch({
      answers: {
        has_quantity: { type: 'noul', noul: 0.95 },
        unit: { type: 'choice', choice: 'pages', confidence: 0.85, probabilities: { pages: 0.85, chapters: 0.1 } },
        magnitude: { type: 'choice', choice: 'thirty', confidence: 0.9, probabilities: { thirty: 0.9, two: 0.05 } }
      }
    })
  });
  assert(misto.hasQuantity && misto.amount === 30 && misto.unit === 'pages', 'a magnitude do Jev vence o primeiro dígito do título');

  const horas = await interpretQuantity({ title: 'Ler 30 páginas em 2 horas', description: '' }, {
    fetchImpl: fakeFetch({
      answers: {
        has_quantity: { type: 'noul', noul: 0.9 },
        unit: { type: 'choice', choice: 'hours', confidence: 0.9, probabilities: { hours: 0.9 } },
        magnitude: { type: 'choice', choice: 'two', confidence: 0.9, probabilities: { two: 0.9 } }
      }
    })
  });
  assert(horas.amount === 120 && horas.unit === 'minutes', 'horas continuam virando minutos pela régua, sem dígito solto');

  const cacheDb = baseDb();
  saveQuantityRead(cacheDb, {
    entityId: 'q-peticao',
    kind: 'quest',
    sourceText: 'Peticionar processo da Dona Socorro',
    hasQuantity: true,
    unit: 'steps',
    amount: 5,
    amountId: 'five',
    confidence: 0.9,
    readAt: new Date().toISOString()
  });
  assert(!!findQuantityHit(cacheDb, 'q-peticao', 'Peticionar processo da Dona Socorro'), 'leitura confirmada é encontrada para reaproveitamento');

  let quantityCalls = 0;
  const reuseDb = baseDb({
    oracleQuantityReads: [...cacheDb.oracleQuantityReads]
  });
  const reuse = await suggestNextAction(reuseDb, { location: 'office', energyReading: energyReading(4) }, {
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.questions.has_quantity) {
        quantityCalls += 1;
        return fakeFetch({ answers: {} })();
      }
      if (body.questions.dose) {
        return fakeFetch({ answers: { dose: { type: 'choice', choice: 'half', confidence: 0.8 } } })();
      }
      return choiceFetch('q-peticao', { 'q-peticao': 0.9 })();
    }
  });
  assert(quantityCalls === 0, 'quantidade já conhecida não gasta chamada ao Jev');
  assert(reuse.trace.some(entry => entry.step === 'quantity' && entry.cached), 'o processo mostra que a quantidade foi reaproveitada');
  assert(reuse.primary?.dose?.amount === 3 && reuse.primary?.dose?.reduced, 'a dose reduz 5 etapas pela metade sem sair da unidade');

  // --------------------------------------------- dose de partida (sem número)
  const aberta = {
    id: 'q-limpar',
    title: 'Limpar PAT',
    description: '',
    category: 'INSS',
    priority: 'importante',
    location: 'office',
    completed: false
  };

  const questComQuantidade = {
    id: 'q-pabs',
    title: 'Analisar 5 PABs',
    description: '',
    category: 'INSS',
    priority: 'importante',
    location: 'office',
    completed: false
  };

  const semQuantidade = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.questions.most_likely_now) return choiceFetch('q-limpar', { 'q-limpar': 0.9 })();
    if (body.questions.has_quantity) {
      return fakeFetch({
        answers: {
          has_quantity: { type: 'noul', noul: 0.1 },
          unit: { type: 'choice', choice: 'none', confidence: 0.8, probabilities: { none: 0.8 } },
          magnitude: { type: 'choice', choice: 'none', confidence: 0.8, probabilities: { none: 0.8 } }
        }
      })();
    }
    if (body.questions.start_minutes) {
      return fakeFetch({ answers: { start_minutes: { type: 'choice', choice: 'fifteen', confidence: 0.85, probabilities: { fifteen: 0.85 } } } })();
    }
    return fakeFetch({ answers: {} })();
  };

  const partidaDb = baseDb({ quests: [aberta] });
  const partida = await suggestNextAction(partidaDb, { location: 'office', energyReading: energyReading(2) }, {
    fetchImpl: semQuantidade
  });
  assert(partida.primary?.dose?.fraction === 'start', 'tarefa sem quantitativo recebe dose de partida, não fica sem dose');
  assert(partida.primary?.dose?.amount === 15, 'a dose de partida usa os minutos escolhidos pelo Jev');
  assert(partida.primary?.suggestionLabel === 'Agora: 15 min', 'a resposta anuncia a dose de partida (o cartão mostra o título + a dose)');
  assert(partida.primary?.quantity === null, 'dose de partida não inventa quantitativo para a tarefa');
  assert(partida.trace.some(entry => entry.step === 'dose'), 'o passo "Dose sugerida" aparece no processo');
  assert(partidaDb.oracleDecisions[0]?.dose?.label === '15 min', 'a decisão guarda a dose de partida');

  const aceitePartida = acceptDoseOnly(partidaDb, partida.primary.decisionId);
  assert(aceitePartida.decision?.outcome === 'completed', 'aceitar a dose de partida fecha o ciclo, mesmo sem quantitativo');

  // Sem resposta utilizável do Jev, a faixa de energia garante a dose.
  const faixaDb = baseDb({ quests: [aberta] });
  const faixa = await suggestNextAction(faixaDb, { location: 'office', energyReading: energyReading(2) }, {
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.questions.most_likely_now) return choiceFetch('q-limpar', { 'q-limpar': 0.9 })();
      if (body.questions.has_quantity) {
        return fakeFetch({ answers: { has_quantity: { type: 'noul', noul: 0.1 }, unit: { type: 'choice', choice: 'none', confidence: 0.8, probabilities: { none: 0.8 } }, magnitude: { type: 'choice', choice: 'none', confidence: 0.8, probabilities: { none: 0.8 } } } })();
      }
      return fakeFetch({ answers: {} })();
    }
  });
  assert(faixa.primary?.dose?.amount === 5 && faixa.primary?.dose?.source === 'local', 'energia 1-2 sem resposta do Jev cai na dose de partida de 5 min');

  // Jev fora do ar: a dose de partida continua saindo do motor local.
  const offlineDb = baseDb({ quests: [aberta] });
  const offline = await suggestNextAction(offlineDb, { location: 'office', energyReading: energyReading(3) }, {
    fetchImpl: async () => { throw new Error('sem rede'); }
  });
  assert(offline.primary?.dose?.amount === 10, 'com o Jev fora do ar, a dose de partida sai da faixa de energia');
  assert(offline.source === 'heuristic' && offline.primary?.suggestionLabel === 'Agora: 10 min', 'a indicação local também traz a dose');

  // Sem chave do OpenRouter, a dose de partida continua aparecendo.
  const noKeyDb = baseDb({ quests: [aberta] });
  const savedKey = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = '';
  try {
    const semChave = await suggestNextAction(noKeyDb, { location: 'office', energyReading: energyReading(5) });
    assert(semChave.primary?.dose?.amount === 15, 'sem chave do OpenRouter, a dose de partida ainda é sugerida');
  } finally {
    process.env.OPENROUTER_API_KEY = savedKey;
  }

  // A abstenção do Jev não pode tirar a dose: é quando ela mais importa.
  const abstencaoDoseDb = baseDb({ quests: [aberta] });
  const abstencaoDose = await suggestNextAction(abstencaoDoseDb, { location: 'office', energyReading: energyReading(2) }, {
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.questions.most_likely_now) return choiceFetch('none', { none: 0.9 })();
      if (body.questions.has_quantity) {
        return fakeFetch({ answers: { has_quantity: { type: 'noul', noul: 0.1 }, unit: { type: 'choice', choice: 'none', confidence: 0.8, probabilities: { none: 0.8 } }, magnitude: { type: 'choice', choice: 'none', confidence: 0.8, probabilities: { none: 0.8 } } } })();
      }
      return fakeFetch({ answers: { start_minutes: { type: 'choice', choice: 'five', confidence: 0.8, probabilities: { five: 0.8 } } } })();
    }
  });
  assert(abstencaoDose.abstained === true && abstencaoDose.primary?.dose?.amount === 5, 'abstenção do Jev com energia baixa ainda oferece dose');

  // Falha na etapa da dose não pode derrubar a escolha do Jev.
  const falhaDoseDb = baseDb({ quests: [questComQuantidade] });
  const falhaDose = await suggestNextAction(falhaDoseDb, { location: 'office', energyReading: energyReading(2) }, {
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.questions.dose) return fakeFetch({ error: { message: 'falha na dose' } }, 500)();
      if (body.questions.has_quantity) {
        return fakeFetch({
          answers: {
            has_quantity: { type: 'noul', noul: 0.9 },
            unit: { type: 'choice', choice: 'items', confidence: 0.9, probabilities: { items: 0.9 } },
            magnitude: { type: 'choice', choice: 'five', confidence: 0.9, probabilities: { five: 0.9 } }
          }
        })();
      }
      return choiceFetch('q-pabs', { 'q-pabs': 0.9 })();
    }
  });
  assert(falhaDose.source === 'jev' && falhaDose.jevError === null, 'falha só da dose não derruba a escolha do Jev');
  assert(falhaDose.primary?.id === 'q-pabs', 'a atividade escolhida pelo Jev é preservada quando a dose falha');
  assert(falhaDose.primary?.quantity?.label === '5 itens', 'a quantidade lida é preservada quando a dose falha');

  // Energia alta continua sem dose.
  const altaDb = baseDb({ quests: [aberta] });
  const alta = await suggestNextAction(altaDb, { location: 'office', energyReading: energyReading(8) }, {
    fetchImpl: choiceFetch('q-limpar', { 'q-limpar': 0.9 })
  });
  assert(!alta.primary?.dose, 'com energia alta não se oferece dose');

  // ------------------------------------------- quantidade só quando é útil
  let altoQuantityCalls = 0;
  const altoDb = baseDb();
  await suggestNextAction(altoDb, { location: 'office', energyReading: energyReading(9) }, {
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.questions.has_quantity) altoQuantityCalls += 1;
      return choiceFetch('q-peticao', { 'q-peticao': 0.9 })();
    }
  });
  assert(altoQuantityCalls === 0, 'com energia alta, não se consulta quantidade que ninguém vai usar');

  // ------------------------------------------------------------- utilidades
  assert(localEnergyFromText('exausto') === 1, 'exaustão pura vira energia 1');
  assert(localEnergyFromText('exausto, não consigo nada') <= 2, 'esgotamento com segunda pista continua no chão');
  assert(localEnergyFromText('animado e disposto') === 7, 'texto positivo vira energia 7');
  assert(localEnergyFromText('qualquer coisa') === null, 'texto sem pista não inventa energia');
  assert(localEnergyFromText('não estou cansado') >= 6, 'negação de cansaço não vira energia baixa');

  assert(daysBetween('2026-09-30', '2026-10-02T12:00:00Z') === 2, 'prazo em ISO é lido como data civil');
  assert(daysBetween('2026-09-30', 'amanhã') === null, 'prazo ilegível não vira NaN');
  assert(formatDayMonth('2026-08-18T12:00:00Z') === '18/08', 'prazo em ISO é formatado sem sobra de horário');

  // ------------------------------------------------------------- memória
  const stats = oracleMemoryStats(expiraDb);
  assert(stats.counts.declined === 1 && stats.counts.pending === 1, 'o retrato da memória conta os desfechos');
  assert(stats.answered === 1 && stats.acceptanceRate === 0, 'a taxa de aceite usa apenas o que foi respondido');
  assert(Array.isArray(stats.recent) && stats.recent.length > 0, 'o retrato da memória lista as últimas decisões');

  const server = await startTestServer();
  const request = (pathName, body) => new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: server.port,
      path: pathName,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, raw: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
  try {
    const guest = await request('/api/auth/guest', {});
    const authReq = (pathName, body) => new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: server.port,
        path: pathName,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${guest.data.token}`
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data) }));
      });
      req.on('error', reject);
      req.write(JSON.stringify(body || {}));
      req.end();
    });
    const created = await authReq('/api/quests', { title: 'Fechar o ciclo', priority: 'importante' });
    assert(created.status === 200, 'a rota cria a missão do ciclo');
    const seeded = await authReq('/api/next-action/consult', { location: 'anywhere' });
    const decisionId = seeded.data.primary?.decisionId;
    assert(decisionId, 'a consulta grava uma decisão');
    const done = await authReq(`/api/quests/${created.data.quest.id}/complete`, { completed: true, decisionId });
    assert(done.status === 200, 'concluir pela rota HTTP aceita o decisionId');
    const memory = await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: '127.0.0.1',
        port: server.port,
        path: '/api/state',
        method: 'GET',
        headers: { Authorization: `Bearer ${guest.data.token}` }
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(JSON.parse(data)));
      });
      req.on('error', reject);
      req.end();
    });
    const stored = (memory.oracleDecisions || []).find(item => item.id === decisionId);
    assert(stored?.outcome === 'completed', `a conclusão sobrevive ao save (${stored?.outcome})`);
    assert(stored?.outcomeAt, 'a conclusão grava outcomeAt');
  } finally {
    server.stop();
  }

  console.log('\n✨ Fluxo do Oráculo consistente.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
