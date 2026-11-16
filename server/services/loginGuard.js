/* =========================================================================
   Bloqueio de força bruta, por (e-mail + IP) e com espera progressiva.

   Por que não por e-mail sozinho: qualquer pessoa digitaria 5 senhas erradas
   num e-mail alheio e travaria a conta da vítima por 15 minutos. Com o IP na
   chave, quem erra é quem fica esperando.

   Depois de LOGIN_MAX_ATTEMPTS falhas dentro da janela, cada falha a mais
   dobra a espera a partir da última (30 s, 1 min, 2 min... teto = a janela).
   Pedidos feitos DURANTE a espera são recusados sem verificar a senha e não
   contam como nova falha (senão alguém travaria a si mesmo para sempre).

   Limite conhecido: quem troca de IP a cada tentativa escapa deste bloqueio;
   o teto por IP em app.js e o 2FA do admin cobrem esse caso (docs/SEGURANCA.md).
   ========================================================================= */

import { SECURITY } from '../config.js';
import { tooManyRequests } from '../http/errors.js';

/** Milissegundos de espera que a contagem `count` impõe depois de `last`. */
export function lockDuration(count) {
  if (count < SECURITY.LOGIN_MAX_ATTEMPTS) return 0;
  const exponent = count - SECURITY.LOGIN_MAX_ATTEMPTS;
  return Math.min(SECURITY.LOGIN_LOCK_BASE_MS * 2 ** Math.min(exponent, 20), SECURITY.LOGIN_WINDOW_MS);
}

export function createLoginGuard(ctx, { now = () => Date.now() } = {}) {
  return {
    /** Lança 429 enquanto (e-mail, ip) estiver esperando. */
    async assertNotLocked(email, ip) {
      const { count, last } = await ctx.loginAttempts.status(email, { ip, now: now() });
      const until = last + lockDuration(count);
      if (count >= SECURITY.LOGIN_MAX_ATTEMPTS && now() < until) {
        throw tooManyRequests(
          'Muitas tentativas. Aguarde um pouco antes de tentar novamente.',
          (until - now()) / 1000
        );
      }
    },

    async registerFailure(email, ip) {
      await ctx.loginAttempts.register(email, ip);
    },

    async clear(email, ip) {
      await ctx.loginAttempts.clear(email, ip);
    },
  };
}
