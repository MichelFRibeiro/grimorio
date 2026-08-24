import http from 'http';
import { fork } from 'child_process';
import { getCurrentWeekDays, getHabitWeeklyStats, getSaoPauloDateStr } from './timeUtils.js';

function request(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
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

async function ensureServerRunning() {
  try {
    const res = await request('/api/state');
    if (res.status === 200) return null;
  } catch (e) {
    // Start server
    console.log('🚀 Iniciando servidor para execução dos testes...');
    const serverProc = fork('server/index.js', [], { stdio: 'ignore' });
    await new Promise(r => setTimeout(r, 1500));
    return serverProc;
  }
  return null;
}

async function runWeeklyHabitsTest() {
  const serverProc = await ensureServerRunning();
  try {
    console.log('🧪 Iniciando testes de Rituais com Frequência de N Vezes por Semana...');

  // 1. Test unit functions in timeUtils
  const weekDays = getCurrentWeekDays();
  if (!Array.isArray(weekDays) || weekDays.length !== 7) {
    throw new Error(`getCurrentWeekDays() deveria retornar 7 dias, retornou ${weekDays?.length}`);
  }
  console.log(`✅ getCurrentWeekDays() retornou 7 dias (Início: ${weekDays[0].dateStr} ${weekDays[0].label} até ${weekDays[6].dateStr} ${weekDays[6].label})`);

  const mockHabit = {
    frequency: 'times_per_week',
    targetTimesPerWeek: 3,
    history: [weekDays[0].dateStr, weekDays[2].dateStr]
  };
  const stats = getHabitWeeklyStats(mockHabit);
  if (stats.targetTimesPerWeek !== 3 || stats.completionsThisWeek !== 2 || stats.isGoalMet !== false) {
    throw new Error(`getHabitWeeklyStats() falhou: ${JSON.stringify(stats)}`);
  }
  console.log('✅ getHabitWeeklyStats() calculou corretamente 2/3 execuções nesta semana.');

  // 2. Test POST /api/habits
  console.log('📝 Criando ritual com frequência 3x por semana...');
  const createRes = await request('/api/habits', { method: 'POST' }, {
    title: 'Treino de Calistenia (Teste N Vezes)',
    description: 'Meta de 3 vezes por semana',
    category: 'Saúde',
    frequency: 'times_per_week',
    targetTimesPerWeek: 3,
    xpReward: 40,
    coinReward: 10
  });

  if (createRes.status !== 200 || !createRes.data.success) {
    throw new Error(`Erro ao criar ritual: ${JSON.stringify(createRes.data)}`);
  }

  const createdHabit = createRes.data.habit;
  console.log(`✅ Ritual criado com sucesso! ID=${createdHabit.id}, Freq=${createdHabit.frequency}, Meta=${createdHabit.targetTimesPerWeek}`);

  if (createdHabit.frequency !== 'times_per_week' || createdHabit.targetTimesPerWeek !== 3) {
    throw new Error(`Dados incorretos no ritual criado: freq=${createdHabit.frequency}, target=${createdHabit.targetTimesPerWeek}`);
  }

  // 3. Test PUT /api/habits/:id
  console.log('✏️ Atualizando ritual para 4x por semana...');
  const updateRes = await request(`/api/habits/${createdHabit.id}`, { method: 'PUT' }, {
    title: 'Treino de Calistenia Avançado',
    frequency: 'times_per_week',
    targetTimesPerWeek: 4
  });

  if (updateRes.status !== 200 || !updateRes.data.success) {
    throw new Error(`Erro ao atualizar ritual: ${JSON.stringify(updateRes.data)}`);
  }

  const updatedHabit = updateRes.data.habit;
  console.log(`✅ Ritual atualizado! Freq=${updatedHabit.frequency}, Meta=${updatedHabit.targetTimesPerWeek}`);

  if (updatedHabit.targetTimesPerWeek !== 4) {
    throw new Error(`Meta semanal deveria ser 4, mas é ${updatedHabit.targetTimesPerWeek}`);
  }

  // 4. Test Toggle ON & OFF
  console.log('🔥 Marcando ritual como concluído hoje...');
  const toggleOnRes = await request(`/api/habits/${createdHabit.id}/toggle`, { method: 'POST' });
  if (toggleOnRes.status !== 200 || !toggleOnRes.data.success) {
    throw new Error(`Erro ao marcar ritual: ${JSON.stringify(toggleOnRes.data)}`);
  }
  console.log(`✅ Ritual marcado! Streak=${toggleOnRes.data.habit.currentStreak}, DoneToday=${toggleOnRes.data.doneToday}`);

  // 5. Test Analytics integration
  const analytics = toggleOnRes.data.analytics;
  const habitStat = (analytics.habitStats || []).find(h => h.id === createdHabit.id);
  if (!habitStat || habitStat.targetTimesPerWeek !== 4) {
    throw new Error(`Analytics habitStat não contém dados semanais corretos: ${JSON.stringify(habitStat)}`);
  }
  console.log(`✅ Analytics habitStats verificado: targetTimesPerWeek=${habitStat.targetTimesPerWeek}, completionsThisWeek=${habitStat.completionsThisWeek}`);

    // 6. Clean up
    console.log('🧹 Limpando ritual de teste...');
    await request(`/api/habits/${createdHabit.id}`, { method: 'DELETE' });

    console.log('🎉 TODOS OS TESTES DE RITUAIS N VEZES POR SEMANA PASSARAM COM SUCESSO!');
  } finally {
    if (serverProc) {
      serverProc.kill();
    }
  }
  process.exit(0);
}

runWeeklyHabitsTest().catch(err => {
  console.error('❌ Teste falhou:', err);
  process.exit(1);
});
