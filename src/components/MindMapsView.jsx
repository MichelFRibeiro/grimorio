import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Network,
  Search,
  Trash2,
  Pencil,
  Sparkles,
  Brain,
  Play,
  Pause,
  RotateCcw,
  Clock,
  ArrowLeft,
  GitBranch,
  Eye,
  EyeOff,
  Layout,
  X,
  Check,
  AlertCircle,
  Bookmark,
  GraduationCap,
  Layers,
  Maximize2,
  Minimize2,
  Tag,
  FolderTree
} from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { useStopwatch, formatTimer } from '../hooks/useStopwatch';
import { getSaoPauloDateStr } from '../utils/timeUtils';
import {
  MIND_MAP_NODE_COLORS,
  childrenOf,
  computeMapStats,
  getRootNode,
  getStudyQueue,
  groupMapsByCategory,
  mindMapCategoryLabel,
  nodePath,
  sanitizeMindMapCategories,
  visibleNodeIds
} from '../utils/mindMaps';

const QUALITY_OPTIONS = [
  { value: 0, label: 'Esqueci', hint: 'Reaparece hoje', color: '#f43f5e' },
  { value: 1, label: 'Difícil', hint: 'Amanhã', color: '#f59e0b' },
  { value: 2, label: 'Bom', hint: 'Espaça a revisão', color: '#38bdf8' },
  { value: 3, label: 'Fácil', hint: 'Mais intervalo', color: '#10b981' }
];

function nodeWidth(label = '') {
  return Math.max(120, Math.min(260, 28 + String(label).length * 8));
}

function MindMapCanvas({
  map,
  selectedId,
  onSelect,
  onMoveNode,
  onAddChild,
  readOnly = false,
  fullscreen = false,
  onToggleFullscreen
}) {
  const wrapRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 420, y: 280 });
  const dragRef = useRef(null);

  const visible = useMemo(() => visibleNodeIds(map), [map]);
  const visibleIds = useMemo(() => new Set(visible.map(n => n.id)), [visible]);
  const links = useMemo(() => (
    visible
      .filter(n => n.parentId && visibleIds.has(n.parentId))
      .map(n => ({
        id: `${n.parentId}-${n.id}`,
        from: visible.find(p => p.id === n.parentId),
        to: n
      }))
      .filter(l => l.from && l.to)
  ), [visible, visibleIds]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      setZoom(z => Math.max(0.4, Math.min(2.2, z * factor)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toWorld = (clientX, clientY) => {
    const rect = wrapRef.current.getBoundingClientRect();
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom
    };
  };

  const onPointerDownBg = (e) => {
    if (e.target !== e.currentTarget && e.target.dataset.role !== 'canvas') return;
    dragRef.current = {
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      panX: pan.x,
      panY: pan.y
    };
    onSelect(null);
  };

  const onPointerDownNode = (e, node) => {
    e.stopPropagation();
    onSelect(node.id);
    if (readOnly) return;
    dragRef.current = {
      kind: 'node',
      id: node.id,
      originX: node.x,
      originY: node.y,
      start: toWorld(e.clientX, e.clientY),
      lastPos: { x: node.x, y: node.y },
      moved: false
    };
  };

  useEffect(() => {
    const onMove = (e) => {
      const drag = dragRef.current;
      if (!drag) return;
      if (drag.kind === 'pan') {
        setPan({
          x: drag.panX + (e.clientX - drag.startX),
          y: drag.panY + (e.clientY - drag.startY)
        });
      } else if (drag.kind === 'node' && onMoveNode) {
        const world = toWorld(e.clientX, e.clientY);
        const next = {
          x: Math.round(drag.originX + (world.x - drag.start.x)),
          y: Math.round(drag.originY + (world.y - drag.start.y))
        };
        if (next.x !== drag.lastPos.x || next.y !== drag.lastPos.y) drag.moved = true;
        drag.lastPos = next;
        onMoveNode(drag.id, next, false);
      }
    };
    const onUp = () => {
      const drag = dragRef.current;
      if (drag?.kind === 'node' && drag.moved && onMoveNode) {
        onMoveNode(drag.id, drag.lastPos, true);
      }
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [map, onMoveNode, pan.x, pan.y, zoom]);

  return (
    <div
      ref={wrapRef}
      className="mindmap-canvas"
      onPointerDown={onPointerDownBg}
      data-role="canvas"
    >
      <svg width="100%" height="100%" data-role="canvas">
        <defs>
          <pattern id="mm-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#mm-grid)" data-role="canvas" />
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {links.map((link) => (
            <path
              key={link.id}
              d={`M ${link.from.x} ${link.from.y} Q ${(link.from.x + link.to.x) / 2} ${(link.from.y + link.to.y) / 2 - 24} ${link.to.x} ${link.to.y}`}
              fill="none"
              stroke={link.to.color || '#64748b'}
              strokeWidth="2.4"
              opacity="0.7"
            />
          ))}
          {visible.map((node) => {
            const w = nodeWidth(node.label);
            const h = 44;
            const selected = selectedId === node.id;
            const kids = childrenOf(map, node.id).length;
            return (
              <g
                key={node.id}
                transform={`translate(${node.x - w / 2} ${node.y - h / 2})`}
                onPointerDown={(e) => onPointerDownNode(e, node)}
                style={{ cursor: readOnly ? 'pointer' : 'grab' }}
              >
                <rect
                  width={w}
                  height={h}
                  rx="14"
                  fill={selected ? 'rgba(19, 23, 34, 0.98)' : 'rgba(19, 23, 34, 0.92)'}
                  stroke={selected ? '#fbbf24' : (node.color || '#64748b')}
                  strokeWidth={selected ? 2.4 : 1.6}
                  filter={selected ? 'drop-shadow(0 0 10px rgba(251,191,36,0.35))' : undefined}
                />
                <text
                  x={w / 2}
                  y={h / 2 + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="#f8fafc"
                  fontSize="13"
                  fontWeight="700"
                  style={{ pointerEvents: 'none', fontFamily: 'var(--font-body)' }}
                >
                  {node.label.length > 28 ? `${node.label.slice(0, 26)}…` : node.label}
                </text>
                {kids > 0 && (
                  <g transform={`translate(${w - 10} -6)`}>
                    <circle r="9" fill={node.color || '#64748b'} />
                    <text
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="#041018"
                      fontSize="9"
                      fontWeight="800"
                    >
                      {node.collapsed ? '+' : kids}
                    </text>
                  </g>
                )}
                {!readOnly && selected && (
                  <g
                    transform={`translate(${w - 8} ${h - 8})`}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      if (onAddChild) onAddChild(node.id);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle r="11" fill="#f59e0b" />
                    <text textAnchor="middle" dominantBaseline="middle" fill="#041018" fontSize="14" fontWeight="800">+</text>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="mindmap-zoom">
        {onToggleFullscreen && (
          <button type="button" onClick={onToggleFullscreen} title={fullscreen ? 'Sair da tela cheia' : 'Tela cheia'}>
            {fullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        )}
        <button type="button" onClick={() => setZoom(z => Math.max(0.4, z - 0.1))}>−</button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => setZoom(z => Math.min(2.2, z + 0.1))}>+</button>
      </div>
    </div>
  );
}

export function MindMapsView({
  mindMaps = [],
  mindMapSessions = [],
  mindMapCategories = [],
  onAddMap,
  onUpdateMap,
  onAddNode,
  onUpdateNode,
  onDeleteNode,
  onLayoutMap,
  onStudyMap,
  onDeleteMap,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory
}) {
  const todayStr = getSaoPauloDateStr();
  const categories = sanitizeMindMapCategories(mindMapCategories);
  const rootCategories = categories.filter(c => !c.parentId);
  const defaultCategoryId = rootCategories[0]?.id || categories[0]?.id || '';

  const [view, setView] = useState('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategoryId, setNewCategoryId] = useState(defaultCategoryId);
  const [newColor, setNewColor] = useState(MIND_MAP_NODE_COLORS[0]);
  const [formError, setFormError] = useState('');
  const [filterCategoryId, setFilterCategoryId] = useState('all');
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [catName, setCatName] = useState('');
  const [catColor, setCatColor] = useState(MIND_MAP_NODE_COLORS[1]);
  const [catParentId, setCatParentId] = useState('');
  const [catError, setCatError] = useState('');
  const [editingCategory, setEditingCategory] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);

  const [activeMapId, setActiveMapId] = useState(null);
  const [pendingMap, setPendingMap] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftNotes, setDraftNotes] = useState('');
  const [localNodes, setLocalNodes] = useState(null);

  const [studyMode, setStudyMode] = useState('branches');
  const [studyIndex, setStudyIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [studyReviews, setStudyReviews] = useState([]);
  const stopwatch = useStopwatch();

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

  const closeConfirmModal = () => setConfirmModal(prev => ({ ...prev, isOpen: false }));

  const maps = mindMaps || [];
  const liveMap = maps.find(m => m.id === activeMapId) || (pendingMap?.id === activeMapId ? pendingMap : null);

  useEffect(() => {
    if (pendingMap && maps.some(m => m.id === pendingMap.id)) setPendingMap(null);
  }, [maps, pendingMap]);

  useEffect(() => {
    if (!newCategoryId && defaultCategoryId) setNewCategoryId(defaultCategoryId);
  }, [defaultCategoryId, newCategoryId]);
  const editorMap = liveMap
    ? { ...liveMap, nodes: localNodes || liveMap.nodes }
    : null;
  const selectedNode = editorMap && selectedId
    ? (editorMap.nodes || []).find(n => n.id === selectedId)
    : null;

  useEffect(() => {
    setLocalNodes(null);
  }, [liveMap?.updatedAt, liveMap?.nodes?.length]);

  useEffect(() => {
    if (selectedNode) {
      setDraftLabel(selectedNode.label || '');
      setDraftNotes(selectedNode.notes || '');
    }
  }, [selectedNode?.id]);

  const matchingCategoryIds = useMemo(() => {
    if (filterCategoryId === 'all') return null;
    const childIds = categories.filter(c => c.parentId === filterCategoryId).map(c => c.id);
    return new Set([filterCategoryId, ...childIds]);
  }, [categories, filterCategoryId]);

  const filteredMaps = maps.filter((m) => {
    const q = searchQuery.trim().toLowerCase();
    const matchSearch = !q || (
      m.title.toLowerCase().includes(q)
      || (m.description || '').toLowerCase().includes(q)
      || (m.category || '').toLowerCase().includes(q)
      || mindMapCategoryLabel(categories, m.categoryId).toLowerCase().includes(q)
      || (m.nodes || []).some(n => n.label.toLowerCase().includes(q) || (n.notes || '').toLowerCase().includes(q))
    );
    const matchCat = !matchingCategoryIds || matchingCategoryIds.has(m.categoryId);
    return matchSearch && matchCat;
  });
  const groupedMaps = groupMapsByCategory(filteredMaps, categories);

  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [fullscreen]);

  const dueCount = maps.reduce((acc, m) => acc + (computeMapStats(m, { today: todayStr }).dueBranches || 0), 0);
  const sessions = mindMapSessions || [];

  const openEditor = (map) => {
    setActiveMapId(map.id);
    setSelectedId(map.rootId);
    setLocalNodes(null);
    setView('editor');
  };

  const openStudy = (map) => {
    setActiveMapId(map.id);
    setStudyIndex(0);
    setRevealed(false);
    setStudyReviews([]);
    stopwatch.reset();
    stopwatch.start();
    setView('study');
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setFormError('Dê um nome ao mapa (ex: Direito Constitucional).');
      return;
    }
    try {
      const cat = categories.find(c => c.id === newCategoryId);
      const created = await onAddMap({
        title: newTitle.trim(),
        description: newDescription.trim(),
        category: cat?.name || 'Geral',
        categoryId: cat?.id || newCategoryId || null,
        color: newColor || cat?.color,
        rootLabel: newTitle.trim()
      });
      setShowAddModal(false);
      setNewTitle('');
      setNewDescription('');
      setFormError('');
      if (created?.id) {
        setPendingMap(created);
        openEditor(created);
      }
    } catch (err) {
      setFormError(err.message || 'Não foi possível criar o mapa.');
    }
  };

  const handleMoveNode = (nodeId, pos, commit) => {
    if (!editorMap) return;
    setLocalNodes((prev) => {
      const base = prev || editorMap.nodes;
      return base.map(n => (n.id === nodeId ? { ...n, ...pos } : n));
    });
    if (commit && onUpdateNode) onUpdateNode(editorMap.id, nodeId, pos);
  };

  const handleSaveNode = () => {
    if (!editorMap || !selectedNode) return;
    const label = draftLabel.trim() || selectedNode.label;
    onUpdateNode(editorMap.id, selectedNode.id, {
      label,
      notes: draftNotes
    });
    if (selectedNode.id === editorMap.rootId && onUpdateMap && label !== editorMap.title) {
      onUpdateMap(editorMap.id, { title: label, rootLabel: label });
    }
  };

  const handleAddChild = (parentId) => {
    if (!editorMap) return;
    onAddNode(editorMap.id, { parentId, label: 'Novo ramo' });
  };

  const studyQueue = useMemo(() => {
    if (!liveMap) return [];
    return getStudyQueue(liveMap, { today: todayStr, mode: studyMode, includeNotDue: true });
  }, [liveMap, studyMode, todayStr]);

  const dueQueue = useMemo(() => {
    if (!liveMap) return [];
    const due = getStudyQueue(liveMap, { today: todayStr, mode: studyMode });
    return due.length ? due : studyQueue;
  }, [liveMap, studyMode, todayStr, studyQueue]);

  const currentCard = dueQueue[studyIndex] || null;

  const rateCard = (quality) => {
    if (!currentCard) return;
    setStudyReviews(prev => [...prev.filter(r => r.nodeId !== currentCard.id), { nodeId: currentCard.id, quality }]);
    setRevealed(false);
    if (studyIndex + 1 >= dueQueue.length) {
      stopwatch.pause();
      setStudyIndex(dueQueue.length);
    } else {
      setStudyIndex(i => i + 1);
    }
  };

  const finishStudy = async () => {
    if (!liveMap || !studyReviews.length) return;
    await onStudyMap(liveMap.id, {
      reviews: studyReviews,
      durationMinutes: Math.max(1, Math.round((stopwatch.seconds || 0) / 60)),
      mode: studyMode,
      date: todayStr
    });
    stopwatch.reset();
    setView('list');
    setActiveMapId(null);
  };

  const promptDeleteMap = (map) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Mapa Mental',
      message: `Deseja realmente excluir "${map.title}"?\nTodos os ramos e as sessões de estudo serão removidos, com estorno das recompensas.`,
      confirmText: 'Sim, Excluir Mapa',
      cancelText: 'Cancelar',
      confirmVariant: 'danger',
      icon: Trash2,
      onConfirm: () => {
        if (onDeleteMap) onDeleteMap(map.id);
        if (activeMapId === map.id) {
          setActiveMapId(null);
          setView('list');
        }
        closeConfirmModal();
      }
    });
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!catName.trim()) {
      setCatError('Informe o nome do assunto.');
      return;
    }
    try {
      if (editingCategory) {
        await onUpdateCategory(editingCategory.id, {
          name: catName.trim(),
          color: catColor,
          parentId: catParentId || null
        });
      } else {
        await onAddCategory({
          name: catName.trim(),
          color: catColor,
          parentId: catParentId || null
        });
      }
      setCatName('');
      setCatParentId('');
      setEditingCategory(null);
      setCatError('');
    } catch (err) {
      setCatError(err.message || 'Não foi possível salvar o assunto.');
    }
  };

  const promptDeleteCategory = (cat) => {
    const kids = categories.filter(c => c.parentId === cat.id).length;
    setConfirmModal({
      isOpen: true,
      title: cat.parentId ? 'Excluir subassunto' : 'Excluir assunto',
      message: kids
        ? `Excluir "${cat.name}" também remove ${kids} subassunto(s). Os mapas serão movidos para outro assunto.`
        : `Excluir "${cat.name}"? Os mapas deste assunto serão movidos para outro assunto.`,
      confirmText: 'Sim, excluir',
      cancelText: 'Cancelar',
      confirmVariant: 'danger',
      icon: Trash2,
      onConfirm: () => {
        if (onDeleteCategory) onDeleteCategory(cat.id);
        if (editingCategory?.id === cat.id) setEditingCategory(null);
        closeConfirmModal();
      }
    });
  };

  const categoryOptions = (
    <>
      {rootCategories.map((root) => (
        <optgroup key={root.id} label={root.name}>
          <option value={root.id}>{root.name}</option>
          {categories.filter(c => c.parentId === root.id).map((child) => (
            <option key={child.id} value={child.id}>{root.name} · {child.name}</option>
          ))}
        </optgroup>
      ))}
    </>
  );

  const promptDeleteNode = () => {
    if (!editorMap || !selectedNode) return;
    const root = getRootNode(editorMap);
    if (root && selectedNode.id === root.id) return;
    setConfirmModal({
      isOpen: true,
      title: 'Excluir ramo',
      message: `Excluir "${selectedNode.label}" e todos os ramos abaixo dele?`,
      confirmText: 'Excluir ramo',
      cancelText: 'Cancelar',
      confirmVariant: 'danger',
      icon: Trash2,
      onConfirm: () => {
        onDeleteNode(editorMap.id, selectedNode.id);
        setSelectedId(editorMap.rootId);
        closeConfirmModal();
      }
    });
  };

  if (view === 'editor' && editorMap) {
    const stats = computeMapStats(editorMap, { today: todayStr });
    const editorBody = (
        <div className={`mindmap-editor-grid ${fullscreen ? 'is-fullscreen' : ''}`}>
          <MindMapCanvas
            map={editorMap}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onMoveNode={handleMoveNode}
            onAddChild={handleAddChild}
            fullscreen={fullscreen}
            onToggleFullscreen={() => setFullscreen(v => !v)}
          />
          <aside className="glass-panel mindmap-side">
            {selectedNode ? (
              <>
                <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Ramo selecionado
                </div>
                <input
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  onBlur={handleSaveNode}
                  style={inputStyle}
                />
                <textarea
                  value={draftNotes}
                  onChange={(e) => setDraftNotes(e.target.value)}
                  onBlur={handleSaveNode}
                  placeholder="Anotação, artigo, pegadinha, exemplo..."
                  rows={6}
                  style={{ ...inputStyle, marginTop: '10px', resize: 'vertical', minHeight: '120px' }}
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
                  {MIND_MAP_NODE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => onUpdateNode(editorMap.id, selectedNode.id, { color })}
                      style={{
                        width: 22, height: 22, borderRadius: '50%', background: color, cursor: 'pointer',
                        border: selectedNode.color === color ? '2px solid #fff' : '2px solid transparent'
                      }}
                    />
                  ))}
                </div>
                <div style={{ display: 'grid', gap: '8px', marginTop: '16px' }}>
                  <button type="button" className="mindmap-ghost-btn" onClick={() => handleAddChild(selectedNode.id)}>
                    <Plus size={14} /> Novo ramo filho
                  </button>
                  <button
                    type="button"
                    className="mindmap-ghost-btn"
                    onClick={() => onUpdateNode(editorMap.id, selectedNode.id, { collapsed: !selectedNode.collapsed })}
                  >
                    {selectedNode.collapsed ? <Eye size={14} /> : <EyeOff size={14} />}
                    {selectedNode.collapsed ? 'Expandir ramos' : 'Recolher ramos'}
                  </button>
                  {selectedNode.id !== editorMap.rootId && (
                    <button type="button" className="mindmap-ghost-btn is-danger" onClick={promptDeleteNode}>
                      <Trash2 size={14} /> Excluir ramo
                    </button>
                  )}
                </div>
                <label style={{ ...labelStyle, marginTop: 14 }}>Assunto</label>
                <select
                  value={editorMap.categoryId || ''}
                  onChange={(e) => {
                    const cat = categories.find(c => c.id === e.target.value);
                    if (onUpdateMap) onUpdateMap(editorMap.id, { categoryId: cat?.id || null, category: cat?.name || 'Geral' });
                  }}
                  style={inputStyle}
                >
                  {categoryOptions}
                </select>
                <div style={{ marginTop: '16px', fontSize: '0.75rem', color: '#64748b', lineHeight: 1.5 }}>
                  Caminho: {nodePath(editorMap, selectedNode.id).map(n => n.label).join(' → ')}
                </div>
              </>
            ) : (
              <p style={{ color: '#94a3b8', fontSize: '0.88rem' }}>Clique em um ramo para editar, anotar ou ramificar.</p>
            )}
          </aside>
        </div>
    );
    return (
      <div className={fullscreen ? 'mindmap-fullscreen-root' : undefined}>
        {!fullscreen && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <button type="button" className="mindmap-ghost-btn" onClick={() => { setFullscreen(false); setView('list'); setActiveMapId(null); }}>
                <ArrowLeft size={16} /> Mapas
              </button>
              <div>
                <h2 className="font-cinzel" style={{ fontSize: '1.25rem', fontWeight: 800 }}>{editorMap.title}</h2>
                <p style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                  {mindMapCategoryLabel(categories, editorMap.categoryId, editorMap.category)} · {stats.branches} ramos · {stats.dueBranches} para revisar
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button type="button" className="mindmap-ghost-btn" onClick={() => setFullscreen(true)}>
                <Maximize2 size={15} /> Tela cheia
              </button>
              <button type="button" className="mindmap-ghost-btn" onClick={() => onLayoutMap(editorMap.id)}>
                <Layout size={15} /> Organizar
              </button>
              <button
                type="button"
                onClick={() => openStudy(editorMap)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', borderRadius: '12px',
                  background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', color: '#fff', fontWeight: 800, border: 'none', cursor: 'pointer'
                }}
              >
                <GraduationCap size={16} /> Estudar mapa
              </button>
            </div>
          </div>
        )}
        {fullscreen && (
          <div className="mindmap-fullscreen-bar">
            <span className="font-cinzel">{editorMap.title}</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="mindmap-ghost-btn" onClick={() => onLayoutMap(editorMap.id)}><Layout size={14} /> Organizar</button>
              <button type="button" className="mindmap-ghost-btn" onClick={() => setFullscreen(false)}><Minimize2 size={14} /> Sair</button>
            </div>
          </div>
        )}
        {editorBody}
        <ConfirmModal {...confirmModal} onCancel={closeConfirmModal} />
      </div>
    );
  }

  if (view === 'study' && liveMap) {
    const done = studyIndex >= dueQueue.length && studyReviews.length > 0;
    return (
      <div className={fullscreen ? 'mindmap-fullscreen-root mindmap-study-fullscreen' : undefined}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
          <button type="button" className="mindmap-ghost-btn" onClick={() => { stopwatch.reset(); setFullscreen(false); setView('editor'); }}>
            <ArrowLeft size={16} /> Voltar ao mapa
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
            <Clock size={14} /> {formatTimer(stopwatch.seconds)}
            <button type="button" className="mindmap-ghost-btn" onClick={() => (stopwatch.isRunning ? stopwatch.pause() : stopwatch.start())}>
              {stopwatch.isRunning ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <button type="button" className="mindmap-ghost-btn" onClick={stopwatch.reset}><RotateCcw size={14} /></button>
            <button type="button" className="mindmap-ghost-btn" onClick={() => setFullscreen(v => !v)}>
              {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              {fullscreen ? 'Sair' : 'Tela cheia'}
            </button>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '10px', display: 'inline-flex', gap: '8px', marginBottom: '16px' }}>
          <button
            type="button"
            onClick={() => { setStudyMode('branches'); setStudyIndex(0); setRevealed(false); setStudyReviews([]); }}
            className="mindmap-ghost-btn"
            style={studyMode === 'branches' ? { borderColor: 'rgba(168,85,247,0.5)', color: '#c084fc' } : undefined}
          >
            <GitBranch size={14} /> Recobrir ramos
          </button>
          <button
            type="button"
            onClick={() => { setStudyMode('cards'); setStudyIndex(0); setRevealed(false); setStudyReviews([]); }}
            className="mindmap-ghost-btn"
            style={studyMode === 'cards' ? { borderColor: 'rgba(56,189,248,0.5)', color: '#38bdf8' } : undefined}
          >
            <Layers size={14} /> Cartões pai → filho
          </button>
        </div>

        {dueQueue.length === 0 ? (
          <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
            <Brain size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
            <p>Este mapa ainda não tem ramos para estudar. Volte ao editor e ramifique o núcleo.</p>
          </div>
        ) : done ? (
          <div className="glass-panel" style={{ padding: '28px', maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
            <Sparkles size={28} color="#fbbf24" style={{ marginBottom: 10 }} />
            <h3 className="font-cinzel" style={{ fontSize: '1.2rem', marginBottom: 8 }}>Sessão concluída</h3>
            <p style={{ color: '#94a3b8', marginBottom: 18 }}>
              {studyReviews.filter(r => r.quality >= 2).length}/{studyReviews.length} ramos lembrados · {formatTimer(stopwatch.seconds)}
            </p>
            <button
              type="button"
              onClick={finishStudy}
              style={{
                padding: '12px 22px', borderRadius: '12px', border: 'none', cursor: 'pointer', fontWeight: 800,
                background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#000'
              }}
            >
              Registrar estudo e ganhar XP
            </button>
          </div>
        ) : (
          <div className="glass-panel mindmap-study-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', fontSize: '0.78rem', marginBottom: '10px' }}>
              <span>{currentCard.path?.join(' → ')}</span>
              <span>{studyIndex + 1} / {dueQueue.length}</span>
            </div>
            <h3 className="font-cinzel" style={{ fontSize: '1.45rem', marginBottom: '14px' }}>{currentCard.prompt}</h3>
            {!revealed ? (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                style={{
                  width: '100%', padding: '16px', borderRadius: '12px', border: '1px dashed rgba(168,85,247,0.45)',
                  background: 'rgba(168,85,247,0.08)', color: '#e9d5ff', fontWeight: 800, cursor: 'pointer'
                }}
              >
                Revelar ramos
              </button>
            ) : (
              <>
                <div style={{ display: 'grid', gap: '8px', marginBottom: '18px' }}>
                  {(currentCard.answers || [currentCard.answer]).filter(Boolean).map((ans) => (
                    <div key={ans} className="mindmap-answer">{ans}</div>
                  ))}
                  {currentCard.notes && (
                    <p style={{ color: '#cbd5e1', fontSize: '0.88rem', fontStyle: 'italic' }}>{currentCard.notes}</p>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px' }}>
                  {QUALITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => rateCard(opt.value)}
                      style={{
                        padding: '12px 8px', borderRadius: '12px', border: `1px solid ${opt.color}55`,
                        background: `${opt.color}18`, color: opt.color, fontWeight: 800, cursor: 'pointer'
                      }}
                    >
                      {opt.label}
                      <div style={{ fontSize: '0.68rem', fontWeight: 600, opacity: 0.8 }}>{opt.hint}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        <ConfirmModal {...confirmModal} onCancel={closeConfirmModal} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🧠</span> Cartografia do Conhecimento
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Crie mapas mentais, ramifique ideias e estude depois com revisão espaçada.
          </p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <button
            type="button"
            className="mindmap-ghost-btn"
            onClick={() => { setShowCategoryModal(true); setCatError(''); setEditingCategory(null); setCatName(''); setCatParentId(''); }}
          >
            <FolderTree size={16} /> Assuntos
          </button>
          <button
            type="button"
            onClick={() => { setShowAddModal(true); setFormError(''); }}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '12px',
              background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', color: '#fff', fontWeight: 800, border: 'none', cursor: 'pointer'
            }}
          >
            <Plus size={18} /> Novo mapa
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '12px', marginBottom: '18px' }}>
        <StatCard label="Mapas" value={maps.length} color="#c084fc" />
        <StatCard label="Ramos para revisar" value={dueCount} color="#fbbf24" />
        <StatCard label="Sessões de estudo" value={sessions.length} color="#38bdf8" />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '18px' }}>
        <div className="glass-panel" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '220px' }}>
          <Search size={16} color="#94a3b8" />
          <input
            type="text"
            placeholder="Buscar mapa, ramo ou anotação..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ background: 'transparent', border: 'none', color: '#fff', width: '100%', outline: 'none' }}
          />
        </div>
        <select
          value={filterCategoryId}
          onChange={(e) => setFilterCategoryId(e.target.value)}
          style={{ ...inputStyle, width: 'auto', minWidth: 220 }}
        >
          <option value="all">Todos os assuntos</option>
          {categoryOptions}
        </select>
      </div>

      {sessions.length > 0 && (
        <div className="glass-panel" style={{ padding: '14px 16px', marginBottom: '18px' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: '10px' }}>
            Últimas sessões de estudo
          </div>
          <div style={{ display: 'grid', gap: '8px' }}>
            {sessions.slice(0, 5).map((s) => (
              <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '0.82rem', color: '#cbd5e1' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.mapTitle} · {s.recalled}/{s.reviewed} ramos ({s.accuracy}%)
                </span>
                <span style={{ color: '#64748b', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{s.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {filteredMaps.length === 0 ? (
        <div className="glass-panel" style={{ padding: '48px 20px', textAlign: 'center', color: '#64748b' }}>
          <Network size={42} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
          <p>Nenhum mapa mental ainda. Crie o primeiro núcleo e ramifique a matéria.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '22px' }}>
          {groupedMaps.filter(g => g.topics.some(t => t.maps.length)).map((group) => (
            <section key={group.root.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: group.root.color || '#a855f7' }} />
                <h3 className="font-cinzel" style={{ fontSize: '1.05rem', color: '#e2e8f0' }}>{group.root.name}</h3>
              </div>
              {group.topics.filter(t => t.maps.length > 0).map((topic) => (
                <div key={topic.category.id} style={{ marginBottom: 14 }}>
                  {topic.category.id !== group.root.id && (
                    <div style={{ fontSize: '0.75rem', color: topic.category.color || '#94a3b8', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', margin: '6px 0 10px 18px' }}>
                      {topic.category.name}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
                    {topic.maps.map((map) => {
                      const stats = computeMapStats(map, { today: todayStr });
                      return (
                        <div key={map.id} className="rpg-card" style={{ padding: '18px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                            <div>
                              <div style={{ fontSize: '0.72rem', color: map.color || topic.category.color || '#c084fc', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                {mindMapCategoryLabel(categories, map.categoryId, map.category || 'Geral')}
                              </div>
                              <h3 className="font-cinzel" style={{ fontSize: '1.05rem', margin: '6px 0' }}>{map.title}</h3>
                              {map.description && <p style={{ color: '#94a3b8', fontSize: '0.82rem' }}>{map.description}</p>}
                            </div>
                            <button type="button" className="mindmap-ghost-btn is-danger" onClick={() => promptDeleteMap(map)} title="Excluir">
                              <Trash2 size={14} />
                            </button>
                          </div>
                          <div style={{ display: 'flex', gap: '12px', margin: '14px 0', fontSize: '0.78rem', color: '#cbd5e1' }}>
                            <span><GitBranch size={12} /> {stats.branches} ramos</span>
                            <span><Bookmark size={12} /> {stats.withNotes} notas</span>
                            <span><Brain size={12} /> {stats.mastery}%</span>
                          </div>
                          <div className="progress-container" style={{ height: 8, marginBottom: 14 }}>
                            <div style={{ width: `${stats.mastery}%`, height: '100%', background: map.color || '#a855f7', borderRadius: 999 }} />
                          </div>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button type="button" className="mindmap-ghost-btn" onClick={() => openEditor(map)} style={{ flex: 1, justifyContent: 'center' }}>
                              <Pencil size={14} /> Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => openStudy(map)}
                              style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                padding: '8px 10px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 800,
                                background: 'rgba(168,85,247,0.18)', color: '#e9d5ff'
                              }}
                            >
                              <GraduationCap size={14} /> Estudar
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,13,0.88)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <form className="modal-sheet glass-panel" onSubmit={handleCreate} style={{ maxWidth: 480, padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 className="font-cinzel">Novo mapa mental</h3>
              <button type="button" className="mindmap-ghost-btn" onClick={() => setShowAddModal(false)}><X size={16} /></button>
            </div>
            <label style={labelStyle}>Título / núcleo</label>
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ex: Direito Constitucional" style={inputStyle} autoFocus />
            <label style={{ ...labelStyle, marginTop: 12 }}>Descrição</label>
            <textarea value={newDescription} onChange={(e) => setNewDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} placeholder="O que este mapa vai organizar?" />
            <label style={{ ...labelStyle, marginTop: 12 }}>Assunto / subassunto</label>
            <select value={newCategoryId} onChange={(e) => setNewCategoryId(e.target.value)} style={inputStyle}>
              {categoryOptions}
            </select>
            <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
              {MIND_MAP_NODE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setNewColor(color)}
                  style={{ width: 22, height: 22, borderRadius: '50%', background: color, border: newColor === color ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer' }}
                />
              ))}
            </div>
            {formError && (
              <p style={{ color: '#f87171', marginTop: 12, fontSize: '0.82rem', display: 'flex', gap: 6, alignItems: 'center' }}>
                <AlertCircle size={14} /> {formError}
              </p>
            )}
            <button
              type="submit"
              style={{
                marginTop: 18, width: '100%', padding: '12px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 800,
                background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)', color: '#fff'
              }}
            >
              <Check size={14} style={{ marginRight: 6 }} /> Criar e abrir editor
            </button>
          </form>
        </div>
      )}

      {showCategoryModal && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,13,0.88)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="modal-sheet glass-panel" style={{ maxWidth: 560, width: '100%', padding: 22 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 className="font-cinzel" style={{ color: '#c084fc', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Tag size={18} /> Assuntos e subassuntos
              </h3>
              <button type="button" className="mindmap-ghost-btn" onClick={() => setShowCategoryModal(false)}><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateCategory} style={{ marginBottom: 18, padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <label style={labelStyle}>{editingCategory ? 'Editar assunto' : 'Novo assunto'}</label>
              <input value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Ex: Direito Constitucional" style={inputStyle} />
              <label style={{ ...labelStyle, marginTop: 10 }}>Nível</label>
              <select value={catParentId} onChange={(e) => setCatParentId(e.target.value)} style={inputStyle}>
                <option value="">Assunto (matéria)</option>
                {rootCategories.filter(c => c.id !== editingCategory?.id).map((root) => (
                  <option key={root.id} value={root.id}>Subassunto de {root.name}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {MIND_MAP_NODE_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setCatColor(color)}
                    style={{ width: 20, height: 20, borderRadius: '50%', background: color, border: catColor === color ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer' }}
                  />
                ))}
              </div>
              {catError && <p style={{ color: '#f87171', marginTop: 10, fontSize: '0.8rem' }}>{catError}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button type="submit" className="mindmap-ghost-btn" style={{ color: '#e9d5ff', borderColor: 'rgba(168,85,247,0.4)' }}>
                  <Check size={14} /> {editingCategory ? 'Salvar' : 'Adicionar'}
                </button>
                {editingCategory && (
                  <button type="button" className="mindmap-ghost-btn" onClick={() => { setEditingCategory(null); setCatName(''); setCatParentId(''); }}>
                    Cancelar edição
                  </button>
                )}
              </div>
            </form>
            <div style={{ display: 'grid', gap: 8, maxHeight: 280, overflowY: 'auto' }}>
              {rootCategories.map((root) => (
                <div key={root.id}>
                  <div className="mindmap-cat-row">
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: '50%', background: root.color }} />
                      <strong>{root.name}</strong>
                    </span>
                    <span>
                      <button type="button" className="mindmap-ghost-btn" onClick={() => { setEditingCategory(root); setCatName(root.name); setCatColor(root.color); setCatParentId(''); }}><Pencil size={12} /></button>
                      <button type="button" className="mindmap-ghost-btn is-danger" onClick={() => promptDeleteCategory(root)}><Trash2 size={12} /></button>
                    </span>
                  </div>
                  {categories.filter(c => c.parentId === root.id).map((child) => (
                    <div key={child.id} className="mindmap-cat-row is-child">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: child.color }} />
                        {child.name}
                      </span>
                      <span>
                        <button type="button" className="mindmap-ghost-btn" onClick={() => { setEditingCategory(child); setCatName(child.name); setCatColor(child.color); setCatParentId(child.parentId || ''); }}><Pencil size={12} /></button>
                        <button type="button" className="mindmap-ghost-btn is-danger" onClick={() => promptDeleteCategory(child)}><Trash2 size={12} /></button>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmModal {...confirmModal} onCancel={closeConfirmModal} />
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="glass-panel" style={{ padding: '14px 16px', borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color, fontFamily: 'var(--font-mono)' }}>{value}</div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  background: '#0c0e14',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#f8fafc',
  fontSize: '0.9rem'
};

const labelStyle = {
  display: 'block',
  fontSize: '0.75rem',
  color: '#94a3b8',
  fontWeight: 700,
  marginBottom: 6
};
