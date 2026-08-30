import React, { useState, useEffect } from 'react';
import {
  Plus,
  Target,
  CheckCircle2,
  XCircle,
  Clock,
  Calendar,
  Sparkles,
  BookOpen,
  Trash2,
  Search,
  Filter,
  TrendingUp,
  Award,
  Play,
  Pause,
  RotateCcw,
  Edit3,
  FileText,
  Percent,
  Check,
  AlertCircle
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { getSaoPauloDateStr } from '../utils/timeUtils';

const COMMON_SUBJECTS = [
  'Direito Constitucional',
  'Direito Administrativo',
  'Língua Portuguesa',
  'Raciocínio Lógico-Matemático',
  'Informática',
  'Direito Penal',
  'Direito Processual Penal',
  'Direito Civil',
  'Direito Processual Civil',
  'Direito Tributário',
  'Administração Pública',
  'AFO / Orçamento Público',
  'Legislação Especial',
  'Contabilidade',
  'Ética no Serviço Público'
];

export function QuestionsView({
  examQuestions,
  questCategories = [],
  rankings,
  analytics,
  onAddQuestions,
  onUpdateQuestions,
  onDeleteQuestions
}) {
  const defaultCategoryList = [
    { id: 'cat-1', name: 'Trabalho', color: '#38bdf8' },
    { id: 'cat-2', name: 'Estudos', color: '#a855f7' },
    { id: 'cat-3', name: 'Pessoal', color: '#10b981' },
    { id: 'cat-4', name: 'Projetos', color: '#f59e0b' },
    { id: 'cat-5', name: 'Saúde', color: '#f43f5e' },
    { id: 'cat-6', name: 'Finanças', color: '#eab308' }
  ];

  const activeCategories = Array.isArray(questCategories) && questCategories.length > 0
    ? questCategories
    : defaultCategoryList;

  const defaultCatName = activeCategories.find(c => (typeof c === 'string' ? c : c.name) === 'Estudos')
    ? 'Estudos'
    : (activeCategories[0] ? (typeof activeCategories[0] === 'string' ? activeCategories[0] : activeCategories[0].name) : 'Estudos');

  const [subTab, setSubTab] = useState('history'); // 'history' | 'subjects'
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState('all');

  // Confirm Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    confirmVariant: 'warning',
    icon: null,
    onConfirm: null
  });

  const closeConfirmModal = () => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
  };

  const showAlert = (title, message) => {
    setConfirmModal({
      isOpen: true,
      title,
      message,
      confirmText: 'Entendi',
      cancelText: null,
      confirmVariant: 'warning',
      icon: AlertCircle,
      onConfirm: () => closeConfirmModal()
    });
  };

  const promptDeleteQuestion = (item) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Bateria de Questões',
      message: `Deseja realmente excluir a bateria de ${item.subject} (${item.correctAnswers}/${item.totalQuestions} acertos)?\nEsta ação não poderá ser desfeita.`,
      confirmText: 'Sim, Excluir',
      cancelText: 'Cancelar',
      confirmVariant: 'danger',
      icon: Trash2,
      onConfirm: () => {
        if (onDeleteQuestions) onDeleteQuestions(item.id);
        closeConfirmModal();
      }
    });
  };

  // Form State
  const [category, setCategory] = useState(defaultCatName);
  const [subject, setSubject] = useState('Direito Constitucional');
  const [topic, setTopic] = useState('');
  const [institution, setInstitution] = useState('');
  const [totalQuestions, setTotalQuestions] = useState('20');
  const [correctAnswers, setCorrectAnswers] = useState('19');
  const [durationMinutes, setDurationMinutes] = useState('25');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(getSaoPauloDateStr());

  // Sync category with activeCategories
  useEffect(() => {
    const validNames = activeCategories.map(c => typeof c === 'string' ? c : c.name);
    if (validNames.length > 0 && !validNames.includes(category)) {
      setCategory(validNames.find(n => n === 'Estudos') || validNames[0]);
    }
  }, [activeCategories, category]);

  // Edit Question Modal State
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [editCategory, setEditCategory] = useState(defaultCatName);
  const [editSubject, setEditSubject] = useState('');
  const [editTopic, setEditTopic] = useState('');
  const [editInstitution, setEditInstitution] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Modal Stopwatch State
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  useEffect(() => {
    let interval = null;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds(s => s + 1);
      }, 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  // Sync timer to duration minutes when timer is updated
  useEffect(() => {
    if (timerSeconds > 0) {
      setDurationMinutes(String(Math.max(1, Math.round(timerSeconds / 60))));
    }
  }, [timerSeconds]);

  const handleOpenAddModal = () => {
    setDate(getSaoPauloDateStr());
    setShowAddModal(true);
    setTimerSeconds(0);
    setIsTimerRunning(false);
  };

  const handleCloseAddModal = () => {
    setShowAddModal(false);
    setIsTimerRunning(false);
    setTimerSeconds(0);
  };

  const handleSaveQuestions = (e) => {
    e.preventDefault();
    const total = parseInt(totalQuestions, 10);
    const correct = parseInt(correctAnswers, 10);
    const duration = parseInt(durationMinutes, 10) || 0;

    if (isNaN(total) || total <= 0) {
      showAlert('Quantidade Inválida', 'A quantidade de questões feitas deve ser maior que zero.');
      return;
    }
    if (isNaN(correct) || correct < 0 || correct > total) {
      showAlert('Acertos Inválidos', 'A quantidade de questões acertadas deve ser entre 0 e o total feito.');
      return;
    }

    onAddQuestions({
      category: category.trim(),
      subject: subject.trim() || 'Geral',
      topic: topic.trim(),
      institution: institution.trim(),
      totalQuestions: total,
      correctAnswers: correct,
      durationMinutes: duration,
      notes: notes.trim(),
      date
    });

    handleCloseAddModal();
    setTopic('');
    setNotes('');
  };

  const handleOpenEditQuestion = (item) => {
    setEditingQuestion(item);
    setEditCategory(item.category || defaultCatName);
    setEditSubject(item.subject || '');
    setEditTopic(item.topic || '');
    setEditInstitution(item.institution || '');
    setEditDate(item.date || (item.timestamp ? getSaoPauloDateStr(item.timestamp) : getSaoPauloDateStr()));
    setEditNotes(item.notes || '');
  };

  const handleSaveEditQuestion = (e) => {
    e.preventDefault();
    if (!editingQuestion) return;

    if (onUpdateQuestions) {
      onUpdateQuestions(editingQuestion.id, {
        category: editCategory.trim(),
        subject: editSubject.trim() || 'Geral',
        topic: editTopic.trim(),
        institution: editInstitution.trim(),
        date: editDate,
        notes: editNotes.trim()
      });
    }

    setEditingQuestion(null);
  };

  const formatTimer = (secs) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(remainingSecs).padStart(2, '0')}`;
  };

  // Real-time calculation inside form
  const parsedTotal = parseInt(totalQuestions, 10) || 0;
  const parsedCorrect = parseInt(correctAnswers, 10) || 0;
  const liveWrong = Math.max(0, parsedTotal - parsedCorrect);
  const liveAccuracy = parsedTotal > 0 ? Math.round((parsedCorrect / parsedTotal) * 1000) / 10 : 0;
  const liveBonusXp = liveAccuracy === 100 ? 50 : liveAccuracy >= 90 ? 30 : liveAccuracy >= 80 ? 15 : 0;
  const liveTotalXp = parsedTotal * 3 + parsedCorrect * 4 + liveBonusXp;
  const liveCoins = Math.max(2, Math.floor(parsedCorrect / 2)) + (liveAccuracy >= 80 ? 5 : 0) + (liveAccuracy === 100 ? 10 : 0);

  // Filtered Questions History
  const list = examQuestions || [];
  const filteredQuestions = list.filter(q => {
    const matchSearch = searchQuery === '' ||
      (q.subject && q.subject.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (q.topic && q.topic.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (q.institution && q.institution.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (q.notes && q.notes.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchSubject = selectedSubjectFilter === 'all' || q.subject === selectedSubjectFilter;

    return matchSearch && matchSubject;
  });

  const horizons = analytics?.questionHorizons || {
    day: { totalSolved: 0, totalCorrect: 0, accuracyRate: 0, label: 'Hoje' },
    week: { totalSolved: 0, totalCorrect: 0, accuracyRate: 0, label: 'Esta Semana' },
    month: { totalSolved: 0, totalCorrect: 0, accuracyRate: 0, label: 'Este Mês' },
    year: { totalSolved: 0, totalCorrect: 0, accuracyRate: 0, label: 'Este Ano' },
    total: { totalSolved: 0, totalCorrect: 0, accuracyRate: 0, label: 'Todo o Histórico' }
  };

  const getAccuracyColor = (rate) => {
    if (rate >= 80) return '#10b981'; // Emerald
    if (rate >= 65) return '#f59e0b'; // Amber
    return '#f43f5e'; // Rose
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🎯</span> Arena de Questões & Concursos
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Registre suas baterias de questões, monitore sua precisão e acerte o ponto fraco das bancas examinadoras!
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            color: '#000',
            fontWeight: 800,
            fontSize: '0.9rem',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(245, 158, 11, 0.35)',
            transition: 'transform 0.15s ease'
          }}
          onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          <Plus size={18} /> Registrar Bateria de Questões
        </button>
      </div>

      {/* 5 Horizons Quick Summary KPI Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '22px' }}>
        
        {/* Hoje */}
        <div className="glass-panel" style={{ padding: '14px 16px', borderTop: '3px solid #38bdf8' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Hoje</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: getAccuracyColor(horizons.day.accuracyRate) }}>
              {horizons.day.accuracyRate}%
            </span>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
            {horizons.day.totalCorrect} / {horizons.day.totalSolved}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
            {horizons.day.totalSolved > 0 ? `${horizons.day.totalSolved - horizons.day.totalCorrect} erros` : 'Nenhuma hoje'}
          </div>
        </div>

        {/* Esta Semana */}
        <div className="glass-panel" style={{ padding: '14px 16px', borderTop: '3px solid #10b981' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Esta Semana</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: getAccuracyColor(horizons.week.accuracyRate) }}>
              {horizons.week.accuracyRate}%
            </span>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399', fontFamily: 'var(--font-mono)' }}>
            {horizons.week.totalCorrect} / {horizons.week.totalSolved}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
            {horizons.week.sessionsCount || 0} baterias realizadas
          </div>
        </div>

        {/* Este Mês */}
        <div className="glass-panel" style={{ padding: '14px 16px', borderTop: '3px solid #fbbf24' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Este Mês</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: getAccuracyColor(horizons.month.accuracyRate) }}>
              {horizons.month.accuracyRate}%
            </span>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
            {horizons.month.totalCorrect} / {horizons.month.totalSolved}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
            {horizons.month.totalSolved > 0 ? `${Math.round((horizons.month.totalDurationMinutes || 0) / 60 * 10) / 10}h de treino` : 'Sem registros'}
          </div>
        </div>

        {/* Este Ano */}
        <div className="glass-panel" style={{ padding: '14px 16px', borderTop: '3px solid #a855f7' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Este Ano</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: getAccuracyColor(horizons.year.accuracyRate) }}>
              {horizons.year.accuracyRate}%
            </span>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#c084fc', fontFamily: 'var(--font-mono)' }}>
            {horizons.year.totalCorrect} / {horizons.year.totalSolved}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
            {horizons.year.totalSolved} questões acumuladas
          </div>
        </div>

        {/* Todo o Histórico */}
        <div className="glass-panel" style={{ padding: '14px 16px', borderTop: '3px solid #f43f5e' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>Total Histórico</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: getAccuracyColor(horizons.total.accuracyRate) }}>
              {horizons.total.accuracyRate}%
            </span>
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
            {horizons.total.totalCorrect} / {horizons.total.totalSolved}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>
            +{horizons.total.totalXp || 0} XP conquistados
          </div>
        </div>

      </div>

      {/* Sub-Navigation: History vs Disciplinas */}
      <div
        className="glass-panel"
        style={{
          padding: '6px 10px',
          marginBottom: '20px',
          display: 'inline-flex',
          gap: '8px',
          borderRadius: '12px'
        }}
      >
        <button
          onClick={() => setSubTab('history')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '8px',
            background: subTab === 'history' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
            border: subTab === 'history' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
            color: subTab === 'history' ? '#fbbf24' : '#94a3b8',
            fontWeight: subTab === 'history' ? 800 : 600,
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          <Clock size={16} /> Baterias Registradas ({list.length})
        </button>

        <button
          onClick={() => setSubTab('subjects')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '8px',
            background: subTab === 'subjects' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
            border: subTab === 'subjects' ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
            color: subTab === 'subjects' ? '#38bdf8' : '#94a3b8',
            fontWeight: subTab === 'subjects' ? 800 : 600,
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          <TrendingUp size={16} /> Desempenho por Matéria ({analytics?.subjectStats?.length || 0})
        </button>
      </div>

      {/* VIEW 1: HISTORY OF QUESTIONS SESSIONS */}
      {subTab === 'history' && (
        <div>
          {/* Filters Bar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '18px' }}>
            <div className="glass-panel" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
              <Search size={16} color="#94a3b8" />
              <input
                type="text"
                placeholder="Buscar por matéria, assunto, banca ou anotação..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#fff',
                  width: '100%',
                  fontSize: '0.88rem',
                  outline: 'none'
                }}
              />
            </div>

            <select
              value={selectedSubjectFilter}
              onChange={(e) => setSelectedSubjectFilter(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: '12px',
                background: '#131722',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#f8fafc',
                fontSize: '0.88rem',
                cursor: 'pointer'
              }}
            >
              <option value="all">Todas as Matérias</option>
              {Array.from(new Set(list.map(q => q.subject))).filter(Boolean).map(subj => (
                <option key={subj} value={subj}>{subj}</option>
              ))}
            </select>
          </div>

          {filteredQuestions.length === 0 ? (
            <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
              <Target size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
              <p style={{ fontSize: '1rem', fontWeight: 600 }}>Nenhum treino de questões registrado.</p>
              <p style={{ fontSize: '0.85rem' }}>Clique em "Registrar Bateria de Questões" para cadastrar seu primeiro lote de questões resolvidas!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
              {filteredQuestions.map(item => {
                return (
                  <div
                    key={item.id}
                    className="rpg-card"
                    style={{
                      padding: '18px 20px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '14px',
                      borderLeft: `4px solid ${getAccuracyColor(item.accuracyRate)}`,
                      background: 'rgba(19, 23, 34, 0.9)'
                    }}
                  >
                    <div>
                      {/* Top metadata tags */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {(() => {
                            const itemCat = item.category || 'Estudos';
                            const catInfo = activeCategories.find(c => (typeof c === 'string' ? c : c.name) === itemCat);
                            const catColor = (catInfo && typeof catInfo === 'object' && catInfo.color) ? catInfo.color : '#a855f7';
                            const catRanking = rankings?.categories?.[itemCat];

                            return (
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  padding: '2px 8px',
                                  borderRadius: '6px',
                                  background: `${catColor}18`,
                                  color: catColor,
                                  border: `1px solid ${catColor}40`,
                                  fontWeight: 700,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '5px'
                                }}
                              >
                                <span>{itemCat}</span>
                                {catRanking && (
                                  <span
                                    style={{
                                      fontSize: '0.65rem',
                                      fontWeight: 900,
                                      padding: '0 4px',
                                      borderRadius: '3px',
                                      background: catRanking.currentRank.bg,
                                      color: catRanking.currentRank.textColor,
                                      border: `1px solid ${catRanking.currentRank.border}`
                                    }}
                                  >
                                    {catRanking.currentRank.name}
                                  </span>
                                )}
                              </span>
                            );
                          })()}

                          <span style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.12)', color: '#fbbf24', fontWeight: 700 }}>
                            {item.subject}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <Calendar size={12} /> {item.date ? new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR') : new Date(item.timestamp).toLocaleDateString('pt-BR')}
                          </span>

                          <button
                            onClick={() => handleOpenEditQuestion(item)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#64748b',
                              cursor: 'pointer',
                              padding: '2px',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.color = '#38bdf8'}
                            onMouseOut={(e) => e.currentTarget.style.color = '#64748b'}
                            title="Editar registro"
                          >
                            <Edit3 size={14} />
                          </button>

                          <button
                            onClick={() => promptDeleteQuestion(item)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#64748b',
                              cursor: 'pointer',
                              padding: '2px',
                              borderRadius: '4px',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.color = '#f87171'}
                            onMouseOut={(e) => e.currentTarget.style.color = '#64748b'}
                            title="Excluir registro"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Topic & Institution */}
                      <h4 style={{ fontSize: '1rem', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
                        {item.topic || 'Bateria de Questões'}
                      </h4>

                      {item.institution && (
                        <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 600, display: 'inline-block', marginBottom: '10px' }}>
                          🏛️ Banca / Órgão: {item.institution}
                        </span>
                      )}

                      {/* Main Performance Display */}
                      <div
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginTop: '6px'
                        }}
                      >
                        <div>
                          <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>Aproveitamento</span>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                            <span style={{ fontSize: '1.4rem', fontWeight: 900, color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                              {item.correctAnswers} / {item.totalQuestions}
                            </span>
                            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>acertos</span>
                          </div>
                        </div>

                        <div style={{ textAlign: 'right' }}>
                          <span
                            style={{
                              fontSize: '1.1rem',
                              fontWeight: 900,
                              color: getAccuracyColor(item.accuracyRate),
                              fontFamily: 'var(--font-mono)',
                              padding: '4px 10px',
                              borderRadius: '8px',
                              background: `${getAccuracyColor(item.accuracyRate)}18`,
                              border: `1px solid ${getAccuracyColor(item.accuracyRate)}40`,
                              display: 'inline-block'
                            }}
                          >
                            {item.accuracyRate}%
                          </span>
                          <div style={{ fontSize: '0.72rem', color: '#f43f5e', marginTop: '2px' }}>
                            {item.wrongAnswers} {item.wrongAnswers === 1 ? 'erro' : 'erros'}
                          </div>
                        </div>
                      </div>

                      {/* Notes / Error Analysis */}
                      {item.notes && (
                        <div style={{ marginTop: '10px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.05)', border: '1px dashed rgba(245, 158, 11, 0.2)' }}>
                          <span style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 700, display: 'block', marginBottom: '2px' }}>
                            📝 Análise de Erros / Pontos a revisar:
                          </span>
                          <p style={{ fontSize: '0.8rem', color: '#cbd5e1', fontStyle: 'italic', lineHeight: 1.4 }}>
                            {item.notes}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Bottom Rewards & Time */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.78rem' }}>
                        <span style={{ color: '#fbbf24', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                          +{item.xpEarned} XP
                        </span>
                        <span style={{ color: '#38bdf8', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                          +{item.coinsEarned} 🪙
                        </span>
                      </div>

                      {item.durationMinutes > 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={12} /> {item.durationMinutes} min
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: SUBJECTS BREAKDOWN */}
      {subTab === 'subjects' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {(!analytics?.subjectStats || analytics.subjectStats.length === 0) ? (
            <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
              <TrendingUp size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
              <p>Nenhuma estatística por disciplina acumulada ainda.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
              {analytics.subjectStats.map(stat => {
                const color = getAccuracyColor(stat.accuracyRate);
                return (
                  <div
                    key={stat.subject}
                    className="glass-panel"
                    style={{
                      padding: '20px',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      gap: '14px',
                      borderLeft: `4px solid ${color}`
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <h4 className="font-cinzel" style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f8fafc' }}>
                          {stat.subject}
                        </h4>
                        <span
                          style={{
                            fontSize: '1.1rem',
                            fontWeight: 900,
                            color,
                            fontFamily: 'var(--font-mono)',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: `${color}15`
                          }}
                        >
                          {stat.accuracyRate}%
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8', marginBottom: '8px' }}>
                        <span>Acertos: <strong style={{ color: '#f8fafc' }}>{stat.totalCorrect}</strong> de <strong style={{ color: '#f8fafc' }}>{stat.totalSolved}</strong></span>
                        <span style={{ color: '#f43f5e' }}>{stat.totalWrong} erros</span>
                      </div>

                      {/* Progress bar */}
                      <div className="progress-container" style={{ height: '8px', marginBottom: '10px' }}>
                        <div
                          style={{
                            width: `${stat.accuracyRate}%`,
                            height: '100%',
                            background: color,
                            borderRadius: '999px',
                            transition: 'width 0.4s ease'
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#64748b', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      <span>{stat.sessionsCount} baterias realizadas</span>
                      {stat.totalDurationMinutes > 0 && (
                        <span>Tempo total: ~{Math.round(stat.totalDurationMinutes / 60 * 10) / 10}h</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal: Registrar Bateria de Questões */}
      {showAddModal && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            className="glass-panel modal-sheet"
            style={{
              maxWidth: '620px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '28px',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '20px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '18px' }}>
              <div style={{ padding: '8px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                <Target size={24} />
              </div>
              <div>
                <h3 className="font-cinzel" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc' }}>
                  Registrar Bateria de Questões
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                  Informe quantas questões fez e quantas acertou para calcular o rendimento e ganhar XP!
                </p>
              </div>
            </div>

            {/* Stopwatch / Timer Box */}
            <div
              style={{
                padding: '14px',
                borderRadius: '12px',
                background: 'rgba(0,0,0,0.3)',
                border: '1px solid rgba(255,255,255,0.08)',
                textAlign: 'center',
                marginBottom: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>
                  Cronômetro de Treino
                </span>
                <div style={{ fontSize: '1.6rem', fontWeight: 900, fontFamily: 'var(--font-mono)', color: '#fbbf24' }}>
                  {formatTimer(timerSeconds)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsTimerRunning(r => !r)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: '8px',
                    background: isTimerRunning ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                    color: isTimerRunning ? '#f87171' : '#fbbf24',
                    border: isTimerRunning ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(245, 158, 11, 0.4)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 700
                  }}
                >
                  {isTimerRunning ? <Pause size={14} /> : <Play size={14} />}
                  {isTimerRunning ? 'Pausar' : 'Iniciar'}
                </button>

                <button
                  type="button"
                  onClick={() => { setTimerSeconds(0); setIsTimerRunning(false); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: '#94a3b8',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  <RotateCcw size={14} /> Zerar
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveQuestions} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Categoria */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#fbbf24', marginBottom: '4px' }}>
                  Categoria *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: '#1a2030',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.95rem'
                  }}
                >
                  {activeCategories.map(cat => {
                    const catName = typeof cat === 'string' ? cat : cat.name;
                    return (
                      <option key={catName} value={catName}>
                        {catName}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Disciplina / Matéria with Suggestions */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#fbbf24', marginBottom: '4px' }}>
                  Matéria / Disciplina *
                </label>
                <input
                  type="text"
                  required
                  list="subjects-list"
                  placeholder="Ex: Direito Constitucional, Português..."
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: '#1a2030',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.95rem'
                  }}
                />
                <datalist id="subjects-list">
                  {COMMON_SUBJECTS.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>

              {/* Assunto / Tópico & Banca */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Assunto / Tópico (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Controle de Constitucionalidade"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Banca / Órgão (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Cebraspe, FGV, FCC..."
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>

              {/* Quantidade Feitas & Acertadas */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Questões Feitas *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="20"
                    value={totalQuestions}
                    onChange={(e) => setTotalQuestions(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      color: '#fff',
                      fontSize: '1.2rem',
                      fontWeight: 800,
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#34d399', marginBottom: '4px' }}>
                    Questões Acertadas *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    max={totalQuestions || undefined}
                    placeholder="19"
                    value={correctAnswers}
                    onChange={(e) => setCorrectAnswers(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(16, 185, 129, 0.5)',
                      color: '#34d399',
                      fontSize: '1.2rem',
                      fontWeight: 800,
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                </div>
              </div>

              {/* Live Preview Card */}
              <div
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '10px'
                }}
              >
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>Taxa de Acerto</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '1.5rem', fontWeight: 900, color: getAccuracyColor(liveAccuracy), fontFamily: 'var(--font-mono)' }}>
                      {liveAccuracy}%
                    </span>
                    <span style={{ fontSize: '0.8rem', color: '#f43f5e' }}>
                      ({liveWrong} {liveWrong === 1 ? 'erro' : 'erros'})
                    </span>
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase' }}>Recompensa Estimada</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 800 }}>
                    <span style={{ color: '#fbbf24' }}>+{liveTotalXp} XP</span>
                    <span style={{ color: '#38bdf8' }}>+{liveCoins} 🪙</span>
                  </div>
                </div>
              </div>

              {/* Duração & Data */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Duração (minutos)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.9rem',
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Data do Treino
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>

              {/* Anotações / Análise de Erros */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#fbbf24', marginBottom: '4px' }}>
                  Análise de Erros / Pontos a Revisar (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Errei questão sobre legitimidade ativa de ADC; revisar súmula vinculante X..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#1a2030',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={handleCloseAddModal}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  style={{
                    padding: '10px 22px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#000',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(245, 158, 11, 0.3)'
                  }}
                >
                  Salvar Bateria & Ganhar XP 🎯
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Questões */}
      {editingQuestion && (
        <div
          className="modal-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            className="glass-panel modal-sheet"
            style={{
              maxWidth: '540px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '28px',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: '20px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <h3 className="font-cinzel" style={{ fontSize: '1.3rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit3 size={22} /> Editar Bateria de Questões
              </h3>
              <button
                type="button"
                onClick={() => setEditingQuestion(null)}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  color: '#94a3b8',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '0.85rem'
                }}
              >
                Fechar
              </button>
            </div>

            <form onSubmit={handleSaveEditQuestion} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              
              {/* Categoria */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
                  Categoria *
                </label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: '#1a2030',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.95rem'
                  }}
                >
                  {activeCategories.map(cat => {
                    const catName = typeof cat === 'string' ? cat : cat.name;
                    return (
                      <option key={catName} value={catName}>
                        {catName}
                      </option>
                    );
                  })}
                </select>
              </div>

              {/* Disciplina / Matéria */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
                  Matéria / Disciplina *
                </label>
                <input
                  type="text"
                  required
                  list="edit-subjects-list"
                  placeholder="Ex: Direito Constitucional, Português..."
                  value={editSubject}
                  onChange={(e) => setEditSubject(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: '#1a2030',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.95rem'
                  }}
                />
                <datalist id="edit-subjects-list">
                  {COMMON_SUBJECTS.map(s => <option key={s} value={s} />)}
                </datalist>
              </div>

              {/* Assunto / Tópico & Banca */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Assunto / Tópico (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Controle de Constitucionalidade"
                    value={editTopic}
                    onChange={(e) => setEditTopic(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Banca / Órgão (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Cebraspe, FGV, FCC..."
                    value={editInstitution}
                    onChange={(e) => setEditInstitution(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  />
                </div>
              </div>

              {/* Data do Treino */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Data do Treino
                </label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#1a2030',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              {/* Anotações / Análise de Erros */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#fbbf24', marginBottom: '4px' }}>
                  Análise de Erros / Pontos a Revisar (Opcional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Ex: Errei questão sobre legitimidade ativa de ADC; revisar súmula vinculante X..."
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#1a2030',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEditingQuestion(null)}
                  style={{
                    padding: '10px 16px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600
                  }}
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  style={{
                    padding: '10px 22px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
                    color: '#000',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 2px 10px rgba(56, 189, 248, 0.3)'
                  }}
                >
                  Salvar Alterações
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Reusable Confirm / Alert Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        confirmVariant={confirmModal.confirmVariant}
        icon={confirmModal.icon}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirmModal}
      />
    </div>
  );
}
