/* =========================================================================
   Imagens anexadas às mensagens.

   `content` guarda os bytes. As listagens NUNCA selecionam essa coluna —
   só o download busca o conteúdo, senão cada abertura de conversa arrastaria
   megabytes de imagem à toa.
   ========================================================================= */

const META = 'id, message_id, filename, mime, size, created_at';

export function attachmentsRepository(db) {
  return {
    async create({ messageId, filename, mime, size, content }) {
      const { insertId } = await db.execute(
        `INSERT INTO attachments (message_id, filename, mime, size, content, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [messageId, filename, mime, size, content, Date.now()]
      );
      return insertId;
    },

    /** Metadados de várias mensagens de uma vez — evita N+1 na conversa. */
    async listMetaForMessages(messageIds) {
      if (!messageIds.length) return [];

      /* Os `?` são gerados pela QUANTIDADE de ids, não pelo conteúdo deles:
         os valores continuam indo como parâmetros. */
      const marcadores = messageIds.map(() => '?').join(', ');

      return db.query(
        `SELECT ${META}
           FROM attachments
          WHERE message_id IN (${marcadores})
          ORDER BY id ASC`,
        messageIds
      );
    },

    /** Conteúdo + o id da solicitação, para autorizar o download. */
    async findWithRequest(id) {
      return db.queryOne(
        `SELECT a.id, a.filename, a.mime, a.size, a.content,
                m.request_id AS request_id
           FROM attachments a
           JOIN messages m ON m.id = a.message_id
          WHERE a.id = ?`,
        [id]
      );
    },

    async countForMessage(messageId) {
      const row = await db.queryOne(
        'SELECT COUNT(*) AS total FROM attachments WHERE message_id = ?',
        [messageId]
      );
      return Number(row?.total ?? 0);
    },

    /** Uso do autor desde `since`: quantidade e bytes (cota diária). */
    async usageByAuthorSince(authorId, since) {
      const row = await db.queryOne(
        `SELECT COUNT(*) AS total, COALESCE(SUM(a.size), 0) AS bytes
           FROM attachments a
           JOIN messages m ON m.id = a.message_id
          WHERE m.author_id = ? AND a.created_at > ?`,
        [authorId, since]
      );
      return { count: Number(row?.total ?? 0), bytes: Number(row?.bytes ?? 0) };
    },
  };
}
