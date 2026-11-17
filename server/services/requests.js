/* =========================================================================
   Solicitações de projeto.

   Controle de acesso: o cliente só enxerga as próprias solicitações — e isso
   é garantido no WHERE da consulta, não por um `if` depois de buscar. Um id
   de outra pessoa devolve "não encontrado", sem confirmar que existe.
   ========================================================================= */

import { AUDIT_ACTIONS, LIMITS, REQUEST_STATUS, REQUEST_STATUS_VALUES, ROLES } from '../config.js';
import { notFound, tooManyRequests } from '../http/errors.js';
import { cleanText, createValidator } from '../http/validation.js';

/** Tipos aceitos — os mesmos do funil do site. */
export const REQUEST_TYPES = Object.freeze([
  'Sistema / ERP',
  'Site',
  'Aplicação Web',
  'Automação',
  'Integração',
  'Banco de Dados',
  'Outro',
]);

export function requestsService(ctx) {
  return {
    async create(user, input) {
      const validator = createValidator();
      validator.oneOf('type', input.type, REQUEST_TYPES, 'Tipo de projeto');
      validator.text('description', input.description, {
        min: 10,
        max: LIMITS.DESCRIPTION_MAX,
        label: 'a descrição',
      });
      validator.optionalText('budget', input.budget, {
        max: 60,
        label: 'o orçamento',
      });
      validator.optionalText('deadline', input.deadline, {
        max: 60,
        label: 'o prazo',
      });
      validator.assert();

      if (
        user.role !== ROLES.ADMIN &&
        (await ctx.requests.countByUserSince(user.id, Date.now() - 24 * 60 * 60 * 1000)) >=
          LIMITS.REQUESTS_PER_DAY
      ) {
        throw tooManyRequests(
          `Você atingiu o limite de ${LIMITS.REQUESTS_PER_DAY} solicitações por dia. Tente novamente amanhã.`
        );
      }

      const id = await ctx.requests.create({
        userId: user.id,
        type: input.type,
        description: cleanText(input.description),
        budget: cleanText(input.budget),
        deadline: cleanText(input.deadline),
        status: REQUEST_STATUS.NEW, // status inicial não vem do cliente
      });

      await ctx.audit.log({
        userId: user.id,
        action: AUDIT_ACTIONS.REQUEST_CREATED,
        resourceType: 'request',
        resourceId: id,
      });

      return ctx.requests.findByIdForUser(id, user.id);
    },

    async listMine(user, pagination) {
      return ctx.requests.listForUser(user.id, pagination);
    },

    /**
     * Busca respeitando o papel: admin vê qualquer uma; cliente, só a dele.
     * Ponto único de decisão — nenhuma rota reimplementa esta regra.
     */
    async getForViewer(viewer, requestId) {
      const request =
        viewer.role === ROLES.ADMIN
          ? await ctx.requests.findByIdWithUser(requestId)
          : await ctx.requests.findByIdForUser(requestId, viewer.id);

      if (!request) throw notFound('Solicitação não encontrada.');
      return request;
    },

    async listAll(pagination, status = null) {
      return ctx.requests.listAll({ ...pagination, status });
    },

    /** Só o admin chega aqui (garantido pelo router). */
    async updateStatus(admin, requestId, status, auditExtra = {}) {
      const validator = createValidator();
      validator.oneOf('status', status, REQUEST_STATUS_VALUES, 'Status');
      validator.assert();

      const existing = await ctx.requests.findByIdWithUser(requestId);
      if (!existing) throw notFound('Solicitação não encontrada.');

      await ctx.requests.updateStatus(requestId, status);

      await ctx.audit.log({
        userId: admin.id,
        action: AUDIT_ACTIONS.REQUEST_STATUS_CHANGED,
        resourceType: 'request',
        resourceId: requestId,
        details: { de: existing.status, para: status, ...auditExtra },
      });

      return ctx.requests.findByIdWithUser(requestId);
    },
  };
}
