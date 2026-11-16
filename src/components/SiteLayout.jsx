import { useEffect, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Header from '../sections/Header.jsx';
import Footer from '../sections/Footer.jsx';
import FloatingWhatsApp from './FloatingWhatsApp.jsx';

/**
 * Casca do site público: navbar, rodapé e a página da rota dentro de <Outlet/>.
 * Ao trocar de rota, volta ao topo (ou vai à âncora) e move o foco para o
 * conteúdo, para leitores de tela e teclado começarem da página nova.
 */
export default function SiteLayout() {
  const { pathname, hash } = useLocation();
  const mainRef = useRef(null);
  const first = useRef(true);

  useEffect(() => {
    if (hash) {
      const target = document.getElementById(decodeURIComponent(hash.slice(1)));
      if (target) {
        target.scrollIntoView();
        return;
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (first.current) first.current = false;
    else mainRef.current?.focus({ preventScroll: true });
  }, [pathname, hash]);

  return (
    <>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <Header />
      <main id="conteudo" ref={mainRef} tabIndex={-1} className="site-main">
        {/* A chave refaz a página a cada rota: dispara a entrada suave. */}
        <div className="page" key={pathname}>
          <Outlet />
        </div>
      </main>
      <Footer />
      <FloatingWhatsApp />
    </>
  );
}
