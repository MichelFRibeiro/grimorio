/**
 * Gráficos (Chart.js) com as cores do tema em vigor.
 *
 * O Chart.js desenha em <canvas>: o CSS não alcança o que ele pinta, então as
 * cores de grade, eixos, preenchimentos de zona e tooltip são remapeadas aqui.
 *
 * O mapeamento é por PAPEL, não por tema: cada tom que aparece nos gráficos
 * (verde de homeostase, rosa de alostase, âmbar de alostase moderada, cinza de
 * dia vazio) é traduzido para o token correspondente do tema:
 *
 *   --tpl-ok      homeostase            (verde)
 *   --tpl-alert   alostase/sobrecarga   (rosa)
 *   --tpl-warm    alostase moderada     (âmbar)
 *   --tpl-muted   dia vazio             (cinza)
 *   --tpl-accent  série/cor de destaque
 *   --tpl-ink, --tpl-card, --tpl-rule, --tpl-soft
 *
 * Os chips de KPI (DEFAULT_ZONE_META em HomeostasisLoadChart) usam nomes de
 * token (`var(--tpl-ok)`), e o navegador resolve a cor sozinho no <style>.
 * Para o <canvas> existe este "pincel": o tema publica o valor real de cada
 * token em window.__GRIMORIO_THEME__ e aqui as cores são trocadas na hora.
 */

const ROLE_TOKENS = {
  ok: '--tpl-ok',
  alert: '--tpl-alert',
  warm: '--tpl-warm',
  muted: '--tpl-muted',
  accent: '--tpl-accent',
  accent2: '--tpl-accent-2',
  ink: '--tpl-ink',
  soft: '--tpl-soft',
  card: '--tpl-card',
  paper: '--tpl-paper',
  rule: '--tpl-rule'
};

function cssVar(name) {
  if (typeof window === 'undefined') return '';
  return window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function readPalette() {
  const palette = {};
  for (const [role, token] of Object.entries(ROLE_TOKENS)) palette[role] = cssVar(token);
  return palette;
}

const hexToRgb = (hex) => {
  const h = String(hex).replace('#', '');
  if (h.length !== 6) return null;
  return [(parseInt(h.slice(0, 2), 16)), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

/** rgb()/rgba()/#hex do JSX -> papel do tema. */
function roleOf(color) {
  if (!color || typeof color !== 'string') return null;
  const lower = color.toLowerCase().replace(/\s+/g, '');
  if (lower === 'transparent' || lower === 'none') return null;
  // verde (homeostase)
  if (/16,185,129|52,211,153|110,231,183|134,239,172|34,197,94|5,150,105|#10b981|#34d399|#6ee7b7|#86efac|#22c55e|#059669/.test(lower)) return 'ok';
  // rosa/vermelho (alostase)
  if (/244,63,94|248,113,113|251,113,133|239,68,68|185,28,28|#f43f5e|#f87171|#fb7185|#ef4444|#b91c1c/.test(lower)) return 'alert';
  // âmbar (alostase moderada, série, setpoint)
  if (/251,191,36|245,158,11|251,146,60|253,230,138|250,204,21|#fbbf24|#f59e0b|#fb923c|#fde68a|#facc15/.test(lower)) return 'warm';
  // cinza (dia vazio / eixo)
  if (/148,163,184|100,116,139|203,213,225|#94a3b8|#64748b|#cbd5e1/.test(lower)) return 'muted';
  return null;
}

const withAlpha = (hex, alpha) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
};

function themeColor(palette, role) {
  return palette[role] || null;
}

/** Recolore a configuração ANTES de o Chart.js montar o gráfico. */
function recolorConfig(config, palette) {
  const data = config && config.data;
  if (data && Array.isArray(data.datasets)) {
    data.datasets.forEach((dataset) => {
      if (!dataset) return;
      // dataset de preenchimento de zona: cor cheia, sem borda
      const bg = dataset.backgroundColor;
      if (typeof bg === 'string') {
        const role = roleOf(bg);
        if (role) {
          const color = themeColor(palette, role);
          if (color) {
            dataset.backgroundColor = withAlpha(color, 0.16);
            dataset.borderColor = 'transparent';
            dataset.borderWidth = 0;
          }
        }
      }
      // linhas: série principal e setpoint (tracejado)
      if (typeof dataset.borderColor === 'string' && dataset.fill !== true) {
        const role = roleOf(dataset.borderColor);
        if (role === 'warm' || role === 'accent') {
          dataset.borderColor = dataset.label === 'Setpoint'
            ? withAlpha(palette.accent, 0.55)
            : palette.accent;
        } else if (role) {
          dataset.borderColor = themeColor(palette, role) || dataset.borderColor;
        }
      }
      // pontos coloridos por zona
      if (Array.isArray(dataset.pointBackgroundColor)) {
        dataset.pointBackgroundColor = dataset.pointBackgroundColor.map((c) => {
          const role = roleOf(c);
          return role ? (themeColor(palette, role) || c) : c;
        });
      }
      if (Array.isArray(dataset.pointBorderColor)) {
        dataset.pointBorderColor = dataset.pointBorderColor.map((c) => {
          const role = roleOf(c);
          return role ? (themeColor(palette, role) || c) : c;
        });
      }
    });
  }
  return config;
}

/** Recolore opções (grade, eixos, tooltip, legenda). */
function recolorOptions(options, palette) {
  if (!options) return options;
  const scales = options.scales || {};
  Object.keys(scales).forEach((key) => {
    const scale = scales[key] || {};
    if (scale.grid) scale.grid.color = withAlpha(palette.ink, 0.07);
    if (scale.ticks) scale.ticks.color = palette.soft;
  });
  const plugins = options.plugins || (options.plugins = {});
  if (plugins.tooltip) {
    plugins.tooltip.backgroundColor = palette.card;
    plugins.tooltip.borderColor = withAlpha(palette.accent, 0.4);
    plugins.tooltip.titleColor = palette.accent;
    plugins.tooltip.bodyColor = palette.ink;
  }
  if (plugins.legend && plugins.legend.labels) plugins.legend.labels.color = palette.ink;
  return options;
}

let installed = false;

/**
 * Instala o pincel de tema no Chart.js (uma vez). Chamado pelo App assim que o
 * tema está decidido. Também escuta a troca de tema para repintar os gráficos
 * já montados.
 */
export function installChartTheme(ChartJS) {
  if (!ChartJS || installed) return;
  installed = true;
  // é o módulo do Chart.js que já foi registrado pelos componentes; o src
  // pode expor funções diferentes conforme o bundler, então buscamos as duas.
  const register = ChartJS.register || (ChartJS.defaults && ChartJS.defaults.register);
  const palette = readPalette();

  // `beforeInit` roda uma vez por gráfico, antes de ele desenhar, e não é
  // chamado de novo por update() — perfeito para recolorar sem laço.
  register({ id: 'grimorioThemeBrush', beforeInit(chart) {
    try {
      recolorConfig(chart.config, palette);
      recolorOptions(chart.options, palette);
      if (chart.canvas) chart.canvas.style.background = palette.card;
    } catch {
      /* idem */
    }
  } });

  const repaint = () => {
    const next = readPalette();
    Object.assign(palette, next);
    Object.keys(ChartJS.instances || {}).forEach((id) => {
      const chart = ChartJS.instances[id];
      if (!chart) return;
      try {
        recolorOptions(chart.options, palette);
        if (chart.canvas) chart.canvas.style.background = palette.card;
        chart.update('none');
      } catch {
        /* idem */
      }
    });
  };
  window.addEventListener('grimorio:theme', repaint);
}
