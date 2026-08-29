import {
  RANK_TIERS,
  getRankIndexForXp,
  getRankForXp,
  getWeekBounds,
  computeCategoryRankings
} from './rankings.js';
import { applyCategoryRename } from './db.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ ${message}`);
}

async function runRankingsTests() {
  console.log('🧪 ===============================================');
  console.log('🧪 Iniciando Testes Unitários do Sistema de Rankings');
  console.log('🧪 ===============================================\n');

  // 1. Test Week Boundaries (Sunday 00:00:00 to Saturday 23:59:59)
  console.log('📅 1. Testando limites de semana (Domingo a Sábado)...');
  // Date: Wednesday, Aug 19, 2026
  const testWed = new Date('2026-08-19T14:30:00Z');
  const bounds = getWeekBounds(testWed);

  // Sunday should be Aug 16, 2026
  assert(bounds.sunday.getDay() === 0, 'Início da semana deve ser Domingo (getDay === 0)');
  assert(bounds.saturday.getDay() === 6, 'Fim da semana deve ser Sábado (getDay === 6)');
  assert(bounds.weekKey.includes('2026-08-16') || bounds.sunday.getDate() === 16, 'Domingo deve ser dia 16/08/2026');
  assert(bounds.saturday.getDate() === 22, 'Sábado deve ser dia 22/08/2026');

  // 2. Test 11 Tiers & XP Ranges
  console.log('\n🏆 2. Testando faixas de XP e os 11 Tiers (E, D, C, B-, B, B+, A-, A, A+, S, S+)...');
  assert(RANK_TIERS.length === 11, 'Devem existir exatamente 11 tiers');
  assert(RANK_TIERS[0].name === 'E', 'Tier 0 deve ser E');
  assert(RANK_TIERS[1].name === 'D', 'Tier 1 deve ser D');
  assert(RANK_TIERS[2].name === 'C', 'Tier 2 deve ser C');
  assert(RANK_TIERS[3].name === 'B-', 'Tier 3 deve ser B-');
  assert(RANK_TIERS[4].name === 'B', 'Tier 4 deve ser B');
  assert(RANK_TIERS[5].name === 'B+', 'Tier 5 deve ser B+');
  assert(RANK_TIERS[6].name === 'A-', 'Tier 6 deve ser A-');
  assert(RANK_TIERS[7].name === 'A', 'Tier 7 deve ser A');
  assert(RANK_TIERS[8].name === 'A+', 'Tier 8 deve ser A+');
  assert(RANK_TIERS[9].name === 'S', 'Tier 9 deve ser S');
  assert(RANK_TIERS[10].name === 'S+', 'Tier 10 deve ser S+');

  assert(getRankForXp(0).name === 'E', '0 XP deve ser rank E');
  assert(getRankForXp(99).name === 'E', '99 XP deve ser rank E');
  assert(getRankForXp(100).name === 'D', '100 XP deve ser rank D');
  assert(getRankForXp(250).name === 'C', '250 XP deve ser rank C');
  assert(getRankForXp(450).name === 'B-', '450 XP deve ser rank B-');
  assert(getRankForXp(700).name === 'B', '700 XP deve ser rank B');
  assert(getRankForXp(1000).name === 'B+', '1000 XP deve ser rank B+');
  assert(getRankForXp(1400).name === 'A-', '1400 XP deve ser rank A-');
  assert(getRankForXp(1900).name === 'A', '1900 XP deve ser rank A');
  assert(getRankForXp(2500).name === 'A+', '2500 XP deve ser rank A+');
  assert(getRankForXp(3200).name === 'S', '3200 XP deve ser rank S');
  assert(getRankForXp(4500).name === 'S+', '4500 XP deve ser rank S+');

  // 3. Test Example from User Prompt (E -> D -> C -> C -> 0 XP -> D -> 0 XP -> E)
  console.log('\n📉 3. Testando cenário exato do usuário: Progressão e Decaimento Gradual (-1 nível por semana)...');
  
  // Criar dados simulados de 6 semanas passadas consecutivas:
  // Week 1: 50 XP (E)
  // Week 2: 150 XP (D)
  // Week 3: 300 XP (C)
  // Week 4: 300 XP (C)
  // Week 5: 0 XP (insuficiente -> deve cair de C para D)
  // Week 6: 0 XP (insuficiente -> deve cair de D para E)
  // Week 7: Atual (em andamento)

  const mockDb = {
    questCategories: [
      { id: 'cat-inss', name: 'INSS', color: '#38bdf8' },
      { id: 'cat-adv', name: 'Advocacia', color: '#f43f5e' }
    ],
    actionLogs: [
      // Week 1 (2026-07-06) - 50 XP
      { id: 'l-1', type: 'quest_complete', xp: 50, timestamp: '2026-07-06T10:00:00Z', details: { category: 'INSS' } },
      // Week 2 (2026-07-13) - 150 XP (Rank D)
      { id: 'l-2', type: 'quest_complete', xp: 150, timestamp: '2026-07-13T10:00:00Z', details: { category: 'INSS' } },
      // Week 3 (2026-07-20) - 300 XP (Rank C)
      { id: 'l-3', type: 'quest_complete', xp: 300, timestamp: '2026-07-20T10:00:00Z', details: { category: 'INSS' } },
      // Week 4 (2026-07-27) - 300 XP (Mantém Rank C)
      { id: 'l-4', type: 'quest_complete', xp: 300, timestamp: '2026-07-27T10:00:00Z', details: { category: 'INSS' } },
      // Week 5 (2026-08-03) - 0 XP (Decai para D) -> Sem logs
      // Week 6 (2026-08-10) - 0 XP (Decai para E) -> Sem logs
      // Week 7 (Semana Atual): 2026-08-19 -> Ganha 500 XP nesta semana (Promovido a B-)
      { id: 'l-7', type: 'quest_complete', xp: 500, timestamp: new Date().toISOString(), details: { category: 'INSS' } }
    ]
  };

  const result = computeCategoryRankings(mockDb);
  const inssRanking = result.categories['INSS'];
  assert(!!inssRanking, 'Categoria INSS deve existir no resultado');

  console.log('Histórico simulado de INSS:', inssRanking.history.map(h => `${h.weekKey}: XP=${h.xp} -> Rank=${h.rank}`));

  // Verificar histórico das semanas passadas:
  // Week 1: E
  assert(inssRanking.history[0].rank === 'E', `Semana 1 deve ser E (obtido: ${inssRanking.history[0].rank})`);
  // Week 2: D
  assert(inssRanking.history[1].rank === 'D', `Semana 2 deve ser D (obtido: ${inssRanking.history[1].rank})`);
  // Week 3: C
  assert(inssRanking.history[2].rank === 'C', `Semana 3 deve ser C (obtido: ${inssRanking.history[2].rank})`);
  // Week 4: C
  assert(inssRanking.history[3].rank === 'C', `Semana 4 deve ser C (obtido: ${inssRanking.history[3].rank})`);
  // Week 5: D (caiu 1 nível)
  assert(inssRanking.history[4].rank === 'D', `Semana 5 deve decair de C para D (obtido: ${inssRanking.history[4].rank})`);
  // Week 6: E (caiu mais 1 nível)
  assert(inssRanking.history[5].rank === 'E', `Semana 6 deve decair de D para E (obtido: ${inssRanking.history[5].rank})`);

  // Semana Atual: iniciou em E, mas com 500 XP foi promovido de imediato a B-
  assert(inssRanking.currentRank.name === 'B-', `Semana atual com 500 XP deve ter promovido para B- (obtido: ${inssRanking.currentRank.name})`);
  assert(inssRanking.status === 'promoted', 'Status deve ser promoted');

  // 4. Test Overall User Ranking
  console.log('\n👑 4. Testando Ranking Geral do Usuário...');
  console.log(`Ranking Geral: ${result.overall.rank.name} (Score: ${result.overall.avgScore}/10)`);
  assert(result.overall.rank !== undefined, 'Ranking geral deve estar definido');
  assert(result.overall.totalCategories === 2, 'Total de categorias deve ser 2');

  // 5. Categorias cadastradas vs fantasma (ex.: "Trabalho" após rename para INSS)
  console.log('\n🗂️ 5. Testando que categorias fantasma não aparecem e categorias criadas sempre aparecem...');
  const renamedDb = {
    questCategories: [
      { id: 'cat-1', name: 'INSS', color: '#38bdf8' },
      { id: 'cat-adv', name: 'Advocacia', color: '#f43f5e' },
      { id: 'cat-est', name: 'Estudos', color: '#a855f7' }
    ],
    quests: [
      { id: 'q-old', title: 'Missão antiga', category: 'INSS', completed: true, completedAt: '2026-08-19T11:34:22.698Z', xpReward: 80 }
    ],
    actionLogs: [
      { id: 'l-old', type: 'quest_complete', entityId: 'q-old', xp: 80, timestamp: '2026-08-19T11:34:22.698Z', details: { category: 'Trabalho' } },
      { id: 'l-orphan', type: 'process_step', entityId: 'proc-inexistente', xp: 45, timestamp: '2026-08-24T12:52:33.077Z', details: { category: 'Trabalho' } }
    ]
  };

  const renamedResult = computeCategoryRankings(renamedDb);
  const rankedNames = renamedResult.categoriesList.map(c => c.category.name);

  assert(!rankedNames.includes('Trabalho'), 'Categoria fantasma "Trabalho" NÃO deve aparecer no ranking');
  assert(rankedNames.includes('INSS'), 'Categoria INSS (renomeada) deve aparecer');
  assert(rankedNames.includes('Advocacia'), 'Categoria criada Advocacia deve aparecer mesmo sem XP');
  assert(rankedNames.includes('Estudos'), 'Categoria cadastrada Estudos deve aparecer mesmo sem XP');
  assert(renamedResult.overall.totalCategories === 3, 'Total de categorias deve ser exatamente as cadastradas (3)');
  assert(renamedResult.categories['INSS'].history.some(h => h.xp >= 80), 'XP histórico do log antigo "Trabalho" deve contar para INSS via entidade da missão');
  assert(!renamedResult.categories['INSS'].history.some(h => h.xp >= 125), 'XP órfão de processo inexistente em "Trabalho" não deve inflar INSS');

  // 6. Sem categorias cadastradas: não injetar defaults Trabalho/Estudos/etc.
  console.log('\n🚫 6. Testando ranking sem injetar categorias padrão quando a lista está vazia...');
  const emptyCatsResult = computeCategoryRankings({ questCategories: [], actionLogs: [] });
  assert(emptyCatsResult.categoriesList.length === 0, 'Sem categorias cadastradas, o ranking deve ficar vazio');
  assert(!Object.keys(emptyCatsResult.categories).includes('Trabalho'), 'Default "Trabalho" não deve ser injetado');

  // 7. Rename deve atualizar missões, hábitos, processos e logs
  console.log('\n🔁 7. Testando cascade de rename de categoria...');
  const renameDb = {
    quests: [{ id: 'q1', category: 'Trabalho' }],
    processes: [{ id: 'p1', category: 'Trabalho' }],
    habits: [{ id: 'h1', category: 'Trabalho' }],
    books: [{ id: 'b1', category: 'Estudos' }],
    examQuestions: [{ id: 'eq1', category: 'Trabalho' }],
    actionLogs: [{ id: 'l1', details: { category: 'Trabalho' } }]
  };
  applyCategoryRename(renameDb, 'Trabalho', 'INSS');
  assert(renameDb.quests[0].category === 'INSS', 'Missão deve ser atualizada no rename');
  assert(renameDb.processes[0].category === 'INSS', 'Processo deve ser atualizado no rename');
  assert(renameDb.habits[0].category === 'INSS', 'Hábito deve ser atualizado no rename');
  assert(renameDb.examQuestions[0].category === 'INSS', 'Questões devem ser atualizadas no rename');
  assert(renameDb.actionLogs[0].details.category === 'INSS', 'Log histórico deve ser atualizado no rename');
  assert(renameDb.books[0].category === 'Estudos', 'Livros de outras categorias não devem ser alterados');

  console.log('\n🎉 TODOS OS TESTES UNITÁRIOS DE RANKINGS PASSARAM COM SUCESSO!\n');
}

runRankingsTests().catch(err => {
  console.error('❌ Erro na execução dos testes:', err);
  process.exit(1);
});
