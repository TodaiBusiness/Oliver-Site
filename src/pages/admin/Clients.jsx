import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import PanelIcon from '../../components/panel/PanelIcon.jsx';
import PageHead from '../../components/panel/PageHead.jsx';
import DataState from '../../components/panel/DataState.jsx';
import LoadMore from '../../components/panel/LoadMore.jsx';
import { formatarData, inicial, plural } from '../../components/panel/format.js';
import { usePaged } from '../../hooks/useApi.js';
import { api, withQuery } from '../../api/client.js';

const TAMANHO = 24;

/** Lista de clientes: busca no servidor, "carregar mais" e card que leva à ficha. */
export default function AdminClients() {
  const [busca, setBusca] = useState('');
  const [termo, setTermo] = useState('');

  const lista = usePaged(
    async (page, limit) =>
      (await api.get(withQuery('/admin/clients', { search: termo, limit, page }))).clients,
    [termo],
    TAMANHO
  );

  const buscar = (event) => {
    event.preventDefault();
    setTermo(busca.trim());
  };

  const limpar = () => {
    setBusca('');
    setTermo('');
  };

  return (
    <>
      <PageHead
        title="Clientes"
        subtitle="Quem tem conta na área do cliente. Abra uma ficha para vincular projetos e ver as solicitações."
      />

      <form className="search" onSubmit={buscar} role="search">
        <label className="sr-only" htmlFor="busca">
          Buscar cliente
        </label>
        <div className="search__field">
          <PanelIcon name="search" size={16} />
          <input
            id="busca"
            className="field__control"
            type="search"
            placeholder="Buscar por nome, e-mail ou empresa"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />
        </div>
        <button type="submit" className="btn btn--ghost btn--sm">
          Buscar
        </button>
        {termo ? (
          <button type="button" className="btn btn--soft btn--sm" onClick={limpar}>
            Limpar
          </button>
        ) : null}
      </form>

      {termo && !lista.loading && !lista.error ? (
        <p className="search__result" role="status">
          {plural(lista.items.length, 'resultado', 'resultados')} para “{termo}”
          {lista.hasMore ? ' (há mais abaixo)' : ''}
        </p>
      ) : null}

      <DataState
        loading={lista.loading}
        error={lista.error}
        onRetry={lista.reload}
        skeleton="cards"
        skeletonCount={6}
        errorTitle="Não foi possível carregar os clientes."
        empty={lista.items.length === 0}
        emptyProps={{
          icon: 'users',
          title: termo ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.',
          text: termo
            ? 'Tente outro nome, e-mail ou empresa.'
            : 'Assim que alguém criar uma conta pelo site, aparece aqui.',
          action: termo ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={limpar}>
              Limpar busca
            </button>
          ) : null,
        }}
      >
        <ul className="client-cards">
          {lista.items.map((cliente) => (
            <li key={cliente.id}>
              <Link className="client-card" to={`/admin/clientes/${cliente.id}`}>
                <span className="client-card__top">
                  <span className="client-card__avatar" aria-hidden="true">
                    {inicial(cliente.name)}
                  </span>

                  <span className="client-card__id">
                    <span className="client-card__name">{cliente.name}</span>
                    <span className="client-card__company">
                      {cliente.company || 'Sem empresa informada'}
                    </span>
                  </span>

                  <Icon name="arrowRight" size={16} className="client-card__arrow" />
                </span>

                <span className="client-card__contact">
                  <span className="client-card__line">
                    <Icon name="mail" size={13} />
                    {cliente.email}
                  </span>
                  {cliente.phone ? (
                    <span className="client-card__line">
                      <Icon name="chat" size={13} />
                      {cliente.phone}
                    </span>
                  ) : null}
                </span>

                <span className="client-card__stats">
                  <span className={`client-pill${cliente.projects_count > 0 ? ' is-on' : ''}`}>
                    <Icon name="layers" size={13} />
                    {plural(cliente.projects_count ?? 0, 'projeto', 'projetos')}
                  </span>
                  <span className={`client-pill${cliente.requests_count > 0 ? ' is-on' : ''}`}>
                    <Icon name="bolt" size={13} />
                    {plural(cliente.requests_count ?? 0, 'solicitação', 'solicitações')}
                  </span>
                  <span className="client-card__since">desde {formatarData(cliente.created_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <LoadMore
          hasMore={lista.hasMore}
          loading={lista.loadingMore}
          error={lista.moreError}
          onClick={lista.loadMore}
          shown={lista.items.length}
        />
      </DataState>
    </>
  );
}
