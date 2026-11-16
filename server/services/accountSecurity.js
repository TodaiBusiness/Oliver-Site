/* =========================================================================
   Segurança da própria conta: trocar senha e gerir sessões.
   ========================================================================= */

import { AUDIT_ACTIONS } from '../config.js';
import { badRequest, notFound, unauthorized } from '../http/errors.js';
import { describeUserAgent } from '../http/userAgent.js';
import { createValidator } from '../http/validation.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import { createLoginGuard } from './loginGuard.js';

/** Identificador PÚBLICO da sessão: prefixo do hash (não serve para entrar). */
const PREFIX = 16;

export function accountSecurityService(ctx, { now = () => Date.now() } = {}) {
  const guard = createLoginGuard(ctx, { now });

  return {
    /**
     * Troca a senha. Exige a atual (falha conta no bloqueio do login), aplica a
     * regra de força, derruba TODAS as outras sessões e audita.
     */
    async changePassword(user, { currentPassword, newPassword }, { ip } = {}) {
      await guard.assertNotLocked(user.email, ip);

      const account = await ctx.users.findByIdWithHash(user.id);
      const ok =
        typeof currentPassword === 'string' && currentPassword
          ? await verifyPassword(currentPassword, account?.password_hash)
          : false;

      if (!ok) {
        await guard.registerFailure(user.email, ip);
        await ctx.audit.log({
          userId: user.id,
          action: AUDIT_ACTIONS.PASSWORD_CHANGE_FAILED,
          resourceType: 'auth',
          details: { operacao: 'trocar_senha' },
          ip,
        });
        throw unauthorized('A senha atual está incorreta.');
      }

      const validator = createValidator();
      validator.password('newPassword', newPassword);
      validator.assert();
      if (newPassword === currentPassword) {
        throw badRequest('Confira os campos destacados.', {
          newPassword: 'A nova senha precisa ser diferente da atual.',
        });
      }

      await ctx.users.updatePasswordHash(user.id, await hashPassword(newPassword));
      const revoked = await ctx.sessions.deleteOthersForUser(user.id, user.sessionId);
      await ctx.twoFactor.deleteChallengesForUser(user.id);
      await ctx.passwordResets.deleteForUser(user.id);
      await guard.clear(user.email, ip);

      await ctx.audit.log({
        userId: user.id,
        action: AUDIT_ACTIONS.PASSWORD_CHANGED,
        resourceType: 'auth',
        details: { sessoesEncerradas: revoked },
        ip,
      });

      return { ok: true, revokedSessions: revoked };
    },

    async listSessions(user) {
      const rows = await ctx.sessions.listForUser(user.id, now());
      return rows.map((row) => ({
        id: row.id.slice(0, PREFIX),
        current: row.id === user.sessionId,
        device: describeUserAgent(row.user_agent),
        ip: row.ip ?? null,
        createdAt: Number(row.created_at),
        lastSeenAt: Number(row.last_seen_at ?? row.created_at),
      }));
    },

    /** Encerra uma sessão pelo id público. A atual se encerra pelo logout. */
    async revokeSession(user, publicId) {
      if (typeof publicId !== 'string' || publicId.length !== PREFIX || !/^[0-9a-f]+$/.test(publicId)) {
        throw notFound('Sessão não encontrada.');
      }
      if (user.sessionId.startsWith(publicId)) {
        throw badRequest('Esta é a sessão atual. Use "Sair" para encerrá-la.');
      }
      const removed = await ctx.sessions.deleteByPrefixForUser(user.id, publicId);
      if (!removed) throw notFound('Sessão não encontrada.');

      await ctx.audit.log({
        userId: user.id,
        action: AUDIT_ACTIONS.SESSION_REVOKED,
        resourceType: 'auth',
      });
      return { ok: true };
    },

    /** "Sair de todos os dispositivos": inclui a sessão atual. */
    async revokeAll(user) {
      const revoked = await ctx.sessions.deleteAllForUser(user.id);
      await ctx.audit.log({
        userId: user.id,
        action: AUDIT_ACTIONS.SESSIONS_REVOKED_ALL,
        resourceType: 'auth',
        details: { sessoesEncerradas: revoked },
      });
      return { ok: true, revokedSessions: revoked };
    },
  };
}
