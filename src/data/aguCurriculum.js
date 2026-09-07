/**
 * Currículo AGU — Procurador Federal.
 * Fonte das matérias: Guia Tec Concursos 2023 (Procurador Federal).
 * Português: nota do herói (fora do edital, inclusão deliberada).
 * O PDF em Editais é o Edital nº 1/2022 de Advogado da União (Cebraspe);
 * a estrutura de grupos/discursivas é usada como analogia da carreira AGU.
 */

export const AGU_TARGET_ACCURACY = 90;
export const AGU_CYCLE_LENGTH = 14;
export const AGU_WEEKDAY_QUESTION_TARGET = 50;
export const AGU_SATURDAY_QUESTION_TARGET = 80;
export const AGU_SUNDAY_QUESTION_TARGET = 25;
export const AGU_MASTER_MIN_SOLVED = 40;

export const AGU_PLATFORMS = {
  tec: {
    id: 'tec',
    name: 'Tec Concursos',
    role: 'principal',
    color: '#f59e0b',
    url: 'https://www.tecconcursos.com.br'
  },
  qconcursos: {
    id: 'qconcursos',
    name: 'Qconcursos',
    role: 'subsidiário',
    color: '#38bdf8',
    url: 'https://www.qconcursos.com'
  },
  decorando: {
    id: 'decorando',
    name: 'Decorando a Lei Seca',
    role: 'lei seca',
    color: '#a855f7',
    url: 'https://app.decorandoaleiseca.app'
  }
};

export const AGU_GROUPS = {
  1: {
    id: 1,
    name: 'Grupo I — Núcleo AGU',
    short: 'Grupo I',
    color: '#f59e0b',
    examShare: 'Maior peso na objetiva e nas discursivas (parecer / peça / dissertação).',
    analogQuestions: 46
  },
  2: {
    id: 2,
    name: 'Grupo II — Cível e Advocacia',
    short: 'Grupo II',
    color: '#38bdf8',
    examShare: 'Segundo bloco da objetiva; peça judicial e oral.',
    analogQuestions: 34
  },
  3: {
    id: 3,
    name: 'Grupo III — Penal, Trabalho e Extras',
    short: 'Grupo III',
    color: '#a855f7',
    examShare: 'Bloco menor da objetiva; dissertação e oral (trabalho).',
    analogQuestions: 20
  },
  extra: {
    id: 'extra',
    name: 'Extra — Tribunais e Procuradorias',
    short: 'Extra',
    color: '#10b981',
    examShare: 'Fora do edital de Procurador Federal. Mantido para TRF/TRE/TRT e discursiva.',
    analogQuestions: 0
  }
};

const t = (id, name, questions = 0) => ({ id, name, questions });

export const AGU_SUBJECTS = [
  {
    id: 'constitucional',
    name: 'Direito Constitucional',
    group: 1,
    weight: 5,
    tecQuestions: 2700,
    tecChapters: 120,
    hasTheory: true,
    leiSeca: true,
    overlap: ['tribunais', 'procuradorias'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759403',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/direito-constitucional-para-procurador-federal-agu-2023/id',
    topics: [
      t('teoria', 'Teoria da Constituição e interpretação', 400),
      t('df', 'Direitos e garantias fundamentais', 505),
      t('org-estado', 'Organização do Estado', 280),
      t('org-poderes', 'Organização dos Poderes', 320),
      t('adm-publica', 'Administração Pública na CF', 180),
      t('controle', 'Controle de constitucionalidade', 220),
      t('tributacao', 'Tributação e orçamento na CF', 160),
      t('ordem-eco', 'Ordem econômica e financeira', 140),
      t('ordem-social', 'Ordem social', 140),
      t('jurisprudencia', 'Jurisprudência dos Tribunais Superiores', 200)
    ]
  },
  {
    id: 'administrativo',
    name: 'Direito Administrativo',
    group: 1,
    weight: 5,
    tecQuestions: 3187,
    tecChapters: 135,
    hasTheory: true,
    leiSeca: true,
    overlap: ['tribunais', 'procuradorias'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759399',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/direito-administrativo-para-procurador-federal-agu-2023/id',
    topics: [
      t('regime', 'Regime jurídico administrativo', 94),
      t('atos', 'Atos administrativos', 240),
      t('poderes', 'Poderes e deveres da Administração', 144),
      t('organizacao', 'Organização administrativa', 261),
      t('responsabilidade', 'Responsabilidade civil do Estado', 130),
      t('servicos', 'Serviços públicos, concessões e PPP', 176),
      t('controle', 'Controle da Administração', 150),
      t('licitacoes', 'Licitações e contratos', 420),
      t('agentes', 'Agentes públicos', 280),
      t('improbidade', 'Improbidade e processo administrativo', 220),
      t('bens', 'Bens públicos e intervenção na propriedade', 180)
    ]
  },
  {
    id: 'financeiro',
    name: 'Direito Financeiro',
    group: 1,
    weight: 4,
    tecQuestions: 1244,
    tecChapters: 40,
    hasTheory: true,
    leiSeca: false,
    overlap: ['procuradorias'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759408',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/direito-financeiro-para-procurador-federal-agu-2023/id',
    topics: [
      t('intro', 'Introdução à AFO e normas gerais', 55),
      t('orcamento', 'Orçamento público e princípios', 329),
      t('instrumentos', 'PPA, LDO e LOA', 184),
      t('receita', 'Receita pública', 118),
      t('despesa', 'Despesa pública', 160),
      t('lrf', 'Lei de Responsabilidade Fiscal', 180),
      t('precatorios', 'Precatórios e CADIN', 45)
    ]
  },
  {
    id: 'economico',
    name: 'Direito Econômico',
    group: 1,
    weight: 3,
    tecQuestions: 765,
    tecChapters: 0,
    hasTheory: false,
    leiSeca: false,
    overlap: ['procuradorias'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759406',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/direito-economico-para-procurador-federal-agu-2023/id',
    topics: [
      t('ordem', 'Ordem constitucional econômica', 110),
      t('principios', 'Princípios da atividade econômica', 121),
      t('intervencao', 'Intervenção do Estado no domínio econômico', 151),
      t('cade', 'Defesa da concorrência e CADE', 180)
    ]
  },
  {
    id: 'tributario',
    name: 'Direito Tributário',
    group: 1,
    weight: 4,
    tecQuestions: 1729,
    tecChapters: 48,
    hasTheory: true,
    leiSeca: true,
    overlap: ['procuradorias'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759414',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/direito-tributario-para-procurador-federal-agu-2023/id',
    topics: [
      t('intro', 'Conceito e espécies de tributos', 178),
      t('limitacoes', 'Limitações ao poder de tributar', 192),
      t('competencia', 'Competência tributária', 79),
      t('legislacao', 'Legislação tributária (CTN)', 77),
      t('obrigacao', 'Obrigação e crédito tributário', 280),
      t('lancamento', 'Lançamento, suspensão e extinção', 260),
      t('impostos', 'Impostos em espécie e processo tributário', 240)
    ]
  },
  {
    id: 'seguridade',
    name: 'Direito da Seguridade Social',
    group: 1,
    weight: 4,
    tecQuestions: 1173,
    tecChapters: 55,
    hasTheory: true,
    leiSeca: true,
    overlap: ['procuradorias'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759404',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/direito-da-seguridade-social-para-procurador-federal-agu-2023/id',
    topics: [
      t('seguridade', 'Seguridade: conceitos, princípios e financiamento', 212),
      t('segurados', 'Segurados e dependentes do RGPS', 177),
      t('beneficios', 'Benefícios e prestações do RGPS', 267),
      t('rpps', 'RPPS e previdência complementar', 160),
      t('loas', 'Assistência social (LOAS)', 107)
    ]
  },
  {
    id: 'ambiental',
    name: 'Direito Ambiental',
    group: 1,
    weight: 3,
    tecQuestions: 1721,
    tecChapters: 49,
    hasTheory: true,
    leiSeca: false,
    overlap: ['procuradorias'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759401',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/direito-ambiental-para-procurador-federal-agu-2023/id',
    topics: [
      t('principios', 'Princípios e ambiental constitucional', 307),
      t('pnma', 'PNMA, licenciamento e SISNAMA', 259),
      t('ucs', 'Unidades de conservação', 250),
      t('florestas', 'Florestas e Código Florestal', 320),
      t('responsabilidade', 'Responsabilidade ambiental', 180)
    ]
  },
  {
    id: 'leg-agu',
    name: 'Legislação da AGU',
    group: 1,
    weight: 5,
    tecQuestions: 160,
    tecChapters: 0,
    hasTheory: false,
    leiSeca: true,
    overlap: ['procuradorias'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759416',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/legislacao-da-agu-para-procurador-federal-agu-2023/id',
    topics: [
      t('lc73', 'LC nº 73/1993 — Lei Orgânica da AGU', 105),
      t('leis', 'Leis 9.028/1995 e 10.480/2002', 9),
      t('decreto', 'Decreto nº 11.328/2023 — estrutura regimental', 7),
      t('demais', 'Demais temas AGU, PFN e Procuradoria Federal', 39)
    ]
  },
  {
    id: 'civil',
    name: 'Direito Civil',
    group: 2,
    weight: 4,
    tecQuestions: 1463,
    tecChapters: 98,
    hasTheory: true,
    leiSeca: true,
    overlap: ['tribunais', 'procuradorias'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759402',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/direito-civil-para-procurador-federal-agu-2023/id',
    topics: [
      t('pessoas', 'Pessoas naturais e jurídicas', 313),
      t('bens', 'Bens', 77),
      t('fatos', 'Fatos e negócios jurídicos', 359),
      t('obrigacoes', 'Obrigações', 220),
      t('contratos', 'Contratos', 200),
      t('reais', 'Direitos reais', 160),
      t('lindb', 'LINDB', 80)
    ]
  },
  {
    id: 'processual-civil',
    name: 'Direito Processual Civil',
    group: 2,
    weight: 4,
    tecQuestions: 1410,
    tecChapters: 82,
    hasTheory: true,
    leiSeca: true,
    overlap: ['tribunais', 'procuradorias'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759411',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/direito-processual-civil-para-procurador-federal-agu-2023/id',
    topics: [
      t('normas', 'Normas fundamentais e jurisdição', 169),
      t('sujeitos', 'Sujeitos do processo e advocacia pública', 259),
      t('atos', 'Atos processuais e prazos da Fazenda', 115),
      t('tutela', 'Tutela provisória', 55),
      t('conhecimento', 'Procedimento comum e provas', 223),
      t('cumprimento', 'Cumprimento de sentença e execução', 121),
      t('recursos', 'Recursos e processos nos tribunais', 170),
      t('jurisprudencia', 'Jurisprudência dos Tribunais Superiores', 185)
    ]
  },
  {
    id: 'leg-civil-esp',
    name: 'Legislação Civil e Processual Civil Especial',
    group: 2,
    weight: 3,
    tecQuestions: 862,
    tecChapters: 0,
    hasTheory: false,
    leiSeca: true,
    overlap: ['tribunais', 'procuradorias'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759415',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/legislacao-civil-e-processual-civil-especial-para-procurador-federal-agu-2023/id',
    topics: [
      t('registros', 'Lei de Registros Públicos', 204),
      t('idoso', 'Estatuto do Idoso', 120),
      t('lindb', 'LINDB', 176),
      t('remedios', 'Mandado de segurança, ACP, ação popular e ADI', 349)
    ]
  },
  {
    id: 'empresarial',
    name: 'Direito Empresarial',
    group: 2,
    weight: 3,
    tecQuestions: 1192,
    tecChapters: 84,
    hasTheory: true,
    leiSeca: false,
    overlap: ['procuradorias'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759407',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/direito-empresarial-para-procurador-federal-agu-2023/id',
    topics: [
      t('empresa', 'Empresário e estabelecimento', 158),
      t('sociedade', 'Sociedades', 319),
      t('falencia', 'Falência e recuperação', 220),
      t('titulos', 'Títulos de crédito', 160)
    ]
  },
  {
    id: 'internacional',
    name: 'Direito Internacional Público e Humanos',
    group: 2,
    weight: 3,
    tecQuestions: 1253,
    tecChapters: 18,
    hasTheory: true,
    leiSeca: false,
    overlap: ['procuradorias'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759409',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/direito-internacional-publico-e-privado-para-procurador-federal-agu-2023/id',
    topics: [
      t('fontes', 'Fontes e tratados', 171),
      t('sujeitos', 'Sujeitos de DIP e organizações', 268),
      t('nacionalidade', 'Nacionalidade e migração', 84),
      t('dh', 'Direitos humanos e sistema interamericano', 421)
    ]
  },
  {
    id: 'penal',
    name: 'Direito Penal',
    group: 3,
    weight: 3,
    tecQuestions: 1340,
    tecChapters: 85,
    hasTheory: true,
    leiSeca: true,
    overlap: ['tribunais'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759410',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/direito-penal-para-procurador-federal-agu-2023/id',
    topics: [
      t('principios', 'Princípios e lei penal', 224),
      t('teoria', 'Teoria do crime', 472),
      t('concurso', 'Concurso de pessoas e extinção da punibilidade', 163),
      t('fe-publica', 'Crimes contra a fé pública', 102),
      t('adm-publica', 'Crimes contra a Administração Pública', 375)
    ]
  },
  {
    id: 'processual-penal',
    name: 'Direito Processual Penal',
    group: 3,
    weight: 2,
    tecQuestions: 1114,
    tecChapters: 51,
    hasTheory: true,
    leiSeca: true,
    overlap: ['tribunais'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759413',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/direito-processual-penal-para-procurador-federal-agu-2023/id',
    topics: [
      t('inquerito', 'Inquérito policial', 153),
      t('acao', 'Ação penal', 113),
      t('prova', 'Prova', 143),
      t('prisao', 'Prisão e cautelares', 145),
      t('recursos', 'Nulidades, recursos e HC', 104)
    ]
  },
  {
    id: 'leg-penal-esp',
    name: 'Legislação Penal e Processual Penal Especial',
    group: 3,
    weight: 2,
    tecQuestions: 985,
    tecChapters: 15,
    hasTheory: true,
    leiSeca: true,
    overlap: ['tribunais'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759417',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/legislacao-penal-e-processual-penal-especial-para-procurador-federal-agu-2023/id',
    topics: [
      t('tributario', 'Crimes contra a ordem tributária (Lei 8.137)', 179),
      t('lavagem', 'Lavagem de dinheiro', 91),
      t('organizado', 'Crime organizado', 74),
      t('abuso', 'Abuso de autoridade', 84),
      t('jecrim', 'Juizados especiais criminais', 195)
    ]
  },
  {
    id: 'trabalho',
    name: 'Direito do Trabalho',
    group: 3,
    weight: 3,
    tecQuestions: 832,
    tecChapters: 51,
    hasTheory: true,
    leiSeca: false,
    overlap: ['tribunais'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759405',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/direito-do-trabalho-para-procurador-federal-agu-2023/id',
    topics: [
      t('contrato', 'Relação de emprego e contrato', 129),
      t('remuneracao', 'Remuneração e jornada', 163),
      t('extincao', 'Extinção do contrato e FGTS', 143),
      t('coletivo', 'Direito coletivo', 73),
      t('jurisprudencia', 'Jurisprudência trabalhista', 146)
    ]
  },
  {
    id: 'processual-trabalho',
    name: 'Direito Processual do Trabalho',
    group: 3,
    weight: 2,
    tecQuestions: 1017,
    tecChapters: 26,
    hasTheory: true,
    leiSeca: false,
    overlap: ['tribunais'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759412',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/direito-processual-do-trabalho-para-procurador-federal-agu-2023/id',
    topics: [
      t('competencia', 'Organização e competência da Justiça do Trabalho', 171),
      t('audiencia', 'Petição, resposta e audiência', 100),
      t('execucao', 'Execução trabalhista e Fazenda Pública', 90),
      t('recursos', 'Recursos trabalhistas', 120)
    ]
  },
  {
    id: 'agrario',
    name: 'Direito Agrário',
    group: 3,
    weight: 1,
    tecQuestions: 349,
    tecChapters: 2,
    hasTheory: true,
    leiSeca: false,
    overlap: ['procuradorias'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759400',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/direito-agrario-para-procurador-federal-agu-2023/id',
    topics: [
      t('teoria', 'Teoria geral e aspectos constitucionais', 101),
      t('reforma', 'Reforma agrária e desapropriação rural', 92),
      t('terras', 'Terras indígenas e usucapião rural', 60)
    ]
  },
  {
    id: 'educacao-cti',
    name: 'Legislação de Educação, Ciência, Tecnologia e Inovação',
    group: 3,
    weight: 1,
    tecQuestions: 604,
    tecChapters: 2,
    hasTheory: true,
    leiSeca: false,
    overlap: ['procuradorias'],
    tecCadernoUrl: 'https://www.tecconcursos.com.br/questoes/cadernos/102759418',
    tecGuideUrl: 'https://www.tecconcursos.com.br/guias/agu-2022/procurador-federal/-/-/legislacao-sobre-educacao-e-ciencia-tecnologia-e-inovacao-para-procurador-federal-agu-2023/id',
    topics: [
      t('cf', 'Educação e C&T na CF', 140),
      t('ldb', 'LDB', 341),
      t('inovacao', 'Lei de Inovação e cotas', 123)
    ]
  },
  {
    id: 'portugues',
    name: 'Língua Portuguesa',
    group: 'extra',
    weight: 4,
    tecQuestions: 0,
    tecChapters: 0,
    hasTheory: true,
    leiSeca: false,
    overlap: ['tribunais', 'procuradorias'],
    extra: true,
    tecCadernoUrl: 'https://www.tecconcursos.com.br/materias/lingua-portuguesa-portugues',
    tecGuideUrl: 'https://www.tecconcursos.com.br/materias/lingua-portuguesa-portugues',
    topics: [
      t('ortografia', 'Ortografia e emprego das letras', 19951),
      t('acentuacao', 'Acentuação', 8507),
      t('hifen', 'Uso do hífen', 1373),
      t('fonetica', 'Fonética e separação silábica', 6277),
      t('morfologia', 'Formação das palavras e classes', 50195),
      t('verbo', 'Verbo e correlação verbal', 12217),
      t('pronomes', 'Pronomes e colocação pronominal', 9291),
      t('semantica', 'Semântica', 26938),
      t('sintaxe', 'Sintaxe (termos e orações)', 25197),
      t('pontuacao', 'Pontuação', 14398),
      t('regencia', 'Regência e crase', 14553),
      t('concordancia', 'Concordância verbal e nominal', 12900),
      t('coesao', 'Coesão, coerência e reescrita', 30142),
      t('interpretacao', 'Interpretação, tipologia e linguagem', 103174)
    ]
  }
];

export const AGU_FOLDER_URL = 'https://www.tecconcursos.com.br/questoes/pastas/7590326';
export const AGU_THEORY_URL = 'https://www.tecconcursos.com.br/aulas/biblioteca-teoria';

/**
 * Ciclo de 14 dias, sequencial a partir da data de início.
 * Dois blocos/dia úteis; sábado = volume + erros; domingo = discursiva + lei seca.
 */
export const AGU_CYCLE_TEMPLATE = [
  {
    label: 'Núcleo constitucional',
    blocks: [
      { subjectId: 'constitucional', kind: 'questoes', target: 30 },
      { subjectId: 'portugues', kind: 'questoes', target: 20 }
    ]
  },
  {
    label: 'Administrativo + processo',
    blocks: [
      { subjectId: 'administrativo', kind: 'questoes', target: 30 },
      { subjectId: 'processual-civil', kind: 'questoes', target: 20 }
    ]
  },
  {
    label: 'Fazenda + civil',
    blocks: [
      { subjectId: 'tributario', kind: 'questoes', target: 25 },
      { subjectId: 'civil', kind: 'questoes', target: 25 }
    ]
  },
  {
    label: 'Constitucional + penal',
    blocks: [
      { subjectId: 'constitucional', kind: 'questoes', target: 25 },
      { subjectId: 'penal', kind: 'questoes', target: 25 }
    ]
  },
  {
    label: 'Administrativo + INSS',
    blocks: [
      { subjectId: 'administrativo', kind: 'questoes', target: 30 },
      { subjectId: 'seguridade', kind: 'questoes', target: 20 }
    ]
  },
  {
    label: 'Sábado — financeiro e erros',
    blocks: [
      { subjectId: 'financeiro', kind: 'questoes', target: 40 },
      { subjectId: 'economico', kind: 'questoes', target: 20 },
      { subjectId: 'constitucional', kind: 'erros', target: 20 }
    ]
  },
  {
    label: 'Domingo — AGU e parecer',
    blocks: [
      { subjectId: 'leg-agu', kind: 'lei-seca', target: 20 },
      { subjectId: 'administrativo', kind: 'discursiva', target: 0 },
      { subjectId: 'portugues', kind: 'revisao', target: 15 }
    ]
  },
  {
    label: 'Ambiental + português',
    blocks: [
      { subjectId: 'ambiental', kind: 'questoes', target: 25 },
      { subjectId: 'portugues', kind: 'questoes', target: 25 }
    ]
  },
  {
    label: 'Administrativo + empresa',
    blocks: [
      { subjectId: 'administrativo', kind: 'questoes', target: 25 },
      { subjectId: 'empresarial', kind: 'questoes', target: 25 }
    ]
  },
  {
    label: 'Constitucional + trabalho',
    blocks: [
      { subjectId: 'constitucional', kind: 'questoes', target: 25 },
      { subjectId: 'trabalho', kind: 'questoes', target: 25 }
    ]
  },
  {
    label: 'Processo civil + internacional',
    blocks: [
      { subjectId: 'processual-civil', kind: 'questoes', target: 25 },
      { subjectId: 'internacional', kind: 'questoes', target: 25 }
    ]
  },
  {
    label: 'Tributário + processo penal',
    blocks: [
      { subjectId: 'tributario', kind: 'questoes', target: 25 },
      { subjectId: 'processual-penal', kind: 'questoes', target: 25 }
    ]
  },
  {
    label: 'Sábado — simulado e erros',
    blocks: [
      { subjectId: 'constitucional', kind: 'simulado', target: 40 },
      { subjectId: 'administrativo', kind: 'erros', target: 20 },
      { subjectId: 'leg-civil-esp', kind: 'questoes', target: 20 }
    ]
  },
  {
    label: 'Domingo — dissertação e extras',
    blocks: [
      { subjectId: 'constitucional', kind: 'discursiva', target: 0 },
      { subjectId: 'processual-trabalho', kind: 'questoes', target: 15 },
      { subjectId: 'agrario', kind: 'questoes', target: 10 }
    ]
  }
];

export const AGU_KIND_META = {
  questoes: { label: 'Questões', icon: '🎯', color: '#f59e0b' },
  erros: { label: 'Caderno de erros', icon: '♻️', color: '#f43f5e' },
  revisao: { label: 'Revisão', icon: '🔁', color: '#38bdf8' },
  'lei-seca': { label: 'Lei seca', icon: '📜', color: '#a855f7' },
  discursiva: { label: 'Discursiva', icon: '✒️', color: '#c084fc' },
  simulado: { label: 'Simulado', icon: '⚔️', color: '#fb7185' },
  teoria: { label: 'Teoria', icon: '📖', color: '#10b981' }
};

export function getAguSubject(id) {
  return AGU_SUBJECTS.find((subject) => subject.id === id) || null;
}

export function getAguTopic(subjectId, topicId) {
  const subject = getAguSubject(subjectId);
  if (!subject) return null;
  return (subject.topics || []).find((topic) => topic.id === topicId) || null;
}

export function blockKey(dateStr, subjectId, kind) {
  return `${dateStr}|${subjectId}|${kind}`;
}

export function recommendPlatform(subject, stats) {
  const solved = stats?.solved || 0;
  const accuracy = stats?.accuracy || 0;
  if (solved < AGU_MASTER_MIN_SOLVED) {
    return { id: 'tec', reason: 'Ainda no Tec. Meta: 40 questões no tópico antes de julgar esgotamento.' };
  }
  if (accuracy >= AGU_TARGET_ACCURACY) {
    return { id: 'tec', reason: 'Meta de 90% atingida. Mantenha no Tec (revisão e caderno de erros).' };
  }
  if (subject.leiSeca) {
    return {
      id: 'decorando',
      reason: 'Tec abaixo de 90% após volume mínimo. Abra a lei seca no Decorando e volte ao Tec no mesmo tópico.'
    };
  }
  return {
    id: 'qconcursos',
    reason: 'Tec abaixo de 90% após volume mínimo. Troque a banca/filtro no Qconcursos e retorne ao Tec.'
  };
}

export function createDefaultAguPlan(todayStr) {
  return {
    version: 1,
    startedAt: null,
    cycleNumber: 1,
    cycleStartDate: todayStr || null,
    cycleLengthDays: AGU_CYCLE_LENGTH,
    targetAccuracy: AGU_TARGET_ACCURACY,
    dailyQuestionTarget: AGU_WEEKDAY_QUESTION_TARGET,
    completedBlocks: {},
    topicStatus: {},
    subjectNotes: {},
    currentTopic: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
