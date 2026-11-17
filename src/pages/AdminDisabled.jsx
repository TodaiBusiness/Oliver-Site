import { Link } from 'react-router-dom';
import Logo from '../components/Logo.jsx';

/**
 * Tela de /admin/* quando a administração do site está desligada
 * (SITE_ADMIN_ENABLED=false). Não expõe nada do painel antigo.
 */
export default function AdminDisabled() {
  return (
    <main className="auth">
      <div className="auth__panel">
        <Link className="auth__brand" to="/">
          <Logo size={30} />
        </Link>

        <h1 className="auth__title">A administração agora é no Panel</h1>
        <p className="auth__text">
          Esta área do site foi desativada. A equipe TODAI atende e administra tudo pelo
          Panel TODAI.
        </p>

        <Link className="btn btn--primary btn--block" to="/">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
