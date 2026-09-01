import {
  applyDifficultyFields,
  DEFAULT_DIFFICULTY,
  DEFAULT_PRIORITY,
  inferDifficultyFromRewards,
  migrateActivityScale,
  resolveActivityScale,
  willpowerForDifficulty
} from '../src/utils/activityScale.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ ${message}`);
}

function runTests() {
  console.log('🧪 Testando escalas de Prioridade e Dificuldade...\n');

  const created = resolveActivityScale({});
  assert(created.priority === DEFAULT_PRIORITY, 'Criação sem campos usa prioridade Importante');
  assert(created.difficulty === DEFAULT_DIFFICULTY, 'Criação sem campos usa dificuldade Média');

  const fromDifficulty = resolveActivityScale({ difficulty: 'epica' });
  assert(fromDifficulty.priority === 'importante' && fromDifficulty.difficulty === 'epica', 'Dificuldade épica não altera a prioridade padrão');

  const fromNewPriority = resolveActivityScale({ priority: 'critico' });
  assert(fromNewPriority.priority === 'critico' && fromNewPriority.difficulty === 'media', 'Prioridade crítica não altera a dificuldade padrão');

  const both = resolveActivityScale({ priority: 'dispensavel', difficulty: 'alta' });
  assert(both.priority === 'dispensavel' && both.difficulty === 'alta', 'Os dois campos podem ser definidos juntos');

  const legacyCreate = resolveActivityScale({ priority: 'epica' });
  assert(legacyCreate.difficulty === 'epica' && legacyCreate.priority === 'importante', 'priority legado épica vira dificuldade, não prioridade');

  const existing = { priority: 'critico', difficulty: 'baixa', xpReward: 20, coinReward: 5 };
  const legacyUpdate = resolveActivityScale({ priority: 'alta' }, existing);
  assert(legacyUpdate.difficulty === 'alta' && legacyUpdate.priority === 'critico', 'Update legado de dificuldade preserva prioridade nova');

  const priorityOnlyUpdate = resolveActivityScale({ priority: 'opcional' }, existing);
  assert(priorityOnlyUpdate.priority === 'opcional' && priorityOnlyUpdate.difficulty === 'baixa', 'Update só de prioridade preserva dificuldade');

  const quest = { title: 'Peça' };
  applyDifficultyFields(quest, 'alta');
  assert(quest.difficulty === 'alta' && quest.xpReward === 80 && quest.coinReward === 25, 'Dificuldade alta aplica +80 XP e 25 moedas');
  assert(willpowerForDifficulty('epica') === 25, 'Épica concede 25 de Vontade');
  assert(willpowerForDifficulty('alta') === 15, 'Alta concede 15 de Vontade');
  assert(willpowerForDifficulty('media') === 5, 'Média concede 5 de Vontade');

  const legacyQuest = { priority: 'alta', difficulty: 3, xpReward: 80 };
  migrateActivityScale(legacyQuest);
  assert(legacyQuest.difficulty === 'alta', 'Migração converte dificuldade numérica/legado para string');
  assert(legacyQuest.priority === 'importante', 'Migração troca priority legado pela prioridade padrão');

  const habit = { xpReward: 150 };
  migrateActivityScale(habit);
  assert(habit.difficulty === 'epica', 'Hábito antigo infere dificuldade pelo XP');
  assert(habit.priority === 'importante', 'Hábito antigo recebe prioridade Importante');
  assert(inferDifficultyFromRewards(20) === 'baixa', 'XP 20 infere dificuldade baixa');
  assert(inferDifficultyFromRewards(30) === 'media', 'XP customizado (ex: 30) cai no default média');

  console.log('\n🏆 Todos os testes de Prioridade/Dificuldade passaram.');
}

runTests();
