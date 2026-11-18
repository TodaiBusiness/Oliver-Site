/* =========================================================================
   Faxina periódica: sessões vencidas/paradas, tentativas de login antigas,
   desafios e tokens de recuperação expirados, auditoria além da retenção.

   Duas formas de disparo, porque nem toda hospedagem tem processo longo:
   · `server.js` agenda `run()` de hora em hora;
   · `maybeRun()` é chamado no login e roda no máximo uma vez a cada 10 min
     por instância (serve também a função serverless).
   ========================================================================= */

import { PORTAL, SECURITY } from '../config.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 10 * 60 * 1000;

export function maintenanceService(ctx, { now = () => Date.now() } = {}) {
  let lastRun = 0;

  async function run() {
    const current = now();
    lastRun = current;

    const maxIdle = Math.max(...Object.values(SECURITY.SESSION_IDLE_MS));
    const result = {
      sessionsExpired: await ctx.sessions.deleteExpired(current),
      sessionsIdle: await ctx.sessions.deleteIdleBefore(current - maxIdle),
      loginAttempts: await ctx.loginAttempts.deleteOlderThan(current - SECURITY.LOGIN_WINDOW_MS),
      challenges: await ctx.twoFactor.deleteExpiredChallenges(current),
      resets: await ctx.passwordResets.deleteExpired(current),
      portalSessions: await ctx.portal.deleteExpiredSessions(current, current - PORTAL.SESSION_IDLE_MS),
      portalResets: await ctx.portal.deleteExpiredResets(current),
      audit: 0,
    };

    if (SECURITY.AUDIT_RETENTION_DAYS > 0) {
      result.audit = await ctx.audit.deleteOlderThan(current - SECURITY.AUDIT_RETENTION_DAYS * DAY_MS);
    }
    return result;
  }

  return {
    run,

    /** Nunca lança: faxina falhando não pode derrubar um login. */
    async maybeRun() {
      if (now() - lastRun < MIN_INTERVAL_MS) return null;
      lastRun = now();
      try {
        return await run();
      } catch (error) {
        console.error('[maintenance] falhou:', error?.message);
        return null;
      }
    },
  };
}
