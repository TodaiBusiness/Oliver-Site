import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import Logo from '../Logo.jsx';
import ThemeToggle from '../ThemeToggle.jsx';
import Icon from '../Icon.jsx';
import PanelIcon from './PanelIcon.jsx';
import UnreadBadge from './UnreadBadge.jsx';
import { PanelContext } from './PanelContext.jsx';
import { ToastProvider } from './Toast.jsx';
import { useDialog } from '../../hooks/useDialog.js';
import { useAuth } from '../../app/AuthContext.jsx';
import { inicial } from './format.js';
import { useStableCallback } from './useStableCallback.js';

const MOBILE = '(max-width: 900px)';

/**
 * Moldura comum do painel (administração e área do cliente).
 *
 * Landmarks: link de pular, <aside> com <nav> rotulada, <header> do topo e
 * <main id="conteudo">. No celular o menu vira gaveta com foco preso (mesmo
 * `useDialog` dos modais), Esc fecha e o foco volta ao botão.
 *
 * `groups`: [{ label?, links: [{ to, label, icon, end?, badge?, panelIcon? }] }]
 */
export default function PanelShell({ scope, home, navLabel, roleLabel, groups, userSubtitle }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  const fechar = useStableCallback(() => setMenuOpen(false));
  const { dialogRef, initialFocusRef } = useDialog(menuOpen, fechar);

  /* Navegou? A gaveta fecha. Passou para tela larga? Também. */
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    const consulta = window.matchMedia(MOBILE);
    const aoMudar = () => {
      if (!consulta.matches) setMenuOpen(false);
    };
    consulta.addEventListener('change', aoMudar);
    return () => consulta.removeEventListener('change', aoMudar);
  }, []);

  const sair = async () => {
    await logout();
    navigate('/', { replace: true });
  };

  const todos = groups.flatMap((grupo) => grupo.links);
  const atual =
    [...todos]
      .sort((a, b) => b.to.length - a.to.length)
      .find((link) => pathname === link.to || pathname.startsWith(`${link.to}/`))?.label ?? scope;

  return (
    <PanelContext.Provider value={{ scope, home }}>
      <ToastProvider>
        <div className="panel">
          <a className="skip-link" href="#conteudo">
            Pular para o conteúdo
          </a>

          <aside className={`panel__side${menuOpen ? ' is-open' : ''}`} ref={dialogRef}>
            <div className="panel__side-head">
              <Link className="panel__brand" to="/" aria-label="TODAI — voltar ao site">
                <Logo size={28} />
              </Link>
              <span className="panel__scope">{roleLabel}</span>
            </div>

            <nav className="panel__nav" aria-label={navLabel}>
              {groups.map((grupo, indice) => (
                <div className="panel__group" key={grupo.label ?? indice}>
                  {grupo.label ? <p className="panel__group-label">{grupo.label}</p> : null}
                  {grupo.links.map((link, i) => (
                    <NavLink
                      key={link.to}
                      to={link.to}
                      end={link.end}
                      className={({ isActive }) => `panel__link${isActive ? ' is-active' : ''}`}
                      ref={indice === 0 && i === 0 ? initialFocusRef : undefined}
                    >
                      {link.panelIcon ? (
                        <PanelIcon name={link.panelIcon} size={17} />
                      ) : (
                        <Icon name={link.icon} size={17} />
                      )}
                      <span className="panel__link-label">{link.label}</span>
                      {link.badge ? <UnreadBadge /> : null}
                    </NavLink>
                  ))}
                </div>
              ))}
            </nav>

            <div className="panel__side-foot">
              <a className="panel__link panel__link--muted" href="/">
                <Icon name="arrowRight" size={16} className="panel__link-back" />
                Voltar ao site
              </a>
            </div>
          </aside>

          <div className="panel__main">
            <header className="panel__top">
              <button
                type="button"
                className="btn btn--soft btn--icon panel__burger"
                onClick={() => setMenuOpen((aberto) => !aberto)}
                aria-expanded={menuOpen}
                aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'}
              >
                <Icon name={menuOpen ? 'close' : 'menu'} size={20} />
              </button>

              <span className="panel__here" aria-hidden="true">
                {atual}
              </span>

              <div className="panel__user">
                <span className="panel__avatar" aria-hidden="true">
                  {inicial(user?.name)}
                </span>
                <span className="panel__user-info">
                  <span className="panel__user-name">{user?.name}</span>
                  <span className="panel__user-company">{userSubtitle(user)}</span>
                </span>
              </div>

              <ThemeToggle />

              <button type="button" className="btn btn--soft btn--xs" onClick={sair}>
                <PanelIcon name="logout" size={15} />
                Sair
              </button>
            </header>

            <main className="panel__content" id="conteudo" tabIndex={-1}>
              <Outlet />
            </main>
          </div>

          {menuOpen ? <div className="panel__scrim" onClick={fechar} aria-hidden="true" /> : null}
        </div>
      </ToastProvider>
    </PanelContext.Provider>
  );
}
