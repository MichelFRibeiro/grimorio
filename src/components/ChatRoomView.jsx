import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyRound, MessagesSquare, Plus, RefreshCw, Send, Trash2, Users } from 'lucide-react';

const WORD_LIMIT = 60;

function formatClock(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function ChatRoomView({
  rooms = [],
  openRouter,
  onSaveOpenRouterKey,
  onListModels,
  onCreateRoom,
  onUpdateRoom,
  onDeleteRoom,
  onSendMessage,
  onSummon
}) {
  const [activeId, setActiveId] = useState(rooms[0]?.id || null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [composerOpen, setComposerOpen] = useState(false);
  const [models, setModels] = useState([]);
  const [modelQuery, setModelQuery] = useState('');
  const [selected, setSelected] = useState([]);
  const [roomTitle, setRoomTitle] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const threadRef = useRef(null);

  const room = rooms.find((item) => item.id === activeId) || rooms[0] || null;

  useEffect(() => {
    if (!rooms.some((item) => item.id === activeId)) setActiveId(rooms[0]?.id || null);
  }, [rooms, activeId]);

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [room?.messages?.length, room?.id]);

  const filteredModels = useMemo(() => {
    const query = modelQuery.trim().toLowerCase();
    const list = query
      ? models.filter((item) => `${item.name} ${item.id}`.toLowerCase().includes(query))
      : models;
    return list.slice(0, 40);
  }, [models, modelQuery]);

  const loadModels = async (refresh = false) => {
    setBusy('models');
    setError('');
    const result = await onListModels?.({ refresh });
    setBusy('');
    if (!result?.ok) {
      setError(result?.error || 'Não foi possível listar os modelos.');
      return;
    }
    setModels(result.models || []);
  };

  const openComposer = async () => {
    setComposerOpen(true);
    setRoomTitle('');
    setSelected([]);
    setModelQuery('');
    if (!models.length && openRouter?.configured) await loadModels(false);
  };

  const toggleModel = (model) => {
    setSelected((prev) => (
      prev.some((item) => item.modelId === model.id)
        ? prev.filter((item) => item.modelId !== model.id)
        : [...prev, { modelId: model.id, label: model.name }]
    ));
  };

  const createRoom = async () => {
    if (!selected.length) {
      setError('Escolha ao menos um modelo.');
      return;
    }
    setBusy('create');
    setError('');
    const result = await onCreateRoom?.({ title: roomTitle, participants: selected });
    setBusy('');
    if (!result?.ok) {
      setError(result?.error || 'Não foi possível abrir a sala.');
      return;
    }
    setComposerOpen(false);
    setActiveId(result.room.id);
  };

  const saveKey = async () => {
    if (!apiKey.trim().startsWith('sk-or-')) {
      setError('A chave do OpenRouter começa com sk-or-.');
      return;
    }
    setBusy('key');
    setError('');
    const result = await onSaveOpenRouterKey?.(apiKey.trim());
    setBusy('');
    if (!result?.ok) {
      setError(result?.error || 'Não foi possível guardar a chave.');
      return;
    }
    setApiKey('');
    setKeySaved(true);
  };

  const send = async () => {
    const content = draft.trim();
    if (!room || !content) return;
    setBusy('send');
    setError('');
    const result = await onSendMessage?.(room.id, content);
    setBusy('');
    if (!result?.ok) {
      setError(result?.error || 'Não foi possível enviar.');
      return;
    }
    setDraft('');
  };

  const summon = async (modelId) => {
    if (!room || busy) return;
    setBusy(modelId);
    setError('');
    const result = await onSummon?.(room.id, modelId);
    setBusy('');
    if (!result?.ok) setError(result?.error || 'O modelo não respondeu.');
  };

  const removeRoom = async () => {
    if (!room) return;
    if (!window.confirm(`Excluir a sala “${room.title}”?`)) return;
    setBusy('delete');
    const result = await onDeleteRoom?.(room.id);
    setBusy('');
    if (!result?.ok) setError(result?.error || 'Não foi possível excluir a sala.');
  };

  const addParticipant = async (model) => {
    if (!room) return;
    if (room.participants.some((item) => item.modelId === model.id)) return;
    setBusy('participants');
    const result = await onUpdateRoom?.(room.id, {
      participants: [...room.participants, { modelId: model.id, label: model.name }]
    });
    setBusy('');
    if (!result?.ok) setError(result?.error || 'Não foi possível incluir o modelo.');
  };

  const removeParticipant = async (modelId) => {
    if (!room || room.participants.length < 2) return;
    setBusy('participants');
    const result = await onUpdateRoom?.(room.id, {
      participants: room.participants.filter((item) => item.modelId !== modelId)
    });
    setBusy('');
    if (!result?.ok) setError(result?.error || 'Não foi possível retirar o modelo.');
  };

  return (
    <section className="chat-room">
      <header className="chat-room-header">
        <div>
          <div className="chat-room-title">
            <MessagesSquare size={22} />
            <h2 className="font-cinzel">Sala de Bate Papo</h2>
          </div>
          <p>
            Escolha os modelos. Cada botão convoca só aquele modelo, com tudo o que já foi dito — inclusive pelas outras IAs. Cada resposta fica em até {WORD_LIMIT} palavras.
          </p>
        </div>
        <button type="button" className="chat-room-primary" onClick={openComposer} disabled={!openRouter?.configured}>
          <Plus size={16} /> Nova sala
        </button>
      </header>

      <div className="chat-room-key glass-panel">
        <KeyRound size={16} />
        <div>
          <strong>Chave do OpenRouter</strong>
          <span>
            {openRouter?.configured
              ? `Guardada no servidor (${openRouter.hint}). A mesma chave do Oráculo.`
              : 'Ainda não cadastrada. Sem ela a sala não lista nem convoca modelos.'}
          </span>
        </div>
        <form onSubmit={(event) => { event.preventDefault(); saveKey(); }}>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => { setApiKey(event.target.value); setKeySaved(false); }}
            placeholder="sk-or-..."
            autoComplete="off"
            aria-label="Chave da API OpenRouter"
          />
          <button type="submit" disabled={busy === 'key'}>{busy === 'key' ? 'Guardando…' : 'Guardar'}</button>
        </form>
        {keySaved && <em>Chave atualizada.</em>}
      </div>

      {error && <p className="chat-room-error" role="alert">{error}</p>}

      {composerOpen && (
        <div className="chat-room-composer glass-panel">
          <div className="chat-room-composer-head">
            <h3>Quem entra na sala</h3>
            <button type="button" onClick={() => loadModels(true)} disabled={busy === 'models'}>
              <RefreshCw size={14} /> {busy === 'models' ? 'Buscando…' : 'Atualizar modelos'}
            </button>
          </div>
          <input
            value={roomTitle}
            onChange={(event) => setRoomTitle(event.target.value)}
            placeholder="Título da sala (opcional)"
            maxLength={80}
          />
          <input
            value={modelQuery}
            onChange={(event) => setModelQuery(event.target.value)}
            placeholder="Buscar modelo (ex.: claude, gpt, gemini)"
          />
          <div className="chat-room-model-list">
            {filteredModels.map((model) => {
              const on = selected.some((item) => item.modelId === model.id);
              return (
                <button
                  type="button"
                  key={model.id}
                  className={on ? 'is-on' : ''}
                  onClick={() => toggleModel(model)}
                  title={model.id}
                >
                  <strong>{model.name}</strong>
                  <small>{model.id}</small>
                </button>
              );
            })}
            {!filteredModels.length && (
              <p>{models.length ? 'Nenhum modelo com esse nome.' : 'Abra a lista para escolher os modelos.'}</p>
            )}
          </div>
          <div className="chat-room-composer-actions">
            <span>{selected.length} modelo{selected.length === 1 ? '' : 's'} escolhido{selected.length === 1 ? '' : 's'}</span>
            <button type="button" onClick={() => setComposerOpen(false)}>Cancelar</button>
            <button type="button" className="chat-room-primary" onClick={createRoom} disabled={busy === 'create' || !selected.length}>
              {busy === 'create' ? 'Abrindo…' : 'Abrir sala'}
            </button>
          </div>
        </div>
      )}

      <div className="chat-room-layout">
        <aside className="chat-room-list glass-panel">
          <h3><Users size={15} /> Salas</h3>
          {!rooms.length && <p>Nenhuma sala ainda.</p>}
          {rooms.map((item) => (
            <button
              type="button"
              key={item.id}
              className={item.id === room?.id ? 'is-active' : ''}
              onClick={() => setActiveId(item.id)}
            >
              <strong>{item.title}</strong>
              <small>{item.participants.length} modelo{item.participants.length === 1 ? '' : 's'} · {item.messages.length} fala{item.messages.length === 1 ? '' : 's'}</small>
            </button>
          ))}
        </aside>

        <div className="chat-room-stage glass-panel">
          {!room && <p className="chat-room-empty">Abra uma sala e escolha os modelos que vão participar.</p>}
          {room && (
            <>
              <div className="chat-room-stage-head">
                <div>
                  <h3>{room.title}</h3>
                  <small>O histórico é compartilhado. Convocar um modelo envia tudo até este ponto.</small>
                </div>
                <button type="button" className="chat-room-danger" onClick={removeRoom} disabled={busy === 'delete'} aria-label="Excluir sala">
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="chat-room-summons">
                {room.participants.map((participant) => (
                  <span key={participant.modelId} className="chat-room-seat" style={{ '--seat': participant.color || '#f59e0b' }}>
                    <button
                      type="button"
                      onClick={() => summon(participant.modelId)}
                      disabled={!!busy}
                      title={`Convocar ${participant.label} com o histórico até aqui`}
                    >
                      {busy === participant.modelId ? 'Manifestando…' : participant.label}
                    </button>
                    {room.participants.length > 1 && (
                      <button type="button" onClick={() => removeParticipant(participant.modelId)} aria-label={`Retirar ${participant.label}`} disabled={!!busy}>×</button>
                    )}
                  </span>
                ))}
              </div>

              {models.length > 0 && (
                <label className="chat-room-add">
                  Incluir modelo
                  <select
                    value=""
                    onChange={(event) => {
                      const model = models.find((item) => item.id === event.target.value);
                      if (model) addParticipant(model);
                    }}
                    disabled={!!busy}
                  >
                    <option value="">Escolher…</option>
                    {models.filter((model) => !room.participants.some((item) => item.modelId === model.id)).slice(0, 80).map((model) => (
                      <option key={model.id} value={model.id}>{model.name}</option>
                    ))}
                  </select>
                </label>
              )}

              <div className="chat-room-thread" ref={threadRef}>
                {!room.messages.length && (
                  <p className="chat-room-empty">Escreva a primeira fala. Depois, clique no modelo que deve responder.</p>
                )}
                {room.messages.map((message) => (
                  <article key={message.id} className={`chat-room-bubble is-${message.role}`}>
                    <header>
                      <strong>{message.role === 'user' ? 'Você' : (message.label || 'Modelo')}</strong>
                      <time>{formatClock(message.createdAt)}</time>
                      {message.role === 'assistant' && <em>{message.wordCount}/{WORD_LIMIT}</em>}
                    </header>
                    <p>{message.content}</p>
                  </article>
                ))}
              </div>

              <form className="chat-room-input" onSubmit={(event) => { event.preventDefault(); send(); }}>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      send();
                    }
                  }}
                  rows={3}
                  maxLength={8000}
                  placeholder="Sua fala entra no histórico. Enter envia; Shift+Enter quebra a linha."
                />
                <button type="submit" className="chat-room-primary" disabled={!!busy || !draft.trim()}>
                  <Send size={16} /> {busy === 'send' ? 'Enviando…' : 'Enviar'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
