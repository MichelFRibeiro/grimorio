import React, { createContext, useContext } from 'react';
import { Music } from 'lucide-react';
import { focusMusicButtonState } from '../utils/focusMusicButton';

const FocusPlayerContext = createContext(null);

export function FocusPlayerProvider({ player, enabled = true, children }) {
  return (
    <FocusPlayerContext.Provider value={{ player, enabled }}>
      {children}
    </FocusPlayerContext.Provider>
  );
}

/** Nota de música no canto do modal. Toca ou para a trilha da câmara, sem sair da tela. */
export function FocusMusicButton({ inline = false }) {
  const ctx = useContext(FocusPlayerContext);
  const state = focusMusicButtonState({
    playing: !!ctx?.player?.playing,
    enabled: !!ctx?.player && ctx.enabled !== false
  });
  if (!state.visible) return null;

  return (
    <button
      type="button"
      className={inline ? 'focus-music-btn is-inline' : 'focus-music-btn'}
      aria-label={state.label}
      aria-pressed={state.pressed}
      title={state.label}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        ctx.player.toggle();
      }}
    >
      <Music size={18} aria-hidden="true" />
    </button>
  );
}
