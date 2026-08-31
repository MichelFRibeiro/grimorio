export const LOCATION_IDS = ['anywhere', 'office', 'home', 'gym'];

export const LOCATIONS = [
  { id: 'anywhere', label: 'Qualquer lugar', emoji: '🌍', short: 'Qualquer' },
  { id: 'office', label: 'Escritório', emoji: '🏛️', short: 'Escritório' },
  { id: 'home', label: 'Casa', emoji: '🏠', short: 'Casa' },
  { id: 'gym', label: 'Academia', emoji: '🏋️', short: 'Academia' }
];

export function getLocationMeta(id, catalog = LOCATIONS) {
  return catalog.find(l => l.id === id) || catalog[0];
}

export function defaultLocationForCategory(categoryName, categories = []) {
  const cat = (categories || []).find(c => (typeof c === 'string' ? c : c.name) === categoryName);
  if (cat && typeof cat === 'object' && cat.defaultLocation) return cat.defaultLocation;
  const map = {
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
  return map[categoryName] || 'anywhere';
}

export function windowToFields(timeWindow) {
  if (!timeWindow) return { start: '', end: '' };
  return { start: timeWindow.start || '', end: timeWindow.end || '' };
}

export function fieldsToTimeWindow(start, end) {
  if (!start || !end) return null;
  return { start, end };
}
