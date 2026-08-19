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

async function runFeatureTests() {
  console.log('🧪 Iniciando testes das novas funcionalidades: Questões de Concurso & Citações de Leitura...');

  // 1. Get initial state
  const stateRes = await request('/api/state');
  if (stateRes.status !== 200) {
    throw new Error(`Falha ao carregar estado da API: ${stateRes.status}`);
  }
  console.log('✅ /api/state respondeu com status 200');

  // 2. Test Exam Questions Registration (20 feitas, 19 certas)
  console.log('📝 Testando POST /api/questions (exemplo: fiz 20 acertei 19)...');
  const questionPayload = {
    subject: 'Direito Constitucional',
    topic: 'Controle de Constitucionalidade',
    institution: 'Cebraspe',
    totalQuestions: 20,
    correctAnswers: 19,
    durationMinutes: 25,
    notes: 'Questão sobre ADC com pegadinha na legitimação ativa'
  };

  const createQuestionRes = await request('/api/questions', { method: 'POST' }, questionPayload);
  if (createQuestionRes.status !== 200 || !createQuestionRes.data.success) {
    throw new Error(`Erro ao criar questão: ${JSON.stringify(createQuestionRes.data)}`);
  }

  const createdQuestion = createQuestionRes.data.examQuestion;
  console.log(`✅ Questão criada com sucesso! ID=${createdQuestion.id}, Acertos=${createdQuestion.correctAnswers}/${createdQuestion.totalQuestions}, Taxa=${createdQuestion.accuracyRate}%, XP=${createdQuestion.xpEarned}`);

  if (createdQuestion.accuracyRate !== 95) {
    throw new Error(`Taxa de acerto incorreta! Esperado: 95%, Obtido: ${createdQuestion.accuracyRate}%`);
  }

  // 3. Test Oracle Analytics calculation for Dia, Semana, Mês, Ano e Total
  console.log('🔮 Verificando Oráculo nos 5 horizontes temporais (Dia, Semana, Mês, Ano, Total)...');
  const afterQuestionState = await request('/api/state');
  const analytics = afterQuestionState.data.analytics;

  if (!analytics.questionHorizons) {
    throw new Error('questionHorizons não encontrado no objeto analytics!');
  }

  const { day, week, month, year, total } = analytics.questionHorizons;
  console.log(`📊 Horizontes:
    - Hoje: ${day.totalCorrect}/${day.totalSolved} (${day.accuracyRate}%)
    - Semana: ${week.totalCorrect}/${week.totalSolved} (${week.accuracyRate}%)
    - Mês: ${month.totalCorrect}/${month.totalSolved} (${month.accuracyRate}%)
    - Ano: ${year.totalCorrect}/${year.totalSolved} (${year.accuracyRate}%)
    - Total: ${total.totalCorrect}/${total.totalSolved} (${total.accuracyRate}%)`);

  if (day.totalSolved < 20 || day.totalCorrect < 19) {
    throw new Error('Métricas do Dia no Oráculo não contabilizaram a bateria recente!');
  }
  if (total.totalSolved < 20 || total.totalCorrect < 19) {
    throw new Error('Métricas do Total no Oráculo não contabilizaram a bateria recente!');
  }

  // 4. Test Subject Breakdown
  console.log('📚 Verificando ranking por matéria no Oráculo...');
  const constStat = (analytics.subjectStats || []).find(s => s.subject === 'Direito Constitucional');
  if (!constStat || constStat.totalSolved < 20) {
    throw new Error('Estatísticas por disciplina não encontraram Direito Constitucional com 20 questões!');
  }
  console.log(`✅ Direito Constitucional: ${constStat.totalCorrect}/${constStat.totalSolved} (${constStat.accuracyRate}%)`);

  // 5. Test Book Reading Session with item-by-item quotes
  console.log('📖 Testando Sessão de Leitura com múltiplas citações item a item...');
  // Find or create a test book
  let bookId = afterQuestionState.data.books?.[0]?.id;
  if (!bookId) {
    const newBookRes = await request('/api/books', { method: 'POST' }, {
      title: 'Livro Teste Citações',
      author: 'Autor Teste',
      totalPages: 200,
      currentPage: 0,
      category: 'Estudos'
    });
    bookId = newBookRes.data.book.id;
  }

  const readingSessionPayload = {
    startPage: 0,
    endPage: 25,
    durationMinutes: 40,
    notes: 'Excelente leitura do capítulo 1 e 2',
    quotes: [
      {
        quote: 'A disciplina é a ponte entre metas e realizações.',
        page: 12,
        note: 'Aplicar no cronograma diário'
      },
      {
        quote: 'Pequenos ajustes repetidos criam grandes transformações.',
        page: 24,
        note: 'Regra do 1%'
      }
    ]
  };

  const sessionRes = await request(`/api/books/${bookId}/reading-session`, { method: 'POST' }, readingSessionPayload);
  if (sessionRes.status !== 200 || !sessionRes.data.success) {
    throw new Error(`Erro ao salvar sessão de leitura com citações: ${JSON.stringify(sessionRes.data)}`);
  }

  console.log(`✅ Sessão de leitura registrada! Páginas=${sessionRes.data.session.pagesRead}, Citações=${sessionRes.data.session.quotes?.length}`);

  // 6. Test direct quote adding to book
  console.log('✍️ Testando POST /api/books/:id/quotes (adicionar citação direta)...');
  const directQuoteRes = await request(`/api/books/${bookId}/quotes`, { method: 'POST' }, {
    quote: 'O sucesso deixa pistas.',
    page: 50,
    note: 'Princípio da modelagem'
  });

  if (directQuoteRes.status !== 200 || !directQuoteRes.data.success) {
    throw new Error(`Erro ao adicionar citação avulsa: ${JSON.stringify(directQuoteRes.data)}`);
  }
  console.log(`✅ Citação avulsa cadastrada com sucesso! ID=${directQuoteRes.data.quote.id}, Pág=${directQuoteRes.data.quote.page}`);

  // 7. Cleanup test question
  console.log('🧹 Limpando registro de teste de questões...');
  const delQuestionRes = await request(`/api/questions/${createdQuestion.id}`, { method: 'DELETE' });
  if (delQuestionRes.status !== 200) {
    throw new Error('Falha ao excluir questão de teste.');
  }
  console.log('✅ Questão de teste excluída e recompensas estornadas com sucesso!');

  console.log('🎉 TODOS OS TESTES PASSARAM COM SUCESSO!');
}

runFeatureTests().catch(err => {
  console.error('❌ Erro nos testes:', err);
  process.exit(1);
});
