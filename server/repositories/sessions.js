/* =========================================================================
   Repositório de sessões. Guarda o HASH do token, nunca o token em si.
   ========================================================================= */

export function sessionsRepository(db) {
  return {
    async create({ id, userId, expiresAt, ip = null, userAgent = null }) {
      const now = Date.now();
      await db.execute(
        `INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, userId, expiresAt, now, now, ip, userAgent]
      );
    },

    /**
     * Busca a sessão junto com o usuário — uma consulta só.
     * (Checklist "Performance": nada de buscar sessão e depois usuário.)
     * Sessão vencida (limite absoluto) não é retornada. A expiração por
     * INATIVIDADE depende do papel e é decidida pelo serviço de autenticação
     * com o `last_seen_at` devolvido aqui.
     */
    async findValidWithUser(id, now = Date.now()) {
      return db.queryOne(
        `SELECT s.id           AS session_id,
                s.expires_at   AS expires_at,
                s.created_at   AS created_at,
                s.last_seen_at AS last_seen_at,
                u.id           AS user_id,
                u.name         AS name,
                u.company      AS company,
                u.email        AS email,
                u.role         AS role,
                u.status       AS status,
                COALESCE(t.enabled, 0) AS totp_enabled
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           LEFT JOIN user_totp t ON t.user_id = u.id
          WHERE s.id = ? AND s.expires_at > ?`,
        [id, now]
      );
    },

    /** Marca a sessão como usada agora (relógio da inatividade). */
    async touch(id, now = Date.now()) {
      await db.execute('UPDATE sessions SET last_seen_at = ? WHERE id = ?', [now, id]);
    },

    /** Sessões ainda dentro do limite absoluto, mais recentes primeiro. */
    async listForUser(userId, now = Date.now()) {
      return db.query(
        `SELECT id, created_at, last_seen_at, expires_at, ip, user_agent
           FROM sessions
          WHERE user_id = ? AND expires_at > ?
          ORDER BY COALESCE(last_seen_at, created_at) DESC`,
        [userId, now]
      );
    },

    async delete(id) {
      await db.execute('DELETE FROM sessions WHERE id = ?', [id]);
    },

    async deleteAllForUser(userId) {
      const { affectedRows } = await db.execute('DELETE FROM sessions WHERE user_id = ?', [userId]);
      return affectedRows;
    },

    /** Todas as sessões do usuário menos a informada (troca de senha). */
    async deleteOthersForUser(userId, keepId) {
      const { affectedRows } = await db.execute(
        'DELETE FROM sessions WHERE user_id = ? AND id <> ?',
        [userId, keepId]
      );
      return affectedRows;
    },

    /** Encerra UMA sessão do usuário, achada pelo prefixo público do id. */
    async deleteByPrefixForUser(userId, prefix) {
      const { affectedRows } = await db.execute(
        'DELETE FROM sessions WHERE user_id = ? AND substr(id, 1, ?) = ?',
        [userId, prefix.length, prefix]
      );
      return affectedRows;
    },

    /** Faxina das sessões vencidas. */
    async deleteExpired(now = Date.now()) {
      const { affectedRows } = await db.execute(
        'DELETE FROM sessions WHERE expires_at <= ?',
        [now]
      );
      return affectedRows;
    },

    /** Sessões paradas desde antes de `before` (já inúteis para qualquer papel). */
    async deleteIdleBefore(before) {
      const { affectedRows } = await db.execute(
        'DELETE FROM sessions WHERE COALESCE(last_seen_at, created_at) <= ?',
        [before]
      );
      return affectedRows;
    },
  };
}
