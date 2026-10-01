/** Comparação de rótulos: sem acento, em fronteira de palavra. */

export function foldAccents(value) {
  return String(value || '')
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
