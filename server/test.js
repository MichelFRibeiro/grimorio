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

async function runTests() {
  console.log('🧪 Testando estorno ao desmarcar rituais e missões...');

  // 1. Get initial state
  const initial = await request('/api/state');
  const initXp = initial.data.userProfile.xp;
  const initCoins = initial.data.userProfile.coins;
  const initConsistency = initial.data.userProfile.stats.consistency;
  const initLogsCount = initial.data.actionLogs.length;

  console.log(`Estado Inicial: XP=${initXp}, Coins=${initCoins}, Consistency=${initConsistency}, Logs=${initLogsCount}`);

  // 2. Create a test habit
  const habitRes = await request('/api/habits', { method: 'POST' }, {
    title: 'Hábito de Teste Estorno',
    frequency: 'daily',
    xpReward: 30,
    coinReward: 8
  });
  const habitId = habitRes.data.habit.id;

  // 3. Toggle ON habit
  const toggleOnRes = await request(`/api/habits/${habitId}/toggle`, { method: 'POST' });
  const afterOn = await request('/api/state');
  console.log(`Hábito Marcado: XP=${afterOn.data.userProfile.xp} (+${afterOn.data.userProfile.xp - initXp}), Logs=${afterOn.data.actionLogs.length}`);

  if (afterOn.data.userProfile.xp <= initXp) {
    throw new Error('Falha: XP não aumentou ao marcar o hábito!');
  }

  // 4. Toggle OFF habit (Cancel execution)
  const toggleOffRes = await request(`/api/habits/${habitId}/toggle`, { method: 'POST' });
  const afterOff = await request('/api/state');
  console.log(`Hábito Desmarcado (Cancelado): XP=${afterOff.data.userProfile.xp}, Coins=${afterOff.data.userProfile.coins}, Consistency=${afterOff.data.userProfile.stats.consistency}, Logs=${afterOff.data.actionLogs.length}`);

  if (afterOff.data.userProfile.xp !== initXp) {
    throw new Error(`Falha: XP deveria ter voltado para ${initXp}, mas está ${afterOff.data.userProfile.xp}`);
  }
  if (afterOff.data.actionLogs.length !== initLogsCount) {
    throw new Error(`Falha: Log deveria ter sido removido da timeline! Esperado: ${initLogsCount}, Atual: ${afterOff.data.actionLogs.length}`);
  }

  // Clean up test habit
  await request(`/api/habits/${habitId}`, { method: 'DELETE' });

  console.log('🎉 Teste de estorno de rituais PASSOU COM SUCESSO!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
