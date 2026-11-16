/* =========================================================================
   Repositório de usuários.
   Todo valor viaja como parâmetro (`?`) — nunca concatenado no SQL.
   ========================================================================= */

import { ROLES } from '../config.js';

/** Campos públicos. `password_hash` nunca sai daqui. */
const PUBLIC_FIELDS = 'id, name, company, email, phone, role, created_at';

export function usersRepository(db) {
  return {
    /** Uso interno da autenticação — único lugar que lê o hash. */
    async findByEmailWithHash(email) {
      return db.queryOne(
        `SELECT id, name, email, role, password_hash
           FROM users
          WHERE email = ?`,
        [email]
      );
    },

    /** Para conferir a senha atual (troca de senha, 2FA). Nunca sai da camada de serviço. */
    async findByIdWithHash(id) {
      return db.queryOne(
        `SELECT id, name, email, role, password_hash FROM users WHERE id = ?`,
        [id]
      );
    },

    async findById(id) {
      return db.queryOne(
        `SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`,
        [id]
      );
    },

    async existsByEmail(email) {
      const row = await db.queryOne('SELECT 1 AS found FROM users WHERE email = ?', [
        email,
      ]);
      return Boolean(row);
    },

    async create({ name, company, email, phone, passwordHash, role = ROLES.CLIENT }) {
      const now = Date.now();
      const { insertId } = await db.execute(
        `INSERT INTO users (name, company, email, phone, password_hash, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, company, email, phone, passwordHash, role, now, now]
      );
      return insertId;
    },

    async updatePasswordHash(id, passwordHash) {
      await db.execute(
        'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?',
        [passwordHash, Date.now(), id]
      );
    },

    /**
     * Listagem administrativa com busca opcional e as contagens de projetos e
     * solicitações de cada cliente.
     *
     * As contagens saem em subconsultas correlacionadas, e não em JOIN com
     * GROUP BY: com dois JOINs o produto cartesiano inflaria os dois números.
     * Também evita o N+1 de consultar contagem cliente a cliente.
     */
    async list({ search = null, limit, offset }) {
      const counts = `
        (SELECT COUNT(*) FROM client_projects cp WHERE cp.user_id = u.id)   AS projects_count,
        (SELECT COUNT(*) FROM project_requests r WHERE r.user_id = u.id)    AS requests_count`;

      const fields = PUBLIC_FIELDS.split(', ')
        .map((field) => `u.${field}`)
        .join(', ');

      if (search) {
        const term = `%${search}%`;

        /* No SQLite o LIKE já ignora maiúsculas/minúsculas; no Postgres, não —
           lá quem faz isso é o ILIKE. Buscar "ana" precisa achar "Ana". */
        const like = db.dialect === 'postgres' ? 'ILIKE' : 'LIKE';

        return db.query(
          `SELECT ${fields}, ${counts}
             FROM users u
            WHERE u.role = ?
              AND (u.name ${like} ? OR u.email ${like} ? OR u.company ${like} ?)
            ORDER BY u.created_at DESC
            LIMIT ? OFFSET ?`,
          [ROLES.CLIENT, term, term, term, limit, offset]
        );
      }

      return db.query(
        `SELECT ${fields}, ${counts}
           FROM users u
          WHERE u.role = ?
          ORDER BY u.created_at DESC
          LIMIT ? OFFSET ?`,
        [ROLES.CLIENT, limit, offset]
      );
    },

    async countClients() {
      const row = await db.queryOne(
        'SELECT COUNT(*) AS total FROM users WHERE role = ?',
        [ROLES.CLIENT]
      );
      return Number(row?.total ?? 0);
    },
  };
}
