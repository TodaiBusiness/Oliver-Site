/* =========================================================================
   Anexos de imagem no chat.

   Segurança em três camadas:
   1. AUTORIZAÇÃO — quem não pode ver a solicitação não envia nem baixa a
      imagem dela. A checagem reusa `requests.getForViewer`, o mesmo ponto
      único usado pelas mensagens.
   2. CONTEÚDO — o tipo é descoberto pelos bytes (`validarImagemBase64`), não
      pelo que o navegador declarou. Arquivo que não é imagem é recusado.
   3. ENTREGA — o download responde com o tipo detectado + `nosniff` +
      `Content-Disposition: inline`, para o navegador nunca tratar o arquivo
      como HTML/script.
   ========================================================================= */

import { LIMITS, ROLES } from '../config.js';
import { badRequest, notFound, tooManyRequests } from '../http/errors.js';
import { validarImagemBase64 } from '../security/imageValidation.js';

/** No máximo uma imagem por mensagem — mantém o payload previsível. */
const MAX_POR_MENSAGEM = 1;

export function attachmentsService(ctx, requests) {
  return {
    /** Valida e grava a imagem de uma mensagem recém-criada. */
    async anexarNaMensagem(messageId, imagem, viewer = null) {
      if (!imagem) return null;

      if ((await ctx.attachments.countForMessage(messageId)) >= MAX_POR_MENSAGEM) {
        throw badRequest('Só é possível anexar uma imagem por mensagem.');
      }

      let validada;
      try {
        validada = validarImagemBase64({
          dataBase64: imagem.dataBase64,
          filename: imagem.filename,
        });
      } catch (problema) {
        /* Mensagem do validador é escrita para o usuário final. */
        throw badRequest(problema.message);
      }

      /* Cota diária por usuário (quantidade e bytes): o anexo é BLOB no banco. */
      if (viewer && viewer.role !== ROLES.ADMIN) {
        const uso = await ctx.attachments.usageByAuthorSince(viewer.id, Date.now() - 24 * 60 * 60 * 1000);
        if (
          uso.count >= LIMITS.ATTACHMENTS_PER_DAY ||
          uso.bytes + validada.size > LIMITS.ATTACHMENT_BYTES_PER_DAY
        ) {
          throw tooManyRequests('Você atingiu o limite diário de imagens enviadas. Tente novamente amanhã.');
        }
      }

      const id = await ctx.attachments.create({
        messageId,
        filename: validada.filename,
        mime: validada.mime,
        size: validada.size,
        content: validada.buffer,
      });

      return {
        id,
        filename: validada.filename,
        mime: validada.mime,
        size: validada.size,
      };
    },

    /** Metadados dos anexos de uma lista de mensagens (sem os bytes). */
    async metaPorMensagem(messageIds) {
      const linhas = await ctx.attachments.listMetaForMessages(messageIds);

      const porMensagem = new Map();
      for (const linha of linhas) {
        const lista = porMensagem.get(linha.message_id) ?? [];
        lista.push({
          id: linha.id,
          filename: linha.filename,
          mime: linha.mime,
          size: linha.size,
          url: `/api/attachments/${linha.id}`,
        });
        porMensagem.set(linha.message_id, lista);
      }
      return porMensagem;
    },

    /**
     * Conteúdo para download, já autorizado.
     * Devolve `{ buffer, mime, filename }` ou lança 404 — inclusive quando o
     * anexo existe mas é de outra pessoa (não confirmamos a existência).
     */
    async baixar(viewer, attachmentId) {
      const anexo = await ctx.attachments.findWithRequest(attachmentId);
      if (!anexo) throw notFound('Imagem não encontrada.');

      /* Lança 404 se o visitante não puder ver a solicitação. */
      await requests.getForViewer(viewer, anexo.request_id);

      return {
        buffer: Buffer.isBuffer(anexo.content)
          ? anexo.content
          : Buffer.from(anexo.content),
        mime: anexo.mime,
        filename: anexo.filename,
        size: anexo.size,
      };
    },

    get limiteBytes() {
      return LIMITS.UPLOAD_MAX_BYTES;
    },
  };
}
