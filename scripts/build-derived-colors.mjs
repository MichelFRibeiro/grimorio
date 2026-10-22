/**
 * Cores derivadas por template literal.
 *
 * O JSX monta muits cores em tempo de execução: `${accent}22` (o hex do
 * destaque com alfa no byte final), `${group.color}55`, `${ACCENT} 0%` dentro
 * de um gradiente. Essas cores nunca aparecem como literal no código, então
 * os geradores de literal não as conhecem — e num tema claro sobra pastel.
 *
 * Este script:
 *  1. descobre, ao ler o JSX, em QUAL propriedade cada template literal é
 *     usado (background, color, border…). É isso que decide se o tom vira
 *     fundo, tinta ou borda;
 *  2. calcula as combinações base + alfa ("22", "55", "cc"…) que a UI
 *     consegue produzir;
 *  3. emite, para cada tema, regras [style*="..."] com a forma EXATA que o
 *     Chromium grava (alpha arredondado a 3 casas, "rgba(r, g, b, 0.133)").
 *
 * Saída: src/styles/themes/<tema>/derived.css (importado no skin do tema).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ALPHAS = ['14', '22', '2e', '33', '38', '44', '55', '66', '73', '88', 'aa', 'bb', 'cc', 'dd', 'ee'];

/** Tinta de cada tema: base hex -> tom equivalente. */
const TINTAS = {
  claro: {
    '#fbbf24': '#b0380b', '#f59e0b': '#b0380b', '#f87171': '#b91c1c', '#ef4444': '#b91c1c',
    '#38bdf8': '#1d6f8a', '#10b981': '#3f7d4e', '#f43f5e': '#b4234a', '#a855f7': '#7c4a9b',
    '#06b6d4': '#0e7490', '#34d399': '#166534', '#eab308': '#a16207', '#e2e8f0': '#2a2118',
    '#94a3b8': '#6d5d4c', '#64748b': '#7d6a58', '#cbd5e1': '#4d4033', '#f8fafc': '#2a2118',
    '#fde68a': '#9a3412', '#7c3aed': '#6d28d9', '#0284c7': '#0c4a6e', '#059669': '#166534',
    '#d97706': '#9a3412', '#dc2626': '#991b1b', '#b91c1c': '#991b1b',
    '#fb7185': '#be123c', '#fecdd3': '#9f1239', '#ffffff': '#fffdf8', '#8b5cf6': '#7c4a9b',
    '#22c55e': '#3f7d4e', '#22d3ee': '#0e7490'
  },
  atlas: {
    '#fbbf24': '#a8742b', '#f59e0b': '#a8742b', '#f87171': '#a3413c', '#ef4444': '#a3413c',
    '#38bdf8': '#3a7173', '#10b981': '#47705a', '#f43f5e': '#b05f6b', '#a855f7': '#7c5f95',
    '#06b6d4': '#3a7173', '#34d399': '#3d6150', '#eab308': '#8a6118', '#e2e8f0': '#2c3527',
    '#94a3b8': '#66705a', '#64748b': '#7b8371', '#cbd5e1': '#3d4735', '#f8fafc': '#2c3527',
    '#fde68a': '#9a6a24', '#7c3aed': '#6b4a86', '#0284c7': '#2c5b5d', '#059669': '#3d6150',
    '#d97706': '#7f5418', '#dc2626': '#8c3630', '#b91c1c': '#8c3630',
    '#fb7185': '#b05f6b', '#fecdd3': '#8f4655', '#ffffff': '#fdfbf5', '#8b5cf6': '#6b4a86',
    '#22c55e': '#47705a', '#22d3ee': '#3a7173'
  },
  lousa: {
    '#fbbf24': '#f0e3a5', '#f59e0b': '#e8d88f', '#f87171': '#e8a19b', '#ef4444': '#d98783',
    '#38bdf8': '#9ad9cf', '#10b981': '#b4d9a8', '#f43f5e': '#e8a19b', '#a855f7': '#cdbcd2',
    '#06b6d4': '#9ad9cf', '#34d399': '#b4d9a8', '#eab308': '#f0e3a5', '#e2e8f0': '#e3e9dd',
    '#94a3b8': '#a9b6a5', '#64748b': '#8d9b89', '#cbd5e1': '#c8d1c3', '#f8fafc': '#eef1e8',
    '#fde68a': '#f7edbb', '#7c3aed': '#cdbcd2', '#0284c7': '#7fc0b4', '#059669': '#a3c99a',
    '#d97706': '#d8c57a', '#dc2626': '#d98783', '#b91c1c': '#d98783',
    '#fb7185': '#eba6ad', '#fecdd3': '#f3d4d4', '#ffffff': '#fbfbf4', '#8b5cf6': '#cdbcd2',
    '#22c55e': '#b4d9a8', '#22d3ee': '#9ad9cf'
  },
  terminal: {
    '#fbbf24': '#ffc861', '#f59e0b': '#e6a84a', '#f87171': '#ff8f9c', '#ef4444': '#e8695f',
    '#38bdf8': '#5fe3d0', '#10b981': '#8fe3a4', '#f43f5e': '#ff8f9c', '#a855f7': '#b8a6ff',
    '#06b6d4': '#5fe3d0', '#34d399': '#8fe3a4', '#eab308': '#ffc861', '#e2e8f0': '#c9d2de',
    '#94a3b8': '#93a0b2', '#64748b': '#7b8798', '#cbd5e1': '#c9d2de', '#f8fafc': '#e8ecf2',
    '#fde68a': '#ffc861', '#7c3aed': '#b8a6ff', '#0284c7': '#5fe3d0', '#059669': '#8fe3a4',
    '#d97706': '#e6a84a', '#dc2626': '#e8695f', '#b91c1c': '#e8695f',
    '#fb7185': '#ff8f9c', '#fecdd3': '#ffd6dc', '#ffffff': '#f4f7fb', '#8b5cf6': '#b8a6ff',
    '#22c55e': '#8fe3a4', '#22d3ee': '#5fe3d0'
  }
};

/**
 * Descobre bases hex e em qual propriedade cada uma é interpolada.
 * Percorre o arquivo por linha e olha a chave que precede o template:
 *   background: `${accent}22`   -> fundo
 *   color: `${x.color}`         -> tinta
 *   border: `1px solid ${a}66`  -> borda
 */
function collectUsages() {
  const usages = new Map(); // base -> Set(propriedade)
  const files = [];
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.jsx?$/.test(f)) files.push(p);
    }
  };
  walk(path.join(ROOT, 'src'));

  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    // valores literais por nome de variável/campo
    const literals = new Map();
    for (const m of text.matchAll(/([A-Za-z_$][\w$]*)\s*(?::| =)\s*'(#[0-9a-fA-F]{6})'/g)) {
      literals.set(m[1], m[2].toLowerCase());
    }
    // template literals com interpolação de cor
    const templateRe = /(\b[A-Za-z]+)\s*:\s*`([^`]*\$\{[^`]*)`/g;
    let t;
    while ((t = templateRe.exec(text))) {
      const prop = t[1];
      const body = t[2];
      const isGradient = /linear-gradient|radial-gradient/.test(body);
      const kind = isGradient ? 'gradient'
        : /background/i.test(prop) ? 'background'
        : /^border/.test(prop) || /^borderColor$/i.test(prop) ? 'border'
        : /^color$/i.test(prop) ? 'color'
        : null;
      if (!kind) continue;
      for (const i of body.matchAll(/\$\{([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\}/g)) {
        const ref = i[1];
        const name = ref.split('.').pop();
        const base = literals.get(name);
        if (!base) continue;
        if (!usages.has(base)) usages.set(base, new Set());
        usages.get(base).add(kind);
      }
    }
  }
  return usages;
}

/** '#rrggbbAA' -> { base, css } na forma que o Chromium grava. */
function serialize(hex) {
  const h = hex.replace('#', '');
  const base = '#' + h.slice(0, 6).toLowerCase();
  const rawAlpha = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  const alpha = Math.round(rawAlpha * 1000) / 1000;
  const n = parseInt(base.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return { base, alpha, css: alpha >= 1 ? `rgb(${rgb.join(', ')})` : `rgba(${rgb.join(', ')}, ${alpha})` };
}

const usages = collectUsages();
const bases = new Set([...usages.keys(), ...Object.keys(TINTAS.lousa)]);
console.log('bases conhecidas:', bases.size, '| propriedades por base:', [...usages].slice(0, 4).map(([b, s]) => `${b}:${[...s]}`).join(' '));

const PROP_RULES = {
  background: (scope, css, value) => `${scope} [style*="background: ${css}"] { background: ${value} !important; }`,
  color: (scope, css, value) => `${scope} [style*="color: ${css}"] { color: ${value} !important; }`,
  border: (scope, css, value) => `${scope} [style*="solid ${css}"] { border-color: ${value} !important; }`,
  // gradiente com a cor dentro: casa o bloco do gradiente e troca só esse tom
  gradient: (scope, css, value) => `${scope} [style*="gradient"][style*="${css}"] { background-image: linear-gradient(135deg, ${value} 0%, ${value} 100%) !important; }`
};

for (const [tema, inkRaw] of Object.entries(TINTAS)) {
  const ink = Object.fromEntries(Object.entries(inkRaw).map(([k, v]) => [k.toLowerCase(), v]));
  const scope = `html[data-theme="${tema}"]`;
  const lines = [
    '/* GERADO por scripts/build-derived-colors.mjs — não editar à mão. */',
    `/* Tema "${tema}": tons montados por template literal (\`\${accent}22\`, \`\${x.color}55\`…),`,
    '   cada um reescrito só na propriedade em que é usado (fundo/tinta/borda). */',
    ''
  ];
  const seen = new Set();
  for (const base of bases) {
    const target = ink[base.toLowerCase()];
    if (!target) continue;
    const kinds = usages.get(base) || new Set(['background', 'color', 'border']);
    const variants = [base, ...ALPHAS.map((a) => base + a)];
    for (const variant of variants) {
      const { alpha, css } = serialize(variant);
      // alfa do tema = mesmo alfa, tom da tinta
      const n = parseInt(target.slice(1), 16);
      const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      const value = alpha >= 1 ? `rgb(${rgb.join(', ')})` : `rgba(${rgb.join(', ')}, ${alpha})`;
      for (const kind of kinds) {
        const rule = PROP_RULES[kind](scope, css, value);
        if (seen.has(rule)) continue;
        seen.add(rule);
        lines.push(rule);
      }
    }
  }
  const file = path.join(ROOT, `src/styles/themes/${tema}/derived.css`);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  console.log(`${tema}: ${lines.length - 4} regras -> src/styles/themes/${tema}/derived.css`);
}
