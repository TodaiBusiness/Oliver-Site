/* =========================================================================
   Projetos para o Panel (endpoints de serviço /api/service/projects).

   Quem chama é a API do Panel, já autenticada por X-Service-Key. As regras de
   validação e o slug são as de services/projects.js (uma só fonte); aqui ficam
   só o formato da resposta, o ator da auditoria e a exclusão protegida.

   · Ator (actorId/actorName) é validado como no envio de mensagens e vai para
     o `details` da auditoria; o userId é o usuário de sistema (sem e-mail na resposta).
   · Link: como no site, só http/https; outro valor vira null sem erro.
   · Excluir só sem vínculo com cliente (client_projects): senão 409 e nada some.
   ========================================================================= */

import { AUDIT_ACTIONS, LIMITS } from '../config.js';
import { notFound } from '../http/errors.js';
import { createValidator } from '../http/validation.js';
import { ADMIN_ID, NAME_FORBIDDEN, createSystemUserResolver } from './panelConversations.js';

const iso = (ms) => new Date(Number(ms)).toISOString();

export function panelProjectsService(ctx, projects) {
  const getSystemUserId = createSystemUserResolver(ctx);

  /** Valida o autor e devolve só o que vai para a auditoria. */
  function actorOf(input) {
    const validator = createValidator();
    if (typeof input?.actorId !== 'string' || !ADMIN_ID.test(input.actorId)) {
      validator.fail('actorId', 'Identificador do administrador inválido.');
    }
    validator.text('actorName', input?.actorName, {
      min: 1,
      max: LIMITS.SERVICE_ADMIN_NAME_MAX,
      label: 'o nome do administrador',
    });
    if (typeof input?.actorName === 'string' && NAME_FORBIDDEN.test(input.actorName)) {
      validator.fail('actorName', 'O nome do administrador tem caracteres não permitidos.');
    }
    validator.assert();
    return { actorId: input.actorId, actorName: input.actorName.trim() };
  }

  /** Formato do contrato: id string, camelCase, datas ISO, clientCount. */
  function shape(row, clientCount) {
    const parseList = (raw) => {
      try {
        const parsed = JSON.parse(raw ?? '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    };
    return {
      id: String(row.id),
      slug: row.slug,
      title: row.title,
      tagline: row.tagline,
      description: row.description,
      problem: row.problem,
      solution: row.solution,
      features: parseList(row.features),
      technologies: parseList(row.technologies),
      category: row.category,
      image: row.image,
      link: row.link,
      status: row.status,
      featured: Boolean(row.featured),
      isMockup: Boolean(row.is_mockup),
      isPublic: Boolean(row.is_public),
      clientCount,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    };
  }

  async function load(id) {
    const row = await ctx.projects.findById(id);
    if (!row) throw notFound('Projeto não encontrado.');
    const counts = await ctx.projects.clientCounts([row.id]);
    return shape(row, counts.get(Number(row.id)) ?? 0);
  }

  return {
    async list(pagination) {
      const rows = await ctx.projects.listAll(pagination);
      const counts = await ctx.projects.clientCounts(rows.map((r) => r.id));
      return rows.map((row) => shape(row, counts.get(Number(row.id)) ?? 0));
    },

    get: load,

    async create(input) {
      const actor = actorOf(input);
      const system = { id: await getSystemUserId() };
      const created = await projects.create(system, input, actor);
      return load(created.id);
    },

    async update(id, input) {
      const actor = actorOf(input);
      const system = { id: await getSystemUserId() };
      await projects.update(system, id, input, actor);
      return load(id);
    },

    /** Devolve `{ linked: n }` quando há vínculo (nada é apagado). */
    async remove(id, query = {}) {
      const actor = actorOf(query);
      const row = await ctx.projects.findById(id);
      if (!row) throw notFound('Projeto não encontrado.');

      const removed = await ctx.projects.deleteIfUnlinked(id);
      if (!removed) {
        const counts = await ctx.projects.clientCounts([row.id]);
        const clientCount = counts.get(Number(row.id)) ?? 0;
        /* Sumiu entre a leitura e o DELETE (corrida): para o chamador é igual a 404. */
        if (!clientCount) throw notFound('Projeto não encontrado.');
        return { linked: clientCount };
      }

      await ctx.audit.log({
        userId: await getSystemUserId(),
        action: AUDIT_ACTIONS.PROJECT_DELETED,
        resourceType: 'project',
        resourceId: id,
        details: { title: row.title, ...actor },
      });
      return { linked: 0 };
    },
  };
}

