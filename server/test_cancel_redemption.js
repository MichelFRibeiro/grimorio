import http from 'http';

function request(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      headers: { 'Content-Type': 'application/json' },
      ...options
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

async function testCancelRedemption() {
  console.log('🧪 Iniciando testes de Cancelamento de Resgate na Taverna...');

  // 1. Get initial state
  const stateRes = await request('/api/state');
  if (stateRes.status !== 200) throw new Error(`Falha ao obter estado: ${stateRes.status}`);

  const initialCoins = stateRes.data.userProfile.coins;
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
}

testCancelRedemption().catch(err => {
  console.error('❌ Erro no teste:', err);
  process.exit(1);
});
