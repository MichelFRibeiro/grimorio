/**
 * Gera, para os temas CLAROS, o "espelho" das regras de classe do index.css.
 *
 * index.css é o tema Obsidiana (escuro) e pinta quase tudo por CLASSE:
 * `.settings-group li strong { color: #f8fafc }`. Nos temas escuros novos isso
 * está certo; nos temas claros (Catálogo e Atlas) esse texto branco fica branco
 * sobre papel. O tema Catálogo resolveu os casos que o autor notou, um a um.
 *
 * Este script lê o index.css, separa as regras de "tema escuro" (texto claro
 * OU fundo escuro) e gera a mesma regra com as cores mapeadas para a tinta do
 * tema claro. Só sobrescreve o que aquele tema não declarou à mão: as regras
 * manuais (skin.css) e as já geradas em claro/skin.css ficam vencendo pela
 * ordem — ver o aviso de substituição (<style> automático entra ANTES).
 *
 * Saída: src/styles/themes/<tema>/dark-rules.css (importado no skin do tema).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'src/styles/index.css');

/** Tinta de cada tema claro. */
export const INK_MAPS = {
  claro: {
    '#f8fafc': '#2a2118', '#ffffff': '#2a2118', '#fff': '#2a2118', '#f1f5f9': '#2a2118',
    '#e2e8f0': '#4d4033', '#cbd5e1': '#4d4033', '#94a3b8': '#6d5d4c', '#64748b': '#7d6a58',
    '#475569': '#8d7b68', '#0f172a': '#f3ecdc', '#111827': '#f3ecdc', '#fbbf24': '#b0380b', '#f59e0b': '#b0380b',
    '#fcd34d': '#ea580c', '#d97706': '#9a3412', '#fde68a': '#9a3412', '#eab308': '#a16207',
    '#38bdf8': '#1d6f8a', '#7dd3fc': '#155e75', '#06b6d4': '#0e7490', '#0284c7': '#0c4a6e',
    '#a855f7': '#7c4a9b', '#c084fc': '#6d28d9', '#e9d5ff': '#5b2e86', '#c4b5fd': '#6d28d9',
    '#10b981': '#3f7d4e', '#34d399': '#166534', '#86efac': '#166534', '#6ee7b7': '#166534',
    '#d1fae5': '#14532d', '#a7f3d0': '#14532d', '#f87171': '#b91c1c', '#fb7185': '#be123c',
    '#fda4af': '#9f1239', '#fecdd3': '#9f1239', '#f43f5e': '#be123c', '#ef4444': '#b91c1c',
    '#b91c1c': '#991b1b', '#1c2333': '#fbf7ee', '#131722': '#fbf7ee', '#0c0e14': '#f6f1e4',
    '#0b0e14': '#f6f1e4', '#0a0c10': '#efe7d4', '#1a2030': '#efe7d4'
  },
  atlas: {
    '#f8fafc': '#2c3527', '#ffffff': '#2c3527', '#fff': '#2c3527', '#f1f5f9': '#2c3527',
    '#e2e8f0': '#3d4735', '#cbd5e1': '#3d4735', '#94a3b8': '#66705a', '#64748b': '#7b8371',
    '#475569': '#8d9484', '#0f172a': '#eee9db', '#111827': '#eee9db', '#fbbf24': '#a8742b', '#f59e0b': '#a8742b',
    '#fcd34d': '#9a6a24', '#d97706': '#7f5418', '#fde68a': '#9a6a24', '#eab308': '#8a6118',
    '#38bdf8': '#3a7173', '#7dd3fc': '#4a8284', '#06b6d4': '#3a7173', '#0284c7': '#2c5b5d',
    '#a855f7': '#7c5f95', '#c084fc': '#6b4a86', '#e9d5ff': '#5d4475', '#c4b5fd': '#6b4a86',
    '#10b981': '#47705a', '#34d399': '#3d6150', '#86efac': '#3d6150', '#6ee7b7': '#4a7360',
    '#d1fae5': '#2f5140', '#a7f3d0': '#2f5140', '#f87171': '#a3413c', '#fb7185': '#b05f6b',
    '#fda4af': '#a05062', '#fecdd3': '#8f4655', '#f43f5e': '#b05f6b', '#ef4444': '#a3413c',
    '#b91c1c': '#8c3630', '#1c2333': '#fdfbf5', '#131722': '#fdfbf5', '#0c0e14': '#f4f1e6',
    '#0b0e14': '#f4f1e6', '#0a0c10': '#e9e4d5', '#1a2030': '#e9e4d5'
  }
};

/**
 * Qualquer cor de DESTAQUE ou clara do tema escuro: no papel ela some.
 * Inclui o ouro/neon do tema (fbbf24, f59e0b, 38bdf8…) além dos brancos —
 * sem isso, .settings-kicker (#fbbf24) ficava dourado sobre papel.
 */
const LIGHT_TEXT = /#(?:f8fafc|fff|ffffff|f1f5f9|f9fafb|e2e8f0|cbd5e1|e9d5ff|fde68a|fcd34d|fecdd3|fda4af|c4b5fd|a7f3d0|86efac|bae6fd|e0f2fe|d1fae5|fff7ed|fbbf24|f59e0b|fcd34d|fde68a|eab308|38bdf8|7dd3fc|06b6d4|a855f7|c084fc|e879f9|10b981|34d399|6ee7b7|f87171|fb7185|f43f5e|ef4444|fb923c|2dd4bf|22d3ee|94a3b8|64748b|475569|cbd5e1)\b/i;

/** Cor do tema escuro -> cor do tema claro. */
function mapColor(color, ink) {
  const lower = color.trim().toLowerCase();
  if (ink[lower]) return ink[lower];
  const rgba = lower.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)/);
  if (!rgba) return null;
  const [, r, g, b, a] = rgba;
  const hex = '#' + [r, g, b].map((v) => Number(v).toString(16).padStart(2, '0')).join('');
  const target = ink[hex];
  if (!target) return null;
  if (a === undefined) return target;
  const t = target.match(/^#([0-9a-f]{6})$/i);
  if (!t) return null;
  const n = parseInt(t[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

/** Substitui todas as cores de uma declaração mantendo o resto. */
function remapDeclarations(body, ink) {
  let changed = false;
  // hex
  let out = body.replace(/#[0-9a-fA-F]{3,8}\b/g, (c) => {
    const to = ink[c.toLowerCase()];
    if (to) { changed = true; return to; }
    return c;
  });
  // rgb / rgba
  out = out.replace(/rgba?\([^)]*\)/g, (c) => {
    const to = mapColor(c, ink);
    if (to) { changed = true; return to; }
    return c;
  });
  return changed ? out : null;
}

function build() {
  const raw = fs.readFileSync(INDEX, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(raw))) {
    const sel = m[1].trim().replace(/\s+/g, ' ');
    if (!sel || sel.startsWith('@')) continue;
    rules.push({ sel, body: m[2] });
  }

  for (const [tema, ink] of Object.entries(INK_MAPS)) {
    const scope = `html[data-theme="${tema}"]`;
    const lines = [
      `/* GERADO por scripts/build-dark-fallback.mjs — não editar à mão. */`,
      `/* Tema "${tema}": espelho claro das regras de classe do index.css (que é escuro). */`,
      `/* Entra ANTES das regras de skin.css, então tudo que o tema define à mão vence. */`,
      ''
    ];
    let n = 0;
    for (const rule of rules) {
      const lightText = LIGHT_TEXT.test((rule.body.match(/(?:^|;|\s)color\s*:\s*([^;}]+)/) || [])[1] || '');
      const darkBg = /background(?:-color)?\s*:\s*rgba?\(\s*(?:[0-9]{1,2}),\s*(?:[0-9]{1,2}),\s*(?:[0-9]{1,2})/i.test(rule.body)
        || /background(?:-color)?\s*:\s*#(?:0c0e14|131722|0a0c10|0b0e14|1a2030|1c2333)/i.test(rule.body);
      // botão chapado do tema escuro: fundo de destaque + texto escuro
      const solidButton = /background(?:-color)?\s*:\s*#(?:f59e0b|fbbf24|38bdf8|10b981|a855f7|ef4444|06b6d4)\b/i.test(rule.body)
        && /color\s*:\s*#(?:111|111827|000|0f172a)\b/i.test(rule.body);
      if (!lightText && !darkBg && !solidButton) continue;
      let body = remapDeclarations(rule.body, ink);
      if (!body) continue;
      // botão chapado (fundo forte + rótulo escuro): o rótulo no tema claro
      // precisa ser creme, não tinta escura.
      if (solidButton) {
        body = body.replace(/color\s*:\s*[^;}]+/, `color: ${tema === 'claro' ? '#fffdf8' : '#fdfbf5'}`);
      }
      const sels = rule.sel.split(',').map((s) => (s.trim().startsWith('html[') ? s.trim() : `${scope} ${s.trim()}`));
      lines.push(`${sels.join(',\n')} {${body.trim()} }`.replace('{ ', '{ '));
      n++;
    }
    const file = path.join(ROOT, `src/styles/themes/${tema}/dark-rules.css`);
    fs.writeFileSync(file, lines.join('\n') + '\n');
    console.log(`${tema}: ${n} regras -> src/styles/themes/${tema}/dark-rules.css`);
  }
}

build();
