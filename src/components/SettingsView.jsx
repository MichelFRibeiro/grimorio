import React, { useEffect, useState } from 'react';
import { Settings, RotateCcw, Check, ListOrdered, X } from 'lucide-react';
import { FEATURE_SETTINGS, defaultFeatureSettings } from '../utils/featureSettings';
import { THEMES, normalizeTheme } from '../utils/theme';

/** Um item do seletor da rotina da tela inicial. */
function RoutineChoice({ routine, selected, disabled, onPick }) {
  const progress = routine.progress || { total: 0, done: 0 };
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={`Mostrar a rotina ${routine.title} na tela inicial`}
      className={`settings-theme settings-routine${selected ? ' is-selected' : ''}`}
      disabled={disabled}
      onClick={() => onPick(routine.id)}
    >
      <span className="settings-theme-body">
        <span className="settings-theme-name">
          <ListOrdered size={14} aria-hidden="true" />
          {routine.title}
          {selected && (
            <span className="settings-theme-check" aria-hidden="true">
              <Check size={12} /> Na tela inicial
            </span>
          )}
        </span>
        <span className="settings-theme-desc">
          {!routine.progress
            ? 'A tela inicial fica sem o quadro da rotina'
            : progress.total
              ? `${progress.done} de ${progress.total} passos feitos hoje`
              : 'Rotina ainda sem passos'}
        </span>
      </span>
    </button>
  );
}

export function SettingsView({
  settings,
  onChange,
  theme,
  onChangeTheme,
  playClick,
  routines = [],
  homeRoutineId = null,
  onChangeHomeRoutine,
  onOpenRoutines,
  routinesEnabled = true
}) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [themeBusy, setThemeBusy] = useState(null);
  const [themeError, setThemeError] = useState('');
  const [shownTheme, setShownTheme] = useState(normalizeTheme(theme));
  const [routineBusy, setRoutineBusy] = useState(false);
  const [routineError, setRoutineError] = useState('');

  // o valor em vigor pode mudar por fora (outra aba, perfil); acompanha.
  useEffect(() => {
    setShownTheme(normalizeTheme(theme));
  }, [theme]);

  const current = { ...defaultFeatureSettings(), ...(settings || {}) };
  const groups = [];
  FEATURE_SETTINGS.forEach((feature) => {
    const group = groups.find((item) => item.name === feature.group);
    if (group) group.items.push(feature);
    else groups.push({ name: feature.group, items: [feature] });
  });
  const disabledCount = FEATURE_SETTINGS.filter((feature) => current[feature.id] === false).length;

  const toggle = async (id) => {
    if (busyId) return;
    if (playClick) playClick();
    setBusyId(id);
    setError('');
    try {
      await onChange({ [id]: current[id] === false });
    } catch (err) {
      setError(err?.message || 'Não foi possível gravar a preferência.');
    } finally {
      setBusyId(null);
    }
  };

  const chooseTheme = async (id) => {
    if (!onChangeTheme || themeBusy) return;
    if (id === shownTheme) return;
    if (playClick) playClick();
    setThemeBusy(id);
    setThemeError('');
    try {
      await onChangeTheme(id);
      setShownTheme(id);
    } catch (err) {
      setThemeError(err?.message || 'Não foi possível trocar o tema.');
    } finally {
      setThemeBusy(null);
    }
  };

  const chooseRoutine = async (routineId) => {
    if (!onChangeHomeRoutine || routineBusy) return;
    const next = routineId || null;
    if (next === (homeRoutineId || null)) return;
    if (playClick) playClick();
    setRoutineBusy(true);
    setRoutineError('');
    try {
      await onChangeHomeRoutine(next);
    } catch (err) {
      setRoutineError(err?.message || 'Não foi possível trocar a rotina da tela inicial.');
    } finally {
      setRoutineBusy(false);
    }
  };

  const restoreAll = async () => {
    if (busyId || disabledCount === 0) return;
    if (playClick) playClick();
    setBusyId('all');
    setError('');
    try {
      await onChange(defaultFeatureSettings());
    } catch (err) {
      setError(err?.message || 'Não foi possível restaurar.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="settings-board">
      <header className="settings-hero">
        <div>
          <p className="settings-kicker">
            <Settings size={14} /> Preferências
          </p>
          <h2 className="font-cinzel">Configurações</h2>
          <p className="settings-lead">
            Desligar esconde a funcionalidade da tela. Nada é apagado: missões, rituais,
            leituras e recompensas continuam gravados e voltam quando você ligar de novo.
          </p>
        </div>
        <button
          type="button"
          className="settings-restore"
          onClick={restoreAll}
          disabled={disabledCount === 0 || busyId != null}
        >
          <RotateCcw size={14} />
          {disabledCount === 0 ? 'Tudo ligado' : `Ligar tudo (${disabledCount})`}
        </button>
      </header>

      {error && <p className="settings-error" role="alert">{error}</p>}

      <section className="glass-panel settings-themes" aria-labelledby="settings-theme-title">
        <div className="settings-themes-head">
          <h3 id="settings-theme-title">Aparência</h3>
          <p>Escolha o visual do Grimório. A troca é imediata e fica gravada no seu perfil.</p>
        </div>
        <div className="settings-theme-grid" role="radiogroup" aria-labelledby="settings-theme-title">
          {THEMES.map((item) => {
            const selected = item.id === shownTheme;
            const busy = themeBusy === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`Usar o tema ${item.label}`}
                className={`settings-theme${selected ? ' is-selected' : ''}`}
                disabled={themeBusy != null}
                onClick={() => chooseTheme(item.id)}
              >
                <span
                  className={`settings-theme-preview${item.dark ? ' is-dark' : ' is-light'}`}
                  style={{ '--swatch-accent': item.colors[3] || item.colors[0] }}
                  aria-hidden="true"
                >
                  <span className="settings-theme-bar" />
                  <span className="settings-theme-blocks">
                    <span />
                    <span />
                    <span />
                  </span>
                </span>
                <span className="settings-theme-body">
                  <span className="settings-theme-name">
                    {item.label}
                    {selected && (
                      <span className="settings-theme-check" aria-hidden="true">
                        <Check size={12} /> Em uso
                      </span>
                    )}
                  </span>
                  <span className="settings-theme-sub">{item.subtitle}</span>
                  <span className="settings-theme-desc">{item.description}</span>
                  <span className="settings-theme-swatches" aria-hidden="true">
                    {item.colors.map((color) => (
                      <i key={color} style={{ background: color }} />
                    ))}
                  </span>
                </span>
                {busy && <span className="settings-theme-busy" aria-hidden="true">…</span>}
              </button>
            );
          })}
        </div>
        {themeError && <p className="settings-error" role="alert">{themeError}</p>}
      </section>

      <section className="glass-panel settings-themes" aria-labelledby="settings-routine-title">
        <div className="settings-themes-head">
          <h3 id="settings-routine-title">Rotina da tela inicial</h3>
          <p>
            A rotina escolhida aparece logo abaixo de "Vitórias Planejadas para o Dia",
            com os passos de hoje e o próximo a fazer. A escolha fica no seu perfil e
            acompanha a conta em qualquer aparelho.
          </p>
        </div>
        {!routinesEnabled ? (
          <p className="settings-hint">
            A aba Rotinas está desligada. Ligue "Rotinas" nos interruptores abaixo para escolher uma rotina.
          </p>
        ) : routines.length === 0 ? (
          <p className="settings-hint">
            Você ainda não tem rotinas.{' '}
            {onOpenRoutines ? (
              <button type="button" className="settings-link" onClick={() => onOpenRoutines()}>
                Criar a primeira rotina
              </button>
            ) : null}
          </p>
        ) : (
          <div className="settings-theme-grid" role="radiogroup" aria-labelledby="settings-routine-title">
            <RoutineChoice
              routine={{ id: '', title: 'Nenhuma', progress: null }}
              selected={!homeRoutineId}
              disabled={routineBusy}
              onPick={() => chooseRoutine(null)}
            />
            {routines.map((routine) => (
              <RoutineChoice
                key={routine.id}
                routine={routine}
                selected={routine.id === homeRoutineId}
                disabled={routineBusy}
                onPick={chooseRoutine}
              />
            ))}
          </div>
        )}
        {homeRoutineId && routines.length ? (
          <button
            type="button"
            className="settings-link"
            onClick={() => chooseRoutine(null)}
            disabled={routineBusy}
            style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <X size={13} /> Não mostrar nenhuma rotina na tela inicial
          </button>
        ) : null}
        {routineError && <p className="settings-error" role="alert">{routineError}</p>}
      </section>

      {groups.map((group) => (
        <section key={group.name} className="glass-panel settings-group">
          <h3>{group.name}</h3>
          <ul>
            {group.items.map((feature) => {
              const enabled = current[feature.id] !== false;
              const busy = busyId === feature.id || busyId === 'all';
              return (
                <li key={feature.id}>
                  <div>
                    <strong>{feature.label}</strong>
                    <span>{feature.description}</span>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`${enabled ? 'Desligar' : 'Ligar'} ${feature.label}`}
                    className={`settings-switch${enabled ? ' is-on' : ''}`}
                    disabled={busy}
                    onClick={() => toggle(feature.id)}
                  >
                    <span />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
