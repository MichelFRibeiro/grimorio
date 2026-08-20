import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useGameData } from './hooks/useGameData';
import { LoginView } from './components/LoginView';
import { Header } from './components/Header';
import { BossRaid } from './components/BossRaid';
import { QuestsView } from './components/QuestsView';
import { QuestionsView } from './components/QuestionsView';
import { BooksView } from './components/BooksView';
import { ProcessesView } from './components/ProcessesView';
import { HabitsView } from './components/HabitsView';
import { RewardsShop } from './components/RewardsShop';
import { OracleAnalytics } from './components/OracleAnalytics';
import { LevelUpModal } from './components/LevelUpModal';
import { FloatingToasts } from './components/FloatingToasts';
import { Scroll, Target, BookOpen, Layers, Flame, Gift, Compass } from 'lucide-react';
import { getSaoPauloDateStr } from './utils/timeUtils';

export function App() {
  const [activeTab, setActiveTab] = useState('quests');

  const {
    user,
    isAuthenticated,
    loadingAuth,
    googleClientId,
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
    redeemReward,
    cancelRewardRedemption,
    deleteReward,
    resetBoss
  } = useGameData();

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
      />
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0c0e14', color: '#f87171' }}>
        <div style={{ textAlign: 'center', padding: '24px', maxWidth: '400px' }}>
          <h2 className="font-cinzel" style={{ fontSize: '1.4rem', marginBottom: '12px' }}>Erro de Conexão</h2>
          <p style={{ fontSize: '0.9rem', color: '#94a3b8', marginBottom: '20px' }}>{error}</p>
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
    examQuestions,
    processes,
    processSteps,
    habits,
    rewards,
    rewardRedemptions,
    actionLogs,
    analytics
  } = data || {};

  const pendingQuestsCount = (quests || []).filter(q => !q.completed).length;
  const todayQuestionsCount = (examQuestions || []).filter(q => {
    const todayStr = getSaoPauloDateStr();
    return (q.date || (q.timestamp ? getSaoPauloDateStr(q.timestamp) : '')) === todayStr;
  }).length;
  const activeBooksCount = (books || []).filter(b => b.status === 'reading').length;
  const activeProcessesCount = (processes || []).filter(p => p.status === 'in_progress').length;

  const tabs = [
    { id: 'quests', label: 'Missões', icon: Scroll, badge: pendingQuestsCount },
    { id: 'questions', label: 'Questões', icon: Target, badge: todayQuestionsCount },
    { id: 'books', label: 'Biblioteca', icon: BookOpen, badge: activeBooksCount },
    { id: 'processes', label: 'Processos', icon: Layers, badge: activeProcessesCount },
    { id: 'habits', label: 'Rituais', icon: Flame, badge: habits?.length },
    { id: 'rewards', label: 'Taverna', icon: Gift },
    { id: 'oracle', label: 'Oráculo', icon: Compass }
  ];

  return (
    <div style={{ minHeight: '100vh', padding: '24px 20px 60px 20px', maxWidth: '1280px', margin: '0 auto' }}>
      
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
      />

      {/* Boss Raid Banner */}
      <BossRaid boss={bossRaid} onResetBoss={resetBoss} />

      {/* Navigation Tab Bar */}
      <nav
        className="glass-panel"
        style={{
          padding: '8px 12px',
          marginBottom: '24px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          justifyContent: 'flex-start'
        }}
      >
        {tabs.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => {
                playClick();
                setActiveTab(tab.id);
              }}
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
              <span>{tab.label}</span>
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
        {activeTab === 'quests' && (
          <QuestsView
            quests={quests}
            questCategories={questCategories}
            rankings={analytics?.rankings}
            onAddQuest={addQuest}
            onCompleteQuest={completeQuest}
            onDeleteQuest={deleteQuest}
            onUpdateQuest={updateQuest}
            onAddCategory={addQuestCategory}
            onUpdateCategory={updateQuestCategory}
            onDeleteCategory={deleteQuestCategory}
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

        {activeTab === 'rewards' && (
          <RewardsShop
            rewards={rewards}
            userProfile={userProfile}
            redemptions={rewardRedemptions}
            onAddReward={addReward}
            onRedeemReward={redeemReward}
            onCancelRedemption={cancelRewardRedemption}
            onDeleteReward={deleteReward}
          />
        )}

        {activeTab === 'oracle' && (
          <OracleAnalytics
            analytics={analytics}
            actionLogs={actionLogs}
            onRefresh={refresh}
          />
        )}
      </main>

      {/* Level Up Pop-up Modal */}
      <LevelUpModal data={levelUpData} onClose={closeLevelUpModal} />

      {/* Floating XP & Coins Notification Toasts */}
      <FloatingToasts toasts={rewardPopups} />

    </div>
  );
}
