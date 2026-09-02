import React, { useState, useEffect, useRef } from 'react';
import {
  Plus,
  BookOpen,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Brain,
  Sparkles,
  CheckCircle2,
  Trash2,
  Calendar,
  TrendingUp,
  Bookmark,
  Quote,
  Scroll,
  Copy,
  Check,
  Search,
  ChevronRight,
  ArrowLeft,
  Edit3,
  ExternalLink,
  Layers,
  FileText,
  AlertCircle
} from 'lucide-react';
import { formatFullAbntCitation } from '../utils/abntFormatter';
import { ConfirmModal } from './ConfirmModal';
import { useStopwatch, formatTimer } from '../hooks/useStopwatch';
import {
  readLiveReadingSession,
  writeLiveReadingSession,
  clearLiveReadingSession
} from '../utils/liveReadingSession';

export function BooksView({
  books,
  readingSessions,
  questCategories = [],
  onAddBook,
  onUpdateBook,
  onLogReadingSession,
  onUpdateReadingSession,
  onDeleteReadingSession,
  onDeleteBook,
  onAddBookQuote,
  onUpdateBookQuote,
  onDeleteBookQuote
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

  const restoredLiveSessionRef = useRef(readLiveReadingSession());
  const persistSessionRef = useRef(true);
  const restoredLiveSession = restoredLiveSessionRef.current;

  const [subTab, setSubTab] = useState('books'); // 'books' | 'quotes' | 'book-detail'
  const [selectedBookId, setSelectedBookId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeSessionBook, setActiveSessionBook] = useState(() => {
    if (!restoredLiveSession?.bookId) return null;
    return (books || []).find(b => b.id === restoredLiveSession.bookId) || null;
  });
  const [quoteSearch, setQuoteSearch] = useState('');
  const [bookQuoteSearch, setBookQuoteSearch] = useState('');
  const [copiedId, setCopiedId] = useState(null);

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

  const promptDeleteSession = (session) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Sessão de Leitura',
      message: `Deseja realmente excluir a sessão de leitura de ${session.startPage} a ${session.endPage} págs (+${session.pagesRead} págs)?\n\n⚠️ O XP (+${session.xpEarned} XP) e a sabedoria ganhos serão estornados e as páginas do livro serão recalculadas.`,
      confirmText: 'Sim, Excluir Sessão',
      cancelText: 'Cancelar',
      confirmVariant: 'danger',
      icon: Trash2,
      onConfirm: () => {
        if (onDeleteReadingSession) onDeleteReadingSession(session.id);
        closeConfirmModal();
      }
    });
  };

  const promptDeleteQuote = (bookId, quoteId) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Citação',
      message: 'Deseja realmente excluir esta citação do seu acervo?',
      confirmText: 'Sim, Excluir',
      cancelText: 'Cancelar',
      confirmVariant: 'danger',
      icon: Trash2,
      onConfirm: () => {
        if (onDeleteBookQuote) onDeleteBookQuote(bookId, quoteId);
        closeConfirmModal();
      }
    });
  };

  const promptDeleteBook = (book) => {
    setConfirmModal({
      isOpen: true,
      title: 'Excluir Livro',
      message: `Deseja realmente excluir o livro "${book.title}" e todo o histórico associado a ele?\nEsta ação não poderá ser desfeita.`,
      confirmText: 'Sim, Excluir Livro',
      cancelText: 'Cancelar',
      confirmVariant: 'danger',
      icon: Trash2,
      onConfirm: () => {
        if (onDeleteBook) onDeleteBook(book.id);
        setSubTab('books');
        closeConfirmModal();
      }
    });
  };

  // Edit Quote Modal State (CRUD/Edit for quotes)
  const [editingQuote, setEditingQuote] = useState(null);
  const [editQuoteModalText, setEditQuoteModalText] = useState('');
  const [editQuoteModalPage, setEditQuoteModalPage] = useState('');
  const [editQuoteModalNote, setEditQuoteModalNote] = useState('');

  // New Book Form
  const defaultBookCategory = activeCategories[0]
    ? (typeof activeCategories[0] === 'string' ? activeCategories[0] : activeCategories[0].name)
    : 'Estudos';

  const [newTitle, setNewTitle] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [newTotalPages, setNewTotalPages] = useState('');
  const [newCurrentPage, setNewCurrentPage] = useState('0');
  const [newCategory, setNewCategory] = useState(defaultBookCategory);
  const [newCoverColor, setNewCoverColor] = useState('gradient-amber');
  const [newNotes, setNewNotes] = useState('');

  // Sync newCategory with activeCategories
  useEffect(() => {
    const validNames = activeCategories.map(c => typeof c === 'string' ? c : c.name);
    if (validNames.length > 0 && !validNames.includes(newCategory)) {
      setNewCategory(validNames[0]);
    }
  }, [activeCategories, newCategory]);

  // Edit Book Form
  const [editingBook, setEditingBook] = useState(null);
  const [editBookTitle, setEditBookTitle] = useState('');
  const [editBookAuthor, setEditBookAuthor] = useState('');
  const [editBookTotalPages, setEditBookTotalPages] = useState('');
  const [editBookCurrentPage, setEditBookCurrentPage] = useState('0');
  const [editBookCategory, setEditBookCategory] = useState(defaultBookCategory);
  const [editBookCoverColor, setEditBookCoverColor] = useState('gradient-amber');
  const [editBookNotes, setEditBookNotes] = useState('');
  const [editBookStatus, setEditBookStatus] = useState('reading');

  // Reading Session Stopwatch & Input (wall-clock; survives tab hibernation)
  const {
    seconds: timerSeconds,
    isRunning: isTimerRunning,
    toggle: toggleTimer,
    reset: resetTimer,
    restart: restartTimer,
    getSnapshot: getTimerSnapshot,
    getElapsedSeconds
  } = useStopwatch({
    initialAccumulatedMs: restoredLiveSession?.timer?.accumulatedMs || 0,
    initialRunStartedAt: restoredLiveSession?.timer?.runStartedAt || null
  });
  const [sessionStartPage, setSessionStartPage] = useState(() => restoredLiveSession?.sessionStartPage ?? 0);
  const [sessionEndPage, setSessionEndPage] = useState(() => restoredLiveSession?.sessionEndPage ?? 0);
  const [sessionNotes, setSessionNotes] = useState(() => restoredLiveSession?.sessionNotes || '');
  
  // Reading Session Item-by-item quotes list
  const [sessionQuotes, setSessionQuotes] = useState(() => Array.isArray(restoredLiveSession?.sessionQuotes) ? restoredLiveSession.sessionQuotes : []);
  const [currentQuoteText, setCurrentQuoteText] = useState(() => restoredLiveSession?.currentQuoteText || '');
  const [currentQuotePage, setCurrentQuotePage] = useState(() => restoredLiveSession?.currentQuotePage || '');
  const [currentQuoteNote, setCurrentQuoteNote] = useState(() => restoredLiveSession?.currentQuoteNote || '');

  // Edit Reading Session State
  const [editingSession, setEditingSession] = useState(null);
  const [editStartPage, setEditStartPage] = useState(0);
  const [editEndPage, setEditEndPage] = useState(0);
  const [editDurationMinutes, setEditDurationMinutes] = useState(20);
  const [editNotes, setEditNotes] = useState('');
  const [editQuotes, setEditQuotes] = useState([]);
  const [editQuoteText, setEditQuoteText] = useState('');
  const [editQuotePage, setEditQuotePage] = useState('');
  const [editQuoteNote, setEditQuoteNote] = useState('');

  // Direct Quote Adding Form (in Book Detail View)
  const [showDirectQuoteForm, setShowDirectQuoteForm] = useState(false);
  const [directQuoteText, setDirectQuoteText] = useState('');
  const [directQuotePage, setDirectQuotePage] = useState('');
  const [directQuoteNote, setDirectQuoteNote] = useState('');

  useEffect(() => {
    if (activeSessionBook) return;
    const restored = restoredLiveSessionRef.current;
    if (!restored?.bookId) return;
    const book = (books || []).find(b => b.id === restored.bookId);
    if (book) {
      persistSessionRef.current = true;
      setActiveSessionBook(book);
      return;
    }
    if (Array.isArray(books)) {
      restoredLiveSessionRef.current = null;
      persistSessionRef.current = false;
      clearLiveReadingSession();
    }
  }, [books, activeSessionBook]);

  useEffect(() => {
    if (!activeSessionBook) {
      if (!restoredLiveSessionRef.current) clearLiveReadingSession();
      return;
    }

    const persist = () => {
      if (!persistSessionRef.current) return;
      const snap = getTimerSnapshot();
      writeLiveReadingSession({
        bookId: activeSessionBook.id,
        sessionStartPage,
        sessionEndPage,
        sessionNotes,
        sessionQuotes,
        currentQuoteText,
        currentQuotePage,
        currentQuoteNote,
        timer: {
          accumulatedMs: snap.accumulatedMs,
          runStartedAt: snap.runStartedAt
        },
        updatedAt: Date.now()
      });
    };

    persist();
    restoredLiveSessionRef.current = null;

    const persistIfHidden = () => {
      if (document.visibilityState === 'hidden') persist();
    };
    const persistInterval = setInterval(persist, isTimerRunning ? 5000 : 15000);
    document.addEventListener('visibilitychange', persistIfHidden);
    window.addEventListener('pagehide', persist);
    document.addEventListener('freeze', persist);
    return () => {
      persist();
      clearInterval(persistInterval);
      document.removeEventListener('visibilitychange', persistIfHidden);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('freeze', persist);
    };
  }, [
    activeSessionBook,
    sessionStartPage,
    sessionEndPage,
    sessionNotes,
    sessionQuotes,
    currentQuoteText,
    currentQuotePage,
    currentQuoteNote,
    isTimerRunning,
    getTimerSnapshot
  ]);

  const selectedBook = (books || []).find(b => b.id === selectedBookId);

  const handleOpenBookDetail = (book) => {
    setSelectedBookId(book.id);
    setSubTab('book-detail');
    setBookQuoteSearch('');
    setShowDirectQuoteForm(false);
  };

  const handleOpenSessionModal = (book, e) => {
    if (e) e.stopPropagation();
    restoredLiveSessionRef.current = null;
    persistSessionRef.current = true;
    setActiveSessionBook(book);
    setSessionStartPage(book.currentPage);
    setSessionEndPage(Math.min(book.totalPages, book.currentPage + 15));
    setCurrentQuotePage(String(Math.min(book.totalPages, book.currentPage + 15)));
    setSessionNotes('');
    setSessionQuotes([]);
    setCurrentQuoteText('');
    setCurrentQuoteNote('');
    restartTimer();
  };

  const handleCloseSessionModal = () => {
    persistSessionRef.current = false;
    restoredLiveSessionRef.current = null;
    clearLiveReadingSession();
    setActiveSessionBook(null);
    resetTimer();
    setSessionQuotes([]);
    setCurrentQuoteText('');
    setCurrentQuoteNote('');
  };

  // Add individual quote to session temp list
  const handleAddQuoteToSession = () => {
    if (!currentQuoteText.trim()) {
      showAlert('Citação Vazia', 'Digite o texto da citação antes de adicionar.');
      return;
    }
    const pageNum = parseInt(currentQuotePage, 10) || parseInt(sessionEndPage, 10) || activeSessionBook?.currentPage || 1;
    const newQuoteItem = {
      id: 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      quote: currentQuoteText.trim(),
      page: pageNum,
      note: currentQuoteNote.trim(),
      createdAt: new Date().toISOString()
    };

    setSessionQuotes(prev => [...prev, newQuoteItem]);
    setCurrentQuoteText('');
    setCurrentQuoteNote('');
  };

  const handleRemoveQuoteFromSession = (id) => {
    setSessionQuotes(prev => prev.filter(q => q.id !== id));
  };

  const handleSaveSession = (e) => {
    e.preventDefault();
    if (!activeSessionBook) return;

    const sPage = parseInt(sessionStartPage, 10);
    const ePage = parseInt(sessionEndPage, 10);

    if (ePage <= sPage) {
      showAlert('Páginas Inválidas', 'A página final deve ser maior que a página inicial da sessão.');
      return;
    }

    const durationMinutes = Math.max(1, Math.round(getElapsedSeconds() / 60));

    // If user typed a quote in input but forgot to click "+ Adicionar", include it automatically
    let finalQuotes = [...sessionQuotes];
    if (currentQuoteText.trim()) {
      finalQuotes.push({
        id: 'temp-' + Date.now(),
        quote: currentQuoteText.trim(),
        page: parseInt(currentQuotePage, 10) || ePage,
        note: currentQuoteNote.trim(),
        createdAt: new Date().toISOString()
      });
    }

    persistSessionRef.current = false;
    restoredLiveSessionRef.current = null;
    clearLiveReadingSession();

    onLogReadingSession(activeSessionBook.id, {
      startPage: sPage,
      endPage: ePage,
      durationMinutes,
      notes: sessionNotes,
      quotes: finalQuotes
    });

    handleCloseSessionModal();
  };

  // Edit Session Handlers
  const handleOpenEditSessionModal = (session) => {
    setEditingSession(session);
    setEditStartPage(session.startPage || 0);
    setEditEndPage(session.endPage || 0);
    setEditDurationMinutes(session.durationMinutes || 20);
    setEditNotes(session.notes || '');
    setEditQuotes(Array.isArray(session.quotes) ? [...session.quotes] : []);
    setEditQuoteText('');
    setEditQuotePage('');
    setEditQuoteNote('');
  };

  const handleCloseEditSessionModal = () => {
    setEditingSession(null);
    setEditQuotes([]);
    setEditQuoteText('');
    setEditQuoteNote('');
  };

  const handleAddQuoteToEditSession = () => {
    if (!editQuoteText.trim()) {
      showAlert('Citação Vazia', 'Digite o texto da citação antes de adicionar.');
      return;
    }
    const pageNum = parseInt(editQuotePage, 10) || parseInt(editEndPage, 10) || 1;
    const newQuoteItem = {
      id: 'quo-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      bookId: editingSession?.bookId,
      bookTitle: editingSession?.bookTitle,
      quote: editQuoteText.trim(),
      page: pageNum,
      note: editQuoteNote.trim(),
      createdAt: new Date().toISOString()
    };

    setEditQuotes(prev => [...prev, newQuoteItem]);
    setEditQuoteText('');
    setEditQuoteNote('');
  };

  const handleRemoveQuoteFromEditSession = (id) => {
    setEditQuotes(prev => prev.filter(q => q.id !== id));
  };

  const handleSaveEditSession = (e) => {
    e.preventDefault();
    if (!editingSession || !onUpdateReadingSession) return;

    const sPage = parseInt(editStartPage, 10);
    const ePage = parseInt(editEndPage, 10);

    if (ePage <= sPage) {
      showAlert('Páginas Inválidas', 'A página final deve ser maior que a página inicial da sessão.');
      return;
    }

    let finalQuotes = [...editQuotes];
    if (editQuoteText.trim()) {
      finalQuotes.push({
        id: 'quo-' + Date.now(),
        bookId: editingSession.bookId,
        bookTitle: editingSession.bookTitle,
        quote: editQuoteText.trim(),
        page: parseInt(editQuotePage, 10) || ePage,
        note: editQuoteNote.trim(),
        createdAt: new Date().toISOString()
      });
    }

    onUpdateReadingSession(editingSession.id, {
      startPage: sPage,
      endPage: ePage,
      durationMinutes: parseInt(editDurationMinutes, 10) || 20,
      notes: editNotes,
      quotes: finalQuotes
    });

    handleCloseEditSessionModal();
  };

  const handleDeleteSession = (session) => {
    if (!onDeleteReadingSession) return;
    promptDeleteSession(session);
  };

  const handleSaveDirectQuote = (e) => {
    e.preventDefault();
    if (!selectedBook || !directQuoteText.trim()) return;

    if (onAddBookQuote) {
      onAddBookQuote(selectedBook.id, {
        quote: directQuoteText.trim(),
        page: parseInt(directQuotePage, 10) || selectedBook.currentPage || 1,
        note: directQuoteNote.trim()
      });
    }

    setDirectQuoteText('');
    setDirectQuotePage('');
    setDirectQuoteNote('');
    setShowDirectQuoteForm(false);
  };

  const handleCreateBook = (e) => {
    e.preventDefault();
    if (!newTitle.trim() || !newTotalPages) return;

    onAddBook({
      title: newTitle.trim(),
      author: newAuthor.trim(),
      totalPages: parseInt(newTotalPages, 10),
      currentPage: parseInt(newCurrentPage, 10) || 0,
      category: newCategory,
      coverColor: newCoverColor,
      notes: newNotes
    });

    setNewTitle('');
    setNewAuthor('');
    setNewTotalPages('');
    setNewCurrentPage('0');
    setNewNotes('');
    setShowAddModal(false);
  };

  const handleOpenEditBookModal = (book, e) => {
    if (e) e.stopPropagation();
    setEditingBook(book);
    setEditBookTitle(book.title || '');
    setEditBookAuthor(book.author || '');
    setEditBookTotalPages(String(book.totalPages || ''));
    setEditBookCurrentPage(String(book.currentPage || 0));
    setEditBookCategory(book.category || (activeCategories[0] ? (typeof activeCategories[0] === 'string' ? activeCategories[0] : activeCategories[0].name) : 'Estudos'));
    setEditBookCoverColor(book.coverColor || 'gradient-amber');
    setEditBookNotes(book.notes || '');
    setEditBookStatus(book.status || 'reading');
  };

  const handleCloseEditBookModal = () => {
    setEditingBook(null);
    setEditBookTitle('');
    setEditBookAuthor('');
    setEditBookTotalPages('');
    setEditBookCurrentPage('0');
    setEditBookNotes('');
  };

  const handleSaveEditBook = (e) => {
    e.preventDefault();
    if (!editingBook) return;
    if (!editBookTitle.trim() || !editBookTotalPages) {
      showAlert('Campos Obrigatórios', 'Por favor, informe o título e o total de páginas do livro.');
      return;
    }

    const total = parseInt(editBookTotalPages, 10);
    const current = parseInt(editBookCurrentPage, 10) || 0;

    if (isNaN(total) || total <= 0) {
      showAlert('Total de Páginas Inválido', 'O total de páginas deve ser maior que zero.');
      return;
    }

    if (current < 0 || current > total) {
      showAlert('Página Atual Inválida', 'A página atual deve estar entre 0 e o total de páginas.');
      return;
    }

    if (onUpdateBook) {
      onUpdateBook(editingBook.id, {
        title: editBookTitle.trim(),
        author: editBookAuthor.trim(),
        totalPages: total,
        currentPage: current,
        category: editBookCategory,
        coverColor: editBookCoverColor,
        status: current >= total ? 'completed' : editBookStatus,
        notes: editBookNotes.trim()
      });
    }

    handleCloseEditBookModal();
  };

  const handleCopyQuote = (quoteObj, bookOverride) => {
    const book = bookOverride || (books || []).find(b => b.id === quoteObj.bookId || b.title === quoteObj.bookTitle);
    const abntText = formatFullAbntCitation(quoteObj.quote, book, quoteObj.page);
    navigator.clipboard.writeText(abntText);
    setCopiedId(quoteObj.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleOpenEditQuoteModal = (quoteObj) => {
    setEditingQuote(quoteObj);
    setEditQuoteModalText(quoteObj.quote || '');
    setEditQuoteModalPage(String(quoteObj.page || ''));
    setEditQuoteModalNote(quoteObj.note || '');
  };

  const handleCloseEditQuoteModal = () => {
    setEditingQuote(null);
    setEditQuoteModalText('');
    setEditQuoteModalPage('');
    setEditQuoteModalNote('');
  };

  const handleSaveEditedQuote = (e) => {
    e.preventDefault();
    if (!editingQuote || !editQuoteModalText.trim()) return;

    if (onUpdateBookQuote) {
      onUpdateBookQuote(editingQuote.bookId, editingQuote.id, {
        quote: editQuoteModalText.trim(),
        page: parseInt(editQuoteModalPage, 10) || 1,
        note: editQuoteModalNote.trim()
      });
    }

    handleCloseEditQuoteModal();
  };

  const coverOptions = [
    { key: 'gradient-amber', name: 'Âmbar Dourado' },
    { key: 'gradient-emerald', name: 'Esmeralda' },
    { key: 'gradient-blue', name: 'Safira' },
    { key: 'gradient-purple', name: 'Ametista' },
    { key: 'gradient-rose', name: 'Rubi' },
    { key: 'gradient-cyan', name: 'Cristal' }
  ];

  // Helper to extract all structured quotes for a book (from book.quotes array + sessions)
  const getAllQuotesForBook = (book) => {
    if (!book) return [];
    const directQuotes = (book.quotes || []).map(q => ({
      ...q,
      bookId: book.id,
      bookTitle: book.title,
      sourceType: 'quote'
    }));

    const sessionQuotesList = [];
    (readingSessions || []).filter(s => s.bookId === book.id).forEach(s => {
      if (Array.isArray(s.quotes) && s.quotes.length > 0) {
        s.quotes.forEach(q => {
          // Avoid duplicate IDs if already in directQuotes
          if (!directQuotes.some(dq => dq.id === q.id)) {
            sessionQuotesList.push({
              ...q,
              bookId: book.id,
              bookTitle: book.title,
              sessionDate: s.timestamp,
              sourceType: 'session_quote'
            });
          }
        });
      } else if (s.notes && s.notes.trim()) {
        // Fallback for legacy sessions without structured quotes
        const legacyId = `legacy-${s.id}`;
        if (!directQuotes.some(dq => dq.id === legacyId)) {
          sessionQuotesList.push({
            id: legacyId,
            bookId: book.id,
            bookTitle: book.title,
            quote: s.notes,
            page: s.endPage || s.startPage || 1,
            note: `Sessão de Leitura (págs ${s.startPage}-${s.endPage})`,
            createdAt: s.timestamp,
            sessionDate: s.timestamp,
            sourceType: 'legacy_note'
          });
        }
      }
    });

    const combined = [...directQuotes, ...sessionQuotesList];
    // Sort by page asc or date desc
    return combined.sort((a, b) => (a.page || 0) - (b.page || 0));
  };

  // Helper to collect all quotes across the entire library for the "Grimório de Citações" tab
  const getAllLibraryQuotes = () => {
    const allQuotes = [];
    (books || []).forEach(b => {
      const bookQuotes = getAllQuotesForBook(b);
      allQuotes.push(...bookQuotes);
    });
    return allQuotes.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  };

  const allLibraryQuotes = getAllLibraryQuotes();
  const filteredLibraryQuotes = allLibraryQuotes.filter(q => {
    return quoteSearch === '' ||
      (q.quote && q.quote.toLowerCase().includes(quoteSearch.toLowerCase())) ||
      (q.bookTitle && q.bookTitle.toLowerCase().includes(quoteSearch.toLowerCase())) ||
      (q.note && q.note.toLowerCase().includes(quoteSearch.toLowerCase()));
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '20px' }}>
        <div>
          <h2 className="font-cinzel" style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>📚</span> Biblioteca Ancestral
          </h2>
          <p style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
            Acompanhe leituras sessão por sessão, ganhe Sabedoria e preserve citações página por página!
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 18px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#fff',
              fontWeight: 800,
              fontSize: '0.9rem',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(16, 185, 129, 0.35)',
              transition: 'transform 0.15s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            <Plus size={18} /> Cadastrar Livro
          </button>
        </div>
      </div>

      {/* Sub-Navigation: Books vs Quotes vs Active Book Detail */}
      <div
        className="glass-panel"
        style={{
          padding: '6px 10px',
          marginBottom: '22px',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          borderRadius: '12px'
        }}
      >
        <button
          onClick={() => setSubTab('books')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '8px',
            background: subTab === 'books' ? 'rgba(16, 185, 129, 0.2)' : 'transparent',
            border: subTab === 'books' ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid transparent',
            color: subTab === 'books' ? '#34d399' : '#94a3b8',
            fontWeight: subTab === 'books' ? 800 : 600,
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          <BookOpen size={16} /> Meus Livros ({books?.length || 0})
        </button>

        {selectedBook && (
          <button
            onClick={() => setSubTab('book-detail')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              borderRadius: '8px',
              background: subTab === 'book-detail' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              border: subTab === 'book-detail' ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid transparent',
              color: subTab === 'book-detail' ? '#38bdf8' : '#94a3b8',
              fontWeight: subTab === 'book-detail' ? 800 : 600,
              fontSize: '0.85rem',
              cursor: 'pointer'
            }}
          >
            <Bookmark size={16} /> 📖 {selectedBook.title.length > 25 ? selectedBook.title.substring(0, 25) + '...' : selectedBook.title}
          </button>
        )}

        <button
          onClick={() => setSubTab('quotes')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '8px',
            background: subTab === 'quotes' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
            border: subTab === 'quotes' ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
            color: subTab === 'quotes' ? '#fbbf24' : '#94a3b8',
            fontWeight: subTab === 'quotes' ? 800 : 600,
            fontSize: '0.85rem',
            cursor: 'pointer'
          }}
        >
          <Quote size={16} /> Grimório de Citações ({allLibraryQuotes.length})
        </button>
      </div>

      {/* VIEW 1: BOOKS GRID */}
      {subTab === 'books' && (
        <>
          {(!books || books.length === 0) ? (
            <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
              <BookOpen size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
              <p style={{ fontSize: '1rem', fontWeight: 600 }}>Nenhum tomo cadastrado na sua biblioteca.</p>
              <p style={{ fontSize: '0.85rem' }}>Cadastre um livro para iniciar sessões de leitura e acumular Sabedoria!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '20px' }}>
              {books.map(book => {
                const percent = Math.min(100, Math.round((book.currentPage / book.totalPages) * 100));
                const isCompleted = book.status === 'completed' || book.currentPage >= book.totalPages;
                const bookQuotes = getAllQuotesForBook(book);
                const latestQuote = bookQuotes[bookQuotes.length - 1];

                return (
                  <div
                    key={book.id}
                    onClick={() => handleOpenBookDetail(book)}
                    className="rpg-card"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      border: isCompleted ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.08)',
                      transition: 'all 0.2s ease'
                    }}
                    title="Clique para abrir os detalhes completos e citações deste livro"
                  >
                    {/* Book Cover Header Bar */}
                    <div
                      className={book.coverColor || 'gradient-amber'}
                      style={{
                        padding: '20px',
                        position: 'relative',
                        color: '#fff',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        minHeight: '110px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', fontWeight: 700 }}>
                          {book.category || 'Geral'}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.72rem', padding: '2px 6px', borderRadius: '6px', background: 'rgba(0,0,0,0.4)', color: '#fbbf24', fontWeight: 700 }}>
                            {bookQuotes.length} {bookQuotes.length === 1 ? 'citação' : 'citações'}
                          </span>
                          {onUpdateBook && (
                            <button
                              onClick={(e) => handleOpenEditBookModal(book, e)}
                              style={{
                                background: 'rgba(0,0,0,0.3)',
                                border: 'none',
                                color: '#fff',
                                cursor: 'pointer',
                                padding: '4px 6px',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                              onMouseOver={(e) => e.currentTarget.style.color = '#38bdf8'}
                              onMouseOut={(e) => e.currentTarget.style.color = '#fff'}
                              title="Editar livro"
                            >
                              <Edit3 size={14} />
                            </button>
                          )}
                          {onDeleteBook && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                promptDeleteBook(book);
                              }}
                              style={{
                                background: 'rgba(0,0,0,0.3)',
                                border: 'none',
                                color: '#fff',
                                cursor: 'pointer',
                                padding: '4px 6px',
                                borderRadius: '6px',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                              onMouseOver={(e) => e.currentTarget.style.color = '#f87171'}
                              onMouseOut={(e) => e.currentTarget.style.color = '#fff'}
                              title="Excluir livro"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <h3 className="font-cinzel" style={{ fontSize: '1.15rem', fontWeight: 800, textShadow: '0 2px 4px rgba(0,0,0,0.6)', lineHeight: 1.2 }}>
                          {book.title}
                        </h3>
                        <p style={{ fontSize: '0.8rem', opacity: 0.9, marginTop: '2px' }}>
                          {book.author}
                        </p>
                      </div>
                    </div>

                    {/* Book Details & Progress */}
                    <div style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between', gap: '14px' }}>
                      
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', marginBottom: '8px' }}>
                          <span style={{ color: '#94a3b8', fontWeight: 600 }}>Progresso da Leitura</span>
                          <span style={{ color: '#34d399', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                            {book.currentPage} / {book.totalPages} págs ({percent}%)
                          </span>
                        </div>

                        <div className="progress-container" style={{ height: '8px', marginBottom: '12px' }}>
                          <div className="progress-fill-book" style={{ width: `${percent}%` }} />
                        </div>

                        {/* Quotes Preview */}
                        {latestQuote ? (
                          <div
                            style={{
                              padding: '10px 12px',
                              borderRadius: '10px',
                              background: 'rgba(245, 158, 11, 0.08)',
                              border: '1px solid rgba(245, 158, 11, 0.25)',
                              marginBottom: '8px'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem', color: '#fbbf24', fontWeight: 700, marginBottom: '4px' }}>
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Quote size={12} /> Citação (pág. {latestQuote.page})
                              </span>
                              <span style={{ fontSize: '0.72rem', color: '#38bdf8' }}>Ver detalhes →</span>
                            </div>
                            <p style={{ fontSize: '0.8rem', color: '#f8fafc', fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>
                              "{latestQuote.quote}"
                            </p>
                          </div>
                        ) : book.notes ? (
                          <p style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: '8px' }}>
                            "{book.notes}"
                          </p>
                        ) : (
                          <div style={{ fontSize: '0.78rem', color: '#64748b', fontStyle: 'italic', marginBottom: '8px' }}>
                            Nenhuma citação registrada ainda. Clique para abrir o livro e adicionar!
                          </div>
                        )}
                      </div>

                      {/* Actions & Button */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#34d399', fontSize: '0.8rem', fontWeight: 700 }}>
                          <Brain size={15} /> +{book.currentPage * 2} XP Sabedoria
                        </div>

                        {!isCompleted ? (
                          <button
                            onClick={(e) => handleOpenSessionModal(book, e)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '8px 14px',
                              borderRadius: '10px',
                              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                              color: '#fff',
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              border: 'none',
                              cursor: 'pointer',
                              boxShadow: '0 2px 10px rgba(16, 185, 129, 0.3)',
                              transition: 'transform 0.15s ease'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.03)'}
                            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                          >
                            <Bookmark size={15} /> Registrar Leitura
                          </button>
                        ) : (
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#10b981', fontSize: '0.85rem', fontWeight: 800 }}>
                            <CheckCircle2 size={16} /> Concluído!
                          </span>
                        )}
                      </div>

                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* VIEW 2: BOOK DETAILS FULL TAB (FICHA COMPLETA DO TOMO) */}
      {subTab === 'book-detail' && selectedBook && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          
          {/* Back button */}
          <button
            onClick={() => setSubTab('books')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '0.9rem',
              fontWeight: 700,
              cursor: 'pointer',
              width: 'fit-content'
            }}
            onMouseOver={(e) => e.currentTarget.style.color = '#38bdf8'}
            onMouseOut={(e) => e.currentTarget.style.color = '#94a3b8'}
          >
            <ArrowLeft size={18} /> Voltar para Meus Livros
          </button>

          {/* Book Hero Banner */}
          <div
            className={`glass-panel ${selectedBook.coverColor || 'gradient-amber'}`}
            style={{
              padding: '28px 32px',
              borderRadius: '20px',
              color: '#fff',
              position: 'relative',
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '20px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.4)'
            }}
          >
            <div style={{ maxWidth: '650px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.8rem', padding: '3px 10px', borderRadius: '8px', background: 'rgba(0,0,0,0.35)', fontWeight: 800 }}>
                  {selectedBook.category || 'Geral'}
                </span>
                <span style={{ fontSize: '0.8rem', padding: '3px 10px', borderRadius: '8px', background: selectedBook.currentPage >= selectedBook.totalPages ? 'rgba(16, 185, 129, 0.4)' : 'rgba(245, 158, 11, 0.4)', fontWeight: 800 }}>
                  {selectedBook.currentPage >= selectedBook.totalPages ? '✓ Leitura Concluída' : '📖 Em Andamento'}
                </span>
              </div>

              <h2 className="font-cinzel" style={{ fontSize: '1.8rem', fontWeight: 900, textShadow: '0 2px 8px rgba(0,0,0,0.6)', lineHeight: 1.2, marginBottom: '6px' }}>
                {selectedBook.title}
              </h2>
              <p style={{ fontSize: '1rem', opacity: 0.9, fontWeight: 600 }}>
                Autor: {selectedBook.author}
              </p>
            </div>

            {/* Quick Action Buttons */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
              <button
                onClick={(e) => handleOpenSessionModal(selectedBook, e)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 20px',
                  borderRadius: '12px',
                  background: '#fff',
                  color: '#000',
                  fontWeight: 900,
                  fontSize: '0.9rem',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
                }}
              >
                <Bookmark size={18} color="#10b981" /> Iniciar Sessão de Leitura
              </button>

              <button
                onClick={() => setShowDirectQuoteForm(prev => !prev)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 18px',
                  borderRadius: '12px',
                  background: 'rgba(0,0,0,0.35)',
                  backdropFilter: 'blur(8px)',
                  color: '#fbbf24',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  border: '1px solid rgba(255,255,255,0.2)',
                  cursor: 'pointer'
                }}
              >
                <Quote size={18} /> {showDirectQuoteForm ? 'Fechar Cadastro' : '+ Cadastrar Citação Direta'}
              </button>

              {onUpdateBook && (
                <button
                  onClick={() => handleOpenEditBookModal(selectedBook)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: 'rgba(56, 189, 248, 0.25)',
                    backdropFilter: 'blur(8px)',
                    color: '#38bdf8',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    border: '1px solid rgba(56, 189, 248, 0.4)',
                    cursor: 'pointer'
                  }}
                  title="Editar este livro"
                >
                  <Edit3 size={16} /> Editar Tomo
                </button>
              )}

              {onDeleteBook && (
                <button
                  onClick={() => promptDeleteBook(selectedBook)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: 'rgba(239, 68, 68, 0.25)',
                    backdropFilter: 'blur(8px)',
                    color: '#fca5a5',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    cursor: 'pointer'
                  }}
                  title="Excluir este livro"
                >
                  <Trash2 size={16} /> Excluir Tomo
                </button>
              )}
            </div>
          </div>

          {/* Book Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
            
            {/* Progresso */}
            <div className="glass-panel" style={{ padding: '16px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Progresso</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#34d399', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>
                {Math.min(100, Math.round((selectedBook.currentPage / selectedBook.totalPages) * 100))}%
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                {selectedBook.currentPage} de {selectedBook.totalPages} páginas
              </div>
              <div className="progress-container" style={{ height: '6px', marginTop: '8px' }}>
                <div className="progress-fill-book" style={{ width: `${Math.min(100, Math.round((selectedBook.currentPage / selectedBook.totalPages) * 100))}%` }} />
              </div>
            </div>

            {/* Citações Salvas */}
            {(() => {
              const bookQuotes = getAllQuotesForBook(selectedBook);
              return (
                <div className="glass-panel" style={{ padding: '16px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Citações Catalogadas</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#fbbf24', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>
                    {bookQuotes.length}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    Passagens marcantes salvas
                  </div>
                </div>
              );
            })()}

            {/* Sessões Realizadas */}
            {(() => {
              const bookSessions = (readingSessions || []).filter(s => s.bookId === selectedBook.id);
              const totalMins = bookSessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
              return (
                <div className="glass-panel" style={{ padding: '16px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Sessões & Tempo</span>
                  <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#38bdf8', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>
                    {bookSessions.length} sessões
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    Total: ~{Math.round(totalMins / 60 * 10) / 10} horas dedicadas
                  </div>
                </div>
              );
            })()}

            {/* Sabedoria XP */}
            <div className="glass-panel" style={{ padding: '16px' }}>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>Sabedoria Adquirida</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#c084fc', fontFamily: 'var(--font-mono)', margin: '4px 0' }}>
                +{selectedBook.currentPage * 2} XP
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Faltam {Math.max(0, selectedBook.totalPages - selectedBook.currentPage)} páginas
              </div>
            </div>

          </div>

          {/* Direct Quote Registration Form Accordion */}
          {showDirectQuoteForm && (
            <div
              className="glass-panel"
              style={{
                padding: '24px',
                borderRadius: '16px',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                background: 'rgba(245, 158, 11, 0.04)'
              }}
            >
              <h3 className="font-cinzel" style={{ fontSize: '1.15rem', fontWeight: 800, color: '#fbbf24', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Quote size={18} /> Adicionar Nova Citação a "{selectedBook.title}"
              </h3>

              <form onSubmit={handleSaveDirectQuote} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
                    Texto da Citação / Passagem Marcante *
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Digite ou cole aqui a citação textual do livro..."
                    value={directQuoteText}
                    onChange={(e) => setDirectQuoteText(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.92rem',
                      lineHeight: 1.5
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1, maxWidth: '160px' }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#fbbf24', marginBottom: '4px' }}>
                      Página da Citação *
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      max={selectedBook.totalPages}
                      placeholder={String(selectedBook.currentPage || 1)}
                      value={directQuotePage}
                      onChange={(e) => setDirectQuotePage(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: '#1a2030',
                        border: '1px solid rgba(245, 158, 11, 0.4)',
                        color: '#fbbf24',
                        fontWeight: 800,
                        fontSize: '1rem',
                        fontFamily: 'var(--font-mono)'
                      }}
                    />
                  </div>

                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                      Comentário / Reflexão Pessoal (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ex: Como aplicar este conceito na rotina..."
                      value={directQuoteNote}
                      onChange={(e) => setDirectQuoteNote(e.target.value)}
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

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                  <button
                    type="button"
                    onClick={() => setShowDirectQuoteForm(false)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '8px',
                      background: 'rgba(255,255,255,0.08)',
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
                      padding: '8px 20px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                      color: '#000',
                      fontWeight: 800,
                      border: 'none',
                      cursor: 'pointer'
                    }}
                  >
                    Salvar Citação no Tomo ✍️
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Section 1: Collection of Quotes for This Book */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '18px' }}>
              <div>
                <h3 className="font-cinzel" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Quote size={20} /> Coleção de Citações & Passagens Coletadas
                </h3>
                <p style={{ color: '#94a3b8', fontSize: '0.82rem' }}>
                  Todas as passagens marcantes cadastradas para este livro, ordenadas por página.
                </p>
              </div>

              {/* Internal Quote Search Bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                <Search size={14} color="#94a3b8" />
                <input
                  type="text"
                  placeholder="Buscar citação neste livro..."
                  value={bookQuoteSearch}
                  onChange={(e) => setBookQuoteSearch(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#fff',
                    fontSize: '0.85rem',
                    outline: 'none',
                    width: '180px'
                  }}
                />
              </div>
            </div>

            {(() => {
              const bookQuotes = getAllQuotesForBook(selectedBook);
              const filtered = bookQuotes.filter(q => {
                return bookQuoteSearch === '' ||
                  (q.quote && q.quote.toLowerCase().includes(bookQuoteSearch.toLowerCase())) ||
                  (q.note && q.note.toLowerCase().includes(bookQuoteSearch.toLowerCase()));
              });

              if (filtered.length === 0) {
                return (
                  <div style={{ textAlign: 'center', padding: '40px 10px', color: '#64748b' }}>
                    <Quote size={36} style={{ margin: '0 auto 10px auto', opacity: 0.4 }} />
                    <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Nenhuma citação encontrada para este livro.</p>
                    <p style={{ fontSize: '0.82rem' }}>Clique em "+ Cadastrar Citação Direta" ou inicie uma Sessão de Leitura para registrar frases marcantes!</p>
                  </div>
                );
              }

              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
                  {filtered.map(q => (
                    <div
                      key={q.id}
                      style={{
                        padding: '18px 20px',
                        borderRadius: '14px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        borderLeft: '4px solid #f59e0b',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '12px'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#fbbf24', padding: '2px 8px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.12)', fontFamily: 'var(--font-mono)' }}>
                            Página {q.page}
                          </span>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <button
                              onClick={() => handleCopyQuote(q, selectedBook)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 8px',
                                borderRadius: '6px',
                                background: 'rgba(255, 255, 255, 0.06)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                color: copiedId === q.id ? '#34d399' : '#94a3b8',
                                fontSize: '0.75rem',
                                cursor: 'pointer'
                              }}
                              title="Copiar citação formatada na norma ABNT"
                            >
                              {copiedId === q.id ? <Check size={12} /> : <Copy size={12} />}
                              {copiedId === q.id ? 'ABNT Copiada!' : 'Copiar (ABNT)'}
                            </button>

                            {onUpdateBookQuote && !q.id.startsWith('legacy-') && (
                              <button
                                onClick={() => handleOpenEditQuoteModal(q)}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  padding: '4px 8px',
                                  borderRadius: '6px',
                                  background: 'rgba(56, 189, 248, 0.12)',
                                  border: '1px solid rgba(56, 189, 248, 0.3)',
                                  color: '#38bdf8',
                                  fontSize: '0.75rem',
                                  cursor: 'pointer'
                                }}
                                title="Editar citação"
                              >
                                <Edit3 size={12} />
                                <span>Editar</span>
                              </button>
                            )}

                            {onDeleteBookQuote && !q.id.startsWith('legacy-') && (
                              <button
                                onClick={() => promptDeleteQuote(selectedBook.id, q.id)}
                                style={{
                                  background: 'transparent',
                                  border: 'none',
                                  color: '#64748b',
                                  cursor: 'pointer',
                                  padding: '2px'
                                }}
                                title="Excluir citação"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </div>
                        </div>

                        <p style={{ fontSize: '0.92rem', color: '#f8fafc', fontStyle: 'italic', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                          "{q.quote}"
                        </p>

                        {q.note && (
                          <div style={{ marginTop: '8px', padding: '6px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', fontSize: '0.78rem', color: '#94a3b8' }}>
                            💡 {q.note}
                          </div>
                        )}
                      </div>

                      <div style={{ fontSize: '0.72rem', color: '#64748b', paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        Registrada em: {q.createdAt ? new Date(q.createdAt).toLocaleDateString('pt-BR') : 'Sessão anterior'}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Section 2: Reading Sessions History for This Book */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 className="font-cinzel" style={{ fontSize: '1.2rem', fontWeight: 800, color: '#34d399', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <Clock size={20} /> Histórico de Sessões de Leitura
            </h3>

            {(() => {
              const bookSessions = (readingSessions || []).filter(s => s.bookId === selectedBook.id);
              if (bookSessions.length === 0) {
                return (
                  <p style={{ fontSize: '0.85rem', color: '#64748b' }}>Nenhuma sessão registrada para este livro ainda.</p>
                );
              }

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {bookSessions.map(session => (
                    <div
                      key={session.id}
                      style={{
                        padding: '14px 18px',
                        borderRadius: '12px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '10px'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                          <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#34d399', fontFamily: 'var(--font-mono)' }}>
                            Páginas {session.startPage} → {session.endPage} (+{session.pagesRead} págs)
                          </span>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            {new Date(session.timestamp).toLocaleDateString('pt-BR')} às {new Date(session.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {session.notes && (
                          <p style={{ fontSize: '0.82rem', color: '#cbd5e1', fontStyle: 'italic' }}>
                            "{session.notes}"
                          </p>
                        )}
                        {Array.isArray(session.quotes) && session.quotes.length > 0 && (
                          <div style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '2px' }}>
                            ✨ {session.quotes.length} {session.quotes.length === 1 ? 'citação coletada' : 'citações coletadas'} nesta sessão
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={13} /> {session.durationMinutes || 0} min
                        </span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fbbf24', fontFamily: 'var(--font-mono)' }}>
                          +{session.xpEarned} XP
                        </span>

                        {/* Action buttons: Edit & Delete */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '6px' }}>
                          <button
                            onClick={() => handleOpenEditSessionModal(session)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 10px',
                              borderRadius: '8px',
                              background: 'rgba(56, 189, 248, 0.12)',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              color: '#38bdf8',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                            title="Editar sessão de leitura"
                          >
                            <Edit3 size={13} /> Editar
                          </button>

                          <button
                            onClick={() => handleDeleteSession(session)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '5px 8px',
                              borderRadius: '8px',
                              background: 'rgba(244, 63, 94, 0.12)',
                              border: '1px solid rgba(244, 63, 94, 0.3)',
                              color: '#f43f5e',
                              fontSize: '0.75rem',
                              fontWeight: 700,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease'
                            }}
                            title="Excluir sessão e estornar XP"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

        </div>
      )}

      {/* VIEW 3: GRIMOIRE OF ALL QUOTES (GRIMÓRIO GERAL DE CITAÇÕES) */}
      {subTab === 'quotes' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* Search bar */}
          <div className="glass-panel" style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Search size={18} color="#94a3b8" />
            <input
              type="text"
              placeholder="Buscar citações por palavras-chave, livro ou anotação..."
              value={quoteSearch}
              onChange={(e) => setQuoteSearch(e.target.value)}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#fff',
                width: '100%',
                fontSize: '0.9rem',
                outline: 'none'
              }}
            />
          </div>

          {filteredLibraryQuotes.length === 0 ? (
            <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b' }}>
              <Quote size={40} style={{ margin: '0 auto 12px auto', opacity: 0.4 }} />
              <p style={{ fontSize: '1rem', fontWeight: 600 }}>Nenhuma citação encontrada.</p>
              <p style={{ fontSize: '0.85rem' }}>Cadastre citações em suas sessões de leitura ou diretamente na ficha do livro!</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
              {filteredLibraryQuotes.map(q => (
                <div
                  key={q.id}
                  className="glass-panel"
                  style={{
                    padding: '20px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '14px',
                    borderLeft: '4px solid #f59e0b',
                    background: 'rgba(19, 23, 34, 0.9)'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                      <span
                        onClick={() => {
                          const targetBook = (books || []).find(b => b.id === q.bookId || b.title === q.bookTitle);
                          if (targetBook) handleOpenBookDetail(targetBook);
                        }}
                        style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                        title="Ver ficha completa deste livro"
                      >
                        <BookOpen size={14} /> {q.bookTitle}
                      </span>

                      <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'var(--font-mono)', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)' }}>
                        pág. {q.page}
                      </span>
                    </div>

                    <p style={{ fontSize: '0.92rem', color: '#f8fafc', fontStyle: 'italic', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                      "{q.quote}"
                    </p>

                    {q.note && (
                      <div style={{ marginTop: '8px', padding: '6px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.03)', fontSize: '0.78rem', color: '#94a3b8' }}>
                        💡 {q.note}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {q.createdAt ? new Date(q.createdAt).toLocaleDateString('pt-BR') : 'Data registrada'}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button
                        onClick={() => handleCopyQuote(q)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: 'rgba(255, 255, 255, 0.06)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          color: copiedId === q.id ? '#34d399' : '#94a3b8',
                          fontSize: '0.75rem',
                          cursor: 'pointer'
                        }}
                        title="Copiar citação formatada na norma ABNT"
                      >
                        {copiedId === q.id ? <Check size={12} /> : <Copy size={12} />}
                        {copiedId === q.id ? 'ABNT Copiada!' : 'Copiar (ABNT)'}
                      </button>

                      {onUpdateBookQuote && !q.id.startsWith('legacy-') && (
                        <button
                          onClick={() => handleOpenEditQuoteModal(q)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            background: 'rgba(56, 189, 248, 0.12)',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            color: '#38bdf8',
                            fontSize: '0.75rem',
                            cursor: 'pointer'
                          }}
                          title="Editar citação"
                        >
                          <Edit3 size={12} />
                          <span>Editar</span>
                        </button>
                      )}

                      {onDeleteBookQuote && !q.id.startsWith('legacy-') && (
                        <button
                          onClick={() => promptDeleteQuote(q.bookId, q.id)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#64748b',
                            cursor: 'pointer',
                            padding: '2px'
                          }}
                          title="Excluir citação"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      )}

      {/* Modal Sessão de Leitura Aprimorado e Expandido */}
      {activeSessionBook && (
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
              maxWidth: '780px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '28px',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              borderRadius: '20px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                  <BookOpen size={26} />
                </div>
                <div>
                  <h3 className="font-cinzel" style={{ fontSize: '1.3rem', fontWeight: 800, color: '#f8fafc' }}>
                    Sessão de Leitura
                  </h3>
                  <p style={{ color: '#34d399', fontSize: '0.9rem', fontWeight: 700 }}>
                    {activeSessionBook.title} ({activeSessionBook.author})
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseSessionModal}
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

            {/* Stopwatch / Timer Box */}
            <div
              style={{
                padding: '14px 20px',
                borderRadius: '14px',
                background: 'rgba(0,0,0,0.35)',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
                marginBottom: '18px'
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Tempo de Leitura
                </span>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, fontFamily: 'var(--font-mono)', color: '#34d399' }}>
                  {formatTimer(timerSeconds)}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={toggleTimer}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    background: isTimerRunning ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                    color: isTimerRunning ? '#f87171' : '#34d399',
                    border: isTimerRunning ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(16, 185, 129, 0.4)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 700
                  }}
                >
                  {isTimerRunning ? <Pause size={15} /> : <Play size={15} />}
                  {isTimerRunning ? 'Pausar' : 'Iniciar'}
                </button>

                <button
                  type="button"
                  onClick={resetTimer}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 14px',
                    borderRadius: '10px',
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

            <form onSubmit={handleSaveSession} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Page inputs */}
              <div style={{ display: 'flex', gap: '14px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Página Inicial
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={activeSessionBook.totalPages}
                    value={sessionStartPage}
                    onChange={(e) => setSessionStartPage(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '1rem',
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#34d399', marginBottom: '4px' }}>
                    Página Final Atingida *
                  </label>
                  <input
                    type="number"
                    min={sessionStartPage}
                    max={activeSessionBook.totalPages}
                    value={sessionEndPage}
                    onChange={(e) => {
                      setSessionEndPage(e.target.value);
                      if (!currentQuotePage || currentQuotePage === sessionEndPage) {
                        setCurrentQuotePage(e.target.value);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(16, 185, 129, 0.4)',
                      color: '#34d399',
                      fontWeight: 800,
                      fontSize: '1rem',
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                </div>
              </div>

              {/* Pages & XP Preview Bar */}
              <div style={{ padding: '10px 16px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                <span style={{ color: '#94a3b8' }}>Páginas lidas nesta sessão:</span>
                <span style={{ color: '#34d399', fontWeight: 800 }}>
                  +{Math.max(0, parseInt(sessionEndPage || 0, 10) - parseInt(sessionStartPage || 0, 10))} páginas (+{Math.max(0, parseInt(sessionEndPage || 0, 10) - parseInt(sessionStartPage || 0, 10)) * 2} XP Sabedoria)
                </span>
              </div>

              {/* ITEM-BY-ITEM QUOTES COLLECTOR SECTION */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '14px',
                  background: 'rgba(245, 158, 11, 0.04)',
                  border: '1px solid rgba(245, 158, 11, 0.25)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Quote size={16} /> Coletor de Citações (Item a Item)
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    {sessionQuotes.length} {sessionQuotes.length === 1 ? 'citação adicionada' : 'citações adicionadas'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <textarea
                      placeholder="Digite aqui a citação / passagem marcante lida..."
                      rows={2}
                      value={currentQuoteText}
                      onChange={(e) => setCurrentQuoteText(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: '#1a2030',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#fff',
                        fontSize: '0.88rem'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ width: '130px' }}>
                      <input
                        type="number"
                        min="1"
                        max={activeSessionBook.totalPages}
                        placeholder="Página"
                        value={currentQuotePage}
                        onChange={(e) => setCurrentQuotePage(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          background: '#1a2030',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          color: '#fbbf24',
                          fontWeight: 700,
                          fontSize: '0.88rem',
                          fontFamily: 'var(--font-mono)'
                        }}
                      />
                    </div>

                    <div style={{ flex: 1 }}>
                      <input
                        type="text"
                        placeholder="Comentário ou reflexão opcional..."
                        value={currentQuoteNote}
                        onChange={(e) => setCurrentQuoteNote(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          background: '#1a2030',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          color: '#fff',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleAddQuoteToSession}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        color: '#000',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        border: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <Plus size={14} /> + Adicionar Citação
                    </button>
                  </div>

                  {/* List of Quotes in this session */}
                  {sessionQuotes.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
                      {sessionQuotes.map((q, idx) => (
                        <div
                          key={q.id || idx}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '10px'
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                              Pág. {q.page}:
                            </span>
                            <span style={{ fontSize: '0.84rem', color: '#f8fafc', fontStyle: 'italic', marginLeft: '6px' }}>
                              "{q.quote}"
                            </span>
                            {q.note && (
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                                💡 {q.note}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveQuoteFromSession(q.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#f43f5e',
                              cursor: 'pointer',
                              padding: '2px'
                            }}
                            title="Remover citação"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* General Session Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Resumo Geral da Sessão / Observações Gerais (Opcional)
                </label>
                <textarea
                  placeholder="Resumo ou observações gerais sobre os capítulos lidos..."
                  rows={2}
                  value={sessionNotes}
                  onChange={(e) => setSessionNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#1a2030',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#fff',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={handleCloseSessionModal}
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
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(16, 185, 129, 0.35)'
                  }}
                >
                  Salvar Sessão e Ganhar XP 📚
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cadastro de Livro */}
      {showAddModal && (
        <div
          className="modal-overlay"
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
            className="glass-panel modal-sheet"
            style={{
              maxWidth: '500px',
              width: '100%',
              padding: '28px',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              borderRadius: '20px'
            }}
          >
            <h3 className="font-cinzel" style={{ fontSize: '1.3rem', fontWeight: 800, color: '#34d399', marginBottom: '18px' }}>
              📖 Novo Tomo na Biblioteca
            </h3>

            <form onSubmit={handleCreateBook} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Título do Livro *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Hábitos Atômicos"
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
                  Autor
                </label>
                <input
                  type="text"
                  placeholder="Ex: James Clear"
                  value={newAuthor}
                  onChange={(e) => setNewAuthor(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Total de Páginas *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="320"
                    value={newTotalPages}
                    onChange={(e) => setNewTotalPages(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.95rem',
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Página Atual
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={newCurrentPage}
                    onChange={(e) => setNewCurrentPage(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.95rem',
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                </div>
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

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Cor da Capa
                  </label>
                  <select
                    value={newCoverColor}
                    onChange={(e) => setNewCoverColor(e.target.value)}
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
                    {coverOptions.map(c => (
                      <option key={c.key} value={c.key}>{c.name}</option>
                    ))}
                  </select>
                </div>
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
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#fff',
                    fontWeight: 800,
                    border: 'none',
                    cursor: 'pointer'
                  }}
                >
                  Salvar Livro
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Livro */}
      {editingBook && (
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
              maxWidth: '500px',
              width: '100%',
              padding: '28px',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: '20px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <h3 className="font-cinzel" style={{ fontSize: '1.3rem', fontWeight: 800, color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit3 size={22} /> Editar Tomo na Biblioteca
              </h3>
              <button
                type="button"
                onClick={handleCloseEditBookModal}
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

            <form onSubmit={handleSaveEditBook} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
                  Título do Livro *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Hábitos Atômicos"
                  value={editBookTitle}
                  onChange={(e) => setEditBookTitle(e.target.value)}
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
                  Autor
                </label>
                <input
                  type="text"
                  placeholder="Ex: James Clear"
                  value={editBookAuthor}
                  onChange={(e) => setEditBookAuthor(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Total de Páginas *
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    placeholder="320"
                    value={editBookTotalPages}
                    onChange={(e) => setEditBookTotalPages(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.95rem',
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Página Atual
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="0"
                    value={editBookCurrentPage}
                    onChange={(e) => setEditBookCurrentPage(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '0.95rem',
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Categoria
                  </label>
                  <select
                    value={editBookCategory}
                    onChange={(e) => setEditBookCategory(e.target.value)}
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

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Cor da Capa
                  </label>
                  <select
                    value={editBookCoverColor}
                    onChange={(e) => setEditBookCoverColor(e.target.value)}
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
                    {coverOptions.map(c => (
                      <option key={c.key} value={c.key}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={handleCloseEditBookModal}
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

      {/* Modal Editar Sessão de Leitura */}
      {editingSession && (
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
              maxWidth: '720px',
              width: '100%',
              maxHeight: '92vh',
              overflowY: 'auto',
              padding: '28px',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: '20px'
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ padding: '10px', borderRadius: '12px', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8' }}>
                  <Edit3 size={24} />
                </div>
                <div>
                  <h3 className="font-cinzel" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f8fafc' }}>
                    Editar Sessão de Leitura
                  </h3>
                  <p style={{ color: '#38bdf8', fontSize: '0.85rem', fontWeight: 600 }}>
                    {editingSession.bookTitle}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleCloseEditSessionModal}
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

            <form onSubmit={handleSaveEditSession} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Page inputs */}
              <div style={{ display: 'flex', gap: '14px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Página Inicial
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editStartPage}
                    onChange={(e) => setEditStartPage(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '1rem',
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
                    Página Final Atingida *
                  </label>
                  <input
                    type="number"
                    min={editStartPage}
                    value={editEndPage}
                    onChange={(e) => {
                      setEditEndPage(e.target.value);
                      if (!editQuotePage || editQuotePage === editEndPage) {
                        setEditQuotePage(e.target.value);
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(56, 189, 248, 0.4)',
                      color: '#38bdf8',
                      fontWeight: 800,
                      fontSize: '1rem',
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                </div>

                <div style={{ width: '130px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                    Duração (min)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editDurationMinutes}
                    onChange={(e) => setEditDurationMinutes(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: '#1a2030',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      color: '#fff',
                      fontSize: '1rem',
                      fontFamily: 'var(--font-mono)'
                    }}
                  />
                </div>
              </div>

              {/* Live preview */}
              <div style={{ padding: '10px 16px', borderRadius: '10px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.25)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem' }}>
                <span style={{ color: '#94a3b8' }}>Páginas lidas com o ajuste:</span>
                <span style={{ color: '#38bdf8', fontWeight: 800 }}>
                  +{Math.max(0, parseInt(editEndPage || 0, 10) - parseInt(editStartPage || 0, 10))} páginas (+{Math.max(0, parseInt(editEndPage || 0, 10) - parseInt(editStartPage || 0, 10)) * 2} XP base)
                </span>
              </div>

              {/* Citações da Sessão */}
              <div
                style={{
                  padding: '16px',
                  borderRadius: '14px',
                  background: 'rgba(245, 158, 11, 0.04)',
                  border: '1px solid rgba(245, 158, 11, 0.25)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Quote size={16} /> Citações Desta Sessão
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    {editQuotes.length} {editQuotes.length === 1 ? 'citação' : 'citações'}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div>
                    <textarea
                      placeholder="Adicionar nova citação a esta sessão..."
                      rows={2}
                      value={editQuoteText}
                      onChange={(e) => setEditQuoteText(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '10px',
                        background: '#1a2030',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#fff',
                        fontSize: '0.88rem'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div style={{ width: '130px' }}>
                      <input
                        type="number"
                        min="1"
                        placeholder="Página"
                        value={editQuotePage}
                        onChange={(e) => setEditQuotePage(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          background: '#1a2030',
                          border: '1px solid rgba(245, 158, 11, 0.3)',
                          color: '#fbbf24',
                          fontWeight: 700,
                          fontSize: '0.88rem',
                          fontFamily: 'var(--font-mono)'
                        }}
                      />
                    </div>

                    <div style={{ flex: 1 }}>
                      <input
                        type="text"
                        placeholder="Comentário opcional..."
                        value={editQuoteNote}
                        onChange={(e) => setEditQuoteNote(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          background: '#1a2030',
                          border: '1px solid rgba(255, 255, 255, 0.12)',
                          color: '#fff',
                          fontSize: '0.85rem'
                        }}
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleAddQuoteToEditSession}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 14px',
                        borderRadius: '8px',
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        color: '#000',
                        fontWeight: 800,
                        fontSize: '0.82rem',
                        border: 'none',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <Plus size={14} /> + Adicionar
                    </button>
                  </div>

                  {/* List of Quotes in Edit session */}
                  {editQuotes.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                      {editQuotes.map((q, idx) => (
                        <div
                          key={q.id || idx}
                          style={{
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: 'rgba(255, 255, 255, 0.04)',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '10px'
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: '0.72rem', color: '#fbbf24', fontWeight: 800, fontFamily: 'var(--font-mono)' }}>
                              Pág. {q.page}:
                            </span>
                            <span style={{ fontSize: '0.84rem', color: '#f8fafc', fontStyle: 'italic', marginLeft: '6px' }}>
                              "{q.quote}"
                            </span>
                            {q.note && (
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
                                💡 {q.note}
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemoveQuoteFromEditSession(q.id)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#f43f5e',
                              cursor: 'pointer',
                              padding: '2px'
                            }}
                            title="Remover citação"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* General Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Resumo Geral / Observações da Sessão
                </label>
                <textarea
                  rows={2}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#1a2030',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: '#fff',
                    fontSize: '0.88rem'
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={handleCloseEditSessionModal}
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
                    boxShadow: '0 4px 15px rgba(56, 189, 248, 0.35)'
                  }}
                >
                  Salvar Alterações e Recalcular Pontos ✏️
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Citação */}
      {editingQuote && (
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
              maxWidth: '560px',
              width: '100%',
              padding: '28px',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '20px'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 className="font-cinzel" style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit3 size={20} /> Editar Citação
              </h3>
              <button
                type="button"
                onClick={handleCloseEditQuoteModal}
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

            <form onSubmit={handleSaveEditedQuote} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Texto da Citação / Passagem *
                </label>
                <textarea
                  required
                  rows={4}
                  value={editQuoteModalText}
                  onChange={(e) => setEditQuoteModalText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#1a2030',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.9rem',
                    lineHeight: 1.5,
                    resize: 'vertical'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#fbbf24', marginBottom: '4px' }}>
                  Página do Livro
                </label>
                <input
                  type="number"
                  min="1"
                  value={editQuoteModalPage}
                  onChange={(e) => setEditQuoteModalPage(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#1a2030',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    color: '#fbbf24',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    fontFamily: 'var(--font-mono)'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: '#94a3b8', marginBottom: '4px' }}>
                  Reflexão / Comentário Opcional
                </label>
                <input
                  type="text"
                  placeholder="Ex: Princípio aplicável ao planejamento semanal..."
                  value={editQuoteModalNote}
                  onChange={(e) => setEditQuoteModalNote(e.target.value)}
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

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={handleCloseEditQuoteModal}
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
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(245, 158, 11, 0.35)'
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
