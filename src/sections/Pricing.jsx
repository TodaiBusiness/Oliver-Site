import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { PLAN } from '../../shared/plan.js';
import { WHATSAPP_MESSAGES } from '../data/company.js';
import { createWhatsAppLink, whatsappLinkProps } from '../utils/contact.js';
import { EVENTS, track } from '../utils/analytics.js';

const reais = (value) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value);

/** Instalação e mensalidade. O valor final é fechado pelo WhatsApp. */
export default function Pricing() {
  return (
    <section className="section section--stack" id="preco" aria-labelledby="preco-title">
      <div className="container">
        <div className="pricing">
          <div>
            <h2 className="section-head__title" id="preco-title">
              Instalação e mensalidade.
            </h2>
            <p className="section-head__text">
              Você paga a instalação uma vez. A mensalidade depende das
              funcionalidades que a sua loja usa e de quantos computadores ela
              tem.
            </p>
            <ul className="pricing__list">
              <li>
                <Icon name="check" size={16} />
                Estoque, comandas, caixa e relatórios inclusos
              </li>
              <li>
                <Icon name="check" size={16} />
                Atualizações do sistema inclusas
              </li>
              <li>
                <Icon name="check" size={16} />
                Suporte por WhatsApp
              </li>
            </ul>
          </div>

          <div className="pricing__card">
            <p className="buy__plan">{PLAN.name}</p>

            <dl className="pricing__rows">
              <div className="pricing__row">
                <dt>Instalação</dt>
                <dd>
                  <strong>{reais(PLAN.installPrice)}</strong>
                  <span>uma vez</span>
                </dd>
              </div>
              <div className="pricing__row">
                <dt>Mensalidade</dt>
                <dd>
                  <strong>a partir de {reais(PLAN.basePrice)}</strong>
                  <span>por mês</span>
                </dd>
              </div>
            </dl>

            <a
              className="btn btn--primary btn--block btn--lg"
              href={createWhatsAppLink(WHATSAPP_MESSAGES.quote)}
              onClick={() => track(EVENTS.WHATSAPP_CLICKED, { origin: 'preco' })}
              {...whatsappLinkProps}
            >
              <Icon name="whatsapp" size={18} />
              Pedir orçamento no WhatsApp
            </a>
            <p className="buy__legal">
              Já sabe o que precisa? <Link to="/comprar">Compre pelo site</Link>.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
