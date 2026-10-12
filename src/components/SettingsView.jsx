import React, { useState } from 'react';
import { Settings, RotateCcw } from 'lucide-react';
import { FEATURE_SETTINGS, defaultFeatureSettings } from '../utils/featureSettings';

export function SettingsView({ settings, onChange, playClick }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
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
