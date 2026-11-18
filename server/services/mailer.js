/* =========================================================================
   Envio de e-mail (interface pluggable).

   · RESEND_API_KEY + MAIL_FROM: envia pela API HTTP do Resend (fetch, sem lib).
   · Sem chave, fora de produção: NÃO envia; escreve o e-mail no console para o
     desenvolvedor copiar o link.
   · Sem chave em produção: `configured` é false e `send` lança 503 — nunca
     escreve o conteúdo (que traz um link de acesso) no log do servidor.

   Quem usa: `mailer.send({ to, subject, text, html?, fromName?, replyTo? })`.
   `html` é opcional (o `text` segue como alternativa). `fromName` troca só o
   NOME de exibição do remetente (o endereço continua o de MAIL_FROM, o único
   verificado no provedor); `replyTo` leva as respostas para outro endereço.
   Trocar de provedor é trocar só este arquivo.
   ========================================================================= */

import { AppError } from '../http/errors.js';
import { config } from '../config.js';

const RESEND_URL = 'https://api.resend.com/emails';

/** Nome de exibição seguro para cabeçalho: sem aspas, <>, quebras de linha e controle. */
export function cleanDisplayName(name, max = 60) {
  return String(name ?? '')
    .replace(/[\u0000-\u001f\u007f"<>\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** `Loja X via TODAI <no-reply@dominio>`: troca o nome e mantém o endereço de `from`. */
export function composeFrom(from, displayName) {
  const name = cleanDisplayName(displayName);
  if (!name) return from;
  const address = /<([^<>\s]+@[^<>\s]+)>/.exec(from)?.[1] ?? from.trim();
  if (!/^[^\s@<>]+@[^\s@<>]+$/.test(address)) return from;
  return `${name} <${address}>`;
}

/** Assunto numa linha só: quebra de linha em cabeçalho é injeção. */
const oneLine = (value) => String(value ?? '').replace(/[\r\n]+/g, ' ').trim();

const SIMPLE_EMAIL = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]{2,}$/;

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

    async send({ to, subject, text, html, fromName, replyTo }) {
      if (live) {
        const reply = typeof replyTo === 'string' && SIMPLE_EMAIL.test(replyTo.trim()) ? replyTo.trim() : null;
        const response = await fetchImpl(RESEND_URL, {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: composeFrom(from, fromName),
            to: [to],
            subject: oneLine(subject),
            text,
            ...(html ? { html } : {}),
            ...(reply ? { reply_to: reply } : {}),
          }),
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
          `  Para: ${to}${fromName ? `\n  De: ${cleanDisplayName(fromName)}` : ''}\n  Assunto: ${subject}\n${text}\n`
      );
    },
  };
}
