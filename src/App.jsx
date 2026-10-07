import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useGameData } from './hooks/useGameData';
import { LoginView } from './components/LoginView';
import { Header } from './components/Header';
import { BossRaid } from './components/BossRaid';
import { DailyVictoriesCard } from './components/DailyVictoriesCard';
import { QuestsView } from './components/QuestsView';
import { QuestionsView } from './components/QuestionsView';
import { BooksView } from './components/BooksView';
import { ScriptureView } from './components/ScriptureView';
import { ProcessesView } from './components/ProcessesView';
import { HabitsView } from './components/HabitsView';
import { SupplementsView } from './components/SupplementsView';
import { RewardsShop } from './components/RewardsShop';
import { OracleAnalytics } from './components/OracleAnalytics';
import { NextActionCard } from './components/NextActionCard';
import { LevelUpModal } from './components/LevelUpModal';
import { DestinyChestModal } from './components/DestinyChestModal';
import { JudgmentModal, JudgmentHistory } from './components/JudgmentModal';
import { FloatingToasts } from './components/FloatingToasts';
import { Scroll, Target, BookOpen, BookMarked, Layers, Flame, Gift, Compass, Scale, Headphones, Network, Sun, Pill } from 'lucide-react';
import { TodayView, EveningReviewModal, WeeklyReviewModal, QuickCapture, ShortcutsHelp } from './components/TodayView';
import { getHabitDueStatus } from './utils/habitFrequency';
import { getHabitWeeklyStats } from './utils/timeUtils';
import { MindMapsView } from './components/MindMapsView';
import { AguCampaignView } from './components/AguCampaignView';
import { FocusChamberView, FocusMiniPlayer } from './components/FocusPlayer';
import { useFocusPlayer } from './hooks/useFocusPlayer';
import { getSaoPauloDateStr, addDaysToDateStr, getSaoPauloDayOfWeek } from './utils/timeUtils';
import { summarizePlan, getAguStudyLoadSeries } from './utils/aguCycle';
import { getReadingLoadSeries, getScriptureLoadSeries } from './utils/homeostasis';

export function App() {
  const [activeTab, setActiveTab] = useState('today');
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
    deleteHabit,
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
    deleteMindMapImage
  } = useGameData();

  const [captureOpen, setCaptureOpen] = useState(false);
  const [showJudgmentHistory, setShowJudgmentHistory] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [eveningOpen, setEveningOpen] = useState(false);
  const [eveningReview, setEveningReview] = useState(null);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [weeklyReview, setWeeklyReview] = useState(null);
  const [lastQuestCategory, setLastQuestCategory] = useState('');

  const todayStr = getSaoPauloDateStr();
  const homeostasisFloors = useMemo(() => ({
    study: getAguStudyLoadSeries(data?.aguPlan, data?.examQuestions || [], todayStr, {
      mindMapSessions: data?.mindMapSessions || []
    }).homeostasisMinMinutes,
    reading: getReadingLoadSeries(data?.readingSessions || [], todayStr).homeostasisMinMinutes,
    scripture: getScriptureLoadSeries(data?.scriptureSessions || [], todayStr).homeostasisMinMinutes
  }), [data, todayStr]);

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
      if (event.key === 'n') {
        event.preventDefault();
        setCaptureOpen(true);
      } else if (event.key === 'h') {
        setActiveTab('today');
      } else if (event.key === '?') {
        setHelpOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
      <LoginView
        onGoogleLogin={loginWithGoogle}
        onGuestLogin={loginAsGuest}
        onEmailLogin={loginWithEmail}
        googleClientId={googleClientId}
        guestEnabled={guestEnabled}
        emailLoginEnabled={emailLoginEnabled}
      />
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

  const habitsDueCount = (habits || []).filter((habit) => {
    const due = getHabitDueStatus(habit, getHabitWeeklyStats(habit), new Date(), todayStr);
    return due.due && !due.completedToday;
  }).length;

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

  const handleInsightAction = async (action) => {
    if (!action) return;
    if (action.type === 'plan_victory') {
      setActiveTab('today');
      window.setTimeout(() => {
        document.getElementById('planejar-o-dia')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          || document.getElementById('vitorias-do-dia')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
      return;
    }
    if (action.type === 'reschedule') {
      const dueDate = addDaysToDateStr(getSaoPauloDateStr(), 1);
      if (action.payload?.ids?.length) await rescheduleQuests(action.payload.ids, dueDate);
      setActiveTab('quests');
      return;
    }
    if (action.type === 'open_tab' && action.payload?.tab) {
      setActiveTab(action.payload.tab === 'today' ? 'today' : action.payload.tab);
    }
  };

  const pendingQuestsCount = (quests || []).filter(q => !q.completed).length;
  const todayQuestionsCount = (examQuestions || []).filter(q => {
    const todayStr = getSaoPauloDateStr();
    return (q.date || (q.timestamp ? getSaoPauloDateStr(q.timestamp) : '')) === todayStr;
  }).length;
  const activeBooksCount = (books || []).filter(b => b.status === 'reading').length;
  const activeProcessesCount = (processes || []).filter(p => p.status === 'in_progress').length;
  const aguToday = summarizePlan(aguPlan, examQuestions || [], todayStr).today;
  const aguTodayRemaining = Math.max(0, (aguToday.totalBlocks || 0) - (aguToday.doneCount || 0));
  const dueMindMapsCount = analytics?.summary?.mindMapBranchesDue
    ?? (mindMaps || []).reduce((acc, m) => acc + (m.stats?.dueBranches || 0), 0);

  const tabs = [
    { id: 'today', label: 'Hoje', icon: Sun },
    { id: 'quests', label: 'Missões', icon: Scroll, badge: pendingQuestsCount },
    { id: 'questions', label: 'Questões', icon: Target, badge: todayQuestionsCount },
    { id: 'books', label: 'Biblioteca', icon: BookOpen, badge: activeBooksCount },
    { id: 'scripture', label: 'Escrituras', icon: BookMarked },
    { id: 'maps', label: 'Mapas', icon: Network, badge: dueMindMapsCount },
    { id: 'processes', label: 'Processos', icon: Layers, badge: activeProcessesCount },
    { id: 'habits', label: 'Rituais', icon: Flame, badge: habitsDueCount },
    { id: 'supplements', label: 'Suplementos', icon: Pill },
    { id: 'focus', label: 'Foco', icon: Headphones },
    { id: 'rewards', label: 'Taverna', icon: Gift },
    { id: 'agu', label: 'AGU', icon: Scale, badge: aguTodayRemaining },
    { id: 'oracle', label: 'Oráculo', icon: Compass }
  ];

  const showFocusMini = activeTab !== 'focus' && (focusPlayer.playing || focusPlayer.currentTime >= 1);

  return (
    <div className={`app-shell${showFocusMini ? ' has-focus-mini' : ''}`}>
      
      {/* Top Header */}
      <Header
        profile={userProfile}
        currentUser={user}
        onLogout={logout}
        boss={bossRaid}
        rankings={analytics?.rankings}
        muted={muted}
        onToggleMute={toggleMute}
        onOpenOracle={() => setActiveTab('oracle')}
        penaltiesThisWeek={penaltiesThisWeek}
      />

      <DailyVictoriesCard
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
      />

      {/* Boss Raid Banner */}
      <BossRaid boss={bossRaid} />

      <NextActionCard
        nextAction={nextAction}
        locations={locations}
        currentLocation={userProfile?.currentLocation || nextAction?.context?.location}
        onChangeLocation={setCurrentLocation}
        onCompleteQuest={completeQuest}
        onUpdateQuest={updateQuest}
        onToggleHabit={toggleHabit}
        onCompleteVictory={completeDailyVictory}
        quests={quests}
        onOpenQuests={() => setActiveTab('quests')}
        onOpenHabits={() => setActiveTab('habits')}
        onOpenTab={(tab) => setActiveTab(tab)}
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
      />

      {/* Navigation Tab Bar */}
      <nav className="glass-panel app-nav">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => {
                playClick();
                setActiveTab(prev => (tab.id === 'today' ? 'today' : (prev === tab.id ? 'today' : tab.id)));
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

      {/* Main Tab Views */}
      <main>
        {(activeTab === 'today' || activeTab == null) && (
          <>
          <TodayView
            today={today}
            dailyVictories={dailyVictories}
            questCategories={questCategories}
            onCompleteVictory={completeDailyVictory}
            onToggleHabit={toggleHabit}
            onCompleteQuest={completeQuest}
            onAddVictory={addDailyVictory}
            onRescheduleQuests={rescheduleQuests}
            onOpenTab={setActiveTab}
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
            onDeleteQuest={deleteQuest}
            onUpdateQuest={updateQuest}
            onAddCategory={addQuestCategory}
            onUpdateCategory={updateQuestCategory}
            onDeleteCategory={deleteQuestCategory}
            onAddDailyVictory={addDailyVictory}
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
            onAddDailyVictory={addDailyVictory}
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
            onAddDailyVictory={addDailyVictory}
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
            onDeleteHabit={deleteHabit}
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
            onOpenQuestions={() => setActiveTab('questions')}
            onAddQuestions={addExamQuestions}
            onAddDailyVictory={addDailyVictory}
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
      </main>

      {/* Level Up Pop-up Modal */}
      <LevelUpModal data={levelUpData} onClose={closeLevelUpModal} />
      <JudgmentModal
        penalties={penaltiesPending || []}
        onAcknowledge={acknowledgePenalties}
        onContest={contestPenalty}
        onAction={(action) => {
          if (action.id === 'open-rituals') setActiveTab('habits');
          else if (action.id === 'plan-victory') setActiveTab('today');
          else if (action.id === 'breakdown' || action.id === 'reschedule') setActiveTab('quests');
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

      <button
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
      </button>

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
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      <EveningReviewModal
        open={eveningOpen}
        review={eveningReview}
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
      <WeeklyReviewModal
        open={weeklyOpen}
        review={weeklyReview}
        categories={(questCategories || []).map((item) => (typeof item === 'string' ? item : item.name))}
        onClose={() => setWeeklyOpen(false)}
        onSavePlan={saveWeeklyPlan}
        playClick={playClick}
      />

      {activeTab !== 'focus' && (
        <FocusMiniPlayer
          player={focusPlayer}
          playClick={playClick}
          onOpen={() => setActiveTab('focus')}
        />
      )}

    </div>
  );
}
