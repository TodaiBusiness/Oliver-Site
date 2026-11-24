import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { usePortal } from './PortalContext.jsx';
import { Stepper, ProductImage } from './PortalCatalog.jsx';
import { EmptyState, Field, Notice, PIcon, PageTitle, Spinner, describedBy } from './ui.jsx';
import { OBS_ITEM_MAX, OBS_PEDIDO_MAX, juntarObservacao } from './cartStorage.js';
import { PAGAMENTOS, brl, faixasDaLoja, isoToday, qty, statusDaLoja } from './format.js';

const newKey = () =>
  globalThis.crypto?.randomUUID?.().replace(/-/g, '') ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

/** Observação de um item no carrinho: mostra o texto; tocar abre um campo para mudar. */
function NotaDoItem({ nome, value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  const salvar = () => {
    onChange(text);
    setEditing(false);
  };
  if (editing) {
    return (
      <div className="p-note">
        <input
          className="p-input p-note__input"
          value={text}
          maxLength={OBS_ITEM_MAX}
          onChange={(e) => setText(e.target.value)}
          onBlur={salvar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.preventDefault(), salvar());
            if (e.key === 'Escape') (setText(value ?? ''), setEditing(false));
          }}
          placeholder="Ex.: sem cebola, bem gelado"
          aria-label={`Observação de ${nome}`}
          autoFocus
        />
      </div>
    );
  }
  return (
    <button type="button" className="p-note__btn" onClick={() => setEditing(true)} aria-label={value ? `Mudar a observação de ${nome}` : `Escrever uma observação para ${nome}`}>
      {value ? <span className="p-note__text">“{value}”</span> : <span>+ Observação</span>}
    </button>
  );
}

const pagamentoPadrao = (tipo) => (tipo === 'entrega' ? 'na_entrega' : 'na_retirada');

export default function PortalCart() {
  const { loja, session, catalog, loadCatalog, cart, setQty, setNote, removeItem, signedIn, api, clearCart, path } = usePortal();
  const navigate = useNavigate();
  const location = useLocation();
  const d = loja.data;
  const skipped = location.state?.skipped ?? [];

  const tipoInicial = d.retirada ? 'retirada' : 'entrega';
  const [tipo, setTipo] = useState(tipoInicial);
  const [data, setData] = useState(isoToday(1));
  const [faixa, setFaixa] = useState('');
  const [pagamento, setPagamento] = useState(pagamentoPadrao(tipoInicial));
  const [observacao, setObservacao] = useState('');
  const end0 = session.account?.endereco ?? {};
  const [endereco, setEndereco] = useState({
    rua: end0.rua ?? '',
    numero: end0.numero ?? '',
    complemento: end0.complemento ?? '',
    bairro: end0.bairro ?? '',
    cidade: end0.cidade ?? '',
    uf: end0.uf ?? '',
  });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const errorRef = useRef(null);
  const keyRef = useRef(null);

  const faixas = useMemo(() => faixasDaLoja(d.horarios), [d.horarios]);
  useEffect(() => {
    if (!faixa) setFaixa(faixas[0]);
  }, [faixas, faixa]);

  useEffect(() => {
    if (signedIn) loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn]);

  /* Qualquer mudança no pedido pede um identificador novo (reenviar o MESMO pedido reaproveita o mesmo). */
  useEffect(() => {
    keyRef.current = null;
  }, [cart, tipo, data, faixa, pagamento, observacao, endereco]);

  const lines = cart.map((item) => {
    const produto = catalog.data?.produtos.find((p) => p.id === item.id) ?? null;
    return { ...item, produto, ok: Boolean(produto?.disponivel) };
  });
  const obsItens = juntarObservacao(lines.map((l) => ({ nome: l.produto?.nome, obs: l.obs })), '');
  const obsMax = Math.max(0, OBS_PEDIDO_MAX - obsItens.length - (obsItens ? 2 : 0));
  const carregando = catalog.status === 'loading' && !catalog.data;
  const subtotal = lines.reduce((s, l) => s + (l.ok ? l.produto.preco * l.qty : 0), 0);
  const taxa = tipo === 'entrega' ? d.taxaEntrega : 0;
  const total = subtotal + taxa;
  const falta = Math.max(0, d.pedidoMinimo - subtotal);
  const temProblema = lines.some((l) => !l.ok);
  const bloqueada = session.conta?.estado === 'bloqueada';
  const pendente = session.conta?.estado === 'pendente';

  const fail = (e) => {
    setError(e?.message ?? 'Não foi possível enviar o pedido.');
    setFields(e?.details && typeof e.details === 'object' ? e.details : {});
    setTimeout(() => errorRef.current?.focus(), 0);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setFields({});
    if (!d.aceitaPedidos) return fail({ message: 'A loja não está recebendo pedidos agora.' });
    if (temProblema) return fail({ message: 'Remova os itens indisponíveis do carrinho para continuar.' });
    if (falta > 0) return fail({ message: `Faltam ${brl(falta)} para o pedido mínimo de ${brl(d.pedidoMinimo)}.` });
    keyRef.current ??= newKey();
    setSending(true);
    try {
      const { pedido } = await api.criarPedido({
        itens: lines.map((l) => ({ produtoId: l.id, quantidade: l.qty })),
        entrega: {
          tipo,
          data,
          faixa,
          ...(tipo === 'entrega' ? { endereco } : {}),
        },
        pagamento,
        observacao: juntarObservacao(lines.map((l) => ({ nome: l.produto?.nome, obs: l.obs })), observacao),
        idempotencyKey: keyRef.current,
      });
      clearCart();
      navigate(path(`pedidos/${pedido.pedidoId}`), { state: { novo: true }, replace: true });
    } catch (e) {
      fail(e);
      /* Item que saiu do ar ou preço que mudou: atualiza o catálogo para o carrinho mostrar a realidade. */
      if (e.status === 409 || e.status === 400) loadCatalog({ force: true });
    } finally {
      setSending(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div>
        <PageTitle>Carrinho</PageTitle>
        <EmptyState
          icon="cart"
          title="Seu carrinho está vazio"
          action={
            <Link className="p-btn p-btn--primary" to={path('catalogo')}>
              Ver o catálogo
            </Link>
          }
        >
          Escolha os produtos no catálogo e eles aparecem aqui.
        </EmptyState>
      </div>
    );
  }

  const fe = (name) => fields[name];
  const setEnd = (name) => (e) => setEndereco((v) => ({ ...v, [name]: e.target.value }));

  return (
    <div>
      <PageTitle>Carrinho</PageTitle>
      {skipped.length ? (
        <Notice tone="warn" title="Alguns itens ficaram de fora">
          Não estão disponíveis agora: {skipped.join(', ')}.
        </Notice>
      ) : null}
      {d.aceitaPedidos && statusDaLoja(d)?.aberto === false ? (
        <Notice tone="info" icon="clock">
          A loja está fechada agora; seu pedido fica na fila e a loja confirma quando abrir.
        </Notice>
      ) : null}
      {pendente ? (
        <Notice tone="warn" title="Cadastro em análise">
          Preços de atacado após aprovação da loja. Este pedido usa os preços de varejo.
        </Notice>
      ) : null}
      {bloqueada ? (
        <Notice tone="danger" title="Conta com restrição">
          A loja não liberou esta conta para pedidos. Fale diretamente com a loja.
        </Notice>
      ) : null}

      <form className="p-cart" onSubmit={submit}>
        {error ? (
          <div className="p-notice p-notice--danger" role="alert" tabIndex={-1} ref={errorRef}>
            <PIcon name="alert" />
            <div className="p-notice__body">{error}</div>
          </div>
        ) : null}

        {carregando ? <Spinner label="Conferindo os preços" /> : null}

        <ul className="p-lines" aria-label="Itens do carrinho">
          {lines.map((l) => (
            <li key={l.id} className={`p-line${l.ok ? '' : ' p-line--off'}`}>
              {l.produto ? <ProductImage produto={l.produto} /> : <span className="p-thumb p-thumb--empty" aria-hidden="true">?</span>}
              <div className="p-line__body">
                <p className="p-line__name">{l.produto?.nome ?? 'Produto que saiu do catálogo'}</p>
                {l.ok ? (
                  <>
                    <p className="p-muted p-small">
                      {brl(l.produto.preco)} / {l.produto.unidade}
                    </p>
                    <NotaDoItem nome={l.produto.nome} value={l.obs} onChange={(v) => setNote(l.id, v)} />
                  </>
                ) : (
                  <p className="p-line__warn">{carregando ? 'Conferindo…' : 'Indisponível agora. Remova para continuar.'}</p>
                )}
              </div>
              <div className="p-line__act">
                {l.ok ? (
                  <>
                    <Stepper produto={l.produto} value={l.qty} onChange={(v) => setQty(l.id, v, l.produto.multiplo || 1)} compact />
                    <strong className="p-line__total">{brl(l.produto.preco * l.qty)}</strong>
                  </>
                ) : null}
                {!l.ok && !carregando ? (
                  <button type="button" className="p-btn p-btn--ghost p-btn--sm" onClick={() => removeItem(l.id)}>
                    <PIcon name="trash" size={16} /> Remover
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>

        <fieldset className="p-fieldset">
          <legend className="p-legend">Como você quer receber</legend>
          {d.retirada ? (
            <label className="p-choice">
              <input type="radio" name="tipo" checked={tipo === 'retirada'} onChange={() => (setTipo('retirada'), setPagamento(pagamento === 'fiado' ? 'fiado' : pagamentoPadrao('retirada')))} />
              <span>
                <strong>Retirar na loja</strong>
                <small>Sem taxa.</small>
              </span>
            </label>
          ) : null}
          {d.entrega ? (
            <label className="p-choice">
              <input type="radio" name="tipo" checked={tipo === 'entrega'} onChange={() => (setTipo('entrega'), setPagamento(pagamento === 'fiado' ? 'fiado' : pagamentoPadrao('entrega')))} />
              <span>
                <strong>Receber em casa</strong>
                <small>{d.taxaEntrega > 0 ? `Taxa de entrega: ${brl(d.taxaEntrega)}.` : 'Sem taxa de entrega.'}</small>
              </span>
            </label>
          ) : null}
          {!d.retirada && !d.entrega ? <Notice tone="warn">A loja não configurou retirada nem entrega. Fale com a loja.</Notice> : null}
        </fieldset>

        <div className="p-grid2">
          <Field id="c-data" label={tipo === 'entrega' ? 'Dia da entrega' : 'Dia da retirada'} error={fe('entrega.data')}>
            <input id="c-data" className="p-input" type="date" min={isoToday(0)} value={data} onChange={(e) => setData(e.target.value)} required aria-invalid={!!fe('entrega.data') || undefined} aria-describedby={describedBy('c-data', { error: fe('entrega.data') })} />
          </Field>
          <Field id="c-faixa" label="Faixa de horário">
            <select id="c-faixa" className="p-input" value={faixa} onChange={(e) => setFaixa(e.target.value)}>
              {faixas.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {tipo === 'entrega' ? (
          <fieldset className="p-fieldset">
            <legend className="p-legend">Endereço de entrega</legend>
            <div className="p-grid2">
              <Field id="c-rua" label="Rua" error={fe('endereco.rua')}>
                <input id="c-rua" className="p-input" value={endereco.rua} onChange={setEnd('rua')} autoComplete="address-line1" required maxLength={120} />
              </Field>
              <Field id="c-num" label="Número" error={fe('endereco.numero')}>
                <input id="c-num" className="p-input" value={endereco.numero} onChange={setEnd('numero')} required maxLength={20} />
              </Field>
            </div>
            <Field id="c-comp" label="Complemento" optional>
              <input id="c-comp" className="p-input" value={endereco.complemento} onChange={setEnd('complemento')} autoComplete="address-line2" maxLength={80} />
            </Field>
            <div className="p-grid2">
              <Field id="c-bairro" label="Bairro" error={fe('endereco.bairro')}>
                <input id="c-bairro" className="p-input" value={endereco.bairro} onChange={setEnd('bairro')} required maxLength={80} />
              </Field>
              <Field id="c-cidade" label="Cidade" error={fe('endereco.cidade')}>
                <input id="c-cidade" className="p-input" value={endereco.cidade} onChange={setEnd('cidade')} autoComplete="address-level2" required maxLength={80} />
              </Field>
            </div>
          </fieldset>
        ) : null}

        <fieldset className="p-fieldset">
          <legend className="p-legend">Pagamento</legend>
          <label className="p-choice">
            <input type="radio" name="pagamento" checked={pagamento === pagamentoPadrao(tipo)} onChange={() => setPagamento(pagamentoPadrao(tipo))} />
            <span>
              <strong>{PAGAMENTOS[pagamentoPadrao(tipo)]}</strong>
              <small>Não há pagamento online. Você paga à loja quando receber.</small>
            </span>
          </label>
          {d.fiadoAtivo ? (
            <label className="p-choice">
              <input type="radio" name="pagamento" checked={pagamento === 'fiado'} onChange={() => setPagamento('fiado')} />
              <span>
                <strong>Fiado</strong>
                <small>Só para quem a loja autorizou. Se não for o seu caso, a loja avisa.</small>
              </span>
            </label>
          ) : null}
        </fieldset>

        <Field id="c-obs" label="Observação para a loja" optional hint={`${observacao.length} de ${obsMax} caracteres.${obsItens ? ' As observações dos itens vão junto.' : ''}`}>
          <textarea id="c-obs" className="p-input p-textarea" rows={3} maxLength={obsMax} value={observacao} onChange={(e) => setObservacao(e.target.value)} aria-describedby="c-obs-hint" />
        </Field>

        <section className="p-summary" aria-label="Resumo do pedido">
          <dl>
            <div>
              <dt>Produtos</dt>
              <dd>{brl(subtotal)}</dd>
            </div>
            {tipo === 'entrega' ? (
              <div>
                <dt>Taxa de entrega</dt>
                <dd>{brl(taxa)}</dd>
              </div>
            ) : null}
            <div className="p-summary__total">
              <dt>Total estimado</dt>
              <dd>{brl(total)}</dd>
            </div>
          </dl>
          {d.pedidoMinimo > 0 ? (
            <p className={falta > 0 ? 'p-summary__warn' : 'p-muted p-small'}>
              {falta > 0 ? `Faltam ${brl(falta)} para o pedido mínimo de ${brl(d.pedidoMinimo)}.` : `Pedido mínimo de ${brl(d.pedidoMinimo)} atingido.`}
            </p>
          ) : null}
          <p className="p-muted p-small">A loja confere preços e disponibilidade ao receber. O total final pode mudar.</p>
        </section>

        <button type="submit" className="p-btn p-btn--primary p-btn--lg p-btn--block" disabled={sending || carregando || bloqueada || !d.aceitaPedidos}>
          {sending ? 'Enviando pedido…' : `Enviar pedido · ${qty(lines.length)} ${lines.length === 1 ? 'item' : 'itens'}`}
        </button>
        {!d.aceitaPedidos ? <p className="p-muted p-small p-center-text">A loja não está recebendo pedidos agora.</p> : null}
      </form>
    </div>
  );
}
