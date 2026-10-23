import './testEnv.js';
import assert from 'assert';
import { recolorConfig } from '../src/utils/chartTheme.js';

const palette = {
  ok: '#3dbe86',
  alert: '#e25b73',
  warm: '#e0a84a',
  muted: '#8b93a7',
  accent: '#d4a24c',
  accent2: '#7eb6d6',
  ink: '#f4efe4',
  soft: '#b7b0a4',
  card: '#1c1814',
  paper: '#14110e',
  rule: '#3a342c'
};

function series(accent, label) {
  return {
    label,
    data: [10, 20, 0, 40],
    borderColor: accent,
    backgroundColor: `${accent}14`,
    borderWidth: 2.5,
    tension: 0.35,
    fill: false,
    pointRadius: [4, 4, 4, 6],
    pointBackgroundColor: ['#10b981', '#f43f5e', '#64748b', '#f59e0b']
  };
}

function run() {
  console.log('🧪 Testando pincel de tema dos gráficos...\n');

  const reading = series('#34d399', 'Leitura');
  const scripture = series('#fbbf24', 'Bíblia');
  const bike = series('#f87171', 'Bike - tempo');
  const zoneFill = {
    label: 'Alostase (acima)',
    data: [60, 60, 60, 60],
    borderColor: 'transparent',
    backgroundColor: 'rgba(244, 63, 94, 0.14)',
    fill: 1,
    pointRadius: 0
  };
  const ceiling = {
    label: 'Teto da homeostase',
    data: [40, 40, 40, 40],
    borderColor: 'rgba(16, 185, 129, 0.85)',
    backgroundColor: 'rgba(16, 185, 129, 0.16)',
    borderWidth: 1.5,
    borderDash: [7, 5],
    fill: 2,
    pointRadius: 0
  };
  const setpoint = {
    label: 'Setpoint',
    data: [30, 30, 30, 30],
    borderColor: 'rgba(251, 191, 36, 0.55)',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderDash: [2, 6],
    fill: false,
    pointRadius: 0
  };

  recolorConfig({
    data: { datasets: [zoneFill, ceiling, setpoint, reading, scripture, bike] }
  }, palette);

  for (const dataset of [reading, scripture, bike]) {
    assert.notStrictEqual(dataset.borderWidth, 0, `${dataset.label}: a linha entre os pontos foi apagada`);
    assert.strictEqual(dataset.borderWidth, 2.5, `${dataset.label}: borderWidth mudou`);
    assert.notStrictEqual(dataset.borderColor, 'transparent', `${dataset.label}: borda ficou transparente`);
    assert.ok(dataset.borderColor && dataset.borderColor !== 'none', `${dataset.label}: sem cor de linha`);
  }
  assert.strictEqual(reading.borderColor, palette.ok, 'leitura acompanha o verde do tema');
  assert.strictEqual(scripture.borderColor, palette.accent, 'escritura acompanha o destaque do tema');
  assert.strictEqual(bike.borderColor, palette.alert, 'ritual acompanha o alerta do tema');
  console.log('✅ A série guarda o traço no primeiro desenho.');

  assert.strictEqual(zoneFill.borderWidth, 0, 'preenchimento puro continua sem borda');
  assert.strictEqual(zoneFill.borderColor, 'transparent');
  assert.strictEqual(ceiling.borderWidth, 1.5, 'limite tracejado da faixa não pode sumir');
  assert.notStrictEqual(ceiling.borderColor, 'transparent');
  assert.ok(String(setpoint.borderColor).startsWith('rgba('), 'setpoint continua tracejado e visível');
  assert.strictEqual(setpoint.borderWidth, 1);
  console.log('✅ Faixa e setpoint não perdem o traço; preenchimento puro continua sem borda.');

  console.log('\n🎉 Teste do pincel de tema PASSOU COM SUCESSO!');
}

run();
