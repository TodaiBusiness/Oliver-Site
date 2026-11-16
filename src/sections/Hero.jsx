import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { PRODUCT } from '../data/product.js';
import { WHATSAPP_MESSAGES } from '../data/company.js';
import { createWhatsAppLink, whatsappLinkProps } from '../utils/contact.js';
import { EVENTS, track } from '../utils/analytics.js';

export default function Hero() {
  return (
    <section className="hero" id="inicio">
      <div className="container hero__inner">
        <div className="hero__content">
          <h1 className="hero__title">Estoque, caixa e vendas da sua loja num só sistema.</h1>

          <p className="hero__text">
            O {PRODUCT.name} roda no Windows. Você compra pelo site, instala no
            computador da loja e começa a vender no mesmo dia.
          </p>

          <div className="hero__actions">
            <Link
              className="btn btn--primary"
              to="/comprar"
              onClick={() => track(EVENTS.HERO_CTA_CLICK, { cta: 'comprar' })}
            >
              Comprar agora
            </Link>

            <a
              className="btn btn--ghost"
              href="#sistema"
              onClick={() => track(EVENTS.HERO_CTA_CLICK, { cta: 'sistema' })}
            >
              Ver as telas
            </a>

            <a
              className="btn btn--ghost"
              href={createWhatsAppLink(WHATSAPP_MESSAGES.default)}
              onClick={() => {
                track(EVENTS.HERO_CTA_CLICK, { cta: 'whatsapp' });
                track(EVENTS.WHATSAPP_CLICKED, { origin: 'hero' });
              }}
              {...whatsappLinkProps}
            >
              <Icon name="whatsapp" size={17} />
              Tirar dúvidas
            </a>
          </div>
        </div>

        {/* Tela real do sistema (dados de exemplo), no tema que o visitante escolheu. */}
        <figure className="tour__frame hero__visual">
          {['escuro', 'claro'].map((theme) => (
            <img
              key={theme}
              className={`tour__shot shot-${theme}`}
              src={`/sistema/comandas-${theme}.webp`}
              alt="Tela de comandas do TODAI, com a lista de comandas abertas e os itens da comanda selecionada."
              width="1366"
              height="768"
              fetchPriority="high"
              decoding="async"
            />
          ))}
        </figure>
      </div>
    </section>
  );
}
