/* =========================================================================
   Conversas para o Panel (endpoints de serviço /api/service/*).

   Quem chama é a API do Panel, já autenticada por X-Service-Key (ver
   http/serviceAuth.js e app.js). Aqui não há "dono" da conversa: qualquer admin
   do Panel lê e responde qualquer solicitação, e "lida" vale para todos.

   Regras:
   · O e-mail do cliente só sai por estes endpoints (protegidos pela chave).
   · A resposta do Panel é gravada com author_id = usuário de sistema
     "TODAI Atendimento" e o nome/guid do admin em author_external_*.
   · Texto e imagem seguem as regras do chat do site (tamanho, validação).
   ========================================================================= */

import { AUDIT_ACTIONS, LIMITS, LOGIN_DISABLED_HASH, ROLES, SYSTEM_USER } from '../config.js';
import { AppError, badRequest, notFound } from '../http/errors.js';
import { cleanText, createValidator } from '../http/validation.js';

const PREVIEW_MAX = 140;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/* Id do administrador no Panel: bigint enviado como texto ("3"); aceita também guid. */
const CLIENT_MESSAGE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const ADMIN_ID = /^[A-Za-z0-9_-]{1,64}$/;
/* Nome exibido ao cliente: sem controle (quebra de linha, NUL...) e sem < > —
   o React já escapa, mas o nome também pode ir parar em e-mail, log, PDF. */
const NAME_FORBIDDEN = /[\p{Cc}\p{Cf}<>]/u;

/** Id numérico estrito: "12" sim; "1e3", " 5", "0x10", "-1", "1.5" não. */
export function parseServiceId(raw) {
  if (typeof raw !== 'string' || !/^[1-9][0-9]{0,14}$/.test(raw)) return null;
  return Number(raw);
}

const clip = (text, max) => {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text;
};

const oneLine = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

const iso = (ms) => new Date(Number(ms)).toISOString();

export function panelConversationsService(ctx) {
  let systemUserId = null;

  /** Usuário de sistema (a migração já o cria; aqui é só a garantia). */
  async function getSystemUserId() {
    if (systemUserId) return systemUserId;
    let row = await ctx.users.findByEmailWithHash(SYSTEM_USER.EMAIL);
    if (!row) {
      try {
        await ctx.users.create({
          name: SYSTEM_USER.NAME,
          company: 'TODAI',
          email: SYSTEM_USER.EMAIL,
          phone: null,
          passwordHash: LOGIN_DISABLED_HASH,
          role: ROLES.ADMIN,
        });
      } catch {
        /* corrida com outra instância: o UNIQUE decide, e a releitura abaixo resolve. */
      }
      row = await ctx.users.findByEmailWithHash(SYSTEM_USER.EMAIL);
    }
    /* Nunca assinar com conta que não seja a de sistema de verdade (ex.: um
       cliente que se cadastrou antes com este e-mail). */
    if (!row || row.role !== ROLES.ADMIN || row.password_hash !== LOGIN_DISABLED_HASH) {
      console.error('[service] a conta de sistema', SYSTEM_USER.EMAIL, 'está inconsistente (papel ou hash).');
      throw new AppError(500, 'ERRO_INTERNO', 'Algo deu errado. Tente novamente em instantes.');
    }
    systemUserId = row.id;
    return systemUserId;
  }

  async function requireRequest(requestId) {
    const request = await ctx.requests.findByIdWithUser(requestId);
    if (!request) throw notFound('Conversa não encontrada.');
    return request;
  }

  function shapeMessage(row, attachment) {
    return {
      id: String(row.id),
      body: row.body ?? '',
      createdAt: iso(row.created_at),
      authorRole: row.author_role === ROLES.ADMIN ? 'ADMIN' : 'CLIENT',
      authorName: row.author_external_name || row.author_name,
      attachment: attachment
        ? {
            id: String(attachment.id),
            name: attachment.filename,
            contentType: attachment.mime,
            size: Number(attachment.size),
          }
        : null,
    };
  }

  async function attachmentsByMessage(rows) {
    const metas = await ctx.attachments.listMetaForMessages(rows.map((r) => r.id));
    const map = new Map();
    for (const meta of metas) if (!map.has(meta.message_id)) map.set(meta.message_id, meta);
    return map;
  }

  return {
    async listConversations(query = {}) {
      const rawLimit = Number(query.limit);
      const rawPage = Number(query.page);
      const limit =
        Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;
      const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100000) : 1;

      const rows = await ctx.messages.listConversationsForService({
        limit,
        offset: (page - 1) * limit,
      });

      return rows.map((row) => {
        const texto = oneLine(row.last_body);
        return {
          requestId: String(row.id),
          title: clip(`${row.type} — ${oneLine(row.description)}`, LIMITS.TITLE_MAX),
          status: row.status,
          clientName: row.client_name,
          clientEmail: row.client_email,
          lastMessageAt: iso(row.last_at),
          lastMessagePreview: clip(
            texto || (Number(row.last_attachments) > 0 ? '[Imagem]' : ''),
            PREVIEW_MAX
          ),
          lastAuthorName: row.last_author_name,
          lastAuthorRole: row.last_author_role === ROLES.ADMIN ? 'ADMIN' : 'CLIENT',
          unreadCount: Number(row.unread ?? 0),
        };
      });
    },

    async unreadCount() {
      return ctx.messages.countUnreadForService();
    },

    async getConversation(requestId) {
      const request = await requireRequest(requestId);
      const rows = await ctx.messages.listAllForRequest(requestId);
      const anexos = await attachmentsByMessage(rows);

      return {
        request: {
          requestId: String(request.id),
          title: clip(`${request.type} — ${oneLine(request.description)}`, LIMITS.TITLE_MAX),
          status: request.status,
          clientName: request.user_name,
          clientEmail: request.user_email,
        },
        messages: rows.map((row) => shapeMessage(row, anexos.get(row.id))),
      };
    },

    async markRead(requestId) {
      await requireRequest(requestId);
      await ctx.messages.markClientMessagesRead(requestId);
    },

    /**
     * Resposta de um admin do Panel. `adminId`/`adminName` vêm da API do Panel
     * (que os tira do administrador autenticado), mas são validados aqui do mesmo
     * jeito: o site não confia em ninguém que chega por HTTP.
     */
    async sendMessage(requestId, rawInput) {
      let input = rawInput;
      const validator = createValidator();
      validator.text('body', input.body, {
        min: 1,
        max: LIMITS.MESSAGE_MAX,
        label: 'a mensagem',
      });
      validator.text('adminName', input.adminName, {
        min: 1,
        max: LIMITS.SERVICE_ADMIN_NAME_MAX,
        label: 'o nome do administrador',
      });
      if (typeof input.adminName === 'string' && NAME_FORBIDDEN.test(input.adminName)) {
        validator.fail('adminName', 'O nome do administrador tem caracteres não permitidos.');
      }
      /* Número do JSON (3) também vale: vira texto. */
      if (typeof input.adminId === 'number' && Number.isSafeInteger(input.adminId) && input.adminId >= 0) {
        input = { ...input, adminId: String(input.adminId) };
      }
      if (typeof input.adminId !== 'string' || !ADMIN_ID.test(input.adminId)) {
        validator.fail('adminId', 'Identificador do administrador inválido.');
      }
      if (
        input.clientMessageId !== undefined &&
        input.clientMessageId !== null &&
        (typeof input.clientMessageId !== 'string' || !CLIENT_MESSAGE_ID.test(input.clientMessageId))
      ) {
        validator.fail('clientMessageId', 'Identificador de envio inválido.');
      }
      validator.assert();

      await requireRequest(requestId);

      const authorId = await getSystemUserId();
      const adminName = cleanText(input.adminName);
      const adminId = input.adminId;
      const body = cleanText(input.body);
      if (!body) throw badRequest('Informe a mensagem.');

      const clientMessageId = input.clientMessageId ?? null;
      const jaGravada = async () =>
        clientMessageId
          ? ctx.messages.findByClientMessageId(requestId, adminId, clientMessageId)
          : null;

      /* Reenvio com o mesmo clientMessageId devolve a mensagem já gravada. */
      const repetida = await jaGravada();
      if (repetida) return shapeMessage(await ctx.messages.findById(repetida.id), null);

      let id;
      try {
        id = await ctx.messages.create({
          requestId,
          authorId,
          body,
          externalId: adminId,
          externalName: adminName,
          clientMessageId,
        });
      } catch (error) {
        /* Corrida: duas chamadas iguais ao mesmo tempo; o índice único decide. */
        const duplicada = /UNIQUE constraint failed|23505|duplicate key/i.test(
          `${error?.code ?? ''} ${error?.message ?? ''}`
        );
        const existente = duplicada ? await jaGravada() : null;
        if (!existente) throw error;
        return shapeMessage(await ctx.messages.findById(existente.id), null);
      }

      /* Sem o texto da mensagem no log (só quem e onde). */
      await ctx.audit.log({
        userId: authorId,
        action: AUDIT_ACTIONS.SERVICE_MESSAGE_SENT,
        resourceType: 'message',
        resourceId: id,
        details: { requestId, adminId },
      });

      const row = await ctx.messages.findById(id);
      return shapeMessage(row, null);
    },

    /** Bytes da imagem, no mesmo formato que o download do site usa. */
    async downloadAttachment(attachmentId) {
      const anexo = await ctx.attachments.findWithRequest(attachmentId);
      if (!anexo) throw notFound('Imagem não encontrada.');
      return {
        buffer: Buffer.isBuffer(anexo.content) ? anexo.content : Buffer.from(anexo.content),
        mime: anexo.mime,
        filename: anexo.filename,
      };
    },
  };
}
