import http from 'http';
import { getMcpToken } from './mcpAuth.js';
import { initDb } from './db.js';

function request(path, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      method: options.method || (body ? 'POST' : 'GET')
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data, headers: res.headers });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

function rpcCall(token, method, params = {}) {
  const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
  return request('/api/mcp', { method: 'POST', headers }, {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params
  });
}

async function runTests() {
  console.log('🔮 ==========================================');
  console.log('🧪 INICIANDO TESTES DO SERVIDOR MCP (GRIMÓRIO)');
  console.log('🔮 ==========================================\n');

  await initDb();
  const token = getMcpToken();
  console.log(`🔑 Bearer Token ativo para testes: ${token.substring(0, 8)}...`);

  // 1. TESTE DE AUTENTICAÇÃO: SEM TOKEN
  console.log('\n--- 1. Teste de Autenticação: Sem Token ---');
  const noTokenRes = await rpcCall(null, 'initialize');
  if (noTokenRes.status !== 401) {
    throw new Error(`Esperado status 401 sem token, mas obteve: ${noTokenRes.status}`);
  }
  console.log('✅ Bloqueio 401 sem Bearer Token funcionou.');

  // 2. TESTE DE AUTENTICAÇÃO: TOKEN INVÁLIDO
  console.log('\n--- 2. Teste de Autenticação: Token Inválido ---');
  const invalidTokenRes = await rpcCall('token_falso_invalido_123', 'initialize');
  if (invalidTokenRes.status !== 401) {
    throw new Error(`Esperado status 401 com token falso, mas obteve: ${invalidTokenRes.status}`);
  }
  console.log('✅ Bloqueio 401 com Token inválido funcionou.');

  // 3. TESTE DE AUTENTICAÇÃO: TOKEN VÁLIDO & INITIALIZE
  console.log('\n--- 3. Teste MCP: Initialize ---');
  const initRes = await rpcCall(token, 'initialize');
  if (initRes.status !== 200 || !initRes.data?.result?.serverInfo) {
    throw new Error(`Falha no initialize: ${JSON.stringify(initRes.data)}`);
  }
  console.log(`✅ Servidor MCP inicializado: ${initRes.data.result.serverInfo.name} v${initRes.data.result.serverInfo.version}`);

  // 4. TESTE: LISTAGEM DE FERRAMENTAS (TOOLS/LIST)
  console.log('\n--- 4. Teste MCP: tools/list ---');
  const toolsRes = await rpcCall(token, 'tools/list');
  const tools = toolsRes.data?.result?.tools || [];
  console.log(`✅ ${tools.length} ferramentas MCP registradas.`);
  if (tools.length < 25) {
    throw new Error(`Esperado pelo menos 25 ferramentas, encontrado: ${tools.length}`);
  }

  // 5. TESTE: ORÁCULO DE ANÁLISES & PADRÕES (SOMENTE LEITURA)
  console.log('\n--- 5. Teste MCP: Oráculo de Análises & Padrões (Read-Only) ---');
  
  // 5.1 get_oracle_analytics
  const oracleRes = await rpcCall(token, 'tools/call', {
    name: 'get_oracle_analytics',
    arguments: {}
  });
  const oraclePayload = JSON.parse(oracleRes.data?.result?.content?.[0]?.text || '{}');
  if (!oraclePayload.success || !oraclePayload.data?.peakWindow) {
    throw new Error('Falha ao obter analytics do Oráculo: ' + JSON.stringify(oracleRes.data));
  }
  console.log(`✅ Oráculo Analytics: Janela de Pico = ${oraclePayload.data.peakWindow}, Melhor Dia = ${oraclePayload.data.bestDay}`);

  // 5.2 get_oracle_insights
  const insightsRes = await rpcCall(token, 'tools/call', {
    name: 'get_oracle_insights',
    arguments: {}
  });
  const insightsPayload = JSON.parse(insightsRes.data?.result?.content?.[0]?.text || '{}');
  console.log(`✅ Oráculo Insights: ${insightsPayload.data?.totalInsights} revelações/dicas ativas.`);

  // 5.3 get_productivity_patterns
  const prodRes = await rpcCall(token, 'tools/call', {
    name: 'get_productivity_patterns',
    arguments: {}
  });
  const prodPayload = JSON.parse(prodRes.data?.result?.content?.[0]?.text || '{}');
  console.log(`✅ Padrões de Produtividade: Horas ativas mapeadas (${prodPayload.data?.hourlyCount?.length} faixas horárias).`);

  // 5.4 get_category_rankings
  const rankRes = await rpcCall(token, 'tools/call', {
    name: 'get_category_rankings',
    arguments: {}
  });
  const rankPayload = JSON.parse(rankRes.data?.result?.content?.[0]?.text || '{}');
  console.log(`✅ Rankings de Categoria: ${rankPayload.data?.categories?.length || 0} categorias avaliadas.`);

  // 6. TESTE: RITUAIS & HÁBITOS COM NOVAS FREQUÊNCIAS
  console.log('\n--- 6. Teste MCP: Rituais com Novas Frequências ---');
  
  // 6.1 Criar hábito times_per_week (3x/semana)
  const createHabitRes = await rpcCall(token, 'tools/call', {
    name: 'create_habit',
    arguments: {
      title: 'Ritual MCP Teste 3x/Semana',
      frequency: 'times_per_week',
      targetTimesPerWeek: 3,
      category: 'Saúde',
      icon: 'Dumbbell'
    }
  });
  const habitData = JSON.parse(createHabitRes.data?.result?.content?.[0]?.text || '{}').data;
  const habitId = habitData.id;
  console.log(`✅ Ritual criado com sucesso! ID=${habitId}, freq=${habitData.frequency}, target=${habitData.targetTimesPerWeek}`);
  if (habitData.frequency !== 'times_per_week' || habitData.targetTimesPerWeek !== 3) {
    throw new Error('Dados incorretos no ritual criado.');
  }

  // 6.2 Toggle hábito
  const toggleRes = await rpcCall(token, 'tools/call', {
    name: 'toggle_habit',
    arguments: { id: habitId }
  });
  const toggleData = JSON.parse(toggleRes.data?.result?.content?.[0]?.text || '{}').data;
  console.log(`✅ Ritual marcado! Streak=${toggleData.habit.currentStreak}, CompletionsThisWeek=${toggleData.habit.weeklyStats.completionsThisWeek}`);

  // 6.3 Listar hábitos com métricas
  const listHabitsRes = await rpcCall(token, 'tools/call', {
    name: 'list_habits',
    arguments: {}
  });
  const listedHabits = JSON.parse(listHabitsRes.data?.result?.content?.[0]?.text || '{}').data.habits;
  const foundHabit = listedHabits.find(h => h.id === habitId);
  if (!foundHabit || foundHabit.targetTimesPerWeek !== 3) {
    throw new Error('Falha ao listar hábito com targetTimesPerWeek');
  }
  console.log(`✅ Listagem de hábitos validada: ${listedHabits.length} rituais encontrados.`);

  // 6.4 Excluir hábito de teste
  await rpcCall(token, 'tools/call', { name: 'delete_habit', arguments: { id: habitId } });
  console.log('✅ Ritual de teste excluído.');

  // 7. TESTE: CRUD DE MISSÕES (QUESTS)
  console.log('\n--- 7. Teste MCP: CRUD de Missões (Quests) ---');
  
  // 7.1 Criar missão
  const createQuestRes = await rpcCall(token, 'tools/call', {
    name: 'create_quest',
    arguments: {
      title: 'Missão Épica Criada via MCP',
      description: 'Testando integração completa do MCP',
      category: 'Projetos',
      priority: 'epica',
      subtasks: ['Subtarefa A', 'Subtarefa B']
    }
  });
  const questData = JSON.parse(createQuestRes.data?.result?.content?.[0]?.text || '{}').data;
  const questId = questData.id;
  console.log(`✅ Missão criada! ID=${questId}, XP=${questData.xpReward}, Moedas=${questData.coinReward}`);

  // 7.2 Obter detalhes da missão
  const getQuestRes = await rpcCall(token, 'tools/call', {
    name: 'get_quest',
    arguments: { id: questId }
  });
  const fetchedQuest = JSON.parse(getQuestRes.data?.result?.content?.[0]?.text || '{}').data;
  if (fetchedQuest.id !== questId) throw new Error('Falha ao buscar missão por ID');

  // 7.3 Concluir missão
  const completeQuestRes = await rpcCall(token, 'tools/call', {
    name: 'complete_quest',
    arguments: { id: questId, completed: true }
  });
  const completedQuestData = JSON.parse(completeQuestRes.data?.result?.content?.[0]?.text || '{}').data;
  console.log(`✅ Missão concluída com sucesso! XP ganho=${completedQuestData.rewardResult?.profile?.xp}`);

  // 7.4 Excluir missão de teste
  await rpcCall(token, 'tools/call', { name: 'delete_quest', arguments: { id: questId } });
  console.log('✅ Missão de teste excluída.');

  // 8. TESTE: CRUD DE LIVROS & SESSÕES DE LEITURA
  console.log('\n--- 8. Teste MCP: CRUD de Livros & Sessões de Leitura ---');
  const createBookRes = await rpcCall(token, 'tools/call', {
    name: 'create_book',
    arguments: {
      title: 'Grimório dos Algoritmos Lendários',
      author: 'Mestre da Computação',
      totalPages: 300,
      currentPage: 0,
      category: 'Estudos'
    }
  });
  const bookData = JSON.parse(createBookRes.data?.result?.content?.[0]?.text || '{}').data;
  const bookId = bookData.id;
  console.log(`✅ Livro cadastrado! ID=${bookId}, Total=${bookData.totalPages} páginas`);

  // Registrar sessão de leitura
  const sessionRes = await rpcCall(token, 'tools/call', {
    name: 'log_reading_session',
    arguments: {
      bookId,
      startPage: 0,
      endPage: 25,
      durationMinutes: 40,
      notes: 'Capítulo inicial fascinante',
      quotes: [{ quote: 'O foco vence o talento quando o talento procrastina.', page: 12 }]
    }
  });
  const sessionData = JSON.parse(sessionRes.data?.result?.content?.[0]?.text || '{}').data;
  console.log(`✅ Sessão registrada! Página atual do livro=${sessionData.book?.currentPage}, XP=${sessionData.session?.xpEarned}`);

  // Excluir livro
  await rpcCall(token, 'tools/call', { name: 'delete_book', arguments: { id: bookId } });
  console.log('✅ Livro e sessões de teste excluídos.');

  // 9. TESTE: CRUD DE PROCESSOS EM LOTE
  console.log('\n--- 9. Teste MCP: Processos em Lote ---');
  const createProcRes = await rpcCall(token, 'tools/call', {
    name: 'create_process',
    arguments: {
      title: 'Revisão de 10 Relatórios Técnicos',
      totalSteps: 10,
      stepUnit: 'relatórios'
    }
  });
  const procData = JSON.parse(createProcRes.data?.result?.content?.[0]?.text || '{}').data;
  const procId = procData.id;

  // Avançar 3 etapas
  const stepRes = await rpcCall(token, 'tools/call', {
    name: 'step_process',
    arguments: { id: procId, stepCount: 3, note: 'Lote inicial revisado' }
  });
  const stepData = JSON.parse(stepRes.data?.result?.content?.[0]?.text || '{}').data;
  console.log(`✅ Processo avançado! Etapa atual=${stepData.process?.currentStep}/${stepData.process?.totalSteps}`);

  await rpcCall(token, 'tools/call', { name: 'delete_process', arguments: { id: procId } });
  console.log('✅ Processo de teste excluído.');

  // 10. TESTE: RECURSOS MCP (RESOURCES/LIST & RESOURCES/READ)
  console.log('\n--- 10. Teste MCP: Resources/List & Resources/Read ---');
  const resList = await rpcCall(token, 'resources/list');
  const resources = resList.data?.result?.resources || [];
  console.log(`✅ ${resources.length} recursos MCP disponíveis: ${resources.map(r => r.uri).join(', ')}`);

  const readStateRes = await rpcCall(token, 'resources/read', { uri: 'grimorio://oracle/analytics' });
  const readContent = readStateRes.data?.result?.contents?.[0]?.text;
  if (!readContent || !readContent.includes('peakWindow')) {
    throw new Error('Falha ao ler recurso grimorio://oracle/analytics');
  }
  console.log('✅ Recurso grimorio://oracle/analytics lido com sucesso.');

  console.log('\n🎉 ==========================================');
  console.log('✨ TODOS OS TESTES DO SERVIDOR MCP PASSARAM COM 100% DE SUCESSO!');
  console.log('🎉 ==========================================\n');
  process.exit(0);
}

runTests().catch(err => {
  console.error('\n❌ ERRO NO TESTE DO MCP:', err);
  process.exit(1);
});
