/**
 * Utility to format citations and bibliographic references according to Brazilian ABNT standards (NBR 10520 & NBR 6023).
 */

/**
 * Format author name to ABNT format: SURNAME, Given Names
 * Example: "James Clear" -> "CLEAR, James"
 * Example: "George S. Clason" -> "CLASON, George S."
 */
export function formatAbntAuthor(authorName) {
  if (!authorName || !authorName.trim()) return 'AUTOR DESCONHECIDO';
  const clean = authorName.trim();
  const parts = clean.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].toUpperCase();
  }

  const surname = parts[parts.length - 1].toUpperCase();
  const givenNames = parts.slice(0, -1).join(' ');
  return `${surname}, ${givenNames}`;
}

/**
 * Get uppercase surname for in-text citation
 * Example: "James Clear" -> "CLEAR"
 */
export function getAbntSurname(authorName) {
  if (!authorName || !authorName.trim()) return 'AUTOR';
  const parts = authorName.trim().split(/\s+/);
  return parts[parts.length - 1].toUpperCase();
}

/**
 * Generates the complete ABNT citation text with in-text callout and bibliographic reference
 * 
 * Format:
 * "Texto da citação." (SOBRENOME, p. 45)
 * 
 * Referência:
 * SOBRENOME, Nome. Título da Obra. p. 45.
 */
export function formatFullAbntCitation(quoteText, book, page) {
  const quote = (quoteText || '').trim();
  const title = book?.title || 'Título Desconhecido';
  const author = book?.author || 'Autor Desconhecido';
  const pageNumber = page || book?.currentPage || 1;

  const abntAuthor = formatAbntAuthor(author);
  const surname = getAbntSurname(author);

  return `"${quote}" (${surname}, p. ${pageNumber})

Referência (ABNT):
${abntAuthor}. ${title}. p. ${pageNumber}.`;
}

/**
 * Generates concise ABNT citation
 * Format: "Texto da citação." (SOBRENOME, Nome. Título. p. 45)
 */
export function formatShortAbntCitation(quoteText, book, page) {
  const quote = (quoteText || '').trim();
  const title = book?.title || 'Título Desconhecido';
  const author = book?.author || 'Autor Desconhecido';
  const pageNumber = page || book?.currentPage || 1;
  const abntAuthor = formatAbntAuthor(author);

  return `"${quote}" (${abntAuthor}. ${title}, p. ${pageNumber})`;
}
