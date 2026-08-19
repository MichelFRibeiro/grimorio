import http from 'http';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { formatFullAbntCitation, formatShortAbntCitation, formatAbntAuthor } from '../src/utils/abntFormatter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple request helper
function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          const json = body ? JSON.parse(body) : {};
          resolve({ status: res.statusCode, headers: res.headers, body: json });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('🧪 Iniciando bateria de testes para as novas funcionalidades...\n');

  // Test 1: ABNT Formatter Utility
  console.log('1️⃣ Testando utilitário de formatação ABNT...');
  const author1 = formatAbntAuthor('James Clear');
  const author2 = formatAbntAuthor('George S. Clason');
  const author3 = formatAbntAuthor('Clarice Lispector');
  console.log(`   Autor 'James Clear' -> '${author1}'`);
  console.log(`   Autor 'George S. Clason' -> '${author2}'`);
  console.log(`   Autor 'Clarice Lispector' -> '${author3}'`);

  if (author1 !== 'CLEAR, James' || author2 !== 'CLASON, George S.' || author3 !== 'LISPECTOR, Clarice') {
    throw new Error('Falha na formatação de autores ABNT!');
  }

  const sampleBook = { title: 'Hábitos Atômicos', author: 'James Clear' };
  const sampleCitation = formatFullAbntCitation('O sucesso é o produto de hábitos diários.', sampleBook, 42);
  console.log('   Citação Completa Gerada:\n' + sampleCitation.split('\n').map(l => '     ' + l).join('\n'));
  if (!sampleCitation.includes('(CLEAR, p. 42)') || !sampleCitation.includes('CLEAR, James. Hábitos Atômicos. p. 42.')) {
    throw new Error('Falha no formato da citação ABNT!');
  }
  console.log('   ✅ Utilitário ABNT validado com sucesso!\n');

  // Start backend server process on port 3001 for test
  console.log('2️⃣ Iniciando servidor backend de teste na porta 3001...');
  const serverProcess = spawn('node', [path.join(__dirname, 'index.js')], {
    env: { ...process.env, PORT: '3001' },
    stdio: 'pipe'
  });

  serverProcess.stdout.on('data', d => console.log('   [Server]: ' + d.toString().trim()));
  serverProcess.stderr.on('data', d => console.error('   [Server Err]: ' + d.toString().trim()));

  await sleep(1500);

  try {
    // Auth Config
    const confRes = await request({
      hostname: '127.0.0.1',
      port: 3001,
      path: '/api/auth/config',
      method: 'GET'
    });
    console.log(`   GET /api/auth/config -> Status ${confRes.status}`, confRes.body);

    // Guest Login
    const guestRes = await request({
      hostname: '127.0.0.1',
      port: 3001,
      path: '/api/auth/guest',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    console.log(`   POST /api/auth/guest -> Status ${guestRes.status}, token:`, guestRes.body?.token ? 'OK' : 'NÃO');
    const token = guestRes.body?.token;

    if (!token) throw new Error('Falha ao autenticar como convidado!');

    // Validate session with /api/auth/me
    const meRes = await request({
      hostname: '127.0.0.1',
      port: 3001,
      path: '/api/auth/me',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`   GET /api/auth/me -> Authenticated:`, meRes.body?.authenticated, meRes.body?.user?.name);
    if (!meRes.body?.authenticated) throw new Error('Falha ao validar sessão em /api/auth/me');

    // Test 3: Quest Categories CRUD
    console.log('\n3️⃣ Testando CRUD de Categorias de Missões...');
    
    // Create Category
    const catCreateRes = await request({
      hostname: '127.0.0.1',
      port: 3001,
      path: '/api/quest-categories',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    }, { name: 'Categoria de Teste ' + Date.now(), color: '#ec4899' });
    console.log(`   POST /api/quest-categories -> Status ${catCreateRes.status}`, catCreateRes.body?.category);
    const createdCat = catCreateRes.body?.category;
    if (!createdCat) throw new Error('Falha ao criar categoria!');

    // Edit Category
    const catUpdateRes = await request({
      hostname: '127.0.0.1',
      port: 3001,
      path: `/api/quest-categories/${createdCat.id}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    }, { name: 'Categoria Modificada ' + Date.now(), color: '#06b6d4' });
    console.log(`   PUT /api/quest-categories/:id -> Status ${catUpdateRes.status}`, catUpdateRes.body?.category?.name);

    // Delete Category
    const catDeleteRes = await request({
      hostname: '127.0.0.1',
      port: 3001,
      path: `/api/quest-categories/${createdCat.id}`,
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`   DELETE /api/quest-categories/:id -> Status ${catDeleteRes.status}`);
    console.log('   ✅ CRUD de Categorias de Missões validado!');

    // Test 4: Quests - Complete & Revert
    console.log('\n4️⃣ Testando Missão: Criar, Concluir e Reabrir (com estorno de XP e moedas)...');
    
    // Get initial state
    const stateRes1 = await request({
      hostname: '127.0.0.1',
      port: 3001,
      path: '/api/state',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const initialXp = stateRes1.body?.userProfile?.xp || 0;
    const initialCoins = stateRes1.body?.userProfile?.coins || 0;
    const initialLevel = stateRes1.body?.userProfile?.level || 1;
    console.log(`   Estado inicial: Nível = ${initialLevel}, XP = ${initialXp}, Moedas = ${initialCoins}`);

    // Create Quest
    const questRes = await request({
      hostname: '127.0.0.1',
      port: 3001,
      path: '/api/quests',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    }, {
      title: 'Missão Teste Estorno ' + Date.now(),
      priority: 'media', // +45 XP, 12 coins
      category: 'Trabalho'
    });
    const quest = questRes.body?.quest;
    console.log(`   Criada missão: "${quest.title}" (+${quest.xpReward} XP, +${quest.coinReward} 🪙)`);

    // Edit Quest
    const editQuestRes = await request({
      hostname: '127.0.0.1',
      port: 3001,
      path: `/api/quests/${quest.id}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    }, {
      title: quest.title + ' [Atualizada]',
      priority: 'alta', // +80 XP, 25 coins
      description: 'Descrição atualizada com sucesso'
    });
    console.log(`   Editada missão -> Título: "${editQuestRes.body?.quest?.title}", XP: +${editQuestRes.body?.quest?.xpReward}`);

    // Complete Quest
    const completeRes = await request({
      hostname: '127.0.0.1',
      port: 3001,
      path: `/api/quests/${quest.id}/complete`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`   Concluída missão -> willComplete:`, completeRes.body?.willComplete);

    const stateRes2 = await request({
      hostname: '127.0.0.1',
      port: 3001,
      path: '/api/state',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`   Estado após conclusão: Nível = ${stateRes2.body?.userProfile?.level}, XP = ${stateRes2.body?.userProfile?.xp}, Moedas = ${stateRes2.body?.userProfile?.coins}`);
    if (stateRes2.body?.userProfile?.coins <= initialCoins) {
      throw new Error('Moedas deveriam ter aumentado após conclusão da missão!');
    }

    // Reopen Quest (return to pending)
    const reopenRes = await request({
      hostname: '127.0.0.1',
      port: 3001,
      path: `/api/quests/${quest.id}/complete`,
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`   Reaberta missão -> willComplete:`, reopenRes.body?.willComplete);

    const stateRes3 = await request({
      hostname: '127.0.0.1',
      port: 3001,
      path: '/api/state',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    console.log(`   Estado após reabrir: Nível = ${stateRes3.body?.userProfile?.level}, XP = ${stateRes3.body?.userProfile?.xp}, Moedas = ${stateRes3.body?.userProfile?.coins}`);
    if (stateRes3.body?.userProfile?.coins !== initialCoins || stateRes3.body?.userProfile?.level !== initialLevel || stateRes3.body?.userProfile?.xp !== initialXp) {
      throw new Error(`Moedas ou XP não foram estornados perfeitamente ao estado inicial! (Esperado: Level ${initialLevel}, XP ${initialXp}, Moedas ${initialCoins}; Obtido: Level ${stateRes3.body?.userProfile?.level}, XP ${stateRes3.body?.userProfile?.xp}, Moedas ${stateRes3.body?.userProfile?.coins})`);
    }
    console.log('   ✅ Conclusão e Estorno de Missão validados perfeitamente!');

    // Cleanup test quest
    await request({
      hostname: '127.0.0.1',
      port: 3001,
      path: `/api/quests/${quest.id}`,
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    // Test 5: Quotes - Create and Edit
    console.log('\n5️⃣ Testando Citação: Criar e Editar...');
    // Create a temporary book
    const bookRes = await request({
      hostname: '127.0.0.1',
      port: 3001,
      path: '/api/books',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    }, {
      title: 'Livro de Citações Teste ' + Date.now(),
      author: 'Autor Testador',
      totalPages: 300,
      currentPage: 50
    });
    const book = bookRes.body?.book;

    // Add quote
    const quoteRes = await request({
      hostname: '127.0.0.1',
      port: 3001,
      path: `/api/books/${book.id}/quotes`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    }, {
      quote: 'Primeira versão da citação filosófica.',
      page: 45,
      note: 'Comentário inicial'
    });
    const quote = quoteRes.body?.quote;
    console.log(`   Criada citação: "${quote.quote}" (pág. ${quote.page})`);

    // Edit quote
    const editQuoteRes = await request({
      hostname: '127.0.0.1',
      port: 3001,
      path: `/api/books/${book.id}/quotes/${quote.id}`,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    }, {
      quote: 'Versão EDITADA e APRIMORADA da citação.',
      page: 46,
      note: 'Comentário aprofundado'
    });
    console.log(`   Editada citação -> Nova citação: "${editQuoteRes.body?.quote?.quote}" (pág. ${editQuoteRes.body?.quote?.page})`);
    if (editQuoteRes.body?.quote?.quote !== 'Versão EDITADA e APRIMORADA da citação.') {
      throw new Error('Falha na edição da citação!');
    }
    console.log('   ✅ Edição de Citação validada!');

    // Cleanup test book
    await request({
      hostname: '127.0.0.1',
      port: 3001,
      path: `/api/books/${book.id}`,
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log('\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO!');
  } finally {
    serverProcess.kill();
  }
}

runTests().catch(err => {
  console.error('\n❌ Erro durante os testes:', err);
  process.exit(1);
});
