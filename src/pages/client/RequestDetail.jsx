import { Link, useParams } from 'react-router-dom';
import PageHead from '../../components/panel/PageHead.jsx';
import StatusBadge from '../../components/panel/StatusBadge.jsx';
import DataState from '../../components/panel/DataState.jsx';
import Chat from '../../components/chat/Chat.jsx';
import { formatarDataHora } from '../../components/panel/format.js';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../api/client.js';
import { useAuth } from '../../app/AuthContext.jsx';

/**
 * Detalhe da solicitação + conversa. A mesma tela serve para o cliente e para
 * o admin — quem decide o que cada um pode ver é a API.
 */
export default function RequestDetail({ basePath = '/cliente/solicitacoes' }) {
  const { id } = useParams();
  const { user } = useAuth();

  const solicitacao = useApi(() => api.get(`/requests/${id}`), [id]);
  const item = solicitacao.data?.request;
  const naoEncontrada = solicitacao.error?.status === 404;

  const crumbs = [{ label: 'Solicitações', to: basePath }, { label: item?.type ?? 'Detalhe' }];

  if (!item) {
    return (
      <>
        <PageHead title="Solicitação" crumbs={crumbs} />
        <DataState
          loading={solicitacao.loading}
          error={solicitacao.error}
          onRetry={solicitacao.reload}
          errorTitle={naoEncontrada ? 'Solicitação não encontrada.' : 'Não foi possível carregar a solicitação.'}
        />
        {naoEncontrada ? (
          <p className="state-hint">
            Ela pode ter sido removida ou não pertence à sua conta.{' '}
            <Link to={basePath}>Voltar para a lista</Link>
          </p>
        ) : null}
      </>
    );
  }

  return (
    <>
      <PageHead
        title={item.type}
        crumbs={crumbs}
        subtitle={`Aberta em ${formatarDataHora(item.created_at)}${item.user_name ? ` por ${item.user_name}` : ''}`}
        actions={<StatusBadge status={item.status} />}
      />

      <div className="detail-grid">
        <section className="block" aria-labelledby="descricao">
          <h2 className="block__title" id="descricao">
            Descrição
          </h2>
          <div className="detail-card">
            <p className="detail-card__text">{item.description}</p>

            {item.budget || item.deadline ? (
              <dl className="detail-card__meta">
                {item.budget ? (
                  <div>
                    <dt>Orçamento</dt>
                    <dd>{item.budget}</dd>
                  </div>
                ) : null}
                {item.deadline ? (
                  <div>
                    <dt>Prazo</dt>
                    <dd>{item.deadline}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>
        </section>

        <section className="block" aria-labelledby="conversa">
          <h2 className="block__title" id="conversa">
            Conversa
          </h2>
          <Chat requestId={id} currentUser={user} />
        </section>
      </div>
    </>
  );
}
