/**
 * Funcionalidades que o herói pode ligar ou desligar em Configurações.
 *
 * O interruptor só controla o que aparece: dados, recompensas, rotas e
 * ferramentas de IA continuam intactos. Ligar de novo devolve tudo como
 * estava. Ausência de preferência = tudo ligado (bancos antigos não mudam).
 */

export const FEATURE_SETTINGS = [
  {
    id: 'victories',
    label: 'Vitórias Planejadas para o Dia',
    description: 'O cartão de vitórias do dia e o planejamento da manhã.',
    group: 'Painel'
  },
  {
    id: 'boss',
    label: 'Chefe Ativo',
    description: 'O banner do chefe semanal. O combate e as recompensas continuam valendo por baixo.',
    group: 'Painel'
  },
  {
    id: 'oracleCard',
    label: 'O Oráculo indica',
    description: 'O cartão de próxima atividade. Desligar não apaga a memória do Oráculo.',
    group: 'Painel'
  },
  {
    id: 'dayTimeline',
    label: 'Linha do tempo do dia',
    description: 'O que foi feito hoje, na ordem do dia. Desligar só esconde; os registros continuam.',
    group: 'Painel'
  },
  {
    id: 'today',
    label: 'Hoje',
    tab: 'today',
    description: 'O painel do dia: o que vence, o que está atrasado e o fechamento.',
    group: 'Abas'
  },
  {
    id: 'quests',
    label: 'Missões',
    tab: 'quests',
    description: 'A lista de missões e o atalho de nova missão.',
    group: 'Abas'
  },
  {
    id: 'questions',
    label: 'Questões',
    tab: 'questions',
    description: 'O registro de baterias e simulados.',
    group: 'Abas'
  },
  {
    id: 'books',
    label: 'Biblioteca',
    tab: 'books',
    description: 'Livros, sessões de leitura e citações.',
    group: 'Abas'
  },
  {
    id: 'scripture',
    label: 'Escrituras',
    tab: 'scripture',
    description: 'A leitura da Bíblia e as reflexões.',
    group: 'Abas'
  },
  {
    id: 'maps',
    label: 'Mapas',
    tab: 'maps',
    description: 'Os mapas mentais e a revisão espaçada.',
    group: 'Abas'
  },
  {
    id: 'processes',
    label: 'Processos',
    tab: 'processes',
    description: 'A linha de operações em lote.',
    group: 'Abas'
  },
  {
    id: 'habits',
    label: 'Rituais',
    tab: 'habits',
    description: 'Os rituais diários. Rotinas continuam avançando os rituais por baixo.',
    group: 'Abas'
  },
  {
    id: 'routines',
    label: 'Rotinas',
    tab: 'routines',
    description: 'As sequências de rituais, atividades e outras rotinas. Desligar não apaga a ordem cadastrada.',
    group: 'Abas'
  },
  {
    id: 'supplements',
    label: 'Suplementos',
    tab: 'supplements',
    description: 'O registro de doses.',
    group: 'Abas'
  },
  {
    id: 'phone',
    label: 'Celular',
    tab: 'phone',
    description: 'O tempo de tela e o pedido do dia anterior.',
    group: 'Abas'
  },
  {
    id: 'fasting',
    label: 'Jejum',
    tab: 'fasting',
    description: 'O monitoramento do jejum em curso e o histórico. Desligar só esconde; os registros continuam gravados.',
    group: 'Abas'
  },
  {
    id: 'journal',
    label: 'Diário',
    tab: 'journal',
    description: 'As páginas do diário. Desligar só esconde; o texto continua gravado.',
    group: 'Abas'
  },
  {
    id: 'correlations',
    label: 'Correlações',
    tab: 'correlations',
    description: 'Os padrões entre os dias. O cálculo deixa de incluir o que estiver desligado.',
    group: 'Abas'
  },
  {
    id: 'focus',
    label: 'Foco',
    tab: 'focus',
    description: 'A câmara de foco. Desligar também para o som ambiente.',
    group: 'Abas'
  },
  {
    id: 'rewards',
    label: 'Taverna',
    tab: 'rewards',
    description: 'Recompensas e gastos. As moedas continuam sendo ganhas normalmente.',
    group: 'Abas'
  },
  {
    id: 'agu',
    label: 'AGU',
    tab: 'agu',
    description: 'A campanha de estudos. O plano e o ciclo seguem gravados.',
    group: 'Abas'
  },
  {
    id: 'oracle',
    label: 'Oráculo',
    tab: 'oracle',
    description: 'O relatório analítico. Desligar também tira os insights das funções desligadas.',
    group: 'Abas'
  },
  {
    id: 'chat',
    label: 'Bate Papo',
    tab: 'chat',
    description: 'As salas de conversa. As salas ficam guardadas.',
    group: 'Abas'
  }
];

export const FEATURE_IDS = FEATURE_SETTINGS.map((feature) => feature.id);

/** kind do motor de próxima atividade → funcionalidade que o controla. */
export const NEXT_ACTION_KIND_FEATURE = {
  victory: 'victories',
  plan_day: 'victories',
  quest: 'quests',
  habit: 'habits',
  agu: 'agu',
  mindmap: 'maps',
  reading: 'books'
};

/** type de insight do Oráculo → funcionalidade. Tipos fora do mapa sempre aparecem. */
export const INSIGHT_TYPE_FEATURE = {
  questions_mastery: 'questions',
  reading_pace: 'books',
  process_momentum: 'processes',
  daily_victories: 'victories',
  stalled_book: 'books',
  mind_maps: 'maps',
  overdue_quests: 'quests',
  procrastination_guard: 'quests',
  flow_state: 'quests'
};

/** kind/grupo das correlações → funcionalidade. Contexto sempre entra. */
export const CORRELATION_KIND_FEATURE = {
  quest: 'quests',
  habit: 'habits',
  reading: 'books',
  scripture: 'scripture',
  agu: 'agu',
  questions: 'questions',
  mindmap: 'maps',
  process: 'processes',
  victory: 'victories',
  supplement: 'supplements',
  phone: 'phone'
};

const FEATURE_ID_SET = new Set(FEATURE_IDS);

export function defaultFeatureSettings() {
  return Object.fromEntries(FEATURE_IDS.map((id) => [id, true]));
}

/**
 * Normaliza o que veio gravado. Chave desconhecida é ignorada; valor ausente
 * fica ligado. Nunca devolve uma cópia do objeto recebido.
 */
export function sanitizeFeatureSettings(raw) {
  const settings = defaultFeatureSettings();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return settings;
  for (const id of FEATURE_ID_SET) {
    if (raw[id] === false) settings[id] = false;
  }
  return settings;
}

export function isFeatureEnabled(settings, id) {
  return sanitizeFeatureSettings(settings)[id] !== false;
}

export function featureForTab(tab) {
  return FEATURE_SETTINGS.find((feature) => feature.tab === tab) || null;
}

export function isTabEnabled(settings, tab) {
  const feature = featureForTab(tab);
  if (!feature) return true;
  return isFeatureEnabled(settings, feature.id);
}

export function isNextActionKindEnabled(settings, kind) {
  const featureId = NEXT_ACTION_KIND_FEATURE[kind];
  if (!featureId) return true;
  return isFeatureEnabled(settings, featureId);
}

export function isInsightEnabled(settings, insight) {
  const featureId = INSIGHT_TYPE_FEATURE[insight?.type];
  if (!featureId) return true;
  return isFeatureEnabled(settings, featureId);
}

export function isCorrelationKindEnabled(settings, kind) {
  const featureId = CORRELATION_KIND_FEATURE[kind];
  if (!featureId) return true;
  return isFeatureEnabled(settings, featureId);
}
