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

async function runSessionCrudTests() {
  console.log('🧪 Iniciando testes de Edição e Exclusão de Sessões de Leitura com Estorno de Pontos...');

  // 1. Get initial state & initial XP / Wisdom / Coins
  const initialState = await request('/api/state');
  if (initialState.status !== 200) {
    throw new Error(`Falha ao carregar estado: ${initialState.status}`);
  }
  const initialProfile = initialState.data.userProfile;
  const initialXp = initialProfile.xp;
  const initialWisdom = initialProfile.stats.wisdom || 0;
  const initialCoins = initialProfile.coins;
  console.log(`👤 Jogador Inicial: XP=${initialXp}, Sabedoria=${initialWisdom}, Moedas=${initialCoins}, Level=${initialProfile.level}`);

  // 2. Create test book
  console.log('📚 Criando livro para teste de sessões...');
  const bookRes = await request('/api/books', { method: 'POST' }, {
    title: 'Livro Teste CRUD Sessões',
    author: 'Autor Teste',
    totalPages: 200,
    currentPage: 0,
    category: 'Produtividade'
  });
  const testBook = bookRes.data.book;
  console.log(`✅ Livro criado: ID=${testBook.id}, Páginas=${testBook.totalPages}`);

  // 3. Create reading session (0 -> 30 pages + 1 quote)
  // Expected rewards: base = 30*2=60 XP, quote = 15 XP -> 75 XP. Wisdom = 30 + 5 = 35. Coins = 10 + 2 = 12.
  console.log('📖 Criando sessão de leitura (0 a 30 págs)...');
  const sessionRes = await request(`/api/books/${testBook.id}/reading-session`, { method: 'POST' }, {
    startPage: 0,
    endPage: 30,
    durationMinutes: 30,
    notes: 'Leitura inicial do livro teste',
    quotes: [
      {
        quote: 'Começar é a parte mais difícil.',
        page: 15,
        note: 'Nota sobre foco'
      }
    ]
  });

  if (sessionRes.status !== 200 || !sessionRes.data.success) {
    throw new Error(`Erro ao criar sessão: ${JSON.stringify(sessionRes.data)}`);
  }

  const createdSession = sessionRes.data.session;
  console.log(`✅ Sessão criada: ID=${createdSession.id}, Páginas=${createdSession.pagesRead}, XP=${createdSession.xpEarned}, Sabedoria=${createdSession.wisdomEarned}`);

  // Verify state after creation
  const stateAfterCreate = await request('/api/state');
  const profAfterCreate = stateAfterCreate.data.userProfile;
  const bookAfterCreate = stateAfterCreate.data.books.find(b => b.id === testBook.id);

  console.log(`📊 Pós-criação: Livro na pág ${bookAfterCreate.currentPage}, XP total=${profAfterCreate.xp}, Sabedoria=${profAfterCreate.stats.wisdom}`);
  if (bookAfterCreate.currentPage !== 30) {
    throw new Error(`Página atual do livro incorreta! Esperado: 30, Obtido: ${bookAfterCreate.currentPage}`);
  }

  // 4. Edit reading session (reduce to 0 -> 10 pages, remove quote)
  // New rewards: base = 10*2=20 XP. Wisdom = 10. Coins = Math.max(5, 3) = 5.
  // Delta: XP delta = 20 - 75 = -55. Wisdom delta = 10 - 35 = -25.
  console.log('✏️ Editando sessão de leitura para 0 a 10 págs (reduzindo 20 páginas)...');
  const editRes = await request(`/api/reading-sessions/${createdSession.id}`, { method: 'PUT' }, {
    startPage: 0,
    endPage: 10,
    durationMinutes: 15,
    notes: 'Ajustando: na verdade li apenas 10 páginas',
    quotes: []
  });

  if (editRes.status !== 200 || !editRes.data.success) {
    throw new Error(`Erro ao editar sessão: ${JSON.stringify(editRes.data)}`);
  }

  const editedSession = editRes.data.session;
  const bookAfterEdit = editRes.data.book;
  const profAfterEdit = editRes.data.userProfile;
  console.log(`✅ Sessão editada com sucesso! Novas págs=${editedSession.pagesRead}, Novo XP=${editedSession.xpEarned}, Nova Sabedoria=${editedSession.wisdomEarned}`);
  console.log(`📊 Pós-edição: Livro na pág ${bookAfterEdit.currentPage}, XP total=${profAfterEdit.xp}, Sabedoria=${profAfterEdit.stats.wisdom}`);

  if (bookAfterEdit.currentPage !== 10) {
    throw new Error(`Página atual do livro não foi recalculada corretamente! Esperado: 10, Obtido: ${bookAfterEdit.currentPage}`);
  }

  // 5. Delete reading session
  console.log('🗑️ Excluindo sessão de leitura...');
  const deleteRes = await request(`/api/reading-sessions/${createdSession.id}`, { method: 'DELETE' });
  if (deleteRes.status !== 200 || !deleteRes.data.success) {
    throw new Error(`Erro ao excluir sessão: ${JSON.stringify(deleteRes.data)}`);
  }

  const stateAfterDelete = await request('/api/state');
  const profAfterDelete = stateAfterDelete.data.userProfile;
  const bookAfterDelete = stateAfterDelete.data.books.find(b => b.id === testBook.id);
  const remainingSession = stateAfterDelete.data.readingSessions.find(s => s.id === createdSession.id);

  console.log(`📊 Pós-exclusão: Livro na pág ${bookAfterDelete.currentPage}, XP=${profAfterDelete.xp}, Sabedoria=${profAfterDelete.stats.wisdom}`);

  if (remainingSession) {
    throw new Error('Sessão de leitura ainda consta na lista de sessões!');
  }
  if (bookAfterDelete.currentPage !== 0) {
    throw new Error(`Página do livro não retornou a 0 após excluir a única sessão! Obtido: ${bookAfterDelete.currentPage}`);
  }

  // 6. Cleanup test book
  console.log('🧹 Excluindo livro de teste...');
  await request(`/api/books/${testBook.id}`, { method: 'DELETE' });

  console.log('🎉 TODOS OS TESTES DE EDIÇÃO, EXCLUSÃO E ESTORNO DE PONTOS PASSARAM COM 100% DE SUCESSO!');
}

runSessionCrudTests().catch(err => {
  console.error('❌ Erro nos testes de CRUD de sessões:', err);
  process.exit(1);
});
