/* =========================================================================
   Trilha de auditoria e controle de tentativas de login.

   O que NUNCA entra aqui: senha, hash de senha, token de sessão, segredo TOTP,
   código de recuperação, nem o e-mail digitado num login falho (referência
   opaca em vez disso).

   IP e user agent vêm do contexto da requisição (`requestContext.js`), de modo
   que todo serviço que audita passa a gravá-los sem mudar. A retenção é
   aplicada por `maintenance.js` (SECURITY.AUDIT_RETENTION_DAYS).
   ========================================================================= */

import { SECURITY } from '../config.js';
import { currentRequest } from '../http/requestContext.js';
import { clipUserAgent } from '../http/userAgent.js';

export function auditRepository(db) {
  return {
    async log({
      userId = null,
      action,
      resourceType = null,
      resourceId = null,
      details = null,
      ip,
      userAgent,
    }) {
      const request = currentRequest();
      await db.execute(
        `INSERT INTO audit_logs
           (user_id, action, resource_type, resource_id, details, created_at, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          action,
          resourceType,
          resourceId === null ? null : String(resourceId),
          details === null ? null : JSON.stringify(details),
          Date.now(),
          (ip ?? request.ip ?? null)?.toString().slice(0, 64) ?? null,
          clipUserAgent(userAgent ?? request.userAgent),
        ]
      );
    },

    async list({ limit, offset }) {
      return db.query(
        `SELECT a.id, a.user_id, a.action, a.resource_type, a.resource_id,
                a.details, a.created_at, a.ip, a.user_agent, u.name AS user_name
           FROM audit_logs a
           LEFT JOIN users u ON u.id = a.user_id
          ORDER BY a.created_at DESC
          LIMIT ? OFFSET ?`,
        [limit, offset]
      );
    },

    /**
     * Leitura do Panel. Só colunas que podem sair (sem user_agent). `term` já
     * escapado (escapeLike, ESCAPE '!'); busca em ação, recurso, nome do usuário
     * e no nome do ator gravado em details (nunca no resto do details).
     */
    async listForService({ action = null, term = null, limit, offset }) {
      const like = db.dialect === 'postgres' ? 'ILIKE' : 'LIKE';
      const where = [];
      const params = [];
      if (action) {
        where.push('a.action = ?');
        params.push(action);
      }
      if (term) {
        const pattern = `%${term}%`;
        where.push(
          `(a.action ${like} ? ESCAPE '!' OR a.resource_type ${like} ? ESCAPE '!'
            OR a.resource_id ${like} ? ESCAPE '!' OR u.name ${like} ? ESCAPE '!'
            OR a.details ${like} ? ESCAPE '!')`
        );
        params.push(pattern, pattern, pattern, pattern, `%"actorName":"%${term}%`);
      }
      params.push(limit, offset);
      return db.query(
        `SELECT a.id, a.action, a.resource_type, a.resource_id, a.details,
                a.created_at, a.ip, u.name AS user_name
           FROM audit_logs a
           LEFT JOIN users u ON u.id = a.user_id
          ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY a.id DESC
          LIMIT ? OFFSET ?`,
        params
      );
    },

    async deleteOlderThan(timestamp) {
      const { affectedRows } = await db.execute(
        'DELETE FROM audit_logs WHERE created_at <= ?',
        [timestamp]
      );
      return affectedRows;
    },
  };
}

const NO_IP = 'desconhecido';

export function loginAttemptsRepository(db) {
  return {
    async register(email, ip = NO_IP) {
      await db.execute(
        'INSERT INTO login_attempts (email, created_at, ip) VALUES (?, ?, ?)',
        [email, Date.now(), ip ?? NO_IP]
      );
    },

    /**
     * Falhas recentes: `{ count, last }`. Com `ip`, só as daquele endereço
     * (é o que decide o bloqueio); sem, as de todos.
     */
    async status(email, { ip = null, now = Date.now() } = {}) {
      const since = now - SECURITY.LOGIN_WINDOW_MS;
      const row = ip
        ? await db.queryOne(
            `SELECT COUNT(*) AS total, MAX(created_at) AS last
               FROM login_attempts WHERE email = ? AND ip = ? AND created_at > ?`,
            [email, ip, since]
          )
        : await db.queryOne(
            `SELECT COUNT(*) AS total, MAX(created_at) AS last
               FROM login_attempts WHERE email = ? AND created_at > ?`,
            [email, since]
          );
      return { count: Number(row?.total ?? 0), last: Number(row?.last ?? 0) };
    },

    /** Tentativas falhas recentes para este e-mail (de todos os IPs, ou de um). */
    async countRecent(email, { ip = null, now = Date.now() } = {}) {
      return (await this.status(email, { ip, now })).count;
    },

    /** Login bem-sucedido zera o contador daquele e-mail naquele IP. */
    async clear(email, ip = null) {
      if (ip) {
        await db.execute('DELETE FROM login_attempts WHERE email = ? AND ip = ?', [email, ip]);
      } else {
        await db.execute('DELETE FROM login_attempts WHERE email = ?', [email]);
      }
    },

    async deleteOlderThan(timestamp) {
      const { affectedRows } = await db.execute(
        'DELETE FROM login_attempts WHERE created_at <= ?',
        [timestamp]
      );
      return affectedRows;
    },
  };
}
