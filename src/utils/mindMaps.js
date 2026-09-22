/**
 * Mapas Mentais — criação, layout, revisão espaçada e recompensas de estudo.
 */

import { addDaysToDateStr, getSaoPauloDateStr } from './timeUtils.js';

export const MIND_MAP_NODE_COLORS = [
  '#f59e0b',
  '#a855f7',
  '#38bdf8',
  '#10b981',
  '#f43f5e',
  '#eab308',
  '#06b6d4',
  '#c084fc',
  '#fb7185',
  '#34d399'
];

export const STUDY_QUALITY = {
  forgot: 0,
  hard: 1,
  good: 2,
  easy: 3
};

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function uidMind(prefix = 'mm') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeDate(value, fallback = null) {
  if (typeof value === 'string' && DATE_ONLY_RE.test(value)) return value;
  return fallback;
}

export function colorForIndex(index = 0) {
  return MIND_MAP_NODE_COLORS[Math.abs(index) % MIND_MAP_NODE_COLORS.length];
}

export function createMindMapNode({
  id,
  parentId = null,
  label = 'Novo ramo',
  notes = '',
  color,
  x = 0,
  y = 0,
  collapsed = false,
  ease = 2.5,
  interval = 0,
  dueDate = null,
  reviews = 0,
  lapses = 0,
  lastReviewedAt = null
} = {}, siblingIndex = 0) {
  const trimmed = String(label || '').trim() || 'Novo ramo';
  return {
    id: id || uidMind('mn'),
    parentId: parentId || null,
    label: trimmed,
    notes: String(notes || '').trim(),
    color: color || colorForIndex(parentId ? siblingIndex + 1 : 0),
    x: clampNumber(x, 0),
    y: clampNumber(y, 0),
    collapsed: !!collapsed,
    ease: Math.max(1.3, clampNumber(ease, 2.5)),
    interval: Math.max(0, Math.round(clampNumber(interval, 0))),
    dueDate: sanitizeDate(dueDate, null),
    reviews: Math.max(0, Math.round(clampNumber(reviews, 0))),
    lapses: Math.max(0, Math.round(clampNumber(lapses, 0))),
    lastReviewedAt: lastReviewedAt || null
  };
}

export function createMindMap({
  title,
  description = '',
  category = 'Estudos',
  color,
  rootLabel
} = {}) {
  const now = new Date().toISOString();
  const trimmedTitle = String(title || '').trim();
  if (!trimmedTitle) {
    throw new Error('Informe um título para o mapa mental.');
  }

  const root = createMindMapNode({
    label: String(rootLabel || trimmedTitle).trim() || trimmedTitle,
    color: color || colorForIndex(0),
    x: 0,
    y: 0
  }, 0);

  return {
    id: uidMind('mm'),
    title: trimmedTitle,
    description: String(description || '').trim(),
    category: String(category || 'Estudos').trim() || 'Estudos',
    color: color || root.color,
    createdAt: now,
    updatedAt: now,
    lastStudiedAt: null,
    nodes: [root],
    rootId: root.id
  };
}

export function getRootNode(map) {
  if (!map?.nodes?.length) return null;
  return map.nodes.find(n => n.id === map.rootId) || map.nodes.find(n => !n.parentId) || map.nodes[0];
}

export function childrenOf(map, parentId) {
  return (map?.nodes || []).filter(n => n.parentId === parentId);
}

export function findNode(map, nodeId) {
  return (map?.nodes || []).find(n => n.id === nodeId) || null;
}

export function descendantIds(map, nodeId) {
  const ids = new Set();
  const walk = (id) => {
    childrenOf(map, id).forEach((child) => {
      ids.add(child.id);
      walk(child.id);
    });
  };
  walk(nodeId);
  return ids;
}

export function nodeDepth(map, nodeId) {
  let depth = 0;
  let current = findNode(map, nodeId);
  const seen = new Set();
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    depth += 1;
    current = findNode(map, current.parentId);
  }
  return depth;
}

export function nodePath(map, nodeId) {
  const path = [];
  let current = findNode(map, nodeId);
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? findNode(map, current.parentId) : null;
  }
  return path;
}

export function countBranches(map) {
  const nodes = map?.nodes || [];
  return Math.max(0, nodes.length - 1);
}

function defaultChildPosition(parent, siblingIndex, depth) {
  const dist = Math.max(150, 190 - depth * 12);
  const spread = Math.min(Math.PI * 0.9, (Math.PI / 5) * Math.max(1, siblingIndex + 1));
  const start = -spread / 2;
  const step = siblingIndex === 0 && spread === 0 ? 0 : spread / Math.max(siblingIndex, 1);
  const angle = siblingIndex === 0 ? 0 : start + step * siblingIndex;
  const facing = parent.parentId ? Math.atan2(parent.y, parent.x) : -Math.PI / 2;
  const theta = facing + angle;
  return {
    x: parent.x + Math.cos(theta) * dist,
    y: parent.y + Math.sin(theta) * dist
  };
}

export function addMindMapNode(map, { parentId, label, notes, color, x, y } = {}) {
  if (!map) throw new Error('Mapa mental não encontrado.');
  const parent = findNode(map, parentId || map.rootId);
  if (!parent) throw new Error('Ramo pai não encontrado.');
  const siblings = childrenOf(map, parent.id);
  const pos = (x != null && y != null)
    ? { x, y }
    : defaultChildPosition(parent, siblings.length, nodeDepth(map, parent.id) + 1);
  const node = createMindMapNode({
    parentId: parent.id,
    label,
    notes,
    color: color || colorForIndex(siblings.length + 1),
    x: pos.x,
    y: pos.y
  }, siblings.length);
  return {
    ...map,
    updatedAt: new Date().toISOString(),
    nodes: [...map.nodes, node]
  };
}

export function updateMindMapNode(map, nodeId, patch = {}) {
  if (!map) throw new Error('Mapa mental não encontrado.');
  const index = (map.nodes || []).findIndex(n => n.id === nodeId);
  if (index === -1) throw new Error('Ramo não encontrado.');
  const current = map.nodes[index];
  const next = { ...current };
  if (patch.label !== undefined) {
    const trimmed = String(patch.label || '').trim();
    if (!trimmed) throw new Error('O ramo precisa de um nome.');
    next.label = trimmed;
  }
  if (patch.notes !== undefined) next.notes = String(patch.notes || '').trim();
  if (patch.color !== undefined && patch.color) next.color = patch.color;
  if (patch.x !== undefined) next.x = clampNumber(patch.x, current.x);
  if (patch.y !== undefined) next.y = clampNumber(patch.y, current.y);
  if (patch.collapsed !== undefined) next.collapsed = !!patch.collapsed;
  const nodes = map.nodes.slice();
  nodes[index] = next;
  return {
    ...map,
    updatedAt: new Date().toISOString(),
    nodes
  };
}

export function deleteMindMapNode(map, nodeId) {
  if (!map) throw new Error('Mapa mental não encontrado.');
  const node = findNode(map, nodeId);
  if (!node) throw new Error('Ramo não encontrado.');
  const root = getRootNode(map);
  if (root && node.id === root.id) {
    throw new Error('O núcleo do mapa não pode ser excluído.');
  }
  const remove = new Set([node.id, ...descendantIds(map, node.id)]);
  return {
    ...map,
    updatedAt: new Date().toISOString(),
    nodes: map.nodes.filter(n => !remove.has(n.id))
  };
}

export function updateMindMapMeta(map, patch = {}) {
  if (!map) throw new Error('Mapa mental não encontrado.');
  const next = { ...map, updatedAt: new Date().toISOString() };
  if (patch.title !== undefined) {
    const trimmed = String(patch.title || '').trim();
    if (!trimmed) throw new Error('Informe um título para o mapa mental.');
    next.title = trimmed;
  }
  if (patch.description !== undefined) next.description = String(patch.description || '').trim();
  if (patch.category !== undefined) next.category = String(patch.category || 'Estudos').trim() || 'Estudos';
  if (patch.color !== undefined && patch.color) next.color = patch.color;
  if (patch.rootLabel !== undefined) {
    const root = getRootNode(next);
    if (root) {
      next.nodes = next.nodes.map((n) => (
        n.id === root.id
          ? { ...n, label: String(patch.rootLabel || '').trim() || n.label }
          : n
      ));
    }
  }
  return next;
}

export function layoutMindMap(map, { radius = 200 } = {}) {
  const nodes = (map?.nodes || []).map(n => ({ ...n }));
  const byParent = new Map();
  nodes.forEach((n) => {
    const key = n.parentId || '__root__';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(n);
  });
  const root = nodes.find(n => n.id === map.rootId) || nodes.find(n => !n.parentId);
  if (!root) return map;
  root.x = 0;
  root.y = 0;

  const place = (parent, startAngle, endAngle, dist) => {
    const children = byParent.get(parent.id) || [];
    if (!children.length) return;
    children.forEach((child, i) => {
      const slice = (endAngle - startAngle) / children.length;
      const t = children.length === 1
        ? (startAngle + endAngle) / 2
        : startAngle + slice * (i + 0.5);
      child.x = Math.round((parent.x + Math.cos(t) * dist) * 10) / 10;
      child.y = Math.round((parent.y + Math.sin(t) * dist) * 10) / 10;
      place(child, t - slice / 2, t + slice / 2, Math.max(130, dist * 0.82));
    });
  };

  place(root, -Math.PI, Math.PI, radius);
  return { ...map, updatedAt: new Date().toISOString(), nodes };
}

export function visibleNodeIds(map) {
  const hidden = new Set();
  (map?.nodes || []).forEach((node) => {
    if (node.collapsed) {
      descendantIds(map, node.id).forEach(id => hidden.add(id));
    }
  });
  return (map?.nodes || []).filter(n => !hidden.has(n.id));
}

export function isNodeDue(node, todayStr) {
  if (!node) return false;
  if (!node.dueDate) return true;
  return node.dueDate <= todayStr;
}

export function getStudyQueue(map, { today = getSaoPauloDateStr(), mode = 'branches', includeNotDue = false } = {}) {
  const root = getRootNode(map);
  if (!root) return [];

  if (mode === 'cards') {
    return (map.nodes || [])
      .filter(n => n.parentId)
      .filter(n => includeNotDue || isNodeDue(n, today))
      .map((node) => {
        const parent = findNode(map, node.parentId);
        return {
          id: node.id,
          mode: 'cards',
          promptId: parent?.id || root.id,
          prompt: parent?.label || root.label,
          answer: node.label,
          notes: node.notes || '',
          path: nodePath(map, node.id).map(n => n.label),
          due: isNodeDue(node, today)
        };
      });
  }

  return (map.nodes || [])
    .filter(n => childrenOf(map, n.id).length > 0)
    .filter(n => includeNotDue || isNodeDue(n, today))
    .map((node) => {
      const kids = childrenOf(map, node.id);
      return {
        id: node.id,
        mode: 'branches',
        promptId: node.id,
        prompt: node.label,
        answers: kids.map(k => k.label),
        notes: node.notes || '',
        path: nodePath(map, node.id).map(n => n.label),
        due: isNodeDue(node, today)
      };
    });
}

export function applyReviewToNode(node, quality, todayStr) {
  const q = Math.max(0, Math.min(3, Math.round(clampNumber(quality, 0))));
  const next = { ...node };
  next.reviews = (next.reviews || 0) + 1;
  next.lastReviewedAt = todayStr;

  if (q === 0) {
    next.lapses = (next.lapses || 0) + 1;
    next.interval = 0;
    next.ease = Math.max(1.3, (next.ease || 2.5) - 0.2);
    next.dueDate = todayStr;
    return next;
  }

  if (q === 1) {
    next.interval = 1;
    next.ease = Math.max(1.3, (next.ease || 2.5) - 0.05);
  } else if ((next.interval || 0) === 0) {
    next.interval = q === 3 ? 3 : 1;
  } else if (next.interval === 1) {
    next.interval = q === 3 ? 6 : 3;
  } else {
    const easeDelta = q === 3 ? 0.15 : 0.05;
    next.ease = Math.max(1.3, (next.ease || 2.5) + easeDelta);
    next.interval = Math.max(1, Math.round(next.interval * next.ease));
  }
  next.dueDate = addDaysToDateStr(todayStr, next.interval);
  return next;
}

export function computeStudyRewards({ reviewed = 0, recalled = 0, durationMinutes = 0 } = {}) {
  const safeReviewed = Math.max(0, reviewed);
  const safeRecalled = Math.max(0, Math.min(recalled, safeReviewed));
  const missed = safeReviewed - safeRecalled;
  const accuracy = safeReviewed > 0 ? Math.round((safeRecalled / safeReviewed) * 1000) / 10 : 0;
  const perfectBonus = safeReviewed >= 4 && safeRecalled === safeReviewed ? 25 : 0;
  const durationBonus = durationMinutes >= 20 ? 10 : durationMinutes >= 10 ? 5 : 0;
  const xp = safeRecalled * 8 + missed * 3 + perfectBonus + durationBonus;
  const coins = Math.max(1, Math.floor(safeRecalled / 2) + (accuracy >= 80 ? 3 : 0) + (accuracy === 100 && safeReviewed >= 4 ? 6 : 0));
  const wisdom = safeRecalled * 2 + Math.min(safeReviewed, 8);
  const focus = safeReviewed + Math.floor((durationMinutes || 0) / 5);
  return { xp, coins, wisdom, focus, accuracy, perfectBonus };
}

export function applyStudySession(map, reviews = [], {
  today = getSaoPauloDateStr(),
  durationMinutes = 0,
  mode = 'branches'
} = {}) {
  if (!map) throw new Error('Mapa mental não encontrado.');
  const list = Array.isArray(reviews) ? reviews : [];
  if (!list.length) throw new Error('Registre ao menos um ramo revisado.');

  const byId = new Map((map.nodes || []).map(n => [n.id, { ...n }]));
  let recalled = 0;
  const applied = [];

  list.forEach((review) => {
    const nodeId = review?.nodeId;
    const node = byId.get(nodeId);
    if (!node) return;
    const quality = Math.max(0, Math.min(3, Math.round(clampNumber(review.quality, 0))));
    byId.set(nodeId, applyReviewToNode(node, quality, today));
    if (quality >= 2) recalled += 1;
    applied.push({ nodeId, quality, label: node.label });
  });

  if (!applied.length) throw new Error('Nenhum ramo válido foi revisado.');

  const rewards = computeStudyRewards({
    reviewed: applied.length,
    recalled,
    durationMinutes
  });

  const nextMap = {
    ...map,
    updatedAt: new Date().toISOString(),
    lastStudiedAt: today,
    nodes: (map.nodes || []).map(n => byId.get(n.id) || n)
  };

  const session = {
    id: uidMind('ms'),
    mapId: map.id,
    mapTitle: map.title,
    category: map.category || 'Estudos',
    mode,
    date: today,
    durationMinutes: Math.max(0, Math.round(clampNumber(durationMinutes, 0))),
    reviewed: applied.length,
    recalled,
    accuracy: rewards.accuracy,
    xpEarned: rewards.xp,
    coinsEarned: rewards.coins,
    reviews: applied,
    timestamp: new Date().toISOString()
  };

  return { map: nextMap, session, rewards };
}

export function computeMapStats(map, { today = getSaoPauloDateStr() } = {}) {
  const nodes = map?.nodes || [];
  const branches = Math.max(0, nodes.length - 1);
  const withNotes = nodes.filter(n => n.notes).length;
  const reviewed = nodes.filter(n => (n.reviews || 0) > 0).length;
  const due = nodes.filter(n => n.parentId && isNodeDue(n, today)).length;
  const dueBranches = getStudyQueue(map, { today, mode: 'branches' }).length;
  const mastery = branches === 0 ? 0 : Math.round((reviewed / Math.max(branches, 1)) * 100);
  return {
    nodes: nodes.length,
    branches,
    withNotes,
    reviewed,
    due,
    dueBranches,
    mastery,
    lastStudiedAt: map?.lastStudiedAt || null
  };
}

export function sanitizeMindMap(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title || '').trim();
  if (!title) return null;
  let nodes = Array.isArray(raw.nodes) ? raw.nodes.map((node, index) => createMindMapNode(node, index)) : [];
  if (!nodes.length) {
    nodes = [createMindMapNode({ label: title, color: raw.color, x: 0, y: 0 }, 0)];
  }
  const ids = new Set(nodes.map(n => n.id));
  nodes = nodes.map((n) => {
    if (n.parentId && !ids.has(n.parentId)) return { ...n, parentId: null };
    return n;
  });
  let root = nodes.find(n => n.id === raw.rootId) || nodes.find(n => !n.parentId) || nodes[0];
  if (root.parentId) root = { ...root, parentId: null };
  nodes = nodes.map(n => (n.id === root.id ? { ...n, parentId: null } : n));
  const connected = new Set([root.id]);
  let grew = true;
  while (grew) {
    grew = false;
    nodes.forEach((n) => {
      if (!connected.has(n.id) && n.parentId && connected.has(n.parentId)) {
        connected.add(n.id);
        grew = true;
      }
    });
  }
  nodes = nodes.filter(n => connected.has(n.id));
  return {
    id: raw.id || uidMind('mm'),
    title,
    description: String(raw.description || '').trim(),
    category: String(raw.category || 'Estudos').trim() || 'Estudos',
    color: raw.color || root.color,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    lastStudiedAt: sanitizeDate(raw.lastStudiedAt, null),
    rootId: root.id,
    nodes
  };
}

export function sanitizeMindMaps(list = []) {
  return (Array.isArray(list) ? list : []).map(sanitizeMindMap).filter(Boolean);
}

export function sanitizeMindMapSessions(list = []) {
  return (Array.isArray(list) ? list : []).filter(s => s && s.id && s.mapId).map((s) => ({
    id: s.id,
    mapId: s.mapId,
    mapTitle: s.mapTitle || '',
    category: s.category || 'Estudos',
    mode: s.mode === 'cards' ? 'cards' : 'branches',
    date: sanitizeDate(s.date, null) || getSaoPauloDateStr(),
    durationMinutes: Math.max(0, Math.round(clampNumber(s.durationMinutes, 0))),
    reviewed: Math.max(0, Math.round(clampNumber(s.reviewed, 0))),
    recalled: Math.max(0, Math.round(clampNumber(s.recalled, 0))),
    accuracy: clampNumber(s.accuracy, 0),
    xpEarned: Math.max(0, Math.round(clampNumber(s.xpEarned, 0))),
    coinsEarned: Math.max(0, Math.round(clampNumber(s.coinsEarned, 0))),
    reviews: Array.isArray(s.reviews) ? s.reviews : [],
    timestamp: s.timestamp || new Date().toISOString()
  }));
}
