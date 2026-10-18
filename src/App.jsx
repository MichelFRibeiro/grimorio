import React, { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useGameData } from './hooks/useGameData';
import { Header } from './components/Header';
import { BossRaid } from './components/BossRaid';
import { DailyVictoriesCard } from './components/DailyVictoriesCard';
import { NextActionCard } from './components/NextActionCard';
import { LevelUpModal } from './components/LevelUpModal';
import { DestinyChestModal } from './components/DestinyChestModal';
import { JudgmentModal } from './components/JudgmentModal';
import { FloatingToasts } from './components/FloatingToasts';
import { Scroll, Target, BookOpen, BookMarked, Layers, Flame, Gift, Compass, Scale, Headphones, Network, Sun, Pill, Smartphone, GitCompare, MessagesSquare, ListOrdered, NotebookPen } from 'lucide-react';
import { isFeatureEnabled, isTabEnabled } from './utils/featureSettings';
import { getHabitDueStatus } from './utils/habitFrequency';
import { getHabitWeeklyStats } from './utils/timeUtils';
import { useFocusPlayer } from './hooks/useFocusPlayer';
import { getSaoPauloDateStr, addDaysToDateStr, getSaoPauloDayOfWeek } from './utils/timeUtils';
import { summarizePlan, getAguStudyLoadSeries } from './utils/aguCycle';
import { getReadingLoadSeries, getScriptureLoadSeries } from './utils/homeostasis';
import { getHabitLoadSeries, habitHomeostasisEnabled } from './utils/habitHomeostasis';
import { PhoneTimePrompt } from './components/PhoneTimePrompt';
import { needsYesterdayPhonePrompt, yesterdayDateStr } from './utils/phoneTime';

const LoginView = lazy(() => import('./components/LoginView').then((m) => ({ default: m.LoginView })));
const TodayView = lazy(() => import('./components/TodayView').then((m) => ({ default: m.TodayView })));
const EveningReviewModal = lazy(() => import('./components/TodayView').then((m) => ({ default: m.EveningReviewModal })));
const WeeklyReviewModal = lazy(() => import('./components/TodayView').then((m) => ({ default: m.WeeklyReviewModal })));
const QuickCapture = lazy(() => import('./components/TodayView').then((m) => ({ default: m.QuickCapture })));
const ShortcutsHelp = lazy(() => import('./components/TodayView').then((m) => ({ default: m.ShortcutsHelp })));

const QuestsView = lazy(() => import('./components/QuestsView').then((m) => ({ default: m.QuestsView })));
const QuestionsView = lazy(() => import('./components/QuestionsView').then((m) => ({ default: m.QuestionsView })));
const BooksView = lazy(() => import('./components/BooksView').then((m) => ({ default: m.BooksView })));
const ScriptureView = lazy(() => import('./components/ScriptureView').then((m) => ({ default: m.ScriptureView })));
const ProcessesView = lazy(() => import('./components/ProcessesView').then((m) => ({ default: m.ProcessesView })));
const HabitsView = lazy(() => import('./components/HabitsView').then((m) => ({ default: m.HabitsView })));
const RoutinesView = lazy(() => import('./components/RoutinesView').then((m) => ({ default: m.RoutinesView })));
const SupplementsView = lazy(() => import('./components/SupplementsView').then((m) => ({ default: m.SupplementsView })));
const RewardsShop = lazy(() => import('./components/RewardsShop').then((m) => ({ default: m.RewardsShop })));
const OracleAnalytics = lazy(() => import('./components/OracleAnalytics').then((m) => ({ default: m.OracleAnalytics })));
const MindMapsView = lazy(() => import('./components/MindMapsView').then((m) => ({ default: m.MindMapsView })));
const AguCampaignView = lazy(() => import('./components/AguCampaignView').then((m) => ({ default: m.AguCampaignView })));
const CorrelationsView = lazy(() => import('./components/CorrelationsView').then((m) => ({ default: m.CorrelationsView })));
const PhoneTimeView = lazy(() => import('./components/PhoneTimeView').then((m) => ({ default: m.PhoneTimeView })));
const JournalView = lazy(() => import('./components/JournalView').then((m) => ({ default: m.JournalView })));
const ChatRoomView = lazy(() => import('./components/ChatRoomView').then((m) => ({ default: m.ChatRoomView })));
const FocusChamberView = lazy(() => import('./components/FocusPlayer').then((m) => ({ default: m.FocusChamberView })));
const JudgmentHistory = lazy(() => import('./components/JudgmentHistory').then((m) => ({ default: m.JudgmentHistory })));
const SettingsView = lazy(() => import('./components/SettingsView').then((m) => ({ default: m.SettingsView })));

function TabFallback() {
  return (
    <div className="glass-panel tab-fallback" role="status">
      Abrindo…
    </div>
  );
}

export function App() {
  const [activeTab, setActiveTab] = useState(null);
  const focusPlayer = useFocusPlayer();

  const {
    user,
    isAuthenticated,
    loadingAuth,
    googleClientId,
    guestEnabled,
    emailLoginEnabled,
    loginWithGoogle,
    loginWithEmail,
    loginAsGuest,
    logout
  } = useAuth();

  const {
    data,
    loading,
    error,
    refresh,
    rewardPopups,
    levelUpData,
    closeLevelUpModal,
    activeChest,
    closeChestReveal,
    muted,
    toggleMute,
    playClick,
    addQuest,
    updateQuest,
    completeQuest,
    updateQuestDuration,
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
    saveScriptureLiveDraft,
    clearScriptureLiveDraft,
    logScriptureSession,
    updateScriptureSession,
    deleteScriptureSession,
    addScriptureQuote,
    updateScriptureQuote,
    deleteScriptureQuote,
    addScriptureReflection,
    deleteScriptureReflection,
    addExamQuestions,
    updateExamQuestions,
    deleteExamQuestions,
    addProcess,
    stepProcess,
    deleteProcess,
    addHabit,
    updateHabit,
    toggleHabit,
    updateHabitDuration,
    deleteHabit,
    addRoutine,
    updateRoutine,
    advanceRoutine,
    deleteRoutine,
    addSupplement,
    updateSupplement,
    deleteSupplement,
    logSupplementIntake,
    updateSupplementLog,
    deleteSupplementLog,
    addReward,
    spendMoney,
    redeemReward,
    cancelRewardRedemption,
    deleteReward,
    resetBoss,
    acknowledgePenalties,
    contestPenalty,
    setCurrentLocation,
    refreshNextAction,
    submitOracleEnergy,
    skipOracleEnergy,
    saveOpenRouterKey,
    listChatModels,
    createChatRoom,
    updateChatRoom,
    deleteChatRoom,
    sendChatMessage,
    deleteChatMessage,
    summonChatModel,
    declineOracleSuggestion,
    breakDownQuest,
    rescheduleQuests,
    acceptOracleDose,
    startAguPlan,
    toggleAguBlock,
    setAguBlockDuration,
    addAguBlockDuration,
    updateAguBlock,
    deleteAguBlock,
    realignAguCycle,
    resetAguPlan,
    advanceAguCycle,
    logAguProduct,
    addAguError,
    reviewAguError,
    deleteAguError,
    updateAguPlan,
    closeDay,
    fetchEveningReview,
    fetchWeeklyReview,
    saveWeeklyPlan,
    toggleWeeklyFocus,
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
    addMindMapCategory,
    updateMindMapCategory,
    deleteMindMapCategory,
    deleteMindMapImage,
    savePhoneTime,
    deletePhoneTime,
    saveJournalEntry,
    deleteJournalEntry,
    updateProfile
  } = useGameData();

  const [captureOpen, setCaptureOpen] = useState(false);
  const [showJudgmentHistory, setShowJudgmentHistory] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [eveningOpen, setEveningOpen] = useState(false);
  const [eveningReview, setEveningReview] = useState(null);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [weeklyReview, setWeeklyReview] = useState(null);
  const [lastQuestCategory, setLastQuestCategory] = useState('');
  const [phonePromptSnoozed, setPhonePromptSnoozed] = useState(false);
  const [phonePromptBusy, setPhonePromptBusy] = useState(false);

  const focusEnabled = isFeatureEnabled(data?.userProfile?.featureSettings, 'focus');
  useEffect(() => {
    if (!focusEnabled) focusPlayer.stop();
  }, [focusEnabled, focusPlayer]);

  // Sem aba no carregamento. Se a que estava aberta for desligada, recolhe
  // em vez de escolher outra — Configurações só abre no clique do cabeçalho.
  useEffect(() => {
    if (!activeTab || activeTab === 'settings') return;
    if (!isTabEnabled(data?.userProfile?.featureSettings, activeTab)) setActiveTab(null);
  }, [activeTab, data?.userProfile?.featureSettings]);

  const todayStr = getSaoPauloDateStr();
  const homeostasisFloors = useMemo(() => ({
    study: getAguStudyLoadSeries(data?.aguPlan, data?.examQuestions || [], todayStr, {
      mindMapSessions: data?.mindMapSessions || []
    }).homeostasisMinMinutes,
    reading: getReadingLoadSeries(data?.readingSessions || [], todayStr).homeostasisMinMinutes,
    scripture: getScriptureLoadSeries(data?.scriptureSessions || [], todayStr).homeostasisMinMinutes,
    habits: Object.fromEntries((data?.habits || []).flatMap((habit) => {
      const entries = [];
      if (habitHomeostasisEnabled(habit)) {
        const minutes = getHabitLoadSeries(habit, todayStr)?.homeostasisMinMinutes;
        if (minutes != null) entries.push([habit.id, minutes]);
      }
      if (habit.homeostasisCount?.enabled) {
        const amount = getHabitLoadSeries(habit, todayStr, { measure: 'count' })?.homeostasisMinMinutes;
        if (amount != null) entries.push([`${habit.id}:count`, amount]);
      }
      return entries;
    }))
  }), [
    data?.aguPlan,
    data?.examQuestions,
    data?.mindMapSessions,
    data?.readingSessions,
    data?.scriptureSessions,
    data?.habits,
    todayStr
  ]);

  const tabBadges = useMemo(() => {
    const routinesList = data?.routines || [];
    const habitsList = data?.habits || [];
    const questsList = data?.quests || [];
    const questionsList = data?.examQuestions || [];
    const booksList = data?.books || [];
    const processesList = data?.processes || [];
    const mapsList = data?.mindMaps || [];
    const aguPlanObj = data?.aguPlan;
    const now = new Date();

    const routinesDueCount = routinesList.filter(routine => routine.nextHabitId && !routine.completeToday).length;
    const habitsDueCount = habitsList.filter((habit) => {
      const due = getHabitDueStatus(habit, getHabitWeeklyStats(habit, now), now, todayStr);
      return due.due && !due.completedToday;
    }).length;
    const pendingQuestsCount = questsList.filter(q => !q.completed).length;
    const todayQuestionsCount = questionsList.filter(q => (
      (q.date || (q.timestamp ? getSaoPauloDateStr(q.timestamp) : '')) === todayStr
    )).length;
    const activeBooksCount = booksList.filter(b => b.status === 'reading').length;
    const activeProcessesCount = processesList.filter(p => p.status === 'in_progress').length;
    const aguToday = aguPlanObj?.startedAt
      ? summarizePlan(aguPlanObj, questionsList, todayStr).today
      : { totalBlocks: 0, doneCount: 0 };
    const aguTodayRemaining = Math.max(0, (aguToday.totalBlocks || 0) - (aguToday.doneCount || 0));
    const dueMindMapsCount = data?.analytics?.summary?.mindMapBranchesDue
      ?? mapsList.reduce((acc, m) => acc + (m.stats?.dueBranches || 0), 0);
    const todayJournalCount = (data?.journalEntries || []).filter((entry) => entry?.date === todayStr).length;

    return {
      routinesDueCount,
      habitsDueCount,
      pendingQuestsCount,
      todayQuestionsCount,
      activeBooksCount,
      activeProcessesCount,
      aguTodayRemaining,
      dueMindMapsCount,
      todayJournalCount
    };
  }, [
    data?.routines,
    data?.habits,
    data?.quests,
    data?.examQuestions,
    data?.books,
    data?.processes,
    data?.mindMaps,
    data?.aguPlan,
    data?.analytics?.summary?.mindMapBranchesDue,
    data?.journalEntries,
    todayStr
  ]);

  // Atalhos de teclado (n / h / ? / Esc). Precisa ficar ACIMA dos returns
  // antecipados de carregamento, login e erro: um hook depois deles muda a
  // ordem dos hooks entre renders e o React dispara o erro #310.
  useEffect(() => {
    const onKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const tag = event.target?.tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable;
      if (event.key === 'Escape') {
        setCaptureOpen(false);
        setHelpOpen(false);
        setEveningOpen(false);
        setWeeklyOpen(false);
        return;
      }
      if (typing) return;
      if (event.key === 'n' && isFeatureEnabled(data?.userProfile?.featureSettings, 'quests')) {
        event.preventDefault();
        setCaptureOpen(true);
      } else if (event.key === 'h') {
        setActiveTab((current) => (current ? null : current));
      } else if (event.key === '?') {
        setHelpOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [data?.userProfile?.featureSettings]);

  if (loadingAuth || (isAuthenticated && loading)) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0c0e14', color: '#fbbf24' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}>⚔️</div>
          <h2 className="font-cinzel" style={{ fontSize: '1.4rem' }}>Abrindo o Grimório de Missões...</h2>
        </div>
      </div>
    );
  }

  // If not authenticated, render Login Screen
  if (!isAuthenticated) {
    return (
      <Suspense fallback={null}>
        <LoginView
          onGoogleLogin={loginWithGoogle}
          onGuestLogin={loginAsGuest}
          onEmailLogin={loginWithEmail}
          googleClientId={googleClientId}
          guestEnabled={guestEnabled}
          emailLoginEnabled={emailLoginEnabled}
        />
      </Suspense>
    );
  }

  if (error && !data) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0c0e14', color: '#f87171' }}>
        <div style={{ textAlign: 'center', padding: '24px', maxWidth: '400px' }}>
          <h2 className="font-cinzel" style={{ fontSize: '1.4rem', marginBottom: '12px' }}>Erro de Conexão</h2>
          <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '20px' }}>{error}</p>
          <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '20px' }}>
            Nova tentativa automática em alguns segundos…
          </p>
          <button
            onClick={refresh}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              background: '#f59e0b',
              color: '#000',
              fontWeight: 800,
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Tentar Novamente
          </button>
        </div>
      </div>
    );
  }

  const {
    userProfile,
    bossRaid,
    quests,
    questCategories,
    books,
    readingSessions,
    scriptureProgress,
    scriptureSessions,
    scriptureQuotes,
    scriptureReflections,
    scriptureLiveDraft,
    examQuestions,
    aguPlan,
    processes,
    processSteps,
    habits,
    routines,
    supplements,
    supplementLogs,
    rewards,
    rewardRedemptions,
    actionLogs,
    analytics,
    nextAction,
    locations,
    dailyVictories,
    dailyVictoryBonuses,
    today,
    mindMaps,
    mindMapSessions,
    mindMapCategories,
    mindMapImages,
    penalties = [],
    penaltiesPending = []
  } = data || {};

  const weekKey = addDaysToDateStr(todayStr, -getSaoPauloDayOfWeek(todayStr));
  const penaltiesThisWeek = (penalties || []).filter((item) => item && item.weekKey === weekKey && !item.contestedAt).length;
  // O baú espera Level Up e Julgamento fecharem: eles são a notícia maior da ação.
  const chestOnHold = Boolean(levelUpData) || (penaltiesPending || []).length > 0;

  const {
    routinesDueCount,
    habitsDueCount,
    pendingQuestsCount,
    todayQuestionsCount,
    activeBooksCount,
    activeProcessesCount,
    aguTodayRemaining,
    dueMindMapsCount,
    todayJournalCount
  } = tabBadges;

  const openEvening = async () => {
    playClick();
    const review = await fetchEveningReview();
    setEveningReview(review);
    setEveningOpen(true);
  };

  const openWeekly = async () => {
    playClick();
    const review = await fetchWeeklyReview();
    setWeeklyReview(review);
    setWeeklyOpen(true);
  };

  const featureSettings = userProfile?.featureSettings;
  const featureOn = (id) => isFeatureEnabled(featureSettings, id);
  const openTab = (tab) => {
    if (!tab || !isTabEnabled(featureSettings, tab)) return;
    setActiveTab(tab);
  };

  const handleInsightAction = async (action) => {
    if (!action) return;
    if (action.type === 'plan_victory') {
      openTab('today');
      window.setTimeout(() => {
        document.getElementById('planejar-o-dia')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          || document.getElementById('vitorias-do-dia')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }
    if (action.type === 'reschedule') {
      const dueDate = addDaysToDateStr(getSaoPauloDateStr(), 1);
      if (action.payload?.ids?.length) await rescheduleQuests(action.payload.ids, dueDate);
      openTab('quests');
      return;
    }
    if (action.type === 'open_tab' && action.payload?.tab) {
      openTab(action.payload.tab === 'today' ? 'today' : action.payload.tab);
    }
  };

  const tabs = [
    { id: 'today', label: 'Hoje', icon: Sun },
    { id: 'quests', label: 'Missões', icon: Scroll, badge: pendingQuestsCount },
    { id: 'questions', label: 'Questões', icon: Target, badge: todayQuestionsCount },
    { id: 'books', label: 'Biblioteca', icon: BookOpen, badge: activeBooksCount },
    { id: 'scripture', label: 'Escrituras', icon: BookMarked },
    { id: 'maps', label: 'Mapas', icon: Network, badge: dueMindMapsCount },
    { id: 'processes', label: 'Processos', icon: Layers, badge: activeProcessesCount },
    { id: 'habits', label: 'Rituais', icon: Flame, badge: habitsDueCount },
    { id: 'routines', label: 'Rotinas', icon: ListOrdered, badge: routinesDueCount },
    { id: 'supplements', label: 'Suplementos', icon: Pill },
    { id: 'phone', label: 'Celular', icon: Smartphone },
    { id: 'journal', label: 'Diário', icon: NotebookPen, badge: todayJournalCount },
    { id: 'correlations', label: 'Correlações', icon: GitCompare },
    { id: 'focus', label: 'Foco', icon: Headphones },
    { id: 'rewards', label: 'Taverna', icon: Gift },
    { id: 'agu', label: 'AGU', icon: Scale, badge: aguTodayRemaining },
    { id: 'oracle', label: 'Oráculo', icon: Compass },
    { id: 'chat', label: 'Bate Papo', icon: MessagesSquare }
  ];
  const visibleTabs = tabs.filter((tab) => isTabEnabled(featureSettings, tab.id));

  return (
    <div className="app-shell">
      
      {/* Top Header */}
      <Header
        profile={userProfile}
        currentUser={user}
        onLogout={logout}
        boss={bossRaid}
        rankings={analytics?.rankings}
        muted={muted}
        onToggleMute={toggleMute}
        onOpenOracle={() => openTab('oracle')}
        onOpenSettings={() => setActiveTab((current) => (current === 'settings' ? null : 'settings'))}
        settingsActive={activeTab === 'settings'}
        penaltiesThisWeek={penaltiesThisWeek}
      />

      {featureOn('victories') && <DailyVictoriesCard
        dailyVictories={dailyVictories}
        dailyVictoryBonuses={dailyVictoryBonuses}
        questCategories={questCategories}
        onAddVictory={addDailyVictory}
        onUpdateVictory={updateDailyVictory}
        onCompleteVictory={completeDailyVictory}
        onDeleteVictory={deleteDailyVictory}
        studyFloorMinutes={homeostasisFloors.study}
        readingFloorMinutes={homeostasisFloors.reading}
        scriptureFloorMinutes={homeostasisFloors.scripture}
        habitFloorMinutes={homeostasisFloors.habits}
      />}

      {/* Boss Raid Banner */}
      {featureOn('boss') && <BossRaid boss={bossRaid} />}

      {featureOn('oracleCard') && <NextActionCard
        nextAction={nextAction}
        locations={locations}
        currentLocation={userProfile?.currentLocation || nextAction?.context?.location}
        onChangeLocation={setCurrentLocation}
        onCompleteQuest={completeQuest}
        onUpdateQuest={updateQuest}
        onToggleHabit={toggleHabit}
        onCompleteVictory={completeDailyVictory}
        quests={quests}
        onOpenQuests={() => openTab('quests')}
        onOpenHabits={() => openTab('habits')}
        onOpenTab={openTab}
        onBreakdownQuest={breakDownQuest}
        onRescheduleQuests={rescheduleQuests}
        onRefresh={refreshNextAction}
        onSubmitEnergy={submitOracleEnergy}
        onSkipEnergy={skipOracleEnergy}
        oracleMemory={data?.oracleMemory}
        openRouter={data?.openRouter}
        onSaveOpenRouterKey={saveOpenRouterKey}
        onDeclineSuggestion={declineOracleSuggestion}
        onAcceptDose={acceptOracleDose}
        playClick={playClick}
      />}

      {/* Navigation Tab Bar */}
      <nav className="glass-panel app-nav">
        {visibleTabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => {
                playClick();
                setActiveTab(prev => (prev === tab.id ? null : tab.id));
              }}
              aria-pressed={isActive}
              title={isActive ? `Recolher ${tab.label}` : `Abrir ${tab.label}`}
              className="app-nav-tab"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 18px',
                borderRadius: '12px',
                background: isActive
                  ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.2) 0%, rgba(245, 158, 11, 0.08) 100%)'
                  : 'transparent',
                border: isActive ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
                color: isActive ? '#fbbf24' : '#94a3b8',
                fontWeight: isActive ? 800 : 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseOver={(e) => {
                if (!isActive) e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              }}
              onMouseOut={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              <Icon size={18} />
              <span className="nav-tab-label">{tab.label}</span>
              {tab.badge !== undefined && tab.badge > 0 && (
                <span
                  className="nav-tab-badge"
                  style={{
                    fontSize: '0.72rem',
                    padding: '2px 6px',
                    borderRadius: '999px',
                    background: isActive ? '#fbbf24' : 'rgba(255, 255, 255, 0.1)',
                    color: isActive ? '#000' : '#94a3b8',
                    fontWeight: 800
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Main Tab Views — cada aba chega só quando é aberta. */}
      <main>
        <Suspense fallback={<TabFallback />}>
        {featureOn('today') && activeTab === 'today' && (
          <>
          <TodayView
            features={featureSettings}
            today={today}
            dailyVictories={dailyVictories}
            questCategories={questCategories}
            onCompleteVictory={completeDailyVictory}
            onToggleHabit={toggleHabit}
            onCompleteQuest={completeQuest}
            onAddVictory={addDailyVictory}
            onRescheduleQuests={rescheduleQuests}
            onOpenTab={openTab}
            onCloseDay={closeDay}
            onOpenEvening={openEvening}
            onOpenWeekly={openWeekly}
            onToggleFocus={(id, done) => toggleWeeklyFocus(id, done, today?.weekKey)}
            playClick={playClick}
            penalties={penalties || []}
            onOpenJudgment={() => setShowJudgmentHistory((open) => !open)}
          />
          {showJudgmentHistory && (
            <JudgmentHistory penalties={penalties || []} onClose={() => setShowJudgmentHistory(false)} />
          )}
          </>
        )}

        {activeTab === 'quests' && (
          <QuestsView
            quests={quests}
            questCategories={questCategories}
            rankings={analytics?.rankings}
            dailyVictories={dailyVictories}
            onAddQuest={addQuest}
            onCompleteQuest={completeQuest}
            onUpdateQuestDuration={updateQuestDuration}
            onDeleteQuest={deleteQuest}
            onUpdateQuest={updateQuest}
            onAddCategory={addQuestCategory}
            onUpdateCategory={updateQuestCategory}
            onDeleteCategory={deleteQuestCategory}
            onAddDailyVictory={featureOn('victories') ? addDailyVictory : null}
          />
        )}

        {activeTab === 'questions' && (
          <QuestionsView
            examQuestions={examQuestions}
            questCategories={questCategories}
            rankings={analytics?.rankings}
            analytics={analytics}
            onAddQuestions={addExamQuestions}
            onUpdateQuestions={updateExamQuestions}
            onDeleteQuestions={deleteExamQuestions}
          />
        )}

        {activeTab === 'maps' && (
          <MindMapsView
            mindMaps={mindMaps}
            mindMapSessions={mindMapSessions}
            mindMapCategories={mindMapCategories}
            mindMapImages={mindMapImages}
            onAddMap={addMindMap}
            onUpdateMap={updateMindMap}
            onAddNode={addMindMapNode}
            onUpdateNode={updateMindMapNode}
            onUpdateNodes={updateMindMapNodes}
            onDeleteNode={deleteMindMapNode}
            onAddCrossLink={addMindMapCrossLink}
            onUpdateCrossLink={updateMindMapCrossLink}
            onDeleteCrossLink={deleteMindMapCrossLink}
            onAddBrace={addMindMapBrace}
            onUpdateBrace={updateMindMapBrace}
            onAddBraceLabelNode={addBraceLabelNode}
            onDeleteBrace={deleteMindMapBrace}
            onLayoutMap={layoutMindMap}
            onStudyMap={studyMindMap}
            onDeleteMap={deleteMindMap}
            onAddCategory={addMindMapCategory}
            onUpdateCategory={updateMindMapCategory}
            onDeleteCategory={deleteMindMapCategory}
            onDeleteImage={deleteMindMapImage}
          />
        )}

        {activeTab === 'books' && (
          <BooksView
            books={books}
            readingSessions={readingSessions}
            questCategories={questCategories}
            onAddBook={addBook}
            onUpdateBook={updateBook}
            onLogReadingSession={logReadingSession}
            onUpdateReadingSession={updateReadingSession}
            onDeleteReadingSession={deleteReadingSession}
            onDeleteBook={deleteBook}
            onAddBookQuote={addBookQuote}
            onUpdateBookQuote={updateBookQuote}
            onDeleteBookQuote={deleteBookQuote}
            onAddDailyVictory={featureOn('victories') ? addDailyVictory : null}
          />
        )}

        {activeTab === 'scripture' && (
          <ScriptureView
            scriptureProgress={scriptureProgress}
            scriptureSessions={scriptureSessions}
            scriptureQuotes={scriptureQuotes}
            scriptureReflections={scriptureReflections}
            scriptureLiveDraft={scriptureLiveDraft}
            onSaveLiveDraft={saveScriptureLiveDraft}
            onClearLiveDraft={clearScriptureLiveDraft}
            onLogSession={logScriptureSession}
            onUpdateSession={updateScriptureSession}
            onDeleteSession={deleteScriptureSession}
            onAddQuote={addScriptureQuote}
            onUpdateQuote={updateScriptureQuote}
            onDeleteQuote={deleteScriptureQuote}
            onAddReflection={addScriptureReflection}
            onDeleteReflection={deleteScriptureReflection}
            onAddDailyVictory={featureOn('victories') ? addDailyVictory : null}
          />
        )}

        {activeTab === 'processes' && (
          <ProcessesView
            processes={processes}
            processSteps={processSteps}
            questCategories={questCategories}
            rankings={analytics?.rankings}
            onAddProcess={addProcess}
            onStepProcess={stepProcess}
            onDeleteProcess={deleteProcess}
          />
        )}

        {activeTab === 'habits' && (
          <HabitsView
            habits={habits}
            questCategories={questCategories}
            rankings={analytics?.rankings}
            onAddHabit={addHabit}
            onUpdateHabit={updateHabit}
            onToggleHabit={toggleHabit}
            onUpdateHabitDuration={updateHabitDuration}
            onDeleteHabit={deleteHabit}
            onAddDailyVictory={featureOn('victories') ? addDailyVictory : null}
          />
        )}

        {activeTab === 'routines' && (
          <RoutinesView
            routines={routines}
            habits={featureOn('habits') ? habits : []}
            onAddRoutine={addRoutine}
            onUpdateRoutine={updateRoutine}
            onAdvanceRoutine={advanceRoutine}
            onUpdateHabitDuration={updateHabitDuration}
            onDeleteRoutine={deleteRoutine}
          />
        )}

        {activeTab === 'phone' && (
          <PhoneTimeView
            data={data}
            onSave={savePhoneTime}
            onDelete={deletePhoneTime}
          />
        )}

        {activeTab === 'journal' && (
          <JournalView
            entries={data?.journalEntries || []}
            onSave={saveJournalEntry}
            onDelete={deleteJournalEntry}
          />
        )}

        {activeTab === 'supplements' && (
          <SupplementsView
            supplements={supplements}
            supplementLogs={supplementLogs}
            onAddSupplement={addSupplement}
            onUpdateSupplement={updateSupplement}
            onDeleteSupplement={deleteSupplement}
            onLogIntake={logSupplementIntake}
            onUpdateLog={updateSupplementLog}
            onDeleteLog={deleteSupplementLog}
          />
        )}

        {activeTab === 'focus' && (
          <FocusChamberView player={focusPlayer} playClick={playClick} />
        )}

        {activeTab === 'rewards' && (
          <RewardsShop
            rewards={rewards}
            userProfile={userProfile}
            redemptions={rewardRedemptions}
            onAddReward={addReward}
            onSpendMoney={spendMoney}
            onRedeemReward={redeemReward}
            onCancelRedemption={cancelRewardRedemption}
            onDeleteReward={deleteReward}
          />
        )}

        {activeTab === 'agu' && (
          <AguCampaignView
            aguPlan={aguPlan}
            examQuestions={examQuestions}
            mindMapSessions={mindMapSessions}
            onStartPlan={startAguPlan}
            onToggleBlock={toggleAguBlock}
            onSetBlockDuration={setAguBlockDuration}
            onAddBlockDuration={addAguBlockDuration}
            onUpdateBlock={updateAguBlock}
            onDeleteBlock={deleteAguBlock}
            onRealignCycle={realignAguCycle}
            onResetPlan={resetAguPlan}
            onAdvanceCycle={advanceAguCycle}
            onLogProduct={logAguProduct}
            onUpdatePlan={updateAguPlan}
            onAddAguError={addAguError}
            onReviewAguError={reviewAguError}
            onDeleteAguError={deleteAguError}
            onOpenQuestions={() => openTab('questions')}
            onAddQuestions={addExamQuestions}
            onAddDailyVictory={featureOn('victories') ? addDailyVictory : null}
          />
        )}

        {activeTab === 'correlations' && (
          <CorrelationsView report={data?.correlations} />
        )}

        {activeTab === 'chat' && (
          <ChatRoomView
            rooms={data?.chatRooms || []}
            openRouter={data?.openRouter}
            onSaveOpenRouterKey={saveOpenRouterKey}
            onListModels={listChatModels}
            onCreateRoom={createChatRoom}
            onUpdateRoom={updateChatRoom}
            onDeleteRoom={deleteChatRoom}
            onSendMessage={sendChatMessage}
            onDeleteMessage={deleteChatMessage}
            onSummon={summonChatModel}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={featureSettings}
            onChange={updateProfile ? (next) => updateProfile({ featureSettings: next }) : undefined}
            playClick={playClick}
          />
        )}

        {activeTab === 'oracle' && (
          <OracleAnalytics
            analytics={analytics}
            actionLogs={actionLogs}
            onRefresh={refresh}
            onInsightAction={handleInsightAction}
          />
        )}
        </Suspense>
      </main>

      {/* Level Up Pop-up Modal */}
      <LevelUpModal data={levelUpData} onClose={closeLevelUpModal} />
      <PhoneTimePrompt
        open={Boolean(
          data
          && featureOn('phone')
          && !levelUpData
          && !(penaltiesPending || []).length
          && !phonePromptSnoozed
          && needsYesterdayPhonePrompt(data.phoneTimeLogs, todayStr)
        )}
        dateStr={yesterdayDateStr(todayStr)}
        busy={phonePromptBusy}
        onLater={() => setPhonePromptSnoozed(true)}
        onOpenSection={() => {
          setPhonePromptSnoozed(true);
          openTab('phone');
        }}
        onSubmit={async (entry) => {
          setPhonePromptBusy(true);
          try {
            await savePhoneTime(entry);
            setPhonePromptSnoozed(true);
          } finally {
            setPhonePromptBusy(false);
          }
        }}
      />
      <JudgmentModal
        penalties={penaltiesPending || []}
        onAcknowledge={acknowledgePenalties}
        onContest={contestPenalty}
        onAction={(action) => {
          if (action.id === 'open-rituals') openTab('habits');
          else if (action.id === 'plan-victory') openTab('today');
          else if (action.id === 'breakdown' || action.id === 'reschedule') openTab('quests');
          acknowledgePenalties();
        }}
      />
      {/* Baú do Destino: fila própria, mas só depois de Level Up e Julgamento. */}
      <DestinyChestModal
        chest={chestOnHold ? null : activeChest}
        onClose={closeChestReveal}
      />

      {/* Floating XP & Coins Notification Toasts */}
      <FloatingToasts toasts={rewardPopups} />

      {featureOn('quests') && <button
        type="button"
        className="quick-capture-fab"
        aria-label="Nova missão"
        title="Nova missão (n)"
        onClick={() => {
          playClick();
          setCaptureOpen(true);
        }}
      >
        +
      </button>}

      <Suspense fallback={null}>
        {captureOpen && (
          <QuickCapture
            open={captureOpen}
            categories={(questCategories || []).map((item) => (typeof item === 'string' ? item : item.name))}
            lastCategory={lastQuestCategory}
            onClose={() => setCaptureOpen(false)}
            onCreate={async (quest) => {
              setLastQuestCategory(quest.category);
              await addQuest(quest);
            }}
          />
        )}
        {helpOpen && <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />}
        {eveningOpen && (
          <EveningReviewModal
            open={eveningOpen}
            review={eveningReview}
            features={featureSettings}
            onClose={() => setEveningOpen(false)}
            onCloseDay={closeDay}
            onReschedule={async (ids) => {
              const tomorrow = addDaysToDateStr(getSaoPauloDateStr(), 1);
              await rescheduleQuests(ids, tomorrow);
              setEveningReview(await fetchEveningReview());
            }}
            onPlanTomorrow={async (item) => {
              const tomorrow = addDaysToDateStr(getSaoPauloDateStr(), 1);
              await addDailyVictory({ title: item.title, category: item.category, date: tomorrow, questId: item.questId });
              setEveningReview(await fetchEveningReview());
            }}
            playClick={playClick}
          />
        )}
        {weeklyOpen && (
          <WeeklyReviewModal
            open={weeklyOpen}
            review={weeklyReview}
            features={featureSettings}
            categories={(questCategories || []).map((item) => (typeof item === 'string' ? item : item.name))}
            onClose={() => setWeeklyOpen(false)}
            onSavePlan={saveWeeklyPlan}
            playClick={playClick}
          />
        )}
      </Suspense>

    </div>
  );
}
