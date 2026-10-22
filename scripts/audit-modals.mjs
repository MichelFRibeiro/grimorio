/**
 * Auditoria de legibilidade dos MODAIS e sobreposições em cada tema.
 *
 * Abre, em cada tema, os principais modais do Grimório (missão, ritual,
 * livro, diário, review de suplementos, julgamento, chefe, baú, rankings,
 * MCP, logout, celular, foco) e mede contraste texto/fundo como no
 * audit-contrast.mjs. Sai com a lista de falhas distintas.
 *
 * Uso: node scripts/audit-modals.mjs [base-url]
 */
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:3300';
const OUT = '/tmp/shots/audit-modals';
fs.mkdirSync(OUT, { recursive: true });

const THEMES = { claro: 'Catálogo', lousa: 'Lousa de Giz', atlas: 'Atlas Botânico', terminal: 'Terminal de Estudo' };

const MEASURE = `
(() => {
  const parse = (c) => {
    const m = String(c).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const blend = (fg, bg) => ({ r: fg.r*fg.a + bg.r*(1-fg.a), g: fg.g*fg.a + bg.g*(1-fg.a), b: fg.b*fg.a + bg.b*(1-fg.a), a: 1 });
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); };
  const gradColor = (cs) => {
    const img = cs.backgroundImage || '';
    if (!img || img === 'none') return null;
    const m = img.match(/rgba?\\([^)]+\\)|#(?:[0-9a-f]{3}|[0-9a-f]{6})/i);
    if (!m) return null;
    let c = m[0];
    if (c.startsWith('#')) {
      const h = c.slice(1); const full = h.length === 3 ? h.split('').map(x=>x+x).join('') : h;
      c = 'rgb(' + parseInt(full.slice(0,2),16) + ',' + parseInt(full.slice(2,4),16) + ',' + parseInt(full.slice(4,6),16) + ')';
    }
    return parse(c);
  };
  const bgOf = (el) => {
    let node = el, acc = null;
    while (node) {
      const cs = getComputedStyle(node);
      const grad = gradColor(cs);
      const c = (grad && grad.a > 0.5) ? grad : parse(cs.backgroundColor);
      if (c && c.a > 0) { acc = acc ? blend(acc, c) : c; if (acc.a >= 0.99) return acc; }
      if (!node.parentElement) break;
      node = node.parentElement;
    }
    const body = parse(getComputedStyle(document.body).backgroundColor) || { r:255,g:255,b:255,a:1 };
    return acc ? blend(acc, body) : body;
  };
  const root = document.querySelector('[role="dialog"], .modal-overlay, .modal-sheet, .judgment-modal, .chest-modal, .phone-time-modal, .rankings-panel') || document.body;
  const out = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let n;
  while ((n = walker.nextNode())) {
    const text = (n.textContent || '').trim();
    if (!text || text.length > 220) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) continue;
    if (el.closest('[aria-hidden="true"]')) continue;
    const fg0 = parse(cs.color);
    if (!fg0) continue;
    const bg = bgOf(el);
    const fg = blend(fg0, bg);
    const size = parseFloat(cs.fontSize);
    const weight = Number(cs.fontWeight) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const r = ratio(fg, bg);
    if (r < need) {
      out.push({ text: text.slice(0, 64), cls: (el.className || el.tagName).toString().slice(0, 50),
        ratio: Math.round(r*100)/100, need, color: cs.color,
        bg: 'rgb(' + [bg.r,bg.g,bg.b].map(v=>Math.round(v)).join(', ') + ')',
        lightOnLight: lum(fg) > 0.35 && lum(bg) > 0.35, darkOnDark: lum(fg) < 0.12 && lum(bg) < 0.12 });
    }
  }
  return out;
})()
`;

const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--font-render-hinting=none']
});

const all = {};

/** Cada modal: como abrir e o que medir. */
const MODAIS = [
  {
    nome: 'Nova Missão',
    abrir: async (page) => {
      await page.locator('nav.app-nav button', { hasText: /Missões/ }).first().click({ force: true });
      await page.waitForTimeout(1800);
      await page.getByRole('button', { name: /Nova Missão/ }).first().click({ force: true });
    }
  },
  {
    nome: 'Chefe',
    abrir: async (page) => {
      await page.locator('nav.app-nav button', { hasText: /Missões/ }).first().click({ force: true });
      await page.waitForTimeout(1500);
      await page.locator('.boss-raid button, button:has-text("Atacar"), button:has-text("Desafiar")').first().click({ force: true }).catch(() => {});
    }
  },
  {
    nome: 'Rankings',
    abrir: async (page) => {
      await page.locator('header button[title*="Ranking"]').first().click({ force: true }).catch(() => {});
    }
  },
  {
    nome: 'MCP',
    abrir: async (page) => {
      await page.getByRole('button', { name: /MCP/ }).first().click({ force: true }).catch(() => {});
    }
  },
  {
    nome: 'Sair',
    abrir: async (page) => {
      await page.locator('header button[title="Sair"], header button:has-text("Sair")').first().click({ force: true });
    }
  }
];

for (const [theme, label] of Object.entries(THEMES)) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const b = page.getByRole('button', { name: /Acesso Rápido/i });
  if (await b.count()) { await b.click(); await page.waitForTimeout(2800); }
  await page.keyboard.press('Escape');
  const r = page.getByRole('button', { name: /Responder depois/i });
  if (await r.count()) { await r.last().click({ force: true }).catch(() => {}); await page.waitForTimeout(1000); }

  // troca de tema pela UI (a fonte de verdade é o perfil)
  await page.locator('header button[title="Configurações"]').first().click({ force: true });
  await page.waitForTimeout(800);
  await page.locator('.settings-theme', { hasText: label }).first().click({ force: true });
  await page.waitForTimeout(1200);

  all[theme] = [];
  for (const modal of MODAIS) {
    try {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      await modal.abrir(page);
      await page.waitForTimeout(1400);
      const v = await page.evaluate(MEASURE);
      all[theme].push({ modal: modal.nome, violacoes: v });
      await page.screenshot({ path: `${OUT}/${theme}-${modal.nome.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}.png` });
    } catch (e) {
      all[theme].push({ modal: modal.nome, erro: e.message.slice(0, 80) });
    }
  }
  await ctx.close();
}

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(all, null, 2));

// resumo por modal (problemas distintos)
const grouped = new Map();
for (const [theme, modais] of Object.entries(all)) {
  for (const m of modais) {
    for (const v of m.violacoes || []) {
      const key = `${m.modal}|${v.cls}|${v.color}|${v.bg}`;
      if (!grouped.has(key)) grouped.set(key, { ...v, modal: m.modal, themes: new Set() });
      grouped.get(key).themes.add(theme);
    }
  }
}
const issues = [...grouped.values()].sort((a, b) => a.ratio - b.ratio);
console.log(`modais auditados: ${MODAIS.length} x ${Object.keys(THEMES).length} temas`);
console.log(`problemas distintos: ${issues.length}`);
for (const i of issues.slice(0, 40)) {
  console.log(`${i.ratio}:1 [${[...i.themes].join(',')}] ${i.modal} "${i.text}" .${i.cls} ${i.color} / ${i.bg}`);
}
await browser.close();
