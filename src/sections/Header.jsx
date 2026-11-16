import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Logo from '../components/Logo.jsx';
import AccountButton from '../components/AccountButton.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { NAV_LINKS, WHATSAPP_MESSAGES } from '../data/company.js';
import { createWhatsAppLink, whatsappLinkProps } from '../utils/contact.js';
import { useActiveSection } from '../hooks/useActiveSection.js';
import { useScrolled } from '../hooks/useScrolled.js';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock.js';
import {
  DESKTOP_MEDIA_QUERY,
  HEADER_SCROLL_OFFSET,
} from '../config/constants.js';

/** Estável entre renders — evita recriar o observer de seção ativa. */
const SECTION_IDS = NAV_LINKS.map((link) => link.href.slice(1));

export default function Header() {
  const [open, setOpen] = useState(false);
  const scrolled = useScrolled(HEADER_SCROLL_OFFSET);
  const active = useActiveSection(SECTION_IDS);
  const panelRef = useRef(null);
  const panelId = useId();

  const whatsappHref = createWhatsAppLink(WHATSAPP_MESSAGES.default);

  /* A trava de rolagem mora em um hook (compartilhado com o modal). */
  useBodyScrollLock(open);

  /* Fecha com Esc. */
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  /* Fecha o menu ao voltar para o desktop. */
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_MEDIA_QUERY);
    const onChange = (event) => {
      if (event.matches) setOpen(false);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  /* Painel fechado sai da navegação por teclado e de leitores de tela. */
  useEffect(() => {
    if (panelRef.current) panelRef.current.inert = !open;
  }, [open]);

  return (
    <header className={`header${scrolled ? ' header--scrolled' : ''}`}>
      <div className="header__inner container">
        <a className="header__brand" href="#inicio" aria-label="Ir para o início">
          <Logo />
        </a>

        <nav className="header__nav" aria-label="Navegação principal">
          <ul className="header__nav-list">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  className={`header__link${
                    active === link.href.slice(1) ? ' is-active' : ''
                  }`}
                  href={link.href}
                  aria-current={
                    active === link.href.slice(1) ? 'true' : undefined
                  }
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="header__actions">
          <ThemeToggle />
          <AccountButton className="header__cta" />
          <Link className="btn btn--primary btn--sm header__buy" to="/comprar">
            Comprar
          </Link>

          <button
            type="button"
            className="header__burger"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? 'Fechar menu' : 'Abrir menu'}
          >
            <Icon name={open ? 'close' : 'menu'} size={22} />
          </button>
        </div>
      </div>

      {/* ---- Menu mobile ---- */}
      <div
        id={panelId}
        ref={panelRef}
        className={`mobile-menu${open ? ' is-open' : ''}`}
      >
        <nav className="mobile-menu__inner" aria-label="Navegação mobile">
          <ul className="mobile-menu__list">
            {NAV_LINKS.map((link, index) => (
              <li
                key={link.href}
                style={{ '--i': index }}
                className="mobile-menu__item"
              >
                <a
                  className="mobile-menu__link"
                  href={link.href}
                  onClick={() => setOpen(false)}
                >
                  <span>{link.label}</span>
                </a>
              </li>
            ))}
          </ul>

          <div className="mobile-menu__actions">
            <Link
              className="btn btn--primary btn--block"
              to="/comprar"
              onClick={() => setOpen(false)}
            >
              Comprar o sistema
            </Link>

            <AccountButton
              className="btn--block"
              onNavigate={() => setOpen(false)}
            />

            <a
              className="btn btn--ghost btn--block"
              href={whatsappHref}
              onClick={() => setOpen(false)}
              {...whatsappLinkProps}
            >
              <Icon name="whatsapp" size={18} />
              Falar no WhatsApp
            </a>
          </div>
        </nav>
      </div>

      {/* Fundo escurecido — clicar fecha o menu */}
      <div
        className={`mobile-menu__scrim${open ? ' is-open' : ''}`}
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />
    </header>
  );
}
