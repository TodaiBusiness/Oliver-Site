/** Rodapé de listas paginadas: "Carregar mais" e um aviso de fim da lista. */
export default function LoadMore({ hasMore, loading, error, onClick, shown }) {
  if (!hasMore && !error) {
    return shown > 0 ? <p className="load-more__end">Fim da lista · {shown} no total</p> : null;
  }

  return (
    <div className="load-more">
      {error ? (
        <p className="load-more__error" role="alert">
          Não foi possível carregar mais. {error.message}
        </p>
      ) : null}
      <button type="button" className="btn btn--ghost btn--sm" onClick={onClick} disabled={loading}>
        {loading ? 'Carregando…' : error ? 'Tentar de novo' : 'Carregar mais'}
      </button>
    </div>
  );
}
