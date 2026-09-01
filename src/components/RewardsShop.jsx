import React, { useMemo, useState } from 'react';
import { Plus, Gift, Coins, Check, Trash2, History, Coffee, Tv, Gamepad2, Sparkles, Heart, RotateCcw, Banknote } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { brlToCoins, coinsToBrl, formatBrl, parseBrlAmount } from '../utils/coinExchange.js';

export function RewardsShop({ rewards, userProfile, redemptions, onAddReward, onSpendMoney, onRedeemReward, onCancelRedemption, onDeleteReward }) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSpendModal, setShowSpendModal] = useState(false);
  const [cancelModalRedemption, setCancelModalRedemption] = useState(null);

  // Confirm Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    confirmVariant: 'warning',
    icon: null,
    onConfirm: null
  });

  const closeConfirmModal = () => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
  };

  const promptDeleteReward = (reward) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Recompensa',
      message: `Deseja realmente excluir a recompensa "${reward.title}" da Taverna?`,
      confirmText: 'Sim, Excluir Recompensa',
      cancelText: 'Cancelar',
      confirmVariant: 'danger',
      icon: Trash2,
      onConfirm: () => {
        if (onDeleteReward) onDeleteReward(reward.id);
        closeConfirmModal();
      }
    });
  };

  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCost, setNewCost] = useState('30');
  const [newIcon, setNewIcon] = useState('Gift');
  const [spendAmount, setSpendAmount] = useState('');
  const [spendItem, setSpendItem] = useState('');
  const [spendSubmitting, setSpendSubmitting] = useState(false);

  const coins = userProfile?.coins || 0;
  const walletBrl = coinsToBrl(coins);
  const parsedSpendAmount = parseBrlAmount(spendAmount);
  const spendCoins = parsedSpendAmount != null && parsedSpendAmount > 0 ? brlToCoins(parsedSpendAmount) : 0;
  const canAffordSpend = spendCoins > 0 && coins >= spendCoins;

  const handleCreateReward = (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newCost) return;

    onAddReward({
      title: newTitle.trim(),
      description: newDesc.trim(),
      cost: parseInt(newCost, 10),
      icon: newIcon,
      category: 'custom'
    });

    setNewTitle('');
    setNewDesc('');
    setNewCost('30');
    setShowAddModal(false);
  };

  const handleSpendMoney = async (e) => {
    e.preventDefault();
    if (!spendItem.trim() || !canAffordSpend || spendSubmitting || !onSpendMoney) return;

    setSpendSubmitting(true);
    const result = await onSpendMoney({
      amountBrl: parsedSpendAmount,
      item: spendItem.trim()
    });
    setSpendSubmitting(false);

    if (result?.success) {
      setSpendAmount('');
      setSpendItem('');
      setShowSpendModal(false);
    }
  };

  const redemptionCost = (red) => red?.costCoins ?? red?.cost ?? 0;
  const moneySpentTotal = useMemo(() => (
    (redemptions || [])
      .filter(red => red.kind === 'money')
      .reduce((sum, red) => sum + (Number(red.amountBrl) || 0), 0)
  ), [redemptions]);

  const getRewardIcon = (iconName) => {
    switch (iconName) {
      case 'Coffee': return <Coffee size={22} color="#fbbf24" />;
      case 'Tv': return <Tv size={22} color="#38bdf8" />;
      case 'Gamepad2': return <Gamepad2 size={22} color="#c084fc" />;
      case 'Heart': return <Heart size={22} color="#f43f5e" />;
      case 'Gift':
      default:
        return <Gift size={22} color="#fbbf24" />;
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🍻</span> A Taverna & Loja de Recompensas
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Troque suas moedas de ouro por pausas, lazer e dinheiro real. Câmbio: R$ 1,00 = 10 🪙
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '12px',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.4)'
            }}
          >
            <Coins size={20} color="#fbbf24" />
            <div>
              <span style={{ color: '#fbbf24', fontWeight: 800, fontSize: '1.05rem', fontFamily: 'var(--font-mono)', display: 'block', lineHeight: 1.1 }}>
                {coins} Moedas
              </span>
              <span style={{ color: '#86efac', fontSize: '0.72rem', fontWeight: 700 }}>
                ≈ {formatBrl(walletBrl)}
              </span>
            </div>
          </div>

          {onSpendMoney && (
            <button
              onClick={() => setShowSpendModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#022c22',
                fontWeight: 800,
                fontSize: '0.9rem',
                border: 'none',
                cursor: 'pointer',
                boxShadow: '0 4px 15px rgba(16, 185, 129, 0.35)',
                transition: 'transform 0.15s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
              onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
            >
              <Banknote size={18} /> Registrar Gasto em R$
            </button>
          )}

          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#000',
              fontWeight: 800,
              fontSize: '0.9rem',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(245, 158, 11, 0.35)',
              transition: 'transform 0.15s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <Plus size={18} /> Nova Recompensa
          </button>
        </div>
      </div>

      {/* Rewards Grid */}
      {(!rewards || rewards.length === 0) ? (
        <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
          <Gift size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
          <p style={{ fontSize: '1rem', fontWeight: 600 }}>Nenhuma recompensa cadastrada na Taverna.</p>
          <p style={{ fontSize: '0.85rem' }}>Crie recompensas prazerosas da sua rotina para se motivar!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 240px), 1fr))', gap: '18px', marginBottom: '32px' }}>
          {rewards.map(reward => {
            const canAfford = coins >= reward.cost;

            return (
              <div
                key={reward.id}
                className="rpg-card"
                style={{
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '16px',
                  border: canAfford ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' }}>
                    <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                      {getRewardIcon(reward.icon)}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 10px',
                          borderRadius: '8px',
                          background: 'rgba(245, 158, 11, 0.15)',
                          color: '#fbbf24',
                          fontWeight: 800,
                          fontSize: '0.9rem',
                          fontFamily: 'var(--font-mono)'
                        }}
                      >
                        <Coins size={14} /> {reward.cost}
                      </div>

                      <button
                        onClick={() => promptDeleteReward(reward)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          padding: '4px'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.color = '#f87171'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#64748b'}
                        title="Excluir recompensa"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>

                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc', marginBottom: '4px' }}>
                    {reward.title}
                  </h3>

                  {reward.description && (
                    <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.4 }}>
                      {reward.description}
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Resgates: <strong>{reward.timesRedeemed || 0}x</strong>
                  </span>

                  <button
                    onClick={() => onRedeemReward(reward.id)}
                    disabled={!canAfford}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 16px',
                      borderRadius: '10px',
                      background: canAfford
                        ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                        : 'rgba(255, 255, 255, 0.06)',
                      color: canAfford ? '#000' : '#64748b',
                      fontWeight: 800,
                      fontSize: '0.85rem',
                      border: 'none',
                      cursor: canAfford ? 'pointer' : 'not-allowed',
                      boxShadow: canAfford ? '0 2px 10px rgba(245, 158, 11, 0.3)' : 'none',
                      transition: 'transform 0.15s ease'
                    }}
                    onMouseOver={(e) => canAfford && (e.currentTarget.style.transform = 'scale(1.03)')}
                    onMouseOut={(e) => canAfford && (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    <Sparkles size={15} /> Resgatar
                  </button>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Redemption History */}
      {redemptions && redemptions.length > 0 && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h3 className="font-cinzel" style={{ fontSize: '1.1rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <History size={18} color="#fbbf24" /> Histórico de Resgates
            </h3>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
              {redemptions.length} {redemptions.length === 1 ? 'resgate realizado' : 'resgates realizados'}
              {moneySpentTotal > 0 ? ` · ${formatBrl(moneySpentTotal)} gastos` : ''}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
            {redemptions.slice(0, 15).map(red => (
              <div
                key={red.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  fontSize: '0.85rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#f8fafc' }}>
                  <div style={{ padding: '4px', borderRadius: '6px', background: red.kind === 'money' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)' }}>
                    {red.kind === 'money' ? <Banknote size={14} color="#10b981" /> : <Check size={14} color="#fbbf24" />}
                  </div>
                  <div>
                    <span style={{ fontWeight: 600 }}>{red.rewardTitle}</span>
                    <div style={{ color: '#64748b', fontSize: '0.72rem' }}>
                      {red.kind === 'money' ? `Gasto em dinheiro · ${formatBrl(red.amountBrl)} · ` : ''}
                      {new Date(red.timestamp).toLocaleDateString('pt-BR')} às {new Date(red.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ color: '#f43f5e', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
                    -{redemptionCost(red)} 🪙
                  </span>

                  {onCancelRedemption && (
                    <button
                      onClick={() => setCancelModalRedemption(red)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '5px 10px',
                        borderRadius: '8px',
                        background: 'rgba(245, 158, 11, 0.12)',
                        border: '1px solid rgba(245, 158, 11, 0.3)',
                        color: '#fbbf24',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                      title="Cancelar resgate e estornar moedas"
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = 'rgba(245, 158, 11, 0.25)';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'rgba(245, 158, 11, 0.12)';
                      }}
                    >
                      <RotateCcw size={12} /> Cancelar Resgate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal Registrar Gasto em R$ */}
      {showSpendModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(6px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            className="glass-panel modal-sheet"
            style={{
              maxWidth: '480px',
              width: '100%',
              padding: '28px',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              borderRadius: '20px'
            }}
          >
            <h3 className="font-cinzel" style={{ fontSize: '1.3rem', fontWeight: 800, color: '#86efac', marginBottom: '8px' }}>
              💸 Registrar Gasto em R$
            </h3>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '18px', lineHeight: 1.45 }}>
              Cada R$ 1,00 custa 10 moedas de ouro. Seu saldo atual cobre até <strong style={{ color: '#86efac' }}>{formatBrl(walletBrl)}</strong>.
            </p>

            <form onSubmit={handleSpendMoney} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  O que você comprou? *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: sorvete, almoço, cinema"
                  value={spendItem}
                  onChange={(e) => setSpendItem(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.95rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Valor gasto (R$) *
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  placeholder="Ex: 25,00"
                  value={spendAmount}
                  onChange={(e) => setSpendAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: '#1a2030',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#86efac',
                    fontWeight: 800,
                    fontSize: '1rem',
                    fontFamily: 'var(--font-mono)'
                  }}
                />
              </div>

              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: '12px',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px'
                }}
              >
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                    Moedas a debitar
                  </span>
                  <span style={{ fontSize: '1.15rem', fontWeight: 900, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                    {spendCoins} 🪙
                  </span>
                </div>
                {spendCoins > 0 && !canAffordSpend && (
                  <span style={{ fontSize: '0.75rem', color: '#f87171', fontWeight: 700, textAlign: 'right' }}>
                    Saldo insuficiente
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setShowSpendModal(false)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!spendItem.trim() || !canAffordSpend || spendSubmitting}
                  style={{
                    padding: '10px 20px',
                    borderRadius: '10px',
                    background: canAffordSpend
                      ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                      : 'rgba(255, 255, 255, 0.08)',
                    color: canAffordSpend ? '#022c22' : '#64748b',
                    fontWeight: 800,
                    border: 'none',
                    cursor: canAffordSpend ? 'pointer' : 'not-allowed'
                  }}
                >
                  {spendSubmitting ? 'Registrando...' : 'Debitar Moedas'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Criar Recompensa */}
      {showAddModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(6px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            className="glass-panel modal-sheet"
            style={{
              maxWidth: '480px',
              width: '100%',
              padding: '28px',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '20px'
            }}
          >
            <h3 className="font-cinzel" style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fbbf24', marginBottom: '18px' }}>
              🎁 Nova Recompensa Personalizada
            </h3>

            <form onSubmit={handleCreateReward} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Título da Recompensa *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 1 Episódio de Série ou Café Especial"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.95rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Descrição / Regra de Uso
                </label>
                <textarea
                  placeholder="Ex: Liberado para assistir após terminar a meta do dia..."
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Custo em Moedas *
                  </label>
                  <input
                    type="number"
                    required
                    min="5"
                    value={newCost}
                    onChange={(e) => setNewCost(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(245, 158, 11, 0.4)',
                      color: '#fbbf24',
                      fontWeight: 800,
                      fontSize: '1rem',
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Ícone
                  </label>
                  <select
                    value={newIcon}
                    onChange={(e) => setNewIcon(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  >
                    <option value="Gift">Presente 🎁</option>
                    <option value="Coffee">Café ☕</option>
                    <option value="Tv">Série / TV 📺</option>
                    <option value="Gamepad2">Videogame 🎮</option>
                    <option value="Heart">Lazer / Autocuidado ❤️</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#000',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Criar Recompensa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Cancelamento de Resgate */}
      {cancelModalRedemption && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            className="glass-panel modal-sheet"
            style={{
              maxWidth: '460px',
              width: '100%',
              padding: '28px',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '20px',
              textAlign: 'center',
              boxShadow: '0 10px 40px rgba(0,0,0,0.6)'
            }}
          >
            {/* Icon */}
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '2px solid rgba(245, 158, 11, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px auto',
                color: '#fbbf24'
              }}
            >
              <RotateCcw size={30} />
            </div>

            <h3 className="font-cinzel" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', marginBottom: '8px' }}>
              Cancelar Resgate?
            </h3>

            <p style={{ color: '#94a3b8', fontSize: '0.9rem', lineHeight: 1.5, marginBottom: '20px' }}>
              Deseja desfazer o resgate de <strong style={{ color: '#f8fafc' }}>"{cancelModalRedemption.rewardTitle}"</strong>?
            </p>

            {/* Coin Refund Card */}
            <div
              style={{
                padding: '14px 18px',
                borderRadius: '12px',
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                marginBottom: '22px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px'
              }}
            >
              <Coins size={22} color="#fbbf24" />
              <div style={{ textAlign: 'left' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>
                  Moedas a Serem Estornadas
                </span>
                <span style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                  +{redemptionCost(cancelModalRedemption)} Moedas de Ouro
                </span>
                {cancelModalRedemption.kind === 'money' && (
                  <span style={{ fontSize: '0.75rem', color: '#86efac', display: 'block' }}>
                    referente a {formatBrl(cancelModalRedemption.amountBrl)}
                  </span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                type="button"
                onClick={() => setCancelModalRedemption(null)}
                style={{
                  flex: 1,
                  padding: '12px 18px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  color: '#94a3b8',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                  e.currentTarget.style.color = '#fff';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.color = '#94a3b8';
                }}
              >
                Manter Resgate
              </button>

              <button
                type="button"
                onClick={() => {
                  onCancelRedemption(cancelModalRedemption.id);
                  setCancelModalRedemption(null);
                }}
                style={{
                  flex: 1.2,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 18px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  border: 'none',
                  color: '#000',
                  fontWeight: 900,
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(245, 158, 11, 0.35)',
                  transition: 'transform 0.15s ease'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                <RotateCcw size={16} /> Confirmar Estorno
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        confirmVariant={confirmModal.confirmVariant}
        icon={confirmModal.icon}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirmModal}
      />
    </div>
  );
}
