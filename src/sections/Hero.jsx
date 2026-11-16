import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { WHATSAPP_MESSAGES } from '../data/company.js';
import { createWhatsAppLink, whatsappLinkProps } from '../utils/contact.js';
import { EVENTS, track } from '../utils/analytics.js';

/**
 * Abertura da home. A coreografia da página mora aqui: as linhas do título
 * sobem de trás de uma máscara, uma depois da outra, e a tela do sistema se
 * abre da esquerda para a direita. Acontece uma vez, na chegada.
 */
export default function Hero() {
  return (
    <section className="hero" id="inicio">
      <div className="container hero__inner">
        <div className="hero__content">
          <h1 className="hero__title">
            <span className="hero__line">
              <span style={{ '--l': 0 }}>Software que cabe</span>
            </span>
            <span className="hero__line">
              <span style={{ '--l': 1 }}>no jeito que o seu</span>
            </span>
            <span className="hero__line">
              <span style={{ '--l': 2 }}>negócio funciona.</span>
            </span>
          </h1>

          <p className="hero__text">
            Temos o TODAI, um sistema pronto de estoque, caixa e vendas para lojas. E criamos landing pages,
            sites e sistemas sob medida para o que ele não cobre.
          </p>

          <div className="hero__actions">
            <Link
              className="btn btn--primary"
              to="/contato"
              onClick={() => track(EVENTS.HERO_CTA_CLICK, { cta: 'orcamento' })}
            >
              Pedir orçamento
              <Icon name="arrowRight" size={17} className="btn__icon" />
            </Link>

            <Link
              className="btn btn--ghost"
              to="/sistema"
              onClick={() => track(EVENTS.HERO_CTA_CLICK, { cta: 'sistema' })}
            >
              Conhecer o TODAI
            </Link>

            <a
              className="hero__whats"
              href={createWhatsAppLink(WHATSAPP_MESSAGES.default)}
              onClick={() => {
                track(EVENTS.HERO_CTA_CLICK, { cta: 'whatsapp' });
                track(EVENTS.WHATSAPP_CLICKED, { origin: 'hero' });
              }}
              {...whatsappLinkProps}
            >
              <Icon name="whatsapp" size={17} />
              Tirar dúvidas no WhatsApp
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
