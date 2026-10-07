/**
 * Correlações: o motor precisa achar um sinal plantado e calar um ruído.
 * Os dias são determinísticos para o teste não depender do acaso da amostra.
 */
import './testEnv.js';
import assert from 'node:assert/strict';
import { addDaysToDateStr } from './timeUtils.js';
import {
  associationStats,
  discoverCorrelations,
  fisherExactP,
  linearEffect,
  studentTP
} from './correlations.js';

const TODAY = '2026-10-07';
const DAYS = 48;

function dates() {
  return Array.from({ length: DAYS }, (_unused, index) => addDaysToDateStr(TODAY, -(DAYS - 1 - index)));
}

function habit(id, title, on) {
  return {
    id,
    title,
    history: dates().filter((_date, index) => on(index)),
    durationsByDate: {}
  };
}

const day = dates();
const creatineDays = new Set(day.filter((_date, index) => index % 2 === 0));
const phoneHeavy = new Set(day.filter((_date, index) => index % 3 === 0));

const db = {
  quests: [],
  habits: [
    habit('h-read', 'Leitura matinal', (index) => index % 2 === 0),
    habit('h-train', 'Treino', (index) => index % 2 === 0),
    habit('h-focus', 'Bloco de foco', (index) => !phoneHeavy.has(day[index])),
    habit('h-noise', 'Ruído', (index) => index % 5 === 0)
  ],
  books: [],
  readingSessions: [],
  scriptureSessions: [],
  examQuestions: [],
  processes: [],
  processSteps: [],
  mindMaps: [],
  mindMapSessions: [],
  dailyVictories: [],
  aguPlan: null,
  supplements: [{ id: 'sup-crea', name: 'Creatina', unit: 'g' }],
  supplementLogs: day
    .filter((date) => creatineDays.has(date))
    .map((date) => ({ supplementId: 'sup-crea', amount: 5, date, time: '08:00' })),
  phoneTimeLogs: day.map((date, index) => ({
    date,
    minutes: phoneHeavy.has(date) ? 180 : 40
  })).filter((_entry, index) => index < DAYS - 1)
};

const report = discoverCorrelations(db, { todayStr: TODAY, windowDays: 60, minDays: 14 });

assert.equal(fisherExactP(0, 10, 10, 0) < 0.001, true, 'Fisher detecta exclusão perfeita');
assert.equal(fisherExactP(5, 5, 5, 5) > 0.5, true, 'Fisher não acusa tabela equilibrada');
assert.ok(studentTP(0, 20) > 0.99, 't zero não é significante');
assert.ok(studentTP(4, 20) < 0.001, 't alto é significante');

const paired = associationStats(
  [1, 1, 1, 1, 0, 0, 0, 0],
  [1, 1, 1, 1, 0, 0, 0, 0]
);
assert.equal(paired.phi, 1);
assert.ok(paired.pValue < 0.05);
assert.ok(paired.pValue > 0);

const effect = linearEffect([1, 1, 1, 1, 0, 0, 0, 0], [80, 90, 70, 85, 20, 30, 25, 15]);
assert.ok(effect.beta > 0);
assert.ok(effect.pValue < 0.01);
assert.ok(Math.abs((effect.betaStd ?? 0) - (effect.r ?? 0)) < 0.001, 'β padronizado de uma regressão simples é r');

const together = report.findings.find((item) => (
  item.relation === 'andam-juntas'
  && item.source.label === 'Leitura matinal'
  && item.target.label === 'Treino'
));
assert.ok(together, 'deve encontrar as duas atividades que andam juntas');
assert.equal(together.phi, 1);

const excluded = report.findings.find((item) => (
  item.relation === 'uma-exclui-a-outra'
  && item.source.label.startsWith('Celular acima de')
  && item.target.label === 'Bloco de foco'
));
assert.ok(excluded, `deve encontrar a exclusão do foco quando o celular passa do corte. Achados: ${report.findings.map((item) => item.text).join(' || ')}`);

const creatine = report.findings.find((item) => (
  item.source.label === 'Creatina'
  && item.family === 'regression'
  && item.lag === 0
  && item.verdict === 'ajuda'
));
assert.ok(creatine, 'creatina plantada no mesmo dia do treino e da leitura deve subir a produtividade');

const noiseAsPair = report.findings.find((item) => (
  item.family !== 'regression'
  && (item.source.label === 'Ruído' || item.target.label === 'Ruído')
));
assert.equal(noiseAsPair, undefined, 'ruído fraco não pode virar par de atividades');

assert.equal(report.ready, true);
assert.ok(report.thresholds.adjustedAlpha < report.thresholds.maxPValue);
assert.ok(report.summary.headline.length > 10);

const thin = discoverCorrelations({ habits: [], phoneTimeLogs: [], supplementLogs: [] }, { todayStr: TODAY });
assert.equal(thin.ready, false);
assert.match(thin.summary.headline, /repetição suficiente/);
assert.equal(thin.findings.length, 0);

const lagDb = {
  ...db,
  habits: [
    habit('h-late', 'Estudo longo', (index) => index % 2 === 0),
    habit('h-next', 'Revisão do dia seguinte', (index) => index % 2 === 1)
  ],
  supplements: [],
  supplementLogs: [],
  phoneTimeLogs: []
};
const lagReport = discoverCorrelations(lagDb, { todayStr: TODAY, windowDays: 60 });
const lag = lagReport.findings.find((item) => item.relation === 'dia-seguinte' && item.lag === 1);
assert.ok(lag, 'deve achar o efeito de um dia para o seguinte');
assert.ok(lag.phi > 0.8);

console.log(`✅ Correlações: ${report.findings.length} descobertas, α ajustado ${report.thresholds.adjustedAlpha}, lag φ ${lag.phi}.`);
