import Icon from '../Icon.jsx';
import EmptyState from './EmptyState.jsx';

/**
 * Esqueleto de carregamento. Reserva o espaço do conteúdo (menos "pulo" quando
 * os dados chegam) e é anunciado uma vez só, não item por item.
 */
export function Skeleton({ variant = 'rows', count = 4 }) {
  return (
    <div
      className={`skeleton skeleton--${variant}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">Carregando…</span>
      {Array.from({ length: count }, (_, indice) => (
        <span className="skeleton__item" key={indice} aria-hidden="true" />
      ))}
    </div>
  );
}

/** Erro de rede/servidor — nunca disfarçado de "lista vazia". */
export function ErrorState({ error, onRetry, title = 'Não foi possível carregar.' }) {
  return (
    <div className="state-error" role="alert">
      <span className="state-error__icon">
        <Icon name="close" size={18} />
      </span>
      <div className="state-error__body">
        <h3 className="state-error__title">{title}</h3>
        <p className="state-error__text">
          {error?.message ?? 'Algo deu errado.'} Seus dados não foram alterados.
        </p>
      </div>
      {onRetry ? (
        <button type="button" className="btn btn--ghost btn--xs" onClick={onRetry}>
          Tentar de novo
        </button>
      ) : null}
    </div>
  );
}

/**
 * Padrão único de dados remotos: carregando → erro → vazio → conteúdo.
 *
 * `loading` só vale enquanto não há nada para mostrar; numa recarga o
 * conteúdo anterior fica na tela. `empty` decide se o vazio aparece.
 */
export default function DataState({
  loading,
  error,
  empty,
  onRetry,
  skeleton = 'rows',
  skeletonCount,
  errorTitle,
  emptyProps,
  children,
}) {
  if (error && !loading) {
    return <ErrorState error={error} onRetry={onRetry} title={errorTitle} />;
  }
  if (loading) return <Skeleton variant={skeleton} count={skeletonCount} />;
  if (empty) return <EmptyState {...emptyProps} />;
  return children;
}
