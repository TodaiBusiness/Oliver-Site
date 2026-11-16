import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useAuth } from '../app/AuthContext.jsx';

/**
 * Acesso à conta a partir do site público.
 * Quem já entrou vai direto para o painel certo (admin ou cliente); quem não
 * entrou vê "Entrar". Enquanto a sessão é verificada, o botão fica neutro
 * para não piscar entre os dois estados.
 */
export default function AccountButton({ className = '', onNavigate }) {
  const { user, loading, isAdmin } = useAuth();

  if (loading) {
    return (
      <span className={`btn btn--primary btn--sm account-btn is-loading ${className}`.trim()}>
        <Icon name="cpu" size={16} />
        Conta
      </span>
    );
  }

  const destino = user ? (isAdmin ? '/admin' : '/cliente') : '/login';
  const rotulo = user ? (isAdmin ? 'Painel admin' : 'Área do cliente') : 'Entrar';

  return (
    <Link
      className={`btn ${user ? 'btn--primary' : 'btn--ghost'} btn--sm account-btn ${className}`.trim()}
      to={destino}
      onClick={onNavigate}
    >
      {user ? <Icon name="dashboard" size={16} /> : null}
      {rotulo}
    </Link>
  );
}
