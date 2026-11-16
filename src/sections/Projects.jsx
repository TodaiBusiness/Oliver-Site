import { useCallback, useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Reveal from '../components/Reveal.jsx';
import ProjectModal from '../components/ProjectModal.jsx';
import MockupTag from '../components/MockupTag.jsx';
import { projects as staticProjects } from '../data/projects.js';
import { api } from '../api/client.js';
import { pickProjects } from '../utils/publicProjects.js';
import { EVENTS, track } from '../utils/analytics.js';

/**
 * Projetos cadastrados no admin (`GET /api/projects`), com o arquivo estático
 * como reserva enquanto carrega, se a API falhar ou se não houver nenhum
 * projeto público (P-003).
 */
function usePublicProjects() {
  const [picked, setPicked] = useState(() => pickProjects(null, staticProjects));

  useEffect(() => {
    let cancelled = false;
    api
      .get('/projects')
      .then((result) => {
        if (!cancelled) setPicked(pickProjects(result?.projects, staticProjects));
      })
      .catch(() => {
        /* Sem API a home continua com os projetos do arquivo estático. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return picked;
}

export default function Projects() {
  const [active, setActive] = useState(null);
  const { featured: featuredProject, others: otherProjects } = usePublicProjects();

  const open = useCallback((project) => {
    setActive(project);
    track(EVENTS.PROJECT_VIEWED, { project: project.id, origin: 'detalhe' });
  }, []);

  const close = useCallback(() => setActive(null), []);

  return (
    <section
      className="section section--lg projects"
      id="projetos"
      aria-labelledby="projetos-title"
    >
      <div className="container">
        <Reveal className="section-head section-head--row">
          <div>
            <h2 className="section-head__title" id="projetos-title">
              O que construímos.
            </h2>
          </div>

          <p className="section-head__text">
            Sistemas em uso e projetos em desenvolvimento. Clique para ver o
            problema, a solução e as funcionalidades de cada um.
          </p>
        </Reveal>

        {/* ---------- Projeto em destaque ---------- */}
        <Reveal className="featured">
          <button
            type="button"
            className="featured__media"
            onClick={() => open(featuredProject)}
            aria-label={`Ver detalhes de ${featuredProject.title}`}
          >
            <img
              src={featuredProject.image}
              alt={featuredProject.imageAlt}
              width="800"
              height="560"
              loading="lazy"
              decoding="async"
            />
            {featuredProject.isMockup ? (
              <MockupTag />
            ) : null}
            <span className="featured__zoom" aria-hidden="true">
              <Icon name="arrowUpRight" size={18} />
            </span>
          </button>

          <div className="featured__body">
            <span className="featured__flag">
              <span className="featured__flag-dot" aria-hidden="true" />
              Projeto em destaque
            </span>

            <h3 className="featured__title">{featuredProject.title}</h3>
            <p className="featured__tagline">{featuredProject.tagline}</p>

            <ul className="featured__tech">
              {featuredProject.technologies.map((tech) => (
                <li key={tech}>{tech}</li>
              ))}
            </ul>

            <div className="featured__actions">
              <button
                type="button"
                className="btn btn--primary btn--sm"
                onClick={() => open(featuredProject)}
              >
                Ver projeto
              </button>

              <span className="featured__status">
                <span className="featured__status-dot" aria-hidden="true" />
                {featuredProject.status}
              </span>
            </div>
          </div>
        </Reveal>

        {/* ---------- Demais projetos ---------- */}
        <ul className="projects__grid">
          {otherProjects.map((project, index) => (
            <Reveal as="li" key={project.id} delay={index * 70}>
              <button
                type="button"
                className="pcard"
                onClick={() => open(project)}
                aria-label={`Ver detalhes de ${project.title}`}
              >
                <span className="pcard__media">
                  <img
                    src={project.image}
                    alt={project.imageAlt}
                    width="800"
                    height="560"
                    loading="lazy"
                    decoding="async"
                  />
                  {project.isMockup ? (
                    <MockupTag short />
                  ) : null}
                </span>

                <span className="pcard__body">
                  <span className="pcard__meta">
                    <span className="pcard__category">{project.category}</span>
                    <span className="pcard__status">{project.status}</span>
                  </span>

                  <span className="pcard__title">{project.title}</span>
                  <span className="pcard__tagline">{project.tagline}</span>

                  <span className="pcard__foot">
                    <span className="pcard__tech">
                      {project.technologies.slice(0, 3).join(', ')}
                    </span>
                  </span>
                </span>
              </button>
            </Reveal>
          ))}
        </ul>
      </div>

      <ProjectModal project={active} onClose={close} />
    </section>
  );
}
