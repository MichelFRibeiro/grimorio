/**
 * Temas visuais do Grimório.
 *
 * A escolha do herói fica no perfil (`userProfile.theme`) para acompanhar a
 * conta em qualquer aparelho, com um espelho em localStorage para o primeiro
 * desenho da página não "piscar" no tema errado (ver o script inline do
 * index.html). Trocar de tema é só trocar `data-theme` no <html>: as quatro
 * folhas de estilo vivem no mesmo bundle e cada uma se declara com
 * `html[data-theme="..."] { ... }`, então a troca é instantânea.
 */
import { useSyncExternalStore } from 'react';

export const THEME_STORAGE_KEY = 'grimorio_theme';

/** Tokens normalizados que cada tema publica (ver skin.css de cada tema). */
const TOKENS = {
  scheme: 1, paper: 1, card: 1, ink: 1, soft: 1, accent: 1, 'accent-2': 1,
  rule: 1, shadow: 1, ok: 1, alert: 1, warm: 1, muted: 1
};

/** Tema antigo (papel creme + carimbo terracota). É o padrão de quem nunca escolheu. */
export const LEGACY_THEME_ID = 'claro';

export const THEMES = [
  {
    id: LEGACY_THEME_ID,
    label: 'Catálogo',
    subtitle: 'O tema de hoje',
    description: 'Papel creme, serifa pesada e carimbo terracota. É o visual atual do Grimório.',
    dark: false,
    colors: ['#fbf7ee', '#f6f1e4', '#2a2118', '#b0380b']
  },
  {
    id: 'lousa',
    label: 'Lousa de Giz',
    subtitle: 'Escuro e calmo',
    description: 'Lousa verde-escura, giz branco e amarelo, serifa de contorno. Um grimório sombrio sem brilho neon.',
    dark: true,
    colors: ['#26362f', '#22302b', '#eef1e8', '#f0e3a5', '#9ad9cf']
  },
  {
    id: 'atlas',
    label: 'Atlas Botânico',
    subtitle: 'Claro e de leitura',
    description: 'Papel de algodão, tinta vegetal, sálvia e ocre. O caderno de história natural do Grimório.',
    dark: false,
    colors: ['#fdfbf5', '#f4f1e6', '#2c3527', '#47705a', '#a8742b']
  },
  {
    id: 'terminal',
    label: 'Terminal de Estudo',
    subtitle: 'Escuro e focado',
    description: 'Grafite profundo, fosforescência âmbar e ciano, tudo monoespaçado. O Grimório como instrumento de foco.',
    dark: true,
    colors: ['#151a21', '#0f1318', '#dbe2ea', '#ffc861', '#5fe3d0']
  }
];

const THEME_IDS = THEMES.map((theme) => theme.id);

/**
 * Um id qualquer que não seja um tema conhecido volta ao tema antigo. Bancos
 * antigos guardam tema em inglês ('dark-fantasy'), de antes de existir escolha.
 */
export function normalizeTheme(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  return THEME_IDS.includes(id) ? id : LEGACY_THEME_ID;
}

export function getTheme(id) {
  const safe = normalizeTheme(id);
  return THEMES.find((theme) => theme.id === safe) || THEMES[0];
}

export function readStoredTheme() {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored ? normalizeTheme(stored) : null;
  } catch {
    return null;
  }
}

function writeStoredTheme(id) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    /* modo privado: sem espelho local, o perfil continua mandando */
  }
}

let currentTheme = (() => {
  if (typeof window === 'undefined') return LEGACY_THEME_ID;
  const attr = document.documentElement?.getAttribute('data-theme');
  return normalizeTheme(readStoredTheme() || attr);
})();

const listeners = new Set();

export function getCurrentTheme() {
  return currentTheme;
}

export function subscribeTheme(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Aplica o tema no <html> e escreve o espelho local. */
export function applyTheme(id, { persistLocal = true } = {}) {
  const safe = normalizeTheme(id);
  const theme = getTheme(safe);
  const root = document.documentElement;
  if (root) {
    root.setAttribute('data-theme', safe);
    // `color-scheme` decide a cor das barras de rolagem, dos campos nativos e
    // do fundo antes de o CSS pintar: sem ele, rolar no escuro pisca branco.
    root.style.colorScheme = theme.dark ? 'dark' : 'light';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme.colors[0]);
  }
  if (persistLocal) writeStoredTheme(safe);
  // o gráfico lê o valor real dos tokens; repassa para quem está ouvindo
  // (evento síncrono, para repintar antes de qualquer recálculo de layout).
  if (typeof window !== 'undefined') {
    window.__GRIMORIO_THEME__ = {
      id: safe,
      dark: theme.dark,
      tokens: readThemeTokens()
    };
  }
  if (safe !== currentTheme) {
    currentTheme = safe;
    listeners.forEach((listener) => listener());
  }
  return safe;
}

const TOKEN_CACHE = {};

/** Valores resolvidos dos tokens --tpl-* do tema em vigor. */
export function readThemeTokens() {
  if (typeof window === 'undefined') return TOKEN_CACHE;
  const styles = window.getComputedStyle(document.documentElement);
  for (const name of Object.keys(TOKENS)) {
    TOKEN_CACHE[name] = styles.getPropertyValue(`--tpl-${name}`).trim();
  }
  return { ...TOKEN_CACHE };
}

/** Hook: tema em vigor + função para trocar (a persistência no perfil fica com o App). */
export function useTheme() {
  const theme = useSyncExternalStore(subscribeTheme, getCurrentTheme, getCurrentTheme);
  return { theme, setTheme: applyTheme, info: getTheme(theme) };
}
