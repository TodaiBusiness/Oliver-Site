import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import PanelIcon from '../../components/panel/PanelIcon.jsx';
import PageHead from '../../components/panel/PageHead.jsx';
import DataState from '../../components/panel/DataState.jsx';
import StatusBadge from '../../components/panel/StatusBadge.jsx';
import { tempoRelativo } from '../../components/panel/format.js';
import { useApi } from '../../hooks/useApi.js';
import { useEventStream } from '../../hooks/useEventStream.js';
import { debounce } from '../../hooks/eventStreamCore.js';
import { api } from '../../api/client.js';
import { useAuth } from '../../app/AuthContext.jsx';
import { useEffect, useRef } from 'react';

const primeiroNome = (nome = '') => nome.trim().split(' ')[0];

/* Etapas de um projeto, na ordem em que acontecem. */
const ETAPAS = [
  { status: 'RASCUNHO', label: 'Planejamento' },
  { status: 'EM_DESENVOLVIMENTO', label: 'Em andamento' },
  { status: 'ENTREGUE', label: 'Entregue' },
];

/**
 * O que o cliente deve fazer agora. Prioridade: mensagem não lida, orçamento
 * esperando resposta, primeira solicitação, e por fim só acompanhar.
 */
function proximoPasso({ unread, solicitacoes, conversas }) {
  if (unread > 0) {
    const alvo = conversas.find((c) => c.unread > 0);
    return {
      titulo: unread === 1 ? 'Você tem 1 mensagem para ler' : `Você tem ${unread} mensagens para ler`,
      texto: alvo
        ? `A equipe respondeu em “${alvo.type}”. Abra a conversa para continuar.`
        : 'A equipe respondeu. Abra a conversa para continuar.',
      acao: { to: alvo ? `/cliente/mensagens/${alvo.requestId}` : '/cliente/mensagens', label: 'Abrir conversa' },
    };
  }
  const orcamento = solicitacoes.find((s) => s.status === 'ORCAMENTO');
  if (orcamento) {
    return {
      titulo: 'Há um orçamento esperando sua resposta',
      texto: `Veja os detalhes de “${orcamento.type}” e responda por lá.`,
      acao: { to: `/cliente/solicitacoes/${orcamento.id}`, label: 'Ver solicitação' },
    };
  }
  if (solicitacoes.length === 0) {
    return {
      titulo: 'Abra sua primeira solicitação',
      texto: 'Conte o que você precisa desenvolver. A resposta chega aqui, na área do cliente.',
      acao: { to: '/cliente/solicitacoes', label: 'Nova solicitação' },
    };
  }
  return {
    titulo: 'Tudo em dia por aqui',
    texto: 'Nada espera por você agora. Se surgir uma nova necessidade, é só abrir uma solicitação.',
    acao: { to: '/cliente/solicitacoes', label: 'Nova solicitação' },
  };
}

function Linha({ status }) {
  const atual = ETAPAS.findIndex((etapa) => etapa.status === status);
  return (
    <ol className="steps" aria-label="Andamento do projeto">
      {ETAPAS.map((etapa, indice) => {
        const entregue = status === 'ENTREGUE';
        const estado = indice < atual || (entregue && indice === atual) ? 'done' : indice === atual ? 'now' : 'todo';
        return (
          <li key={etapa.status} className={`steps__item steps__item--${estado}`} aria-current={estado === 'now' ? 'step' : undefined}>
            <span className="steps__dot" aria-hidden="true">
              {estado === 'done' ? <Icon name="check" size={11} strokeWidth={2.4} /> : null}
            </span>
            <span className="steps__label">
              {etapa.label}
              <span className="sr-only">{estado === 'done' ? ' (concluída)' : estado === 'now' ? ' (etapa atual)' : ' (próxima)'}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const AVISO_2FA = 'todai.aviso2fa.dispensado';

/** Sugestão discreta de ativar a verificação em duas etapas; dispensável. */
function AvisoSeguranca({ user }) {
  const [oculto, setOculto] = useState(() => {
    try {
      return localStorage.getItem(AVISO_2FA) === '1';
    } catch {
      return false;
    }
  });
  if (oculto || !user || user.twoFactorEnabled) return null;
  const dispensar = () => {
    setOculto(true);
    try {
      localStorage.setItem(AVISO_2FA, '1');
    } catch {
      /* sem armazenamento: o aviso some só nesta visita */
    }
  };
  return (
    <aside className="sec-nudge" aria-label="Sugestão de segurança">
      <p className="sec-nudge__text">
        Quer proteger melhor a sua conta? Ative a verificação em duas etapas.{' '}
        <Link to="/cliente/seguranca">Ver como ativar</Link>
      </p>
      <button type="button" className="sec-nudge__close" onClick={dispensar} aria-label="Dispensar sugestão">
        Dispensar
      </button>
    </aside>
  );
}

export default function ClientDashboard() {
  const { user } = useAuth();

  const resumo = useApi(() => api.get('/me/summary'));
  const projetos = useApi(() => api.get('/me/projects'));
  const solicitacoes = useApi(() => api.get('/me/requests'));
  const conversas = useApi(() => api.get('/conversations'));

  /* Mensagem nova ou lida: o aviso de "mensagens para ler" atualiza na hora. */
  const refazerMensagens = useRef(null);
  refazerMensagens.current = () => {
    resumo.reload();
    conversas.reload();
  };
  const agendar = useRef(null);
  agendar.current ??= debounce(() => refazerMensagens.current(), 300);
  useEventStream({
    onMessage: () => agendar.current(),
    onRead: () => agendar.current(),
    onResync: () => agendar.current(),
  });
  useEffect(() => () => agendar.current.cancel(), []);

  const carregando = resumo.loading || projetos.loading || solicitacoes.loading;
  const erro = resumo.error || projetos.error || solicitacoes.error;
  const refazer = () => {
    resumo.reload();
    projetos.reload();
    solicitacoes.reload();
    conversas.reload();
  };

  const numeros = resumo.data?.summary ?? { projects: 0, requests: 0, unreadMessages: 0 };
  const listaProjetos = projetos.data?.projects ?? [];
  const listaSolicitacoes = solicitacoes.data?.requests ?? [];
  const passo = proximoPasso({
    unread: numeros.unreadMessages,
    solicitacoes: listaSolicitacoes,
    conversas: conversas.data?.conversations ?? [],
  });

  return (
    <>
      <PageHead
        title={`Olá, ${primeiroNome(user?.name)}.`}
        titleText="Painel"
        subtitle="Seus projetos, solicitações e conversas em um lugar."
      />

      <AvisoSeguranca user={user} />

      <DataState
        loading={carregando}
        error={erro}
        onRetry={refazer}
        skeleton="stats"
        skeletonCount={3}
        errorTitle="Não foi possível carregar seu painel."
      >
        <section className="next" aria-labelledby="proximo">
          <div className="next__body">
            <p className="next__kicker">Próximo passo</p>
            <h2 className="next__title" id="proximo">
              {passo.titulo}
            </h2>
            <p className="next__text">{passo.texto}</p>
          </div>
          <Link className="btn btn--primary btn--sm next__cta" to={passo.acao.to}>
            {passo.acao.label}
            <Icon name="arrowRight" size={15} className="btn__icon" />
          </Link>
        </section>

        <dl className="ledger ledger--3">
          <div className="ledger__cell">
            <dt>
              <Link to="/cliente/solicitacoes">Projetos</Link>
            </dt>
            <dd>{numeros.projects}</dd>
          </div>
          <div className="ledger__cell">
            <dt>
              <Link to="/cliente/solicitacoes">Solicitações</Link>
            </dt>
            <dd>{numeros.requests}</dd>
          </div>
          <div className={`ledger__cell${numeros.unreadMessages > 0 ? ' is-hot' : ''}`}>
            <dt>
              <Link to="/cliente/mensagens">Mensagens não lidas</Link>
            </dt>
            <dd>{numeros.unreadMessages}</dd>
          </div>
        </dl>

        <section className="block" aria-labelledby="projetos">
          <h2 className="block__title" id="projetos">
            Seus projetos
          </h2>

          {listaProjetos.length === 0 ? (
            <div className="empty empty--inline">
              <h3 className="empty__title">Nenhum projeto vinculado ainda.</h3>
              <p className="empty__text">Quando um projeto for iniciado, o andamento aparece aqui, etapa por etapa.</p>
            </div>
          ) : (
            <ul className="projects">
              {listaProjetos.map((projeto) => (
                <li key={projeto.id} className="project">
                  <div className="project__head">
                    <div>
                      <h3 className="project__title">{projeto.title}</h3>
                      <p className="project__meta">{projeto.category}</p>
                    </div>
                    <StatusBadge status={projeto.status} />
                  </div>
                  {projeto.tagline ? <p className="project__text">{projeto.tagline}</p> : null}
                  <Linha status={projeto.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="block" aria-labelledby="ultimas">
          <div className="block__head">
            <h2 className="block__title" id="ultimas">
              Últimas solicitações
            </h2>
            {listaSolicitacoes.length > 0 ? (
              <Link className="block__link" to="/cliente/solicitacoes">
                Ver todas
                <Icon name="arrowRight" size={14} />
              </Link>
            ) : null}
          </div>

          {listaSolicitacoes.length === 0 ? (
            <div className="empty empty--inline">
              <h3 className="empty__title">Nenhuma solicitação por enquanto.</h3>
              <p className="empty__text">Conte o que você precisa desenvolver e retornamos por aqui.</p>
              <Link className="btn btn--primary btn--sm" to="/cliente/solicitacoes">
                <PanelIcon name="plus" size={16} />
                Abrir solicitação
              </Link>
            </div>
          ) : (
            <ul className="rows">
              {listaSolicitacoes.slice(0, 4).map((item) => (
                <li key={item.id}>
                  <Link className="row" to={`/cliente/solicitacoes/${item.id}`}>
                    <span className="row__main">
                      <span className="row__title">{item.type}</span>
                      <span className="row__text">{item.description}</span>
                      <span className="row__meta">{tempoRelativo(item.created_at)}</span>
                    </span>
                    <StatusBadge status={item.status} />
                    <Icon name="arrowRight" size={16} className="row__arrow" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </DataState>
    </>
  );
}
