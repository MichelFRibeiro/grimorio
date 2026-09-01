import {
  brlToCoins,
  formatBrl,
  normalizeBrl
} from '../src/utils/coinExchange.js';
import {
  getSaoPauloDateStr,
  getSaoPauloHour,
  getSaoPauloDayOfWeek
} from './timeUtils.js';

const uid = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

export function spendMoney(db, { amountBrl, item, notes } = {}) {
  const title = String(item || '').trim();
  if (!title) {
    return { error: 'Informe o que foi comprado.', status: 400 };
  }

  const amount = normalizeBrl(amountBrl);
  if (amount == null || amount <= 0) {
    return { error: 'Informe um valor em R$ maior que zero.', status: 400 };
  }

  const cost = brlToCoins(amount);
  if (cost < 1) {
    return { error: 'Valor mínimo é R$ 0,10 (1 moeda de ouro).', status: 400 };
  }

  if (!db.userProfile) {
    return { error: 'Perfil do herói não encontrado.', status: 500 };
  }

  const userCoins = db.userProfile.coins || 0;
  if (userCoins < cost) {
    return {
      error: `Moedas insuficientes! Você tem 🪙 ${userCoins} e precisa de 🪙 ${cost} para gastar ${formatBrl(amount)}.`,
      status: 400
    };
  }

  db.userProfile.coins = userCoins - cost;

  const redemption = {
    id: uid('red'),
    kind: 'money',
    rewardId: null,
    rewardTitle: title,
    cost,
    costCoins: cost,
    amountBrl: amount,
    notes: String(notes || '').trim(),
    timestamp: new Date().toISOString()
  };

  if (!db.rewardRedemptions) db.rewardRedemptions = [];
  db.rewardRedemptions.unshift(redemption);

  if (!db.actionLogs) db.actionLogs = [];
  db.actionLogs.unshift({
    id: uid('log'),
    type: 'money_spend',
    entityId: redemption.id,
    title: `Gastou ${formatBrl(amount)}: ${title}`,
    xp: 0,
    coins: -cost,
    details: { cost, amountBrl: amount, item: title },
    timestamp: new Date().toISOString(),
    hour: getSaoPauloHour(),
    dayOfWeek: getSaoPauloDayOfWeek(),
    date: getSaoPauloDateStr()
  });

  return {
    success: true,
    redemption,
    userProfile: db.userProfile
  };
}

export function refundCoinsFromRedemption(redemption) {
  return redemption?.costCoins ?? redemption?.cost ?? 0;
}
