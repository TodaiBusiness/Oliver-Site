/* =========================================================================
   Envio de e-mail (interface pluggable).

   · RESEND_API_KEY + MAIL_FROM: envia pela API HTTP do Resend (fetch, sem lib).
   · Sem chave, fora de produção: NÃO envia; escreve o e-mail no console para o
     desenvolvedor copiar o link.
   · Sem chave em produção: `configured` é false e `send` lança 503 — nunca
     escreve o conteúdo (que traz um link de acesso) no log do servidor.

   Quem usa: `mailer.send({ to, subject, text })`. Trocar de provedor é trocar
   só este arquivo.
   ========================================================================= */

import { AppError } from '../http/errors.js';
import { config } from '../config.js';

const RESEND_URL = 'https://api.resend.com/emails';

export function createMailer({
  apiKey = config.mail.resendApiKey,
  from = config.mail.from,
  isProduction = config.isProduction,
  fetchImpl = globalThis.fetch,
  log = (text) => console.log(text),
  timeoutMs = 4000,
} = {}) {
  const live = Boolean(apiKey && from);

  return {
    /** Há como entregar (provedor real, ou modo de desenvolvimento)? */
    configured: live || !isProduction,
    live,

    async send({ to, subject, text }) {
      if (live) {
        const response = await fetchImpl(RESEND_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to: [to], subject, text }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new Error(`Resend respondeu ${response.status}`);
        return;
      }

      if (isProduction) {
        throw new AppError(503, 'EMAIL_INDISPONIVEL', 'O envio de e-mail não está configurado.');
      }

      log(
        `\n[mailer:dev] E-mail NÃO enviado (sem RESEND_API_KEY). Conteúdo:\n` +
          `  Para: ${to}\n  Assunto: ${subject}\n${text}\n`
      );
    },
  };
}
