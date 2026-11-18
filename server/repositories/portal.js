/* =========================================================================
   Repositório do portal da loja: contas, sessões e recuperações de senha.
   Toda consulta leva `store_slug`: a mesma pessoa pode ter conta em duas lojas
   e cada uma é independente (e-mail único POR LOJA). A sessão guarda o hash do
   token, nunca o token.
   ========================================================================= */

export function portalRepository(db) {
  return {
    /* ------------------------------------------------------------ contas */
    async createAccount({
      id,
      slug,
      name,
      email,
      phone,
      document = null,
      businessName = null,
      address = {},
      passwordHash,
      consentAt,
    }) {
      const now = Date.now();
      await db.execute(
        `INSERT INTO portal_accounts
           (id, store_slug, name, email, phone, document, business_name, address,
            password_hash, consent_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, slug, name, email, phone, document, businessName, JSON.stringify(address), passwordHash, consentAt, now, now]
      );
    },

    async findByEmail(slug, email) {
      return db.queryOne('SELECT * FROM portal_accounts WHERE store_slug = ? AND email = ?', [slug, email]);
    },

    async findById(slug, id) {
      return db.queryOne('SELECT * FROM portal_accounts WHERE store_slug = ? AND id = ?', [slug, id]);
    },

    async updatePasswordHash(slug, id, passwordHash) {
      await db.execute(
        'UPDATE portal_accounts SET password_hash = ?, updated_at = ? WHERE store_slug = ? AND id = ?',
        [passwordHash, Date.now(), slug, id]
      );
    },

    async updateProfile(slug, id, { name, phone, address }) {
      await db.execute(
        'UPDATE portal_accounts SET name = ?, phone = ?, address = ?, updated_at = ? WHERE store_slug = ? AND id = ?',
        [name, phone, JSON.stringify(address ?? {}), Date.now(), slug, id]
      );
    },

    async deleteAccount(slug, id) {
      await db.execute('DELETE FROM portal_accounts WHERE store_slug = ? AND id = ?', [slug, id]);
    },

    /* ----------------------------------------------------------- sessões */
    async createSession({ id, slug, accountId, expiresAt, ip = null, userAgent = null }) {
      const now = Date.now();
      await db.execute(
        `INSERT INTO portal_sessions (id, store_slug, account_id, expires_at, created_at, last_seen_at, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, slug, accountId, expiresAt, now, now, ip, userAgent]
      );
    },

    /** A sessão só vale na loja em que nasceu: `store_slug` das DUAS tabelas confere. */
    async findValidSession(id, slug, now = Date.now()) {
      return db.queryOne(
        `SELECT s.id AS session_id, s.expires_at, s.last_seen_at,
                a.id AS account_id, a.name, a.email, a.phone, a.document,
                a.business_name, a.address
           FROM portal_sessions s
           JOIN portal_accounts a ON a.id = s.account_id AND a.store_slug = s.store_slug
          WHERE s.id = ? AND s.store_slug = ? AND s.expires_at > ?`,
        [id, slug, now]
      );
    },

    async touchSession(id, now = Date.now()) {
      await db.execute('UPDATE portal_sessions SET last_seen_at = ? WHERE id = ?', [now, id]);
    },

    async deleteSession(id) {
      await db.execute('DELETE FROM portal_sessions WHERE id = ?', [id]);
    },

    async deleteSessionsForAccount(slug, accountId) {
      const { affectedRows } = await db.execute(
        'DELETE FROM portal_sessions WHERE store_slug = ? AND account_id = ?',
        [slug, accountId]
      );
      return affectedRows;
    },

    async deleteExpiredSessions(now = Date.now(), idleBefore = 0) {
      const { affectedRows } = await db.execute(
        'DELETE FROM portal_sessions WHERE expires_at <= ? OR last_seen_at <= ?',
        [now, idleBefore]
      );
      return affectedRows;
    },

    /* ------------------------------------------------------- recuperação */
    /** Invalida os anteriores da conta e grava o novo. */
    async replaceReset({ id, slug, accountId, expiresAt }) {
      await db.transaction(async (tx) => {
        await tx.execute('DELETE FROM portal_resets WHERE store_slug = ? AND account_id = ?', [slug, accountId]);
        await tx.execute(
          'INSERT INTO portal_resets (id, store_slug, account_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)',
          [id, slug, accountId, expiresAt, Date.now()]
        );
      });
    },

    async findValidReset(id, slug, now = Date.now()) {
      return db.queryOne(
        'SELECT id, account_id FROM portal_resets WHERE id = ? AND store_slug = ? AND used_at IS NULL AND expires_at > ?',
        [id, slug, now]
      );
    },

    /** Uso único: só quem marcar primeiro recebe `true`. */
    async consumeReset(id, slug, now = Date.now()) {
      const { affectedRows } = await db.execute(
        'UPDATE portal_resets SET used_at = ? WHERE id = ? AND store_slug = ? AND used_at IS NULL AND expires_at > ?',
        [now, id, slug, now]
      );
      return affectedRows === 1;
    },

    async deleteResetsForAccount(slug, accountId) {
      await db.execute('DELETE FROM portal_resets WHERE store_slug = ? AND account_id = ?', [slug, accountId]);
    },

    async deleteExpiredResets(now = Date.now()) {
      const { affectedRows } = await db.execute(
        'DELETE FROM portal_resets WHERE expires_at <= ? OR used_at IS NOT NULL',
        [now]
      );
      return affectedRows;
    },
  };
}
