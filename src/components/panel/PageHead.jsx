import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { usePanel } from './PanelContext.jsx';

/**
 * Cabeçalho de página do painel — o mesmo em todas as telas:
 *   · migalhas (onde estou);
 *   · h1 com o título (e `document.title` por rota);
 *   · foco no h1 ao trocar de página, para leitor de tela anunciar a mudança.
 *
 * `crumbs`: [{ label, to }] — o último é a página atual e não precisa de `to`.
 */
export default function PageHead({ title, subtitle, crumbs = [], actions, titleText }) {
  const { scope, home } = usePanel();
  const h1 = useRef(null);
  const texto = titleText ?? (typeof title === 'string' ? title : '');

  useEffect(() => {
    if (texto) document.title = `${texto} · ${scope} TODAI`;
  }, [texto, scope]);

  /* Só na troca de página (montagem), nunca a cada render. */
  useEffect(() => {
    h1.current?.focus({ preventScroll: true });
  }, []);

  const trilha = [{ label: scope, to: home }, ...crumbs];

  return (
    <header className="page-head">
      <div className="page-head__main">
        <nav className="crumbs" aria-label="Você está em">
          <ol>
            {trilha.map((item, indice) => {
              const ultimo = indice === trilha.length - 1;
              return (
                <li key={`${item.label}-${indice}`}>
                  {item.to && !ultimo ? (
                    <Link to={item.to}>{item.label}</Link>
                  ) : (
                    <span aria-current={ultimo ? 'page' : undefined}>{item.label}</span>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <h1 className="page-title" ref={h1} tabIndex={-1}>
          {title}
        </h1>
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>

      {actions ? <div className="page-head__actions">{actions}</div> : null}
    </header>
  );
}
