import assert from 'assert';
import { createBossRaid, BOSS_CATALOG, getDb, saveDb, rewardPlayer, revertPlayerReward } from './db.js';

async function runBossProgressionTests() {
  console.log('🧪 Iniciando bateria de testes do Sistema de Chefes Progressivo (+10% e Nomes Variados)...');

  // 1. Validar Catálogo de Chefes
  console.log(`📋 1. Validando catálogo de chefes (${BOSS_CATALOG.length} chefes catalogados)...`);
  assert(BOSS_CATALOG.length >= 10, 'O catálogo deve ter pelo menos 10 chefes criativos.');
  for (const b of BOSS_CATALOG) {
    assert(b.name && typeof b.name === 'string', 'Chefe precisa de nome válido');
    assert(b.subtitle && typeof b.subtitle === 'string', 'Chefe precisa de subtítulo válido');
    assert(b.icon && typeof b.icon === 'string', 'Chefe precisa de ícone válido');
  }
  console.log('✅ Catálogo validado com sucesso!');

  // 2. Validar Escalonamento Matemático de 10% por Nível
  console.log('📐 2. Validando escalonamento matemático (+10% ao vencer)...');
  const bossL1 = createBossRaid({ level: 1 });
  assert.strictEqual(bossL1.level, 1);
  assert.strictEqual(bossL1.maxHp, 500);
  assert.strictEqual(bossL1.currentHp, 500);
  assert.strictEqual(bossL1.rewardXp, 400);
  assert.strictEqual(bossL1.rewardCoins, 150);
  assert.strictEqual(bossL1.defeated, false);

  const bossL2 = createBossRaid({ level: 2, currentBoss: bossL1 });
  assert.strictEqual(bossL2.level, 2);
  assert.strictEqual(bossL2.maxHp, 550); // 500 * 1.10 = 550
  assert.strictEqual(bossL2.currentHp, 550);
  assert.strictEqual(bossL2.rewardXp, 440); // 400 * 1.10 = 440
  assert.strictEqual(bossL2.rewardCoins, 165); // 150 * 1.10 = 165

  const bossL3 = createBossRaid({ level: 3, currentBoss: bossL2 });
  assert.strictEqual(bossL3.level, 3);
  assert.strictEqual(bossL3.maxHp, 605); // 550 * 1.10 = 605
  assert.strictEqual(bossL3.currentHp, 605);
  assert.strictEqual(bossL3.rewardXp, 484); // 440 * 1.10 = 484
  assert.strictEqual(bossL3.rewardCoins, 182); // 165 * 1.10 = 181.5 -> 182

  const bossL4 = createBossRaid({ level: 4, currentBoss: bossL3 });
  assert.strictEqual(bossL4.level, 4);
  assert.strictEqual(bossL4.maxHp, 666); // 500 * 1.10^3 = 665.5 -> 666
  console.log(`✅ Progressão de HP verificada: L1=${bossL1.maxHp} HP, L2=${bossL2.maxHp} HP, L3=${bossL3.maxHp} HP, L4=${bossL4.maxHp} HP`);

  // 3. Testar Não-Repetição Imediata de Nome
  console.log('🎲 3. Testando variedade de nomes e rotação dinâmica...');
  let repeated = 0;
  let prevBoss = bossL1;
  for (let i = 0; i < 20; i++) {
    const nextBoss = createBossRaid({ level: i + 2, currentBoss: prevBoss });
    if (nextBoss.name === prevBoss.name) {
      repeated++;
    }
    prevBoss = nextBoss;
  }
  assert.strictEqual(repeated, 0, 'O sistema não deve sortear o mesmo nome imediatamente em sequência.');
  console.log('✅ Rotação de nomes garantida sem repetição consecutiva!');

  // 4. Testar Dano, Derrota e Escalonamento em Partida Real
  console.log('⚔️ 4. Testando combate, dano ao chefe e avanço de nível...');
  const db = getDb();

  // Set initial Boss at Level 1 with 500 HP
  db.bossRaid = createBossRaid({ level: 1 });
  db.bossRaid.defeatsCount = 0;
  saveDb(db);

  // Causar dano parcial (ex: 200 XP -> ~160 dano)
  rewardPlayer({ xp: 200, coins: 50, actionType: 'test_dmg', entityId: 'test-1', title: 'Ataque Teste' });
  assert.strictEqual(db.bossRaid.defeated, false, 'Chefe não deveria estar derrotado ainda');
  assert(db.bossRaid.currentHp < 500, 'HP do chefe deveria ter diminuído');

  // Causar dano fatal para liquidar o chefe
  const fatalResult = rewardPlayer({ xp: 1000, coins: 500, actionType: 'fatal_dmg', entityId: 'fatal-1', title: 'Golpe Final' });
  assert.strictEqual(db.bossRaid.defeated, true, 'Chefe deveria ter sido derrotado');
  assert.strictEqual(db.bossRaid.currentHp, 0, 'HP deveria ser 0');
  assert.strictEqual(db.bossRaid.defeatsCount, 1, 'Contador de vitórias deve ser 1');
  assert.strictEqual(fatalResult.bossDefeatedNow, true, 'Flag bossDefeatedNow deve ser verdadeira');
  console.log(`✅ Chefe Nível 1 derrotado! Vitórias=${db.bossRaid.defeatsCount}`);

  // Testar reset / avanço para o Nível 2
  const nextLevel = db.bossRaid.defeated ? (db.bossRaid.level + 1) : db.bossRaid.level;
  db.bossRaid = createBossRaid({ level: nextLevel, currentBoss: db.bossRaid });
  saveDb(db);

  assert.strictEqual(db.bossRaid.level, 2, 'Novo chefe deve ser Nível 2');
  assert.strictEqual(db.bossRaid.maxHp, 550, 'Novo chefe deve ter 550 HP (+10%)');
  assert.strictEqual(db.bossRaid.currentHp, 550, 'Novo chefe deve começar com HP cheio');
  assert.strictEqual(db.bossRaid.defeated, false, 'Novo chefe não está derrotado');
  assert.strictEqual(db.bossRaid.defeatsCount, 1, 'Deve preservar as vitórias acumuladas');
  console.log(`✅ Novo Chefe Nível 2 invocado com sucesso: "${db.bossRaid.name}" (${db.bossRaid.icon}) com ${db.bossRaid.maxHp} HP!`);

  // 5. Testar Estorno / Rollback
  console.log('⏪ 5. Testando estorno/rollback de recompensa que derrotou chefe...');
  db.bossRaid = createBossRaid({ level: 1 });
  db.bossRaid.currentHp = 10;
  db.bossRaid.defeatsCount = 0;
  saveDb(db);

  // Ação que mata o chefe
  rewardPlayer({ xp: 50, coins: 10, actionType: 'test_kill', entityId: 'kill-item-1', title: 'Golpe Letal' });
  assert.strictEqual(db.bossRaid.defeated, true);
  assert.strictEqual(db.bossRaid.defeatsCount, 1);

  // Reverter a ação
  revertPlayerReward({ xp: 50, coins: 10, actionType: 'test_kill', entityId: 'kill-item-1' });
  assert.strictEqual(db.bossRaid.defeated, false, 'Chefe deve voltar a não estar derrotado');
  assert(db.bossRaid.currentHp > 0, 'HP do chefe deve ser restaurado');
  assert.strictEqual(db.bossRaid.defeatsCount, 0, 'Contador de vitórias deve voltar a 0');
  console.log('✅ Estorno de derrota do chefe funcionou perfeitamente!');

  console.log('\n🎉 TODOS OS TESTES DO SISTEMA DE CHEFES PASSARAM COM 100% DE SUCESSO!\n');
}

runBossProgressionTests().catch(err => {
  console.error('❌ Erro nos testes:', err);
  process.exit(1);
});
