/** Rótulo e ação do ícone que toca a trilha da câmara de foco. */
export function focusMusicButtonState({ playing = false, enabled = true } = {}) {
  if (!enabled) {
    return { visible: false, label: '', pressed: false, action: 'none' };
  }
  const on = !!playing;
  return {
    visible: true,
    label: on ? 'Parar música de foco' : 'Tocar música de foco',
    pressed: on,
    action: on ? 'pause' : 'play'
  };
}
