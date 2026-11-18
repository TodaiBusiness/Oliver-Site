import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useParams } from 'react-router-dom';
import { buildPortalTheme } from '../../../shared/portalTheme.js';
import { PortalProvider, usePortal } from './PortalContext.jsx';
import { PIcon, Spinner, StoreStatus } from './ui.jsx';
import { statusDaLoja } from './format.js';

/**
 * Casca do portal de uma loja (/l/:slug): FORA do SiteLayout, com o logo, o nome e
 * a cor de destaque da loja. As cores viram propriedades CSS no <html> (via CSSOM,
 * compatível com a CSP sem 'unsafe-inline'), já com o contraste conferido.
 */
export default function PortalLayout() {
  const { slug } = useParams();
  return (
    <PortalProvider key={slug} slug={slug}>
      <Shell />
    </PortalProvider>
  );
}

function Brand({ loja, slug }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const nome = loja?.nomePublico ?? 'Loja';
  const inicial = nome.trim().charAt(0).toUpperCase() || 'L';
  return (
    <Link to={`/l/${slug}`} className="p-brand" aria-label={`${nome}: início`}>
      {loja?.logoUrl && !logoFailed ? (
        <img className="p-brand__logo" src={loja.logoUrl} alt="" width="40" height="40" onError={() => setLogoFailed(true)} />
      ) : (
        <span className="p-brand__mono" aria-hidden="true">
          {inicial}
        </span>
      )}
      <span className="p-brand__name">{nome}</span>
    </Link>
  );
}

function Shell() {
  const { slug, loja, signedIn, session, cartCount, signOut } = usePortal();
  const { pathname } = useLocation();
  const dados = loja.data;

  const theme = useMemo(() => buildPortalTheme(dados?.cores), [dados]);

  /* Cores e fundo da loja no <html>; ao sair do portal, tudo volta ao site. */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('portal-on');
    for (const [name, value] of Object.entries(theme.vars)) root.style.setProperty(name, value);
    return () => {
      root.classList.remove('portal-on');
      for (const name of Object.keys(theme.vars)) root.style.removeProperty(name);
    };
  }, [theme]);

  useEffect(() => {
    const soAgenda = dados?.temAgenda && !dados?.aceitaPedidos;
    document.title = dados ? `${dados.nomePublico} | ${soAgenda ? 'Agendamento' : 'Pedidos'}` : 'Portal da loja';
  }, [dados, pathname]);

  /* Troca de tela: volta ao topo; o foco vai para o título da página nova. */
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname]);

  const base = `/l/${slug}`;
  /* Loja que só atende por agenda (não recebe pedidos) não mostra catálogo, carrinho nem pedidos. */
  const soAgenda = Boolean(dados?.temAgenda) && !dados?.aceitaPedidos;
  const nav = signedIn
    ? [
        ...(soAgenda ? [] : [['catalogo', 'Catálogo', 'store'], ['carrinho', 'Carrinho', 'cart'], ['pedidos', 'Pedidos', 'receipt']]),
        ...(dados?.temAgenda ? [['agendar', 'Agendar', 'calendar']] : []),
        ...(dados?.fiadoAtivo ? [['fiado', 'Fiado', 'wallet']] : []),
        ['conta', 'Conta', 'user'],
      ]
    : [
        ['entrar', 'Entrar', 'user'],
        ['cadastro', 'Criar conta', 'plus'],
      ];

  const pronto = loja.status === 'ready';

  return (
    <div className={`portal${signedIn ? ' portal--auth' : ''}`}>
      <a className="p-skip" href="#portal-conteudo">
        Pular para o conteúdo
      </a>
      <header className="p-header">
        <div className="p-header__in">
          <Brand loja={dados} slug={slug} />
          {pronto ? <StoreStatus status={statusDaLoja(dados)} className="p-header__status" /> : null}
          {pronto ? (
            <nav className="p-nav" aria-label="Menu do portal">
              <ul className="p-nav__list">
                {nav.map(([to, label, icon]) => (
                  <li key={to}>
                    <NavLink
                      to={`${base}/${to}`}
                      className={`p-nav__link${to === 'agendar' && pathname.startsWith(`${base}/agendamentos`) ? ' p-nav__link--on' : ''}`}
                    >
                      <span className="p-nav__icon">
                        <PIcon name={icon} size={22} />
                        {to === 'carrinho' && cartCount > 0 ? (
                          <span className="p-nav__count" aria-hidden="true">
                            {cartCount}
                          </span>
                        ) : null}
                      </span>
                      <span className="p-nav__label">
                        {label}
                        {to === 'carrinho' && cartCount > 0 ? <span className="sr-only">, {cartCount} itens</span> : null}
                      </span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
      </header>

      <main id="portal-conteudo" className="p-main">
        {loja.status === 'loading' ? (
          <Spinner label="Abrindo a loja" />
        ) : loja.status === 'inactive' ? (
          <Unavailable />
        ) : loja.status === 'error' ? (
          <LoadError />
        ) : (
          <div className="p-page" key={pathname}>
            <Outlet />
          </div>
        )}
      </main>

      <footer className="p-footer">
        <p>
          {signedIn ? (
            <>
              Você está logado como {session.account?.nome}.{' '}
              <button type="button" className="p-linkbtn" onClick={signOut}>
                Sair
              </button>
              <br />
            </>
          ) : null}
          <span className="p-footer__brand">Feito com TODAI</span>
          {' · '}
          <a href="/privacidade" target="_blank" rel="noopener noreferrer">
            Privacidade
          </a>
        </p>
      </footer>
    </div>
  );
}

function Unavailable() {
  return (
    <div className="p-page p-center">
      <PIcon name="store" size={44} />
      <h1 className="p-h1">Esta loja não está disponível agora</h1>
      <p className="p-muted">
        O endereço pode estar errado, ou a loja ainda não abriu o portal de pedidos. Confira o link com a loja.
      </p>
    </div>
  );
}

function LoadError() {
  const { reloadLoja } = usePortal();
  return (
    <div className="p-page p-center">
      <PIcon name="alert" size={44} />
      <h1 className="p-h1">Não foi possível abrir a loja</h1>
      <p className="p-muted">Pode ser uma falha de conexão. Tente de novo em instantes.</p>
      <button type="button" className="p-btn p-btn--primary" onClick={reloadLoja}>
        Tentar de novo
      </button>
    </div>
  );
}
