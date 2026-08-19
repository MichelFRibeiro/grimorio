import fs from 'fs';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDb, saveDb, rewardPlayer, revertPlayerReward, getXpForLevel, getTitleForLevel, findOrCreateUser } from './db.js';
import { computeAnalytics } from './analytics.js';
import {
  verifyGoogleToken,
  createSession,
  destroySession,
  getGoogleClientId,
  authMiddleware
} from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Automatically load .env file if present
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.substring(0, idx).trim();
        const val = trimmed.substring(idx + 1).trim();
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    });
  } catch (e) {
    console.warn('Não foi possível ler o arquivo .env:', e.message);
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(authMiddleware);

// Serve built frontend if dist exists
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// Helper to generate unique IDs
const uid = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

// ==========================================
// 0. AUTHENTICATION & SESSIONS
// ==========================================
app.get('/api/auth/config', (req, res) => {
  res.json({
    googleClientId: getGoogleClientId() || ''
  });
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Credencial do Google não fornecida.' });
    }

    const verified = await verifyGoogleToken(credential);
    const user = findOrCreateUser(verified);
    const session = createSession(user);
    const db = getDb();

    res.json({
      success: true,
      token: session.token,
      user,
      userProfile: db.userProfile
    });
  } catch (err) {
    console.error('Erro na autenticação Google:', err);
    res.status(401).json({ error: err.message || 'Falha na autenticação com Google.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, name } = req.body;
    const user = findOrCreateUser({
      email: email || 'usuario@grimorio.app',
      name: name || 'Aventureiro do Foco'
    });
    const session = createSession(user);
    const db = getDb();

    res.json({
      success: true,
      token: session.token,
      user,
      userProfile: db.userProfile
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/guest', (req, res) => {
  try {
    const db = getDb();
    const user = findOrCreateUser({
      email: 'convidado@grimorio.app',
      name: db.userProfile?.name || 'Mestre do Foco'
    });
    const session = createSession(user);

    res.json({
      success: true,
      token: session.token,
      user,
      userProfile: db.userProfile
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', (req, res) => {
  try {
    const db = getDb();
    if (req.user) {
      res.json({
        authenticated: true,
        user: req.user,
        userProfile: db.userProfile
      });
    } else {
      res.json({
        authenticated: false
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      destroySession(authHeader.substring(7).trim());
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 1. GET FULL GAME STATE & ANALYTICS
// ==========================================
app.get('/api/state', (req, res) => {
  try {
    const db = getDb();
    const analytics = computeAnalytics();
    res.json({
      ...db,
      analytics,
      user: req.user || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. USER PROFILE & THEME
// ==========================================
app.post('/api/profile', (req, res) => {
  try {
    const db = getDb();
    const { name, avatar, title, theme } = req.body;
    if (name) db.userProfile.name = name;
    if (avatar) db.userProfile.avatar = avatar;
    if (title) db.userProfile.title = title;
    if (theme) db.userProfile.theme = theme;
    saveDb(db);
    res.json({ success: true, userProfile: db.userProfile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2.5. QUEST CATEGORIES (CRUD)
// ==========================================
app.get('/api/quest-categories', (req, res) => {
  try {
    const db = getDb();
    res.json({ success: true, categories: db.questCategories || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quest-categories', (req, res) => {
  try {
    const db = getDb();
    if (!db.questCategories) db.questCategories = [];

    const { name, color, icon } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nome da categoria é obrigatório' });
    }

    const trimmedName = name.trim();
    if (db.questCategories.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
      return res.status(400).json({ error: 'Já existe uma categoria com este nome.' });
    }

    const newCategory = {
      id: uid('cat'),
      name: trimmedName,
      color: color || '#f59e0b',
      icon: icon || 'Tag'
    };

    db.questCategories.push(newCategory);
    saveDb(db);
    res.json({ success: true, category: newCategory, categories: db.questCategories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/quest-categories/:id', (req, res) => {
  try {
    const db = getDb();
    if (!db.questCategories) db.questCategories = [];

    const cat = db.questCategories.find(c => c.id === req.params.id);
    if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });

    const oldName = cat.name;
    const { name, color, icon } = req.body;

    if (name !== undefined && name.trim()) {
      const trimmedName = name.trim();
      // Check duplicate if name changed
      if (trimmedName.toLowerCase() !== oldName.toLowerCase() && db.questCategories.some(c => c.name.toLowerCase() === trimmedName.toLowerCase())) {
        return res.status(400).json({ error: 'Já existe outra categoria com este nome.' });
      }
      cat.name = trimmedName;

      // Update existing quests with old category name
      (db.quests || []).forEach(q => {
        if (q.category === oldName) {
          q.category = trimmedName;
        }
      });
    }

    if (color !== undefined) cat.color = color;
    if (icon !== undefined) cat.icon = icon;

    saveDb(db);
    res.json({ success: true, category: cat, categories: db.questCategories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/quest-categories/:id', (req, res) => {
  try {
    const db = getDb();
    if (!db.questCategories) db.questCategories = [];

    const cat = db.questCategories.find(c => c.id === req.params.id);
    if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });

    const catName = cat.name;
    db.questCategories = db.questCategories.filter(c => c.id !== req.params.id);

    // Fallback category for quests in this deleted category
    const fallbackCat = db.questCategories.length > 0 ? db.questCategories[0].name : 'Geral';
    (db.quests || []).forEach(q => {
      if (q.category === catName) {
        q.category = fallbackCat;
      }
    });

    saveDb(db);
    res.json({ success: true, categories: db.questCategories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. QUESTS (STANDARD TASKS / TO-DOS)
// ==========================================
app.post('/api/quests', (req, res) => {
  try {
    const db = getDb();
    let { title, description, category, priority, dueDate, dueTime, subtasks } = req.body;
    if (!title) return res.status(400).json({ error: 'Título é obrigatório' });

    // Calculate rewards based on priority
    let xpReward = 30;
    let coinReward = 10;
    let difficulty = 2;

    switch (priority) {
      case 'baixa':
        xpReward = 20; coinReward = 5; difficulty = 1; break;
      case 'media':
        xpReward = 45; coinReward = 12; difficulty = 2; break;
      case 'alta':
        xpReward = 80; coinReward = 25; difficulty = 3; break;
      case 'epica':
        xpReward = 150; coinReward = 50; difficulty = 4; break;
      default:
        priority = 'media';
    }

    const newQuest = {
      id: uid('q'),
      title: title.trim(),
      description: (description || '').trim(),
      category: category || 'Trabalho',
      priority: priority || 'media',
      difficulty,
      xpReward,
      coinReward,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      subtasks: (subtasks || []).map(st => ({
        id: uid('st'),
        title: typeof st === 'string' ? st : st.title,
        completed: typeof st === 'object' ? !!st.completed : false
      })),
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString()
    };

    db.quests.unshift(newQuest);
    saveDb(db);
    res.json({ success: true, quest: newQuest });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/quests/:id', (req, res) => {
  try {
    const db = getDb();
    const index = db.quests.findIndex(q => q.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Missão não encontrada' });

    const existing = db.quests[index];
    const { title, description, category, priority, dueDate, dueTime, subtasks } = req.body;

    if (title !== undefined) existing.title = title.trim();
    if (description !== undefined) existing.description = description.trim();
    if (category !== undefined) existing.category = category;
    if (priority !== undefined) {
      existing.priority = priority;
      if (priority === 'baixa') { existing.xpReward = 20; existing.coinReward = 5; existing.difficulty = 1; }
      else if (priority === 'media') { existing.xpReward = 45; existing.coinReward = 12; existing.difficulty = 2; }
      else if (priority === 'alta') { existing.xpReward = 80; existing.coinReward = 25; existing.difficulty = 3; }
      else if (priority === 'epica') { existing.xpReward = 150; existing.coinReward = 50; existing.difficulty = 4; }
    }
    if (dueDate !== undefined) existing.dueDate = dueDate || null;
    if (dueTime !== undefined) existing.dueTime = dueTime || null;
    if (subtasks !== undefined) {
      existing.subtasks = Array.isArray(subtasks) ? subtasks.map(st => ({
        id: st.id || uid('st'),
        title: typeof st === 'string' ? st : st.title,
        completed: typeof st === 'object' ? !!st.completed : false
      })) : existing.subtasks;
    }

    saveDb(db);
    res.json({ success: true, quest: existing });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quests/:id/complete', (req, res) => {
  try {
    const db = getDb();
    const quest = db.quests.find(q => q.id === req.params.id);
    if (!quest) return res.status(404).json({ error: 'Missão não encontrada' });

    const willComplete = !quest.completed;
    quest.completed = willComplete;
    quest.completedAt = willComplete ? new Date().toISOString() : null;

    let rewardResult = null;
    if (willComplete) {
      // Award willpower and focus
      const willpower = quest.priority === 'epica' ? 25 : quest.priority === 'alta' ? 15 : 5;
      const focus = 10;
      rewardResult = rewardPlayer({
        xp: quest.xpReward,
        coins: quest.coinReward,
        willpower,
        focus,
        actionType: 'quest_complete',
        entityId: quest.id,
        title: quest.title,
        details: { category: quest.category, priority: quest.priority }
      });
    } else {
      // Revert willpower, focus, xp and coins
      const willpower = quest.priority === 'epica' ? 25 : quest.priority === 'alta' ? 15 : 5;
      const focus = 10;
      rewardResult = revertPlayerReward({
        xp: quest.xpReward,
        coins: quest.coinReward,
        willpower,
        focus,
        actionType: 'quest_complete',
        entityId: quest.id
      });
    }

    saveDb(db);
    res.json({
      success: true,
      quest,
      willComplete,
      rewardResult,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/quests/:id', (req, res) => {
  try {
    const db = getDb();
    db.quests = db.quests.filter(q => q.id !== req.params.id);
    saveDb(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. BOOKS & READING SESSIONS (TOMES OF WISDOM)
// ==========================================
app.post('/api/books', (req, res) => {
  try {
    const db = getDb();
    const { title, author, totalPages, currentPage, category, coverColor, notes } = req.body;
    if (!title || !totalPages) return res.status(400).json({ error: 'Título e total de páginas são obrigatórios' });

    const total = parseInt(totalPages, 10);
    const current = parseInt(currentPage || 0, 10);

    const newBook = {
      id: uid('b'),
      title: title.trim(),
      author: (author || 'Autor Desconhecido').trim(),
      totalPages: total,
      currentPage: Math.min(total, current),
      category: category || 'Geral',
      coverColor: coverColor || 'gradient-amber',
      status: current >= total ? 'completed' : 'reading',
      startedAt: new Date().toISOString(),
      completedAt: current >= total ? new Date().toISOString() : null,
      notes: notes || '',
      quotes: [],
      createdAt: new Date().toISOString()
    };

    db.books.unshift(newBook);
    saveDb(db);
    res.json({ success: true, book: newBook });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/books/:id', (req, res) => {
  try {
    const db = getDb();
    const book = db.books.find(b => b.id === req.params.id);
    if (!book) return res.status(404).json({ error: 'Livro não encontrado' });

    const { title, author, totalPages, currentPage, category, coverColor, status, notes } = req.body;
    if (title !== undefined) book.title = title.trim();
    if (author !== undefined) book.author = author.trim();
    if (totalPages !== undefined) book.totalPages = parseInt(totalPages, 10);
    if (currentPage !== undefined) book.currentPage = parseInt(currentPage, 10);
    if (category !== undefined) book.category = category;
    if (coverColor !== undefined) book.coverColor = coverColor;
    if (status !== undefined) book.status = status;
    if (notes !== undefined) book.notes = notes;

    if (book.currentPage >= book.totalPages && book.status !== 'completed') {
      book.status = 'completed';
      book.completedAt = new Date().toISOString();
    }

    saveDb(db);
    res.json({ success: true, book });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/books/:id/reading-session', (req, res) => {
  try {
    const db = getDb();
    const book = db.books.find(b => b.id === req.params.id);
    if (!book) return res.status(404).json({ error: 'Livro não encontrado' });

    const { startPage, endPage, durationMinutes, notes, quotes } = req.body;
    const sPage = parseInt(startPage, 10) || book.currentPage;
    const ePage = parseInt(endPage, 10);
    const duration = parseInt(durationMinutes, 10) || 20;

    if (ePage <= sPage) {
      return res.status(400).json({ error: 'A página final deve ser maior que a página inicial.' });
    }

    const pagesRead = Math.min(book.totalPages, ePage) - sPage;
    const newCurrentPage = Math.min(book.totalPages, ePage);
    const finishedBook = newCurrentPage >= book.totalPages;

    book.currentPage = newCurrentPage;
    if (finishedBook) {
      book.status = 'completed';
      book.completedAt = new Date().toISOString();
    }

    // Process structured quotes
    const parsedQuotes = Array.isArray(quotes) ? quotes.filter(q => q.quote && q.quote.trim()).map(q => ({
      id: q.id || uid('quo'),
      bookId: book.id,
      bookTitle: book.title,
      quote: q.quote.trim(),
      page: parseInt(q.page, 10) || newCurrentPage,
      note: (q.note || '').trim(),
      createdAt: q.createdAt || new Date().toISOString()
    })) : [];

    // Ensure book.quotes exists and append new quotes
    if (!book.quotes) book.quotes = [];
    if (parsedQuotes.length > 0) {
      book.quotes.unshift(...parsedQuotes);
    }

    // XP & Wisdom calculation: 2 XP per page + bonus for finishing + bonus for quotes collected
    const basePageXp = pagesRead * 2;
    const finishBonusXp = finishedBook ? 200 : 0;
    const quoteBonusXp = parsedQuotes.length * 15;
    const totalXp = basePageXp + finishBonusXp + quoteBonusXp;
    const coins = Math.max(5, Math.floor(pagesRead / 3)) + (finishedBook ? 50 : 0) + parsedQuotes.length * 2;
    const wisdom = pagesRead + (finishedBook ? 50 : 0) + parsedQuotes.length * 5;

    const session = {
      id: uid('rs'),
      bookId: book.id,
      bookTitle: book.title,
      startPage: sPage,
      endPage: newCurrentPage,
      pagesRead,
      durationMinutes: duration,
      notes: notes || '',
      quotes: parsedQuotes,
      xpEarned: totalXp,
      coinsEarned: coins,
      wisdomEarned: wisdom,
      timestamp: new Date().toISOString()
    };

    db.readingSessions.unshift(session);

    const rewardResult = rewardPlayer({
      xp: totalXp,
      coins,
      wisdom,
      actionType: 'reading_session',
      entityId: book.id,
      title: `${book.title} (+${pagesRead} págs${parsedQuotes.length > 0 ? `, ${parsedQuotes.length} citação(ões)` : ''})`,
      details: { pagesRead, durationMinutes: duration, finishedBook, quotesCount: parsedQuotes.length }
    });

    saveDb(db);
    res.json({
      success: true,
      book,
      session,
      rewardResult,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edit reading session with delta score adjustment and book recalculation
app.put('/api/reading-sessions/:id', (req, res) => {
  try {
    const db = getDb();
    const session = db.readingSessions.find(s => s.id === req.params.id);
    if (!session) return res.status(404).json({ error: 'Sessão de leitura não encontrada' });

    const book = db.books.find(b => b.id === session.bookId);
    if (!book) return res.status(404).json({ error: 'Livro associado não encontrado' });

    const { startPage, endPage, durationMinutes, notes, quotes } = req.body;
    const sPage = parseInt(startPage, 10);
    const ePage = parseInt(endPage, 10);
    const duration = parseInt(durationMinutes, 10) || session.durationMinutes || 20;

    if (isNaN(sPage) || isNaN(ePage) || ePage <= sPage) {
      return res.status(400).json({ error: 'A página final deve ser maior que a página inicial.' });
    }

    const oldPagesRead = session.pagesRead || 0;
    const oldXp = session.xpEarned || 0;
    const oldWisdom = session.wisdomEarned || 0;
    const oldCoins = session.coinsEarned || (Math.max(5, Math.floor(oldPagesRead / 3)));

    const newPagesRead = Math.min(book.totalPages, ePage) - sPage;
    const newEndPage = Math.min(book.totalPages, ePage);
    const isFinishedNow = newEndPage >= book.totalPages;

    // Process new quotes
    const parsedQuotes = Array.isArray(quotes) ? quotes.filter(q => q.quote && q.quote.trim()).map(q => ({
      id: q.id || uid('quo'),
      bookId: book.id,
      bookTitle: book.title,
      quote: q.quote.trim(),
      page: parseInt(q.page, 10) || newEndPage,
      note: (q.note || '').trim(),
      createdAt: q.createdAt || session.timestamp || new Date().toISOString()
    })) : (session.quotes || []);

    // Update book.quotes with parsedQuotes
    if (!book.quotes) book.quotes = [];
    const oldQuoteIds = (session.quotes || []).map(q => q.id);
    book.quotes = book.quotes.filter(q => !oldQuoteIds.includes(q.id));
    if (parsedQuotes.length > 0) {
      book.quotes.unshift(...parsedQuotes);
    }

    // New rewards calculation
    const basePageXp = newPagesRead * 2;
    const finishBonusXp = isFinishedNow ? 200 : 0;
    const quoteBonusXp = parsedQuotes.length * 15;
    const newTotalXp = basePageXp + finishBonusXp + quoteBonusXp;
    const newCoins = Math.max(5, Math.floor(newPagesRead / 3)) + (isFinishedNow ? 50 : 0) + parsedQuotes.length * 2;
    const newWisdom = newPagesRead + (isFinishedNow ? 50 : 0) + parsedQuotes.length * 5;

    const deltaXp = newTotalXp - oldXp;
    const deltaWisdom = newWisdom - oldWisdom;
    const deltaCoins = newCoins - oldCoins;

    // Apply delta to user profile
    const profile = db.userProfile;
    profile.stats.wisdom = Math.max(0, (profile.stats.wisdom || 0) + deltaWisdom);
    profile.coins = Math.max(0, (profile.coins || 0) + deltaCoins);
    profile.xp += deltaXp;

    // Handle level up / level down
    while (profile.xp >= profile.xpToNextLevel) {
      profile.xp -= profile.xpToNextLevel;
      profile.level += 1;
      profile.xpToNextLevel = getXpForLevel(profile.level);
      profile.title = getTitleForLevel(profile.level);
      profile.coins += profile.level * 15;
    }
    while (profile.xp < 0 && profile.level > 1) {
      profile.level -= 1;
      profile.xpToNextLevel = getXpForLevel(profile.level);
      profile.xp += profile.xpToNextLevel;
      profile.title = getTitleForLevel(profile.level);
      profile.coins = Math.max(0, profile.coins - profile.level * 15);
    }
    if (profile.xp < 0) profile.xp = 0;

    // Adjust Boss HP
    const boss = db.bossRaid;
    if (boss) {
      const deltaDmg = Math.round(deltaXp * 0.8 + deltaCoins * 1.2);
      if (deltaDmg > 0 && !boss.defeated) {
        boss.currentHp = Math.max(0, boss.currentHp - deltaDmg);
        if (boss.currentHp === 0) {
          boss.defeated = true;
          profile.coins += boss.rewardCoins;
          profile.xp += boss.rewardXp;
        }
      } else if (deltaDmg < 0) {
        boss.currentHp = Math.min(boss.maxHp, boss.currentHp - deltaDmg);
        if (boss.defeated && boss.currentHp > 0) boss.defeated = false;
      }
    }

    // Update session object
    session.startPage = sPage;
    session.endPage = newEndPage;
    session.pagesRead = newPagesRead;
    session.durationMinutes = duration;
    session.notes = notes !== undefined ? notes : session.notes;
    session.quotes = parsedQuotes;
    session.xpEarned = newTotalXp;
    session.wisdomEarned = newWisdom;
    session.coinsEarned = newCoins;

    // Recalculate book's currentPage & status based on all its sessions
    const bookSessions = db.readingSessions.filter(s => s.bookId === book.id);
    const maxEnd = bookSessions.reduce((max, s) => Math.max(max, s.endPage || 0), 0);
    book.currentPage = maxEnd;
    if (book.currentPage >= book.totalPages) {
      book.status = 'completed';
      if (!book.completedAt) book.completedAt = new Date().toISOString();
    } else {
      book.status = 'reading';
      book.completedAt = null;
    }

    // Update matching actionLog if found
    const logIndex = db.actionLogs.findIndex(l => (l.entityId === book.id || l.entityId === session.id) && l.type === 'reading_session');
    if (logIndex !== -1) {
      db.actionLogs[logIndex].title = `${book.title} (+${newPagesRead} págs${parsedQuotes.length > 0 ? `, ${parsedQuotes.length} citação(ões)` : ''})`;
      db.actionLogs[logIndex].xp = newTotalXp;
      db.actionLogs[logIndex].coins = newCoins;
      db.actionLogs[logIndex].details = { pagesRead: newPagesRead, durationMinutes: duration, finishedBook: isFinishedNow, quotesCount: parsedQuotes.length };
    }

    saveDb(db);
    res.json({
      success: true,
      book,
      session,
      userProfile: profile,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete reading session with complete score rollback and book recalculation
app.delete('/api/reading-sessions/:id', (req, res) => {
  try {
    const db = getDb();
    const sessionIndex = db.readingSessions.findIndex(s => s.id === req.params.id);
    if (sessionIndex === -1) return res.status(404).json({ error: 'Sessão de leitura não encontrada' });

    const session = db.readingSessions[sessionIndex];
    const book = db.books.find(b => b.id === session.bookId);

    const xpToRevert = session.xpEarned || ((session.pagesRead || 0) * 2);
    const wisdomToRevert = session.wisdomEarned || (session.pagesRead || 0);
    const coinsToRevert = session.coinsEarned || (Math.max(5, Math.floor((session.pagesRead || 0) / 3)));

    // Revert player rewards
    const profile = db.userProfile;
    profile.stats.wisdom = Math.max(0, (profile.stats.wisdom || 0) - wisdomToRevert);
    profile.coins = Math.max(0, (profile.coins || 0) - coinsToRevert);
    profile.xp -= xpToRevert;

    while (profile.xp < 0 && profile.level > 1) {
      profile.level -= 1;
      profile.xpToNextLevel = getXpForLevel(profile.level);
      profile.xp += profile.xpToNextLevel;
      profile.title = getTitleForLevel(profile.level);
      profile.coins = Math.max(0, profile.coins - profile.level * 15);
    }
    if (profile.xp < 0) profile.xp = 0;

    // Restore Boss HP
    const boss = db.bossRaid;
    if (boss) {
      const totalDmg = Math.round(xpToRevert * 0.8 + coinsToRevert * 1.2);
      boss.currentHp = Math.min(boss.maxHp, boss.currentHp + totalDmg);
      if (boss.defeated && boss.currentHp > 0) boss.defeated = false;
    }

    // Remove matching action log
    const logIndex = db.actionLogs.findIndex(l => (l.entityId === session.id || (book && l.entityId === book.id)) && l.type === 'reading_session');
    if (logIndex !== -1) {
      db.actionLogs.splice(logIndex, 1);
    }

    // Clean up quotes from book.quotes that belonged to this session
    if (book && book.quotes && Array.isArray(session.quotes)) {
      const sessionQuoteIds = session.quotes.map(q => q.id);
      book.quotes = book.quotes.filter(q => !sessionQuoteIds.includes(q.id));
    }

    // Remove session from list
    db.readingSessions.splice(sessionIndex, 1);

    // Recalculate book's progress
    if (book) {
      const remainingSessions = db.readingSessions.filter(s => s.bookId === book.id);
      const maxEnd = remainingSessions.reduce((max, s) => Math.max(max, s.endPage || 0), 0);
      book.currentPage = maxEnd;
      if (book.currentPage < book.totalPages) {
        book.status = 'reading';
        book.completedAt = null;
      }
    }

    saveDb(db);
    res.json({
      success: true,
      book,
      deletedSessionId: session.id,
      userProfile: profile,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a quote directly to a book
app.post('/api/books/:id/quotes', (req, res) => {
  try {
    const db = getDb();
    const book = db.books.find(b => b.id === req.params.id);
    if (!book) return res.status(404).json({ error: 'Livro não encontrado' });

    const { quote, page, note } = req.body;
    if (!quote || !quote.trim()) {
      return res.status(400).json({ error: 'O texto da citação é obrigatório.' });
    }

    if (!book.quotes) book.quotes = [];

    const newQuote = {
      id: uid('quo'),
      bookId: book.id,
      bookTitle: book.title,
      quote: quote.trim(),
      page: parseInt(page, 10) || book.currentPage || 1,
      note: (note || '').trim(),
      createdAt: new Date().toISOString()
    };

    book.quotes.unshift(newQuote);

    // Reward for registering a standalone quote
    const rewardResult = rewardPlayer({
      xp: 20,
      coins: 5,
      wisdom: 10,
      actionType: 'book_quote',
      entityId: newQuote.id,
      title: `Citação: ${book.title} (pág. ${newQuote.page})`,
      details: { quote: newQuote.quote.substring(0, 50) }
    });

    saveDb(db);
    res.json({ success: true, quote: newQuote, book, rewardResult, analytics: computeAnalytics() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a quote in a book
app.put('/api/books/:id/quotes/:quoteId', (req, res) => {
  try {
    const db = getDb();
    const book = db.books.find(b => b.id === req.params.id);
    if (!book) return res.status(404).json({ error: 'Livro não encontrado' });

    if (!book.quotes) book.quotes = [];
    const quoteIndex = book.quotes.findIndex(q => q.id === req.params.quoteId);
    if (quoteIndex === -1) return res.status(404).json({ error: 'Citação não encontrada' });

    const { quote, page, note } = req.body;
    if (quote !== undefined) book.quotes[quoteIndex].quote = quote.trim();
    if (page !== undefined) book.quotes[quoteIndex].page = parseInt(page, 10) || 1;
    if (note !== undefined) book.quotes[quoteIndex].note = note.trim();

    // Also update in any reading sessions containing this quote
    (db.readingSessions || []).forEach(s => {
      if (Array.isArray(s.quotes)) {
        s.quotes.forEach(sq => {
          if (sq.id === req.params.quoteId) {
            if (quote !== undefined) sq.quote = quote.trim();
            if (page !== undefined) sq.page = parseInt(page, 10) || 1;
            if (note !== undefined) sq.note = note.trim();
          }
        });
      }
    });

    saveDb(db);
    res.json({ success: true, quote: book.quotes[quoteIndex], book });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a quote from a book
app.delete('/api/books/:id/quotes/:quoteId', (req, res) => {
  try {
    const db = getDb();
    const book = db.books.find(b => b.id === req.params.id);
    if (!book) return res.status(404).json({ error: 'Livro não encontrado' });

    if (book.quotes) {
      book.quotes = book.quotes.filter(q => q.id !== req.params.quoteId);
    }

    // Also remove from any readingSessions quotes array
    db.readingSessions.forEach(rs => {
      if (rs.quotes) {
        rs.quotes = rs.quotes.filter(q => q.id !== req.params.quoteId);
      }
    });

    saveDb(db);
    res.json({ success: true, book });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/books/:id', (req, res) => {
  try {
    const db = getDb();
    db.books = db.books.filter(b => b.id !== req.params.id);
    db.readingSessions = db.readingSessions.filter(rs => rs.bookId !== req.params.id);
    saveDb(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4.5. EXAM QUESTIONS (QUESTÕES DE CONCURSO PÚBLICO)
// ==========================================
app.post('/api/questions', (req, res) => {
  try {
    const db = getDb();
    if (!db.examQuestions) db.examQuestions = [];

    const { subject, topic, institution, totalQuestions, correctAnswers, durationMinutes, notes, date } = req.body;
    const total = parseInt(totalQuestions, 10);
    const correct = parseInt(correctAnswers, 10);
    const duration = parseInt(durationMinutes, 10) || 0;

    if (isNaN(total) || total <= 0) {
      return res.status(400).json({ error: 'A quantidade de questões feitas deve ser maior que zero.' });
    }
    if (isNaN(correct) || correct < 0 || correct > total) {
      return res.status(400).json({ error: 'A quantidade de acertos deve ser entre 0 e o total de questões feitas.' });
    }

    const wrong = total - correct;
    const accuracyRate = Math.round((correct / total) * 1000) / 10;

    const baseXp = total * 3;
    const correctXp = correct * 4;
    const accuracyBonusXp = accuracyRate === 100 ? 50 : accuracyRate >= 90 ? 30 : accuracyRate >= 80 ? 15 : 0;
    const totalXp = baseXp + correctXp + accuracyBonusXp;

    const coins = Math.max(2, Math.floor(correct / 2)) + (accuracyRate >= 80 ? 5 : 0) + (accuracyRate === 100 ? 10 : 0);

    const now = new Date();
    const entryDate = date || now.toISOString().split('T')[0];

    const newQuestionLog = {
      id: uid('eq'),
      subject: (subject || 'Geral').trim(),
      topic: (topic || '').trim(),
      institution: (institution || '').trim(),
      totalQuestions: total,
      correctAnswers: correct,
      wrongAnswers: wrong,
      accuracyRate,
      durationMinutes: duration,
      notes: (notes || '').trim(),
      xpEarned: totalXp,
      coinsEarned: coins,
      date: entryDate,
      timestamp: now.toISOString()
    };

    db.examQuestions.unshift(newQuestionLog);

    const rewardResult = rewardPlayer({
      xp: totalXp,
      coins,
      focus: total * 2,
      wisdom: correct * 2,
      consistency: 10,
      actionType: 'exam_questions',
      entityId: newQuestionLog.id,
      title: `${newQuestionLog.subject}: ${correct}/${total} acertos (${accuracyRate}%)`,
      details: {
        totalQuestions: total,
        correctAnswers: correct,
        accuracyRate,
        subject: newQuestionLog.subject,
        topic: newQuestionLog.topic,
        institution: newQuestionLog.institution
      }
    });

    saveDb(db);
    res.json({
      success: true,
      examQuestion: newQuestionLog,
      rewardResult,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/questions/:id', (req, res) => {
  try {
    const db = getDb();
    if (!db.examQuestions) db.examQuestions = [];

    const index = db.examQuestions.findIndex(q => q.id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Registro de questões não encontrado' });

    const existing = db.examQuestions[index];
    const { subject, topic, institution, notes, date } = req.body;

    if (subject !== undefined) existing.subject = subject.trim();
    if (topic !== undefined) existing.topic = topic.trim();
    if (institution !== undefined) existing.institution = institution.trim();
    if (notes !== undefined) existing.notes = notes.trim();
    if (date !== undefined) existing.date = date;

    saveDb(db);
    res.json({ success: true, examQuestion: existing, analytics: computeAnalytics() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/questions/:id', (req, res) => {
  try {
    const db = getDb();
    if (!db.examQuestions) db.examQuestions = [];

    const questionLog = db.examQuestions.find(q => q.id === req.params.id);
    if (!questionLog) return res.status(404).json({ error: 'Registro não encontrado' });

    db.examQuestions = db.examQuestions.filter(q => q.id !== req.params.id);

    const rewardResult = revertPlayerReward({
      xp: questionLog.xpEarned || 0,
      coins: questionLog.coinsEarned || 0,
      focus: questionLog.totalQuestions * 2,
      wisdom: questionLog.correctAnswers * 2,
      consistency: 10,
      actionType: 'exam_questions',
      entityId: questionLog.id
    });

    saveDb(db);
    res.json({ success: true, rewardResult, analytics: computeAnalytics() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. PROCESSES / BATCH OPERATIONS
// ==========================================
app.post('/api/processes', (req, res) => {
  try {
    const db = getDb();
    const { title, category, unitName, totalUnits, xpPerUnit, coinsPerUnit, notes } = req.body;
    if (!title || !totalUnits) return res.status(400).json({ error: 'Título e total de unidades são obrigatórios' });

    const total = parseInt(totalUnits, 10);
    const newProcess = {
      id: uid('p'),
      title: title.trim(),
      category: category || 'Trabalho',
      unitName: unitName || 'unidades',
      totalUnits: total,
      completedUnits: 0,
      xpPerUnit: parseInt(xpPerUnit, 10) || 20,
      coinsPerUnit: parseInt(coinsPerUnit, 10) || 5,
      notes: notes || '',
      status: 'in_progress',
      completedAt: null,
      createdAt: new Date().toISOString()
    };

    db.processes.unshift(newProcess);
    saveDb(db);
    res.json({ success: true, process: newProcess });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/processes/:id/step', (req, res) => {
  try {
    const db = getDb();
    const process = db.processes.find(p => p.id === req.params.id);
    if (!process) return res.status(404).json({ error: 'Processo não encontrado' });

    const { unitsAdded, stepNote, timestamp } = req.body;
    const added = parseInt(unitsAdded, 10) || 1;
    const previousUnits = process.completedUnits || 0;
    const newCompleted = Math.min(process.totalUnits, previousUnits + added);
    const actualUnitsAdded = newCompleted - previousUnits;

    if (actualUnitsAdded <= 0) {
      return res.status(400).json({ error: 'Processo já está totalmente concluído!' });
    }

    const stepTimestamp = timestamp || new Date().toISOString();

    process.completedUnits = newCompleted;
    const finished = newCompleted >= process.totalUnits;
    if (finished) {
      process.status = 'completed';
      process.completedAt = stepTimestamp;
    }

    const xp = actualUnitsAdded * process.xpPerUnit + (finished ? 100 : 0);
    const coins = actualUnitsAdded * process.coinsPerUnit + (finished ? 30 : 0);
    const focus = actualUnitsAdded * 10;

    const step = {
      id: uid('ps'),
      processId: process.id,
      processTitle: process.title,
      unitsAdded: actualUnitsAdded,
      totalCompletedNow: newCompleted,
      stepNote: stepNote || '',
      timestamp: stepTimestamp,
      createdAt: stepTimestamp,
      xpEarned: xp
    };

    db.processSteps.unshift(step);

    const rewardResult = rewardPlayer({
      xp,
      coins,
      focus,
      actionType: 'process_step',
      entityId: process.id,
      title: `${process.title} (+${actualUnitsAdded} ${process.unitName})`,
      details: { unitsAdded: actualUnitsAdded, finished },
      timestamp: stepTimestamp
    });

    saveDb(db);
    res.json({
      success: true,
      process,
      step,
      rewardResult,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/processes/:id', (req, res) => {
  try {
    const db = getDb();
    const process = db.processes.find(p => p.id === req.params.id);
    if (!process) return res.status(404).json({ error: 'Processo não encontrado' });

    const { title, category, unitName, totalUnits, completedUnits, xpPerUnit, coinsPerUnit, notes, status } = req.body;
    if (title !== undefined) process.title = title.trim();
    if (category !== undefined) process.category = category;
    if (unitName !== undefined) process.unitName = unitName;
    if (totalUnits !== undefined) process.totalUnits = parseInt(totalUnits, 10);
    if (completedUnits !== undefined) process.completedUnits = parseInt(completedUnits, 10);
    if (xpPerUnit !== undefined) process.xpPerUnit = parseInt(xpPerUnit, 10);
    if (coinsPerUnit !== undefined) process.coinsPerUnit = parseInt(coinsPerUnit, 10);
    if (notes !== undefined) process.notes = notes;
    if (status !== undefined) process.status = status;

    saveDb(db);
    res.json({ success: true, process });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/processes/:id', (req, res) => {
  try {
    const db = getDb();
    db.processes = db.processes.filter(p => p.id !== req.params.id);
    db.processSteps = db.processSteps.filter(ps => ps.processId !== req.params.id);
    saveDb(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. HABITS / DAILY RITUALS
// ==========================================
app.post('/api/habits', (req, res) => {
  try {
    const db = getDb();
    const { title, icon, frequency, xpReward, coinReward } = req.body;
    if (!title) return res.status(400).json({ error: 'Título do hábito é obrigatório' });

    const newHabit = {
      id: uid('h'),
      title: title.trim(),
      icon: icon || 'Flame',
      frequency: frequency || 'daily',
      currentStreak: 0,
      bestStreak: 0,
      history: [],
      xpReward: parseInt(xpReward, 10) || 30,
      coinReward: parseInt(coinReward, 10) || 8,
      createdAt: new Date().toISOString()
    };

    db.habits.unshift(newHabit);
    saveDb(db);
    res.json({ success: true, habit: newHabit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/habits/:id/toggle', (req, res) => {
  try {
    const db = getDb();
    const habit = db.habits.find(h => h.id === req.params.id);
    if (!habit) return res.status(404).json({ error: 'Hábito não encontrado' });

    const todayStr = new Date().toISOString().split('T')[0];
    const alreadyDoneToday = (habit.history || []).includes(todayStr);

    let rewardResult = null;

    if (alreadyDoneToday) {
      habit.history = habit.history.filter(d => d !== todayStr);
      habit.currentStreak = Math.max(0, habit.currentStreak - 1);

      rewardResult = revertPlayerReward({
        consistency: 15,
        actionType: 'habit_complete',
        entityId: habit.id
      });
    } else {
      habit.history.push(todayStr);
      habit.currentStreak = (habit.currentStreak || 0) + 1;
      if (habit.currentStreak > (habit.bestStreak || 0)) {
        habit.bestStreak = habit.currentStreak;
      }

      const multiplier = Math.min(2.0, 1 + habit.currentStreak * 0.1);
      const xp = Math.round(habit.xpReward * multiplier);
      const coins = habit.coinReward;

      rewardResult = rewardPlayer({
        xp,
        coins,
        consistency: 15,
        actionType: 'habit_complete',
        entityId: habit.id,
        title: `${habit.title} (Sequência 🔥 ${habit.currentStreak})`,
        details: { streak: habit.currentStreak }
      });
    }

    saveDb(db);
    res.json({
      success: true,
      habit,
      doneToday: !alreadyDoneToday,
      rewardResult,
      analytics: computeAnalytics()
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/habits/:id', (req, res) => {
  try {
    const db = getDb();
    db.habits = db.habits.filter(h => h.id !== req.params.id);
    saveDb(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. REWARDS & TAVERN
// ==========================================
app.post('/api/rewards', (req, res) => {
  try {
    const db = getDb();
    const { title, description, cost, icon, category } = req.body;
    if (!title || !cost) return res.status(400).json({ error: 'Título e custo em moedas são obrigatórios' });

    const newReward = {
      id: uid('r'),
      title: title.trim(),
      description: description || '',
      cost: parseInt(cost, 10),
      icon: icon || 'Gift',
      category: category || 'custom',
      timesRedeemed: 0,
      isVirtual: false,
      unlocked: true,
      createdAt: new Date().toISOString()
    };

    db.rewards.unshift(newReward);
    saveDb(db);
    res.json({ success: true, reward: newReward });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rewards/:id/redeem', (req, res) => {
  try {
    const db = getDb();
    const reward = db.rewards.find(r => r.id === req.params.id);
    if (!reward) return res.status(404).json({ error: 'Recompensa não encontrada' });

    if (db.userProfile.coins < reward.cost) {
      return res.status(400).json({ error: `Moedas insuficientes! Você tem 🪙 ${db.userProfile.coins} e precisa de 🪙 ${reward.cost}.` });
    }

    db.userProfile.coins -= reward.cost;
    reward.timesRedeemed = (reward.timesRedeemed || 0) + 1;

    const redemption = {
      id: uid('red'),
      rewardId: reward.id,
      rewardTitle: reward.title,
      cost: reward.cost,
      timestamp: new Date().toISOString()
    };
    db.rewardRedemptions.unshift(redemption);

    db.actionLogs.unshift({
      id: uid('log'),
      type: 'reward_redeem',
      entityId: reward.id,
      title: `Resgatou: ${reward.title}`,
      xp: 0,
      coins: -reward.cost,
      details: { cost: reward.cost },
      timestamp: new Date().toISOString(),
      hour: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
      date: new Date().toISOString().split('T')[0]
    });

    saveDb(db);
    res.json({
      success: true,
      reward,
      userProfile: db.userProfile,
      redemption
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/rewards/:id', (req, res) => {
  try {
    const db = getDb();
    db.rewards = db.rewards.filter(r => r.id !== req.params.id);
    saveDb(db);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel reward redemption and refund coins
app.post('/api/rewards/redemptions/:id/cancel', (req, res) => {
  try {
    const db = getDb();
    if (!db.rewardRedemptions) db.rewardRedemptions = [];

    const redIndex = db.rewardRedemptions.findIndex(r => r.id === req.params.id);
    if (redIndex === -1) return res.status(404).json({ error: 'Resgate não encontrado' });

    const redemption = db.rewardRedemptions[redIndex];
    const refundCoins = redemption.cost || 0;

    db.userProfile.coins += refundCoins;

    const reward = db.rewards.find(r => r.id === redemption.rewardId);
    if (reward && reward.timesRedeemed > 0) {
      reward.timesRedeemed -= 1;
    }

    const logIndex = db.actionLogs.findIndex(l => l.type === 'reward_redeem' && l.entityId === redemption.rewardId && l.coins === -refundCoins);
    if (logIndex !== -1) {
      db.actionLogs.splice(logIndex, 1);
    } else {
      db.actionLogs.unshift({
        id: uid('log'),
        type: 'reward_cancel',
        entityId: redemption.rewardId,
        title: `Cancelou resgate: ${redemption.rewardTitle}`,
        xp: 0,
        coins: refundCoins,
        details: { refund: refundCoins },
        timestamp: new Date().toISOString(),
        hour: new Date().getHours(),
        dayOfWeek: new Date().getDay(),
        date: new Date().toISOString().split('T')[0]
      });
    }

    db.rewardRedemptions.splice(redIndex, 1);

    saveDb(db);
    res.json({
      success: true,
      refundedCoins: refundCoins,
      redemptionId: redemption.id,
      userProfile: db.userProfile,
      reward
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/rewards/redemptions/:id', (req, res) => {
  const cancelHandler = app._router.stack.find(layer => layer.route && layer.route.path === '/api/rewards/redemptions/:id/cancel');
  if (cancelHandler) {
    return cancelHandler.handle(req, res);
  }
  res.status(404).json({ error: 'Endpoint não encontrado' });
});

// ==========================================
// 8. BOSS RAID RESET
// ==========================================
app.post('/api/boss/reset', (req, res) => {
  try {
    const db = getDb();
    db.bossRaid = {
      id: uid('boss'),
      name: 'O Dragão da Procrastinação',
      subtitle: 'Chefe Semanal - Derrote-o até domingo!',
      maxHp: 600,
      currentHp: 600,
      defeated: false,
      rewardCoins: 200,
      rewardXp: 500,
      weekStartDate: new Date().toISOString().split('T')[0]
    };
    saveDb(db);
    res.json({ success: true, bossRaid: db.bossRaid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 9. BACKUP EXPORT & IMPORT
// ==========================================
app.get('/api/backup/export', (req, res) => {
  try {
    const db = getDb();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=grimorio-backup-${new Date().toISOString().split('T')[0]}.json`);
    res.send(JSON.stringify(db, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backup/import', (req, res) => {
  try {
    const data = req.body;
    if (!data || !data.userProfile || !data.quests) {
      return res.status(400).json({ error: 'Arquivo de backup inválido.' });
    }
    saveDb(data);
    res.json({ success: true, message: 'Dados restaurados com sucesso!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fallback for SPA routing
app.get('*', (req, res) => {
  const indexHtml = path.join(distPath, 'index.html');
  res.sendFile(indexHtml, (err) => {
    if (err) {
      res.send(`<h2>Grimório de Missões API está rodando na porta ${PORT}!</h2><p>Inicie o Vite com 'npm run dev:client' ou construa com 'npm run build'.</p>`);
    }
  });
});

app.listen(PORT, () => {
  console.log(`🗡️ [Grimório de Missões] Servidor iniciado com sucesso em http://localhost:${PORT}`);
});
