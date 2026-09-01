/**
 * Escalas de Prioridade e Dificuldade compartilhadas entre
 * missões, rituais, API, MCP e o Oráculo.
 */

export const DIFFICULTY_KEYS = ['baixa', 'media', 'alta', 'epica'];
export const PRIORITY_KEYS = ['dispensavel', 'opcional', 'bom_fazer', 'importante', 'critico'];

export const DEFAULT_DIFFICULTY = 'media';
export const DEFAULT_PRIORITY = 'importante';

export const DIFFICULTY_REWARDS = {
  baixa: {
    xpReward: 20,
    coinReward: 5,
    level: 1,
    label: 'Baixa',
    optionLabel: 'Baixa (+20 XP, 5 🪙)'
  },
  media: {
    xpReward: 45,
    coinReward: 12,
    level: 2,
    label: 'Média',
    optionLabel: 'Média (+45 XP, 12 🪙)'
  },
  alta: {
    xpReward: 80,
    coinReward: 25,
    level: 3,
    label: 'Alta',
    optionLabel: 'Alta (+80 XP, 25 🪙)'
  },
  epica: {
    xpReward: 150,
    coinReward: 50,
    level: 4,
    label: 'Épica / Boss',
    optionLabel: 'Épica / Boss (+150 XP, 50 🪙)'
  }
};

export const PRIORITY_META = {
  dispensavel: {
    key: 'dispensavel',
    label: 'Dispensável',
    shortLabel: 'DISPENSÁVEL',
    rank: 1,
    score: 2,
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.12)',
    border: 'rgba(148, 163, 184, 0.3)'
  },
  opcional: {
    key: 'opcional',
    label: 'Opcional',
    shortLabel: 'OPCIONAL',
    rank: 2,
    score: 6,
    color: '#7dd3fc',
    bg: 'rgba(56, 189, 248, 0.12)',
    border: 'rgba(56, 189, 248, 0.3)'
  },
  bom_fazer: {
    key: 'bom_fazer',
    label: 'Bom fazer',
    shortLabel: 'BOM FAZER',
    rank: 3,
    score: 12,
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.15)',
    border: 'rgba(56, 189, 248, 0.4)'
  },
  importante: {
    key: 'importante',
    label: 'Importante',
    shortLabel: 'IMPORTANTE',
    rank: 4,
    score: 18,
    color: '#fbbf24',
    bg: 'rgba(245, 158, 11, 0.15)',
    border: 'rgba(245, 158, 11, 0.4)'
  },
  critico: {
    key: 'critico',
    label: 'Crítico',
    shortLabel: 'CRÍTICO',
    rank: 5,
    score: 26,
    color: '#f87171',
    bg: 'rgba(244, 63, 94, 0.16)',
    border: 'rgba(244, 63, 94, 0.45)'
  }
};

const LEVEL_TO_DIFFICULTY = {
  1: 'baixa',
  2: 'media',
  3: 'alta',
  4: 'epica'
};

export function isDifficultyKey(value) {
  return DIFFICULTY_KEYS.includes(value);
}

export function isPriorityKey(value) {
  return PRIORITY_KEYS.includes(value);
}

export function normalizeDifficulty(value, fallback = DEFAULT_DIFFICULTY) {
  if (isDifficultyKey(value)) return value;
  if (typeof value === 'number' && LEVEL_TO_DIFFICULTY[value]) {
    return LEVEL_TO_DIFFICULTY[value];
  }
  return fallback;
}

export function normalizePriority(value, fallback = DEFAULT_PRIORITY) {
  if (isPriorityKey(value)) return value;
  return fallback;
}

export function getDifficultyMeta(value) {
  return DIFFICULTY_REWARDS[normalizeDifficulty(value)];
}

export function getPriorityMeta(value) {
  return PRIORITY_META[normalizePriority(value)];
}

export function applyDifficultyFields(target, difficultyKey) {
  const key = normalizeDifficulty(difficultyKey);
  const rewards = DIFFICULTY_REWARDS[key];
  if (!target || typeof target !== 'object') return target;
  target.difficulty = key;
  target.xpReward = rewards.xpReward;
  target.coinReward = rewards.coinReward;
  return target;
}

export function inferDifficultyFromRewards(xpReward, fallback = DEFAULT_DIFFICULTY) {
  const xp = Number(xpReward);
  if (!Number.isFinite(xp)) return fallback;
  for (const key of DIFFICULTY_KEYS) {
    if (DIFFICULTY_REWARDS[key].xpReward === xp) return key;
  }
  return fallback;
}

export function willpowerForDifficulty(difficulty) {
  const key = normalizeDifficulty(difficulty);
  if (key === 'epica') return 25;
  if (key === 'alta') return 15;
  return 5;
}

/**
 * Interpreta o payload de criação/edição.
 * Compatível com o modelo legado em que `priority` era a dificuldade
 * (baixa/media/alta/epica).
 *
 * `input` deve conter apenas campos enviados pelo cliente.
 * `existing` é o item persistido (em updates) e preserva o que não veio no payload.
 */
export function resolveActivityScale(input = {}, existing = {}) {
  const { priority, difficulty } = input;
  const priorityProvided = Object.prototype.hasOwnProperty.call(input, 'priority') && priority !== undefined;
  const difficultyProvided = Object.prototype.hasOwnProperty.call(input, 'difficulty')
    && difficulty !== undefined
    && difficulty !== null
    && difficulty !== '';

  const hasNewPriority = isPriorityKey(priority);
  const priorityIsLegacyDifficulty = isDifficultyKey(priority);

  let nextDifficulty;
  if (difficultyProvided) {
    nextDifficulty = normalizeDifficulty(difficulty);
  } else if (priorityIsLegacyDifficulty) {
    nextDifficulty = priority;
  } else if (existing.difficulty != null && existing.difficulty !== '') {
    nextDifficulty = normalizeDifficulty(existing.difficulty);
  } else {
    nextDifficulty = DEFAULT_DIFFICULTY;
  }

  let nextPriority;
  if (hasNewPriority) {
    nextPriority = priority;
  } else if (priorityProvided && priorityIsLegacyDifficulty) {
    nextPriority = isPriorityKey(existing.priority) ? existing.priority : DEFAULT_PRIORITY;
  } else if (isPriorityKey(existing.priority) && !priorityProvided) {
    nextPriority = existing.priority;
  } else if (isPriorityKey(existing.priority) && !hasNewPriority) {
    nextPriority = existing.priority;
  } else {
    nextPriority = DEFAULT_PRIORITY;
  }

  return { priority: nextPriority, difficulty: nextDifficulty };
}

/**
 * Migra um item persistido (missão ou hábito) para o modelo atual:
 * - priority: dispensavel → critico
 * - difficulty: baixa | media | alta | epica
 */
export function migrateActivityScale(item, { syncRewards = false } = {}) {
  if (!item || typeof item !== 'object') return item;

  const priorityIsLegacyDifficulty = isDifficultyKey(item.priority);

  if (!isDifficultyKey(item.difficulty)) {
    if (typeof item.difficulty === 'number') {
      item.difficulty = normalizeDifficulty(item.difficulty);
    } else if (priorityIsLegacyDifficulty) {
      item.difficulty = item.priority;
    } else if (item.xpReward !== undefined) {
      item.difficulty = inferDifficultyFromRewards(item.xpReward);
    } else {
      item.difficulty = DEFAULT_DIFFICULTY;
    }
  }

  if (!isPriorityKey(item.priority)) {
    item.priority = DEFAULT_PRIORITY;
  }

  if (syncRewards) {
    applyDifficultyFields(item, item.difficulty);
  }

  return item;
}
