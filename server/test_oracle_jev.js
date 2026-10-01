import './testEnv.js';
import { composeQuantity, applyDose, energyBand, buildLearningSummary, markDecisionAccepted, acceptPartialDose, ensureOracleMemory, explicitAmount, nearestAmountId, findQuantityRead, saveQuantityRead, QUANTITY_MISS_TTL_MS } from './oracleMemory.js';
import { interpretEnergy, chooseActivity, interpretQuantity, chooseDose, resolveChoice } from './oracleJev.js';
import { suggestNextAction, declineAndRemember } from './oracleSuggest.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ ${message}`);
}

function fakeFetch(payload, status = 200) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  });
}

function baseDb() {
  return {
    userProfile: { currentLocation: 'home', locationManual: true },
    questCategories: [],
    quests: [
      { id: 'q-ler', title: 'Ler por 60 min', description: '', category: 'Estudos', priority: 'importante', location: 'home', completed: false, xpReward: 20, coinReward: 5 },
      { id: 'q-email', title: 'Enviar o e-mail', description: '', category: 'Trabalho', priority: 'bom_fazer', location: 'home', completed: false, xpReward: 10, coinReward: 2 }
    ],
    habits: [],
    actionLogs: [],
    oracleEnergyReadings: [],
    oracleDecisions: [],
    oracleQuantityReads: []
  };
}

async function run() {
  process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'test-key';
  console.log('🧪 Testando Oráculo com Jev...\n');

  const halfHour = composeQuantity(true, 'hours', 'half');
  assert(halfHour.unit === 'minutes' && halfHour.amount === 30, 'meia hora vira 30 minutos');
  const situps = composeQuantity(true, 'reps', 'ten');
  assert(situps.amount === 10 && situps.unit === 'reps', '10 repetições permanecem 10');
  const dose = applyDose(halfHour, 'quarter');
  assert(dose.amount === 10 || dose.amount === 5, `25% de 30 min respeita o piso, veio ${dose.amount}`);
  const hourDose = applyDose({ hasQuantity: true, amount: 60, unit: 'minutes' }, 'quarter');
  assert(hourDose.amount === 15 && hourDose.reduced, '25% de 60 min vira 15 min');
  assert(energyBand(4) === '3-4', 'energia 4 cai na faixa 3-4');
  assert(explicitAmount('Analisar 5 PABs') === 5, 'lê o 5 de "Analisar 5 PABs"');
  assert(explicitAmount('Enviar o e-mail') == null, 'tarefa aberta não tem número');
  assert(nearestAmountId(5) === 'five', '5 casa com a magnitude five');

  const energy = await interpretEnergy('cansado, mas consigo algo curto', {
    fetchImpl: fakeFetch({
      answers: { energy: { type: 'score', score: 3.6, confidence: 0.8 } }
    })
  });
  assert(energy.score === 4, 'score 3,6 arredonda para 4');
  const reported = await interpretEnergy('Vamos em frente.', {
    fetchImpl: fakeFetch({
      answers: { energy: { type: 'score', score: 5.68, confidence: 0.72 } }
    })
  });
  assert(reported.score === 6, 'score 5,68 vira 6, o inteiro mais próximo');

  // Resposta REAL do Jev: quando a pergunta recebe a lista de critérios, o
  // score é o índice 0-based da lista (a resposta traz `legend` com 0..9).
  const legend = {
    0: '1 — exhausted, unable to start',
    4: '5 — mixed, neither spent nor fresh',
    9: '10 — at peak, ready for the hardest available task'
  };
  const exausto = await interpretEnergy('estou exausto', {
    fetchImpl: fakeFetch({ answers: { energy: { type: 'score', score: 0.01, legend, confidence: 1 } } })
  });
  assert(exausto.score === 1, 'índice 0 do Jev vira energia 1 (não 0)');
  const misto = await interpretEnergy('mais ou menos', {
    fetchImpl: fakeFetch({ answers: { energy: { type: 'score', score: 4, legend, confidence: 1 } } })
  });
  assert(misto.score === 5, 'índice 4 do Jev ("5 — mixed") vira energia 5');
  const pico = await interpretEnergy('estou ótimo', {
    fetchImpl: fakeFetch({ answers: { energy: { type: 'score', score: 8.82, legend, confidence: 0.93 } } })
  });
  assert(pico.score === 10, 'índice 9 do Jev ("10 — at peak") vira energia 10');

  const semLegenda = await interpretEnergy('sem legenda', {
    fetchImpl: fakeFetch({ answers: { energy: { type: 'score', score: 2.26, confidence: 0.9 } } })
  });
  assert(semLegenda.score === 2, 'resposta sem legenda continua sendo lida como nota');

  const db = baseDb();
  db.oracleEnergyReadings.unshift({
    id: 'en-1',
    text: 'cansado',
    score: 4,
    rawScore: 3.6,
    createdAt: new Date().toISOString(),
    date: '2026-07-16',
    hour: 21
  });

  const suggestion = await suggestNextAction(db, {
    location: 'home',
    now: new Date('2026-07-16T21:10:00-03:00'),
    energyReading: db.oracleEnergyReadings[0]
  }, {
    fetchImpl: async (_url, init) => {
      const body = JSON.parse(init.body);
      if (body.questions.most_likely_now) {
        return fakeFetch({
          answers: { most_likely_now: { type: 'choice', choice: 'q-ler', confidence: 0.7, probabilities: { 'q-ler': 0.8, 'q-email': 0.2 } } }
        })();
      }
      if (body.questions.has_quantity) {
        return fakeFetch({
          answers: {
            has_quantity: { type: 'noul', noul: 0.95 },
            unit: { type: 'choice', choice: 'minutes', confidence: 0.9 },
            magnitude: { type: 'choice', choice: 'sixty', confidence: 0.9 }
          }
        })();
      }
      return fakeFetch({
        answers: { dose: { type: 'choice', choice: 'quarter', confidence: 0.8 } }
      })();
    }
  });

  assert(suggestion.primary?.id === 'q-ler', 'Jev escolhe a leitura');
  assert(suggestion.primary?.dose?.amount === 15, 'dose reduzida para 15 min sem alterar a tarefa');
  assert(db.quests[0].title === 'Ler por 60 min', 'título original permanece');
  assert(suggestion.queue.length === 0, 'a resposta pública não traz fila');
  assert(db.oracleDecisions[0]?.energyScore === 4, 'a indicação guarda a energia');

  const declined = declineAndRemember(db, { decisionId: suggestion.primary.decisionId, reason: 'tired' });
  assert(!declined.error && declined.decision.outcome === 'declined', 'recusa com motivo fica gravada');
  const learning = buildLearningSummary(db);
  assert(learning.recent[0].reason === 'Estou cansado', 'o histórico aprende o motivo naquela energia');

  const accepted = markDecisionAccepted(db, { entityId: 'q-email', kind: 'quest', at: new Date() });
  assert(accepted == null, 'aceitar outra tarefa não marca a recusada');

  const partialDb = baseDb();
  ensureOracleMemory(partialDb);
  partialDb.oracleDecisions.unshift({
    id: 'od-partial',
    entityId: 'q-ler',
    kind: 'quest',
    title: 'Ler por 60 min',
    createdAt: new Date().toISOString(),
    outcome: 'pending',
    quantity: { amount: 60, unit: 'minutes' },
    dose: { amount: 15, unit: 'minutes', fraction: 'quarter', label: '15 min' }
  });
  const partial = acceptPartialDose(partialDb, 'od-partial');
  assert(partial?.outcome === 'accepted', 'dose parcial é aceita sem concluir a missão');

  const pabAnswer = {
    choice: 'none',
    confidence: 0.28,
    probabilities: { none: 0.36, items: 0.27, reps: 0.2, minutes: 0.05 }
  };
  assert(resolveChoice(pabAnswer, { minConfidence: 0.45 }) === null, 'sem número no texto, confiança 0,28 não vira unidade');
  assert(resolveChoice(pabAnswer, { minConfidence: 0.2 }) === 'items', 'com o dígito no título, none por margem ínfima cede a items');
  const openEnded = resolveChoice({
    choice: 'none',
    confidence: 0.8,
    probabilities: { none: 0.84, items: 0.08 }
  }, { minConfidence: 0.45 });
  assert(openEnded === null, 'none folgado continua sem quantidade');

  const pabs = await interpretQuantity({ title: 'Analisar 5 PABs', description: '' }, {
    fetchImpl: fakeFetch({
      answers: {
        has_quantity: { type: 'noul', noul: 0.92 },
        unit: {
          type: 'choice',
          choice: 'items',
          confidence: 0.62,
          probabilities: { items: 0.7, none: 0.12, reps: 0.1, steps: 0.08 }
        },
        magnitude: {
          type: 'choice',
          choice: 'five',
          confidence: 0.9,
          probabilities: { five: 0.93, none: 0.04, ten: 0.03 }
        }
      }
    })
  });
  assert(pabs.hasQuantity && pabs.amount === 5 && pabs.unit === 'items', '5 PABs viram 5 itens quando o Jev lê o número');

  const stillOpen = await interpretQuantity({ title: 'Analisar 5 PABs', description: '' }, {
    fetchImpl: fakeFetch({
      answers: {
        has_quantity: { type: 'noul', noul: 0.76 },
        unit: {
          type: 'choice',
          choice: 'none',
          confidence: 0.28,
          probabilities: { none: 0.36, items: 0.27, reps: 0.2, minutes: 0.05, hours: 0.05, questions: 0.04, steps: 0.02, pages: 0.01 }
        },
        magnitude: {
          type: 'choice',
          choice: 'none',
          confidence: 0.65,
          probabilities: { none: 0.67, half: 0.21, five: 0.06 }
        }
      }
    })
  });
  assert(stillOpen.hasQuantity && stillOpen.amount === 5 && stillOpen.unit === 'items', 'a resposta real de 5 PABs vira 5 itens');

  const cacheDb = baseDb();
  ensureOracleMemory(cacheDb);
  saveQuantityRead(cacheDb, {
    entityId: 'q-pabs',
    kind: 'quest',
    sourceText: 'Analisar 5 PABs',
    hasQuantity: false,
    unit: null,
    amount: null,
    amountId: null,
    confidence: 0.28,
    readAt: '2026-09-30T13:12:07.572Z'
  });
  const freshMiss = findQuantityRead(cacheDb, 'q-pabs', 'Analisar 5 PABs', new Date('2026-09-30T13:20:00.000Z'));
  assert(freshMiss && !freshMiss.hasQuantity, 'a leitura recente continua gravada, mas a consulta não a reutiliza');
  const staleMiss = findQuantityRead(cacheDb, 'q-pabs', 'Analisar 5 PABs', new Date(new Date('2026-09-30T13:12:07.572Z').getTime() + QUANTITY_MISS_TTL_MS + 1000));
  assert(staleMiss == null, 'um "sem quantidade" antigo não bloqueia a releitura');

  const timedOut = await interpretQuantity({ title: 'Enviar o e-mail' }, {
    fetchImpl: async () => { throw Object.assign(new Error('abort'), { name: 'AbortError' }); }
  }).then(() => null).catch(err => err);
  assert(timedOut?.code === 'TIMEOUT' || timedOut?.name === 'AbortError' || timedOut instanceof Error, 'falha de rede não vira quantidade inventada');

  const chosen = await chooseActivity({}, [{ id: 'q-ler', title: 'Ler' }], {
    fetchImpl: fakeFetch({ answers: {} }, 200)
  }).catch(err => err);
  assert(chosen?.code === 'BAD_ANSWER', 'resposta sem escolha não é aceita');

  const noneDose = await chooseDose({
    item: { title: 'Ler' },
    quantity: { hasQuantity: true, amount: 60, unit: 'minutes' },
    energy: { score: 4, text: 'cansado' }
  }, {
    fetchImpl: fakeFetch({ answers: { dose: { type: 'choice', choice: 'full', confidence: 0.4 } } })
  });
  assert(noneDose.dose.reduced === false, 'fração inteira não reduz a tarefa');

  console.log('\n✨ Oráculo com Jev consistente.');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
