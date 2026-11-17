/* =========================================================================
   Contas do site, status de solicitações e atividade (auditoria) para o Panel
   (endpoints de serviço /api/service/clients, /requests/:id/status, /audit).

   Quem chama é a API do Panel, já autenticada por X-Service-Key. Somente leitura
   em contas e auditoria; a única escrita é o status de uma solicitação, que
   reaproveita requestsService.updateStatus (mesma regra e mesma auditoria do
   antigo admin), com o usuário de sistema como userId e o ator em details.

   O que NUNCA sai daqui: password_hash, sessões, tokens, segredo/códigos 2FA,
   user agent, details cru da auditoria, e-mail digitado em login falho.
   ========================================================================= */

import { LIMITS, REQUEST_STATUS_VALUES } from '../config.js';
import { createValidator, escapeLike } from '../http/validation.js';
import { notFound } from '../http/errors.js';
import { createSystemUserResolver } from './panelConversations.js';
import { actorOf } from './panelProjects.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_PAGE = 100000;
const Q_MAX = 100;
const SUMMARY_VALUE_MAX = 80;
const SUMMARY_MAX = 240;
const ACTION_RE = /^[A-Za-z0-9_]{1,60}$/;
/* Controle e formatação Unicode (bidi, zero-width): fora de qualquer texto que sai. */
const INVISIBLE = /[\p{Cc}\p{Cf}]/gu;

const iso = (ms) => new Date(Number(ms)).toISOString();
const clip = (text, max) => {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : text;
};
const oneLine = (text) => String(text ?? '').replace(INVISIBLE, ' ').replace(/\s+/g, ' ').trim();

/** limit 1..100 (padrão 50), page 1..100000: valor ruim cai no padrão. */
function pageOf(query = {}) {
  const rawLimit = Number(query.limit);
  const rawPage = Number(query.page);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;
  const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, MAX_PAGE) : 1;
  return { limit, offset: (page - 1) * limit };
}

/** Texto de busca limpo (sem controle, ≤100) já escapado para LIKE; null se vazio. */
function searchTerm(raw) {
  if (typeof raw !== 'string') return null;
  const text = oneLine(raw);
  return text ? escapeLike(Array.from(text).slice(0, Q_MAX).join('')) : null;
}

/* Chaves de details que podem virar texto do `summary` (valor primitivo curto).
   Tudo fora desta lista é ignorado: e-mail (cliente), ref, adminId, hashes... */
const SUMMARY_KEYS = Object.freeze([
  ['title', 'Título'],
  ['projeto', 'Projeto'],
  ['projectId', 'Projeto'],
  ['projetoId', 'Projeto'],
  ['requestId', 'Solicitação'],
  ['de', 'De'],
  ['para', 'Para'],
  ['status', 'Status'],
  ['rota', 'Rota'],
  ['papel', 'Papel'],
  ['operacao', 'Operação'],
  ['motivo', 'Motivo'],
  ['restantes', 'Restantes'],
  ['sessoesEncerradas', 'Sessões encerradas'],
  ['imagem', 'Imagem'],
]);

function parseDetails(raw) {
  if (typeof raw !== 'string' || !raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function summaryOf(details) {
  const parts = [];
  for (const [key, label] of SUMMARY_KEYS) {
    const value = details[key];
    let text;
    if (typeof value === 'string') text = oneLine(value);
    else if (typeof value === 'number' && Number.isFinite(value)) text = String(value);
    else if (typeof value === 'boolean') text = value ? 'sim' : 'não';
    if (text) parts.push(`${label}: ${clip(text, SUMMARY_VALUE_MAX)}`);
  }
  return clip(parts.join(' · '), SUMMARY_MAX);
}

export function panelClientsService(ctx, requests) {
  const getSystemUserId = createSystemUserResolver(ctx);

  function shapeClient(row) {
    const last = Math.max(
      Number(row.created_at),
      Number(row.last_request_at ?? 0),
      Number(row.last_message_at ?? 0)
    );
    return {
      id: String(row.id),
      name: row.name,
      company: row.company ?? null,
      email: row.email,
      phone: row.phone ?? null,
      createdAt: iso(row.created_at),
      requestCount: Number(row.request_count ?? 0),
      projectCount: Number(row.project_count ?? 0),
      lastActivityAt: iso(last),
    };
  }

  return {
    async listClients(query = {}) {
      const rows = await ctx.users.listClientsForService({
        term: searchTerm(query.q),
        ...pageOf(query),
      });
      return rows.map(shapeClient);
    },

    async getClient(id) {
      const row = await ctx.users.findClientForService(id);
      if (!row) throw notFound('Cliente não encontrado.');
      const [requestRows, projectRows] = await Promise.all([
        ctx.requests.listForClientService(id),
        ctx.projects.listForUser(id),
      ]);
      return {
        client: shapeClient(row),
        requests: requestRows.map((r) => ({
          requestId: String(r.id),
          title: clip(`${r.type} — ${oneLine(r.description)}`, LIMITS.TITLE_MAX),
          type: r.type,
          status: r.status,
          createdAt: iso(r.created_at),
          unreadCount: Number(r.unread ?? 0),
        })),
        projects: projectRows.map((p) => ({
          id: String(p.id),
          title: p.title,
          status: p.status,
        })),
      };
    },

    /** Mesma regra e auditoria do admin antigo (requestsService.updateStatus). */
    async setRequestStatus(requestId, input) {
      const actor = actorOf(input);
      const validator = createValidator();
      validator.oneOf('status', input?.status, REQUEST_STATUS_VALUES, 'Status');
      validator.assert();

      const system = { id: await getSystemUserId() };
      const updated = await requests.updateStatus(system, requestId, input.status, actor);
      return {
        requestId: String(updated.id),
        status: updated.status,
        updatedAt: iso(updated.updated_at),
      };
    },

    async listAudit(query = {}) {
      const validator = createValidator();
      let action = null;
      if (query.action !== undefined && query.action !== '') {
        if (typeof query.action !== 'string' || !ACTION_RE.test(query.action)) {
          validator.fail('action', 'Ação inválida.');
        } else {
          action = query.action;
        }
      }
      validator.assert();

      const rows = await ctx.audit.listForService({
        action,
        term: searchTerm(query.q),
        ...pageOf(query),
      });

      return rows.map((row) => {
        const details = parseDetails(row.details);
        const fromDetails =
          typeof details.actorName === 'string' ? oneLine(details.actorName) : '';
        const name = fromDetails || oneLine(row.user_name);
        return {
          id: String(row.id),
          action: row.action,
          resourceType: row.resource_type ?? null,
          resourceId: row.resource_id ?? null,
          actorName: name ? clip(name, LIMITS.SERVICE_ADMIN_NAME_MAX) : null,
          ip: row.ip ? clip(oneLine(row.ip), 64) : null,
          createdAt: iso(row.created_at),
          summary: summaryOf(details),
        };
      });
    },
  };
}
