/**
 * Sistema de Rankings por Categoria e Ranking Geral do Usuário
 * Grimório de Missões
 * 
 * Regras:
 * - 11 Tiers: E, D, C, B-, B, B+, A-, A, A+, S, S+
 * - Semanas: Domingo 00:00:00 a Sábado 23:59:59
 * - Decaimento gradual: -1 nível por semana fechada com produção insuficiente
 * - Promoção imediata: atinge o tier correspondente ao XP gerado na semana
 * - Ranking Geral: Média dos rankings de todas as categorias ativas
 */

export const RANK_TIERS = [
  {
    id: 'E',
    name: 'E',
    minXp: 0,
    maxXp: 99,
    color: '#94a3b8',
    textColor: '#f8fafc',
    bg: 'rgba(148, 163, 184, 0.15)',
    border: '#64748b',
    glow: 'rgba(148, 163, 184, 0.3)',
    title: 'Iniciado',
    description: 'Nível base / Pouca ou nenhuma atividade registrada na semana'
  },
  {
    id: 'D',
    name: 'D',
    minXp: 100,
    maxXp: 249,
    color: '#38bdf8',
    textColor: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.15)',
    border: '#0284c7',
    glow: 'rgba(56, 189, 248, 0.3)',
    title: 'Aprendiz',
    description: 'Atividade leve (~2 missões médias ou 100 XP por semana)'
  },
  {
    id: 'C',
    name: 'C',
    minXp: 250,
    maxXp: 449,
    color: '#34d399',
    textColor: '#34d399',
    bg: 'rgba(52, 211, 153, 0.15)',
    border: '#059669',
    glow: 'rgba(52, 211, 153, 0.3)',
    title: 'Praticante',
    description: 'Atividade regular (~5 missões médias ou 1 lote de processos)'
  },
  {
    id: 'B-',
    name: 'B-',
    minXp: 450,
    maxXp: 699,
    color: '#a78bfa',
    textColor: '#a78bfa',
    bg: 'rgba(167, 139, 250, 0.15)',
    border: '#7c3aed',
    glow: 'rgba(167, 139, 250, 0.3)',
    title: 'Adepto I',
    description: 'Ritmo semanal constante e focado (~10 missões médias)'
  },
  {
    id: 'B',
    name: 'B',
    minXp: 700,
    maxXp: 999,
    color: '#c084fc',
    textColor: '#c084fc',
    bg: 'rgba(192, 132, 252, 0.15)',
    border: '#9333ea',
    glow: 'rgba(192, 132, 252, 0.3)',
    title: 'Adepto II',
    description: 'Alto rendimento consistente na categoria'
  },
  {
    id: 'B+',
    name: 'B+',
    minXp: 1000,
    maxXp: 1399,
    color: '#e879f9',
    textColor: '#e879f9',
    bg: 'rgba(232, 121, 249, 0.15)',
    border: '#c026d3',
    glow: 'rgba(232, 121, 249, 0.3)',
    title: 'Adepto III',
    description: 'Foco elevado e múltiplos blocos produtivos concluídos'
  },
  {
    id: 'A-',
    name: 'A-',
    minXp: 1400,
    maxXp: 1899,
    color: '#fbbf24',
    textColor: '#fbbf24',
    bg: 'rgba(251, 191, 36, 0.15)',
    border: '#d97706',
    glow: 'rgba(251, 191, 36, 0.3)',
    title: 'Mestre I',
    description: 'Rendimento semanal avançado e execução exemplar'
  },
  {
    id: 'A',
    name: 'A',
    minXp: 1900,
    maxXp: 2499,
    color: '#f59e0b',
    textColor: '#f59e0b',
    bg: 'rgba(245, 158, 11, 0.2)',
    border: '#b45309',
    glow: 'rgba(245, 158, 11, 0.4)',
    title: 'Mestre II',
    description: 'Domínio produtivo notável na categoria'
  },
  {
    id: 'A+',
    name: 'A+',
    minXp: 2500,
    maxXp: 3199,
    color: '#fb923c',
    textColor: '#fb923c',
    bg: 'rgba(251, 146, 60, 0.2)',
    border: '#ea580c',
    glow: 'rgba(251, 146, 60, 0.4)',
    title: 'Mestre III',
    description: 'Elite de produtividade e execução contínua'
  },
  {
    id: 'S',
    name: 'S',
    minXp: 3200,
    maxXp: 3999,
    color: '#f43f5e',
    textColor: '#f43f5e',
    bg: 'rgba(244, 63, 94, 0.2)',
    border: '#e11d48',
    glow: 'rgba(244, 63, 94, 0.5)',
    title: 'Lendário',
    description: 'Desempenho extraordinário de nível épico'
  },
  {
    id: 'S+',
    name: 'S+',
    minXp: 4000,
    maxXp: Infinity,
    color: '#ec4899',
    textColor: '#f472b6',
    bg: 'linear-gradient(135deg, rgba(236, 72, 153, 0.25) 0%, rgba(245, 158, 11, 0.25) 100%)',
    border: '#f59e0b',
    glow: 'rgba(236, 72, 153, 0.6)',
    title: 'Soberano Mítico',
    description: 'Maestria absoluta e dedicação suprema no Grimório'
  }
];

/**
 * Retorna o índice do rank (0 a 10) correspondente à quantidade de XP semanal
 */
export function getRankIndexForXp(xp) {
  const safeXp = Math.max(0, parseInt(xp, 10) || 0);
  for (let i = RANK_TIERS.length - 1; i >= 0; i--) {
    if (safeXp >= RANK_TIERS[i].minXp) {
      return i;
    }
  }
  return 0;
}

/**
 * Retorna o objeto completo do rank para um determinado XP
 */
export function getRankForXp(xp) {
  return RANK_TIERS[getRankIndexForXp(xp)];
}

/**
 * Calcula os limites da semana (Domingo 00:00:00 até Sábado 23:59:59) para uma dada data.
 */
export function getWeekBounds(dateInput = new Date()) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    return getWeekBounds(new Date());
  }

  // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  const day = d.getDay();

  // Início da semana: Domingo 00:00:00 local
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - day);
  sunday.setHours(0, 0, 0, 0);

  // Fim da semana: Sábado 23:59:59.999 local
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  saturday.setHours(23, 59, 59, 999);

  const startIso = sunday.toISOString();
  const endIso = saturday.toISOString();
  const weekKey = startIso.split('T')[0]; // Ex: "2026-08-16" (data do domingo)

  const sDay = String(sunday.getDate()).padStart(2, '0');
  const sMonth = String(sunday.getMonth() + 1).padStart(2, '0');
  const eDay = String(saturday.getDate()).padStart(2, '0');
  const eMonth = String(saturday.getMonth() + 1).padStart(2, '0');
  const eYear = saturday.getFullYear();

  const weekLabel = `${sDay}/${sMonth} a ${eDay}/${eMonth}/${eYear}`;
  const shortLabel = `${sDay}/${sMonth} - ${eDay}/${eMonth}`;

  return {
    sunday,
    saturday,
    startIso,
    endIso,
    weekKey,
    weekLabel,
    shortLabel
  };
}

/**
 * Extrai a categoria normalizada de um log de ação ou entidade
 */
function resolveLogCategory(log, db) {
  if (log.details?.category) return log.details.category;

  if (log.type === 'quest_complete' && log.entityId && db.quests) {
    const q = db.quests.find(item => item.id === log.entityId);
    if (q?.category) return q.category;
  }

  if (log.type === 'process_step' && log.entityId && db.processes) {
    const p = db.processes.find(item => item.id === log.entityId);
    if (p?.category) return p.category;
  }

  if (log.type === 'reading_session' || log.type === 'book_quote') {
    return 'Estudos';
  }

  if (log.type === 'exam_questions') {
    return 'Estudos';
  }

  if (log.type === 'habit_complete') {
    return 'Pessoal';
  }

  return 'Geral';
}

/**
 * Calcula todo o histórico semana a semana e o ranking atual de cada categoria e do usuário
 */
export function computeCategoryRankings(db = {}) {
  const now = new Date();
  const currentWeekBounds = getWeekBounds(now);
  const currentWeekKey = currentWeekBounds.weekKey;

  // 1. Categorias registradas no Grimório
  const rawCategories = db.questCategories || [];
  const categoriesMap = new Map();

  rawCategories.forEach(cat => {
    const catName = typeof cat === 'string' ? cat : cat.name;
    const catColor = cat.color || '#38bdf8';
    const catIcon = cat.icon || 'Tag';
    const catId = cat.id || `cat-${catName.toLowerCase()}`;
    categoriesMap.set(catName, { id: catId, name: catName, color: catColor, icon: catIcon });
  });

  // Garantir que categorias padrão mínimas existam caso a lista esteja vazia
  if (categoriesMap.size === 0) {
    [
      { id: 'cat-1', name: 'Trabalho', color: '#38bdf8', icon: 'Briefcase' },
      { id: 'cat-2', name: 'Estudos', color: '#a855f7', icon: 'GraduationCap' },
      { id: 'cat-3', name: 'Pessoal', color: '#10b981', icon: 'User' },
      { id: 'cat-4', name: 'Projetos', color: '#f59e0b', icon: 'FolderGit2' },
      { id: 'cat-5', name: 'Saúde', color: '#f43f5e', icon: 'Heart' },
      { id: 'cat-6', name: 'Finanças', color: '#eab308', icon: 'Coins' }
    ].forEach(c => categoriesMap.set(c.name, c));
  }

  // 2. Coletar todos os eventos de XP com data e categoria
  const xpEvents = [];
  const logs = db.actionLogs || [];

  logs.forEach(log => {
    const xp = parseInt(log.xp, 10) || 0;
    if (xp <= 0) return;

    const timestamp = log.timestamp || (log.date ? `${log.date}T12:00:00.000Z` : null);
    if (!timestamp) return;

    const category = resolveLogCategory(log, db);
    // Registrar categoria caso seja nova
    if (!categoriesMap.has(category) && category !== 'Geral') {
      categoriesMap.set(category, {
        id: `cat-${category.toLowerCase().replace(/\s+/g, '-')}`,
        name: category,
        color: '#f59e0b',
        icon: 'Tag'
      });
    }

    xpEvents.push({
      xp,
      category,
      timestamp: new Date(timestamp)
    });
  });

  // Fallback: se houver missões completadas que não estejam no actionLogs
  (db.quests || []).filter(q => q.completed && q.completedAt).forEach(q => {
    const hasLog = logs.some(l => l.entityId === q.id && l.type === 'quest_complete');
    if (!hasLog) {
      const cat = q.category || 'Geral';
      if (!categoriesMap.has(cat) && cat !== 'Geral') {
        categoriesMap.set(cat, { id: `cat-${cat.toLowerCase()}`, name: cat, color: '#38bdf8', icon: 'Tag' });
      }
      xpEvents.push({
        xp: parseInt(q.xpReward, 10) || 45,
        category: cat,
        timestamp: new Date(q.completedAt)
      });
    }
  });

  // Fallback: etapas de processos completadas
  (db.processSteps || []).forEach(step => {
    const hasLog = logs.some(l => l.type === 'process_step' && l.timestamp === step.createdAt);
    if (!hasLog && step.xpEarned && step.createdAt) {
      const proc = (db.processes || []).find(p => p.id === step.processId);
      const cat = proc?.category || 'Trabalho';
      xpEvents.push({
        xp: parseInt(step.xpEarned, 10) || 20,
        category: cat,
        timestamp: new Date(step.createdAt)
      });
    }
  });

  // 3. Determinar o intervalo cronológico de todas as semanas
  let earliestDate = now;
  xpEvents.forEach(evt => {
    if (evt.timestamp < earliestDate) {
      earliestDate = evt.timestamp;
    }
  });

  // Gerar a lista de todas as semanas do início até a atual (garante semanas sem atividade)
  const weeksList = [];
  let iterDate = new Date(earliestDate);
  // Retroceder até o domingo da data mais antiga
  iterDate.setDate(iterDate.getDate() - iterDate.getDay());
  iterDate.setHours(0, 0, 0, 0);

  const currentSunday = currentWeekBounds.sunday;

  while (iterDate <= currentSunday) {
    const bounds = getWeekBounds(iterDate);
    weeksList.push(bounds);
    // Avançar 7 dias
    iterDate = new Date(iterDate);
    iterDate.setDate(iterDate.getDate() + 7);
  }

  if (weeksList.length === 0 || weeksList[weeksList.length - 1].weekKey !== currentWeekKey) {
    weeksList.push(currentWeekBounds);
  }

  // 4. Mapear XP por categoria e por semana
  // weekKey -> categoryName -> totalXp
  const weeklyCategoryXp = new Map();
  weeksList.forEach(w => {
    weeklyCategoryXp.set(w.weekKey, new Map());
  });

  xpEvents.forEach(evt => {
    const wBounds = getWeekBounds(evt.timestamp);
    const wKey = wBounds.weekKey;
    if (!weeklyCategoryXp.has(wKey)) {
      weeklyCategoryXp.set(wKey, new Map());
    }
    const catMap = weeklyCategoryXp.get(wKey);
    catMap.set(evt.category, (catMap.get(evt.category) || 0) + evt.xp);
  });

  // 5. Simular a evolução e decaimento semana a semana para cada categoria
  const categoriesList = Array.from(categoriesMap.values());
  const categoryRankings = {};

  categoriesList.forEach(cat => {
    let currentRankIndex = 0; // Começa no ranking E (índice 0)
    const history = [];

    // Iterar por todas as semanas até a semana anterior (fechadas)
    for (let i = 0; i < weeksList.length - 1; i++) {
      const w = weeksList[i];
      const catMap = weeklyCategoryXp.get(w.weekKey);
      const weeklyXp = catMap?.get(cat.name) || 0;
      const targetRankIndex = getRankIndexForXp(weeklyXp);

      const previousRankIndex = currentRankIndex;

      // Regra de evolução e queda gradual:
      if (targetRankIndex >= currentRankIndex) {
        // Subiu ou manteve
        currentRankIndex = targetRankIndex;
      } else {
        // Produção insuficiente para o nível atual: decai exatamente 1 nível
        currentRankIndex = Math.max(0, currentRankIndex - 1);
      }

      history.push({
        weekKey: w.weekKey,
        weekLabel: w.weekLabel,
        shortLabel: w.shortLabel,
        xp: weeklyXp,
        previousRankIndex,
        previousRank: RANK_TIERS[previousRankIndex].name,
        rankIndex: currentRankIndex,
        rank: RANK_TIERS[currentRankIndex].name,
        targetRankIndex,
        targetRank: RANK_TIERS[targetRankIndex].name,
        isClosed: true
      });
    }

    // Semana Atual (em andamento)
    const startOfCurrentWeekRankIndex = currentRankIndex;
    const currentWeekCatMap = weeklyCategoryXp.get(currentWeekKey);
    const currentWeekXp = currentWeekCatMap?.get(cat.name) || 0;
    const currentTargetRankIndex = getRankIndexForXp(currentWeekXp);

    // Na semana em andamento:
    // Se o XP atual já alcança um rank superior ao inicial da semana, é promovido de imediato
    let dynamicRankIndex = startOfCurrentWeekRankIndex;
    let status = 'maintained'; // 'maintained' | 'promoted' | 'at_risk'

    if (currentTargetRankIndex > startOfCurrentWeekRankIndex) {
      dynamicRankIndex = currentTargetRankIndex;
      status = 'promoted';
    } else if (currentWeekXp >= RANK_TIERS[startOfCurrentWeekRankIndex].minXp) {
      dynamicRankIndex = startOfCurrentWeekRankIndex;
      status = 'maintained';
    } else {
      // Abaixo do necessário para manter: continua com o rank atual, mas com alerta de risco de queda
      dynamicRankIndex = startOfCurrentWeekRankIndex;
      status = startOfCurrentWeekRankIndex > 0 ? 'at_risk' : 'maintained';
    }

    const currentRankTier = RANK_TIERS[dynamicRankIndex];
    const maintainMinXp = currentRankTier.minXp;
    const xpNeededToMaintain = Math.max(0, maintainMinXp - currentWeekXp);

    const nextRankIndex = Math.min(RANK_TIERS.length - 1, dynamicRankIndex + 1);
    const nextRankTier = dynamicRankIndex < RANK_TIERS.length - 1 ? RANK_TIERS[nextRankIndex] : null;
    const nextRankMinXp = nextRankTier ? nextRankTier.minXp : maintainMinXp;
    const xpNeededForNextRank = nextRankTier ? Math.max(0, nextRankMinXp - currentWeekXp) : 0;

    // Percentual de progresso na semana
    let progressPercent = 0;
    if (nextRankTier) {
      const range = nextRankMinXp - currentRankTier.minXp;
      const progressInTier = Math.max(0, currentWeekXp - currentRankTier.minXp);
      progressPercent = Math.min(100, Math.round((progressInTier / range) * 100));
    } else {
      progressPercent = 100;
    }

    const currentWeekSummary = {
      weekKey: currentWeekKey,
      weekLabel: currentWeekBounds.weekLabel,
      shortLabel: currentWeekBounds.shortLabel,
      xp: currentWeekXp,
      startRankIndex: startOfCurrentWeekRankIndex,
      startRank: RANK_TIERS[startOfCurrentWeekRankIndex].name,
      rankIndex: dynamicRankIndex,
      rank: currentRankTier.name,
      targetRankIndex: currentTargetRankIndex,
      targetRank: RANK_TIERS[currentTargetRankIndex].name,
      status, // 'maintained' | 'promoted' | 'at_risk'
      isClosed: false
    };

    history.push(currentWeekSummary);

    categoryRankings[cat.name] = {
      category: cat,
      currentRank: currentRankTier,
      currentRankIndex: dynamicRankIndex,
      weeklyXp: currentWeekXp,
      maintainMinXp,
      xpNeededToMaintain,
      nextRank: nextRankTier,
      nextRankMinXp,
      xpNeededForNextRank,
      progressPercent,
      status, // 'maintained' | 'promoted' | 'at_risk'
      startOfCurrentWeekRankIndex,
      startOfCurrentWeekRank: RANK_TIERS[startOfCurrentWeekRankIndex],
      history: history.slice(-8) // Últimas 8 semanas para visualização
    };
  });

  // 6. Calcular Ranking Geral do Usuário (Média dos Ranks de Todas as Categorias)
  const categoryRankValues = Object.values(categoryRankings);
  const totalCategories = categoryRankValues.length;

  let sumRankIndices = 0;
  let totalWeeklyXpAllCategories = 0;

  categoryRankValues.forEach(cr => {
    sumRankIndices += cr.currentRankIndex;
    totalWeeklyXpAllCategories += cr.weeklyXp;
  });

  const avgRankIndex = totalCategories > 0 ? sumRankIndices / totalCategories : 0;
  const overallRankIndex = Math.min(10, Math.max(0, Math.round(avgRankIndex)));
  const overallRank = RANK_TIERS[overallRankIndex];

  // Identificar categoria mais avançada e mais ativa da semana
  let topRankedCategory = null;
  let topRankScore = -1;
  let mostActiveCategory = null;
  let maxWeekXp = -1;

  categoryRankValues.forEach(cr => {
    if (cr.currentRankIndex > topRankScore) {
      topRankScore = cr.currentRankIndex;
      topRankedCategory = cr;
    }
    if (cr.weeklyXp > maxWeekXp) {
      maxWeekXp = cr.weeklyXp;
      mostActiveCategory = cr;
    }
  });

  // Tempo restante na semana atual
  const msRemainingInWeek = Math.max(0, currentWeekBounds.saturday.getTime() - now.getTime());
  const daysRemaining = Math.floor(msRemainingInWeek / (1000 * 60 * 60 * 24));
  const hoursRemaining = Math.floor((msRemainingInWeek % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  return {
    overall: {
      rank: overallRank,
      rankIndex: overallRankIndex,
      avgScore: Math.round(avgRankIndex * 10) / 10,
      maxScore: 10,
      totalWeeklyXp: totalWeeklyXpAllCategories,
      totalCategories,
      topRankedCategory: topRankedCategory ? {
        name: topRankedCategory.category.name,
        rank: topRankedCategory.currentRank.name,
        color: topRankedCategory.category.color
      } : null,
      mostActiveCategory: mostActiveCategory && mostActiveCategory.weeklyXp > 0 ? {
        name: mostActiveCategory.category.name,
        xp: mostActiveCategory.weeklyXp,
        color: mostActiveCategory.category.color
      } : null
    },
    categories: categoryRankings,
    categoriesList: Object.values(categoryRankings),
    tiers: RANK_TIERS,
    currentWeek: {
      weekKey: currentWeekKey,
      weekLabel: currentWeekBounds.weekLabel,
      shortLabel: currentWeekBounds.shortLabel,
      startDate: currentWeekBounds.sunday.toISOString(),
      endDate: currentWeekBounds.saturday.toISOString(),
      daysRemaining,
      hoursRemaining,
      countdownLabel: `${daysRemaining}d ${hoursRemaining}h restantes até sábado`
    }
  };
}
