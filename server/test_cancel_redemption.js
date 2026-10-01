import './testEnv.js';
import { startTestServer } from './testEnv.js';
import http from 'http';

const PORT = Number(process.env.TEST_PORT || process.env.PORT || 3000);
let authToken = null;

function request(path, options = {}, body = null) {
  const { headers: extraHeaders, ...rest } = options;
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(extraHeaders || {})
      },
      ...rest
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/** A API exige sessão: entra como convidado, como o navegador faria. */
async function loginAsGuest() {
  const res = await request('/api/auth/guest', { method: 'POST' }, {});
  if (res.status !== 200 || !res.data?.token) {
    throw new Error(`Não foi possível autenticar (HTTP ${res.status}). Suba o servidor com "node server/index.js".`);
  }
  authToken = res.data.token;
}

async function testCancelRedemption() {
  const server = await startTestServer();
  try {
  await loginAsGuest();
  console.log('🧪 Iniciando testes de Cancelamento de Resgate na Taverna...');

  // 1. Get initial state
  const stateRes = await request('/api/state');
  if (stateRes.status !== 200) throw new Error(`Falha ao obter estado: ${stateRes.status}`);

  const profileCoins = stateRes.data.userProfile.coins;
  // O resgate exige saldo. Ganha as moedas concluindo uma missão, sem atalho de perfil.
  const questRes = await request('/api/quests', { method: 'POST' }, {
    title: 'Missão para financiar o resgate de teste',
    difficulty: 'epica'
  });
  if (questRes.status !== 200 || !questRes.data.quest) {
    throw new Error(`Falha ao criar missão de saldo: ${JSON.stringify(questRes.data)}`);
  }
  const doneRes = await request(`/api/quests/${questRes.data.quest.id}/complete`, { method: 'POST' }, { completed: true });
  if (doneRes.status !== 200) throw new Error(`Falha ao concluir missão de saldo: ${JSON.stringify(doneRes.data)}`);
  const funded = await request('/api/state');
  const initialCoins = funded.data.userProfile.coins;
  if (initialCoins < profileCoins + 25) {
    throw new Error(`Saldo insuficiente para o teste: ${initialCoins}`);
  }
  console.log(`💰 Moedas iniciais do jogador: ${initialCoins}`);

  // 2. Create test reward (cost: 25 coins)
  console.log('🎁 Criando recompensa de teste (custo: 25 moedas)...');
  const rewardRes = await request('/api/rewards', { method: 'POST' }, {
    title: 'Café Expresso Especial Teste',
    description: 'Pausa para um café gourmet',
    cost: 25,
    icon: 'Coffee',
    category: 'custom'
  });

  if (rewardRes.status !== 200 || !rewardRes.data.success) {
    throw new Error(`Erro ao criar recompensa: ${JSON.stringify(rewardRes.data)}`);
  }
  const testReward = rewardRes.data.reward;
  console.log(`✅ Recompensa criada: ID=${testReward.id}, Custo=${testReward.cost}`);

  // 3. Redeem reward
  console.log('🛒 Resgatando recompensa na Taverna...');
  const redeemRes = await request(`/api/rewards/${testReward.id}/redeem`, { method: 'POST' });
  if (redeemRes.status !== 200 || !redeemRes.data.success) {
    throw new Error(`Erro ao resgatar: ${JSON.stringify(redeemRes.data)}`);
  }

  const redemption = redeemRes.data.redemption;
  const coinsAfterRedeem = redeemRes.data.userProfile.coins;
  console.log(`✅ Resgate concluído: ID=${redemption.id}, Moedas restantes=${coinsAfterRedeem}`);

  if (coinsAfterRedeem !== initialCoins - 25) {
    throw new Error(`Dedução de moedas incorreta! Esperado: ${initialCoins - 25}, Obtido: ${coinsAfterRedeem}`);
  }

  // 4. Cancel redemption
  console.log('↩️ Cancelando o resgate e solicitando estorno de moedas...');
  const cancelRes = await request(`/api/rewards/redemptions/${redemption.id}/cancel`, { method: 'POST' });
  if (cancelRes.status !== 200 || !cancelRes.data.success) {
    throw new Error(`Erro ao cancelar resgate: ${JSON.stringify(cancelRes.data)}`);
  }

  const refundedCoins = cancelRes.data.refundedCoins;
  const coinsAfterCancel = cancelRes.data.userProfile.coins;
  console.log(`✅ Resgate cancelado com sucesso! Moedas estornadas=+${refundedCoins}, Saldo atual=${coinsAfterCancel}`);

  if (coinsAfterCancel !== initialCoins) {
    throw new Error(`Estorno de moedas incorreto! Esperado: ${initialCoins}, Obtido: ${coinsAfterCancel}`);
  }

  // Check state to confirm redemption is gone from list
  const finalState = await request('/api/state');
  const foundRedemption = (finalState.data.rewardRedemptions || []).find(r => r.id === redemption.id);
  if (foundRedemption) {
    throw new Error('O resgate ainda consta na lista de resgates do banco de dados!');
  }

  // 5. Clean up test reward
  console.log('🧹 Limpando recompensa de teste...');
  await request(`/api/rewards/${testReward.id}`, { method: 'DELETE' });

  console.log('🎉 TODOS OS TESTES DE CANCELAMENTO DE RESGATE PASSARAM COM 100% DE SUCESSO!');
  } finally {
    server.stop();
  }
}

testCancelRedemption().catch(err => {
  console.error('❌ Erro no teste:', err);
  process.exit(1);
});
