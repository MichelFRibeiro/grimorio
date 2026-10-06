/**
 * Cânone protestante (66 livros), em português.
 * Fonte dos totais de versículos: contagem padrão da Bíblia protestante
 * (mesma dos livros de Almeida). Não é o texto bíblico — só a estrutura
 * para marcar o ponto de leitura (livro → capítulo → versículo).
 *
 * testament: 'ot' Antigo Testamento, 'nt' Novo Testamento.
 * chapters: versículos de cada capítulo, na ordem.
 */

const OT = 'ot';
const NT = 'nt';

export const BIBLE_BOOKS = [
  { id: 'gn', name: 'Gênesis', abbr: 'Gn', testament: OT, chapters: [31, 25, 24, 26, 32, 22, 24, 22, 29, 32, 32, 20, 18, 24, 21, 16, 27, 33, 38, 18, 34, 24, 20, 67, 34, 35, 46, 22, 35, 43, 55, 32, 20, 31, 29, 43, 36, 30, 23, 23, 57, 38, 34, 34, 28, 34, 31, 22, 33, 26] },
  { id: 'ex', name: 'Êxodo', abbr: 'Êx', testament: OT, chapters: [22, 25, 22, 31, 23, 30, 25, 32, 35, 29, 10, 51, 22, 31, 27, 36, 16, 27, 25, 26, 36, 31, 33, 18, 40, 37, 21, 43, 46, 38, 18, 35, 23, 35, 35, 38, 29, 31, 43, 38] },
  { id: 'lv', name: 'Levítico', abbr: 'Lv', testament: OT, chapters: [17, 16, 17, 35, 19, 30, 38, 36, 24, 20, 47, 8, 59, 57, 33, 34, 16, 30, 37, 27, 24, 33, 44, 23, 55, 46, 34] },
  { id: 'nm', name: 'Números', abbr: 'Nm', testament: OT, chapters: [54, 34, 51, 49, 31, 27, 89, 26, 23, 36, 35, 16, 33, 45, 41, 50, 13, 32, 22, 29, 35, 41, 30, 25, 18, 65, 23, 31, 40, 16, 54, 42, 56, 29, 34, 13] },
  { id: 'dt', name: 'Deuteronômio', abbr: 'Dt', testament: OT, chapters: [46, 37, 29, 49, 33, 25, 26, 20, 29, 22, 32, 32, 18, 29, 23, 22, 20, 22, 21, 20, 23, 30, 25, 22, 19, 19, 26, 68, 29, 20, 30, 52, 29, 12] },
  { id: 'js', name: 'Josué', abbr: 'Js', testament: OT, chapters: [18, 24, 17, 24, 15, 27, 26, 35, 27, 43, 23, 24, 33, 15, 63, 10, 18, 28, 51, 9, 45, 34, 16, 33] },
  { id: 'jz', name: 'Juízes', abbr: 'Jz', testament: OT, chapters: [36, 23, 31, 24, 31, 40, 25, 35, 57, 18, 40, 15, 25, 20, 20, 31, 13, 31, 30, 48, 25] },
  { id: 'rt', name: 'Rute', abbr: 'Rt', testament: OT, chapters: [22, 23, 18, 22] },
  { id: '1sm', name: '1 Samuel', abbr: '1Sm', testament: OT, chapters: [28, 36, 21, 22, 12, 21, 17, 22, 27, 27, 15, 25, 23, 52, 35, 23, 58, 30, 24, 42, 15, 23, 29, 22, 44, 25, 12, 25, 11, 31, 13] },
  { id: '2sm', name: '2 Samuel', abbr: '2Sm', testament: OT, chapters: [27, 32, 39, 12, 25, 23, 29, 18, 13, 19, 27, 31, 39, 33, 37, 23, 29, 33, 43, 26, 22, 51, 39, 25] },
  { id: '1rs', name: '1 Reis', abbr: '1Rs', testament: OT, chapters: [53, 46, 28, 34, 18, 38, 51, 66, 28, 29, 43, 33, 34, 31, 34, 34, 24, 46, 21, 43, 29, 53] },
  { id: '2rs', name: '2 Reis', abbr: '2Rs', testament: OT, chapters: [18, 25, 27, 44, 27, 33, 20, 29, 37, 36, 21, 21, 25, 29, 38, 20, 41, 37, 37, 21, 26, 20, 37, 20, 30] },
  { id: '1cr', name: '1 Crônicas', abbr: '1Cr', testament: OT, chapters: [54, 55, 24, 43, 26, 81, 40, 40, 44, 14, 47, 40, 14, 17, 29, 43, 27, 17, 19, 8, 30, 19, 32, 31, 31, 32, 34, 21, 30] },
  { id: '2cr', name: '2 Crônicas', abbr: '2Cr', testament: OT, chapters: [17, 18, 17, 22, 14, 42, 22, 18, 31, 19, 23, 16, 22, 15, 19, 14, 19, 34, 11, 37, 20, 12, 21, 27, 28, 23, 9, 27, 36, 27, 21, 33, 25, 33, 27, 23] },
  { id: 'ed', name: 'Esdras', abbr: 'Ed', testament: OT, chapters: [11, 70, 13, 24, 17, 22, 28, 36, 15, 44] },
  { id: 'ne', name: 'Neemias', abbr: 'Ne', testament: OT, chapters: [11, 20, 32, 23, 19, 19, 73, 18, 38, 39, 36, 47, 31] },
  { id: 'et', name: 'Ester', abbr: 'Et', testament: OT, chapters: [22, 23, 15, 17, 14, 14, 10, 17, 32, 3] },
  { id: 'jo', name: 'Jó', abbr: 'Jó', testament: OT, chapters: [22, 13, 26, 21, 27, 30, 21, 22, 35, 22, 20, 25, 28, 22, 35, 22, 16, 21, 29, 29, 34, 30, 17, 25, 6, 14, 23, 28, 25, 31, 40, 22, 33, 37, 16, 33, 24, 41, 30, 24, 34, 17] },
  { id: 'sl', name: 'Salmos', abbr: 'Sl', testament: OT, chapters: [6, 12, 8, 8, 12, 10, 17, 9, 20, 18, 7, 8, 6, 7, 5, 11, 15, 50, 14, 9, 13, 31, 6, 10, 22, 12, 14, 9, 11, 12, 24, 11, 22, 22, 28, 12, 40, 22, 13, 17, 13, 11, 5, 26, 17, 11, 9, 14, 20, 23, 19, 9, 6, 7, 23, 13, 11, 11, 17, 12, 8, 12, 11, 10, 13, 20, 7, 35, 36, 5, 24, 20, 28, 23, 10, 12, 20, 72, 13, 19, 16, 8, 18, 12, 13, 17, 7, 18, 52, 17, 16, 15, 5, 23, 11, 13, 12, 9, 9, 5, 8, 28, 22, 35, 45, 48, 43, 13, 31, 7, 10, 10, 9, 8, 18, 19, 2, 29, 176, 7, 8, 9, 4, 8, 5, 6, 5, 6, 8, 8, 3, 18, 3, 3, 21, 26, 9, 8, 24, 13, 10, 7, 12, 15, 21, 10, 20, 14, 9, 6] },
  { id: 'pv', name: 'Provérbios', abbr: 'Pv', testament: OT, chapters: [33, 22, 35, 27, 23, 35, 27, 36, 18, 32, 31, 28, 25, 35, 33, 33, 28, 24, 29, 30, 31, 29, 35, 34, 28, 28, 27, 28, 27, 33, 31] },
  { id: 'ec', name: 'Eclesiastes', abbr: 'Ec', testament: OT, chapters: [18, 26, 22, 16, 20, 12, 29, 17, 18, 20, 10, 14] },
  { id: 'ct', name: 'Cânticos', abbr: 'Ct', testament: OT, chapters: [17, 17, 11, 16, 16, 13, 13, 14] },
  { id: 'is', name: 'Isaías', abbr: 'Is', testament: OT, chapters: [31, 22, 26, 6, 30, 13, 25, 22, 21, 34, 16, 6, 22, 32, 9, 14, 14, 7, 25, 6, 17, 25, 18, 23, 12, 21, 13, 29, 24, 33, 9, 20, 24, 17, 10, 22, 38, 22, 8, 31, 29, 25, 28, 28, 25, 13, 15, 22, 26, 11, 23, 15, 12, 17, 13, 12, 21, 14, 21, 22, 11, 12, 19, 12, 25, 24] },
  { id: 'jr', name: 'Jeremias', abbr: 'Jr', testament: OT, chapters: [19, 37, 25, 31, 31, 30, 34, 22, 26, 25, 23, 17, 27, 22, 21, 21, 27, 23, 15, 18, 14, 30, 40, 10, 38, 24, 22, 17, 32, 24, 40, 44, 26, 22, 19, 32, 21, 28, 18, 16, 18, 22, 13, 30, 5, 28, 7, 47, 39, 46, 64, 34] },
  { id: 'lm', name: 'Lamentações', abbr: 'Lm', testament: OT, chapters: [22, 22, 66, 22, 22] },
  { id: 'ez', name: 'Ezequiel', abbr: 'Ez', testament: OT, chapters: [28, 10, 27, 17, 17, 14, 27, 18, 11, 22, 25, 28, 23, 23, 8, 63, 24, 32, 14, 49, 32, 31, 49, 27, 17, 21, 36, 26, 21, 26, 18, 32, 33, 31, 15, 38, 28, 23, 29, 49, 26, 20, 27, 31, 25, 24, 23, 35] },
  { id: 'dn', name: 'Daniel', abbr: 'Dn', testament: OT, chapters: [21, 49, 30, 37, 31, 28, 28, 27, 27, 21, 45, 13] },
  { id: 'os', name: 'Oseias', abbr: 'Os', testament: OT, chapters: [11, 23, 5, 19, 15, 11, 16, 14, 17, 15, 12, 14, 16, 9] },
  { id: 'jl', name: 'Joel', abbr: 'Jl', testament: OT, chapters: [20, 32, 21] },
  { id: 'am', name: 'Amós', abbr: 'Am', testament: OT, chapters: [15, 16, 15, 13, 27, 14, 17, 14, 15] },
  { id: 'ob', name: 'Obadias', abbr: 'Ob', testament: OT, chapters: [21] },
  { id: 'jn', name: 'Jonas', abbr: 'Jn', testament: OT, chapters: [17, 10, 10, 11] },
  { id: 'mq', name: 'Miqueias', abbr: 'Mq', testament: OT, chapters: [16, 13, 12, 13, 15, 16, 20] },
  { id: 'na', name: 'Naum', abbr: 'Na', testament: OT, chapters: [15, 13, 19] },
  { id: 'hc', name: 'Habacuque', abbr: 'Hc', testament: OT, chapters: [17, 20, 19] },
  { id: 'sf', name: 'Sofonias', abbr: 'Sf', testament: OT, chapters: [18, 15, 20] },
  { id: 'ag', name: 'Ageu', abbr: 'Ag', testament: OT, chapters: [15, 23] },
  { id: 'zc', name: 'Zacarias', abbr: 'Zc', testament: OT, chapters: [21, 13, 10, 14, 11, 15, 14, 23, 17, 12, 17, 14, 9, 21] },
  { id: 'ml', name: 'Malaquias', abbr: 'Ml', testament: OT, chapters: [14, 17, 18, 6] },
  { id: 'mt', name: 'Mateus', abbr: 'Mt', testament: NT, chapters: [25, 23, 17, 25, 48, 34, 29, 34, 38, 42, 30, 50, 58, 36, 39, 28, 27, 35, 30, 34, 46, 46, 39, 51, 46, 75, 66, 20] },
  { id: 'mc', name: 'Marcos', abbr: 'Mc', testament: NT, chapters: [45, 28, 35, 41, 43, 56, 37, 38, 50, 52, 33, 44, 37, 72, 47, 20] },
  { id: 'lc', name: 'Lucas', abbr: 'Lc', testament: NT, chapters: [80, 52, 38, 44, 39, 49, 50, 56, 62, 42, 54, 59, 35, 35, 32, 31, 37, 43, 48, 47, 38, 71, 56, 53] },
  { id: 'joa', name: 'João', abbr: 'Jo', testament: NT, chapters: [51, 25, 36, 54, 47, 71, 53, 59, 41, 42, 57, 50, 38, 31, 27, 33, 26, 40, 42, 31, 25] },
  { id: 'at', name: 'Atos', abbr: 'At', testament: NT, chapters: [26, 47, 26, 37, 42, 15, 60, 40, 43, 48, 30, 25, 52, 28, 41, 40, 34, 28, 41, 38, 40, 30, 35, 27, 27, 32, 44, 31] },
  { id: 'rm', name: 'Romanos', abbr: 'Rm', testament: NT, chapters: [32, 29, 31, 25, 21, 23, 25, 39, 33, 21, 36, 21, 14, 23, 33, 27] },
  { id: '1co', name: '1 Coríntios', abbr: '1Co', testament: NT, chapters: [31, 16, 23, 21, 13, 20, 40, 13, 27, 33, 34, 31, 13, 40, 58, 24] },
  { id: '2co', name: '2 Coríntios', abbr: '2Co', testament: NT, chapters: [24, 17, 18, 18, 21, 18, 16, 24, 15, 18, 33, 21, 14] },
  { id: 'gl', name: 'Gálatas', abbr: 'Gl', testament: NT, chapters: [24, 21, 29, 31, 26, 18] },
  { id: 'ef', name: 'Efésios', abbr: 'Ef', testament: NT, chapters: [23, 22, 21, 32, 33, 24] },
  { id: 'fp', name: 'Filipenses', abbr: 'Fp', testament: NT, chapters: [30, 30, 21, 23] },
  { id: 'cl', name: 'Colossenses', abbr: 'Cl', testament: NT, chapters: [29, 23, 25, 18] },
  { id: '1ts', name: '1 Tessalonicenses', abbr: '1Ts', testament: NT, chapters: [10, 20, 13, 18, 28] },
  { id: '2ts', name: '2 Tessalonicenses', abbr: '2Ts', testament: NT, chapters: [12, 17, 18] },
  { id: '1tm', name: '1 Timóteo', abbr: '1Tm', testament: NT, chapters: [20, 15, 16, 16, 25, 21] },
  { id: '2tm', name: '2 Timóteo', abbr: '2Tm', testament: NT, chapters: [18, 26, 17, 22] },
  { id: 'tt', name: 'Tito', abbr: 'Tt', testament: NT, chapters: [16, 15, 15] },
  { id: 'fm', name: 'Filemom', abbr: 'Fm', testament: NT, chapters: [25] },
  { id: 'hb', name: 'Hebreus', abbr: 'Hb', testament: NT, chapters: [14, 18, 19, 16, 14, 20, 28, 13, 28, 39, 40, 29, 25] },
  { id: 'tg', name: 'Tiago', abbr: 'Tg', testament: NT, chapters: [27, 26, 18, 17, 20] },
  { id: '1pe', name: '1 Pedro', abbr: '1Pe', testament: NT, chapters: [25, 25, 22, 19, 14] },
  { id: '2pe', name: '2 Pedro', abbr: '2Pe', testament: NT, chapters: [21, 22, 18] },
  { id: '1jo', name: '1 João', abbr: '1Jo', testament: NT, chapters: [10, 29, 24, 21, 21] },
  { id: '2jo', name: '2 João', abbr: '2Jo', testament: NT, chapters: [13] },
  { id: '3jo', name: '3 João', abbr: '3Jo', testament: NT, chapters: [14] },
  { id: 'jd', name: 'Judas', abbr: 'Jd', testament: NT, chapters: [25] },
  { id: 'ap', name: 'Apocalipse', abbr: 'Ap', testament: NT, chapters: [20, 29, 22, 11, 14, 17, 17, 13, 21, 11, 19, 17, 18, 20, 8, 21, 18, 24, 21, 15, 27, 21] }
];

export const BIBLE_CANON = 'protestante';
export const BIBLE_TRANSLATION_LABEL = 'Almeida (cânone protestante)';

const byId = new Map(BIBLE_BOOKS.map((book) => [book.id, book]));

export function getBibleBook(bookId) {
  return byId.get(bookId) || null;
}

export function chapterCount(book) {
  return book?.chapters?.length || 0;
}

export function verseCount(book, chapter) {
  const index = Number(chapter) - 1;
  if (!book || index < 0 || index >= book.chapters.length) return 0;
  return book.chapters[index];
}

export function bookVerseTotal(book) {
  return (book?.chapters || []).reduce((sum, count) => sum + count, 0);
}

export function bibleTotals() {
  return BIBLE_BOOKS.reduce((acc, book) => {
    acc.books += 1;
    acc.chapters += book.chapters.length;
    acc.verses += bookVerseTotal(book);
    if (book.testament === NT) acc.ntBooks += 1;
    else acc.otBooks += 1;
    return acc;
  }, { books: 0, chapters: 0, verses: 0, otBooks: 0, ntBooks: 0 });
}

/** Referência curta: "Jo 3:16" ou "Sl 23". */
export function formatReference(book, chapter, verse) {
  if (!book) return '';
  const ch = Number(chapter) || 0;
  const vs = Number(verse) || 0;
  if (!ch) return book.abbr;
  if (!vs) return `${book.abbr} ${ch}`;
  return `${book.abbr} ${ch}:${vs}`;
}

/** "Ec 2:13-14" quando o trecho fica no mesmo capítulo; senão as duas pontas. */
export function formatVerseSpan(book, chapter, verse, endVerse) {
  const start = Number(verse) || 0;
  const end = Number(endVerse) || start;
  const single = formatReference(book, chapter, start);
  if (!book || !start || end <= start) return single;
  if (end === start + 1) return `${single}-${end}`;
  return `${single}–${end}`;
}

export function formatReferenceLong(book, chapter, verse) {
  if (!book) return '';
  const ch = Number(chapter) || 0;
  const vs = Number(verse) || 0;
  if (!ch) return book.name;
  if (!vs) return `${book.name} ${ch}`;
  return `${book.name} ${ch}:${vs}`;
}

/**
 * Ordena duas posições do cânone.
 * Devolve negativo se `a` vem antes de `b`.
 */
export function comparePassage(a, b) {
  const bookA = getBibleBook(a?.bookId);
  const bookB = getBibleBook(b?.bookId);
  const indexA = bookA ? BIBLE_BOOKS.indexOf(bookA) : -1;
  const indexB = bookB ? BIBLE_BOOKS.indexOf(bookB) : -1;
  if (indexA !== indexB) return indexA - indexB;
  const chapterDelta = (Number(a?.chapter) || 0) - (Number(b?.chapter) || 0);
  if (chapterDelta !== 0) return chapterDelta;
  return (Number(a?.verse) || 0) - (Number(b?.verse) || 0);
}

export function isValidPassage(bookId, chapter, verse) {
  const book = getBibleBook(bookId);
  if (!book) return false;
  const ch = Number(chapter);
  const vs = Number(verse);
  if (!Number.isInteger(ch) || ch < 1 || ch > chapterCount(book)) return false;
  if (!Number.isInteger(vs) || vs < 1 || vs > verseCount(book, ch)) return false;
  return true;
}

/** Próximo versículo, atravessando capítulo e livro. Null no fim do cânone. */
export function nextVerse(bookId, chapter, verse) {
  const book = getBibleBook(bookId);
  if (!book) return null;
  const ch = Number(chapter) || 1;
  const vs = Number(verse) || 0;
  if (vs < verseCount(book, ch)) {
    return { bookId, chapter: ch, verse: vs + 1 };
  }
  if (ch < chapterCount(book)) {
    return { bookId, chapter: ch + 1, verse: 1 };
  }
  const index = BIBLE_BOOKS.indexOf(book);
  const following = BIBLE_BOOKS[index + 1];
  if (!following) return null;
  return { bookId: following.id, chapter: 1, verse: 1 };
}

export function booksByTestament() {
  return {
    ot: BIBLE_BOOKS.filter((book) => book.testament === OT),
    nt: BIBLE_BOOKS.filter((book) => book.testament === NT)
  };
}
