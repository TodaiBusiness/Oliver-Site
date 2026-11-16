/* =========================================================================
   Repositório de mensagens. Cada mensagem pertence a uma solicitação.
   O acesso é sempre validado pela solicitação (ver services/messages.js).
   ========================================================================= */

export function messagesRepository(db) {
  return {
    async create({ requestId, authorId, body }) {
      const { insertId } = await db.execute(
        `INSERT INTO messages (request_id, author_id, body, is_read, created_at)
         VALUES (?, ?, ?, 0, ?)`,
        [requestId, authorId, body, Date.now()]
      );
      return insertId;
    },

    /** Traz o autor junto — evita uma consulta por mensagem (N+1). */
    async listForRequest(requestId, { limit, offset }) {
      return db.query(
        `SELECT m.id, m.request_id, m.author_id, m.body, m.is_read, m.created_at,
                u.name AS author_name, u.role AS author_role
           FROM messages m
           JOIN users u ON u.id = m.author_id
          WHERE m.request_id = ?
          ORDER BY m.created_at ASC
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
  };
}
