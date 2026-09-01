import { useState, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { useSoundEffects } from './useSoundEffects';
import { formatBrl } from '../utils/coinExchange.js';

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

  const {
    muted,
    toggleMute,
    playSuccess,
    playCoin,
    playLevelUp,
    playBossHit,
    playClick
  } = useSoundEffects();

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/state', {
        headers: getAuthHeaders()
      });
      if (!res.ok) throw new Error('Falha ao comunicar com o servidor.');
      const json = await res.json();
      setData(json);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();

    // Frontend Keep-Alive Heartbeat (every 7 minutes to keep Render alive while tab is open)
    const heartbeat = setInterval(() => {
      fetch('/api/health').catch(() => {});
    }, 7 * 60 * 1000);

    return () => clearInterval(heartbeat);
  }, [fetchState]);

  // Trigger floating reward popup
  const showRewardToast = useCallback((xp, coins, text) => {
    const id = Date.now() + Math.random();
    setRewardPopups(prev => [...prev, { id, xp, coins, text }]);
    setTimeout(() => {
      setRewardPopups(prev => prev.filter(p => p.id !== id));
    }, 2500);
  }, []);

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
      setTimeout(() => {
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.5 }
        });
      }, 500);
    }
  }, [playLevelUp, playSuccess, showRewardToast]);

  // 1. Quests Actions
  const addQuest = async (questData) => {
    playClick();
    const res = await fetch('/api/quests', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(questData)
    });
    if (res.ok) fetchState();
  };

  const updateQuest = async (id, questData) => {
    playClick();
    const res = await fetch(`/api/quests/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(questData)
    });
    if (res.ok) fetchState();
  };

  const completeQuest = async (id) => {
    playClick();
    const res = await fetch(`/api/quests/${id}/complete`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const result = await res.json();
      if (result.willComplete) {
        if (result.rewardResult) {
          handleRewardResponse(result.rewardResult, `Missão Cumprida: ${result.quest.title}`);
          confetti({
            particleCount: 40,
            spread: 60,
            origin: { y: 0.7 }
          });
        }
      } else {
        // Uncompleted / Reopened
        showRewardToast(
          -result.quest.xpReward,
          -result.quest.coinReward,
          `Missão reaberta: ${result.quest.title} (estorno aplicado)`
        );
      }
      fetchState();
    }
  };

  const deleteQuest = async (id) => {
    playClick();
    const res = await fetch(`/api/quests/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) fetchState();
  };

  // 1.5. Quest Categories CRUD
  const addQuestCategory = async (categoryData) => {
    playClick();
    const res = await fetch('/api/quest-categories', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(categoryData)
    });
    if (res.ok) {
      fetchState();
    } else {
      const errJson = await res.json().catch(() => ({}));
      showRewardToast(0, 0, errJson.error || 'Erro ao criar categoria.');
    }
  };

  const updateQuestCategory = async (id, categoryData) => {
    playClick();
    const res = await fetch(`/api/quest-categories/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(categoryData)
    });
    if (res.ok) {
      fetchState();
    } else {
      const errJson = await res.json().catch(() => ({}));
      showRewardToast(0, 0, errJson.error || 'Erro ao atualizar categoria.');
    }
  };

  const deleteQuestCategory = async (id) => {
    playClick();
    const res = await fetch(`/api/quest-categories/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      fetchState();
    } else {
      const errJson = await res.json().catch(() => ({}));
      showRewardToast(0, 0, errJson.error || 'Erro ao excluir categoria.');
    }
  };

  // 2. Books Actions
  const addBook = async (bookData) => {
    playClick();
    const res = await fetch('/api/books', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(bookData)
    });
    if (res.ok) fetchState();
  };

  const updateBook = async (id, bookData) => {
    playClick();
    const res = await fetch(`/api/books/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(bookData)
    });
    if (res.ok) fetchState();
  };

  const logReadingSession = async (bookId, sessionData) => {
    playClick();
    const res = await fetch(`/api/books/${bookId}/reading-session`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(sessionData)
    });
    if (res.ok) {
      const result = await res.json();
      handleRewardResponse(result.rewardResult, `Leitura: +${result.session.pagesRead} páginas!`);
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 }
      });
      fetchState();
    }
  };

  const updateReadingSession = async (sessionId, sessionData) => {
    playClick();
    const res = await fetch(`/api/reading-sessions/${sessionId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(sessionData)
    });
    if (res.ok) {
      fetchState();
    } else {
      const errJson = await res.json().catch(() => ({}));
      showRewardToast(0, 0, errJson.error || 'Erro ao atualizar sessão de leitura.');
    }
  };

  const deleteReadingSession = async (sessionId) => {
    playClick();
    const res = await fetch(`/api/reading-sessions/${sessionId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      fetchState();
    } else {
      const errJson = await res.json().catch(() => ({}));
      showRewardToast(0, 0, errJson.error || 'Erro ao excluir sessão de leitura.');
    }
  };

  const deleteBook = async (id) => {
    playClick();
    const res = await fetch(`/api/books/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) fetchState();
  };

  const addBookQuote = async (bookId, quoteData) => {
    playClick();
    const res = await fetch(`/api/books/${bookId}/quotes`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(quoteData)
    });
    if (res.ok) {
      const result = await res.json();
      if (result.rewardResult) {
        handleRewardResponse(result.rewardResult, `Citação salva no tomo!`);
      }
      fetchState();
    }
  };

  const updateBookQuote = async (bookId, quoteId, quoteData) => {
    playClick();
    const res = await fetch(`/api/books/${bookId}/quotes/${quoteId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(quoteData)
    });
    if (res.ok) fetchState();
  };

  const deleteBookQuote = async (bookId, quoteId) => {
    playClick();
    const res = await fetch(`/api/books/${bookId}/quotes/${quoteId}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) fetchState();
  };

  // 2.5. Exam Questions Actions
  const addExamQuestions = async (questionData) => {
    playBossHit();
    const res = await fetch('/api/questions', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(questionData)
    });
    if (res.ok) {
      const result = await res.json();
      if (result.rewardResult) {
        handleRewardResponse(result.rewardResult, `Treino: ${result.examQuestion.correctAnswers}/${result.examQuestion.totalQuestions} acertos (${result.examQuestion.accuracyRate}%)!`);
        confetti({
          particleCount: result.examQuestion.accuracyRate >= 80 ? 70 : 40,
          spread: 70,
          origin: { y: 0.65 }
        });
      }
      fetchState();
    } else {
      const errJson = await res.json().catch(() => ({}));
      showRewardToast(0, 0, errJson.error || 'Erro ao registrar questões.');
    }
  };

  const updateExamQuestions = async (id, questionData) => {
    playClick();
    const res = await fetch(`/api/questions/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(questionData)
    });
    if (res.ok) fetchState();
  };

  const deleteExamQuestions = async (id) => {
    playClick();
    const res = await fetch(`/api/questions/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) fetchState();
  };

  // 3. Process Actions
  const addProcess = async (processData) => {
    playClick();
    const res = await fetch('/api/processes', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(processData)
    });
    if (res.ok) fetchState();
  };

  const stepProcess = async (processId, stepData) => {
    playBossHit();
    const res = await fetch(`/api/processes/${processId}/step`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(stepData)
    });
    if (res.ok) {
      const result = await res.json();
      handleRewardResponse(result.rewardResult, `Processo: +${result.step.unitsAdded} ${result.process.unitName}!`);
      fetchState();
    }
  };

  const deleteProcess = async (id) => {
    playClick();
    const res = await fetch(`/api/processes/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) fetchState();
  };

  // 4. Habit Actions
  const addHabit = async (habitData) => {
    playClick();
    const res = await fetch('/api/habits', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(habitData)
    });
    if (res.ok) fetchState();
  };

  const toggleHabit = async (id, date = null) => {
    playClick();
    const res = await fetch(`/api/habits/${id}/toggle`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(date ? { date } : {})
    });
    if (res.ok) {
      const result = await res.json();
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
    const res = await fetch(`/api/habits/${id}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(habitData)
    });
    if (res.ok) fetchState();
  };

  const deleteHabit = async (id) => {
    playClick();
    const res = await fetch(`/api/habits/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) fetchState();
  };

  // 5. Rewards Actions
  const addReward = async (rewardData) => {
    playClick();
    const res = await fetch('/api/rewards', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(rewardData)
    });
    if (res.ok) fetchState();
  };

  const spendMoney = async ({ amountBrl, item, notes } = {}) => {
    playCoin();
    const res = await fetch('/api/rewards/spend-money', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ amountBrl, item, notes })
    });
    if (res.ok) {
      const result = await res.json();
      const spent = result.redemption || {};
      showRewardToast(
        0,
        -(spent.cost || 0),
        `Gastou ${formatBrl(spent.amountBrl)} com ${spent.rewardTitle}!`
      );
      fetchState();
      return { success: true, result };
    }

    const errJson = await res.json().catch(() => ({}));
    showRewardToast(0, 0, errJson.error || 'Erro ao registrar gasto.');
    return { success: false, error: errJson.error };
  };

  const redeemReward = async (id) => {
    playCoin();
    const res = await fetch(`/api/rewards/${id}/redeem`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const result = await res.json();
      showRewardToast(0, -result.redemption.cost, `Resgatado: ${result.reward.title}!`);
      confetti({
        particleCount: 70,
        spread: 70,
        origin: { y: 0.6 }
      });
      fetchState();
    } else {
      const errJson = await res.json().catch(() => ({}));
      showRewardToast(0, 0, errJson.error || 'Erro ao resgatar recompensa.');
    }
  };

  const cancelRewardRedemption = async (redemptionId) => {
    playCoin();
    const res = await fetch(`/api/rewards/redemptions/${redemptionId}/cancel`, {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (res.ok) {
      const result = await res.json();
      showRewardToast(0, result.refundedCoins, `Resgate cancelado (+${result.refundedCoins} moedas devolvidas)!`);
      fetchState();
    } else {
      const errJson = await res.json().catch(() => ({}));
      showRewardToast(0, 0, errJson.error || 'Erro ao cancelar resgate.');
    }
  };

  const deleteReward = async (id) => {
    playClick();
    const res = await fetch(`/api/rewards/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders()
    });
    if (res.ok) fetchState();
  };

  // 6. Boss Actions
  const resetBoss = async () => {
    playClick();
    const res = await fetch('/api/boss/reset', {
      method: 'POST',
      headers: getAuthHeaders()
    });
    if (res.ok) fetchState();
  };

  const setCurrentLocation = async (location, manual = true) => {
    playClick();
    const res = await fetch('/api/next-action/location', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ location, manual })
    });
    if (res.ok) {
      const json = await res.json();
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

  const refreshNextAction = async ({ location, snoozedIds } = {}) => {
    const params = new URLSearchParams();
    if (location) params.set('location', location);
    if (Array.isArray(snoozedIds) && snoozedIds.length > 0) {
      params.set('snoozed', snoozedIds.join(','));
    }
    const query = params.toString();
    const res = await fetch(`/api/next-action${query ? `?${query}` : ''}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) return false;
    const json = await res.json();
    setData(prev => {
      if (!prev) return prev;
      const { success, locations, ...nextAction } = json;
      return {
        ...prev,
        nextAction,
        locations: locations || prev.locations
      };
    });
    return true;
  };

  // 7. Profile Actions
  const updateProfile = async (profileData) => {
    playClick();
    const res = await fetch('/api/profile', {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(profileData)
    });
    if (res.ok) fetchState();
  };

  return {
    data,
    loading,
    error,
    refresh: fetchState,
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
    refreshNextAction
  };
}
