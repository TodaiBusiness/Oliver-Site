/* =========================================================================
   Aviso por e-mail quando a EQUIPE responde ao cliente.

   Regras:
   · Só para mensagem de author ADMIN (admin do site ou resposta do Panel).
   · Só se users.notify_email = 1 (padrão) e o Resend estiver configurado
     (RESEND_API_KEY + MAIL_FROM); sem ele, registra UMA vez e segue.
   · Um e-mail por "rajada": se já existe outra mensagem da equipe NÃO LIDA
     nesta solicitação nos últimos 15 min, não envia outro.
   · O corpo NÃO leva o texto da mensagem (e-mail não é canal seguro): só o
     aviso e o link para o site, que exige login.
   · O link vem de SITE_PUBLIC_URL, que precisa ser https e (havendo origens
     permitidas) estar entre elas; nunca é montado com dado do pedido.
   · Falha de envio nunca falha nem atrasa a mensagem: quem chama dispara sem
     `await` (ver createMessageHooks) e aqui tudo é capturado.
   ========================================================================= */

import { ROLES, config } from '../config.js';

export const NOTIFY_WINDOW_MS = 15 * 60 * 1000;
export const NOTIFY_SUBJECT = 'Você recebeu uma resposta da TODAI';

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Primeiro nome, sem caracteres de controle nem < > (vai para o e-mail). */
export function firstName(name) {
  const clean = String(name ?? '')
    .replace(/[\p{Cc}\p{Cf}<>]/gu, ' ')
    .trim()
    .split(/\s+/)[0];
  return Array.from(clean).slice(0, 40).join('');
}

/**
 * Origem pública validada, ou null. https obrigatório, sem usuário/senha, e
 * dentro das origens permitidas do site quando elas estão configuradas.
 */
export function safePublicOrigin(siteUrl, allowedOrigins = []) {
  if (typeof siteUrl !== 'string' || !siteUrl.trim()) return null;
  let url;
  try {
    url = new URL(siteUrl.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (allowedOrigins.length && !allowedOrigins.includes(url.origin)) return null;
  return url.origin;
}

export function buildEmail({ name, link }) {
  const hello = firstName(name) ? `Olá, ${firstName(name)}.` : 'Olá.';
  const footer = 'Para parar de receber estes avisos, desligue em Conta > Segurança.';
  const text =
    `${hello}\n\nA equipe da TODAI respondeu à sua solicitação.\n` +
    `Para ler, entre na sua conta:\n${link}\n\n--\n${footer}\n`;
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;color:#14181f;line-height:1.5">` +
    `<p>${escapeHtml(hello)}</p>` +
    `<p>A equipe da TODAI respondeu à sua solicitação.</p>` +
    `<p><a href="${escapeHtml(link)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;` +
    `padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">Ler resposta</a></p>` +
    `<p style="font-size:13px;color:#5b6575">Se o botão não abrir, copie este endereço:<br>${escapeHtml(link)}</p>` +
    `<hr style="border:none;border-top:1px solid #e3e7ee"><p style="font-size:12px;color:#5b6575">${escapeHtml(footer)}</p></div>`;
  return { subject: NOTIFY_SUBJECT, text, html };
}

export function messageNotifyService(
  ctx,
  {
    mailer,
    siteUrl = config.site.publicUrl,
    allowedOrigins = [],
    windowMs = NOTIFY_WINDOW_MS,
    now = () => Date.now(),
    log = (text) => console.log(text),
    logError = (text) => console.error(text),
  } = {}
) {
  const loggedOnce = new Set();
  const once = (key, text) => {
    if (loggedOnce.has(key)) return;
    loggedOnce.add(key);
    log(text);
  };

  return {
    /**
     * Devolve o motivo: 'sent' | 'disabled' | 'no-url' | 'opted-out' | 'recent' |
     * 'no-user' | 'failed'. Nunca lança.
     */
    async notifyTeamMessage({ requestId, messageId, ownerId }) {
      try {
        if (!mailer?.live) {
          once('off', '[messageNotify] e-mail desligado (sem RESEND_API_KEY/MAIL_FROM): avisos de resposta não serão enviados.');
          return 'disabled';
        }
        const origin = safePublicOrigin(siteUrl, allowedOrigins);
        if (!origin) {
          once('url', '[messageNotify] SITE_PUBLIC_URL ausente, sem https ou fora das origens permitidas: avisos não serão enviados.');
          return 'no-url';
        }

        const target = await ctx.users.findNotifyTarget(ownerId);
        if (!target || target.role === ROLES.ADMIN) return 'no-user';
        if (!Number(target.notify_email)) return 'opted-out';

        /* Outra mensagem da equipe, ainda não lida, na janela: o cliente já
           foi avisado desta rajada. `id <` torna a regra determinística
           quando duas respostas chegam juntas (só a primeira avisa). */
        const outra = await ctx.db.queryOne(
          `SELECT COUNT(*) AS total
             FROM messages m
             JOIN users a ON a.id = m.author_id
            WHERE m.request_id = ? AND a.role = ? AND m.is_read = 0
              AND m.created_at > ? AND m.id < ?`,
          [requestId, ROLES.ADMIN, now() - windowMs, messageId]
        );
        if (Number(outra?.total ?? 0) > 0) return 'recent';

        const link = `${origin}/cliente/mensagens/${Number(requestId)}`;
        await mailer.send({ to: target.email, ...buildEmail({ name: target.name, link }) });
        return 'sent';
      } catch (error) {
        /* Sem endereço nem texto no log: só que falhou e por quê. */
        logError(`[messageNotify] envio falhou: ${error?.message ?? error}`);
        return 'failed';
      }
    },
  };
}
