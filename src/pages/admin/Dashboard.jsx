import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import PanelIcon from '../../components/panel/PanelIcon.jsx';
import PageHead from '../../components/panel/PageHead.jsx';
import DataState from '../../components/panel/DataState.jsx';
import StatusBadge from '../../components/panel/StatusBadge.jsx';
import { tempoRelativo } from '../../components/panel/format.js';
import { useApi } from '../../hooks/useApi.js';
import { api, withQuery } from '../../api/client.js';

/** Todos os números vêm do banco — nada é inventado. */
export default function AdminDashboard() {
  const resumo = useApi(() => api.get('/admin/summary'));
  const recentes = useApi(() => api.get(withQuery('/admin/requests', { limit: 6 })));
  const naoLidas = useApi(() => api.get('/conversations/unread'));

  const numeros = resumo.data?.summary ?? {};
  const lista = recentes.data?.requests ?? [];
  const unread = naoLidas.data?.unread ?? 0;
  const novas = numeros.pendingRequests ?? 0;

  /* O que pede ação agora vem primeiro; o resto é contexto. */
  const atencao = [
    {
      to: '/admin/solicitacoes',
      texto: novas === 1 ? '1 solicitação nova para analisar' : `${novas} solicitações novas para analisar`,
      ativo: novas > 0,
      vazio: 'Nenhuma solicitação nova',
      icon: 'bolt',
    },
    {
      to: '/admin/mensagens',
      texto: unread === 1 ? '1 mensagem não lida' : `${unread} mensagens não lidas`,
      ativo: unread > 0,
      vazio: 'Nenhuma mensagem não lida',
      icon: 'chat',
    },
  ];

  const indicadores = [
    { label: 'Clientes', valor: numeros.clients, to: '/admin/clientes' },
    { label: 'Projetos', valor: numeros.projects, to: '/admin/projetos' },
    { label: 'Solicitações', valor: numeros.requests, to: '/admin/solicitacoes' },
    { label: 'Mensagens trocadas', valor: numeros.messages, to: '/admin/mensagens' },
  ];

  return (
    <>
      <PageHead title="Visão geral" subtitle="O que precisa de você hoje e como está a operação." />

      <DataState
        loading={resumo.loading}
        error={resumo.error}
        onRetry={resumo.reload}
        skeleton="stats"
        skeletonCount={4}
        errorTitle="Não foi possível carregar o resumo."
      >
        <dl className="ledger">
          {indicadores.map((item) => (
            <div className="ledger__cell" key={item.label}>
              <dt>
                <Link to={item.to}>{item.label}</Link>
              </dt>
              <dd>{item.valor ?? 0}</dd>
            </div>
          ))}
        </dl>

        <div className="split">
          <section className="block" aria-labelledby="recentes">
            <div className="block__head">
              <h2 className="block__title" id="recentes">
                Solicitações recentes
              </h2>
              <Link className="block__link" to="/admin/solicitacoes">
                Ver todas
                <Icon name="arrowRight" size={14} />
              </Link>
            </div>

            <DataState
              loading={recentes.loading}
              error={recentes.error}
              onRetry={recentes.reload}
              empty={lista.length === 0}
              emptyProps={{
                icon: 'chat',
                title: 'Nenhuma solicitação recebida ainda.',
                text: 'Quando um cliente abrir uma solicitação, ela aparece aqui.',
              }}
            >
              <ul className="rows">
                {lista.map((item) => (
                  <li key={item.id}>
                    <Link className="row" to={`/admin/solicitacoes/${item.id}`}>
                      <span className="row__main">
                        <span className="row__title">{item.type}</span>
                        <span className="row__text">
                          {item.user_name} · {tempoRelativo(item.created_at)}
                        </span>
                      </span>
                      <StatusBadge status={item.status} />
                      <Icon name="arrowRight" size={16} className="row__arrow" />
                    </Link>
                  </li>
                ))}
              </ul>
            </DataState>
          </section>

          <aside className="block" aria-labelledby="atencao">
            <h2 className="block__title" id="atencao">
              Precisa de atenção
            </h2>
            <ul className="todo">
              {atencao.map((item) => (
                <li key={item.to}>
                  <Link className={`todo__item${item.ativo ? ' is-on' : ''}`} to={item.to}>
                    <Icon name={item.icon} size={16} />
                    <span>{item.ativo ? item.texto : item.vazio}</span>
                    <Icon name="arrowRight" size={14} className="row__arrow" />
                  </Link>
                </li>
              ))}
            </ul>

            <h2 className="block__title block__title--gap">Atalhos</h2>
            <ul className="todo">
              <li>
                <Link className="todo__item" to="/admin/projetos?novo=1">
                  <PanelIcon name="plus" size={16} />
                  <span>Cadastrar projeto</span>
                </Link>
              </li>
              <li>
                <Link className="todo__item" to="/admin/clientes">
                  <PanelIcon name="search" size={16} />
                  <span>Buscar cliente</span>
                </Link>
              </li>
              <li>
                <Link className="todo__item" to="/admin/auditoria">
                  <PanelIcon name="clock" size={16} />
                  <span>Ver auditoria</span>
                </Link>
              </li>
            </ul>
          </aside>
        </div>
      </DataState>
    </>
  );
}
