/* =========================================================================
   Projetos: leitura pública e CRUD administrativo.

   O link do projeto é validado no servidor (protocolo permitido) — não dá
   para confiar na validação do navegador, e um `javascript:` gravado aqui
   viraria XSS armazenado no site público.
   ========================================================================= */

import {
  AUDIT_ACTIONS,
  LIMITS,
  PROJECT_STATUS,
  PROJECT_STATUS_VALUES,
} from '../config.js';
import { conflict, notFound } from '../http/errors.js';
import { cleanText, createValidator, pick } from '../http/validation.js';

/** Campos que o admin pode enviar. Qualquer outro é ignorado. */
const EDITABLE_FIELDS = [
  'title',
  'tagline',
  'description',
  'problem',
  'solution',
  'features',
  'technologies',
  'category',
  'image',
  'link',
  'status',
  'featured',
  'isMockup',
  'isPublic',
];

const ALLOWED_LINK_PROTOCOLS = ['http:', 'https:'];

/** Aceita só http/https; devolve null para o resto (inclusive javascript:). */
function safeProjectLink(value) {
  const link = cleanText(value);
  if (!link) return null;

  try {
    const url = new URL(link);
    return ALLOWED_LINK_PROTOCOLS.includes(url.protocol) ? link : null;
  } catch {
    return null;
  }
}

/** "Sistema de Gestão" → "sistema-de-gestao" */
export function slugify(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove os acentos separados pelo NFD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160);
}

/** Converte a linha do banco no formato que o front consome. */
export function toPublicProject(row) {
  if (!row) return null;

  const parseList = (raw) => {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
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
  };
}

export function projectsService(ctx) {
  /** Valida e normaliza o corpo enviado pelo admin. */
  const normalize = async (input, { id = null } = {}) => {
    const data = pick(input, EDITABLE_FIELDS); // barra mass assignment

    const validator = createValidator();
    validator.text('title', data.title, {
      max: LIMITS.TITLE_MAX,
      label: 'o título',
    });
    validator.optionalText('tagline', data.tagline, { max: 255, label: 'o resumo' });
    validator.optionalText('description', data.description, {
      max: LIMITS.DESCRIPTION_MAX,
      label: 'a descrição',
    });
    validator.optionalText('problem', data.problem, {
      max: LIMITS.DESCRIPTION_MAX,
      label: 'o problema',
    });
    validator.optionalText('solution', data.solution, {
      max: LIMITS.DESCRIPTION_MAX,
      label: 'a solução',
    });
    validator.optionalText('category', data.category, { max: 80, label: 'a categoria' });
    validator.optionalText('image', data.image, { max: LIMITS.URL_MAX, label: 'a imagem' });

    if (data.status !== undefined) {
      validator.oneOf('status', data.status, PROJECT_STATUS_VALUES, 'O status');
    }
    validator.assert();

    const toList = (value) =>
      JSON.stringify(
        Array.isArray(value)
          ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, 30)
          : []
      );

    const slug = slugify(data.title);
    if (await ctx.projects.slugExists(slug, id)) {
      throw conflict('Já existe um projeto com um título muito parecido.');
    }

    return {
      title: cleanText(data.title),
      slug,
      tagline: cleanText(data.tagline),
      description: cleanText(data.description),
      problem: cleanText(data.problem),
      solution: cleanText(data.solution),
      features: toList(data.features),
      technologies: toList(data.technologies),
      category: cleanText(data.category),
      image: cleanText(data.image),
      link: safeProjectLink(data.link),
      status: data.status ?? PROJECT_STATUS.DRAFT,
      featured: data.featured ? 1 : 0,
      isMockup: data.isMockup === false ? 0 : 1,
      isPublic: data.isPublic === false ? 0 : 1,
    };
  };

  return {
    async listPublic() {
      const rows = await ctx.projects.listPublic();
      return rows.map(toPublicProject);
    },

    async listAll(pagination) {
      const rows = await ctx.projects.listAll(pagination);
      return rows.map(toPublicProject);
    },

    async getById(id) {
      const row = await ctx.projects.findById(id);
      if (!row) throw notFound('Projeto não encontrado.');
      return toPublicProject(row);
    },

    async create(admin, input, auditExtra = {}) {
      const data = await normalize(input);
      const id = await ctx.projects.create(data);

      await ctx.audit.log({
        userId: admin.id,
        action: AUDIT_ACTIONS.PROJECT_CREATED,
        resourceType: 'project',
        resourceId: id,
        details: { title: data.title, ...auditExtra },
      });

      return this.getById(id);
    },

    async update(admin, id, input, auditExtra = {}) {
      const existing = await ctx.projects.findById(id);
      if (!existing) throw notFound('Projeto não encontrado.');

      const data = await normalize(input, { id });
      await ctx.projects.update(id, data);

      await ctx.audit.log({
        userId: admin.id,
        action: AUDIT_ACTIONS.PROJECT_UPDATED,
        resourceType: 'project',
        resourceId: id,
        details: { title: data.title, ...auditExtra },
      });

      return this.getById(id);
    },

    async remove(admin, id) {
      const existing = await ctx.projects.findById(id);
      if (!existing) throw notFound('Projeto não encontrado.');

      await ctx.projects.delete(id);

      await ctx.audit.log({
        userId: admin.id,
        action: AUDIT_ACTIONS.PROJECT_DELETED,
        resourceType: 'project',
        resourceId: id,
        details: { title: existing.title },
      });

      return { id };
    },

    async listForUser(userId) {
      return ctx.projects.listForUser(userId);
    },
  };
}
