/**
 * Fórmulas canônicas de recompensa — as mesmas que a interface HTTP já concede.
 * MCP e rotas chamam estas funções; não duplique a conta em outro lugar.
 */

export function readingSessionRewards({ pagesRead, finishedBook = false, quotesCount = 0 }) {
  const pages = Math.max(0, pagesRead || 0);
  const quotes = Math.max(0, quotesCount || 0);
  const xp = pages * 2 + (finishedBook ? 200 : 0) + quotes * 15;
  const coins = Math.max(5, Math.floor(pages / 3)) + (finishedBook ? 50 : 0) + quotes * 2;
  const wisdom = pages + (finishedBook ? 50 : 0) + quotes * 5;
  return { xp, coins, wisdom };
}

/** Citação avulsa (não embutida numa sessão de leitura). */
export function quoteRewards() {
  return { xp: 20, coins: 5, wisdom: 10 };
}

export function examQuestionRewards({ total, correct }) {
  const accuracyRate = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0;
  const accuracyBonusXp = accuracyRate === 100 ? 50 : accuracyRate >= 90 ? 30 : accuracyRate >= 80 ? 15 : 0;
  const xp = total * 3 + correct * 4 + accuracyBonusXp;
  const coins = Math.max(2, Math.floor(correct / 2)) + (accuracyRate >= 80 ? 5 : 0) + (accuracyRate === 100 ? 10 : 0);
  return {
    xp,
    coins,
    focus: total * 2,
    wisdom: correct * 2,
    consistency: 10,
    accuracyRate,
    wrong: total - correct
  };
}

/**
 * Passo de processo. O bônus de conclusão e o foco por unidade seguem o HTTP
 * (a interface é o que o herói já vinha recebendo). xp/coins por unidade vêm
 * do próprio processo; registros MCP antigos são migrados para 15/3.
 */
export function processStepRewards({ unitsAdded, finished = false, xpPerUnit = 20, coinsPerUnit = 5 }) {
  const units = Math.max(0, unitsAdded || 0);
  return {
    xp: units * xpPerUnit + (finished ? 100 : 0),
    coins: units * coinsPerUnit + (finished ? 30 : 0),
    focus: units * 10
  };
}

export function questRewards(quest, { willpowerForDifficulty }) {
  return {
    xp: quest?.xpReward || 0,
    coins: quest?.coinReward || 0,
    willpower: willpowerForDifficulty(quest?.difficulty),
    focus: 10
  };
}

export function habitRewards(habit, currentStreak) {
  const multiplier = Math.min(2.0, 1 + (currentStreak || 0) * 0.1);
  return {
    xp: Math.round((habit?.xpReward || 30) * multiplier),
    coins: habit?.coinReward || 8,
    consistency: 15,
    multiplier
  };
}
