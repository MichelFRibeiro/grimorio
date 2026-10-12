import { useEffect, useState } from 'react';

/**
 * Carrega um ícone Lucide pelo nome de exportação (BookOpen, CheckCircle2)
 * sem puxar a biblioteca inteira. O mapa de imports do Lucide só entra no
 * primeiro ícone; cada SVG continua sendo o seu próprio arquivo.
 */
let dynamicIconImports = null;
let importsPromise = null;
const iconCache = new Map();
const listeners = new Set();
let nameToFile = null;
let catalogPromise = null;

function toKebab(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function notify() {
  listeners.forEach((listener) => listener());
}

function imports() {
  if (!importsPromise) {
    importsPromise = import('lucide-react/dynamicIconImports').then((mod) => {
      dynamicIconImports = mod.default;
      return dynamicIconImports;
    });
  }
  return importsPromise;
}

function catalog() {
  if (!catalogPromise) {
    catalogPromise = import('./mindMapIconCatalog.js').then((mod) => {
      nameToFile = mod.MIND_MAP_ICON_NAME_TO_FILE;
      return nameToFile;
    });
  }
  return catalogPromise;
}

function remember(name, Icon) {
  if (!Icon) return null;
  iconCache.set(name, Icon);
  notify();
  return Icon;
}

export function loadMindMapIcon(name) {
  if (!name || iconCache.has(name)) return iconCache.get(name) || null;
  const known = dynamicIconImports;
  const pending = known
    ? resolveLoader(name, known)
    : imports().then((map) => resolveLoader(name, map));
  Promise.resolve(pending).then((mod) => {
    if (mod?.default) remember(name, mod.default);
  }).catch(() => null);
  return null;
}

function resolveLoader(name, importsMap) {
  const direct = importsMap[toKebab(name)];
  if (direct) return direct();
  if (!nameToFile) {
    return catalog().then((map) => {
      const file = map[name];
      const loader = file ? importsMap[file] : null;
      return loader ? loader() : null;
    });
  }
  const file = nameToFile[name];
  const loader = file ? importsMap[file] : null;
  return loader ? loader() : null;
}

export function useMindMapIcon(name) {
  const [, redraw] = useState(0);
  useEffect(() => {
    if (!name) return undefined;
    const listener = () => redraw((n) => n + 1);
    listeners.add(listener);
    loadMindMapIcon(name);
    return () => listeners.delete(listener);
  }, [name]);
  return name ? iconCache.get(name) || null : null;
}
