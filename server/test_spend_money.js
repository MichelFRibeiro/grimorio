import assert from 'assert';
import { brlToCoins, coinsToBrl, parseBrlAmount, normalizeBrl } from '../src/utils/coinExchange.js';
import { spendMoney, refundCoinsFromRedemption } from './tavernMoney.js';

function makeDb(coins) {
  return {
    userProfile: { coins },
    rewardRedemptions: [],
    actionLogs: []
  };
}

function run() {
  console.log('🧪 Testando câmbio e gastos em R$ na Taverna...');

  assert.strictEqual(parseBrlAmount('25,00'), 25);
  assert.strictEqual(parseBrlAmount('R$ 25,50'), 25.5);
  assert.strictEqual(parseBrlAmount('1.250,10'), 1250.1);
  assert.strictEqual(normalizeBrl(25.456), 25.46);
  assert.strictEqual(brlToCoins(25), 250);
  assert.strictEqual(brlToCoins(25.5), 255);
  assert.strictEqual(coinsToBrl(250), 25);
  console.log('✅ Câmbio R$ 1,00 = 10 moedas validado.');

  const db = makeDb(1000);
  const spent = spendMoney(db, { amountBrl: 25, item: 'sorvete' });
  assert.strictEqual(spent.success, true);
  assert.strictEqual(spent.redemption.kind, 'money');
  assert.strictEqual(spent.redemption.amountBrl, 25);
  assert.strictEqual(spent.redemption.cost, 250);
  assert.strictEqual(spent.redemption.rewardTitle, 'sorvete');
  assert.strictEqual(db.userProfile.coins, 750);
  assert.strictEqual(db.rewardRedemptions.length, 1);
  assert.strictEqual(db.actionLogs[0].type, 'money_spend');
  assert.strictEqual(db.actionLogs[0].coins, -250);
  console.log('✅ Gasto de R$ 25,00 debitou 250 moedas.');

  const overdraft = spendMoney(db, { amountBrl: 80, item: 'jantar' });
  assert.strictEqual(overdraft.success, true);
  assert.strictEqual(overdraft.redemption.cost, 800);
  assert.strictEqual(db.userProfile.coins, -50);
  console.log('✅ Gasto acima do saldo deixa as moedas negativas.');

  const missingItem = spendMoney(db, { amountBrl: 10, item: '   ' });
  assert.ok(missingItem.error);
  console.log('✅ Item comprado é obrigatório.');

  assert.strictEqual(refundCoinsFromRedemption(spent.redemption), 250);
  console.log('🎉 TODOS OS TESTES DE GASTO EM R$ PASSARAM!');
}

run();
