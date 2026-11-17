/* =========================================================================
   Recuperação de senha por e-mail.

   · /forgot responde SEMPRE igual (existindo a conta ou não) e leva sempre o
     mesmo tempo mínimo: a resposta não enumera e-mails.
   · Token: 32 bytes aleatórios, no banco só o SHA-256, vale 30 min e uma vez;
     pedir outro invalida o anterior.
   · /reset troca a senha (mesma regra de força), derruba TODAS as sessões e
     apaga desafios de 2FA. O 2FA do admin NÃO é tocado: o próximo login ainda
     pede o segundo fator.
   · O token viaja no FRAGMENTO do link (#token=...): não vai na requisição de
     página, no Referer nem em analytics.
   ========================================================================= */

import { randomBytes } from 'node:crypto';
import { AUDIT_ACTIONS, SECURITY, config } from '../config.js';
import { badRequest } from '../http/errors.js';
import { createValidator, normalizeEmail } from '../http/validation.js';
import { hashPassword, isLoginDisabled } from '../security/password.js';
import { hashToken } from '../security/tokens.js';

export function passwordResetService(
  ctx,
  { mailer, siteUrl = config.site.publicUrl, minDurationMs = 1200, now = () => Date.now() }
) {
  const baseUrl = (siteUrl || 'http://localhost:5173').replace(/\/+$/, '');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function sendLink(user) {
    const token = randomBytes(32).toString('base64url');
    await ctx.passwordResets.replaceForUser({
      id: hashToken(token),
      userId: user.id,
      expiresAt: now() + SECURITY.PASSWORD_RESET_TTL_MS,
    });
    const link = `${baseUrl}/redefinir-senha#token=${token}`;
    await mailer.send({
      to: user.email,
      subject: 'Redefinir sua senha - TODAI',
      text:
        `Olá, ${user.name}.\n\n` +
        'Recebemos um pedido para redefinir a senha da sua conta. Use o link abaixo em até 30 minutos:\n\n' +
        `${link}\n\n` +
        'Se você não pediu isso, ignore este e-mail: sua senha continua a mesma.\n',
    });
  }

  return {
    get available() {
      return mailer.configured;
    },

    /**
     * Sempre resolve sem informar se a conta existe. `allowed=false` (limite por
     * e-mail estourado) também resolve igual, só que sem enviar nada.
     */
    async requestReset(rawEmail, { allowed = true, ip } = {}) {
      const started = Date.now();
      const email = normalizeEmail(rawEmail);

      const work = async () => {
        if (!(allowed && email && email.length <= 190)) return;
        try {
          const user = await ctx.db.queryOne(
            'SELECT id, name, email, password_hash FROM users WHERE email = ?',
            [email]
          );
          if (user && !isLoginDisabled(user.password_hash)) {
            await sendLink(user);
            await ctx.audit.log({
              userId: user.id,
              action: AUDIT_ACTIONS.PASSWORD_RESET_REQUESTED,
              resourceType: 'auth',
              ip,
            });
          }
        } catch (error) {
          /* Falha de envio não pode mudar a resposta (nem o tempo, abaixo). */
          console.error('[reset] falha ao enviar:', error?.message);
        }
      };

      /* O tempo de resposta nunca passa do piso: se o provedor de e-mail estiver
         lento, a resposta sai no piso e o envio termina em segundo plano. Assim
         conta existente e inexistente demoram o mesmo. */
      await Promise.race([work(), sleep(minDurationMs)]);

      const rest = minDurationMs - (Date.now() - started);
      if (rest > 0) await sleep(rest);
    },

    async reset({ token, password }, { ip } = {}) {
      const validator = createValidator();
      validator.password('password', password);
      validator.assert();

      const invalid = () => badRequest('Este link é inválido ou já expirou. Peça um novo.');
      if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw invalid();

      const id = hashToken(token);
      const row = await ctx.passwordResets.findValid(id, now());
      if (!row) throw invalid();

      const newHash = await hashPassword(password);

      /* Uso único decidido pelo banco: duas requisições com o mesmo link, uma só passa. */
      if (!(await ctx.passwordResets.consume(id, now()))) throw invalid();

      const user = await ctx.users.findById(row.user_id);
      await ctx.users.updatePasswordHash(row.user_id, newHash);
      const revoked = await ctx.sessions.deleteAllForUser(row.user_id);
      await ctx.twoFactor.deleteChallengesForUser(row.user_id);
      await ctx.passwordResets.deleteForUser(row.user_id);
      if (user) await ctx.loginAttempts.clear(user.email);

      await ctx.audit.log({
        userId: row.user_id,
        action: AUDIT_ACTIONS.PASSWORD_RESET,
        resourceType: 'auth',
        details: { sessoesEncerradas: revoked },
        ip,
      });
      return { ok: true };
    },
  };
}
