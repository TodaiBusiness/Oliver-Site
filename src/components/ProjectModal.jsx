import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import MockupTag from './MockupTag.jsx';
import ThemedShot from './ThemedShot.jsx';
import { WHATSAPP_MESSAGES } from '../data/company.js';
import {
  createWhatsAppLink,
  externalLinkProps,
  whatsappLinkProps,
} from '../utils/contact.js';
import { safeUrl } from '../utils/url.js';
import { useDialog } from '../hooks/useDialog.js';
import { useAuth } from '../app/AuthContext.jsx';
import { EVENTS, track } from '../utils/analytics.js';

/** Blocos de texto do detalhe — evita repetir a mesma marcação três vezes. */
function Block({ title, children }) {
  return (
    <section className="modal__block">
      <h3 className="modal__block-title">{title}</h3>
      {children}
    </section>
  );
}

/**
 * Detalhe do projeto em diálogo modal: problema, solução, funcionalidades e
 * imagens. Comportamento de foco/rolagem/Esc vem do hook `useDialog`.
 */
export default function ProjectModal({ project, onClose }) {
  const { dialogRef, initialFocusRef } = useDialog(Boolean(project), onClose);
  const { user, isAdmin } = useAuth();

  if (!project) return null;

  /* O link vem de dados — na fase seguinte virá do painel admin. Só é
     renderizado se o protocolo for seguro. */
  const projectLink = safeUrl(project.link);

  return (
    <div className="modal" role="presentation" onClick={onClose}>
      <div
        className="modal__dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal__head">
          <div>
            <span className="modal__category">{project.category}</span>
            <h2 className="modal__title" id="modal-title">
              {project.title}
            </h2>
          </div>

          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            ref={initialFocusRef}
            aria-label="Fechar detalhes do projeto"
          >
            <Icon name="close" size={20} />
          </button>
        </header>

        <div className="modal__body">
          <figure className="modal__media">
            <ThemedShot base={project.image} alt={project.imageAlt} />
            {project.isMockup ? <MockupTag /> : null}
          </figure>

          {project.gallery?.length ? (
            <div className="modal__gallery">
              {project.gallery.map((base) => (
                <ThemedShot
                  key={base}
                  base={base}
                  alt={`${project.title}: tela adicional`}
                />
              ))}
            </div>
          ) : null}

          <div className="modal__grid">
            <Block title="Problema">
              <p>{project.problem}</p>
            </Block>

            <Block title="Solução">
              <p>{project.solution}</p>
            </Block>
          </div>

          <Block title="Funcionalidades">
            <ul className="modal__features">
              {project.features.map((feature) => (
                <li key={feature}>
                  <Icon name="check" size={14} />
                  {feature}
                </li>
              ))}
            </ul>
          </Block>

          <Block title="Tecnologias">
            <ul className="modal__tags">
              {project.technologies.map((tech) => (
                <li key={tech}>
                  <span className="tag">{tech}</span>
                </li>
              ))}
            </ul>
          </Block>
        </div>

        <footer className="modal__foot">
          <span className="modal__status">
            <span className="modal__status-dot" aria-hidden="true" />
            {project.status}
          </span>

          <div className="modal__actions">
            {projectLink ? (
              <a
                className="btn btn--ghost btn--sm"
                href={projectLink}
                {...externalLinkProps}
              >
                Abrir projeto
                <Icon name="arrowUpRight" size={15} className="btn__icon" />
              </a>
            ) : null}

            {/* Caminho para acompanhar um projeto assim de dentro do painel. */}
            <Link
              className="btn btn--soft btn--sm"
              to={user ? (isAdmin ? '/admin' : '/cliente') : '/area-do-cliente'}
              onClick={onClose}
            >
              <Icon name="dashboard" size={15} />
              {user ? 'Ir para meu painel' : 'Área do cliente'}
            </Link>

            <a
              className="btn btn--primary btn--sm"
              href={createWhatsAppLink(
                `${WHATSAPP_MESSAGES.projectPrefix} "${project.title}".`
              )}
              onClick={() =>
                track(EVENTS.WHATSAPP_CLICKED, {
                  origin: 'projeto',
                  project: project.id,
                })
              }
              {...whatsappLinkProps}
            >
              <Icon name="whatsapp" size={15} />
              Quero algo assim
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
