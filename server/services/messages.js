/* =========================================================================
   Mensagens vinculadas a uma solicitação.

   Todo acesso passa antes pela solicitação: se o visitante não pode ver a
   solicitação, não vê nem escreve mensagem nela. A verificação fica em um
   lugar só (`requestsService.getForViewer`), então não há risco de uma rota
   nova esquecer de checar.
   ========================================================================= */

import { AUDIT_ACTIONS, LIMITS, ROLES } from '../config.js';
import { tooManyRequests } from '../http/errors.js';
import { createValidator, cleanText } from '../http/validation.js';
import { NO_HOOKS } from './messageEvents.js';

export function messagesService(ctx, requests, attachments, hooks = NO_HOOKS) {
  return {
    /**
     * Caixa de mensagens: todas as conversas que o visitante pode ver.
     * Cliente vê só as dele; admin vê todas. O recorte é feito na consulta,
     * então não existe caminho para ler conversa alheia.
     */
    async listConversations(viewer, pagination) {
      const rows = await ctx.messages.listConversations({
        viewerId: viewer.id,
        ownerId: viewer.role === ROLES.ADMIN ? null : viewer.id,
        ...pagination,
      });

      return rows.map((row) => ({
        requestId: row.id,
        type: row.type,
        status: row.status,
        createdAt: row.created_at,
        client: {
          id: row.client_id,
          name: row.client_name,
          company: row.client_company,
        },
        lastMessage: row.last_body
          ? {
              body: row.last_body,
              at: row.last_at,
              mine: row.last_author_id === viewer.id,
            }
          : null,
        unread: Number(row.unread ?? 0),
      }));
    },

    async listForRequest(viewer, requestId, pagination) {
      const request = await requests.getForViewer(viewer, requestId); // autoriza ou lança 404

      const items = await ctx.messages.listForRequest(requestId, pagination);
      const lidas = await ctx.messages.markReadForReader(requestId, viewer.id);
      if (lidas > 0) {
        hooks.messagesRead({
          requestId,
          ownerId: request.user_id,
          by: viewer.role === ROLES.ADMIN ? 'team' : 'client',
        });
      }

      /* Anexos de todas as mensagens numa consulta só (sem N+1). */
      const anexos = await attachments.metaPorMensagem(items.map((m) => m.id));

      return items.map((mensagem) => ({
        ...mensagem,
        attachments: anexos.get(mensagem.id) ?? [],
      }));
    },

    async send(viewer, requestId, body, imagem = null) {
      const request = await requests.getForViewer(viewer, requestId); // autoriza ou lança 404

      /* Com imagem, o texto é opcional: mandar só a foto é legítimo. */
      const validator = createValidator();
      if (imagem) {
        validator.optionalText('body', body, {
          max: LIMITS.MESSAGE_MAX,
          label: 'a mensagem',
        });
      } else {
        validator.text('body', body, {
          min: 1,
          max: LIMITS.MESSAGE_MAX,
          label: 'a mensagem',
        });
      }
      validator.assert();

      /* Cota por usuário (o admin responde a todos e fica de fora). */
      if (viewer.role !== ROLES.ADMIN) {
        const enviadas = await ctx.messages.countByAuthorSince(viewer.id, Date.now() - 60 * 60 * 1000);
        if (enviadas >= LIMITS.MESSAGES_PER_HOUR) {
          throw tooManyRequests(
            `Você atingiu o limite de ${LIMITS.MESSAGES_PER_HOUR} mensagens por hora. Tente novamente mais tarde.`
          );
        }
      }

      const id = await ctx.messages.create({
        requestId,
        authorId: viewer.id,
        body: cleanText(body) ?? '',
      });

      /* Se a imagem for recusada, a mensagem vazia não pode ficar órfã. */
      let anexo = null;
      if (imagem) {
        try {
          anexo = await attachments.anexarNaMensagem(id, imagem, viewer);
        } catch (problema) {
          await ctx.db.execute('DELETE FROM messages WHERE id = ?', [id]);
          throw problema;
        }
      }

      await ctx.audit.log({
        userId: viewer.id,
        action: AUDIT_ACTIONS.MESSAGE_SENT,
        resourceType: 'message',
        resourceId: id,
        details: { requestId },
      });

      hooks.messageCreated({
        requestId,
        messageId: id,
        ownerId: request.user_id,
        fromTeam: viewer.role === ROLES.ADMIN,
      });

      return {
        id,
        requestId,
        authorId: viewer.id,
        body: cleanText(body) ?? '',
        attachments: anexo ? [{ ...anexo, url: `/api/attachments/${anexo.id}` }] : [],
      };
    },
  };
}
