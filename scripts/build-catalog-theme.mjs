/**
 * Gera o miolo do tema "Catálogo".
 *
 * O React grava estilos inline e o navegador os serializa no atributo style
 * em rgb()/rgba() — nunca em hex. Um seletor [style*="..."] com essa forma
 * serializada vence o inline por especificidade, então o tema reinterpreta
 * os tons escuros literais do JSX sem reescrever nenhum componente e sem
 * tocar no DOM em tempo de execução.
 *
 * Rode com: node scripts/build-catalog-theme.mjs
 * A saída vai para src/styles/catalog-overrides.css.
 */
import { chromium } from 'playwright-core';
import { writeFileSync } from 'node:fs';

const CHROME = process.env.CHROME_PATH || '/a0/tmp/playwright/chromium-1169/chrome-linux/chrome';

const INK = '#2a2118';
const INK_SOFT = '#7a6a58';
const INK_DIM = '#9a8976';
const PAPER = '#fbf7ee';
const PAPER_DEEP = '#efe7d4';
const CREAM = '#fffdf8';
const STAMP = '#c2410c';
const STAMP_DEEP = '#9a3412';

/** Texto claro literal → tinta. */
const TEXT = {
  '#f8fafc': INK,
  '#ffffff': INK,
  '#fff': INK,
  '#e2e8f0': INK,
  '#cbd5e1': '#4d4033',
  '#94a3b8': INK_SOFT,
  '#64748b': INK_DIM,
  '#475569': '#8d7b68',
  // dourado neon → carimbo
  '#fbbf24': STAMP,
  '#f59e0b': STAMP,
  '#fcd34d': '#ea580c',
  '#d97706': STAMP_DEEP,
  '#fde68a': STAMP_DEEP,
  '#eab308': '#a16207',
  // azul neon → petróleo
  '#38bdf8': '#1d6f8a',
  '#7dd3fc': '#155e75',
  '#06b6d4': '#0e7490',
  '#0284c7': '#0c4a6e',
  // roxo neon → ameixa
  '#a855f7': '#7c4a9b',
  '#c084fc': '#6d28d9',
  '#e9d5ff': '#5b2e86',
  '#c4b5fd': '#6d28d9',
  // verde neon → floresta
  '#10b981': '#3f7d4e',
  '#34d399': '#166534',
  '#86efac': '#166534',
  '#6ee7b7': '#166534',
  '#059669': '#166534',
  '#d1fae5': '#14532d',
  // vermelho claro demais para papel
  '#f87171': '#b91c1c',
  '#fb7185': '#be123c',
  '#fda4af': '#9f1239',
  '#fecdd3': '#9f1239',
  '#f43f5e': '#be123c',
  '#f472b6': '#9d174d',
  '#ec4899': '#9d174d',
  '#fca5a5': '#b91c1c',
  '#ef4444': '#b91c1c'
};

/** Fundo escuro literal → papel. */
const SURFACE = {
  '#131722': PAPER,
  '#0c0e14': PAPER,
  '#0b0e16': PAPER,
  '#12151e': PAPER,
  '#0c101d': PAPER,
  '#070a13': PAPER,
  '#060911': PAPER,
  '#0a0d14': PAPER,
  '#1a2030': PAPER_DEEP,
  '#0a0c10': '#e7dcc4',
  '#222a3f': '#e7dcc4'
};

/** Fundo colorido chapado (botões) → tom fechado, com texto creme. */
const SOLID_BUTTON = {
  '#f59e0b': STAMP,
  '#38bdf8': '#1d6f8a',
  '#10b981': '#3f7d4e'
};

/** Gradientes de botão → carimbo, com texto creme por cima. */
const GRADIENTS = {
  'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)': `linear-gradient(135deg, ${STAMP} 0%, ${STAMP_DEEP} 100%)`,
  'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)': 'linear-gradient(135deg, #1d6f8a 0%, #0c4a6e 100%)',
  'linear-gradient(135deg, #10b981 0%, #059669 100%)': 'linear-gradient(135deg, #3f7d4e 0%, #166534 100%)',
  'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)': 'linear-gradient(135deg, #7c4a9b 0%, #5b21b6 100%)',
  'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)': 'linear-gradient(135deg, #0e7490 0%, #155e75 100%)',
  'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)': 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
  'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)': 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
  'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(245, 158, 11, 0.08) 100%)':
    'linear-gradient(135deg, rgba(154, 52, 18, 0.16) 0%, rgba(154, 52, 18, 0.06) 100%)',
  'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(168, 85, 247, 0.2) 100%)':
    'linear-gradient(135deg, rgba(154, 52, 18, 0.16) 0%, rgba(107, 33, 168, 0.14) 100%)',
  'linear-gradient(135deg, rgba(245, 158, 11, 0.25) 0%, rgba(168, 85, 247, 0.25) 100%)':
    'linear-gradient(135deg, rgba(154, 52, 18, 0.18) 0%, rgba(107, 33, 168, 0.16) 100%)',
  'linear-gradient(135deg, rgba(245, 158, 11, 0.3) 0%, rgba(239, 68, 68, 0.3) 100%)':
    'linear-gradient(135deg, rgba(154, 52, 18, 0.2) 0%, rgba(153, 27, 27, 0.18) 100%)',
  'linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(185, 28, 28, 0.2) 100%)':
    'linear-gradient(135deg, rgba(153, 27, 27, 0.14) 0%, rgba(127, 29, 29, 0.14) 100%)',
  // Cartões de destaque que degradavam o acento até a obsidiana.
  'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(19, 23, 34, 0.92) 100%)':
    'linear-gradient(135deg, rgba(154, 52, 18, 0.1) 0%, rgba(251, 247, 238, 0.96) 100%)',
  'linear-gradient(135deg, rgba(251, 191, 36, 0.08) 0%, rgba(19, 23, 34, 0.92) 100%)':
    'linear-gradient(135deg, rgba(154, 52, 18, 0.08) 0%, rgba(251, 247, 238, 0.96) 100%)',
  'linear-gradient(135deg, rgba(245, 158, 11, 0.08) 0%, rgba(19, 23, 34, 0.9) 100%)':
    'linear-gradient(135deg, rgba(154, 52, 18, 0.08) 0%, rgba(251, 247, 238, 0.96) 100%)',
  'linear-gradient(135deg, rgba(244, 63, 94, 0.08) 0%, rgba(19, 23, 34, 0.9) 100%)':
    'linear-gradient(135deg, rgba(159, 18, 57, 0.08) 0%, rgba(251, 247, 238, 0.96) 100%)',
  'linear-gradient(135deg, rgba(168, 85, 247, 0.08) 0%, rgba(19, 23, 34, 0.92) 100%)':
    'linear-gradient(135deg, rgba(107, 33, 168, 0.08) 0%, rgba(251, 247, 238, 0.96) 100%)',
  'linear-gradient(160deg, rgba(6, 182, 212, 0.12) 0%, rgba(19, 23, 34, 0.94) 42%, rgba(168, 85, 247, 0.1) 100%)':
    'linear-gradient(160deg, rgba(14, 116, 144, 0.1) 0%, rgba(251, 247, 238, 0.97) 42%, rgba(107, 33, 168, 0.08) 100%)',
  'linear-gradient(180deg, rgba(30, 27, 20, 0.98) 0%, rgba(15, 17, 26, 0.98) 100%)':
    'linear-gradient(180deg, rgba(251, 244, 228, 0.98) 0%, rgba(251, 247, 238, 0.98) 100%)'
};

/** Fundos translúcidos. Valor = novo background. */
const VEILS = {
  'rgba(255, 255, 255, 0.02)': 'rgba(61, 46, 31, 0.03)',
  'rgba(255, 255, 255, 0.03)': 'rgba(61, 46, 31, 0.035)',
  'rgba(255, 255, 255, 0.04)': 'rgba(61, 46, 31, 0.045)',
  'rgba(255, 255, 255, 0.05)': 'rgba(61, 46, 31, 0.055)',
  'rgba(255, 255, 255, 0.06)': 'rgba(61, 46, 31, 0.06)',
  'rgba(255, 255, 255, 0.08)': 'rgba(61, 46, 31, 0.075)',
  'rgba(255, 255, 255, 0.1)': 'rgba(61, 46, 31, 0.09)',
  'rgba(255, 255, 255, 0.12)': 'rgba(61, 46, 31, 0.1)',
  'rgba(255, 255, 255, 0.15)': 'rgba(61, 46, 31, 0.11)',
  'rgba(255,255,255,0.03)': 'rgba(61, 46, 31, 0.035)',
  'rgba(255,255,255,0.05)': 'rgba(61, 46, 31, 0.055)',
  'rgba(255,255,255,0.06)': 'rgba(61, 46, 31, 0.06)',
  'rgba(255,255,255,0.08)': 'rgba(61, 46, 31, 0.075)',
  'rgba(255,255,255,0.1)': 'rgba(61, 46, 31, 0.09)',
  'rgba(255,255,255,0.15)': 'rgba(61, 46, 31, 0.11)',
  'rgba(0,0,0,0.3)': 'rgba(61, 46, 31, 0.14)',
  'rgba(0, 0, 0, 0.3)': 'rgba(61, 46, 31, 0.14)',
  'rgba(0,0,0,0.35)': 'rgba(61, 46, 31, 0.16)',
  'rgba(0, 0, 0, 0.35)': 'rgba(61, 46, 31, 0.16)',
  // Véus de modal: continuam escuros para o diálogo se destacar, mas na tinta
  // morna do papel em vez do preto puro.
  'rgba(0, 0, 0, 0.8)': 'rgba(42, 33, 24, 0.62)',
  'rgba(0, 0, 0, 0.82)': 'rgba(42, 33, 24, 0.64)',
  'rgba(0, 0, 0, 0.85)': 'rgba(42, 33, 24, 0.66)',
  'rgba(0, 0, 0, 0.45)': 'rgba(42, 33, 24, 0.4)',
  'rgba(0, 0, 0, 0.4)': 'rgba(42, 33, 24, 0.36)',
  'rgba(0, 0, 0, 0.25)': 'rgba(42, 33, 24, 0.22)',
  'rgba(5, 7, 13, 0.88)': 'rgba(42, 33, 24, 0.66)',
  'rgba(15, 18, 28, 0.7)': 'rgba(42, 33, 24, 0.55)',
  'rgba(12, 14, 20, 0.94)': 'rgba(42, 33, 24, 0.72)',
  'rgba(6, 8, 14, 0.72)': 'rgba(42, 33, 24, 0.6)',
  'rgba(245, 158, 11, 0.08)': 'rgba(154, 52, 18, 0.08)',
  'rgba(245, 158, 11, 0.1)': 'rgba(154, 52, 18, 0.09)',
  'rgba(245, 158, 11, 0.12)': 'rgba(154, 52, 18, 0.1)',
  'rgba(245, 158, 11, 0.15)': 'rgba(154, 52, 18, 0.12)',
  'rgba(245, 158, 11, 0.2)': 'rgba(154, 52, 18, 0.16)',
  'rgba(245, 158, 11, 0.25)': 'rgba(154, 52, 18, 0.2)',
  'rgba(56, 189, 248, 0.08)': 'rgba(21, 94, 117, 0.08)',
  'rgba(56, 189, 248, 0.1)': 'rgba(21, 94, 117, 0.1)',
  'rgba(56, 189, 248, 0.12)': 'rgba(21, 94, 117, 0.12)',
  'rgba(56, 189, 248, 0.15)': 'rgba(21, 94, 117, 0.14)',
  'rgba(16, 185, 129, 0.1)': 'rgba(22, 101, 52, 0.1)',
  'rgba(16, 185, 129, 0.12)': 'rgba(22, 101, 52, 0.11)',
  'rgba(16, 185, 129, 0.15)': 'rgba(22, 101, 52, 0.12)',
  'rgba(239, 68, 68, 0.12)': 'rgba(153, 27, 27, 0.1)',
  'rgba(239, 68, 68, 0.15)': 'rgba(153, 27, 27, 0.12)',
  'rgba(6, 182, 212, 0.15)': 'rgba(14, 116, 144, 0.12)',
  'rgba(168, 85, 247, 0.12)': 'rgba(107, 33, 168, 0.1)',
  'rgba(168, 85, 247, 0.15)': 'rgba(107, 33, 168, 0.12)',
  'rgba(244, 63, 94, 0.1)': 'rgba(159, 18, 57, 0.09)',
  'rgba(244, 63, 94, 0.12)': 'rgba(159, 18, 57, 0.1)',
  'rgba(244, 63, 94, 0.15)': 'rgba(159, 18, 57, 0.12)'
};

/** Bordas literais → traço de tinta. O seletor casa só a cor. */
const BORDERS = {
  'rgba(255, 255, 255, 0.05)': 'rgba(61, 46, 31, 0.1)',
  'rgba(255, 255, 255, 0.06)': 'rgba(61, 46, 31, 0.12)',
  'rgba(255, 255, 255, 0.07)': 'rgba(61, 46, 31, 0.13)',
  'rgba(255, 255, 255, 0.08)': 'rgba(61, 46, 31, 0.14)',
  'rgba(255, 255, 255, 0.1)': 'rgba(61, 46, 31, 0.16)',
  'rgba(255, 255, 255, 0.12)': 'rgba(61, 46, 31, 0.18)',
  'rgba(255, 255, 255, 0.15)': 'rgba(61, 46, 31, 0.2)',
  'rgba(255,255,255,0.06)': 'rgba(61, 46, 31, 0.12)',
  'rgba(255,255,255,0.07)': 'rgba(61, 46, 31, 0.13)',
  'rgba(255,255,255,0.08)': 'rgba(61, 46, 31, 0.14)',
  'rgba(255,255,255,0.1)': 'rgba(61, 46, 31, 0.16)',
  'rgba(245, 158, 11, 0.25)': 'rgba(154, 52, 18, 0.32)',
  'rgba(245, 158, 11, 0.3)': 'rgba(154, 52, 18, 0.38)',
  'rgba(245, 158, 11, 0.35)': 'rgba(154, 52, 18, 0.42)',
  'rgba(245, 158, 11, 0.4)': 'rgba(154, 52, 18, 0.5)',
  'rgba(245, 158, 11, 0.5)': 'rgba(154, 52, 18, 0.6)',
  'rgba(245, 158, 11, 0.6)': 'rgba(154, 52, 18, 0.7)',
  '#fbbf24': STAMP,
  '#f59e0b': STAMP,
  '#64748b': INK_DIM
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setContent('<div id="d"></div>');

/** Devolve a forma exata que o navegador grava no atributo style. */
async function serialized(prop, value) {
  return page.evaluate(([p, v]) => {
    const d = document.getElementById('d');
    d.setAttribute('style', '');
    d.style[p] = v;
    const attr = d.getAttribute('style') || '';
    const part = attr.split(';').map(s => s.trim()).find(s => s.startsWith(p === 'backgroundColor' ? 'background-color' : p.replace(/[A-Z]/g, m => '-' + m.toLowerCase())));
    return part || attr.replace(/;\s*$/, '');
  }, [prop, value]);
}

const lines = [];
const rule = (selector, body) => lines.push(`${selector} { ${body} }`);

lines.push('/* Gerado por scripts/build-catalog-theme.mjs — não editar à mão. */');
lines.push('/* Reinterpreta os tons literais do JSX. O mapa mental fica de fora. */');
lines.push('');

// Texto. O preto literal vira creme: no tema antigo ele só existia sobre o
// botão dourado, que aqui é o carimbo terracota.
lines.push('/* --- texto --- */');
for (const [from, to] of Object.entries(TEXT)) {
  const ser = await serialized('color', from);
  const needle = ser.replace('color: ', '');
  rule(`[style*="color: ${needle}"]`, `color: ${to} !important;`);
}
rule('[style*="color: rgb(0, 0, 0)"]', `color: ${CREAM} !important;`);
rule('[style*="color: black"]', `color: ${CREAM} !important;`);

// Superfícies escuras.
lines.push('', '/* --- superfícies --- */');
for (const [from, to] of Object.entries(SURFACE)) {
  const ser = await serialized('background', from);
  rule(`[style*="${ser}"]`, `background: ${to} !important;`);
}

// Botões chapados: fundo fechado e texto creme.
lines.push('', '/* --- botões chapados --- */');
for (const [from, to] of Object.entries(SOLID_BUTTON)) {
  const ser = await serialized('background', from);
  rule(`[style*="${ser}"]`, `background: ${to} !important; color: ${CREAM} !important;`);
}

// Gradientes.
lines.push('', '/* --- gradientes --- */');
for (const [from, to] of Object.entries(GRADIENTS)) {
  const ser = await serialized('background', from);
  const creamText = from.includes('#f59e0b 0%, #d97706') || from.includes('#38bdf8 0%, #0284c7')
    || from.includes('#10b981 0%, #059669') || from.includes('#a855f7 0%, #7c3aed')
    || from.includes('#ef4444') || from.includes('#06b6d4 0%, #0891b2');
  rule(`[style*="${ser.replace('background: ', '')}"]`, `background: ${to} !important;${creamText ? ` color: ${CREAM} !important;` : ''}`);
}

// Véus translúcidos.
lines.push('', '/* --- véus e realces --- */');
const seenVeil = new Set();
for (const [from, to] of Object.entries(VEILS)) {
  // O JSX usa tanto `background` quanto `backgroundColor`; o navegador grava
  // cada um de um jeito, então os dois precisam de seletor.
  for (const prop of ['background', 'backgroundColor']) {
    const ser = await serialized(prop, from);
    if (seenVeil.has(ser)) continue;
    seenVeil.add(ser);
    rule(`[style*="${ser}"]`, `background: ${to} !important;`);
  }
}

// Bordas. Casam pela cor serializada dentro do atalho "1px solid ...".
lines.push('', '/* --- bordas --- */');
const seenBorder = new Set();
for (const [from, to] of Object.entries(BORDERS)) {
  const ser = await serialized('borderColor', from);
  const needle = ser.replace('border-color: ', '');
  if (seenBorder.has(needle)) continue;
  seenBorder.add(needle);
  rule(`[style*="solid ${needle}"]`, `border-color: ${to} !important;`);
}

// O mapa mental conserva o contraste escuro: o que vazou para dentro dele
// volta ao valor inline original.
lines.push('', '/* --- o mapa mental não entra no tema --- */');
lines.push('.mindmap-canvas [style*="color:"], .mindmap-fullscreen-root [style*="color:"] { color: revert-layer; }');
lines.push('.mindmap-canvas [style*="background"], .mindmap-fullscreen-root [style*="background"] { background: revert-layer; }');

await browser.close();

const out = lines.join('\n') + '\n';
writeFileSync(new URL('../src/styles/catalog-overrides.css', import.meta.url), out);
console.log(`Escreveu ${lines.length} linhas em src/styles/catalog-overrides.css`);
