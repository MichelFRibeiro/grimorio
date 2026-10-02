/**
 * Baú do Destino — tabela e rolagem determinística, compartilhadas entre
 * servidor e interface. A semente (`data:evento`) impede reroll: o mesmo dia
 * e o mesmo evento pagam sempre o mesmo prêmio.
 *
 * 60% +10 moedas · 25% +25 moedas · 10% escudo de sequência · 4% +60 XP · 1% +150 moedas.
 */

export const CHEST_TABLE = [
  { id: 'coins-10', weight: 60, coins: 10, xp: 0, shield: false, label: '+10 moedas' },
  { id: 'coins-25', weight: 25, coins: 25, xp: 0, shield: false, label: '+25 moedas' },
  { id: 'shield', weight: 10, coins: 0, xp: 0, shield: true, label: 'Escudo de sequência' },
  { id: 'xp-60', weight: 4, coins: 0, xp: 60, shield: false, label: '+60 XP' },
  { id: 'jackpot', weight: 1, coins: 150, xp: 0, shield: false, label: 'Fragmento do título · +150 moedas' }
];

/** Rótulo de raridade e chance de cada prêmio (o mesmo peso da tabela acima). */
export const CHEST_RARITIES = {
  'coins-10': { key: 'comum', label: 'Comum', chance: 60 },
  'coins-25': { key: 'incomum', label: 'Incomum', chance: 25 },
  shield: { key: 'raro', label: 'Raro', chance: 10 },
  'xp-60': { key: 'epico', label: 'Épico', chance: 4 },
  jackpot: { key: 'lendario', label: 'Lendário', chance: 1 }
};

const FALLBACK_RARITY = CHEST_RARITIES['coins-10'];

export function chestRarity(prizeId) {
  return CHEST_RARITIES[prizeId] || FALLBACK_RARITY;
}

export function hashSeed(input) {
  const text = String(input || '');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function rollDestinyChest(seed) {
  const roll = hashSeed(seed) % 100;
  let cursor = 0;
  for (const prize of CHEST_TABLE) {
    cursor += prize.weight;
    if (roll < cursor) return { ...prize, roll, seed: String(seed) };
  }
  return { ...CHEST_TABLE[0], roll, seed: String(seed) };
}

export function chestSeed(date, event) {
  return `${date}:${event}`;
}

/**
 * Texto da recompensa mostrado no reveal. Usa o rótulo gravado no baú e cai
 * para os números quando o registro veio de uma versão anterior.
 */
export function chestRewardText(chest) {
  if (!chest) return '';
  if (chest.label) return chest.label;
  const parts = [];
  if (Number(chest.coins) > 0) parts.push(`+${Number(chest.coins)} moedas`);
  if (Number(chest.xp) > 0) parts.push(`+${Number(chest.xp)} XP`);
  if (chest.shield) parts.push('Escudo de sequência');
  return parts.join(' · ') || 'Recompensa do Destino';
}

/**
 * Normaliza o payload do servidor. Aceita o baú cru, `{ chest }` ou o
 * resultado aninhado que o domínio devolve (`{ chest: { chest } }`).
 */
export function normalizeChestPayload(payload) {
  if (!payload) return null;
  let raw = payload;
  for (let depth = 0; depth < 3; depth += 1) {
    if (!raw || typeof raw !== 'object' || raw.prizeId || !raw.chest) break;
    raw = raw.chest;
  }
  if (!raw || typeof raw !== 'object' || !raw.prizeId) return null;
  return {
    id: raw.id || `chest-${raw.seed || raw.prizeId}`,
    seed: raw.seed || '',
    date: raw.date || '',
    event: raw.event || '',
    prizeId: raw.prizeId,
    label: chestRewardText(raw),
    coins: Number(raw.coins) || 0,
    xp: Number(raw.xp) || 0,
    shield: Boolean(raw.shield),
    rarity: chestRarity(raw.prizeId)
  };
}
