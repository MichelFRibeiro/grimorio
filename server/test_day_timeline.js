/**
 * Linha do tempo do dia: o que foi feito, na ordem, sem repetir o que
 * já entrou por outro registro.
 */
import './testEnv.js';
import assert from 'node:assert/strict';
import { buildDayTimeline } from '../src/utils/dayTimeline.js';

const TODAY = '2026-10-26';
const YESTERDAY = '2026-10-25';

function at(clock) {
  return `${TODAY}T${clock}:00-03:00`;
}

function ids(timeline) {
  return timeline.events.map((item) => item.id);
}

function run() {
  console.log('🧪 Testando a linha do tempo do dia...\n');

  const empty = buildDayTimeline({}, TODAY);
  assert.equal(empty.count, 0);
  assert.equal(empty.minutes, 0);
  assert.deepEqual(empty.events, []);

  const source = {
    habits: [
      {
        id: 'h-manha',
        title: 'Banho frio',
        history: [TODAY],
        durationsByDate: { [TODAY]: 5 },
        notesByDate: { [TODAY]: 'gelado' }
      },
      {
        id: 'h-sem-hora',
        title: 'Alongar',
        history: [TODAY]
      },
      {
        id: 'h-ontem',
        title: 'Ontem',
        history: [YESTERDAY]
      }
    ],
    quests: [
      {
        id: 'q-hoje',
        title: 'Petição',
        category: 'INSS',
        completed: true,
        completedAt: at('09:30'),
        durationMinutes: 40
      },
      {
        id: 'q-ontem',
        title: 'Arquivo',
        completed: true,
        completedAt: `${YESTERDAY}T18:00:00-03:00`
      }
    ],
    books: [{ id: 'b-1', title: 'O Senhor dos Anéis' }],
    readingSessions: [
      {
        id: 'rs-1',
        bookId: 'b-1',
        date: TODAY,
        pagesRead: 12,
        durationMinutes: 25,
        notes: 'capítulo 2',
        timestamp: at('14:40')
      },
      {
        id: 'rs-ontem',
        bookId: 'b-1',
        date: YESTERDAY,
        pagesRead: 4,
        timestamp: at('15:00')
      }
    ],
    scriptureSessions: [
      {
        id: 'ss-1',
        date: TODAY,
        startBookId: 'joa',
        startChapter: 3,
        startVerse: 16,
        endBookId: 'joa',
        endChapter: 3,
        endVerse: 21,
        chaptersRead: 1,
        durationMinutes: 15,
        timestamp: at('07:10')
      }
    ],
    examQuestions: [
      {
        id: 'ex-agu',
        subjectId: 'constitucional',
        date: TODAY,
        timestamp: at('10:05'),
        durationMinutes: 30,
        totalQuestions: 8,
        correctAnswers: 6
      },
      {
        id: 'ex-bloco',
        subject: 'Avulsa',
        blockKey: '2026-10-26|outro|estudo|',
        date: TODAY,
        timestamp: at('10:20'),
        totalQuestions: 3,
        correctAnswers: 1,
        durationMinutes: 10
      },
      {
        id: 'ex-livre',
        subject: 'Treino livre',
        date: TODAY,
        timestamp: at('16:00'),
        totalQuestions: 5,
        correctAnswers: 4,
        durationMinutes: 20
      }
    ],
    mindMaps: [
      { id: 'map-agu', title: 'Controle', aguSubjectId: 'constitucional' },
      { id: 'map-pessoal', title: 'Mapa de foco', category: 'Pessoal' }
    ],
    mindMapSessions: [
      {
        id: 'mms-agu',
        mapId: 'map-agu',
        mapTitle: 'Controle',
        date: TODAY,
        durationMinutes: 20,
        timestamp: at('10:30')
      },
      {
        id: 'mms-1',
        mapId: 'map-pessoal',
        mapTitle: 'Mapa de foco',
        date: TODAY,
        durationMinutes: 12,
        reviewed: 4,
        recalled: 3,
        timestamp: at('11:00')
      }
    ],
    journalEntries: [
      {
        id: 'j-1',
        date: TODAY,
        title: 'Manhã',
        body: 'texto',
        mood: 'focado',
        durationMinutes: 8,
        createdAt: at('06:40')
      }
    ],
    supplements: [{ id: 'sup-1', name: 'Creatina', unit: 'g' }],
    supplementLogs: [
      {
        id: 'slog-1',
        supplementId: 'sup-1',
        amount: 5,
        unit: 'g',
        date: TODAY,
        time: '08:00',
        takenAt: at('08:00')
      }
    ],
    supplementReviews: [
      {
        id: 'srev-1',
        date: TODAY,
        answers: [{ taken: true }, { taken: false }],
        completedAt: at('21:00')
      }
    ],
    processes: [{ id: 'p-1', title: 'Lote', unitName: 'peças' }],
    processSteps: [
      {
        id: 'ps-1',
        processId: 'p-1',
        processTitle: 'Lote',
        unitsAdded: 2,
        timestamp: at('13:15')
      }
    ],
    fastingSessions: [
      {
        id: 'fast-1',
        startedAt: at('07:00'),
        endedAt: at('19:00'),
        targetMinutes: 16 * 60
      }
    ],
    dailyVictories: [
      {
        id: 'dv-rotina',
        date: TODAY,
        title: 'Rotina inteira: Manhã',
        completed: true,
        source: 'routine',
        routineId: 'rot-1',
        completedAt: at('12:00')
      },
      {
        id: 'dv-estudo',
        date: TODAY,
        title: 'Estudo',
        completed: true,
        source: 'homeostasis-study',
        completedAt: at('12:05')
      },
      {
        id: 'dv-missao',
        date: TODAY,
        title: 'Petição',
        completed: true,
        questId: 'q-hoje',
        completedAt: at('09:31')
      },
      {
        id: 'dv-manual',
        date: TODAY,
        title: 'Ligar para o cliente',
        category: 'Pessoal',
        completed: true,
        durationMinutes: 10,
        completedAt: at('17:20')
      }
    ],
    actionLogs: [
      {
        id: 'log-1',
        type: 'habit_complete',
        entityId: 'h-manha',
        date: TODAY,
        timestamp: at('08:15')
      }
    ]
  };

  const timeline = buildDayTimeline(source, TODAY);
  const order = ids(timeline);

  assert.equal(order.includes('habit:h-ontem'), false);
  assert.equal(order.includes('quest:q-ontem'), false);
  assert.equal(order.includes('reading:rs-ontem'), false, 'leitura de ontem não entra, mesmo lançada hoje');
  assert.equal(order.includes('questions:ex-agu'), false, 'questão do bloco AGU não se repete');
  assert.ok(order.includes('questions:ex-bloco'), 'bloco que não existe não engole a questão');
  assert.equal(order.includes('mindmap:mms-agu'), false, 'mapa de matéria AGU já está no bloco');
  assert.equal(order.includes('victory:dv-rotina'), false);
  assert.equal(order.includes('victory:dv-estudo'), false);
  assert.equal(order.includes('victory:dv-missao'), false);

  assert.ok(order.includes('habit:h-manha'));
  assert.ok(order.includes('habit:h-sem-hora'));
  assert.ok(order.includes('quest:q-hoje'));
  assert.ok(order.includes('reading:rs-1'));
  assert.ok(order.includes('scripture:ss-1'));
  assert.ok(order.some((id) => id.startsWith('agu:')));
  assert.ok(order.includes('questions:ex-livre'));
  assert.ok(order.includes('mindmap:mms-1'));
  assert.ok(order.includes('journal:j-1'));
  assert.ok(order.includes('supplement:slog-1'));
  assert.ok(order.includes('review:srev-1'));
  assert.ok(order.includes('process:ps-1'));
  assert.ok(order.includes('fasting-start:fast-1'));
  assert.ok(order.includes('fasting-end:fast-1'));
  assert.ok(order.includes('victory:dv-manual'));

  const timed = timeline.events.filter((item) => item.at).map((item) => item.id);
  assert.deepEqual(timed, [...timed].sort((a, b) => {
    const left = timeline.events.find((item) => item.id === a);
    const right = timeline.events.find((item) => item.id === b);
    return left.at < right.at ? -1 : 1;
  }));
  assert.ok(timeline.events.find((item) => item.id === 'journal:j-1').at < timeline.events.find((item) => item.id === 'reading:rs-1').at);
  assert.equal(timeline.events.at(-1).id, 'habit:h-sem-hora', 'sem horário fica no fim');

  const bath = timeline.events.find((item) => item.id === 'habit:h-manha');
  assert.equal(bath.timeLabel, '08:15');
  assert.match(bath.detail, /gelado/);
  assert.equal(bath.minutes, 5);

  const reading = timeline.events.find((item) => item.id === 'reading:rs-1');
  assert.equal(reading.title, 'O Senhor dos Anéis');
  assert.match(reading.detail, /12 páginas/);

  const scripture = timeline.events.find((item) => item.id === 'scripture:ss-1');
  assert.match(scripture.title, /Jo 3:16/);

  const agu = timeline.events.find((item) => item.kind === 'agu');
  assert.equal(agu.timeLabel, '10:05');
  assert.match(agu.title, /Constitucional/i);
  assert.equal(agu.minutes, 30);

  const dose = timeline.events.find((item) => item.id === 'supplement:slog-1');
  assert.equal(dose.title, 'Creatina');
  assert.equal(dose.timeLabel, '08:00');

  const fastEnd = timeline.events.find((item) => item.id === 'fasting-end:fast-1');
  assert.equal(fastEnd.minutes, 0, 'jejum não infla o tempo do dia');
  assert.match(fastEnd.detail, /16:8/);

  const workMinutes = 5 + 40 + 25 + 15 + 30 + 10 + 20 + 12 + 8 + 10;
  assert.equal(timeline.minutes, workMinutes);

  const hidden = buildDayTimeline(source, TODAY, { featureSettings: { habits: false, books: false, agu: false } });
  assert.equal(ids(hidden).includes('habit:h-manha'), false);
  assert.equal(ids(hidden).includes('reading:rs-1'), false);
  assert.equal(ids(hidden).some((id) => id.startsWith('agu:')), false);
  assert.ok(ids(hidden).includes('questions:ex-agu'), 'sem AGU, a questão do bloco continua visível');
  assert.ok(ids(hidden).includes('quest:q-hoje'));

  const noon = `${TODAY}T15:00:00.000Z`;
  const markedAt = Date.parse(at('09:42'));
  const recovered = buildDayTimeline({
    habits: [
      {
        id: 'h-lei',
        title: 'Lei Seca',
        history: [TODAY],
        rewardLogs: { [TODAY]: `log-${markedAt}-abc` }
      },
      {
        id: 'h-falso',
        title: 'Sem hora real',
        history: [TODAY],
        rewardLogs: { [TODAY]: 'log-antigo' }
      }
    ],
    actionLogs: [
      {
        id: `log-${markedAt}-abc`,
        type: 'habit_complete',
        entityId: 'h-lei',
        date: TODAY,
        timestamp: noon
      },
      {
        id: 'log-antigo',
        type: 'habit_complete',
        entityId: 'h-falso',
        date: TODAY,
        timestamp: noon
      }
    ]
  }, TODAY);
  const lei = recovered.events.find((item) => item.id === 'habit:h-lei');
  const falso = recovered.events.find((item) => item.id === 'habit:h-falso');
  assert.equal(lei.timeLabel, '09:42', 'meio-dia do ledger não é a hora do ritual');
  assert.equal(falso.timeLabel, '', 'sem epoch no id, não inventa 12:00');

  const boundary = buildDayTimeline({
    journalEntries: [{
      id: 'j-limite',
      date: TODAY,
      title: 'Quase ontem',
      body: 'texto',
      createdAt: '2026-10-26T02:30:00.000Z'
    }]
  }, TODAY);
  assert.equal(boundary.events[0]?.timeLabel, '', '02:30 UTC ainda é o dia anterior em São Paulo');

  console.log(`\n✅ ${timeline.count} atividades no dia, em ordem, sem repetir origem.\n`);
}

run();
