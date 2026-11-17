/* =========================================================================
   Repositório de mensagens. Cada mensagem pertence a uma solicitação.
   O acesso é sempre validado pela solicitação (ver services/messages.js).
   ========================================================================= */

import { ROLES } from '../config.js';
import { unarchiveOnClientMessage } from './panelInbox.js';

export function messagesRepository(db) {
  return {
    /** `externalId`/`externalName`: resposta vinda do Panel (autor real fora do banco do site). */
    async create({ requestId, authorId, body, externalId = null, externalName = null, clientMessageId = null }) {
      const { insertId } = await db.execute(
        `INSERT INTO messages (request_id, author_id, body, is_read, created_at,
                               author_external_id, author_external_name, client_message_id)
         VALUES (?, ?, ?, 0, ?, ?, ?, ?)`,
        [requestId, authorId, body, Date.now(), externalId, externalName, clientMessageId]
      );
      /* Mensagem nova do cliente tira a conversa do arquivo (Panel). */
      await unarchiveOnClientMessage(db, requestId, authorId);
      return insertId;
    },

    async findById(id) {
      return db.queryOne(
        `SELECT m.id, m.request_id, m.author_id, m.body, m.is_read, m.created_at,
                m.author_external_name, u.name AS author_name, u.role AS author_role
           FROM messages m
           JOIN users u ON u.id = m.author_id
          WHERE m.id = ?`,
        [id]
      );
    },

    /** Traz o autor junto — evita uma consulta por mensagem (N+1). */
    async listForRequest(requestId, { limit, offset }) {
      return db.query(
        `SELECT m.id, m.request_id, m.author_id, m.body, m.is_read, m.created_at,
                m.author_external_name, u.name AS author_name, u.role AS author_role
           FROM messages m
           JOIN users u ON u.id = m.author_id
          WHERE m.request_id = ?
          ORDER BY m.created_at ASC, m.id ASC
          LIMIT ? OFFSET ?`,
        [requestId, limit, offset]
      );
    },

    /**
     * Marca como lidas as mensagens que o leitor NÃO escreveu.
     * Uma única instrução em lote, não uma por mensagem.
     */
    async markReadForReader(requestId, readerId) {
      const { affectedRows } = await db.execute(
        `UPDATE messages
            SET is_read = 1
          WHERE request_id = ? AND author_id <> ? AND is_read = 0`,
        [requestId, readerId]
      );
      return affectedRows;
    },

    /**
     * Total de não lidas para o indicador do menu.
     * Admin conta tudo que não escreveu; cliente conta só o que está nas
     * próprias solicitações. Uma consulta, sem carregar as conversas.
     */
    async countUnreadForViewer({ viewerId, isAdmin }) {
      if (isAdmin) {
        const row = await db.queryOne(
          `SELECT COUNT(*) AS total
             FROM messages
            WHERE author_id <> ? AND is_read = 0`,
          [viewerId]
        );
        return Number(row?.total ?? 0);
      }

      return this.countUnreadForUser(viewerId);
    },

    async countUnreadForUser(userId) {
      const row = await db.queryOne(
        `SELECT COUNT(*) AS total
           FROM messages m
           JOIN project_requests r ON r.id = m.request_id
          WHERE r.user_id = ? AND m.author_id <> ? AND m.is_read = 0`,
        [userId, userId]
      );
      return Number(row?.total ?? 0);
    },

    /** Mensagens escritas pelo autor desde `since` (cota por hora). */
    async countByAuthorSince(authorId, since) {
      const row = await db.queryOne(
        'SELECT COUNT(*) AS total FROM messages WHERE author_id = ? AND created_at > ?',
        [authorId, since]
      );
      return Number(row?.total ?? 0);
    },

    async countAll() {
      const row = await db.queryOne('SELECT COUNT(*) AS total FROM messages');
      return Number(row?.total ?? 0);
    },

    /**
     * Conversas para a caixa de mensagens.
     *
     * Cada linha já traz a última mensagem e o total de não lidas em
     * subconsultas — uma consulta só para a lista inteira, em vez de uma por
     * conversa (N+1). `viewerId` define de quem são as "não lidas".
     *
     * `ownerId` restringe ao dono (cliente); admin passa null e vê todas.
     */
    async listConversations({ viewerId, ownerId = null, limit, offset }) {
      const colunas = `
        r.id, r.type, r.status, r.created_at, r.updated_at,
        u.id AS client_id, u.name AS client_name, u.company AS client_company,
        (SELECT m.body       FROM messages m WHERE m.request_id = r.id
          ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_body,
        (SELECT m.created_at FROM messages m WHERE m.request_id = r.id
          ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_at,
        (SELECT m.author_id  FROM messages m WHERE m.request_id = r.id
          ORDER BY m.created_at DESC, m.id DESC LIMIT 1) AS last_author_id,
        (SELECT COUNT(*) FROM messages m
          WHERE m.request_id = r.id AND m.author_id <> ? AND m.is_read = 0) AS unread`;

      /* Conversa sem mensagem ainda cai para a data de abertura, para não
         sumir do topo nem quebrar a ordenação.

         A ordenação fica numa consulta externa porque o Postgres só aceita
         apelido do SELECT no ORDER BY quando ele aparece sozinho — dentro de
         COALESCE(...) ele não enxerga `last_at`. Envolver assim mantém uma
         única forma de SQL valendo nos dois bancos. */
      const ordem = 'ORDER BY COALESCE(last_at, created_at) DESC';

      if (ownerId) {
        return db.query(
          `SELECT * FROM (
             SELECT ${colunas}
               FROM project_requests r
               JOIN users u ON u.id = r.user_id
              WHERE r.user_id = ?
           ) AS conversas
           ${ordem}
           LIMIT ? OFFSET ?`,
          [viewerId, ownerId, limit, offset]
        );
      }

      return db.query(
        `SELECT * FROM (
           SELECT ${colunas}
             FROM project_requests r
             JOIN users u ON u.id = r.user_id
         ) AS conversas
         ${ordem}
         LIMIT ? OFFSET ?`,
        [viewerId, limit, offset]
      );
    },

    /* ------------------------------------------------ endpoints de serviço
       (Panel). "Não lida" aqui = mensagem de CLIENTE com is_read = 0; vale para
       todos os admins (um só sinalizador por mensagem). Mensagem do Panel e dos
       admins do site nunca contam. */

    /** Marca como lidas as mensagens de CLIENTE da solicitação. */
    async markClientMessagesRead(requestId) {
      const { affectedRows } = await db.execute(
        `UPDATE messages
            SET is_read = 1
          WHERE request_id = ? AND is_read = 0
            AND author_id IN (SELECT id FROM users WHERE role = ?)`,
        [requestId, ROLES.CLIENT]
      );
      return affectedRows;
    },

    /** Mensagem já gravada para este envio idempotente, se houver. */
    async findByClientMessageId(requestId, externalId, clientMessageId) {
      return db.queryOne(
        `SELECT id FROM messages
          WHERE request_id = ? AND author_external_id = ? AND client_message_id = ?`,
        [requestId, externalId, clientMessageId]
      );
    },

    /** As `limit` mensagens MAIS RECENTES da conversa, em ordem cronológica. */
    async listAllForRequest(requestId, limit = 1000) {
      const rows = await db.query(
        `SELECT m.id, m.request_id, m.author_id, m.body, m.is_read, m.created_at,
                m.author_external_name, u.name AS author_name, u.role AS author_role
           FROM messages m
           JOIN users u ON u.id = m.author_id
          WHERE m.request_id = ?
          ORDER BY m.created_at DESC, m.id DESC
          LIMIT ?`,
        [requestId, limit]
      );
      return rows.reverse();
    },
  };
}
