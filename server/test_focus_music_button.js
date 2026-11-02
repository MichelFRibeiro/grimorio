/**
 * Ícone de música nos modais de execução.
 * O clique toca ou para a trilha da câmara de foco, sem sair do modal.
 */
import './testEnv.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { focusMusicButtonState } from '../src/utils/focusMusicButton.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    throw new Error(message);
  }
  console.log(`✅ ${message}`);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

const SURFACES = [
  { id: 'missão', file: 'src/components/QuestsView.jsx', min: 1 },
  { id: 'ritual', file: 'src/components/HabitsView.jsx', min: 3 },
  { id: 'rotina', file: 'src/components/RoutinesView.jsx', min: 1 },
  { id: 'biblioteca', file: 'src/components/BooksView.jsx', min: 1 },
  { id: 'agu', file: 'src/components/AguCampaignView.jsx', min: 2 },
  { id: 'escrituras', file: 'src/components/ScriptureView.jsx', min: 1 },
  { id: 'mapas', file: 'src/components/MindMapsView.jsx', min: 1 },
  { id: 'arena', file: 'src/components/QuestionsView.jsx', min: 1 },
  { id: 'processos', file: 'src/components/ProcessesView.jsx', min: 1 },
  { id: 'diario', file: 'src/components/JournalView.jsx', min: 1 }
];

async function runTests() {
  const idle = focusMusicButtonState({ playing: false, enabled: true });
  assert(idle.visible === true, 'com o foco ligado, o ícone aparece');
  assert(idle.label === 'Tocar música de foco', 'parado, o rótulo pede para tocar');
  assert(idle.pressed === false, 'parado, o botão não está pressionado');
  assert(idle.action === 'play', 'o primeiro clique toca a trilha, sem navegar');

  const playing = focusMusicButtonState({ playing: true, enabled: true });
  assert(playing.label === 'Parar música de foco', 'tocando, o rótulo pede para parar');
  assert(playing.pressed === true, 'tocando, o botão fica pressionado');
  assert(playing.action === 'pause', 'o segundo clique para a música no mesmo player');

  const off = focusMusicButtonState({ playing: true, enabled: false });
  assert(off.visible === false, 'com a câmara de foco desligada, o ícone some');
  assert(off.action === 'none', 'desligado, o clique não toca nada');

  const css = read('src/styles/index.css');
  const rule = css.match(/\.focus-music-btn\s*\{[^}]+\}/);
  assert(rule, 'o ícone tem uma classe própria');
  assert(/position:\s*absolute/.test(rule[0]), 'o ícone se posiciona no modal');
  assert(/top:\s*10px/.test(rule[0]), 'o ícone fica no alto do modal');
  assert(/right:\s*10px/.test(rule[0]), 'o ícone fica à direita do modal');

  const button = read('src/components/FocusMusicButton.jsx');
  assert(button.includes('type="button"'), 'o ícone não é envio de formulário');
  assert(button.includes('stopPropagation'), 'o clique não fecha o modal por baixo');
  assert(button.includes('preventDefault'), 'o clique não vira navegação');
  assert(button.includes('toggle(') || button.includes('.toggle'), 'o clique usa o player da câmara');
  assert(button.includes('Music'), 'o desenho é uma nota de música');
  assert(!button.includes('setActiveTab') && !button.includes("openTab('focus')"), 'o clique não abre a câmara de foco');

  for (const surface of SURFACES) {
    const count = (read(surface.file).match(/<FocusMusicButton\b/g) || []).length;
    assert(count >= surface.min, `${surface.id} tem o ícone de música em ${surface.file} (${count}/${surface.min})`);
  }

  const app = read('src/App.jsx');
  assert(app.includes('FocusPlayerProvider'), 'o ícone usa o mesmo player da câmara de foco');
  assert(app.includes('enabled={focusEnabled}'), 'desligar a câmara esconde o ícone e para o som');

  console.log('\n✅ Ícone de música nos modais de execução: OK');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
