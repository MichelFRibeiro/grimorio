import { getDb } from './db.js';
import { computeCategoryRankings } from './rankings.js';

export function computeAnalytics() {
  const db = getDb();
  const logs = db.actionLogs || [];
  const quests = db.quests || [];
  const books = db.books || [];
  const readingSessions = db.readingSessions || [];
  const examQuestions = db.examQuestions || [];
  const processes = db.processes || [];
  const processSteps = db.processSteps || [];
  const habits = db.habits || [];

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const currentMonthStr = todayStr.substring(0, 7); // '2026-08'
  const currentYearStr = todayStr.substring(0, 4); // '2026'

  // Calculate start of current week (Monday)
  const currentDayOfWeek = now.getDay(); // 0 is Sunday, 1 is Monday...
  const diffToMonday = (currentDayOfWeek === 0 ? -6 : 1) - currentDayOfWeek;
  const mondayDate = new Date(now);
  mondayDate.setDate(now.getDate() + diffToMonday);
  const weekStartStr = mondayDate.toISOString().split('T')[0];

  // 1. Hourly Distribution (0 to 23)
  const hourlyCount = Array(24).fill(0);
  logs.forEach(log => {
    const h = log.hour !== undefined ? log.hour : new Date(log.timestamp).getHours();
    if (h >= 0 && h < 24) {
      hourlyCount[h] += 1;
    }
  });

  // Find peak productivity window
  let maxHour = 0;
  let maxHourCount = 0;
  hourlyCount.forEach((count, h) => {
    if (count > maxHourCount) {
      maxHourCount = count;
      maxHour = h;
    }
  });
  const peakWindow = `${String(maxHour).padStart(2, '0')}:00 - ${String(Math.min(23, maxHour + 2)).padStart(2, '0')}:00`;

  // 2. Day of Week Distribution (0: Sun, 1: Mon, ..., 6: Sat)
  const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const dayCounts = Array(7).fill(0);
  logs.forEach(log => {
    const d = log.dayOfWeek !== undefined ? log.dayOfWeek : new Date(log.timestamp).getDay();
    if (d >= 0 && d < 7) {
      dayCounts[d] += 1;
    }
  });

  let bestDayIndex = 0;
  let bestDayCount = 0;
  dayCounts.forEach((count, idx) => {
    if (count > bestDayCount) {
      bestDayCount = count;
      bestDayIndex = idx;
    }
  });
  const bestDay = dayNames[bestDayIndex];

  // 3. Category Breakdown (Quests, Processes & Questions)
  const categoryCounts = {};
  quests.filter(q => q.completed).forEach(q => {
    const cat = q.category || 'Geral';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });
  processes.forEach(p => {
    const cat = p.category || 'Trabalho';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + (p.completedUnits || 0);
  });
  examQuestions.forEach(q => {
    const cat = `Questões: ${q.subject || 'Geral'}`;
    categoryCounts[cat] = (categoryCounts[cat] || 0) + (q.totalQuestions || 0);
  });

  // 4. Reading Analytics
  let totalPagesRead = 0;
  let totalReadingMinutes = 0;
  readingSessions.forEach(s => {
    totalPagesRead += (s.pagesRead || 0);
    totalReadingMinutes += (s.durationMinutes || 0);
  });

  const avgPagesPerSession = readingSessions.length > 0
    ? Math.round((totalPagesRead / readingSessions.length) * 10) / 10
    : 0;

  const readingSpeedPPH = totalReadingMinutes > 0
    ? Math.round((totalPagesRead / (totalReadingMinutes / 60)) * 10) / 10
    : 30; // default 30 pages/hour estimate

  // Reading projections for currently active books
  const activeBooks = books.filter(b => b.status === 'reading');
  const bookProjections = activeBooks.map(b => {
    const remainingPages = Math.max(0, b.totalPages - b.currentPage);
    const estHours = readingSpeedPPH > 0 ? (remainingPages / readingSpeedPPH) : 0;
    const estDays = avgPagesPerSession > 0 ? Math.ceil(remainingPages / avgPagesPerSession) : Math.ceil(remainingPages / 20);
    return {
      bookId: b.id,
      title: b.title,
      totalPages: b.totalPages,
      currentPage: b.currentPage,
      remainingPages,
      percent: Math.round((b.currentPage / b.totalPages) * 100),
      estimatedDays: estDays,
      estimatedHours: Math.round(estHours * 10) / 10
    };
  });

  // 5. Exam Questions Analytics (5 Time Horizons & Subject Breakdown)
  const aggregateQuestions = (list) => {
    let totalSolved = 0;
    let totalCorrect = 0;
    let totalWrong = 0;
    let totalDurationMinutes = 0;
    let totalXp = 0;
    let totalCoins = 0;

    list.forEach(q => {
      const solved = q.totalQuestions || 0;
      const correct = q.correctAnswers || 0;
      const wrong = q.wrongAnswers !== undefined ? q.wrongAnswers : Math.max(0, solved - correct);
      totalSolved += solved;
      totalCorrect += correct;
      totalWrong += wrong;
      totalDurationMinutes += (q.durationMinutes || 0);
      totalXp += (q.xpEarned || 0);
      totalCoins += (q.coinsEarned || 0);
    });

    const accuracyRate = totalSolved > 0 ? Math.round((totalCorrect / totalSolved) * 1000) / 10 : 0;

    return {
      totalSolved,
      totalCorrect,
      totalWrong,
      accuracyRate,
      totalDurationMinutes,
      totalXp,
      totalCoins,
      sessionsCount: list.length
    };
  };

  const dayQuestions = examQuestions.filter(q => (q.date || q.timestamp?.split('T')[0]) === todayStr);
  const weekQuestions = examQuestions.filter(q => {
    const d = q.date || q.timestamp?.split('T')[0];
    return d >= weekStartStr && d <= todayStr;
  });
  const monthQuestions = examQuestions.filter(q => {
    const d = q.date || q.timestamp?.split('T')[0];
    return d && d.startsWith(currentMonthStr);
  });
  const yearQuestions = examQuestions.filter(q => {
    const d = q.date || q.timestamp?.split('T')[0];
    return d && d.startsWith(currentYearStr);
  });
  const totalQuestionsStats = aggregateQuestions(examQuestions);

  const questionHorizons = {
    day: { ...aggregateQuestions(dayQuestions), label: 'Hoje' },
    week: { ...aggregateQuestions(weekQuestions), label: 'Esta Semana' },
    month: { ...aggregateQuestions(monthQuestions), label: 'Este Mês' },
    year: { ...aggregateQuestions(yearQuestions), label: 'Este Ano' },
    total: { ...totalQuestionsStats, label: 'Todo o Histórico' }
  };

  // Subject Breakdown
  const subjectMap = {};
  examQuestions.forEach(q => {
    const subj = (q.subject || 'Geral').trim();
    if (!subjectMap[subj]) {
      subjectMap[subj] = {
        subject: subj,
        totalSolved: 0,
        totalCorrect: 0,
        totalWrong: 0,
        sessionsCount: 0,
        totalDurationMinutes: 0
      };
    }
    const solved = q.totalQuestions || 0;
    const correct = q.correctAnswers || 0;
    const wrong = q.wrongAnswers !== undefined ? q.wrongAnswers : Math.max(0, solved - correct);

    subjectMap[subj].totalSolved += solved;
    subjectMap[subj].totalCorrect += correct;
    subjectMap[subj].totalWrong += wrong;
    subjectMap[subj].sessionsCount += 1;
    subjectMap[subj].totalDurationMinutes += (q.durationMinutes || 0);
  });

  const subjectStats = Object.values(subjectMap).map(s => ({
    ...s,
    accuracyRate: s.totalSolved > 0 ? Math.round((s.totalCorrect / s.totalSolved) * 1000) / 10 : 0
  })).sort((a, b) => b.totalSolved - a.totalSolved);

  // Question Daily History (Last 14 Days for Charts)
  const questionDailyHistory = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toISOString().split('T')[0];
    const dayLabel = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
    const dayLogs = examQuestions.filter(q => (q.date || q.timestamp?.split('T')[0]) === dateStr);
    const agg = aggregateQuestions(dayLogs);
    questionDailyHistory.push({
      date: dateStr,
      label: dayLabel,
      totalSolved: agg.totalSolved,
      totalCorrect: agg.totalCorrect,
      totalWrong: agg.totalWrong,
      accuracyRate: agg.accuracyRate
    });
  }

  // 6. Process Batch Operations Analytics
  let totalProcessUnitsCompleted = 0;
  processes.forEach(p => {
    totalProcessUnitsCompleted += (p.completedUnits || 0);
  });

  // 7. Habit Consistency
  const habitStats = habits.map(h => ({
    id: h.id,
    title: h.title,
    currentStreak: h.currentStreak,
    bestStreak: h.bestStreak,
    totalCompletions: (h.history || []).length
  }));

  // 8. Behavioral Pattern Insights Engine (The Oracle's Wisdom)
  const insights = [];

  // Insight: Question Mastery & Concurso Focus
  if (totalQuestionsStats.totalSolved > 0) {
    const topSubj = subjectStats[0];
    const highAccuracy = totalQuestionsStats.accuracyRate >= 80;
    insights.push({
      type: 'questions_mastery',
      icon: 'Target',
      color: highAccuracy ? 'emerald' : 'amber',
      title: `🎯 Desempenho em Questões: ${totalQuestionsStats.accuracyRate}% de Acerto Geral`,
      description: `Você já realizou ${totalQuestionsStats.totalSolved} questões (${totalQuestionsStats.totalCorrect} certas). ${topSubj ? `Sua disciplina mais praticada é "${topSubj.subject}" com ${topSubj.accuracyRate}% de acerto em ${topSubj.totalSolved} questões.` : ''}`
    });
  } else {
    insights.push({
      type: 'questions_mastery',
      icon: 'Target',
      color: 'amber',
      title: '🎯 Treino de Questões Disponível',
      description: 'Comece a registrar suas baterias de questões de concurso público para acompanhar sua taxa de precisão, evolução por matéria e prever sua pontuação de corte.'
    });
  }

  // Insight 1: Productivity Window
  if (logs.length > 0 && maxHourCount > 0) {
    insights.push({
      type: 'peak_hours',
      icon: 'Sun',
      color: 'amber',
      title: 'Pico de Produtividade Detectado',
      description: `Sua maior concentração de conclusões ocorre na faixa das ${peakWindow}. Agende suas tarefas mais complexas e análises profundas neste horário para maximizar seu rendimento.`
    });
  }

  // Insight 2: Best Day of the Week
  if (bestDayCount > 0) {
    insights.push({
      type: 'best_day',
      icon: 'Calendar',
      color: 'indigo',
      title: `Seu Dia Mais Forte: ${bestDay}`,
      description: `${bestDay} lidera seu histórico com ${bestDayCount} ações concluídas. Use esse embalo para liquidar tarefas pendentes e avançar metas prioritárias.`
    });
  }

  // Insight 3: Reading Velocity & ETA
  if (activeBooks.length > 0 && readingSessions.length > 0) {
    const firstProj = bookProjections[0];
    insights.push({
      type: 'reading_pace',
      icon: 'BookOpen',
      color: 'emerald',
      title: 'Ritmo de Leitura Ancestral',
      description: `Com sua média de ${avgPagesPerSession} págs por sessão (${readingSpeedPPH} págs/hora), a previsão para terminar "${firstProj.title}" é de cerca de ${firstProj.estimatedDays} sessões!`
    });
  } else if (activeBooks.length > 0) {
    insights.push({
      type: 'reading_pace',
      icon: 'BookOpen',
      color: 'emerald',
      title: 'Livro em Andamento',
      description: `Inicie uma Sessão de Leitura com o cronômetro para medir sua velocidade média de leitura e desbloquear projeções automáticas de conclusão.`
    });
  }

  // Insight 4: Process Velocity
  if (processes.length > 0) {
    const activeProcesses = processes.filter(p => p.status === 'in_progress');
    const totalRemaining = activeProcesses.reduce((acc, p) => acc + (p.totalUnits - p.completedUnits), 0);
    insights.push({
      type: 'process_momentum',
      icon: 'Layers',
      color: 'cyan',
      title: 'Eficiência na Esteira de Processos',
      description: `Você já processou ${totalProcessUnitsCompleted} itens no total. Restam ${totalRemaining} unidades em aberto nos processos ativos. Lotes de 2 a 5 itens por sessão evitam fadiga mental.`
    });
  }

  // Insight 5: Urgency & Procrastination Pattern
  const completedQuests = quests.filter(q => q.completed);
  const pendingQuests = quests.filter(q => !q.completed);
  const epicOrHighPending = pendingQuests.filter(q => q.priority === 'alta' || q.priority === 'epica').length;

  if (epicOrHighPending > 0) {
    insights.push({
      type: 'procrastination_guard',
      icon: 'ShieldAlert',
      color: 'rose',
      title: 'Guardião Contra a Procrastinação',
      description: `Você possui ${epicOrHighPending} missão(ões) de alta prioridade ou épica aguardando. Dividi-las em subtarefas ou atacá-las logo pela manhã reduz o atrito de início em até 60%.`
    });
  } else {
    insights.push({
      type: 'flow_state',
      icon: 'Sparkles',
      color: 'purple',
      title: 'Estado de Foco Implacável',
      description: `Nenhuma tarefa crítica pendente no momento! Seu fluxo de trabalho está em equilíbrio com o Grimório.`
    });
  }

  // 9. Category & User Rankings (E to S+ tiers, Sunday-to-Saturday weekly cycle, decay rules)
  const rankings = computeCategoryRankings(db);

  // Insight 6: Category Rankings & Risk of Decay
  const atRiskCategories = (rankings.categoriesList || []).filter(c => c.status === 'at_risk' && c.currentRankIndex > 0);
  const promotedCategories = (rankings.categoriesList || []).filter(c => c.status === 'promoted');

  if (promotedCategories.length > 0) {
    const names = promotedCategories.map(c => `"${c.category.name}" (Rank ${c.currentRank.name})`).join(', ');
    insights.unshift({
      type: 'ranking_promoted',
      icon: 'Award',
      color: 'emerald',
      title: `⚡ Promoção de Ranking Conquistada!`,
      description: `Parabéns! Você alcançou novos patamares esta semana em: ${names}. Continue firme para consolidar seu prestígio!`
    });
  } else if (atRiskCategories.length > 0) {
    const firstRisk = atRiskCategories[0];
    insights.unshift({
      type: 'ranking_risk',
      icon: 'ShieldAlert',
      color: 'amber',
      title: `⚠️ Atenção ao Ranking: "${firstRisk.category.name}" em Risco de Queda`,
      description: `Você está atualmente no Rank ${firstRisk.currentRank.name} em "${firstRisk.category.name}". Faltam ${firstRisk.xpNeededToMaintain} XP até sábado às 23:59 para manter seu nível e evitar a queda de 1 rank.`
    });
  }

  // Summary counts
  const summary = {
    totalQuestsCompleted: completedQuests.length,
    totalQuestsPending: pendingQuests.length,
    totalPagesRead,
    totalReadingSessions: readingSessions.length,
    totalQuestionsSolved: totalQuestionsStats.totalSolved,
    totalQuestionsCorrect: totalQuestionsStats.totalCorrect,
    overallAccuracyRate: totalQuestionsStats.accuracyRate,
    totalProcessUnitsCompleted,
    totalHabitsActive: habits.length,
    totalActionsLogged: logs.length,
    overallUserRank: rankings.overall?.rank?.name || 'E'
  };

  return {
    hourlyCount,
    peakWindow,
    dayCounts,
    dayNames,
    bestDay,
    categoryCounts,
    totalPagesRead,
    avgPagesPerSession,
    readingSpeedPPH,
    bookProjections,
    questionHorizons,
    subjectStats,
    questionDailyHistory,
    totalProcessUnitsCompleted,
    habitStats,
    rankings,
    insights,
    summary
  };
}
