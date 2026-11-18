/* =========================================================================
   Repositório de usuários.
   Todo valor viaja como parâmetro (`?`) — nunca concatenado no SQL.
   ========================================================================= */

import { ROLES } from '../config.js';

/** Campos públicos. `password_hash` nunca sai daqui. */
const PUBLIC_FIELDS = 'id, name, company, email, phone, role, status, created_at';

/* Subconsultas correlacionadas (sem JOIN: dois JOINs inflariam as contagens). */
const SERVICE_CLIENT_COLUMNS = `
  u.id, u.name, u.company, u.email, u.phone, u.created_at,
  u.status, u.decided_at, u.decided_by,
  (SELECT COUNT(*) FROM project_requests r WHERE r.user_id = u.id) AS request_count,
  (SELECT COUNT(*) FROM client_projects cp WHERE cp.user_id = u.id) AS project_count,
  (SELECT MAX(r.updated_at) FROM project_requests r WHERE r.user_id = u.id) AS last_request_at,
  (SELECT MAX(m.created_at) FROM messages m
     JOIN project_requests r ON r.id = m.request_id
    WHERE r.user_id = u.id) AS last_message_at`;

export function usersRepository(db) {
  return {
    /** Uso interno da autenticação — único lugar que lê o hash. */
    async findByEmailWithHash(email) {
      return db.queryOne(
        `SELECT id, name, email, role, status, password_hash
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

    /* Aviso por e-mail de resposta da equipe (coluna notify_email, padrão 1). */
    async findNotifyTarget(id) {
      return db.queryOne('SELECT id, name, email, role, notify_email FROM users WHERE id = ?', [id]);
    },

    async getNotifyEmail(id) {
      const row = await db.queryOne('SELECT notify_email FROM users WHERE id = ?', [id]);
      return row ? Boolean(Number(row.notify_email)) : null;
    },

    async setNotifyEmail(id, enabled) {
      await db.execute('UPDATE users SET notify_email = ?, updated_at = ? WHERE id = ?', [
        enabled ? 1 : 0,
        Date.now(),
        id,
      ]);
    },

    async existsByEmail(email) {
      const row = await db.queryOne('SELECT 1 AS found FROM users WHERE email = ?', [
        email,
      ]);
      return Boolean(row);
    },

    async create({ name, company, email, phone, passwordHash, role = ROLES.CLIENT, status = 'ACTIVE' }) {
      const now = Date.now();
      const { insertId } = await db.execute(
        `INSERT INTO users (name, company, email, phone, password_hash, role, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, company, email, phone, passwordHash, role, status, now, now]
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

    /* ------------------------------------------------ endpoints de serviço
       (Panel). Só role CLIENT; nunca password_hash. `term` já vem escapado
       (escapeLike) e usa ESCAPE '!'. Ordem estável: created_at desc, id desc. */

    async listClientsForService({ term = null, status = 'ACTIVE', limit, offset }) {
      const like = db.dialect === 'postgres' ? 'ILIKE' : 'LIKE';
      const params = [ROLES.CLIENT];
      let filtro = '';
      if (status) {
        filtro += 'AND u.status = ? ';
        params.push(status);
      }
      if (term) {
        const pattern = `%${term}%`;
        filtro += `AND (u.name ${like} ? ESCAPE '!' OR u.email ${like} ? ESCAPE '!' OR u.company ${like} ? ESCAPE '!')`;
        params.push(pattern, pattern, pattern);
      }
      params.push(limit, offset);
      return db.query(
        `SELECT ${SERVICE_CLIENT_COLUMNS}
           FROM users u
          WHERE u.role = ? ${filtro}
          ORDER BY u.created_at DESC, u.id DESC
          LIMIT ? OFFSET ?`,
        params
      );
    },

    async findClientForService(id) {
      return db.queryOne(
        `SELECT ${SERVICE_CLIENT_COLUMNS} FROM users u WHERE u.role = ? AND u.id = ?`,
        [ROLES.CLIENT, id]
      );
    },

    /**
     * Decisão do admin, atômica: só muda se o estado atual ainda é um dos
     * `from`. Devolve true se ESTA chamada fez a transição.
     */
    async decide(id, { from, to, by, note = null, at = Date.now() }) {
      const marks = from.map(() => '?').join(', ');
      const { affectedRows } = await db.execute(
        `UPDATE users
            SET status = ?, decided_at = ?, decided_by = ?, decision_note = ?, updated_at = ?
          WHERE id = ? AND role = ? AND status IN (${marks})`,
        [to, at, by, note, at, id, ROLES.CLIENT, ...from]
      );
      return affectedRows > 0;
    },

    async countByStatus(status) {
      const row = await db.queryOne(
        'SELECT COUNT(*) AS total FROM users WHERE role = ? AND status = ?',
        [ROLES.CLIENT, status]
      );
      return Number(row?.total ?? 0);
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
