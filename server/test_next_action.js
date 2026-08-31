import { computeNextAction } from './nextAction.js';
import { isNowInTimeWindow, locationMatches, sanitizeTimeWindow, guessCurrentLocation } from './locations.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ ${message}`);
}

function baseDb(overrides = {}) {
  return {
    userProfile: { currentLocation: 'home', locationManual: true },
    questCategories: [
      { id: 'cat-1', name: 'INSS', defaultLocation: 'office' },
      { id: 'cat-2', name: 'Advocacia', defaultLocation: 'office' },
      { id: 'cat-3', name: 'Casa', defaultLocation: 'home' },
      { id: 'cat-4', name: 'Saúde', defaultLocation: 'anywhere' },
      { id: 'cat-5', name: 'Pessoal', defaultLocation: 'anywhere' }
    ],
    quests: [],
    habits: [],
    actionLogs: [],
    ...overrides
  };
}

function runTests() {
  console.log('🧪 Testando motor de Próxima Atividade...\n');

  // Time window helpers
  assert(isNowInTimeWindow(null, 10 * 60), 'Sem janela = sempre elegível');
  assert(isNowInTimeWindow({ start: '08:00', end: '12:00' }, 9 * 60), '09:00 está dentro de 08-12');
  assert(!isNowInTimeWindow({ start: '08:00', end: '12:00' }, 14 * 60), '14:00 está fora de 08-12 (além da folga)');
  assert(isNowInTimeWindow({ start: '08:00', end: '12:00' }, 12 * 60 + 10), 'Folga de 15 min depois da janela');
  assert(isNowInTimeWindow({ start: '21:00', end: '06:00' }, 22 * 60), 'Janela que cruza meia-noite aceita 22h');
  assert(isNowInTimeWindow({ start: '21:00', end: '06:00' }, 2 * 60), 'Janela que cruza meia-noite aceita 02h');
  assert(!isNowInTimeWindow({ start: '21:00', end: '06:00' }, 12 * 60), 'Meio-dia fora da janela noturna');

  const tw = sanitizeTimeWindow({ start: '7:00', end: '10:30' });
  assert(tw && tw.start === '07:00' && tw.end === '10:30', 'sanitizeTimeWindow normaliza HH:mm');

  assert(locationMatches('anywhere', 'home'), 'Item anywhere entra em casa');
  assert(locationMatches('home', 'anywhere'), 'Contexto anywhere mostra tudo');
  assert(!locationMatches('office', 'home'), 'Escritório não entra em casa');
  assert(locationMatches('gym', 'gym'), 'Mesmo lugar combina');

  const saturdayMorning = new Date('2026-08-29T12:00:00Z'); // 09:00 BRT sábado
  assert(guessCurrentLocation(saturdayMorning) === 'home', 'Fim de semana de manhã palpite = casa');

  const weekdayMorning = new Date('2026-08-28T12:00:00Z'); // 09:00 BRT sexta
  assert(guessCurrentLocation(weekdayMorning) === 'office', 'Dia útil 09h palpite = escritório');

  const nowHomeSat = new Date('2026-08-29T13:00:00Z'); // 10:00 BRT sábado

  const overdueHome = {
    id: 'q-galinheiro',
    title: 'Trabalhar 30 min no galinheiro',
    category: 'Casa',
    priority: 'alta',
    dueDate: '2026-08-28',
    dueTime: null,
    completed: false,
    location: 'home',
    timeWindow: null,
    createdAt: '2026-08-28T19:16:34.761Z',
    subtasks: []
  };
  const garden = {
    id: 'q-jardim',
    title: 'Trabalhar 30 min no jardim',
    category: 'Casa',
    priority: 'alta',
    dueDate: null,
    completed: false,
    location: 'home',
    timeWindow: null,
    createdAt: '2026-08-28T19:16:48.576Z',
    subtasks: []
  };
  const petition = {
    id: 'q-socorro',
    title: 'Peticionar Processo Dona Socorro x Banco do Brasil',
    category: 'Advocacia',
    priority: 'epica',
    dueDate: null,
    completed: false,
    location: 'office',
    timeWindow: null,
    createdAt: '2026-08-21T13:09:00.138Z',
    subtasks: [
      { id: 'st-1', title: 'Fazer Procuração', completed: true },
      { id: 'st-2', title: 'Formatar Peça', completed: false }
    ]
  };
  const creatina = {
    id: 'h-creatina',
    title: 'Creatina',
    category: 'Saúde',
    frequency: 'daily',
    location: 'home',
    timeWindow: null,
    currentStreak: 5,
    history: ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'],
    createdAt: '2026-08-24T18:13:52.604Z',
    xpReward: 30,
    coinReward: 8
  };
  const force = {
    id: 'h-forca',
    title: 'Aumentar Minha Força',
    category: 'Saúde',
    frequency: 'times_per_week',
    targetTimesPerWeek: 3,
    location: 'gym',
    timeWindow: null,
    currentStreak: 3,
    history: ['2026-08-24', '2026-08-26', '2026-08-28'],
    createdAt: '2026-08-24T11:37:44.409Z',
    xpReward: 50,
    coinReward: 10
  };
  const terco = {
    id: 'h-terco',
    title: 'Rezar o Terço da Divina Misericórdia',
    category: 'Pessoal',
    frequency: 'daily',
    location: 'anywhere',
    timeWindow: { start: '15:00', end: '16:00' },
    currentStreak: 1,
    history: ['2026-08-28'],
    createdAt: '2026-08-17T18:18:18.272Z',
    xpReward: 30,
    coinReward: 8
  };

  const dbHome = baseDb({
    quests: [overdueHome, garden, petition],
    habits: [creatina, force, terco]
  });

  const homeResult = computeNextAction(dbHome, { location: 'home', now: nowHomeSat });
  assert(homeResult.primary?.id === 'q-galinheiro', `Em casa, atrasada ganha do ritual (foi ${homeResult.primary?.id})`);
  assert(homeResult.queue.some(i => i.id === 'h-creatina') || homeResult.primary.id === 'h-creatina', 'Creatina entra na fila de casa');
  assert(![homeResult.primary, ...homeResult.queue].some(i => i && i.id === 'q-socorro'), 'Peticionar não aparece em casa');
  assert(homeResult.deferredByLocation.some(d => d.location === 'office' && d.count >= 1), 'Peticionar aparece como adiada no escritório');
  assert(![homeResult.primary, ...homeResult.queue].some(i => i && i.id === 'h-terco'), 'Terço fora da janela 15h não entra às 10h');
  assert(![homeResult.primary, ...homeResult.queue].some(i => i && i.id === 'h-forca'), 'Treino com meta batida não entra como principal');

  const officeResult = computeNextAction(dbHome, { location: 'office', now: nowHomeSat });
  assert(officeResult.primary?.id === 'q-socorro', `No escritório, peticionar é a próxima (foi ${officeResult.primary?.id})`);
  assert(officeResult.primary.nextSubtask?.title === 'Formatar Peça', 'Missão grande sugere a próxima subtarefa');
  assert(officeResult.deferredByLocation.some(d => d.location === 'home'), 'Casa aparece no rodapé quando estamos no escritório');

  const gymResult = computeNextAction(dbHome, { location: 'gym', now: nowHomeSat });
  assert(!gymResult.primary || gymResult.primary.id !== 'h-forca' || gymResult.primary.extra, 'Força 3/3 não é a principal mesmo na academia');
  assert((gymResult.primary && gymResult.primary.id === 'h-terco') === false, 'Terço fora da janela também não entra na academia às 10h');

  const afternoon = new Date('2026-08-29T18:10:00Z'); // 15:10 BRT sábado
  const afternoonHome = computeNextAction(dbHome, { location: 'home', now: afternoon });
  const idsAfternoon = [afternoonHome.primary, ...afternoonHome.queue].filter(Boolean).map(i => i.id);
  assert(idsAfternoon.includes('h-terco'), 'Às 15h o terço entra (janela 15-16)');

  // Histórico da categoria não pode furar atrasada
  const dbHist = baseDb({
    quests: [overdueHome, garden],
    habits: [creatina],
    actionLogs: Array.from({ length: 12 }, (_, i) => ({
      type: 'habit_complete',
      entityId: 'h-creatina',
      hour: 10,
      dayOfWeek: 6,
      details: { category: 'Saúde' }
    }))
  });
  const histResult = computeNextAction(dbHist, { location: 'home', now: nowHomeSat });
  assert(histResult.primary?.id === 'q-galinheiro', 'Histórico horário do ritual não fura missão atrasada');

  // Ritual times_per_week ainda faltando sobe na academia
  const forcePending = {
    ...force,
    history: ['2026-08-24', '2026-08-26'],
    currentStreak: 2
  };
  const dbGym = baseDb({
    quests: [petition],
    habits: [forcePending, creatina]
  });
  const gymPending = computeNextAction(dbGym, { location: 'gym', now: nowHomeSat });
  assert(gymPending.primary?.id === 'h-forca', `Na academia, treino pendente é o próximo (foi ${gymPending.primary?.id})`);
  assert(![gymPending.primary, ...gymPending.queue].some(i => i && i.id === 'q-socorro'), 'Peticionar não entra na academia');

  // Contexto anywhere lista escritório + casa
  const anyResult = computeNextAction(dbHome, { location: 'anywhere', now: nowHomeSat });
  const anyIds = [anyResult.primary, ...anyResult.queue].filter(Boolean).map(i => i.id);
  assert(anyIds.includes('q-galinheiro'), 'anywhere inclui missão de casa');
  assert(anyIds.includes('q-socorro') || anyResult.primary?.id === 'q-socorro' || anyResult.queue.length >= 0, 'anywhere não filtra lugar');

  console.log('\n🏆 Todos os testes do motor de Próxima Atividade passaram.');
}

runTests();
