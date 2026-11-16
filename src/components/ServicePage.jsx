import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import PageHero from './PageHero.jsx';
import Faq from './Faq.jsx';
import { SERVICES } from '../data/services.js';
import { createWhatsAppLink, whatsappLinkProps } from '../utils/contact.js';
import { EVENTS, track } from '../utils/analytics.js';

/** Esquema simples do que costuma ser entregue, desenhado em HTML. */
function Delivery({ delivery }) {
  return (
    <figure className="delivery">
      <div className="delivery__canvas" aria-hidden="true">
        {delivery.blocks ? (
          <div className="delivery__page">
            {delivery.blocks.map((block) => (
              <div
                key={block.label}
                className={`delivery__block delivery__block--${block.size}${block.accent ? ' is-accent' : ''}`}
              >
                {block.label}
              </div>
            ))}
          </div>
        ) : null}

        {delivery.sitemap ? (
          <div className="delivery__map">
            {delivery.sitemap.map((node) => (
              <div className="delivery__node" key={node.label}>
                <span className="delivery__node-title">{node.label}</span>
                {node.children.map((child) => (
                  <span className="delivery__leaf" key={child}>
                    {child}
                  </span>
                ))}
              </div>
            ))}
          </div>
        ) : null}

        {delivery.parts ? (
          <div className="delivery__parts">
            {delivery.parts.map((part) => (
              <div className="delivery__part" key={part.label}>
                <span className="delivery__part-title">{part.label}</span>
                <span className="delivery__part-detail">{part.detail}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <figcaption className="delivery__caption">{delivery.caption}</figcaption>
    </figure>
  );
}

/** Modelo das três páginas de serviço: o que é, para quem, o que inclui, exemplo, processo, FAQ e CTA. */
export default function ServicePage({ service }) {
  const others = SERVICES.filter((item) => item.slug !== service.slug);

  const cta = (
    <>
      <Link
        className="btn btn--primary btn--lg"
        to="/contato"
        onClick={() => track(EVENTS.SOLUTION_SELECTED, { solution: service.slug, origin: 'pagina-servico' })}
      >
        Pedir orçamento
        <Icon name="arrowRight" size={18} className="btn__icon" />
      </Link>
      <a
        className="btn btn--ghost btn--lg"
        href={createWhatsAppLink(service.whatsapp)}
        onClick={() => track(EVENTS.WHATSAPP_CLICKED, { origin: `servico-${service.slug}` })}
        {...whatsappLinkProps}
      >
        <Icon name="whatsapp" size={18} />
        Falar no WhatsApp
      </a>
    </>
  );

  return (
    <>
      <PageHero title={service.h1} lead={service.lead}>
        {cta}
      </PageHero>

      <section className="section" aria-labelledby="o-que-e">
        <div className="container split">
          <div>
            <h2 className="section-head__title" id="o-que-e">
              O que é
            </h2>
            {service.whatIs.map((text) => (
              <p className="prose" key={text}>
                {text}
              </p>
            ))}
          </div>
          <div>
            <h2 className="section-head__title" id="para-quem">
              Para quem serve
            </h2>
            <ul className="ticks">
              {service.forWho.map((text) => (
                <li key={text}>
                  <Icon name="check" size={16} />
                  {text}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section section--stack" aria-labelledby="inclui">
        <div className="container split split--wide">
          <div>
            <h2 className="section-head__title" id="inclui">
              O que está incluído
            </h2>
            <ul className="ticks">
              {service.includes.map((text) => (
                <li key={text}>
                  <Icon name="check" size={16} />
                  {text}
                </li>
              ))}
            </ul>
            <p className="note">
              <strong>Fica de fora:</strong> {service.notIncludes.join('; ').toLowerCase()}. Se precisar, entra como
              outro serviço.
            </p>
          </div>
          <Delivery delivery={service.delivery} />
        </div>
      </section>

      <section className="section" aria-labelledby="processo">
        <div className="container">
          <h2 className="section-head__title" id="processo">
            Como o trabalho acontece
          </h2>
          <ol className="flow">
            {service.process.map((step) => (
              <li className="flow__step" key={step.title}>
                <h3 className="flow__title">{step.title}</h3>
                <p className="flow__text">{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="section section--stack" aria-labelledby="preco-servico">
        <div className="container split">
          <div>
            <h2 className="section-head__title" id="preco-servico">
              Quanto custa
            </h2>
            <p className="prose">
              Este serviço é <strong>sob orçamento</strong>. O valor sai da proposta, depois que entendemos o que você precisa.
              O que mais pesa:
            </p>
            <ul className="ticks">
              {service.pricingFactors.map((text) => (
                <li key={text}>
                  <Icon name="check" size={16} />
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="section-head__title" id="duvidas">
              Dúvidas comuns
            </h2>
            <Faq items={service.faq} />
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="cta-servico">
        <div className="container">
          <div className="cta-band">
            <div>
              <h2 className="cta-band__title" id="cta-servico">
                Conte o que você precisa. A proposta vem por escrito.
              </h2>
              <p className="cta-band__text">
                Sem compromisso: você só segue se a proposta fizer sentido.
              </p>
            </div>
            <div className="cta-band__actions">{cta}</div>
          </div>

          <p className="also">
            Em dúvida se é esse o serviço certo?{' '}
            <Link to="/servicos">Compare os três</Link>
            {' '}ou veja{' '}
            {others.map((item, index) => (
              <span key={item.slug}>
                {index > 0 ? ' e ' : ''}
                <Link to={item.to}>{item.plural.toLowerCase()}</Link>
              </span>
            ))}
            .
          </p>
        </div>
      </section>
    </>
  );
}
