/**
 * Câmbio da Taverna: R$ 1,00 = 10 moedas de ouro.
 */

export const COINS_PER_BRL = 10;

export function parseBrlAmount(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  let raw = String(value).trim();
  if (!raw) return null;

  raw = raw.replace(/R\$\s?/gi, '').replace(/\s/g, '');

  if (raw.includes(',') && raw.includes('.')) {
    const lastComma = raw.lastIndexOf(',');
    const lastDot = raw.lastIndexOf('.');
    if (lastComma > lastDot) {
      raw = raw.replace(/\./g, '').replace(',', '.');
    } else {
      raw = raw.replace(/,/g, '');
    }
  } else if (raw.includes(',')) {
    raw = raw.replace(',', '.');
  }

  const amount = Number(raw);
  return Number.isFinite(amount) ? amount : null;
}

export function normalizeBrl(value) {
  const amount = typeof value === 'number' ? value : parseBrlAmount(value);
  if (amount == null) return null;
  return Math.round(amount * 100) / 100;
}

export function brlToCoins(amountBrl) {
  const amount = typeof amountBrl === 'number' ? amountBrl : parseBrlAmount(amountBrl);
  if (amount == null || amount <= 0) return 0;
  return Math.round(amount * COINS_PER_BRL);
}

export function coinsToBrl(coins) {
  const value = Number(coins);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value) / COINS_PER_BRL;
}

export function formatBrl(amount) {
  const value = typeof amount === 'number' ? amount : parseBrlAmount(amount);
  return (value == null ? 0 : value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}
