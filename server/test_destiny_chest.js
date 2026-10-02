/**
 * Baú do Destino: rolagem determinística, concessão única por dia+evento e
 * — o ponto que já falhou em silêncio — o baú chegando até a resposta HTTP.
 *
 * O baú nasce em dois lugares: fechar o dia (evento `daily-review`) e a tríade
 * de vitórias (evento `triad`), inclusive quando as vitórias são concluídas
 * por uma missão, leitura ou bloco AGU (`linkedVictories`).
 */
import './testEnv.js';
import assert from 'assert';
import http from 'http';
import {
  CHEST_TABLE,
  CHEST_RARITIES,
  chestRarity,
  chestRewardText,
  chestSeed,
  normalizeChestPayload,
  rollDestinyChest
} from '../src/utils/destinyChest.js';
import { createApp } from './index.js';
import { initDb, getDb, saveDb, rewardPlayer, createBossRaid } from './db.js';
import { createSession } from './auth.js';
import { grantDestinyChestSync } from './domain/destinyChest.js';
import { syncDailyVictoriesFromActivity } from './dailyVictorySync.js';
import { createDailyVictory, sanitizeDailyVictories } from '../src/utils/dailyVictories.js';
import { getSaoPauloDateStr } from './timeUtils.js';

function ok(condition, message) {
  assert.ok(condition, message);
  console.log(`  ✓ ${message}`);
}

function eq(actual, expected, message) {
  assert.equal(actual, expected, `${message} (recebido ${JSON.stringify(actual)}, esperado ${JSON.stringify(expected)})`);
  console.log(`  ✓ ${message}`);
}

function freshDb() {
  const db = getDb();
  db.userProfile.coins = 1000;
  db.userProfile.stats = { wisdom: 0, focus: 0, willpower: 0, consistency: 0 };
  db.userProfile.streakShields = 0;
  db.quests = [];
  db.habits = [];
  db.dailyVictories = [];
  db.dailyVictoryBonuses = {};
  db.dailyReviews = [];
  db.destinyChests = [];
  db.actionLogs = [];
  db.penalties = [];
  db.bossHistory = [];
  db.bossRaid = createBossRaid({ level: 1 });
  db.maintenance = { penaltiesSince: getSaoPauloDateStr(), penaltyKeys: {} };
  saveDb(db);
  return db;
}

function checkTable() {
  console.log('--- Tabela e rolagem ---');
  eq(CHEST_TABLE.reduce((sum, prize) => sum + prize.weight, 0), 100, 'os pesos somam 100%');
  const documented = { 'coins-10': 60, 'coins-25': 25, shield: 10, 'xp-60': 4, jackpot: 1 };
  CHEST_TABLE.forEach((prize) => {
    eq(prize.weight, documented[prize.id], `peso de ${prize.id} é ${documented[prize.id]}%`);
  });
  eq(chestRarity('coins-10').label, 'Comum', 'raridade Comum em 60%');
  eq(chestRarity('coins-25').label, 'Incomum', 'raridade Incomum em 25%');
  eq(chestRarity('shield').label, 'Raro', 'raridade Raro em 10%');
  eq(chestRarity('xp-60').label, 'Épico', 'raridade Épico em 4%');
  eq(chestRarity('jackpot').label, 'Lendário', 'raridade Lendário em 1%');
  Object.values(CHEST_RARITIES).forEach((rarity) => {
    ok(CHEST_TABLE.some((prize) => prize.id && rarity.chance > 0), `raridade ${rarity.label} tem chance declarada (${rarity.chance}%)`);
  });

  const first = rollDestinyChest(chestSeed('2026-10-07', 'daily-review'));
  const second = rollDestinyChest(chestSeed('2026-10-07', 'daily-review'));
  assert.deepStrictEqual(first, second, 'mesmo dia+evento não permite reroll');
  ok(first.roll >= 0 && first.roll < 100, `rolagem devolve 0–99 (${first.roll})`);
  ok(
    rollDestinyChest(chestSeed('2026-10-07', 'triad')).seed === '2026-10-07:triad',
    'a semente é data:evento'
  );
  ok(
    rollDestinyChest(chestSeed('2026-10-07', 'triad')).prizeId !== undefined
    || rollDestinyChest(chestSeed('2026-10-07', 'triad')).id !== undefined,
    'prêmio é identificável'
  );

  const counts = {};
  const sample = 20000;
  for (let i = 0; i < sample; i += 1) {
    const prize = rollDestinyChest(chestSeed('2026-10-07', `triad:${i}`));
    counts[prize.id] = (counts[prize.id] || 0) + 1;
  }
  Object.entries(documented).forEach(([id, weight]) => {
    const observed = ((counts[id] || 0) / sample) * 100;
    ok(Math.abs(observed - weight) < 1.5, `${id} sai em ${observed.toFixed(2)}% (esperado ~${weight}%)`);
  });

  eq(chestRewardText({ label: '+10 moedas' }), '+10 moedas', 'texto do prêmio vem do rótulo gravado');
  eq(chestRewardText({ coins: 25 }), '+25 moedas', 'sem rótulo, o texto é montado pelas moedas');
  eq(chestRewardText({ xp: 60 }), '+60 XP', 'sem rótulo, o texto é montado pelo XP');
  eq(normalizeChestPayload({ chest: { prizeId: 'shield', label: 'Escudo de sequência' } }).rarity.label, 'Raro', 'payload aninhado é desembrulhado');
  eq(normalizeChestPayload({ prizeId: 'jackpot' }).rarity.label, 'Lendário', 'payload cru é aceito');
  eq(normalizeChestPayload(null), null, 'sem baú, nada é enfileirado');
}

function checkSingleGrant() {
  console.log('\n--- Concessão única por dia+evento ---');
  const db = freshDb();
  const before = db.userProfile.coins;
  const granted = grantDestinyChestSync({ getDb, rewardPlayer }, db, '2026-10-07', 'daily-review', new Date('2026-10-07T22:00:00-03:00'));
  ok(granted?.chest, 'primeira concessão devolve o baú');
  eq(db.destinyChests.length, 1, 'baú entra no banco vivo');
  eq(db.userProfile.coins, before + granted.chest.coins, 'moedas do baú caem no perfil');
  ok(granted.rewardResult?.logEntry?.id, 'recompensa do baú fica no ledger (estornável)');

  const repeated = grantDestinyChestSync({ getDb, rewardPlayer }, db, '2026-10-07', 'daily-review');
  eq(repeated, null, 'segundo pedido do mesmo dia+evento não paga de novo');
  eq(db.destinyChests.length, 1, 'nenhum baú duplicado no banco');

  const otherEvent = grantDestinyChestSync({ getDb, rewardPlayer }, db, '2026-10-07', 'triad');
  ok(otherEvent?.chest, 'outro evento do mesmo dia tem baú próprio');
  eq(db.destinyChests.length, 2, 'banco guarda um baú por evento');

  const rerolled = grantDestinyChestSync({ getDb, rewardPlayer }, db, '2026-10-08', 'daily-review');
  eq(rerolled.chest.prizeId, rollDestinyChest(chestSeed('2026-10-08', 'daily-review')).id, 'o dia seguinte usa a semente do dia seguinte');
}

function checkLinkedTriad() {
  console.log('\n--- Tríade por vitórias ligadas (missão, leitura, AGU) ---');
  const db = freshDb();
  const today = getSaoPauloDateStr();
  // Uma vitória por missão: duas já foram cumpridas pelo herói e a terceira
  // fecha a tríade quando a missão vinculada é concluída.
  let list = [];
  const links = [
    { title: 'Finalizar petição', questId: 'q-peticao', done: true },
    { title: 'Ler 20 páginas', questId: 'q-leitura', done: true },
    { title: 'Treinar 40 min', questId: 'q-treino', done: false }
  ];
  links.forEach((link) => {
    list = createDailyVictory(list, {
      title: link.title,
      category: 'Trabalho',
      date: today,
      questId: link.questId
    }, { today }).list;
  });
  db.dailyVictories = sanitizeDailyVictories(list).map((item) => {
    const link = links.find((entry) => entry.questId === item.questId);
    return link?.done
      ? { ...item, completed: true, completedAt: `${today}T12:00:00.000Z` }
      : item;
  });
  saveDb(db);

  const coinsBefore = db.userProfile.coins;
  const linked = syncDailyVictoriesFromActivity(db, {
    today,
    questId: 'q-treino',
    questCompleted: true,
    questNote: 'Concluída junto com a missão.'
  });

  eq(linked.length, 1, 'só a vitória da missão concluída foi mexida');
  eq(linked[0].bonusAwardedNow, true, 'a última vitória do dia dispara o bônus da tríade');
  const withChest = linked.find((item) => item.chest);
  ok(withChest, 'a conclusão da tríade devolve o baú em `linkedVictories`');
  eq(withChest.chest.event, 'triad', 'o baú é do evento da tríade');
  eq(withChest.chest.date, today, 'o baú é do dia da tríade');
  eq(withChest.chest.prizeId, rollDestinyChest(chestSeed(today, 'triad')).id, 'o prêmio é o da semente do dia');
  ok(withChest.chest.label, `o baú traz o rótulo da recompensa (${withChest.chest.label})`);
  eq(db.destinyChests.filter((item) => item.event === 'triad').length, 1, 'o baú da tríade ficou no banco');
  ok(db.userProfile.coins > coinsBefore, 'as recompensas da tríade caíram no perfil');
  ok(linked[0].victory.completed, 'a vitória ligada ficou concluída');

  // Reabrir a missão não paga o baú de novo no mesmo dia.
  const reopened = syncDailyVictoriesFromActivity(db, { today, questId: 'q-treino', questCompleted: false });
  eq(reopened[0]?.chest ?? null, null, 'reabrir a missão não abre um segundo baú no mesmo dia');
  eq(db.destinyChests.filter((item) => item.event === 'triad').length, 1, 'o banco continua com um baú da tríade');
}

async function checkHttpResponses(token, port) {
  console.log('\n--- Respostas HTTP carregam o baú ---');
  const post = (pathname, body) => new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {});
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        Authorization: `Bearer ${token}`
      }
    }, (res) => {
      let text = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch { /* não-JSON */ }
        resolve({ status: res.statusCode, json, text });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });

  const today = getSaoPauloDateStr();

  // 1. Fechar o dia.
  const close = await post('/api/daily-reviews', { note: 'Dia fechado no teste do baú.', mood: 'neutro' });
  eq(close.status, 200, 'POST /api/daily-reviews responde 200');
  ok(close.json?.chest, 'POST /api/daily-reviews devolve o baú do dia');
  eq(close.json.chest.event, 'daily-review', 'o baú do fechamento é do evento daily-review');
  eq(close.json.chest.prizeId, rollDestinyChest(chestSeed(today, 'daily-review')).id, 'o prêmio bate com a semente do dia');
  ok(close.json.chest.label, `o fechamento traz o texto da recompensa (${close.json.chest.label})`);

  // 2. Tríade pelo fluxo direto de vitórias.
  const db = freshDb();
  let list = [];
  const ids = [];
  ['Um', 'Dois', 'Três'].forEach((suffix) => {
    const created = createDailyVictory(list, { title: `Vitória ${suffix}`, date: today, category: 'Pessoal' }, { today });
    list = created.list;
    ids.push(created.victory.id);
  });
  db.dailyVictories = sanitizeDailyVictories(list);
  saveDb(db);

  const first = await post(`/api/daily-victories/${ids[0]}/complete`, {});
  eq(first.status, 200, 'primeira vitória concluída');
  eq(first.json.chest, null, 'vitória avulsa não abre baú');

  const second = await post(`/api/daily-victories/${ids[1]}/complete`, {});
  eq(second.json.chest, null, 'segunda vitória também não abre baú');

  const third = await post(`/api/daily-victories/${ids[2]}/complete`, {});
  eq(third.status, 200, 'terceira vitória concluída');
  eq(third.json.bonusAwardedNow, true, 'a terceira dispara o bônus da tríade');
  ok(third.json.chest, 'POST /api/daily-victories/:id/complete devolve o baú da tríade');
  eq(third.json.chest.event, 'triad', 'o baú devolvido é o da tríade');
  eq(third.json.chest.prizeId, rollDestinyChest(chestSeed(today, 'triad')).id, 'o prêmio bate com a semente do dia');
  eq(db.destinyChests.filter((item) => item.event === 'triad').length, 1, 'o baú da tríade ficou salvo');

  // 3. Tríade pela conclusão de uma missão (vitórias ligadas).
  const questDb = freshDb();
  questDb.quests = [{
    id: 'q-do-bau',
    title: 'Fechar o relatório',
    category: 'Trabalho',
    priority: 'importante',
    difficulty: 'media',
    completed: false,
    createdAt: `${today}T08:00:00.000Z`,
    subtasks: []
  }];
  let questList = [];
  const questVictoryIds = [];
  ['Um', 'Dois', 'Três'].forEach((suffix, index) => {
    const created = createDailyVictory(questList, {
      title: `Vitória ligada ${suffix}`,
      date: today,
      category: 'Trabalho',
      ...(index === 2 ? { questId: 'q-do-bau' } : {})
    }, { today });
    questList = created.list;
    questVictoryIds.push(created.victory.id);
  });
  questDb.dailyVictories = sanitizeDailyVictories(questList).map((item) => (
    item.id === questVictoryIds[2] ? item : { ...item, completed: true, completedAt: `${today}T12:00:00.000Z` }
  ));
  saveDb(questDb);

  const questDone = await post('/api/quests/q-do-bau/complete', {});
  eq(questDone.status, 200, 'missão concluída pelo HTTP');
  ok(Array.isArray(questDone.json.linkedVictories), 'resposta traz linkedVictories');
  const questChest = (questDone.json.linkedVictories || []).find((item) => item.chest);
  ok(questChest, 'a vitória ligada devolveu o baú no fluxo da missão');
  eq(questChest.bonusAwardedNow, true, 'a tríade fechou junto com a missão');
  eq(questChest.chest.event, 'triad', 'o baú é do evento da tríade');
  eq(questChest.chest.prizeId, rollDestinyChest(chestSeed(today, 'triad')).id, 'o prêmio bate com a semente do dia');
  ok(
    questDb.destinyChests.some((item) => item.event === 'triad' && item.date === today),
    'o baú da missão ficou salvo no banco'
  );
}

async function run() {
  console.log('🧪 Baú do Destino — tabela, concessão única e respostas\n');
  checkTable();
  checkSingleGrant();
  checkLinkedTriad();

  await initDb();
  const token = createSession({ id: 'usr-1', email: '', name: 'Mestre do Foco' }).token;
  const app = createApp();
  const server = await new Promise((resolve) => {
    const srv = app.listen(0, '127.0.0.1', () => resolve(srv));
  });
  try {
    await checkHttpResponses(token, server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('\n✅ Baú do Destino: rolagem estável, um baú por dia+evento e reveal com dado na resposta.\n');
}

run().catch((err) => {
  console.error('\n❌ Falhou:', err.message);
  if (err.actual !== undefined) {
    console.error(`   esperado: ${JSON.stringify(err.expected)}\n   recebido: ${JSON.stringify(err.actual)}`);
  }
  console.error(err.stack?.split('\n').slice(1, 6).join('\n'));
  process.exit(1);
});
