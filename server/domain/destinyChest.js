/**
 * Baú do Destino — recompensa variável, determinística por dia + evento.
 * A semente impede reroll: o mesmo dia e o mesmo evento pagam sempre igual.
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
 * Concede o baú uma vez por dia+evento. rewardPlayer persiste o snapshot;
 * o registro do baú entra no banco vivo para o save seguinte não perdê-lo.
 */
export async function grantDestinyChest(db, date, event, now = new Date()) {
  const { getDb, rewardPlayer } = await import('../db.js');
  const live = getDb();
  if (!Array.isArray(live.destinyChests)) live.destinyChests = [];
  const seed = chestSeed(date, event);
  if (live.destinyChests.some((item) => item && item.seed === seed)) return null;
  const prize = rollDestinyChest(seed);
  const profile = live.userProfile;
  let shieldGranted = 0;
  if (prize.shield && profile) {
    const cap = maxShieldsOf(profile);
    const before = Math.max(0, Number(profile.streakShields) || 0);
    if (before < cap) shieldGranted = 1;
  }
  const reward = rewardPlayer({
    xp: prize.xp,
    coins: prize.coins,
    actionType: 'destiny_chest',
    entityId: `chest-${seed}`,
    title: `Baú do Destino — ${prize.label}`,
    details: { seed, event, date, prizeId: prize.id },
    grantShield: shieldGranted,
    damageBoss: false
  });
  const persisted = getDb();
  if (!Array.isArray(persisted.destinyChests)) persisted.destinyChests = [];
  const chest = {
    id: `chest-${seed}`,
    seed,
    date,
    event,
    prizeId: prize.id,
    label: prize.label,
    roll: prize.roll,
    xp: prize.xp,
    coins: prize.coins,
    shield: shieldGranted > 0,
    rewardLogId: reward.logEntry?.id || null,
    createdAt: now.toISOString()
  };
  persisted.destinyChests.unshift(chest);
  if (db && db !== persisted && Array.isArray(db.destinyChests)) {
    db.destinyChests.unshift(chest);
  }
  return { chest, rewardResult: reward };
}

function maxShieldsOf(profile) {
  const consistency = Number(profile?.stats?.consistency) || 0;
  return Math.min(4, 2 + Math.floor(Math.max(0, consistency) / 250));
}
