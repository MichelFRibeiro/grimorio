/**
 * Gera os overrides.css dos temas novos (o tema Catálogo usa o gerador antigo).
 *
 * O JSX pinta tudo com cores literais no style inline e o React as serializa
 * em rgb()/rgba(). Um seletor [style*="..."] vence o inline, então basta
 * reinterpretar cada literal com a tinta do tema — sem tocar em componente.
 *
 * Regras de desenho deste gerador:
 *  - todo seletor é escopado em html[data-theme="<tema>"]: os quatro temas
 *    convivem no mesmo bundle e não podem vazar um sobre o outro;
 *  - texto/fundo/borda: literal do JSX vira a tinta, mantendo o alfa;
 *  - gradientes: seletor na forma canônica do Chromium (hex -> rgb()) e cada
 *    cor interna remapeada, preservando ângulos, paradas e alfa;
 *  - color:#000 no JSX é RÓTULO DE BOTÃO sobre fundo forte; recebe a cor de
 *    contraste da tinta (papelContraste) e é declarado por último, com dois
 *    atributos no seletor, para não perder de uma regra de um atributo só.
 *
 * Uso: node scripts/build-theme-overrides.mjs
 * Saída: src/styles/themes/<tema>/overrides.css
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'src/styles/themes');

/* ------------------------------------------------------------ utilidades */

const rgbOf = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (hex, a) => `rgba(${rgbOf(hex).join(', ')}, ${a})`;
const rgbAt = (hex, a) => (a === 1 ? `rgb(${rgbOf(hex).join(', ')})` : rgba(hex, a));

const toHex = (c) => {
  if (c.startsWith('#')) {
    const h = c.slice(1);
    if (h.length === 3) return '#' + h.split('').map((x) => x + x).join('').toLowerCase();
    return ('#' + h.slice(0, 6)).toLowerCase();
  }
  const n = c.match(/[\d.]+/g).map(Number);
  return '#' + n.slice(0, 3).map((x) => x.toString(16).padStart(2, '0')).join('');
};
const alphaOf = (c) => {
  if (c.startsWith('#')) return c.length === 9 ? parseInt(c.slice(7, 9), 16) / 255 : 1;
  const n = c.match(/[\d.]+/g).map(Number);
  return n.length > 3 ? Math.round(n[3] * 1000) / 1000 : 1;
};

/** Forma canônica que o Chromium grava para um gradiente (hex -> rgb()). */
const canonicalGradient = (g) => 'background: ' + g.replace(/#([0-9a-fA-F]{6})\b/g, (_, h) => {
  const n = parseInt(h, 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
});

/** Escurece um tom (para o fim do gradiente não repetir o começo). */
const darken = (hex, amount = 0.12) => {
  const [r, g, b] = rgbOf(hex).map((v) => Math.max(0, Math.round(v * (1 - amount))));
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
};

/** Literais de cor que o JSX realmente usa. */
function collectLiterals() {
  const sets = { cor: new Set(), fundo: new Set(), borda: new Set(), grad: new Set() };
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.jsx?$/.test(f)) continue;
      const src = fs.readFileSync(p, 'utf8');
      // gradientes: qualquer string (inclusive em ternários de várias linhas)
      for (const g of src.match(/'((?:linear|radial)-gradient\([^']*\))'/g) || []) {
        sets.grad.add(g.slice(1, -1));
      }
      // cores literais por propriedade
      const re = /(backgroundColor|background|borderColor|border|color)\s*:\s*'([^']+)'/g;
      let m;
      while ((m = re.exec(src))) {
        const val = m[2].trim();
        if (/^(transparent|none|inherit|0|''|white|black|currentColor)$/.test(val)) continue;
        if (/^(linear|radial)-gradient/.test(val)) continue;
        const target = m[1] === 'color' ? sets.cor : (m[1] === 'background' || m[1] === 'backgroundColor' ? sets.fundo : sets.borda);
        for (const c of val.match(/(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/g) || []) target.add(c);
      }
    }
  };
  walk(path.join(ROOT, 'src'));
  return sets;
}

/* ---------------------------------------------------------------- paletas */

/** Papel de cada literal (o JSX foi escrito pensando num fundo escuro). */
const PAPEIS = {
  '#f8fafc': 'claro', '#ffffff': 'claro2', '#e2e8f0': 'claro3', '#cbd5e1': 'claro3',
  '#94a3b8': 'dim', '#64748b': 'dim2', '#475569': 'dim3',
  '#0f172a': 'escuro', '#1f2937': 'escuro', '#111111': 'escuro',
  '#fbbf24': 'amarelo', '#f59e0b': 'laranja', '#fcd34d': 'amarelo', '#d97706': 'laranja',
  '#fde68a': 'amarelo', '#eab308': 'amarelo', '#fb923c': 'laranja',
  '#38bdf8': 'turquesa', '#7dd3fc': 'ceu', '#06b6d4': 'turquesa', '#0284c7': 'turquesa',
  '#22d3ee': 'turquesa', '#0891b2': 'turquesa',
  '#a855f7': 'violeta', '#c084fc': 'violeta', '#a78bfa': 'violeta', '#e9d5ff': 'roxo',
  '#c4b5fd': 'violeta', '#7c3aed': 'violeta', '#6d28d9': 'violeta', '#e879f9': 'violeta',
  '#10b981': 'verde', '#34d399': 'verde', '#86efac': 'verde', '#6ee7b7': 'menta',
  '#059669': 'verde', '#d1fae5': 'menta', '#a7f3d0': 'menta', '#22c55e': 'verde',
  '#2dd4bf': 'menta', '#042f2e': 'escuro', '#022c22': 'escuro', '#052e16': 'escuro',
  '#f87171': 'rosa', '#fb7185': 'rosa', '#fda4af': 'rosa', '#fecdd3': 'rosa',
  '#f43f5e': 'rosa', '#f472b6': 'rosa', '#ec4899': 'rosa', '#fca5a5': 'rosa',
  '#ef4444': 'vermelho', '#b91c1c': 'vermelho', '#9f1239': 'vermelho',
  '#2a2118': 'tinta', '#fbf7ee': 'papel',
  '#131722': 'sombra', '#0c0e14': 'sombra', '#0b0e16': 'sombra', '#12151e': 'sombra',
  '#0c101d': 'sombra', '#070a13': 'sombra', '#060911': 'sombra', '#0a0d14': 'sombra',
  '#0a0c10': 'sombra', '#222a3f': 'sombra', '#1c2333': 'sombra', '#05070d': 'sombra',
  '#020617': 'sombra', '#080a12': 'sombra', '#171612': 'sombra', '#1e1b14': 'sombra',
  '#0f111a': 'sombra', '#9a3412': 'laranja', '#3d2e1f': 'tinta', '#0f6e6b': 'turquesa'
};

const TEMAS = {
  lousa: {
    nome: 'Lousa de Giz',
    papelContraste: '#16211d',
    card: '#26362f',
    tinta: {
      claro: '#eef1e8', claro2: '#fbfbf4', claro3: '#d9e1d4',
      dim: '#b3bfae', dim2: '#9dab98', dim3: '#8a9887',
      escuro: '#d9e0d6', amarelo: '#f0e3a5', laranja: '#e8d88f',
      turquesa: '#9ad9cf', ceu: '#b9e6dd', violeta: '#cdbcd2', roxo: '#e3d6e0',
      verde: '#b4d9a8', menta: '#cfe6c6', rosa: '#e8a19b', vermelho: '#d98783',
      tinta: '#d9e0d6', papel: '#26362f', sombra: '#16211d'
    },
    superficie: {
      '#1a2030': '#2c3e36', '#131722': '#26362f', '#0c0e14': '#22302b',
      '#222a3f': '#33473e', '#1c2333': '#28382f'
    }
  },
  atlas: {
    nome: 'Atlas Botânico',
    papelContraste: '#fdfbf5',
    card: '#fdfbf5',
    tinta: {
      claro: '#2c3527', claro2: '#26301f', claro3: '#3d4735',
      dim: '#5c6652', dim2: '#656f59', dim3: '#737c67',
      escuro: '#8b957c', amarelo: '#a8742b', laranja: '#9a6a24',
      turquesa: '#3a7173', ceu: '#4a8284', violeta: '#7c5f95', roxo: '#5d4475',
      verde: '#47705a', menta: '#587e62', rosa: '#b05f6b', vermelho: '#a3413c',
      tinta: '#2c3527', papel: '#f7f4ea', sombra: '#e6e1d2'
    },
    superficie: {
      '#ffffff@0.02': '#f6f2e6', '#ffffff@0.03': '#f4f0e4', '#ffffff@0.04': '#f3efe2',
      '#ffffff@0.05': '#f2eee1', '#ffffff@0.06': '#f0ece0', '#ffffff@0.08': '#eee9d9',
      '#ffffff@0.1': '#ebe5d4',
      '#000000@0.25': '#e9e4d5', '#000000@0.3': '#e9e4d5', '#000000@0.35': '#e9e4d5',
      '#000000@0.4': '#e9e4d5', '#000000@0.45': '#e9e4d5',
      '#1a2030': '#f0ece0', '#131722': '#fdfbf6', '#0c0e14': '#f7f4ea',
      '#222a3f': '#e7e2d2', '#1c2333': '#f4f0e4'
    }
  },
  terminal: {
    nome: 'Terminal de Estudo',
    papelContraste: '#0b0e12',
    card: '#151a21',
    tinta: {
      claro: '#e8ecf2', claro2: '#f4f7fb', claro3: '#c9d2de',
      dim: '#9dabbd', dim2: '#8693a5', dim3: '#758292',
      escuro: '#c9d2de', amarelo: '#ffc861', laranja: '#e6a84a',
      turquesa: '#5fe3d0', ceu: '#8feee0', violeta: '#b8a6ff', roxo: '#cdc0ff',
      verde: '#8fe3a4', menta: '#b3f0c0', rosa: '#ff8f9c', vermelho: '#e8695f',
      tinta: '#c9d2de', papel: '#151a21', sombra: '#0e1217'
    },
    superficie: {
      '#1a2030': '#1a212b', '#131722': '#12171e', '#0c0e14': '#0b0e12',
      '#222a3f': '#232c3a', '#1c2333': '#1b222c'
    }
  }
};

/* ------------------------------------------------------------- geração */

const literais = collectLiterals();

const GRADIENTES_EXTRAS = [
  'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  'linear-gradient(135deg, #f59e0b, #d97706)',
  'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
  'linear-gradient(135deg, #10b981 0%, #059669 100%)',
  'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
  'linear-gradient(135deg, #06b6d4 0%, #0891b2 100%)',
  'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
  'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
];
const gradientes = [...new Set([...literais.grad, ...GRADIENTES_EXTRAS])];

let total = 0;
for (const [tema, dados] of Object.entries(TEMAS)) {
  const scope = `html[data-theme="${tema}"]`;
  const tinta = dados.tinta;
  const fundoPadrao = dados.card;

  const cor = (literal) => tinta[PAPEIS[toHex(literal)]] || null;
  const fundo = (literal) => {
    const hex = toHex(literal);
    const a = alphaOf(literal);
    // gradientes "de card" terminam na superfície do tema (o JSX termina em
    // obsidiana); por isso o papel tem prioridade sobre a tinta clara.
    return dados.superficie[`${hex}@${a}`]
      || (PAPEIS[hex] === 'sombra' ? fundoPadrao : tinta[PAPEIS[hex]])
      || null;
  };

  const lines = [
    '/* GERADO por scripts/build-theme-overrides.mjs — não editar à mão. */',
    `/* Tema "${dados.nome}": reinterpreta os literais de cor do JSX. */`,
    ''
  ];
  const seen = new Set();
  const rule = (sel, body) => {
    const key = sel + body;
    if (seen.has(key)) return;
    seen.add(key);
    lines.push(`${sel} { ${body} }`);
  };

  // 1) texto
  lines.push('/* --- texto --- */');
  for (const lit of [...literais.cor].sort()) {
    const hex = toHex(lit);
    if (hex === '#000000') continue;
    const dest = cor(lit);
    if (!dest) continue;
    const a = alphaOf(lit);
    rule(`${scope} [style*="color: ${rgbAt(hex, a)}"]`, `color: ${a === 1 ? dest : rgba(dest, a)} !important;`);
  }

  // 2) fundos
  lines.push('', '/* --- fundos --- */');
  for (const lit of [...literais.fundo].sort()) {
    const hex = toHex(lit);
    const dest = fundo(lit);
    if (!dest) continue;
    const a = alphaOf(lit);
    const chapado = dados.superficie[`${hex}@${a}`];
    const value = chapado || (a === 1 ? dest : rgba(dest, a));
    rule(`${scope} [style*="background: ${rgbAt(hex, a)}"]`, `background: ${value} !important;`);
  }

  // 3) bordas
  lines.push('', '/* --- bordas --- */');
  for (const lit of [...literais.borda].sort()) {
    const hex = toHex(lit);
    if (hex === '#000000') continue;
    const dest = cor(lit);
    if (!dest) continue;
    const a = alphaOf(lit);
    rule(`${scope} [style*="border-color: ${rgbAt(hex, a)}"]`, `border-color: ${a === 1 ? dest : rgba(dest, a)} !important;`);
  }

  // 4) gradientes
  lines.push('', '/* --- gradientes (cores internas remapeadas, alfa preservado) --- */');
  for (const g of gradientes) {
    let first = null;
    let i = 0;
    const novo = g.replace(/(#[0-9a-fA-F]{6}|rgba?\([^)]+\))/g, (c) => {
      const dest = cor(c) || fundo(c);
      if (!dest) return c;
      const a = alphaOf(c);
      const value = a === 1 ? dest : rgba(dest, a);
      i += 1;
      if (i === 1) { first = value; return value; }
      if (a === 1 && value === first) return darken(value);
      return value;
    });
    rule(`${scope} [style*="${canonicalGradient(g)}"]`, `background: ${novo} !important;`);
  }

  // 5) rótulo de botão (color:#000 no JSX). Declarado por último e com dois
  //    atributos no seletor: ganha de qualquer regra de cor de um atributo só.
  lines.push('', '/* --- rotulo de botao de fundo forte (color preto no JSX) ---' + ' */');
  for (const marcador of ['color: rgb(0, 0, 0)', 'color: black']) {
    rule(`${scope} [style*="${marcador}"][style*="background"]`, `color: ${dados.papelContraste} !important;`);
    rule(`${scope} [style*="${marcador}"][style*="border"]`, `color: ${dados.papelContraste} !important;`);
  }

  const out = lines.join('\n') + '\n';
  const file = path.join(OUT_DIR, tema, 'overrides.css');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, out);
  total += lines.length;
  console.log(`${tema}: ${lines.length} regras -> src/styles/themes/${tema}/overrides.css`);
}
console.log(`Total: ${total} regras.`);
