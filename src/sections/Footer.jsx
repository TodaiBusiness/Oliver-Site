import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Logo from '../components/Logo.jsx';
import { COMPANY_NAME, EMAIL, WHATSAPP_MESSAGES } from '../data/company.js';
import { FOOTER_GROUPS } from '../data/nav.js';
import {
  createMailtoLink,
  createWhatsAppLink,
  whatsappDisplay,
  whatsappLinkProps,
} from '../utils/contact.js';

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container footer__inner">
        <div className="footer__brand">
          <Link to="/" aria-label="TODAI: ir para o início">
            <Logo size={30} />
          </Link>
          <p className="footer__description">
            Software e soluções digitais: um sistema pronto para lojas e projetos sob medida.
          </p>

          <div className="footer__contacts">
            <a
              className="footer__link footer__link--icon"
              href={createWhatsAppLink(WHATSAPP_MESSAGES.default)}
              {...whatsappLinkProps}
            >
              <Icon name="whatsapp" size={15} />
              {whatsappDisplay}
            </a>
            <a
              className="footer__link footer__link--icon"
              href={createMailtoLink(WHATSAPP_MESSAGES.contact, 'Contato pelo site')}
            >
              <Icon name="mail" size={15} />
              {EMAIL}
            </a>
          </div>
        </div>

        {FOOTER_GROUPS.map((group) => (
          <nav className="footer__group" key={group.title} aria-label={group.title}>
            <h2 className="footer__heading">{group.title}</h2>
            <ul>
              {group.links.map((link) => (
                <li key={link.to}>
                  <Link className="footer__link" to={link.to}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>

      <div className="container footer__bottom">
        <p>
          © {year} {COMPANY_NAME}. Todos os direitos reservados.
        </p>
      </div>
    </footer>
  );
}
