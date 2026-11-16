import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import PageHero from '../components/PageHero.jsx';
import Capabilities from '../sections/Capabilities.jsx';
import FinalCta from '../sections/FinalCta.jsx';
import { CHOOSER, COMPARISON, SERVICES, SERVICE_BY_SLUG } from '../data/services.js';
import { EVENTS, track } from '../utils/analytics.js';

/** Hub: a diferença entre landing page, site completo e SaaS, em tabela e em "qual escolher". */
export default function Servicos() {
  const [picked, setPicked] = useState(null);
  const choice = CHOOSER.find((item) => item.id === picked);
  const recommended = choice ? SERVICE_BY_SLUG[choice.slug] : null;

  const pick = (item) => {
    setPicked(item.id);
    track(EVENTS.SOLUTION_SELECTED, { solution: item.slug, origin: 'qual-escolher' });
  };

  return (
    <>
      <PageHero
        title="Landing page, site completo ou sistema: qual resolve o seu caso?"
        lead="São três tamanhos de projeto. Muda o que cada um entrega, quanto trabalho dá e para que serve. Todos são feitos sob orçamento."
      />

      <section className="section" aria-labelledby="comparar-title">
        <div className="container">
          <h2 className="section-head__title" id="comparar-title">
            Lado a lado
          </h2>

          <div className="compare-wrap">
            <table className="compare">
              <caption className="sr-only">Comparação entre landing page, site completo e SaaS</caption>
              <thead>
                <tr>
                  <td />
                  {SERVICES.map((service) => (
                    <th
                      scope="col"
                      key={service.slug}
                      className={recommended?.slug === service.slug ? 'is-picked' : undefined}
                    >
                      <Link to={service.to}>{service.name}</Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {row.values.map((value, index) => (
                      <td
                        key={SERVICES[index].slug}
                        data-label={SERVICES[index].name}
                        className={recommended?.slug === SERVICES[index].slug ? 'is-picked' : undefined}
                      >
                        {value}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section section--stack" aria-labelledby="escolher-title">
        <div className="container split">
          <div>
            <h2 className="section-head__title" id="escolher-title">
              Qual escolher?
            </h2>
            <p className="prose">Marque o que mais parece com a sua situação.</p>
            <div className="chooser" role="radiogroup" aria-label="Qual a sua situação">
              {CHOOSER.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={picked === item.id}
                  className={`chooser__option${picked === item.id ? ' is-on' : ''}`}
                  onClick={() => pick(item)}
                >
                  <span className="chooser__dot" aria-hidden="true" />
                  {item.text}
                </button>
              ))}
            </div>
          </div>

          <div className="verdict" aria-live="polite">
            {recommended ? (
              <div className="verdict__box" key={recommended.slug}>
                <p className="verdict__label">Para o seu caso</p>
                <h3 className="verdict__title">{recommended.name}</h3>
                <p className="prose">{recommended.summary}</p>
                <Link className="btn btn--primary" to={recommended.to}>
                  Ver {recommended.plural.toLowerCase()}
                  <Icon name="arrowRight" size={16} className="btn__icon" />
                </Link>
              </div>
            ) : (
              <p className="verdict__empty">Escolha uma opção e a indicação aparece aqui, destacada na tabela.</p>
            )}
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="regra-title">
        <div className="container">
          <h2 className="section-head__title" id="regra-title">
            Uma regra simples
          </h2>
          <p className="prose prose--wide">
            Se o visitante só precisa tomar uma decisão, é landing page. Se ele precisa conhecer a empresa, é site. Se a
            sua equipe ou os seus clientes precisam entrar, registrar e consultar informações, é sistema.
          </p>
        </div>
      </section>

      <Capabilities />
      <FinalCta origin="servicos" />
    </>
  );
}
