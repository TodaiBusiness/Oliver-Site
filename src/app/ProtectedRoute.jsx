import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';
import AdminDisabled from '../pages/AdminDisabled.jsx';

/**
 * Esconde rotas de quem não deveria vê-las.
 *
 * ⚠️ Isto é experiência de uso, não proteção. A API valida sessão e papel em
 * toda requisição — remover este componente não daria acesso a dado nenhum.
 */
export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, loading, configLoading, isAdmin, adminEnabled } = useAuth();
  const location = useLocation();

  if (loading || configLoading) {
    return (
      <div className="panel-loading" role="status" aria-live="polite">
        <span className="panel-loading__dot" />
        Carregando…
      </div>
    );
  }

  /* Administração do site desligada: aviso para todos (logados ou não), sem
     redirecionar para o login e sem montar nada do painel. */
  if (requireAdmin && !adminEnabled) {
    return <AdminDisabled />;
  }

  if (!user) {
    /* Guarda de onde veio para voltar ao destino depois do login. */
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (requireAdmin && !isAdmin) {
    return <Navigate to="/cliente" replace />;
  }

  return children;
}
