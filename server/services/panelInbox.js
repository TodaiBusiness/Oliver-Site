/* =========================================================================
   Caixa de conversas do Panel: arquivar/desarquivar, feed de mudanças e modelos
   de resposta (endpoints /api/service/conversations/... e /api/service/templates).

   Quem chama é a API do Panel, já autenticada por X-Service-Key. Ator
   (actorId/actorName) validado como nas demais rotas de serviço e gravado na
   auditoria (userId = usuário de sistema). Texto de modelo é texto puro: o site
   só guarda; nada aqui é interpretado como HTML. O corpo do modelo NUNCA vai
   para a auditoria.
   ========================================================================= */

import { AppError, badRequest, notFound } from '../http/errors.js';
import { createValidator } from '../http/validation.js';
import { panelInboxRepository, TEMPLATES_MAX } from '../repositories/panelInbox.js';
import { createSystemUserResolver } from './panelConversations.js';
import { actorOf } from './panelProjects.js';

export const TEMPLATE_TITLE_MAX = 60;
export const TEMPLATE_BODY_MAX = 2000;
export const CHANGES_MAX = 200;
/* Sobreposição do cursor: uma mudança gravada logo depois de a consulta ler o relógio
   (outra conexão, commit atrasado) ainda aparece na próxima. Repetir id é inofensivo. */
export const CURSOR_OVERLAP_MS = 2000;

const ACTIONS = Object.freeze({
  ARCHIVED: 'CONVERSA_ARQUIVADA',
  UNARCHIVED: 'CONVERSA_DESARQUIVADA',
  TEMPLATE_CREATED: 'MODELO_RESPOSTA_CRIADO',
  TEMPLATE_UPDATED: 'MODELO_RESPOSTA_EDITADO',
  TEMPLATE_DELETED: 'MODELO_RESPOSTA_EXCLUIDO',
});

const iso = (ms) => new Date(Number(ms)).toISOString();
/* Título: nenhum controle. Corpo: controle só se for tab/quebra de linha. */
const CONTROL = /\p{Cc}/u;
const CONTROL_EXCEPT_WS = /[^\P{Cc}\t\n\r]/u;

export const encodeCursor = (ms) => Buffer.from(`c1.${Math.max(0, Math.trunc(ms))}`).toString('base64url');

/** Cursor opaco → ms, ou null se não for um cursor nosso. */
export function decodeCursor(raw) {
  if (typeof raw !== 'string' || !/^[A-Za-z0-9_-]{4,40}$/.test(raw)) return null;
  const match = /^c1\.(\d{1,15})$/.exec(Buffer.from(raw, 'base64url').toString('utf8'));
  return match ? Number(match[1]) : null;
}

export function panelInboxService(ctx) {
  const repo = panelInboxRepository(ctx.db);
  const getSystemUserId = createSystemUserResolver(ctx);

  const audit = async (action, resourceType, resourceId, details) =>
    ctx.audit.log({ userId: await getSystemUserId(), action, resourceType, resourceId, details });

  const shapeTemplate = (row) => ({
    id: String(row.id),
    title: row.title,
    body: row.body,
    updatedAt: iso(row.updated_at),
    updatedByName: row.updated_by_name,
  });

  /** Ator + title/body do objeto completo (POST e PUT): todos os erros de campo juntos. Texto puro: só recusa controle. */
  function templateInput(input) {
    const validator = createValidator();
    let actor = null;
    try {
      actor = actorOf(input);
    } catch (error) {
      if (!error.details) throw error;
      for (const [field, message] of Object.entries(error.details)) validator.fail(field, message);
    }
    validator.text('title', input?.title, { min: 1, max: TEMPLATE_TITLE_MAX, label: 'o título' });
    validator.text('body', input?.body, { min: 1, max: TEMPLATE_BODY_MAX, label: 'o texto do modelo' });
    if (typeof input?.title === 'string' && CONTROL.test(input.title)) {
      validator.fail('title', 'O título tem caracteres não permitidos.');
    }
    if (typeof input?.body === 'string' && CONTROL_EXCEPT_WS.test(input.body)) {
      validator.fail('body', 'O texto tem caracteres não permitidos.');
    }
    validator.assert();
    return { actor, title: input.title.trim(), body: input.body.trim() };
  }

  async function requireRequest(requestId) {
    const row = await ctx.requests.findByIdWithUser(requestId);
    if (!row) throw notFound('Conversa não encontrada.');
  }

  async function setArchived(requestId, input, archived) {
    const actor = actorOf(input);
    await requireRequest(requestId);
    const changed = await repo.setArchived(requestId, archived);
    /* Já estava no estado pedido: idempotente, sem auditoria nova. */
    if (changed) {
      await audit(archived ? ACTIONS.ARCHIVED : ACTIONS.UNARCHIVED, 'request', requestId, {
        requestId,
        ...actor,
      });
    }
  }

  async function requireTemplate(id) {
    const row = await repo.findTemplate(id);
    if (!row) throw notFound('Modelo não encontrado.');
    return row;
  }

  return {
    archive: (requestId, input) => setArchived(requestId, input, true),
    unarchive: (requestId, input) => setArchived(requestId, input, false),

    /**
     * Feed barato para o Panel consultar a cada poucos segundos. O cursor é só um
     * instante (ms) menos a sobreposição; sem `since` volta só cursor e contagem.
     * Com mais de 200 mudanças, devolve as 200 mais antigas e o cursor para logo
     * antes da última: a chamada seguinte continua dali (nada se perde).
     */
    async changes(query = {}) {
      const now = Date.now();
      let since = null;
      if (query.since !== undefined && query.since !== '') {
        since = decodeCursor(query.since);
        if (since === null) {
          throw badRequest('Confira os campos destacados.', { since: 'Cursor inválido.' });
        }
      }

      const base = now - CURSOR_OVERLAP_MS;
      const unreadCount = await repo.countUnread();
      if (since === null) return { cursor: encodeCursor(base), unreadCount, changed: [] };

      const rows = await repo.changedSince(since, CHANGES_MAX + 1);
      let cursor = base;
      let changed = rows;
      if (rows.length > CHANGES_MAX) {
        changed = rows.slice(0, CHANGES_MAX);
        /* Um ms antes da última (ela repete na próxima, sem perda); se isso não avançaria
           (200+ mudanças no mesmo ms: só acontece em carga sintética), vai para o próprio ms. */
        const last = Number(changed[CHANGES_MAX - 1].last_ts);
        cursor = Math.min(base, last - 1 > since ? last - 1 : last);
      }
      return {
        cursor: encodeCursor(Math.max(cursor, since)),
        unreadCount,
        changed: changed.map((row) => String(row.rid)),
      };
    },

    /* ----------------------------------------------------------- modelos */

    async listTemplates() {
      return (await repo.listTemplates()).map(shapeTemplate);
    },

    async createTemplate(input) {
      const { actor, ...data } = templateInput(input);
      const id = await repo.createTemplate({ ...data, updatedByName: actor.actorName });
      if (id === null) {
        throw new AppError(
          409,
          'LIMITE_DE_MODELOS',
          `Limite de ${TEMPLATES_MAX} modelos atingido. Exclua algum para criar outro.`
        );
      }
      await audit(ACTIONS.TEMPLATE_CREATED, 'reply_template', id, { title: data.title, ...actor });
      return shapeTemplate(await repo.findTemplate(id));
    },

    async updateTemplate(id, input) {
      const { actor, ...data } = templateInput(input);
      await requireTemplate(id);
      if (!(await repo.updateTemplate(id, { ...data, updatedByName: actor.actorName }))) {
        throw notFound('Modelo não encontrado.');
      }
      await audit(ACTIONS.TEMPLATE_UPDATED, 'reply_template', id, { title: data.title, ...actor });
      return shapeTemplate(await repo.findTemplate(id));
    },

    async deleteTemplate(id, query = {}) {
      const actor = actorOf(query);
      const row = await requireTemplate(id);
      if (!(await repo.deleteTemplate(id))) throw notFound('Modelo não encontrado.');
      await audit(ACTIONS.TEMPLATE_DELETED, 'reply_template', id, { title: row.title, ...actor });
    },
  };
}
