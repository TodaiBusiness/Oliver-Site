import { useEffect, useId, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Logo from '../components/Logo.jsx';
import AccountButton from '../components/AccountButton.jsx';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { WHATSAPP_MESSAGES } from '../data/company.js';
import { MAIN_NAV, SERVICES_NAV } from '../data/nav.js';
import { createWhatsAppLink, whatsappLinkProps } from '../utils/contact.js';
import { useScrolled } from '../hooks/useScrolled.js';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock.js';
import { HEADER_SCROLL_OFFSET } from '../config/constants.js';

/** O menu completo cabe a partir daqui; abaixo disso entra o painel mobile. */
const NAV_QUERY = '(min-width: 1061px)';

const navClass = ({ isActive }) => `header__link${isActive ? ' is-active' : ''}`;

/** Serviços: botão que abre um painel (padrão "disclosure"), com teclado completo. */
function ServicesMenu({ item }) {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const buttonRef = useRef(null);
  const closeTimer = useRef(0);
  const panelId = useId();
  const active = pathname.startsWith('/servicos');

  const close = (returnFocus = false) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  useEffect(() => setOpen(false), [pathname]);

  /* Clique fora e foco que sai do menu fecham o painel. */
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (event) => {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  useEffect(() => () => clearTimeout(closeTimer.current), []);

  const onKeyDown = (event) => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation();
      close(true);
    }
    if (event.key === 'ArrowDown' && event.target === buttonRef.current) {
      event.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => wrapRef.current?.querySelector('.mega a')?.focus());
    }
  };

  const hoverIn = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hoverOut = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 140);
  };

  return (
    <li
      ref={wrapRef}
      className="header__item"
      onKeyDown={onKeyDown}
      onMouseEnter={hoverIn}
      onMouseLeave={hoverOut}
      onBlur={(event) => {
        if (!wrapRef.current?.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        className={`header__link header__link--button${active ? ' is-active' : ''}${open ? ' is-open' : ''}`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {item.label}
        <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true" className="header__caret">
          <path d="m2.5 4.5 3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div id={panelId} className={`mega${open ? ' is-open' : ''}`} inert={!open}>
        <ul className="mega__list">
          {SERVICES_NAV.map((service) => (
            <li key={service.to}>
              <Link className="mega__link" to={service.to}>
                <span className="mega__title">{service.label}</span>
                <span className="mega__hint">{service.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link className="mega__all" to="/servicos">
          Comparar os três serviços
          <Icon name="arrowRight" size={15} className="btn__icon" />
        </Link>
      </div>
    </li>
  );
}

export default function Header() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const scrolled = useScrolled(HEADER_SCROLL_OFFSET);
  const panelRef = useRef(null);
  const panelId = useId();

  useBodyScrollLock(open);

  /* Trocar de página fecha o painel. */
  useEffect(() => {
    setOpen(false);
    setServicesOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  useEffect(() => {
    const media = window.matchMedia(NAV_QUERY);
    const onChange = (event) => {
      if (event.matches) setOpen(false);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (panelRef.current) panelRef.current.inert = !open;
  }, [open]);

  const close = () => setOpen(false);

  return (
    <header className={`header${scrolled ? ' header--scrolled' : ''}`}>
      <div className="header__inner container">
        <Link className="header__brand" to="/" aria-label="TODAI: ir para o início">
          <Logo />
        </Link>

        <nav className="header__nav" aria-label="Navegação principal">
          <ul className="header__nav-list">
            {MAIN_NAV.map((item) =>
              item.services ? (
                <ServicesMenu key={item.to} item={item} />
              ) : (
                <li key={item.to}>
                  <NavLink className={navClass} to={item.to} end={item.end}>
                    {item.label}
                  </NavLink>
                </li>
              )
            )}
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
      <div id={panelId} ref={panelRef} className={`mobile-menu${open ? ' is-open' : ''}`}>
        <nav className="mobile-menu__inner" aria-label="Navegação mobile">
          <ul className="mobile-menu__list">
            {MAIN_NAV.map((item, index) => (
              <li key={item.to} style={{ '--i': index }} className="mobile-menu__item">
                {item.services ? (
                  <>
                    <button
                      type="button"
                      className="mobile-menu__link mobile-menu__link--button"
                      aria-expanded={servicesOpen}
                      onClick={() => setServicesOpen((value) => !value)}
                    >
                      <span>{item.label}</span>
                      <svg viewBox="0 0 12 12" width="13" height="13" aria-hidden="true" className="header__caret">
                        <path d="m2.5 4.5 3.5 3.5 3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <ul className={`mobile-menu__sub${servicesOpen ? ' is-open' : ''}`} inert={!servicesOpen}>
                      <li>
                        <NavLink className="mobile-menu__sublink" to="/servicos" end onClick={close}>
                          Comparar os três
                        </NavLink>
                      </li>
                      {SERVICES_NAV.map((service) => (
                        <li key={service.to}>
                          <NavLink className="mobile-menu__sublink" to={service.to} onClick={close}>
                            {service.label}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <NavLink
                    className={({ isActive }) => `mobile-menu__link${isActive ? ' is-active' : ''}`}
                    to={item.to}
                    end={item.end}
                    onClick={close}
                  >
                    <span>{item.label}</span>
                  </NavLink>
                )}
              </li>
            ))}
          </ul>

          <div className="mobile-menu__actions">
            <Link className="btn btn--primary btn--block" to="/comprar" onClick={close}>
              Comprar o sistema
            </Link>
            <AccountButton className="btn--block" onNavigate={close} />
            <a
              className="btn btn--ghost btn--block"
              href={createWhatsAppLink(WHATSAPP_MESSAGES.default)}
              onClick={close}
              {...whatsappLinkProps}
            >
              <Icon name="whatsapp" size={18} />
              Falar no WhatsApp
            </a>
          </div>
        </nav>
      </div>

      <div className={`mobile-menu__scrim${open ? ' is-open' : ''}`} onClick={close} aria-hidden="true" />
    </header>
  );
}
