import { composeQuantity, applyDose, energyBand, buildLearningSummary, markDecisionAccepted, acceptPartialDose, ensureOracleMemory } from './oracleMemory.js';
import { interpretEnergy, chooseActivity, interpretQuantity, chooseDose } from './oracleJev.js';
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

  const energy = await interpretEnergy('cansado, mas consigo algo curto', {
    fetchImpl: fakeFetch({
      answers: { energy: { type: 'score', score: 3.6, confidence: 0.8 } }
    })
  });
  assert(energy.score === 5, 'score 3,6 na escala 0–9 vira energia 5');
  const reported = await interpretEnergy('Vamos em frente.', {
    fetchImpl: fakeFetch({
      answers: { energy: { type: 'score', score: 5.68, confidence: 0.72 } }
    })
  });
  assert(reported.score === 7, 'score 5,68 fica no nível 7, sem somar 1 outra vez');

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
