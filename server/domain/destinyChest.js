/**
 * Baú do Destino — concessão. A tabela e a rolagem determinística vivem em
 * src/utils/destinyChest.js (mesma fonte usada pela interface).
 *
 * A semente impede reroll: o mesmo dia e o mesmo evento pagam sempre igual.
 *
 * 60% +10 moedas · 25% +25 moedas · 10% escudo de sequência · 4% +60 XP · 1% +150 moedas.
 */

import {
  CHEST_TABLE,
  CHEST_RARITIES,
  chestRarity,
  chestRewardText,
  chestSeed,
  hashSeed,
  rollDestinyChest
} from '../../src/utils/destinyChest.js';

export { CHEST_TABLE, CHEST_RARITIES, chestRarity, chestRewardText, chestSeed, hashSeed, rollDestinyChest };

/**
 * Concede o baú uma vez por dia+evento. rewardPlayer persiste o snapshot;
 * o registro do baú entra no banco vivo para o save seguinte não perdê-lo.
 *
 * Versão síncrona: recebe `getDb`/`rewardPlayer` injetados para poder rodar
 * dentro dos fluxos síncronos (vitórias ligadas à tríade) sem `await import`.
 */
export function grantDestinyChestSync({ getDb, rewardPlayer }, db, date, event, now = new Date()) {
  if (typeof getDb !== 'function' || typeof rewardPlayer !== 'function') {
    throw new Error('grantDestinyChestSync exige { getDb, rewardPlayer }.');
  }
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
    rarity: chestRarity(prize.id).key,
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

export async function grantDestinyChest(db, date, event, now = new Date()) {
  const { getDb, rewardPlayer } = await import('../db.js');
  return grantDestinyChestSync({ getDb, rewardPlayer }, db, date, event, now);
}

function maxShieldsOf(profile) {
  const consistency = Number(profile?.stats?.consistency) || 0;
  return Math.min(4, 2 + Math.floor(Math.max(0, consistency) / 250));
}
