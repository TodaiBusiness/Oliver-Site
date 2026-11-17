/* =========================================================================
   Filtros da lista de conversas do Panel (filter, status, q): validação e
   saneamento num lugar só. Erro de campo = 400 DADOS_INVALIDOS com details.
   ========================================================================= */

import { REQUEST_STATUS_VALUES } from '../config.js';
import { createValidator, escapeLike } from '../http/validation.js';

export const INBOX_FILTERS = Object.freeze(['all', 'unread', 'archived']);
const Q_MAX = 100;
/* Controle e formatação Unicode (bidi, zero-width) não entram na busca. */
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;

/** Texto de busca: sem controle, espaços colapsados, ≤100 caracteres, escapado p/ LIKE. */
export function searchTerm(raw) {
  if (typeof raw !== 'string') return null;
  const text = raw.replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim();
  return text ? escapeLike(Array.from(text).slice(0, Q_MAX).join('')) : null;
}

export function parseInboxFilters(query = {}) {
  const validator = createValidator();
  let filter = 'all';
  if (query.filter !== undefined && query.filter !== '') {
    if (typeof query.filter !== 'string' || !INBOX_FILTERS.includes(query.filter)) {
      validator.fail('filter', 'Filtro inválido. Use all, unread ou archived.');
    } else {
      filter = query.filter;
    }
  }
  let status = null;
  if (query.status !== undefined && query.status !== '') {
    if (typeof query.status !== 'string' || !REQUEST_STATUS_VALUES.includes(query.status)) {
      validator.fail('status', 'Situação inválida.');
    } else {
      status = query.status;
    }
  }
  validator.assert();
  return { filter, status, term: searchTerm(query.q) };
}
