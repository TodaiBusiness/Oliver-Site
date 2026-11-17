/* =========================================================================
   Repositório de solicitações de projeto.

   Regra anti-IDOR: os métodos do cliente sempre recebem `userId` e filtram
   por ele no WHERE. Não existe "buscar por id e depois conferir o dono" —
   a posse faz parte da consulta.
   ========================================================================= */

export function requestsRepository(db) {
  return {
    async create({ userId, type, description, budget, deadline, status }) {
      const now = Date.now();
      const { insertId } = await db.execute(
        `INSERT INTO project_requests
           (user_id, type, description, budget, deadline, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, type, description, budget, deadline, status, now, now]
      );
      return insertId;
    },

    /** Só devolve se a solicitação for do próprio usuário. */
    async findByIdForUser(id, userId) {
      return db.queryOne(
        `SELECT id, user_id, type, description, budget, deadline, status,
                created_at, updated_at
           FROM project_requests
          WHERE id = ? AND user_id = ?`,
        [id, userId]
      );
    },

    /** Visão do admin: solicitação + dados de quem abriu, numa consulta só. */
    async findByIdWithUser(id) {
      return db.queryOne(
        `SELECT r.id, r.user_id, r.type, r.description, r.budget, r.deadline,
                r.status, r.created_at, r.updated_at,
                u.name AS user_name, u.email AS user_email, u.company AS user_company
           FROM project_requests r
           JOIN users u ON u.id = r.user_id
          WHERE r.id = ?`,
        [id]
      );
    },

    async listForUser(userId, { limit, offset }) {
      return db.query(
        `SELECT id, type, description, budget, deadline, status, created_at, updated_at
           FROM project_requests
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?`,
        [userId, limit, offset]
      );
    },

    /** Listagem administrativa, opcionalmente filtrada por status. */
    async listAll({ status = null, limit, offset }) {
      if (status) {
        return db.query(
          `SELECT r.id, r.user_id, r.type, r.status, r.created_at,
                  u.name AS user_name, u.email AS user_email
             FROM project_requests r
             JOIN users u ON u.id = r.user_id
            WHERE r.status = ?
            ORDER BY r.created_at DESC
            LIMIT ? OFFSET ?`,
          [status, limit, offset]
        );
      }

      return db.query(
        `SELECT r.id, r.user_id, r.type, r.status, r.created_at,
                u.name AS user_name, u.email AS user_email
           FROM project_requests r
           JOIN users u ON u.id = r.user_id
          ORDER BY r.created_at DESC
          LIMIT ? OFFSET ?`,
        [limit, offset]
      );
    },

    /** Solicitações de um cliente + não lidas (mensagens de CLIENTE ainda não lidas). */
    async listForClientService(userId, limit = 200) {
      return db.query(
        `SELECT r.id, r.type, r.description, r.status, r.created_at,
                (SELECT COUNT(*) FROM messages m
                   JOIN users a ON a.id = m.author_id
                  WHERE m.request_id = r.id AND m.is_read = 0 AND a.role = 'CLIENT') AS unread
           FROM project_requests r
          WHERE r.user_id = ?
          ORDER BY r.created_at DESC, r.id DESC
          LIMIT ?`,
        [userId, limit]
      );
    },

    async updateStatus(id, status) {
      const { affectedRows } = await db.execute(
        'UPDATE project_requests SET status = ?, updated_at = ? WHERE id = ?',
        [status, Date.now(), id]
      );
      return affectedRows > 0;
    },

    async countByStatus(status) {
      const row = await db.queryOne(
        'SELECT COUNT(*) AS total FROM project_requests WHERE status = ?',
        [status]
      );
      return Number(row?.total ?? 0);
    },

    /** Solicitações abertas pelo usuário desde `since` (cota diária). */
    async countByUserSince(userId, since) {
      const row = await db.queryOne(
        'SELECT COUNT(*) AS total FROM project_requests WHERE user_id = ? AND created_at > ?',
        [userId, since]
      );
      return Number(row?.total ?? 0);
    },

    async countAll() {
      const row = await db.queryOne('SELECT COUNT(*) AS total FROM project_requests');
      return Number(row?.total ?? 0);
    },
  };
}
