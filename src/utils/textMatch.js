/** Comparação de rótulos: sem acento, em fronteira de palavra. */

const FOLD_CACHE_MAX = 4096;
const foldCache = new Map();

export function foldAccents(value) {
  if (!value) return '';
  if (typeof value === 'string') {
    const cached = foldCache.get(value);
    if (cached !== undefined) return cached;
    const folded = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
    if (foldCache.size >= FOLD_CACHE_MAX) foldCache.clear();
    foldCache.set(value, folded);
    return folded;
  }
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function wordBoundaryIncludes(haystack, needle) {
  const hay = foldAccents(haystack);
  const pin = foldAccents(needle);
  if (!hay || !pin) return false;
  return ` ${hay} `.includes(` ${pin} `);
}
