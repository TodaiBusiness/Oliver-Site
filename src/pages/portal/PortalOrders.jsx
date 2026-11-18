import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { usePortal } from './PortalContext.jsx';
import { EmptyState, Notice, PIcon, PageTitle, Spinner, StatusBadge, usePolling, useLoad } from './ui.jsx';
import { ESTADOS_FINAIS, ETAPAS, PAGAMENTOS, brl, estadoInfo, formatDate, formatDateTime, podeCancelarPedido, qty } from './format.js';

const POLL_MS = 20_000;

/** Repete um pedido: junta no carrinho o que ainda está à venda e leva para o carrinho, avisando o que ficou de fora. */
function useRepeat() {
  const { loadCatalog, replaceCart, path } = usePortal();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const repeat = async (pedido) => {
    setBusy(true);
    setError(null);
    const catalogo = await loadCatalog({ force: true });
    setBusy(false);
    if (!catalogo) return setError('Não foi possível conferir o catálogo agora. Tente de novo.');
    const items = [];
    const skipped = [];
    for (const item of pedido.itens) {
      const produto = catalogo.produtos.find((p) => p.id === item.produtoId);
      if (produto?.disponivel) items.push({ id: produto.id, qty: item.quantidade });
      else skipped.push(item.nome);
    }
    if (!items.length) return setError('Nenhum item deste pedido está disponível agora.');
    replaceCart(items);
    navigate(path('carrinho'), { state: { skipped } });
  };
  return { repeat, busy, error };
}

/* ------------------------------------------------------------ lista */
export function PortalOrders() {
  const { api, path } = usePortal();
  const [state, reload] = useLoad(() => api.pedidos().then((r) => r.pedidos), [api]);
  const { repeat, busy, error } = useRepeat();
  const [announce, setAnnounce] = useState('');
  const known = useRef(new Map());

  const pedidos = state.data ?? [];
  const andamento = pedidos.some((p) => !ESTADOS_FINAIS.has(p.estado));
  usePolling(() => reload(true), POLL_MS, andamento);

  /* Estado que mudou desde a última leitura vira aviso para leitor de tela. */
  useEffect(() => {
    if (!state.data) return;
    const changes = [];
    for (const p of state.data) {
      const before = known.current.get(p.id);
      if (before && before !== p.estado) changes.push(`Pedido ${p.referencia}: ${estadoInfo(p.estado).label}.`);
      known.current.set(p.id, p.estado);
    }
    if (changes.length) setAnnounce(changes.join(' '));
  }, [state.data]);

  const last = pedidos[0];

  return (
    <div>
      <PageTitle sub={andamento ? 'Os pedidos em andamento atualizam sozinhos.' : undefined}>Meus pedidos</PageTitle>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {state.status === 'loading' ? <Spinner label="Carregando os pedidos" /> : null}
      {state.status === 'error' ? (
        <EmptyState
          icon="alert"
          title="Não foi possível carregar os pedidos"
          action={
            <button type="button" className="p-btn p-btn--primary" onClick={() => reload()}>
              Tentar de novo
            </button>
          }
        >
          {state.error?.message}
        </EmptyState>
      ) : null}
      {state.status === 'ready' && pedidos.length === 0 ? (
        <EmptyState
          icon="receipt"
          title="Você ainda não fez pedidos"
          action={
            <Link className="p-btn p-btn--primary" to={path('catalogo')}>
              Ver o catálogo
            </Link>
          }
        >
          Quando você enviar um pedido, ele aparece aqui com o andamento.
        </EmptyState>
      ) : null}

      {last ? (
        <button type="button" className="p-btn p-btn--ghost p-btn--block p-repeat" onClick={() => repeat(last)} disabled={busy}>
          <PIcon name="repeat" size={18} /> {busy ? 'Conferindo o catálogo…' : `Repetir o último pedido (${last.referencia})`}
        </button>
      ) : null}

      <ul className="p-orders">
        {pedidos.map((p) => (
          <li key={p.id}>
            <Link className="p-order" to={path(`pedidos/${p.id}`)}>
              <span className="p-order__top">
                <strong>{p.referencia}</strong>
                <StatusBadge estado={p.estado} />
              </span>
              <span className="p-muted p-small">{formatDateTime(p.criadoEm)}</span>
              <span className="p-order__bottom">
                <span>
                  {p.itens.length} {p.itens.length === 1 ? 'item' : 'itens'}
                  {p.entrega?.data ? ` · ${p.entrega.tipo === 'entrega' ? 'entrega' : 'retirada'} em ${formatDate(p.entrega.data)}` : ''}
                </span>
                <strong>{brl(p.total)}</strong>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------------------------------- detalhe */
function Timeline({ estado }) {
  if (estado === 'recusado' || estado === 'cancelado') return null;
  const atual = ETAPAS.indexOf(estado);
  return (
    <ol className="p-steps" aria-label="Andamento do pedido">
      {ETAPAS.map((etapa, index) => (
        <li key={etapa} className={`p-step${index < atual ? ' p-step--done' : ''}${index === atual ? ' p-step--now' : ''}`} aria-current={index === atual ? 'step' : undefined}>
          <span className="p-step__dot" aria-hidden="true">
            {index < atual ? <PIcon name="check" size={14} /> : index + 1}
          </span>
          <span className="p-step__label">{estadoInfo(etapa).label}</span>
        </li>
      ))}
    </ol>
  );
}

export function PortalOrder() {
  const { id } = useParams();
  const { api, loja, path } = usePortal();
  const location = useLocation();
  const [state, reload] = useLoad(() => api.pedido(id).then((r) => r.pedido), [api, id]);
  const { repeat, busy, error: repeatError } = useRepeat();
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const [announce, setAnnounce] = useState('');
  const before = useRef(null);

  const pedido = state.data;
  usePolling(() => reload(true), POLL_MS, Boolean(pedido) && !ESTADOS_FINAIS.has(pedido.estado));

  useEffect(() => {
    if (!pedido) return;
    if (before.current && before.current !== pedido.estado) setAnnounce(`O pedido agora está: ${estadoInfo(pedido.estado).label}.`);
    before.current = pedido.estado;
  }, [pedido]);

  const prazo = loja.data.prazoCancelarMin;
  const podeCancelar = useMemo(() => podeCancelarPedido(pedido, prazo), [pedido, prazo]);

  const cancel = async () => {
    setCancelling(true);
    setCancelError(null);
    try {
      await api.cancelar(id);
      setConfirming(false);
      await reload(true);
    } catch (e) {
      setCancelError(e.message);
      setConfirming(false);
    } finally {
      setCancelling(false);
    }
  };

  if (state.status === 'loading') return <Spinner label="Carregando o pedido" />;
  if (state.status === 'error' && !pedido) {
    return (
      <EmptyState
        icon="alert"
        title={state.error?.status === 404 ? 'Pedido não encontrado' : 'Não foi possível carregar o pedido'}
        action={
          <Link className="p-btn p-btn--primary" to={path('pedidos')}>
            Voltar para meus pedidos
          </Link>
        }
      >
        {state.error?.status === 404 ? 'Ele não existe ou não é da sua conta.' : state.error?.message}
      </EmptyState>
    );
  }

  const info = estadoInfo(pedido.estado);
  return (
    <div>
      <p className="p-back">
        <Link className="p-link" to={path('pedidos')}>
          ← Meus pedidos
        </Link>
      </p>
      <PageTitle sub={`Feito em ${formatDateTime(pedido.criadoEm)}`}>Pedido {pedido.referencia}</PageTitle>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      {location.state?.novo ? (
        <Notice tone="ok" title="Pedido enviado">
          A loja recebeu o seu pedido. Você pode acompanhar por aqui e avisaremos por e-mail quando mudar.
        </Notice>
      ) : null}

      <div className="p-statusline">
        <StatusBadge estado={pedido.estado} />
        <span className="p-muted">{info.hint}</span>
      </div>
      {pedido.estado === 'recusado' && pedido.motivoRecusa ? (
        <Notice tone="danger" title="Motivo informado pela loja">
          {pedido.motivoRecusa}
        </Notice>
      ) : null}
      {pedido.previsao ? <p className="p-muted">Previsão: {pedido.previsao}</p> : null}
      <Timeline estado={pedido.estado} />

      <section className="p-section" aria-labelledby="o-itens">
        <h2 className="p-h2" id="o-itens">
          Itens
        </h2>
        <ul className="p-lines p-lines--plain">
          {pedido.itens.map((i) => (
            <li key={`${i.produtoId}-${i.nome}`} className="p-line p-line--plain">
              <div className="p-line__body">
                <p className="p-line__name">{i.nome}</p>
                <p className="p-muted p-small">
                  {qty(i.quantidade)} {i.unidade ?? ''} × {brl(i.precoUnitario)}
                </p>
              </div>
              <strong>{brl(i.quantidade * i.precoUnitario)}</strong>
            </li>
          ))}
        </ul>
        <dl className="p-summary p-summary--flat">
          {pedido.entrega?.taxa > 0 ? (
            <div>
              <dt>Taxa de entrega</dt>
              <dd>{brl(pedido.entrega.taxa)}</dd>
            </div>
          ) : null}
          <div className="p-summary__total">
            <dt>Total</dt>
            <dd>{brl(pedido.total)}</dd>
          </div>
        </dl>
      </section>

      <section className="p-section" aria-labelledby="o-ent">
        <h2 className="p-h2" id="o-ent">
          Entrega e pagamento
        </h2>
        <dl className="p-facts">
          <div>
            <dt>{pedido.entrega?.tipo === 'entrega' ? 'Entrega' : 'Retirada'}</dt>
            <dd>
              {formatDate(pedido.entrega?.data)}
              {pedido.entrega?.faixa ? `, ${pedido.entrega.faixa}` : ''}
            </dd>
          </div>
          {typeof pedido.entrega?.endereco === 'string' && pedido.entrega.endereco ? (
            <div>
              <dt>Endereço</dt>
              <dd>{pedido.entrega.endereco}</dd>
            </div>
          ) : pedido.entrega?.endereco && typeof pedido.entrega.endereco === 'object' ? (
            <div>
              <dt>Endereço</dt>
              <dd>
                {[pedido.entrega.endereco.rua, pedido.entrega.endereco.numero].filter(Boolean).join(', ')}
                {pedido.entrega.endereco.bairro ? ` · ${pedido.entrega.endereco.bairro}` : ''}
                {pedido.entrega.endereco.cidade ? ` · ${pedido.entrega.endereco.cidade}` : ''}
              </dd>
            </div>
          ) : null}
          <div>
            <dt>Pagamento</dt>
            <dd>{PAGAMENTOS[pedido.pagamento] ?? pedido.pagamento}</dd>
          </div>
          {pedido.observacao ? (
            <div>
              <dt>Observação</dt>
              <dd>{pedido.observacao}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {cancelError ? <Notice tone="danger">{cancelError}</Notice> : null}
      {repeatError ? <Notice tone="danger">{repeatError}</Notice> : null}

      <div className="p-actions p-actions--stack">
        <button type="button" className="p-btn p-btn--primary p-btn--block" onClick={() => repeat(pedido)} disabled={busy}>
          <PIcon name="repeat" size={18} /> {busy ? 'Conferindo o catálogo…' : 'Repetir este pedido'}
        </button>
        {podeCancelar && !confirming ? (
          <button type="button" className="p-btn p-btn--danger p-btn--block" onClick={() => setConfirming(true)}>
            Cancelar pedido
          </button>
        ) : null}
        {podeCancelar && confirming ? (
          <div className="p-confirm" role="group" aria-label="Confirmar cancelamento">
            <p>Cancelar o pedido {pedido.referencia}? Isso não pode ser desfeito.</p>
            <div className="p-actions">
              <button type="button" className="p-btn p-btn--danger" onClick={cancel} disabled={cancelling}>
                {cancelling ? 'Cancelando…' : 'Sim, cancelar'}
              </button>
              <button type="button" className="p-btn p-btn--ghost" onClick={() => setConfirming(false)}>
                Voltar
              </button>
            </div>
          </div>
        ) : null}
        {pedido.estado === 'recebido' && !podeCancelar ? (
          <p className="p-muted p-small">
            {prazo === 0 ? 'Esta loja não permite cancelar pelo portal. Fale com a loja se precisar.' : 'O prazo para cancelar já passou. Fale com a loja se precisar.'}
          </p>
        ) : null}
      </div>
    </div>
  );
}
