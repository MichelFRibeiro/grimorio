/**
 * Lugares, janelas de execução e defaults de categoria
 * para o motor de Próxima Atividade.
 */

import { getSaoPauloHour, getSaoPauloDayOfWeek } from './timeUtils.js';

export const LOCATION_IDS = ['anywhere', 'office', 'home', 'gym'];

export const LOCATIONS = [
  { id: 'anywhere', label: 'Qualquer lugar', emoji: '🌍', short: 'Qualquer' },
  { id: 'office', label: 'Escritório', emoji: '🏛️', short: 'Escritório' },
  { id: 'home', label: 'Casa', emoji: '🏠', short: 'Casa' },
  { id: 'gym', label: 'Academia', emoji: '🏋️', short: 'Academia' }
];

const LOCATION_ALIASES = {
  anywhere: 'anywhere',
  qualquer: 'anywhere',
  'qualquer lugar': 'anywhere',
  all: 'anywhere',
  any: 'anywhere',
  office: 'office',
  escritorio: 'office',
  'escritório': 'office',
  trabalho: 'office',
  work: 'office',
  home: 'home',
  casa: 'home',
  gym: 'gym',
  academia: 'gym',
  treino: 'gym'
};

export const CATEGORY_DEFAULT_LOCATION = {
  INSS: 'office',
  Advocacia: 'office',
  Trabalho: 'office',
  Casa: 'home',
  Saúde: 'anywhere',
  Estudos: 'anywhere',
  Programação: 'anywhere',
  Pessoal: 'anywhere',
  Finanças: 'anywhere',
  Projetos: 'anywhere'
};

const TITLE_LOCATION_HINTS = [
  { re: /peticion|cnpj|banner|materiais|pab|sisref|audi[eê]ncia|e-?books?|imers[aã]o|safe|recurso/i, loc: 'office' },
  { re: /jardim|galinheiro|ra[cç][aã]o|cal[cç]ado/i, loc: 'home' },
  { re: /for[cç]a|p[eé]lvica|academia|treino|muscula[cç]/i, loc: 'gym' },
  { re: /creatina|kegel|ter[cç]o|leitura|pnl|comprar/i, loc: 'anywhere' }
];

export function normalizeLocation(value, fallback = 'anywhere') {
  if (value == null || value === '') return fallback;
  const key = String(value).trim().toLowerCase();
  return LOCATION_ALIASES[key] || (LOCATION_IDS.includes(key) ? key : fallback);
}

export function getLocationMeta(id) {
  const loc = normalizeLocation(id);
  return LOCATIONS.find(l => l.id === loc) || LOCATIONS[0];
}

export function defaultLocationForCategory(categoryName) {
  if (!categoryName) return 'anywhere';
  const exact = CATEGORY_DEFAULT_LOCATION[categoryName];
  if (exact) return exact;
  const lower = String(categoryName).trim().toLowerCase();
  const match = Object.entries(CATEGORY_DEFAULT_LOCATION).find(
    ([name]) => name.toLowerCase() === lower
  );
  return match ? match[1] : 'anywhere';
}

export function inferLocationFromTitle(title) {
  if (!title) return null;
  for (const hint of TITLE_LOCATION_HINTS) {
    if (hint.re.test(title)) return hint.loc;
  }
  return null;
}

export function resolveItemLocation(item = {}, categories = []) {
  if (item.location) return normalizeLocation(item.location);
  const fromTitle = inferLocationFromTitle(item.title);
  if (fromTitle) return fromTitle;
  const cat = (categories || []).find(c => c && c.name === item.category);
  if (cat?.defaultLocation) return normalizeLocation(cat.defaultLocation);
  return defaultLocationForCategory(item.category);
}

export function parseTimeToMinutes(hhmm) {
  if (hhmm == null || hhmm === '') return null;
  if (typeof hhmm === 'number' && Number.isFinite(hhmm)) {
    return Math.max(0, Math.min(1439, Math.round(hhmm)));
  }
  const m = String(hhmm).trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function formatMinutes(total) {
  const safe = ((total % 1440) + 1440) % 1440;
  const h = Math.floor(safe / 60);
  const min = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function sanitizeTimeWindow(tw) {
  if (!tw) return null;
  let startRaw = tw.start ?? tw.from ?? null;
  let endRaw = tw.end ?? tw.to ?? null;
  if (typeof tw === 'string') {
    const parts = tw.split(/[-–]| a /i).map(s => s.trim());
    if (parts.length === 2) {
      startRaw = parts[0];
      endRaw = parts[1];
    }
  }
  const start = parseTimeToMinutes(startRaw);
  const end = parseTimeToMinutes(endRaw);
  if (start == null || end == null) return null;
  if (start === end) return null;
  return { start: formatMinutes(start), end: formatMinutes(end) };
}

export function isNowInTimeWindow(timeWindow, nowMinutes, grace = 15) {
  if (!timeWindow) return true;
  const start = parseTimeToMinutes(timeWindow.start);
  const end = parseTimeToMinutes(timeWindow.end);
  if (start == null || end == null) return true;

  const n = ((nowMinutes % 1440) + 1440) % 1440;
  const startG = start - grace;
  const endG = end + grace;

  const inRange = (value, a, b) => {
    if (a <= b) return value >= a && value <= b;
    return value >= a || value <= b;
  };

  // Janela normal (ex: 08:00-12:00)
  if (start <= end) {
    const wrappedStart = startG < 0;
    const wrappedEnd = endG >= 1440;
    if (wrappedStart && wrappedEnd) return true;
    if (wrappedStart) return n >= (1440 + startG) || n <= endG;
    if (wrappedEnd) return n >= startG || n <= (endG - 1440);
    return n >= startG && n <= endG;
  }

  // Cruza meia-noite (ex: 21:00-06:00)
  return inRange(n, startG, endG);
}

export function locationMatches(itemLocation, contextLocation) {
  const item = normalizeLocation(itemLocation);
  const ctx = normalizeLocation(contextLocation);
  if (ctx === 'anywhere') return true;
  if (item === 'anywhere') return true;
  return item === ctx;
}

export function guessCurrentLocation(now = new Date(), { preferGym = false } = {}) {
  const hour = getSaoPauloHour(now);
  const dow = getSaoPauloDayOfWeek(now);
  const isWeekend = dow === 0 || dow === 6;
  if (isWeekend) {
    if (preferGym && hour >= 17 && hour < 21) return 'gym';
    return 'home';
  }
  if (hour >= 8 && hour < 17) return 'office';
  if (hour >= 17 && hour < 21) return preferGym ? 'gym' : 'home';
  return 'home';
}

export function applyActivityContext(target, payload = {}, categories = []) {
  if (!target) return target;
  if (payload.location !== undefined) {
    target.location = payload.location == null || payload.location === ''
      ? resolveItemLocation({ ...target, location: undefined }, categories)
      : normalizeLocation(payload.location);
  } else if (!target.location) {
    target.location = resolveItemLocation(target, categories);
  } else {
    target.location = normalizeLocation(target.location);
  }

  if (payload.timeWindow !== undefined) {
    target.timeWindow = sanitizeTimeWindow(payload.timeWindow);
  } else if (payload.timeWindowStart !== undefined || payload.timeWindowEnd !== undefined) {
    target.timeWindow = sanitizeTimeWindow({
      start: payload.timeWindowStart,
      end: payload.timeWindowEnd
    });
  } else if (target.timeWindow) {
    target.timeWindow = sanitizeTimeWindow(target.timeWindow);
  } else {
    target.timeWindow = null;
  }

  if (payload.estimatedMinutes !== undefined) {
    const n = parseInt(payload.estimatedMinutes, 10);
    target.estimatedMinutes = Number.isFinite(n) && n > 0 ? n : null;
  }

  return target;
}

export function applyLocationDefaults(db) {
  if (!db) return db;
  if (!db.userProfile) db.userProfile = {};

  if (db.userProfile.currentLocation) {
    db.userProfile.currentLocation = normalizeLocation(db.userProfile.currentLocation);
  }
  if (db.userProfile.locationManual == null) {
    db.userProfile.locationManual = !!db.userProfile.currentLocation;
  }

  const categories = db.questCategories || [];
  categories.forEach(cat => {
    if (!cat) return;
    if (!cat.defaultLocation) {
      cat.defaultLocation = defaultLocationForCategory(cat.name);
    } else {
      cat.defaultLocation = normalizeLocation(cat.defaultLocation);
    }
  });

  (db.quests || []).forEach(q => applyActivityContext(q, {}, categories));
  (db.habits || []).forEach(h => applyActivityContext(h, {}, categories));
  return db;
}
