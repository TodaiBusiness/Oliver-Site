/* =========================================================================
   Segundo fator (TOTP), códigos de recuperação e desafios de login.

   Toda transição que precisa ser "uma vez só" é um UPDATE/DELETE condicional
   conferido por `affectedRows` — a corrida entre duas requisições simultâneas
   com o mesmo código é decidida pelo banco, não por um "ler e depois gravar".
   ========================================================================= */

export function twoFactorRepository(db) {
  return {
    async get(userId) {
      return db.queryOne(
        `SELECT user_id, secret_enc, enabled, last_step, created_at, enabled_at
           FROM user_totp WHERE user_id = ?`,
        [userId]
      );
    },

    /** Guarda o segredo ainda NÃO confirmado. Não mexe em 2FA já ativo. */
    async savePending(userId, secretEnc) {
      const { affectedRows } = await db.execute(
        `INSERT INTO user_totp (user_id, secret_enc, enabled, last_step, created_at)
              VALUES (?, ?, 0, 0, ?)
         ON CONFLICT (user_id) DO UPDATE
                 SET secret_enc = excluded.secret_enc,
                     last_step  = 0,
                     created_at = excluded.created_at
               WHERE user_totp.enabled = 0`,
        [userId, secretEnc, Date.now()]
      );
      return affectedRows === 1;
    },

    /** Confirma o segredo pendente. `true` só para quem de fato o ativou. */
    async enable(userId, step) {
      const { affectedRows } = await db.execute(
        `UPDATE user_totp SET enabled = 1, last_step = ?, enabled_at = ?
          WHERE user_id = ? AND enabled = 0`,
        [step, Date.now(), userId]
      );
      return affectedRows === 1;
    },

    /** Anti-replay: só avança se o passo for maior que o último aceito. */
    async advanceStep(userId, step) {
      const { affectedRows } = await db.execute(
        `UPDATE user_totp SET last_step = ?
          WHERE user_id = ? AND enabled = 1 AND last_step < ?`,
        [step, userId, step]
      );
      return affectedRows === 1;
    },

    async remove(userId) {
      await db.execute('DELETE FROM recovery_codes WHERE user_id = ?', [userId]);
      await db.execute('DELETE FROM login_challenges WHERE user_id = ?', [userId]);
      await db.execute('DELETE FROM user_totp WHERE user_id = ?', [userId]);
    },

    /* ----------------------------------------------- códigos de recuperação */

    /** Troca TODOS os códigos do usuário por estes (hashes). */
    async replaceRecoveryCodes(userId, hashes) {
      await db.transaction(async (tx) => {
        await tx.execute('DELETE FROM recovery_codes WHERE user_id = ?', [userId]);
        const now = Date.now();
        for (const hash of hashes) {
          await tx.execute(
            'INSERT INTO recovery_codes (user_id, code_hash, created_at) VALUES (?, ?, ?)',
            [userId, hash, now]
          );
        }
      });
    },

    /** Gasta o código. `true` só uma vez, mesmo com duas requisições juntas. */
    async consumeRecoveryCode(userId, hash) {
      const { affectedRows } = await db.execute(
        `UPDATE recovery_codes SET used_at = ?
          WHERE user_id = ? AND code_hash = ? AND used_at IS NULL`,
        [Date.now(), userId, hash]
      );
      return affectedRows === 1;
    },

    async countUnusedRecoveryCodes(userId) {
      const row = await db.queryOne(
        'SELECT COUNT(*) AS total FROM recovery_codes WHERE user_id = ? AND used_at IS NULL',
        [userId]
      );
      return Number(row?.total ?? 0);
    },

    /* ------------------------------------------------------------ desafios */

    async createChallenge({ id, userId, expiresAt }) {
      await db.execute(
        'INSERT INTO login_challenges (id, user_id, attempts, expires_at, created_at) VALUES (?, ?, 0, ?, ?)',
        [id, userId, expiresAt, Date.now()]
      );
    },

    async findChallenge(id, now = Date.now()) {
      return db.queryOne(
        'SELECT id, user_id, attempts, expires_at FROM login_challenges WHERE id = ? AND expires_at > ?',
        [id, now]
      );
    },

    /** Conta mais uma tentativa. `false` quando o limite do desafio já acabou. */
    async bumpChallenge(id, max) {
      const { affectedRows } = await db.execute(
        'UPDATE login_challenges SET attempts = attempts + 1 WHERE id = ? AND attempts < ?',
        [id, max]
      );
      return affectedRows === 1;
    },

    /** Uso único: só quem apaga primeiro recebe `true`. */
    async consumeChallenge(id) {
      const { affectedRows } = await db.execute('DELETE FROM login_challenges WHERE id = ?', [id]);
      return affectedRows === 1;
    },

    async deleteExpiredChallenges(now = Date.now()) {
      const { affectedRows } = await db.execute(
        'DELETE FROM login_challenges WHERE expires_at <= ?',
        [now]
      );
      return affectedRows;
    },

    async deleteChallengesForUser(userId) {
      await db.execute('DELETE FROM login_challenges WHERE user_id = ?', [userId]);
    },
  };
}
