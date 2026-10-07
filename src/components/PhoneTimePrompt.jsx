import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Smartphone, X } from 'lucide-react';
import { formatPhoneDuration, parsePhoneTimeMinutes, PHONE_TIME_MAX_MINUTES } from '../utils/phoneTime';

function formatDay(dateStr) {
  if (!dateStr) return 'ontem';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

export function PhoneTimePrompt({
  open,
  dateStr,
  busy = false,
  onSubmit,
  onLater,
  onOpenSection
}) {
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    setHours('');
    setMinutes('');
    setNote('');
    setError('');
    const onKey = (event) => {
      if (event.key === 'Escape') onLater?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dateStr, onLater]);

  if (!open) return null;

  const total = (Number(hours) || 0) * 60 + (Number(minutes) || 0);
  const preview = Number.isFinite(total) && total >= 0 ? formatPhoneDuration(total) : '';

  const submit = async (event) => {
    event.preventDefault();
    const parsed = parsePhoneTimeMinutes(total);
    if (parsed == null) {
      setError('Informe horas e minutos.');
      return;
    }
    if (parsed > PHONE_TIME_MAX_MINUTES) {
      setError('O dia não tem mais de 24 horas.');
      return;
    }
    setError('');
    try {
      await onSubmit?.({ date: dateStr, minutes: parsed, note });
    } catch (err) {
      setError(err?.message || 'Não foi possível registrar.');
    }
  };

  return createPortal(
    <div className="phone-time-overlay" role="presentation">
      <form
        className="phone-time-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="phone-time-title"
        onSubmit={submit}
      >
        <button type="button" className="phone-time-close" onClick={onLater} aria-label="Responder depois">
          <X size={16} />
        </button>
        <div className="phone-time-seal" aria-hidden="true">
          <Smartphone size={26} />
        </div>
        <p className="phone-time-kicker">Registro do dia</p>
        <h2 id="phone-time-title">Quanto tempo você passou no celular ontem?</h2>
        <p className="phone-time-lead">
          Ontem foi {formatDay(dateStr)}. Responda uma vez e o Grimório não pergunta de novo — o registro continua editável na seção Tempo no Celular.
        </p>

        <div className="phone-time-fields">
          <label>
            <span>Horas</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="24"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              placeholder="0"
              autoFocus
            />
          </label>
          <label>
            <span>Minutos</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max="59"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              placeholder="0"
            />
          </label>
        </div>
        {preview && <p className="phone-time-preview">{preview}</p>}
        <label className="phone-time-note">
          <span>Nota (opcional)</span>
          <input
            type="text"
            maxLength={280}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Ex.: redes, estudo, trabalho"
          />
        </label>
        {error && <p className="phone-time-error">{error}</p>}

        <div className="phone-time-actions">
          <button type="submit" className="phone-time-save" disabled={busy}>
            {busy ? 'Registrando…' : 'Registrar'}
          </button>
          <button type="button" className="phone-time-later" onClick={onLater} disabled={busy}>
            Responder depois
          </button>
          <button type="button" className="phone-time-link" onClick={onOpenSection} disabled={busy}>
            Abrir a seção
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
