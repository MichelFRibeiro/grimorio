import { useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { useSoundEffects } from './useSoundEffects';
import { formatBrl } from '../utils/coinExchange.js';
import { hydrateLiveActivityTimers, setLiveActivityTimerSync, flushLiveActivityTimers, getLiveActivityTimers } from '../utils/liveActivityTimers.js';
import { fetchWithRetry, connectionErrorMessage, isTransientHttpStatus, retryDelayMs } from '../utils/httpClient.js';

const getAuthHeaders = () => {
  const token = localStorage.getItem('grimorio_auth_token');
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export function useGameData() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rewardPopups, setRewardPopups] = useState([]);
  const [levelUpData, setLevelUpData] = useState(null);
  const dataRef = useRef(null);
  const fetchGenRef = useRef(0);
  const failCountRef = useRef(0);
  const toastTimersRef = useRef(new Set());
  const [retryNonce, setRetryNonce] = useState(0);

  const {
    muted,
    toggleMute,
    playSuccess,
    playCoin,
    playLevelUp,
    playBossHit,
    playClick
  } = useSoundEffects();

  const applyMindMapPayload = useCallback((result) => {
    if (!result?.mindMap) return;
    setData((prev) => {
      if (!prev) return prev;
      const maps = Array.isArray(prev.mindMaps) ? prev.mindMaps.slice() : [];
      const idx = maps.findIndex(m => m.id === result.mindMap.id);
      if (idx === -1) maps.unshift(result.mindMap);
      else maps[idx] = result.mindMap;
      const next = { ...prev, mindMaps: maps };
      if (result.categories) next.mindMapCategories = result.categories;
      if (result.sessions) next.mindMapSessions = result.sessions;
      if (result.images) next.mindMapImages = result.images;
      dataRef.current = next;
      return next;
    });
  }, []);

  const applyMindMapCategories = useCallback((result) => {
    if (!result) return;
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      if (result.categories) next.mindMapCategories = result.categories;
      if (result.mindMaps) next.mindMaps = result.mindMaps;
      dataRef.current = next;
      return next;
    });
  }, []);

  const fetchState = useCallback(async (signal) => {
    const abortSignal = signal instanceof AbortSignal ? signal : undefined;
    const gen = ++fetchGenRef.current;
    try {
      const res = await fetchWithRetry('/api/state', {
        headers: getAuthHeaders(),
        signal: abortSignal
      }, { retries: 2, signal: abortSignal });
      if (gen !== fetchGenRef.current) return;
      if (!res.ok) {
        throw Object.assign(
          new Error(connectionErrorMessage(null, res.status) || 'Falha ao comunicar com o servidor.'),
          { status: res.status }
        );
      }
      const json = await res.json();
      if (gen !== fetchGenRef.current) return;
      setData(json);
      dataRef.current = json;
      setError(null);
      failCountRef.current = 0;
      hydrateLiveActivityTimers(json.liveActivityTimers || {}, { sync: true });
    } catch (err) {
      if (err?.name === 'AbortError') return;
      if (gen !== fetchGenRef.current) return;
      console.error(err);
      failCountRef.current += 1;
      const message = connectionErrorMessage(err, err.status) || err.message;
      if (!dataRef.current) {
        setError(message);
        if (err?.status !== 429) setRetryNonce((n) => n + 1);
      }
    } finally {
      if (gen === fetchGenRef.current) setLoading(false);
    }
  }, []);

  const refresh = useCallback(() => {
    if (!dataRef.current) {
      setLoading(true);
      setError(null);
    }
    return fetchState();
  }, [fetchState]);

  const syncLiveTimers = useCallback(async (items) => {
    const res = await fetchWithRetry('/api/live-timers', {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ items })
    }, { retries: 1 });
    if (!res.ok) {
      throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    }
    const json = await res.json();
    if (json?.liveActivityTimers) {
      hydrateLiveActivityTimers(json.liveActivityTimers);
    }
  }, []);

  useEffect(() => {
    setLiveActivityTimerSync(syncLiveTimers);
    return () => setLiveActivityTimerSync(null);
  }, [syncLiveTimers]);

  useEffect(() => {
    const controller = new AbortController();
    fetchState(controller.signal);

    // Keep-alive leve: 1 ping a cada 10 min, só com a aba visível.
    const heartbeat = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      fetch('/api/health').catch(() => {});
    }, 10 * 60 * 1000);

    const LIVE_TIMER_POLL_MS = 45_000;
    let pollTimer = null;
    let pollDelay = LIVE_TIMER_POLL_MS;
    let pollInFlight = false;

    const hasRunningTimer = () => (
      Object.values(getLiveActivityTimers()).some((t) => t && !t.cleared && t.runStartedAt != null)
    );

    const pollOnce = async ({ force = false } = {}) => {
      if (pollInFlight) return;
      if (document.visibilityState !== 'visible') return;
      if (!force && !hasRunningTimer()) return;
      pollInFlight = true;
      try {
        const res = await fetch('/api/live-timers', { headers: getAuthHeaders() });
        if (isTransientHttpStatus(res.status)) {
          pollDelay = Math.min(5 * 60 * 1000, Math.max(pollDelay * 2, 20_000));
          return;
        }
        pollDelay = LIVE_TIMER_POLL_MS;
        if (!res.ok) return;
        const json = await res.json();
        if (json?.liveActivityTimers) hydrateLiveActivityTimers(json.liveActivityTimers);
      } catch {
        pollDelay = Math.min(5 * 60 * 1000, Math.max(pollDelay * 2, 20_000));
      } finally {
        pollInFlight = false;
      }
    };

    const schedulePoll = () => {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = setTimeout(async () => {
        await pollOnce();
        schedulePoll();
      }, pollDelay);
    };
    schedulePoll();

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        pollDelay = LIVE_TIMER_POLL_MS;
        pollOnce({ force: true });
      } else {
        flushLiveActivityTimers();
      }
    };

    document.addEventListener('visibilitychange', onVisible);

    return () => {
      controller.abort();
      clearInterval(heartbeat);
      if (pollTimer) clearTimeout(pollTimer);
      document.removeEventListener('visibilitychange', onVisible);
      flushLiveActivityTimers();
    };
  }, [fetchState]);

  useEffect(() => {
    if (!error || dataRef.current) return undefined;
    const delay = retryDelayMs(Math.max(0, failCountRef.current - 1));
    const timer = setTimeout(() => fetchState(), delay);
    return () => clearTimeout(timer);
  }, [error, retryNonce, fetchState]);

  // Trigger floating reward popup. Timers are cleared on unmount.
  const showRewardToast = useCallback((xp, coins, text, variant) => {
    const id = Date.now() + Math.random();
    setRewardPopups(prev => [...prev, { id, xp, coins, text, variant }]);
    const timer = setTimeout(() => {
      toastTimersRef.current.delete(timer);
      setRewardPopups(prev => prev.filter(p => p.id !== id));
    }, 2500);
    toastTimersRef.current.add(timer);
  }, []);

  const showErrorToast = useCallback((text) => {
    showRewardToast(0, 0, text || 'Não foi possível concluir.', 'error');
  }, [showRewardToast]);

  useEffect(() => () => {
    toastTimersRef.current.forEach((timer) => clearTimeout(timer));
    toastTimersRef.current.clear();
  }, []);

  /**
   * Escrita HTTP. Em !res.ok mostra o {error} do servidor e devolve null.
   * Não usa fetchWithRetry: escrita repetida não é idempotente.
   */
  const mutate = useCallback(async (path, options = {}) => {
    const { method = 'POST', body, refreshOnSuccess = true, toastOnError = true } = options;
    try {
      const res = await fetch(path, {
        method,
        headers: getAuthHeaders(),
        ...(body !== undefined ? { body: JSON.stringify(body) } : {})
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const message = errJson.error || 'Não foi possível concluir.';
        if (toastOnError) showErrorToast(message);
        // toastOnError: null para o chamador (o toast já saiu).
        // toastOnError false: o chamador lê .error e monta a própria resposta.
        return toastOnError ? null : { __error: true, error: message, status: res.status };
      }
      const result = await res.json().catch(() => ({}));
      if (refreshOnSuccess) fetchState();
      return result;
    } catch (err) {
      const message = connectionErrorMessage(err) || 'Sem conexão com o Grimório.';
      if (toastOnError) showErrorToast(message);
      return toastOnError ? null : { __error: true, error: message };
    }
  }, [fetchState, showErrorToast]);

  // Handle generic reward response from API
  const handleRewardResponse = useCallback((rewardResult, fallbackText = 'Atividade Concluída!') => {
    if (!rewardResult) return;

    const { leveledUp, oldLevel, newLevel, bossDefeatedNow, profile, boss } = rewardResult;

    if (leveledUp) {
      playLevelUp();
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.6 }
      });
      setLevelUpData({ oldLevel, newLevel, title: profile.title });
    } else {
      playSuccess();
    }

    if (rewardResult.logEntry) {
      const { xp, coins } = rewardResult.logEntry;
      showRewardToast(xp, coins, fallbackText);
    }

    if (bossDefeatedNow) {
      const timer = setTimeout(() => {
        toastTimersRef.current.delete(timer);
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.5 }
        });
      }, 500);
      toastTimersRef.current.add(timer);
    }
  }, [playLevelUp, playSuccess, showRewardToast]);

  const handleLinkedVictories = useCallback((linkedVictories = []) => {
    (linkedVictories || []).forEach((item) => {
      if (!item || item.stateUnchanged) return;
      if (item.willComplete) {
        if (item.rewardResult) {
          handleRewardResponse(item.rewardResult, `Vitória: ${item.victory?.title || 'Planejada'}`);
        }
        if (item.bonusAwardedNow && item.bonusRewardResult) {
          handleRewardResponse(item.bonusRewardResult, 'Tríade de vitórias conquistada!');
        }
      } else if (item.victory) {
        showRewardToast(0, 0, `Vitória reaberta: ${item.victory.title}`);
      }
    });
  }, [handleRewardResponse, showRewardToast]);

  // 1. Quests Actions
  const addQuest = async (questData) => {
    playClick();
    await mutate('/api/quests', { body: questData });
  };

  const updateQuest = async (id, questData) => {
    playClick();
    await mutate(`/api/quests/${id}`, { method: 'PUT', body: questData });
  };

  const completeQuest = async (id, extra = {}) => {
    playClick();
    const result = await mutate(`/api/quests/${id}/complete`, { body: extra || {}, refreshOnSuccess: false });
    if (!result) return;
    if (result.willComplete) {
      if (result.rewardResult) {
        handleRewardResponse(result.rewardResult, `Missão Cumprida: ${result.quest.title}`);
        confetti({ particleCount: 40, spread: 60, origin: { y: 0.7 } });
      }
    } else {
      showRewardToast(
        -(result.rewardResult?.revertedXp ?? result.quest.xpReward),
        -(result.rewardResult?.revertedCoins ?? result.quest.coinReward),
        `Missão reaberta: ${result.quest.title} (estorno aplicado)`
      );
    }
    handleLinkedVictories(result.linkedVictories);
    fetchState();
  };

  const deleteQuest = async (id) => {
    playClick();
    await mutate(`/api/quests/${id}`, { method: 'DELETE' });
  };

  const addQuestCategory = async (categoryData) => {
    playClick();
    await mutate('/api/quest-categories', { body: categoryData });
  };

  const updateQuestCategory = async (id, categoryData) => {
    playClick();
    await mutate(`/api/quest-categories/${id}`, { method: 'PUT', body: categoryData });
  };

  const deleteQuestCategory = async (id) => {
    playClick();
    await mutate(`/api/quest-categories/${id}`, { method: 'DELETE' });
  };

  const addBook = async (bookData) => {
    playClick();
    await mutate('/api/books', { body: bookData });
  };

  const updateBook = async (id, bookData) => {
    playClick();
    await mutate(`/api/books/${id}`, { method: 'PUT', body: bookData });
  };

  const logReadingSession = async (bookId, sessionData) => {
    playClick();
    const result = await mutate(`/api/books/${bookId}/reading-session`, { body: sessionData, refreshOnSuccess: false });
    if (!result) return;
    handleRewardResponse(result.rewardResult, `Leitura: +${result.session.pagesRead} páginas!`);
    handleLinkedVictories(result.linkedVictories);
    confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
    fetchState();
  };

  const updateReadingSession = async (sessionId, sessionData) => {
    playClick();
    const result = await mutate(`/api/reading-sessions/${sessionId}`, { method: 'PUT', body: sessionData, refreshOnSuccess: false });
    if (!result) return;
    handleLinkedVictories(result.linkedVictories);
    fetchState();
  };

  const deleteReadingSession = async (sessionId) => {
    playClick();
    const result = await mutate(`/api/reading-sessions/${sessionId}`, { method: 'DELETE', refreshOnSuccess: false });
    if (!result) return;
    handleLinkedVictories(result.linkedVictories);
    fetchState();
  };

  const deleteBook = async (id) => {
    playClick();
    await mutate(`/api/books/${id}`, { method: 'DELETE' });
  };

  const addBookQuote = async (bookId, quoteData) => {
    playClick();
    const result = await mutate(`/api/books/${bookId}/quotes`, { body: quoteData, refreshOnSuccess: false });
    if (!result) return;
    if (result.rewardResult) handleRewardResponse(result.rewardResult, 'Citação salva no tomo!');
    fetchState();
  };

  const updateBookQuote = async (bookId, quoteId, quoteData) => {
    playClick();
    await mutate(`/api/books/${bookId}/quotes/${quoteId}`, { method: 'PUT', body: quoteData });
  };

  const deleteBookQuote = async (bookId, quoteId) => {
    playClick();
    await mutate(`/api/books/${bookId}/quotes/${quoteId}`, { method: 'DELETE' });
  };

  const addExamQuestions = async (questionData) => {
    playBossHit();
    const result = await mutate('/api/questions', { body: questionData, refreshOnSuccess: false });
    if (!result) return;
    if (result.rewardResult) {
      handleRewardResponse(result.rewardResult, `Treino: ${result.examQuestion.correctAnswers}/${result.examQuestion.totalQuestions} acertos (${result.examQuestion.accuracyRate}%)!`);
      confetti({
        particleCount: result.examQuestion.accuracyRate >= 80 ? 70 : 40,
        spread: 70,
        origin: { y: 0.65 }
      });
    }
    handleLinkedVictories(result.linkedVictories);
    fetchState();
  };

  const updateExamQuestions = async (id, questionData) => {
    playClick();
    const result = await mutate(`/api/questions/${id}`, { method: 'PUT', body: questionData, refreshOnSuccess: false });
    if (!result) return;
    if (result.rewardResult) handleRewardResponse(result.rewardResult, 'Questões atualizadas.');
    handleLinkedVictories(result.linkedVictories);
    fetchState();
  };

  const deleteExamQuestions = async (id) => {
    playClick();
    const result = await mutate(`/api/questions/${id}`, { method: 'DELETE', refreshOnSuccess: false });
    if (!result) return;
    handleLinkedVictories(result.linkedVictories);
    fetchState();
  };

  const addMindMap = async (mapData) => {
    playClick();
    const result = await mutate('/api/mind-maps', { method: 'POST', body: mapData, refreshOnSuccess: false });
    if (!result) throw new Error('Erro ao criar o mapa mental.');
    applyMindMapPayload(result);
    return result.mindMap || null;};

  const updateMindMap = async (id, mapData) => {
    playClick();
    const result = await mutate(`/api/mind-maps/${id}`, { method: 'PUT', body: mapData, refreshOnSuccess: false });
    if (!result) return false;
    applyMindMapPayload(result);
    return true;
  };

  const addMindMapNode = async (mapId, nodeData) => {
    playClick();
    const result = await mutate(`/api/mind-maps/${mapId}/nodes`, { method: 'POST', body: nodeData, refreshOnSuccess: false });
    if (!result) return false;
    applyMindMapPayload(result);
    return true;
  };

  const updateMindMapNode = async (mapId, nodeId, nodeData) => {
    const result = await mutate(`/api/mind-maps/${mapId}/nodes/${nodeId}`, { method: 'PUT', body: nodeData, refreshOnSuccess: false });
    if (!result) return false;
    applyMindMapPayload(result);
    return true;
  };

  const updateMindMapNodes = async (mapId, nodeIds, nodeData) => {
    const ids = Array.isArray(nodeIds) ? nodeIds.filter(Boolean) : [];
    if (!ids.length) return false;
    if (ids.length === 1) return updateMindMapNode(mapId, ids[0], nodeData);
    const result = await mutate(`/api/mind-maps/${mapId}/nodes`, {
      method: 'PUT',
      body: { nodeIds: ids, ...(nodeData || {}) },
      refreshOnSuccess: false
    });
    if (!result) return false;
    applyMindMapPayload(result);
    return true;
  };

  const deleteMindMapNode = async (mapId, nodeId) => {
    playClick();
    const result = await mutate(`/api/mind-maps/${mapId}/nodes/${nodeId}`, { method: 'DELETE', refreshOnSuccess: false });
    if (!result) return false;
    applyMindMapPayload(result);
    return true;
  };

  const addMindMapCrossLink = async (mapId, linkData) => {
    playClick();
    const result = await mutate(`/api/mind-maps/${mapId}/links`, { method: 'POST', body: linkData, refreshOnSuccess: false });
    if (!result) throw new Error('Erro ao criar a ligação.');
    applyMindMapPayload(result);
    return result.mindMap || null;};

  const updateMindMapCrossLink = async (mapId, linkId, linkData) => {
    const result = await mutate(`/api/mind-maps/${mapId}/links/${linkId}`, { method: 'PUT', body: linkData, refreshOnSuccess: false });
    if (!result) return false;
    applyMindMapPayload(result);
    return true;
  };

  const deleteMindMapCrossLink = async (mapId, linkId) => {
    playClick();
    const result = await mutate(`/api/mind-maps/${mapId}/links/${linkId}`, { method: 'DELETE', refreshOnSuccess: false });
    if (!result) return false;
    applyMindMapPayload(result);
    return true;
  };

  const addMindMapBrace = async (mapId, braceData) => {
    playClick();
    const result = await mutate(`/api/mind-maps/${mapId}/braces`, { method: 'POST', body: braceData, refreshOnSuccess: false });
    if (!result) throw new Error('Erro ao criar a chave.');
    applyMindMapPayload(result);
    return result.mindMap || null;};

  const updateMindMapBrace = async (mapId, braceId, braceData) => {
    const result = await mutate(`/api/mind-maps/${mapId}/braces/${braceId}`, { method: 'PUT', body: braceData, refreshOnSuccess: false });
    if (!result) return false;
    applyMindMapPayload(result);
    return true;
  };

  const addBraceLabelNode = async (mapId, braceId, braceData = {}) => {
    playClick();
    const result = await mutate(`/api/mind-maps/${mapId}/braces/${braceId}/label-node`, { method: 'POST', body: braceData, refreshOnSuccess: false });
    if (!result) throw new Error('Erro ao criar o ramo do rótulo.');
    applyMindMapPayload(result);
    return result.mindMap || null;};

  const deleteMindMapBrace = async (mapId, braceId) => {
    playClick();
    const result = await mutate(`/api/mind-maps/${mapId}/braces/${braceId}`, { method: 'DELETE', refreshOnSuccess: false });
    if (!result) return false;
    applyMindMapPayload(result);
    return true;
  };

  const layoutMindMap = async (mapId) => {
    playClick();
    const result = await mutate(`/api/mind-maps/${mapId}/layout`, { method: 'POST', refreshOnSuccess: false });
    if (!result) return false;
    applyMindMapPayload(result);
    return true;
  };

  const studyMindMap = async (mapId, sessionData) => {
    playClick();
    const result = await mutate(`/api/mind-maps/${mapId}/study`, { body: sessionData, refreshOnSuccess: false });
    if (result) {
      if (result.rewardResult) {
        handleRewardResponse(
          result.rewardResult,
          `Mapa: ${result.session.recalled}/${result.session.reviewed} ramos (${result.session.accuracy}%)`
        );
        confetti({
          particleCount: result.session.accuracy >= 80 ? 70 : 40,
          spread: 70,
          origin: { y: 0.65 }
        });
      }
      applyMindMapPayload(result);
      if (result.session) {
        setData((prev) => {
          if (!prev) return prev;
          const sessions = [result.session, ...(prev.mindMapSessions || []).filter(s => s.id !== result.session.id)];
          const next = { ...prev, mindMapSessions: sessions };
          if (result.profile) next.profile = result.profile;
          dataRef.current = next;
          return next;
        });
      }
      return result;
    }
    throw new Error('Erro ao registrar o estudo do mapa.');
  };

  const deleteMindMap = async (id) => {
    playClick();
    const result = await mutate(`/api/mind-maps/${id}`, { method: 'DELETE', refreshOnSuccess: false });
    if (result) {
      setData((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          mindMaps: (prev.mindMaps || []).filter(m => m.id !== id),
          mindMapSessions: (prev.mindMapSessions || []).filter(s => s.mapId !== id)
        };
        if (result.profile) next.profile = result.profile;
        dataRef.current = next;
        return next;
      });
      return true;
    }
    return false;
  };

  const addMindMapCategory = async (categoryData) => {
    playClick();
    const result = await mutate('/api/mind-map-categories', { method: 'POST', body: categoryData, refreshOnSuccess: false });
    if (!result) throw new Error('Erro ao criar o assunto.');
    applyMindMapCategories(result);
    return true;
  };

  const updateMindMapCategory = async (id, categoryData) => {
    playClick();
    const result = await mutate(`/api/mind-map-categories/${id}`, { method: 'PUT', body: categoryData, refreshOnSuccess: false });
    if (!result) return false;
    applyMindMapCategories(result);
    return true;
  };

  const deleteMindMapImage = async (url) => {
    playClick();
    const result = await mutate('/api/mind-map-images', { method: 'DELETE', body: { url }, refreshOnSuccess: false });
    if (result) {
      setData((prev) => {
        if (!prev) return prev;
        const next = { ...prev };
        if (result.images) next.mindMapImages = result.images;
        if (result.mindMaps) next.mindMaps = result.mindMaps;
        dataRef.current = next;
        return next;
      });
      return true;
    }
    return false;
  };

  const deleteMindMapCategory = async (id) => {
    playClick();
    const result = await mutate(`/api/mind-map-categories/${id}`, { method: 'DELETE', refreshOnSuccess: false });
    if (!result) return false;
    applyMindMapCategories(result);
    return true;
  };

  const deleteMindMapSession = async (id) => {
    playClick();
    const result = await mutate(`/api/mind-map-sessions/${id}`, { method: 'DELETE', refreshOnSuccess: false });
    if (result) {
      setData((prev) => {
        if (!prev) return prev;
        const next = {
          ...prev,
          mindMapSessions: (prev.mindMapSessions || []).filter(s => s.id !== id)
        };
        if (result.profile) next.profile = result.profile;
        dataRef.current = next;
        return next;
      });
      return true;
    }
    return false;
  };

  // 3. Process Actions
  const addProcess = async (processData) => {
    playClick();
    await mutate('/api/processes', { method: 'POST', body: processData });
  };

  const stepProcess = async (processId, stepData) => {
    playBossHit();
    const result = await mutate(`/api/processes/${processId}/step`, { body: stepData, refreshOnSuccess: false });
    if (!result) return;
    handleRewardResponse(result.rewardResult, `Processo: +${result.step.unitsAdded} ${result.process.unitName}!`);
    fetchState();
  };

  const deleteProcess = async (id) => {
    playClick();
    await mutate(`/api/processes/${id}`, { method: 'DELETE' });
  };

  // 4. Habit Actions
  const addHabit = async (habitData) => {
    playClick();
    await mutate('/api/habits', { method: 'POST', body: habitData });
  };

  const toggleHabit = async (id, date = null, extra = {}) => {
    playClick();
    const result = await mutate(`/api/habits/${id}/toggle`, {
      body: { ...(date ? { date } : {}), ...(extra || {}) },
      refreshOnSuccess: false
    });
    if (result) {
      if (result.done && result.rewardResult) {
        const targetDate = result.targetDate;
        const dateParts = targetDate ? targetDate.split('-') : [];
        const dateLabel = (!date || date === targetDate) && dateParts.length === 3
          ? `${dateParts[2]}/${dateParts[1]}`
          : 'Data anterior';
        const displayLabel = result.doneToday && (!date || date === result.targetDate) ? 'Hoje' : dateLabel;

        handleRewardResponse(result.rewardResult, `Hábito Realizado (${displayLabel})! 🔥 Sequência: ${result.habit.currentStreak}`);
        confetti({
          particleCount: 35,
          spread: 50,
          origin: { y: 0.7 }
        });
      }
      fetchState();
    }
  };

  const updateHabit = async (id, habitData) => {
    playClick();
    await mutate(`/api/habits/${id}`, { method: 'PUT', body: habitData });
  };

  const deleteHabit = async (id) => {
    playClick();
    await mutate(`/api/habits/${id}`, { method: 'DELETE' });
  };

  // 5. Rewards Actions
  const addReward = async (rewardData) => {
    playClick();
    await mutate('/api/rewards', { method: 'POST', body: rewardData });
  };

  const spendMoney = async ({ amountBrl, item, notes } = {}) => {
    playCoin();
    const result = await mutate('/api/rewards/spend-money', {
      body: { amountBrl, item, notes },
      refreshOnSuccess: false
    });
    if (!result) return { success: false };
    const spent = result.redemption || {};
    showRewardToast(0, -(spent.cost || 0), `Gastou ${formatBrl(spent.amountBrl)} com ${spent.rewardTitle}!`);
    fetchState();
    return { success: true, result };
  };

  const redeemReward = async (id) => {
    playCoin();
    const result = await mutate(`/api/rewards/${id}/redeem`, { refreshOnSuccess: false });
    if (!result) return;
    showRewardToast(0, -(result.redemption.cost ?? result.redemption.costCoins ?? 0), `Resgatado: ${result.reward.title}!`);
    confetti({ particleCount: 70, spread: 70, origin: { y: 0.6 } });
    fetchState();
  };

  const cancelRewardRedemption = async (redemptionId) => {
    playCoin();
    const result = await mutate(`/api/rewards/redemptions/${redemptionId}/cancel`, { refreshOnSuccess: false });
    if (!result) return;
    showRewardToast(0, result.refundedCoins, `Resgate cancelado (+${result.refundedCoins} moedas devolvidas)!`);
    fetchState();
  };

  const deleteReward = async (id) => {
    playClick();
    await mutate(`/api/rewards/${id}`, { method: 'DELETE' });
  };

  // 6. Boss Actions
  const resetBoss = async () => {
    playClick();
    await mutate('/api/boss/reset');
  };

  const setCurrentLocation = async (location, manual = true) => {
    playClick();
    const json = await mutate('/api/next-action/location', { body: { location, manual }, refreshOnSuccess: false });
    if (json) {
      setData(prev => {
        if (!prev) return prev;
        const { success, userProfile, locations, ...nextAction } = json;
        return {
          ...prev,
          userProfile: userProfile || prev.userProfile,
          nextAction,
          locations: locations || prev.locations
        };
      });
    }
  };

  const applyNextAction = (json) => {
    setData(prev => {
      if (!prev) return prev;
      const { success, locations, userProfile, ...nextAction } = json;
      return {
        ...prev,
        userProfile: userProfile || prev.userProfile,
        nextAction,
        locations: locations || prev.locations
      };
    });
  };

  const refreshNextAction = async ({ location, snoozedIds, consult = true } = {}) => {
    // A consulta ao Jev é POST: um GET que grava decisão era disparado por
    // qualquer recarga da tela e poluía a memória do Oráculo.
    if (consult) {
      const json = await mutate('/api/next-action/consult', {
        body: { location, snoozedIds },
        refreshOnSuccess: false,
        toastOnError: false
      });
      if (!json || json.__error) return { ok: false, error: json?.error || 'Não foi possível consultar o Oráculo.' };
      applyNextAction(json);
      return { ok: true };
    }
    const params = new URLSearchParams();
    if (location) params.set('location', location);
    if (Array.isArray(snoozedIds) && snoozedIds.length > 0) {
      params.set('snoozed', snoozedIds.join(','));
    }
    const query = params.toString();
    const res = await fetch(`/api/next-action${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders()
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json.error || 'Não foi possível carregar a indicação.' };
    applyNextAction(json);
    return { ok: true };
  };

  const saveOpenRouterKey = async (apiKey) => {
    const json = await mutate('/api/integrations/openrouter', {
      method: 'PUT',
      body: { apiKey },
      refreshOnSuccess: false,
      toastOnError: false
    });
    if (!json || json.__error) return { ok: false, error: json?.error || 'Não foi possível guardar a chave.' };
    setData(prev => prev ? { ...prev, openRouter: json.openRouter } : prev);
    return { ok: true, openRouter: json.openRouter };
  };

  const submitOracleEnergy = async ({ text, location, snoozedIds } = {}) => {
    const json = await mutate('/api/next-action/energy', {
      body: { text, location, snoozedIds },
      refreshOnSuccess: false,
      toastOnError: false
    });
    if (!json || json.__error) return { ok: false, error: json?.error || 'Não foi possível ler a energia.' };
    applyNextAction(json);
    return { ok: true, energyError: json.energyError || null, energy: json.energy || null };
  };

  // Pular a energia vale por uma janela no servidor: sem isso a pergunta
  // voltava na próxima atualização da tela.
  const skipOracleEnergy = async ({ location, snoozedIds } = {}) => {
    const json = await mutate('/api/next-action/skip-energy', {
      body: { location, snoozedIds },
      refreshOnSuccess: false,
      toastOnError: false
    });
    if (!json || json.__error) return { ok: false, error: json?.error || 'Não foi possível indicar agora.' };
    applyNextAction(json);
    return { ok: true };
  };

  const declineOracleSuggestion = async ({ decisionId, reason, note, location, snoozedIds } = {}) => {
    const json = await mutate('/api/next-action/decline', {
      body: { decisionId, reason, note, location, snoozedIds },
      refreshOnSuccess: false,
      toastOnError: false
    });
    if (!json || json.__error) return { ok: false, error: json?.error || 'Não foi possível registrar a recusa.' };
    applyNextAction(json);
    return { ok: true };
  };

  const acceptOracleDose = async (decisionId, extra = {}) => {
    const json = await mutate('/api/next-action/accept-dose', {
      body: { decisionId, ...(extra || {}) },
      refreshOnSuccess: false,
      toastOnError: false
    });
    if (!json || json.__error) return { ok: false, error: json?.error || 'Não foi possível registrar a dose.' };
    return { ok: true, decision: json.decision };
  };

  // 7. Profile Actions
  const startAguPlan = async () => {
    playClick();
    await mutate('/api/agu-plan/start');
  };

  const advanceAguCycle = async () => {
    playClick();
    await mutate('/api/agu-plan/advance');
  };

  const logAguProduct = async (key, note) => {
    playClick();
    await mutate('/api/agu-plan/log-product', { body: { key, note } });
  };

  const updateAguPlan = async (planPatch) => {
    playClick();
    await mutate('/api/agu-plan', { method: 'PUT', body: { plan: planPatch } });
  };

  const toggleAguBlock = async (key, extra = {}) => {
    playClick();
    const result = await mutate('/api/agu-plan/toggle-block', { body: { key, ...extra }, refreshOnSuccess: false });
    if (!result) return;
    handleLinkedVictories(result.linkedVictories);
    fetchState();
  };

  const setAguBlockDuration = async (key, durationMinutes, options = {}) => {
    playClick();
    const mode = options.mode === 'add' ? 'add' : 'set';
    const result = await mutate('/api/agu-plan/block-duration', {
      body: { key, durationMinutes, mode },
      refreshOnSuccess: false
    });
    if (!result) return;
    handleLinkedVictories(result.linkedVictories);
    fetchState();
  };

  const addAguBlockDuration = async (key, durationMinutes) => {
    await setAguBlockDuration(key, durationMinutes, { mode: 'add' });
  };

  const updateAguBlock = async (payload) => {
    playClick();
    const result = await mutate('/api/agu-plan/block', { method: 'PUT', body: payload, refreshOnSuccess: false });
    if (!result) return;
    handleLinkedVictories(result.linkedVictories);
    fetchState();
  };

  const deleteAguBlock = async (key) => {
    playClick();
    const result = await mutate('/api/agu-plan/block/delete', { body: { key }, refreshOnSuccess: false });
    if (!result) return;
    handleLinkedVictories(result.linkedVictories);
    fetchState();
  };

  const realignAguCycle = async () => {
    playClick();
    await mutate('/api/agu-plan/realign');
  };

  const addNinetyDayGoal = async (goalData) => {
    playClick();
    const result = await mutate('/api/ninety-day-goals', { body: goalData, refreshOnSuccess: false });
    if (!result) throw new Error('Erro ao criar a meta de 90 dias.');
    fetchState();
    return { success: true };
  };

  const updateNinetyDayGoal = async (id, goalData) => {
    playClick();
    const result = await mutate(`/api/ninety-day-goals/${id}`, { method: 'PUT', body: goalData, refreshOnSuccess: false });
    if (!result) throw new Error('Erro ao atualizar a meta de 90 dias.');
    fetchState();
    return { success: true };
  };

  const logNinetyDayGoalProgress = async (id, progressData) => {
    playClick();
    const result = await mutate(`/api/ninety-day-goals/${id}/progress`, { body: progressData, refreshOnSuccess: false });
    if (result) {
      if (result.rewardResult) {
        const just = result.justCompleted || {};
        const label = just.goal
          ? 'Meta de 90 dias conquistada!'
          : just.month
            ? 'Mês da meta fechado!'
            : just.fortnight
              ? 'Quinzena da meta fechada!'
              : just.week
                ? 'Semana da meta fechada!'
                : 'Avanço na meta de 90 dias!';
        handleRewardResponse(result.rewardResult, label);
        if (just.goal) {
          confetti({ particleCount: 110, spread: 80, origin: { y: 0.6 } });
        }
      }
      fetchState();
      return { success: true, result };
    }
    throw new Error('Erro ao registrar o avanço.');
  };

  const deleteNinetyDayGoalLog = async (goalId, logId) => {
    playClick();
    const result = await mutate(`/api/ninety-day-goals/${goalId}/logs/${logId}`, { method: 'DELETE', refreshOnSuccess: false });
    if (!result) throw new Error('Erro ao estornar o avanço.');
    fetchState();
    return { success: true };
  };

  const addDailyVictory = async (victoryData) => {
    playClick();
    const result = await mutate('/api/daily-victories', { body: victoryData, refreshOnSuccess: false });
    if (!result) throw new Error('Erro ao cadastrar a vitória planejada.');
    fetchState();
    return { success: true };
  };

  const updateDailyVictory = async (id, victoryData) => {
    playClick();
    const result = await mutate(`/api/daily-victories/${id}`, { method: 'PUT', body: victoryData, refreshOnSuccess: false });
    if (!result) throw new Error('Erro ao atualizar a vitória planejada.');
    fetchState();
    return { success: true };
  };

  const completeDailyVictory = async (id, extra = {}) => {
    playClick();
    const result = await mutate(`/api/daily-victories/${id}/complete`, { body: extra || {}, refreshOnSuccess: false });
    if (result) {
      if (!result.stateUnchanged) {
        if (result.willComplete) {
          if (result.rewardResult) {
            handleRewardResponse(result.rewardResult, `Vitória: ${result.victory.title}`);
          }
          if (result.bonusAwardedNow && result.bonusRewardResult) {
            handleRewardResponse(result.bonusRewardResult, 'Tríade de vitórias conquistada!');
            confetti({ particleCount: 90, spread: 80, origin: { y: 0.55 } });
          } else {
            confetti({ particleCount: 36, spread: 55, origin: { y: 0.7 } });
          }
        } else {
          showRewardToast(
            -(result.rewardResult?.revertedXp || 40),
            -(result.rewardResult?.revertedCoins || 12),
            `Vitória reaberta: ${result.victory.title}`
          );
        }
      }
      fetchState();
      return { success: true, result };
    }
    throw new Error('Erro ao registrar a vitória.');
  };

  const deleteDailyVictory = async (id) => {
    playClick();
    const result = await mutate(`/api/daily-victories/${id}`, { method: 'DELETE', refreshOnSuccess: false });
    if (!result) throw new Error('Erro ao excluir a vitória planejada.');
    fetchState();
    return { success: true };
  };

  const deleteNinetyDayGoal = async (id) => {
    playClick();
    const result = await mutate(`/api/ninety-day-goals/${id}`, { method: 'DELETE', refreshOnSuccess: false });
    if (!result) throw new Error('Erro ao excluir a meta de 90 dias.');
    fetchState();
    return { success: true };
  };

  const resetAguPlan = async () => {
    playClick();
    await mutate('/api/agu-plan/reset');
  };

  const updateProfile = async (profileData) => {
    playClick();
    await mutate('/api/profile', { method: 'POST', body: profileData });
  };

  return {
    data,
    loading,
    error,
    refresh,
    rewardPopups,
    levelUpData,
    closeLevelUpModal: () => setLevelUpData(null),
    muted,
    toggleMute,
    playClick,
    addQuest,
    updateQuest,
    completeQuest,
    deleteQuest,
    addQuestCategory,
    updateQuestCategory,
    deleteQuestCategory,
    addBook,
    updateBook,
    logReadingSession,
    updateReadingSession,
    deleteReadingSession,
    deleteBook,
    addBookQuote,
    updateBookQuote,
    deleteBookQuote,
    addExamQuestions,
    updateExamQuestions,
    deleteExamQuestions,
    addProcess,
    stepProcess,
    deleteProcess,
    addHabit,
    updateHabit,
    toggleHabit,
    deleteHabit,
    addReward,
    spendMoney,
    redeemReward,
    cancelRewardRedemption,
    deleteReward,
    resetBoss,
    updateProfile,
    setCurrentLocation,
    refreshNextAction,
    submitOracleEnergy,
    skipOracleEnergy,
    saveOpenRouterKey,
    declineOracleSuggestion,
    acceptOracleDose,
    startAguPlan,
    updateAguPlan,
    toggleAguBlock,
    setAguBlockDuration,
    addAguBlockDuration,
    updateAguBlock,
    deleteAguBlock,
    realignAguCycle,
    resetAguPlan,
    advanceAguCycle,
    logAguProduct,
    addNinetyDayGoal,
    updateNinetyDayGoal,
    logNinetyDayGoalProgress,
    deleteNinetyDayGoalLog,
    deleteNinetyDayGoal,
    addDailyVictory,
    updateDailyVictory,
    completeDailyVictory,
    deleteDailyVictory,
    addMindMap,
    updateMindMap,
    addMindMapNode,
    updateMindMapNode,
    updateMindMapNodes,
    deleteMindMapNode,
    addMindMapCrossLink,
    updateMindMapCrossLink,
    deleteMindMapCrossLink,
    addMindMapBrace,
    updateMindMapBrace,
    addBraceLabelNode,
    deleteMindMapBrace,
    layoutMindMap,
    studyMindMap,
    deleteMindMap,
    deleteMindMapSession,
    addMindMapCategory,
    updateMindMapCategory,
    deleteMindMapCategory,
    deleteMindMapImage
  };
}
