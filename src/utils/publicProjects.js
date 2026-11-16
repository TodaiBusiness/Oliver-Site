/* =========================================================================
   Projetos da home: os cadastrados no admin, com reserva no arquivo estático.
   -------------------------------------------------------------------------
   A API (`GET /api/projects`) devolve só os projetos marcados como públicos,
   destaque primeiro. Se ela falhar ou não tiver nenhum, a home usa
   `src/data/projects.js` — ela nunca fica sem a seção (P-003).

   Sem JSX nem `import.meta`: roda igual no navegador e nos testes do Node.
   ========================================================================= */

const STATUS_LABELS = Object.freeze({
  RASCUNHO: 'Rascunho',
  EM_DESENVOLVIMENTO: 'Em desenvolvimento',
  ENTREGUE: 'Entregue',
});

/** Imagem de reserva quando o projeto do admin não tem uma. */
export const PLACEHOLDER_IMAGE = '/sistema/site';

/** Converte um projeto da API para o formato que as telas da home usam. */
export function fromApi(project) {
  const title = String(project?.title ?? '').trim();
  return {
    id: `api-${project.id}`,
    title,
    tagline: project.tagline ?? '',
    category: project.category ?? '',
    status: STATUS_LABELS[project.status] ?? project.status ?? '',
    technologies: Array.isArray(project.technologies) ? project.technologies : [],
    features: Array.isArray(project.features) ? project.features : [],
    problem: project.problem ?? '',
    solution: project.solution ?? project.description ?? '',
    image: project.image || PLACEHOLDER_IMAGE,
    imageAlt: title ? `Imagem do projeto ${title}` : 'Imagem do projeto',
    isMockup: Boolean(project.isMockup),
    featured: Boolean(project.featured),
    gallery: [],
    link: project.link ?? null,
  };
}

/**
 * Escolhe o destaque e os demais. Com a lista da API vazia ou inválida, usa a
 * lista de reserva.
 */
export function pickProjects(apiProjects, fallback) {
  const list =
    Array.isArray(apiProjects) && apiProjects.length > 0
      ? apiProjects.filter((p) => p && p.title).map(fromApi)
      : fallback;
  const source = list.length > 0 ? list : fallback;
  const featured = source.find((p) => p.featured) ?? source[0];
  return {
    featured,
    others: source.filter((p) => p.id !== featured.id),
    fromApi: source !== fallback,
  };
}
