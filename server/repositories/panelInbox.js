/* =========================================================================
   Consultas do Panel sobre a caixa de conversas (endpoints /api/service/*):
   lista com filtros e busca, arquivar, feed de mudanças e modelos de resposta.

   "Não lida" = mensagem de CLIENTE com is_read = 0 (vale para todos os admins).
   Conversa arquivada não entra na contagem de não lidas nem na lista padrão.
   O mesmo SQL roda em SQLite e Postgres (só LIKE/ILIKE muda).
   ========================================================================= */

import { ROLES } from '../config.js';

export const TEMPLATES_MAX = 50;

/**
 * Mensagem nova do CLIENTE desarquiva a conversa (chamado por messages.create).
 * Uma instrução só; sem efeito quando a conversa não está arquivada.
 */
export async function unarchiveOnClientMessage(db, requestId, authorId) {
  await db.execute(
    `UPDATE project_requests
        SET archived_at = NULL, panel_changed_at = ?
      WHERE id = ? AND archived_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM users u WHERE u.id = ? AND u.role = ?)`,
    [Date.now(), requestId, authorId, ROLES.CLIENT]
  );
}

export function panelInboxRepository(db) {
  const like = db.dialect === 'postgres' ? 'ILIKE' : 'LIKE';

  return {
    /**
     * Conversas (solicitações com ao menos 1 mensagem), da mais recente para a mais
     * antiga; desempate por id, então a paginação é estável. `term` já vem
     * escapado (ESCAPE '!'). A busca no texto das mensagens é um EXISTS: a conversa
     * nunca aparece duas vezes.
     */
    async list({ filter = 'all', status = null, term = null, limit, offset }) {
      const ultima = (coluna) => `(SELECT ${coluna} FROM messages m WHERE m.request_id = r.id
          ORDER BY m.created_at DESC, m.id DESC LIMIT 1)`;
      const where = [
        'EXISTS (SELECT 1 FROM messages m WHERE m.request_id = r.id)',
        filter === 'archived' ? 'r.archived_at IS NOT NULL' : 'r.archived_at IS NULL',
      ];
      const params = [];
      if (status) {
        where.push('r.status = ?');
        params.push(status);
      }
      if (term) {
        const pattern = `%${term}%`;
        where.push(
          `(u.name ${like} ? ESCAPE '!' OR u.email ${like} ? ESCAPE '!'
            OR r.type ${like} ? ESCAPE '!' OR r.description ${like} ? ESCAPE '!'
            OR EXISTS (SELECT 1 FROM messages mt WHERE mt.request_id = r.id
                         AND mt.body ${like} ? ESCAPE '!'))`
        );
        params.push(pattern, pattern, pattern, pattern, pattern);
      }
      params.push(limit, offset);

      return db.query(
        `SELECT * FROM (
           SELECT r.id, r.type, r.description, r.status, r.archived_at,
                  u.name AS client_name, u.email AS client_email,
                  ${ultima('m.created_at')} AS last_at,
                  ${ultima('m.body')} AS last_body,
                  ${ultima('COALESCE(m.author_external_name, (SELECT a.name FROM users a WHERE a.id = m.author_id))')} AS last_author_name,
                  ${ultima('(SELECT a.role FROM users a WHERE a.id = m.author_id)')} AS last_author_role,
                  (SELECT COUNT(*) FROM attachments t WHERE t.message_id = ${ultima('m.id')}) AS last_attachments,
                  (SELECT COUNT(*) FROM messages m
                    JOIN users a ON a.id = m.author_id
                   WHERE m.request_id = r.id AND m.is_read = 0 AND a.role = '${ROLES.CLIENT}') AS unread
             FROM project_requests r
             JOIN users u ON u.id = r.user_id
            WHERE ${where.join(' AND ')}
         ) AS conversas
         ${filter === 'unread' ? 'WHERE unread > 0' : ''}
         ORDER BY last_at DESC, id DESC
         LIMIT ? OFFSET ?`,
        params
      );
    },

    /** Mensagens de cliente não lidas em conversas NÃO arquivadas (índice ix_messages_unread). */
    async countUnread() {
      const row = await db.queryOne(
        `SELECT COUNT(*) AS total
           FROM messages m
           JOIN users a ON a.id = m.author_id
           JOIN project_requests r ON r.id = m.request_id
          WHERE m.is_read = 0 AND a.role = ? AND r.archived_at IS NULL`,
        [ROLES.CLIENT]
      );
      return Number(row?.total ?? 0);
    },

    /** Arquiva/desarquiva; devolve true se mudou. A marca de mudança alimenta o feed. */
    async setArchived(requestId, archived) {
      const now = Date.now();
      const { affectedRows } = await db.execute(
        archived
          ? `UPDATE project_requests SET archived_at = ?, panel_changed_at = ?
              WHERE id = ? AND archived_at IS NULL`
          : `UPDATE project_requests SET archived_at = NULL, panel_changed_at = ?
              WHERE id = ? AND archived_at IS NOT NULL`,
        archived ? [now, now, requestId] : [now, requestId]
      );
      return affectedRows > 0;
    },

    /**
     * Conversas alteradas depois de `since` (ms), da mais antiga para a mais nova:
     * mensagem de CLIENTE nova, arquivar/desarquivar, ou situação alterada. Três
     * faixas indexadas (messages.created_at, panel_changed_at, updated_at).
     * Devolve até `limit` linhas.
     */
    async changedSince(since, limit) {
      return db.query(
        `SELECT rid, MAX(ts) AS last_ts FROM (
           SELECT m.request_id AS rid, m.created_at AS ts
             FROM messages m JOIN users a ON a.id = m.author_id
            WHERE m.created_at > ? AND a.role = '${ROLES.CLIENT}'
           UNION ALL
           SELECT r.id AS rid, r.panel_changed_at AS ts
             FROM project_requests r WHERE r.panel_changed_at > ?
           UNION ALL
           SELECT r.id AS rid, r.updated_at AS ts
             FROM project_requests r
            WHERE r.updated_at > ?
              AND EXISTS (SELECT 1 FROM messages m WHERE m.request_id = r.id)
         ) c
         GROUP BY rid
         ORDER BY last_ts ASC, rid ASC
         LIMIT ?`,
        [since, since, since, limit]
      );
    },

    /* --------------------------------------------------- modelos de resposta */

    async listTemplates() {
      return db.query(
        `SELECT id, title, body, updated_at, updated_by_name
           FROM reply_templates ORDER BY LOWER(title) ASC, id ASC`
      );
    },

    async findTemplate(id) {
      return db.queryOne(
        'SELECT id, title, body, updated_at, updated_by_name FROM reply_templates WHERE id = ?',
        [id]
      );
    },

    /** Insere só se ainda houver vaga (o limite vai na própria instrução). Devolve o id ou null. */
    async createTemplate({ title, body, updatedByName }) {
      const { insertId, affectedRows } = await db.execute(
        `INSERT INTO reply_templates (title, body, updated_at, updated_by_name)
         SELECT CAST(? AS TEXT), CAST(? AS TEXT), CAST(? AS BIGINT), CAST(? AS TEXT)
          WHERE (SELECT COUNT(*) FROM reply_templates) < ?`,
        [title, body, Date.now(), updatedByName, TEMPLATES_MAX]
      );
      return affectedRows > 0 ? insertId : null;
    },

    async updateTemplate(id, { title, body, updatedByName }) {
      const { affectedRows } = await db.execute(
        `UPDATE reply_templates SET title = ?, body = ?, updated_at = ?, updated_by_name = ?
          WHERE id = ?`,
        [title, body, Date.now(), updatedByName, id]
      );
      return affectedRows > 0;
    },

    async deleteTemplate(id) {
      const { affectedRows } = await db.execute('DELETE FROM reply_templates WHERE id = ?', [id]);
      return affectedRows > 0;
    },
  };
}
