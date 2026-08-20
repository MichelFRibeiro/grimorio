import React, { useState } from 'react';
import {
  Plus,
  CheckCircle2,
  Circle,
  Clock,
  Calendar,
  AlertCircle,
  Trash2,
  Tag,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Sparkles,
  Filter,
  Edit3,
  RotateCcw,
  Settings,
  X,
  PlusCircle
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { getSaoPauloDateStr } from '../utils/timeUtils';

export function QuestsView({
  quests,
  questCategories = [],
  rankings,
  onAddQuest,
  onCompleteQuest,
  onDeleteQuest,
  onUpdateQuest,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory
}) {
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [statusFilter, setStatusFilter] = useState('pending'); // 'pending' | 'completed' | 'all'
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [expandedSubtasks, setExpandedSubtasks] = useState({});

  // Generic Confirm Modal State
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Confirmar',
    confirmVariant: 'warning',
    icon: null,
    onConfirm: null
  });

  const closeConfirmModal = () => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
  };

  // New Quest Form State
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newCategory, setNewCategory] = useState('Trabalho');
  const [newPriority, setNewPriority] = useState('media');
  const [newDueDate, setNewDueDate] = useState('');
  const [newDueTime, setNewDueTime] = useState('');
  const [newSubtasksInput, setNewSubtasksInput] = useState('');

  // Edit Quest Form State
  const [editingQuest, setEditingQuest] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('Trabalho');
  const [editPriority, setEditPriority] = useState('media');
  const [editDueDate, setEditDueDate] = useState('');
  const [editDueTime, setEditDueTime] = useState('');
  const [editSubtasks, setEditSubtasks] = useState([]);
  const [newSubtaskInputForEdit, setNewSubtaskInputForEdit] = useState('');

  // Category Management Form State
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryColor, setNewCategoryColor] = useState('#f59e0b');
  const [editingCatId, setEditingCatId] = useState(null);
  const [editCatName, setEditCatName] = useState('');
  const [editCatColor, setEditCatColor] = useState('#38bdf8');

  // Available categories list
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

  const categoryNames = ['Todas', ...activeCategories.map(c => typeof c === 'string' ? c : c.name)];

  const filteredQuests = (quests || []).filter(q => {
    const matchesCat = selectedCategory === 'Todas' || q.category === selectedCategory;
    const matchesStatus = statusFilter === 'all'
      ? true
      : statusFilter === 'completed' ? q.completed : !q.completed;
    return matchesCat && matchesStatus;
  });

  const handleCreateQuest = (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const subtasks = newSubtasksInput
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .map(title => ({ title, completed: false }));

    onAddQuest({
      title: newTitle.trim(),
      description: newDesc.trim(),
      category: newCategory,
      priority: newPriority,
      dueDate: newDueDate || null,
      dueTime: newDueTime || null,
      subtasks
    });

    setNewTitle('');
    setNewDesc('');
    setNewCategory(activeCategories[0]?.name || 'Trabalho');
    setNewPriority('media');
    setNewDueDate('');
    setNewDueTime('');
    setNewSubtasksInput('');
    setShowAddModal(false);
  };

  // Open Edit Quest Modal
  const handleOpenEditModal = (quest) => {
    setEditingQuest(quest);
    setEditTitle(quest.title || '');
    setEditDesc(quest.description || '');
    setEditCategory(quest.category || activeCategories[0]?.name || 'Trabalho');
    setEditPriority(quest.priority || 'media');
    setEditDueDate(quest.dueDate || '');
    setEditDueTime(quest.dueTime || '');
    setEditSubtasks(Array.isArray(quest.subtasks) ? [...quest.subtasks] : []);
    setNewSubtaskInputForEdit('');
  };

  const handleCloseEditModal = () => {
    setEditingQuest(null);
    setNewSubtaskInputForEdit('');
  };

  const handleAddSubtaskToEdit = () => {
    if (!newSubtaskInputForEdit.trim()) return;
    setEditSubtasks(prev => [
      ...prev,
      {
        id: 'st-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        title: newSubtaskInputForEdit.trim(),
        completed: false
      }
    ]);
    setNewSubtaskInputForEdit('');
  };

  const handleRemoveSubtaskFromEdit = (stId) => {
    setEditSubtasks(prev => prev.filter(st => st.id !== stId));
  };

  const handleSaveEditQuest = (e) => {
    e.preventDefault();
    if (!editingQuest || !editTitle.trim()) return;

    let finalSubtasks = [...editSubtasks];
    if (newSubtaskInputForEdit.trim()) {
      finalSubtasks.push({
        id: 'st-' + Date.now(),
        title: newSubtaskInputForEdit.trim(),
        completed: false
      });
    }

    onUpdateQuest(editingQuest.id, {
      title: editTitle.trim(),
      description: editDesc.trim(),
      category: editCategory,
      priority: editPriority,
      dueDate: editDueDate || null,
      dueTime: editDueTime || null,
      subtasks: finalSubtasks
    });

    handleCloseEditModal();
  };

  // Trigger modal when user uncompletes a quest (reopening and reverting rewards)
  const handleToggleComplete = (quest) => {
    if (quest.completed) {
      setConfirmModal({
        isOpen: true,
        title: 'Reabrir Missão',
        message: `Deseja retornar a missão "${quest.title}" para o estado pendente?\n\n⚠️ O XP (+${quest.xpReward} XP) e as moedas (+${quest.coinReward} 🪙) ganhos serão estornados.`,
        confirmText: 'Sim, Reabrir Missão',
        confirmVariant: 'warning',
        icon: RotateCcw,
        onConfirm: () => {
          onCompleteQuest(quest.id);
          closeConfirmModal();
        }
      });
    } else {
      onCompleteQuest(quest.id);
    }
  };

  // Trigger modal when user deletes a quest
  const promptDeleteQuest = (quest) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Missão',
      message: `Deseja realmente excluir a missão "${quest.title}"?\nEsta ação não poderá ser desfeita.`,
      confirmText: 'Sim, Excluir',
      confirmVariant: 'danger',
      icon: Trash2,
      onConfirm: () => {
        onDeleteQuest(quest.id);
        closeConfirmModal();
      }
    });
  };

  const toggleSubtaskExpand = (id) => {
    setExpandedSubtasks(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleToggleSubtaskItem = (quest, subtaskId) => {
    const updatedSubtasks = (quest.subtasks || []).map(st => {
      if (st.id === subtaskId) {
        return { ...st, completed: !st.completed };
      }
      return st;
    });

    onUpdateQuest(quest.id, { subtasks: updatedSubtasks });
  };

  // Category CRUD Handlers
  const handleCreateCategory = (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    if (onAddCategory) {
      onAddCategory({
        name: newCategoryName.trim(),
        color: newCategoryColor
      });
      setNewCategoryName('');
    }
  };

  const handleStartEditCat = (cat) => {
    setEditingCatId(cat.id);
    setEditCatName(cat.name);
    setEditCatColor(cat.color || '#38bdf8');
  };

  const handleSaveEditCat = (catId) => {
    if (!editCatName.trim()) return;
    if (onUpdateCategory) {
      onUpdateCategory(catId, {
        name: editCatName.trim(),
        color: editCatColor
      });
    }
    setEditingCatId(null);
  };

  const promptDeleteCategory = (cat) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Categoria',
      message: `Deseja realmente excluir a categoria "${cat.name}"?\n\nAs missões desta categoria serão automaticamente migradas para a categoria padrão.`,
      confirmText: 'Sim, Excluir Categoria',
      confirmVariant: 'danger',
      icon: Trash2,
      onConfirm: () => {
        if (onDeleteCategory) onDeleteCategory(cat.id);
        closeConfirmModal();
      }
    });
  };

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'epica':
        return { label: 'ÉPICA / BOSS', color: '#c084fc', bg: 'rgba(168, 85, 247, 0.15)', border: 'rgba(168, 85, 247, 0.4)' };
      case 'alta':
        return { label: 'ALTA', color: '#fbbf24', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)' };
      case 'media':
        return { label: 'MÉDIA', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.4)' };
      case 'baixa':
      default:
        return { label: 'BAIXA', color: '#94a3b8', bg: 'rgba(148, 163, 184, 0.12)', border: 'rgba(148, 163, 184, 0.3)' };
    }
  };

  const getDueDateLabel = (dueDate, dueTime) => {
    if (!dueDate) return null;
    const today = getSaoPauloDateStr();
    const isToday = dueDate === today;
    const isPast = dueDate < today;

    let text = dueDate.split('-').reverse().slice(0, 2).join('/');
    if (isToday) text = 'Hoje';
    if (dueTime) text += ` às ${dueTime}`;

    return {
      text,
      isPast,
      isToday,
      color: isPast ? '#f87171' : isToday ? '#fbbf24' : '#94a3b8'
    };
  };

  const colorPresets = ['#f59e0b', '#38bdf8', '#10b981', '#a855f7', '#f43f5e', '#eab308', '#06b6d4', '#ec4899'];

  return (
    <div>
      {/* Header Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>📜</span> Grimório de Missões
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Gerencie tarefas diárias e projetos. Ganhe XP e Moedas para cada objetivo conquistado!
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setShowCategoryModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 14px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#cbd5e1',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
            title="Gerenciar Categorias de Missões"
          >
            <Settings size={16} /> Categorias ({activeCategories.length})
          </button>

          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
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
            <Plus size={18} /> Nova Missão
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="glass-panel" style={{ padding: '12px 16px', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
        
        {/* Categories Pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
          {categoryNames.map(catName => {
            const isAll = catName === 'Todas';
            const catRanking = !isAll ? rankings?.categories?.[catName] : null;
            const rankTier = catRanking?.currentRank;

            return (
              <button
                key={catName}
                onClick={() => setSelectedCategory(catName)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: selectedCategory === catName ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  color: selectedCategory === catName ? '#fbbf24' : '#94a3b8',
                  border: selectedCategory === catName ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent'
                }}
              >
                <span>{catName}</span>
                {rankTier && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 900,
                      padding: '1px 5px',
                      borderRadius: '4px',
                      background: rankTier.bg,
                      color: rankTier.textColor,
                      border: `1px solid ${rankTier.border}`,
                      lineHeight: 1.15
                    }}
                    title={`Ranking semanal: Tier ${rankTier.name} (${rankTier.title}) • ${catRanking.weeklyXp} XP nesta semana`}
                  >
                    {rankTier.name}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Status Filter */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={() => setStatusFilter('pending')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: statusFilter === 'pending' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              color: statusFilter === 'pending' ? '#38bdf8' : '#64748b',
              border: 'none'
            }}
          >
            Pendentes
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: statusFilter === 'completed' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
              color: statusFilter === 'completed' ? '#34d399' : '#64748b',
              border: 'none'
            }}
          >
            Concluídas
          </button>
          <button
            onClick={() => setStatusFilter('all')}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: statusFilter === 'all' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
              color: statusFilter === 'all' ? '#fff' : '#64748b',
              border: 'none'
            }}
          >
            Todas
          </button>
        </div>

      </div>

      {/* Quest List */}
      {filteredQuests.length === 0 ? (
        <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
          <CheckSquare size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
          <p style={{ fontSize: '1rem', fontWeight: 600 }}>Nenhuma missão encontrada neste filtro.</p>
          <p style={{ fontSize: '0.85rem' }}>Cadastre uma nova missão no botão acima para começar!</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredQuests.map(quest => {
            const pBadge = getPriorityBadge(quest.priority);
            const dueInfo = getDueDateLabel(quest.dueDate, quest.dueTime);
            const isSubtasksOpen = !!expandedSubtasks[quest.id];
            const completedSubtasks = (quest.subtasks || []).filter(s => s.completed).length;
            const totalSubtasks = (quest.subtasks || []).length;

            return (
              <div
                key={quest.id}
                className="rpg-card"
                style={{
                  padding: '16px 20px',
                  opacity: quest.completed ? 0.75 : 1,
                  borderLeft: quest.completed ? '4px solid #10b981' : `4px solid ${pBadge.color}`
                }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px' }}>
                  
                  {/* Checkbox and Main Info */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', flex: 1 }}>
                    <button
                      onClick={() => handleToggleComplete(quest)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px',
                        color: quest.completed ? '#10b981' : '#64748b',
                        transition: 'transform 0.1s ease',
                        display: 'flex',
                        alignItems: 'center'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.15)'}
                      onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                      title={quest.completed ? 'Clique para reabrir missão (estornará XP e moedas)' : 'Concluir missão'}
                    >
                      {quest.completed ? <CheckCircle2 size={24} color="#10b981" /> : <Circle size={24} />}
                    </button>

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <h3
                          style={{
                            fontSize: '1.05rem',
                            fontWeight: 700,
                            color: quest.completed ? '#94a3b8' : '#f8fafc',
                            textDecoration: quest.completed ? 'line-through' : 'none'
                          }}
                        >
                          {quest.title}
                        </h3>

                        {/* Priority Badge */}
                        <span
                          style={{
                            fontSize: '0.7rem',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: pBadge.bg,
                            color: pBadge.color,
                            border: `1px solid ${pBadge.border}`,
                            fontWeight: 800
                          }}
                        >
                          {pBadge.label}
                        </span>

                        {/* Category Tag */}
                        <span
                          style={{
                            fontSize: '0.7rem',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: '#94a3b8',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            fontWeight: 600
                          }}
                        >
                          {quest.category}
                        </span>

                        {quest.completed && (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '2px 6px',
                              borderRadius: '6px',
                              background: 'rgba(16, 185, 129, 0.15)',
                              color: '#34d399',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              fontWeight: 700
                            }}
                          >
                            ✓ Concluída
                          </span>
                        )}
                      </div>

                      {quest.description && (
                        <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '8px', lineHeight: 1.4 }}>
                          {quest.description}
                        </p>
                      )}

                      {/* Meta information (Due Date, Subtasks counter) */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', fontSize: '0.78rem', color: '#64748b' }}>
                        {dueInfo && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: dueInfo.color, fontWeight: 600 }}>
                            <Calendar size={14} /> {dueInfo.text}
                          </span>
                        )}

                        {totalSubtasks > 0 && (
                          <button
                            onClick={() => toggleSubtaskExpand(quest.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#38bdf8',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontWeight: 600,
                              fontSize: '0.78rem',
                              padding: 0
                            }}
                          >
                            <CheckSquare size={14} /> Subtarefas ({completedSubtasks}/{totalSubtasks})
                            {isSubtasksOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Rewards & Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                        <Sparkles size={14} /> +{quest.xpReward} XP
                      </span>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                        +{quest.coinReward} 🪙
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {/* Reopen Button (if completed) */}
                      {quest.completed && (
                        <button
                          onClick={() => handleToggleComplete(quest)}
                          style={{
                            background: 'rgba(245, 158, 11, 0.1)',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            color: '#fbbf24',
                            cursor: 'pointer',
                            padding: '6px 8px',
                            borderRadius: '8px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 700
                          }}
                          title="Retornar para pendente e estornar recompensas"
                        >
                          <RotateCcw size={13} />
                          <span>Reabrir</span>
                        </button>
                      )}

                      {/* Edit Button */}
                      <button
                        onClick={() => handleOpenEditModal(quest)}
                        style={{
                          background: 'rgba(56, 189, 248, 0.1)',
                          border: '1px solid rgba(56, 189, 248, 0.25)',
                          color: '#38bdf8',
                          cursor: 'pointer',
                          padding: '6px 8px',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 700
                        }}
                        title="Editar missão"
                      >
                        <Edit3 size={13} />
                        <span>Editar</span>
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => promptDeleteQuest(quest)}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#64748b',
                          cursor: 'pointer',
                          padding: '6px',
                          borderRadius: '8px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'color 0.2s ease'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.color = '#f87171'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#64748b'}
                        title="Excluir missão"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                </div>

                {/* Expanded Subtasks Checklist */}
                {isSubtasksOpen && totalSubtasks > 0 && (
                  <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingLeft: '38px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {quest.subtasks.map(st => (
                      <div
                        key={st.id}
                        onClick={() => handleToggleSubtaskItem(quest, st.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          color: st.completed ? '#64748b' : '#f8fafc',
                          textDecoration: st.completed ? 'line-through' : 'none'
                        }}
                      >
                        <div
                          style={{
                            width: '16px',
                            height: '16px',
                            borderRadius: '4px',
                            border: st.completed ? '1px solid #10b981' : '1px solid #64748b',
                            background: st.completed ? '#10b981' : 'transparent',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          {st.completed && <span style={{ color: '#000', fontSize: '10px', fontWeight: 900 }}>✓</span>}
                        </div>
                        <span>{st.title}</span>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            );
          })}
        </div>
      )}

      {/* Modal Nova Missão */}
      {showAddModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(6px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
        >
          <div
            className="glass-panel"
            style={{
              maxWidth: '520px',
              width: '100%',
              padding: '28px',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: '20px'
            }}
          >
            <h3 className="font-cinzel" style={{ fontSize: '1.3rem', fontWeight: 800, color: '#fbbf24', marginBottom: '18px' }}>
              ⚔️ Nova Missão do Grimório
            </h3>

            <form onSubmit={handleCreateQuest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Título da Missão *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Finalizar análise do processo X"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.95rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Descrição / Notas
                </label>
                <textarea
                  placeholder="Detalhes adicionais da missão..."
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Categoria
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  >
                    {activeCategories.map(c => {
                      const name = typeof c === 'string' ? c : c.name;
                      return <option key={name} value={name}>{name}</option>;
                    })}
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Prioridade / Dificuldade
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  >
                    <option value="baixa">Baixa (+20 XP, 5 🪙)</option>
                    <option value="media">Média (+45 XP, 12 🪙)</option>
                    <option value="alta">Alta (+80 XP, 25 🪙)</option>
                    <option value="epica">Épica / Boss (+150 XP, 50 🪙)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Data Limite
                  </label>
                  <input
                    type="date"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
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
                    Horário Limite
                  </label>
                  <input
                    type="time"
                    value={newDueTime}
                    onChange={(e) => setNewDueTime(e.target.value)}
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

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Subtarefas (1 por linha)
                </label>
                <textarea
                  placeholder="Etapa 1&#10;Etapa 2&#10;Etapa 3"
                  rows={3}
                  value={newSubtasksInput}
                  onChange={(e) => setNewSubtasksInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.85rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
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
                    padding: '10px 20px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#000',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Criar Missão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Missão */}
      {editingQuest && (
        <div
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
            className="glass-panel"
            style={{
              maxWidth: '560px',
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
                <Edit3 size={20} /> Editar Missão
              </h3>
              <button
                type="button"
                onClick={handleCloseEditModal}
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

            <form onSubmit={handleSaveEditQuest} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Título da Missão *
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.95rem'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Descrição / Notas
                </label>
                <textarea
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    resize: 'vertical'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Categoria
                  </label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  >
                    {activeCategories.map(c => {
                      const name = typeof c === 'string' ? c : c.name;
                      return <option key={name} value={name}>{name}</option>;
                    })}
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Prioridade / Dificuldade
                  </label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.9rem'
                    }}
                  >
                    <option value="baixa">Baixa (+20 XP, 5 🪙)</option>
                    <option value="media">Média (+45 XP, 12 🪙)</option>
                    <option value="alta">Alta (+80 XP, 25 🪙)</option>
                    <option value="epica">Épica / Boss (+150 XP, 50 🪙)</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Data Limite
                  </label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
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
                    Horário Limite
                  </label>
                  <input
                    type="time"
                    value={editDueTime}
                    onChange={(e) => setEditDueTime(e.target.value)}
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

              {/* Subtasks Manager inside Edit Modal */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8', marginBottom: '6px' }}>
                  Subtarefas da Missão
                </label>

                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="Adicionar nova subtarefa..."
                    value={newSubtaskInputForEdit}
                    onChange={(e) => setNewSubtaskInputForEdit(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSubtaskToEdit();
                      }
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.85rem'
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddSubtaskToEdit}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '8px',
                      background: 'rgba(56, 189, 248, 0.15)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      color: '#38bdf8',
                      fontWeight: 700,
                      fontSize: '0.82rem',
                      cursor: 'pointer'
                    }}
                  >
                    + Adicionar
                  </button>
                </div>

                {editSubtasks.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '160px', overflowY: 'auto' }}>
                    {editSubtasks.map(st => (
                      <div
                        key={st.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.08)'
                        }}
                      >
                        <span style={{ fontSize: '0.85rem', color: st.completed ? '#64748b' : '#f8fafc', textDecoration: st.completed ? 'line-through' : 'none' }}>
                          {st.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSubtaskFromEdit(st.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#f43f5e',
                            cursor: 'pointer',
                            padding: '2px'
                          }}
                          title="Remover subtarefa"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={handleCloseEditModal}
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
                    padding: '10px 20px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #38bdf8 0%, #0284c7 100%)',
                    color: '#000',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(56, 189, 248, 0.35)'
                  }}
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Gerenciar Categorias (CRUD) */}
      {showCategoryModal && (
        <div
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
            className="glass-panel"
            style={{
              maxWidth: '560px',
              width: '100%',
              padding: '28px',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '20px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <h3 className="font-cinzel" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tag size={20} /> Gerenciar Categorias de Missões
              </h3>
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
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

            {/* Add Category Form */}
            <form onSubmit={handleCreateCategory} style={{ marginBottom: '22px', padding: '14px', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>
                Nova Categoria
              </label>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input
                  type="text"
                  required
                  placeholder="Nome da categoria (ex: Projetos Especiais)"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: '#1a2030',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.88rem'
                  }}
                />

                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                  {colorPresets.slice(0, 5).map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewCategoryColor(c)}
                      style={{
                        width: '20px',
                        height: '20px',
                        borderRadius: '50%',
                        background: c,
                        border: newCategoryColor === c ? '2px solid #fff' : 'none',
                        cursor: 'pointer'
                      }}
                    />
                  ))}
                </div>

                <button
                  type="submit"
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                    color: '#000',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    border: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  + Adicionar
                </button>
              </div>
            </form>

            {/* List of existing categories */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
              {activeCategories.map(cat => {
                const isEditing = editingCatId === cat.id;
                const catQuestCount = (quests || []).filter(q => q.category === cat.name).length;

                return (
                  <div
                    key={cat.id || cat.name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 14px',
                      borderRadius: '10px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)'
                    }}
                  >
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '8px', flex: 1, alignItems: 'center' }}>
                        <input
                          type="text"
                          value={editCatName}
                          onChange={(e) => setEditCatName(e.target.value)}
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            borderRadius: '6px',
                            background: '#1a2030',
                            border: '1px solid rgba(56, 189, 248, 0.4)',
                            color: '#fff',
                            fontSize: '0.85rem'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEditCat(cat.id)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            background: '#38bdf8',
                            color: '#000',
                            fontWeight: 800,
                            fontSize: '0.78rem',
                            border: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCatId(null)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            background: 'rgba(255,255,255,0.08)',
                            color: '#fff',
                            fontSize: '0.78rem',
                            border: 'none',
                            cursor: 'pointer'
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div
                            style={{
                              width: '12px',
                              height: '12px',
                              borderRadius: '50%',
                              background: cat.color || '#f59e0b'
                            }}
                          />
                          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#f8fafc' }}>
                            {cat.name}
                          </span>
                          {rankings?.categories?.[cat.name] && (
                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 900,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: rankings.categories[cat.name].currentRank.bg,
                                color: rankings.categories[cat.name].currentRank.textColor,
                                border: `1px solid ${rankings.categories[cat.name].currentRank.border}`
                              }}
                            >
                              Tier {rankings.categories[cat.name].currentRank.name} ({rankings.categories[cat.name].weeklyXp} XP)
                            </span>
                          )}
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            ({catQuestCount} {catQuestCount === 1 ? 'missão' : 'missões'})
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <button
                            type="button"
                            onClick={() => handleStartEditCat(cat)}
                            style={{
                              background: 'rgba(56, 189, 248, 0.1)',
                              border: '1px solid rgba(56, 189, 248, 0.25)',
                              color: '#38bdf8',
                              cursor: 'pointer',
                              padding: '5px 8px',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title="Editar categoria"
                          >
                            <Edit3 size={12} />
                            <span>Renomear</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => promptDeleteCategory(cat)}
                            style={{
                              background: 'rgba(244, 63, 94, 0.1)',
                              border: '1px solid rgba(244, 63, 94, 0.25)',
                              color: '#f43f5e',
                              cursor: 'pointer',
                              padding: '5px 8px',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title="Excluir categoria"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setShowCategoryModal(false)}
                style={{
                  padding: '8px 18px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Concluído
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Confirmation Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        confirmVariant={confirmModal.confirmVariant}
        icon={confirmModal.icon}
        onConfirm={confirmModal.onConfirm}
        onCancel={closeConfirmModal}
      />
    </div>
  );
}
