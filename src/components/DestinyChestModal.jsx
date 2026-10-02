import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { chestRarity, chestRewardText } from '../utils/destinyChest.js';

const EVENT_LABEL = {
  'daily-review': 'Fechar o dia',
  triad: 'Tríade de vitórias'
};

function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Reveal do Baú do Destino. A animação de abertura roda uma vez por baú;
 * com `prefers-reduced-motion` o baú já aparece aberto.
 */
export function DestinyChestModal({ chest, onClose }) {
  const [opened, setOpened] = useState(false);
  const reduced = useMemo(prefersReducedMotion, []);

  useEffect(() => {
    if (!chest) {
      setOpened(false);
      return undefined;
    }
    if (reduced) {
      setOpened(true);
      return undefined;
    }
    setOpened(false);
    const timer = setTimeout(() => setOpened(true), 520);
    return () => clearTimeout(timer);
  }, [chest, reduced]);

  useEffect(() => {
    if (!chest) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chest, onClose]);

  if (!chest) return null;

  const rarity = chest.rarity && chest.rarity.label ? chest.rarity : chestRarity(chest.prizeId);
  const rewardText = chestRewardText(chest);
  const eventLabel = EVENT_LABEL[chest.event] || null;

  return createPortal(
    <div className="chest-overlay" role="presentation" onClick={onClose}>
      <div
        className="chest-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="chest-title"
        data-rarity={rarity.key}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={`chest-scene${opened ? ' is-open' : ''}`} aria-hidden="true">
          <span className="chest-rays" />
          <span className="chest-spark chest-spark-a" />
          <span className="chest-spark chest-spark-b" />
          <span className="chest-spark chest-spark-c" />
          <div className="chest-art">
            <span className="chest-lid" />
            <span className="chest-body" />
            <span className="chest-band" />
            <span className="chest-lock" />
          </div>
        </div>

        <p className="chest-kicker">Baú do Destino</p>
        <h2 id="chest-title" className="chest-rarity">{rarity.label}</h2>
        <p className="chest-chance">{rarity.chance}% de chance</p>
        <p className="chest-reward">{rewardText}</p>
        {chest.shield && (
          <p className="chest-note">Escudo guardado — um dia vazio não quebra a sequência.</p>
        )}
        {eventLabel && <p className="chest-source">Conquistado em: {eventLabel}</p>}

        <button type="button" className="chest-ok" onClick={onClose} autoFocus>
          OK
        </button>
      </div>
    </div>,
    document.body
  );
}
