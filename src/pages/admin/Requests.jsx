import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import PanelIcon from '../../components/panel/PanelIcon.jsx';
import PageHead from '../../components/panel/PageHead.jsx';
import DataState from '../../components/panel/DataState.jsx';
import LoadMore from '../../components/panel/LoadMore.jsx';
import { useToast } from '../../components/panel/Toast.jsx';
import StatusBadge, { statusLabel } from '../../components/panel/StatusBadge.jsx';
import { tempoRelativo } from '../../components/panel/format.js';
import { usePaged } from '../../hooks/useApi.js';
import { api, withQuery } from '../../api/client.js';

const STATUS = ['NOVO', 'EM_ANALISE', 'ORCAMENTO', 'EM_DESENVOLVIMENTO', 'CONCLUIDO', 'CANCELADO'];
const TAMANHO = 20;

export default function AdminRequests() {
  const toast = useToast();
  const [filtro, setFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [alterando, setAlterando] = useState(null);

  const lista = usePaged(
    async (page, limit) =>
      (await api.get(withQuery('/admin/requests', { status: filtro, limit, page }))).requests,
    [filtro],
    TAMANHO
  );

  /* Busca sobre o que já está carregado: a API filtra só por status. */
  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return lista.items;
    return lista.items.filter((item) =>
      [item.type, item.user_name, item.user_email].some((campo) => campo?.toLowerCase().includes(termo))
    );
  }, [lista.items, busca]);

  const aplicarLocal = (id, status) =>
    lista.setItems((atuais) => atuais.map((item) => (item.id === id ? { ...item, status } : item)));

  const enviar = (id, status) => api.patch(`/admin/requests/${id}/status`, { status });

  const mudarStatus = async (item, novo) => {
    const antigo = item.status;
    if (novo === antigo) return;

    setAlterando(item.id);
    aplicarLocal(item.id, novo);
    try {
      await enviar(item.id, novo);
      toast.success(`${item.type} de ${item.user_name}: ${statusLabel(novo)}.`, {
        action: {
          label: 'Desfazer',
          onClick: async () => {
            aplicarLocal(item.id, antigo);
            try {
              await enviar(item.id, antigo);
              toast.success(`Status voltou para ${statusLabel(antigo)}.`);
            } catch (problema) {
              aplicarLocal(item.id, novo);
              toast.error(`Não foi possível desfazer. ${problema.message}`);
            }
          },
        },
      });
    } catch (problema) {
      aplicarLocal(item.id, antigo);
      toast.error(`Status não alterado. ${problema.message}`);
    } finally {
      setAlterando(null);
    }
  };

  return (
    <>
      <PageHead title="Solicitações" subtitle="Acompanhe e atualize o andamento de cada pedido." />

      <div className="toolbar">
        <div className="filters" role="group" aria-label="Filtrar por status">
          <button
            type="button"
            className={`chip${filtro === '' ? ' is-active' : ''}`}
            aria-pressed={filtro === ''}
            onClick={() => setFiltro('')}
          >
            Todas
          </button>
          {STATUS.map((status) => (
            <button
              key={status}
              type="button"
              className={`chip${filtro === status ? ' is-active' : ''}`}
              aria-pressed={filtro === status}
              onClick={() => setFiltro(status)}
            >
              {statusLabel(status)}
            </button>
          ))}
        </div>

        <div className="search__field toolbar__search">
          <PanelIcon name="search" size={16} />
          <label className="sr-only" htmlFor="busca-sol">
            Filtrar solicitações carregadas por tipo ou cliente
          </label>
          <input
            id="busca-sol"
            type="search"
            className="field__control"
            placeholder="Filtrar por tipo ou cliente"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />
        </div>
      </div>

      <DataState
        loading={lista.loading}
        error={lista.error}
        onRetry={lista.reload}
        skeleton="table"
        errorTitle="Não foi possível carregar as solicitações."
        empty={visiveis.length === 0}
        emptyProps={{
          icon: 'chat',
          title: busca
            ? 'Nada com esse termo nas solicitações carregadas.'
            : filtro
              ? `Nenhuma solicitação em “${statusLabel(filtro)}”.`
              : 'Nenhuma solicitação ainda.',
          text: busca
            ? lista.hasMore
              ? 'Carregue mais itens ou limpe o filtro.'
              : 'Tente outro termo.'
            : filtro
              ? 'Escolha outro status para ver as demais.'
              : 'Quando um cliente abrir uma, ela aparece aqui.',
          action:
            busca || filtro ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => {
                  setBusca('');
                  setFiltro('');
                }}
              >
                Limpar filtros
              </button>
            ) : null,
        }}
      >
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Solicitações dos clientes</caption>
            <thead>
              <tr>
                <th scope="col">Tipo</th>
                <th scope="col">Cliente</th>
                <th scope="col">Recebida</th>
                <th scope="col">Status</th>
                <th scope="col">Alterar para</th>
                <th scope="col">
                  <span className="sr-only">Abrir</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((item) => (
                <tr key={item.id}>
                  <td data-label="Tipo">
                    <strong>{item.type}</strong>
                  </td>
                  <td data-label="Cliente">
                    <span className="table__stack">
                      <span>{item.user_name}</span>
                      <span className="table__muted">{item.user_email}</span>
                    </span>
                  </td>
                  <td data-label="Recebida">
                    <span className="table__muted">{tempoRelativo(item.created_at)}</span>
                  </td>
                  <td data-label="Status">
                    <StatusBadge status={item.status} />
                  </td>
                  <td data-label="Alterar para">
                    <label className="sr-only" htmlFor={`status-${item.id}`}>
                      Novo status de {item.type} de {item.user_name}
                    </label>
                    <select
                      id={`status-${item.id}`}
                      className="field__control field__control--sm"
                      value={item.status}
                      disabled={alterando === item.id}
                      onChange={(event) => mudarStatus(item, event.target.value)}
                    >
                      {STATUS.map((status) => (
                        <option key={status} value={status}>
                          {statusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td data-label="">
                    <Link className="btn btn--soft btn--xs" to={`/admin/solicitacoes/${item.id}`}>
                      Abrir
                      <Icon name="arrowRight" size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

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
