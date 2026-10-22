/**
 * Auditoria de legibilidade: percorre as telas (e modais) em cada tema e mede
 * o contraste real texto/fundo de cada nó visível. Também confere a direção:
 * texto claro precisa de fundo escuro e vice-versa (nunca claro sobre claro).
 *
 * Saída: lista de violações + prints. Uso:
 *   node scripts/audit-contrast.mjs [base-url]
 * Requer playwright-core e o build servido em base-url (padrão :3300).
 */
import { chromium } from '/tmp/pw/node_modules/playwright-core/index.mjs';
import fs from 'node:fs';

const BASE = process.argv[2] || 'http://127.0.0.1:3300';
const OUT = '/tmp/shots/audit';
fs.mkdirSync(OUT, { recursive: true });

const THEMES = ['claro', 'lousa', 'atlas', 'terminal'];
const TAB_LABELS = ['Hoje', 'Missões', 'Rituais', 'Biblioteca', 'Rotinas', 'Diário', 'Configurações', 'Oráculo', 'Suplementos', 'Correlações'];

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
  const blend = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1
  });
  const ratio = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  // primeira cor de um background-image (gradiente) — o "fundo" visível
  const firstGradientColor = (cs) => {
    const img = cs.backgroundImage || '';
    if (!img || img === 'none') return null;
    const m = img.match(/rgba?\([^)]+\)|#(?:[0-9a-f]{3}|[0-9a-f]{6})/i);
    if (!m) return null;
    let c = m[0];
    if (c.startsWith('#')) {
      const h = c.slice(1);
      const full = h.length === 3 ? h.split('').map(x => x + x).join('') : h;
      c = 'rgba(' + parseInt(full.slice(0,2),16) + ', ' + parseInt(full.slice(2,4),16) + ', ' + parseInt(full.slice(4,6),16) + ', 1)';
    }
    return parse(c);
  };
  const bgOf = (el) => {
    let node = el, acc = null;
    while (node) {
      const cs = getComputedStyle(node);
      // gradiente cobre o backgroundColor: a cor visível é a do gradiente
      const grad = firstGradientColor(cs);
      const c = (grad && grad.a > 0.5) ? grad : parse(cs.backgroundColor);
      if (c && c.a > 0) { acc = acc ? blend(acc, c) : c; if (acc.a >= 0.99) return acc; }
      if (!node.parentElement) break;
      node = node.parentElement;
    }
    const body = parse(getComputedStyle(document.body).backgroundColor);
    return acc ? blend(acc, body && body.a ? body : { r: 255, g: 255, b: 255, a: 1 }) : (body || { r: 255, g: 255, b: 255, a: 1 });
  };
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
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
      out.push({
        text: text.slice(0, 70),
        theme: document.documentElement.getAttribute('data-theme'),
        cls: (el.className || el.tagName).toString().slice(0, 60),
        ratio: Math.round(r * 100) / 100,
        need,
        color: cs.color,
        bg: 'rgb(' + [bg.r, bg.g, bg.b].map(v => Math.round(v)).join(', ') + ')',
        lightOnLight: lum(fg) > 0.35 && lum(bg) > 0.35,
        darkOnDark: lum(fg) < 0.12 && lum(bg) < 0.12
      });
    }
  }
  return out;
})()
`;

const browser = await chromium.launch({
  executablePath: '/root/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--font-render-hinting=none']
});

const report = {};

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'pt-BR' });
  const page = await ctx.newPage();
  return { ctx, page };
}

/** Troca o tema pelo caminho real (Configurações) e confirma o data-theme. */
async function switchTheme(page, theme) {
  const LABELS = { claro: 'Catálogo', lousa: 'Lousa de Giz', atlas: 'Atlas Botânico', terminal: 'Terminal de Estudo' };
  const current = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  if (current === theme) return true;

  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    // qualquer sobreposição aberta (tempo no celular, modal) fecha primeiro
    await page.keyboard.press('Escape').catch(() => {});
    await page.getByRole('button', { name: /Responder depois/i }).last().click({ force: true }).catch(() => {});
    await page.locator('.phone-time-overlay').click({ force: true, position: { x: 4, y: 4 } }).catch(() => {});
    await page.waitForTimeout(400);

    if (!(await page.locator('.settings-theme').count())) {
      if (!(await page.locator('header button[title="Configurações"]').count())) {
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(2200);
      }
      await page.locator('header button[title="Configurações"]').first().click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    }

    const card = page.locator('.settings-theme', { hasText: LABELS[theme] }).first();
    if (await card.count()) {
      await card.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1100);
      const now = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      if (now === theme) return true;
    }
  }
  return false;
}


async function login(page) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const b = page.getByRole('button', { name: /Acesso Rápido/i });
  if (await b.count()) { await b.click(); await page.waitForTimeout(2800); }
  await page.keyboard.press('Escape');
  const r = page.getByRole('button', { name: /Responder depois/i });
  if (await r.count()) { await r.last().click({ force: true }).catch(() => {}); await page.waitForTimeout(900); }
  await page.locator('.phone-time-overlay').click({ force: true, position: { x: 4, y: 4 } }).catch(() => {});
  await page.waitForTimeout(600);
}

/** Cada tema roda num perfil (conta) próprio: o perfil guarda o tema e um
 *  login anterior sobrescreveria a troca feita pela UI. */
async function loginAs(page, email, name) {
  await page.evaluate(async ([e, n]) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: e, name: n })
    });
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('grimorio_auth_token', data.token);
      localStorage.setItem('grimorio_auth_user', JSON.stringify(data.user));
    }
  }, [email, name]);
}

for (const theme of THEMES) {
  report[theme] = [];
  const { ctx, page } = await newPage();

  // login
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  report[theme].push({ tela: 'login', violations: await page.evaluate(MEASURE) });
  await page.screenshot({ path: `${OUT}/${theme}-login.png` });
  await login(page);
  // conta exclusiva por tema: o perfil dela guarda o tema da auditoria
  await loginAs(page, `auditor-${theme}@grimorio.test`, `Auditor ${theme}`);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const ok = await switchTheme(page, theme);
  if (!ok) console.log('NÃO trocou para', theme);
  await page.screenshot({ path: `${OUT}/${theme}-inicio.png`, fullPage: true });

  for (const label of TAB_LABELS) {
    try {
      // o tema pode ter sido revertido pela reconciliação do perfil; reaplica
      const stillOk = await switchTheme(page, theme);
      if (!stillOk) console.log('tema perdido antes de', label);
      const header = page.locator(`header button[title="${label}"]`);
      const tab = page.locator('nav.app-nav button', { hasText: new RegExp(label) }).first();
      if (label === 'Configurações') await header.first().click({ force: true });
      else if (await tab.count()) {
        const pressed = page.locator('nav.app-nav button[aria-pressed="true"]');
        if (await pressed.count()) { await pressed.first().click({ force: true }); await page.waitForTimeout(300); }
        await tab.click({ force: true });
      } else continue;
      await page.waitForTimeout(2400);
      const v = await page.evaluate(MEASURE);
      report[theme].push({ tela: label, violations: v });
      await page.screenshot({ path: `${OUT}/${theme}-${label.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}.png`, fullPage: true });
    } catch (e) {
      report[theme].push({ tela: label, erro: e.message.slice(0, 100) });
    }
  }
  await ctx.close();
}

fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2));

// resumo agrupado: um problema que aparece em várias telas conta uma vez
const grouped = {};
for (const theme of THEMES) {
  for (const tela of report[theme]) {
    for (const v of tela.violations || []) {
      const key = `${v.text.slice(0, 30)}|${v.cls}|${v.color}|${v.bg}`;
      if (!grouped[key]) grouped[key] = { ...v, themes: new Set(), telas: new Set() };
      grouped[key].themes.add(theme);
      grouped[key].telas.add(tela.tela);
    }
  }
}
const issues = Object.values(grouped).sort((a, b) => a.ratio - b.ratio);
fs.writeFileSync(`${OUT}/issues.json`, JSON.stringify(issues.map((i) => ({ ...i, themes: [...i.themes], telas: [...i.telas] })), null, 1));
console.log(`\n
### PROBLEMAS DISTINTOS: ${issues.length}`);
for (const i of issues.slice(0, 40)) {
  console.log(`${i.ratio}:1 "${i.text}" .${i.cls} ${i.color} sobre ${i.bg}  [${[...i.themes].join(',')}] ${[...i.telas].slice(0, 3).join('/')}`);
}

// resumo no terminal (por tema)
for (const theme of THEMES) {
  const total = report[theme].reduce((acc, t) => acc + (t.violations ? t.violations.length : 0), 0);
  console.log(`\n=== ${theme.toUpperCase()} — ${total} textos abaixo do contraste mínimo ===`);
  for (const tela of report[theme]) {
    if (!tela.violations || tela.violations.length === 0) continue;
    const lols = tela.violations.filter((v) => v.lightOnLight).length;
    const dods = tela.violations.filter((v) => v.darkOnDark).length;
    console.log(`  ${tela.tela}: ${tela.violations.length} (claro-sobre-claro: ${lols}, escuro-sobre-escuro: ${dods})`);
    tela.violations.slice(0, 6).forEach((v) => console.log(`     ${v.ratio}:1 (min ${v.need}) "${v.text}" .${v.cls} ${v.color} sobre ${v.bg}`));
  }
}
await browser.close();
