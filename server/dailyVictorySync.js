import { rewardPlayer, revertPlayerReward } from './db.js';
import { getSaoPauloDateStr } from './timeUtils.js';
import { getReadingLoadSeries } from '../src/utils/homeostasis.js';
import { getAguStudyLoadSeries } from '../src/utils/aguCycle.js';
import {
  DAILY_VICTORY_REWARDS,
  DAILY_VICTORY_TRIPLE_BONUS,
  bonusEntityId,
  completeDailyVictory,
  planLinkedDailyVictoryUpdates,
  sanitizeDailyVictories,
  sanitizeDailyVictoryBonuses
} from '../src/utils/dailyVictories.js';

function settleDailyVictoryRewards(result) {
  if (!result || result.stateUnchanged) {
    return { ...result, rewardResult: null, bonusRewardResult: null };
  }

  let rewardResult = null;
  let bonusRewardResult = null;

  if (result.willComplete) {
    rewardResult = rewardPlayer({
      xp: DAILY_VICTORY_REWARDS.xp,
      coins: DAILY_VICTORY_REWARDS.coins,
      willpower: DAILY_VICTORY_REWARDS.willpower,
      actionType: 'daily_victory_complete',
      entityId: result.victory.id,
      title: result.victory.title,
      details: {
        category: result.victory.category,
        date: result.victory.date,
        note: result.victory.note || '',
        autoLinked: true
      }
    });
    if (result.bonusAwardedNow) {
      bonusRewardResult = rewardPlayer({
        xp: DAILY_VICTORY_TRIPLE_BONUS.xp,
        coins: DAILY_VICTORY_TRIPLE_BONUS.coins,
        willpower: DAILY_VICTORY_TRIPLE_BONUS.willpower,
        consistency: DAILY_VICTORY_TRIPLE_BONUS.consistency,
        actionType: 'daily_victory_triple_bonus',
        entityId: bonusEntityId(result.victory.date),
        title: `Tríade de vitórias — ${result.victory.date}`,
        details: {
          category: result.victory.category,
          date: result.victory.date,
          bonus: true,
          autoLinked: true
        }
      });
    }
  } else {
    rewardResult = revertPlayerReward({
      xp: DAILY_VICTORY_REWARDS.xp,
      coins: DAILY_VICTORY_REWARDS.coins,
      willpower: DAILY_VICTORY_REWARDS.willpower,
      actionType: 'daily_victory_complete',
      entityId: result.victory.id
    });
    if (result.bonusRevertedNow) {
      bonusRewardResult = revertPlayerReward({
        xp: DAILY_VICTORY_TRIPLE_BONUS.xp,
        coins: DAILY_VICTORY_TRIPLE_BONUS.coins,
        willpower: DAILY_VICTORY_TRIPLE_BONUS.willpower,
        consistency: DAILY_VICTORY_TRIPLE_BONUS.consistency,
        actionType: 'daily_victory_triple_bonus',
        entityId: bonusEntityId(result.victory.date)
      });
    }
  }

  return { ...result, rewardResult, bonusRewardResult };
}

function serializeLinkedResult(result) {
  if (!result || result.stateUnchanged) return null;
  return {
    victory: result.victory,
    willComplete: result.willComplete,
    bonusAwardedNow: result.bonusAwardedNow,
    bonusRevertedNow: result.bonusRevertedNow,
    rewardResult: result.rewardResult,
    bonusRewardResult: result.bonusRewardResult
  };
}

/**
 * Conclui/reabre vitórias planejadas ligadas a uma missão, leitura ou estudo AGU.
 * Mutates db.dailyVictories / db.dailyVictoryBonuses e aplica XP/moedas.
 */
export function syncDailyVictoriesFromActivity(db, {
  today = getSaoPauloDateStr(),
  questId,
  questCompleted,
  questNote,
  syncReading = false,
  syncStudy = false
} = {}) {
  const state = {
    list: sanitizeDailyVictories(db.dailyVictories),
    bonuses: sanitizeDailyVictoryBonuses(db.dailyVictoryBonuses)
  };
  const readingMinutes = syncReading
    ? (getReadingLoadSeries(db.readingSessions || [], today).today?.minutes || 0)
    : undefined;
  const studyMinutes = syncStudy
    ? (getAguStudyLoadSeries(db.aguPlan, db.examQuestions || [], today).today?.minutes || 0)
    : undefined;
  const updates = planLinkedDailyVictoryUpdates(state.list, {
    today,
    questId,
    questCompleted,
    questNote,
    readingMinutes,
    studyMinutes
  });

  const settled = [];
  updates.forEach((update) => {
    try {
      const result = completeDailyVictory(state.list, state.bonuses, update.id, {
        completed: update.completed,
        note: update.note,
        today
      });
      state.list = result.list;
      state.bonuses = result.bonuses;
      const serialized = serializeLinkedResult(settleDailyVictoryRewards(result));
      if (serialized) settled.push(serialized);
    } catch {
      // Vitória de outro dia ou estado inválido: ignora o vínculo.
    }
  });

  db.dailyVictories = state.list;
  db.dailyVictoryBonuses = state.bonuses;
  return settled;
}
