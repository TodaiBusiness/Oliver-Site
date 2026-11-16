import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { WHATSAPP_MESSAGES } from '../data/company.js';
import { createWhatsAppLink, whatsappLinkProps } from '../utils/contact.js';
import { EVENTS, track } from '../utils/analytics.js';

/** Fecho de página: um convite só, com dois caminhos. */
export default function FinalCta({
  title = 'Conte a sua ideia. A proposta vem por escrito.',
  text = 'Respondemos pelo canal que você preferir e você só segue se fizer sentido.',
  origin = 'final',
}) {
  return (
    <section className="section" aria-labelledby={`cta-${origin}`}>
      <div className="container">
        <div className="cta-band">
          <div>
            <h2 className="cta-band__title" id={`cta-${origin}`}>
              {title}
            </h2>
            <p className="cta-band__text">{text}</p>
          </div>
          <div className="cta-band__actions">
            <Link className="btn btn--primary btn--lg" to="/contato">
              Pedir orçamento
              <Icon name="arrowRight" size={18} className="btn__icon" />
            </Link>
            <a
              className="btn btn--ghost btn--lg"
              href={createWhatsAppLink(WHATSAPP_MESSAGES.project)}
              onClick={() => track(EVENTS.WHATSAPP_CLICKED, { origin })}
              {...whatsappLinkProps}
            >
              <Icon name="whatsapp" size={18} />
              WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
