/**
 * Moldura das páginas internas da loja (comprar, obrigado, baixar, termos,
 * privacidade, minha licença). Navbar, rodapé e <main> vêm do SiteLayout; aqui
 * fica só o recuo e a largura do conteúdo.
 */
export default function SiteShell({ children }) {
  return <div className="shell__main container">{children}</div>;
}
