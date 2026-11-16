import Icon from '../components/Icon.jsx';
import Funnel from '../components/Funnel.jsx';
import QuoteForm from '../components/QuoteForm.jsx';
import { EMAIL, WHATSAPP_MESSAGES } from '../data/company.js';
import {
  createMailtoLink,
  createWhatsAppLink,
  whatsappDisplay,
  whatsappLinkProps,
} from '../utils/contact.js';
import { EVENTS, track } from '../utils/analytics.js';

/**
 * Contato + funil na mesma seção: quem já sabe o que quer usa o contato
 * direto; quem não sabe passa pelas duas perguntas.
 */
export default function Contact({ showTitle = true }) {
  return (
    <section className="section section--lg" id="contato" aria-label="Contato">
      <div className="container">
        <div className="contact">
          <div className="contact__intro">

            {showTitle ? (
              <>
                <h2 className="contact__title" id="contato-title">
                  Vamos conversar sobre o seu projeto.
                </h2>
                <p className="contact__text">
                  Responda duas perguntas rápidas ao lado e o WhatsApp abre com o
                  contexto pronto, ou fale direto por um dos canais abaixo.
                </p>
              </>
            ) : (
              <p className="contact__text">Fale direto por um dos canais abaixo.</p>
            )}

            <ul className="contact__channels">
              <li>
                <a
                  className="channel"
                  href={createWhatsAppLink(WHATSAPP_MESSAGES.contact)}
                  onClick={() =>
                    track(EVENTS.WHATSAPP_CLICKED, { origin: 'contato' })
                  }
                  {...whatsappLinkProps}
                >
                  <span className="channel__icon channel__icon--accent">
                    <Icon name="whatsapp" size={18} />
                  </span>
                  <span className="channel__body">
                    <span className="channel__label">WhatsApp</span>
                    <span className="channel__value">{whatsappDisplay}</span>
                  </span>
                  <Icon name="arrowUpRight" size={15} className="channel__arrow" />
                </a>
              </li>

              <li>
                <a
                  className="channel"
                  href={createMailtoLink(
                    WHATSAPP_MESSAGES.contact,
                    'Contato pelo site'
                  )}
                >
                  <span className="channel__icon">
                    <Icon name="mail" size={18} />
                  </span>
                  <span className="channel__body">
                    <span className="channel__label">E-mail</span>
                    <span className="channel__value">{EMAIL}</span>
                  </span>
                  <Icon name="arrowUpRight" size={15} className="channel__arrow" />
                </a>
              </li>
            </ul>
          </div>

          <div className="contact__funnel">
            <Funnel />
          </div>
        </div>

        {/* Caminho formal, para quem prefere deixar o pedido registrado em vez
            de abrir conversa. O funil acima leva ao WhatsApp; este pedido entra
            no painel da TODAI com histórico e resposta. */}
        <div className="contact__quote">
          <h3 className="contact__quote-title">Prefere pedir um orçamento?</h3>
          <p className="contact__quote-text">
            Conte o que precisa e respondemos pelo e-mail informado. Não é
            preciso criar conta.
          </p>

          <QuoteForm />
        </div>
      </div>
    </section>
  );
}
