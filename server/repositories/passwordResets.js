/* Tokens de recuperação de senha. O token cru só existe no e-mail; aqui fica o SHA-256. */

export function passwordResetsRepository(db) {
  return {
    /** Invalida os anteriores do usuário e grava o novo. */
    async replaceForUser({ id, userId, expiresAt }) {
      await db.transaction(async (tx) => {
        await tx.execute('DELETE FROM password_resets WHERE user_id = ?', [userId]);
        await tx.execute(
          'INSERT INTO password_resets (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
          [id, userId, expiresAt, Date.now()]
        );
      });
    },

    async findValid(id, now = Date.now()) {
      return db.queryOne(
        'SELECT id, user_id FROM password_resets WHERE id = ? AND used_at IS NULL AND expires_at > ?',
        [id, now]
      );
    },

    /** Uso único: só quem marcar primeiro recebe `true`. */
    async consume(id, now = Date.now()) {
      const { affectedRows } = await db.execute(
        'UPDATE password_resets SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?',
        [now, id, now]
      );
      return affectedRows === 1;
    },

    async deleteForUser(userId) {
      await db.execute('DELETE FROM password_resets WHERE user_id = ?', [userId]);
    },

    async deleteExpired(now = Date.now()) {
      const { affectedRows } = await db.execute(
        'DELETE FROM password_resets WHERE expires_at <= ? OR used_at IS NOT NULL',
        [now]
      );
      return affectedRows;
    },
  };
}
