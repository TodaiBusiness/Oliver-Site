import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortal } from './PortalContext.jsx';
import { EmptyState, Notice, PIcon, PageTitle, Spinner } from './ui.jsx';
import { brl, formatDateTime, qty, snapQty } from './format.js';

const norm = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Foto do produto (servida pelo próprio site); sem foto ou com falha, uma inicial. */
export function ProductImage({ produto }) {
  const [failed, setFailed] = useState(false);
  if (!produto.imagemUrl || failed) {
    return (
      <span className="p-thumb p-thumb--empty" aria-hidden="true">
        {produto.nome.trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  return <img className="p-thumb" src={produto.imagemUrl} alt="" width="96" height="96" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

/** Controle de quantidade no passo do múltiplo; digitar também vale (ajusta ao múltiplo ao sair do campo). */
export function Stepper({ produto, value, onChange, compact = false }) {
  const step = produto.multiplo || 1;
  const [text, setText] = useState(qty(value));
  useEffect(() => setText(qty(value)), [value]);
  const commit = () => {
    const parsed = Number(String(text).replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(parsed)) return setText(qty(value));
    onChange(Math.max(0, snapQty(parsed, step)));
  };
  return (
    <div className={`p-stepper${compact ? ' p-stepper--compact' : ''}`} role="group" aria-label={`Quantidade de ${produto.nome}`}>
      <button type="button" className="p-stepper__btn" onClick={() => onChange(Math.max(0, snapQty(value - step, step)))} aria-label={`Diminuir ${produto.nome}`}>
        <PIcon name={value - step <= 0 ? 'trash' : 'minus'} size={18} />
      </button>
      <input
        className="p-stepper__input"
        inputMode="decimal"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), commit())}
        aria-label={`Quantidade, em ${produto.unidade}`}
      />
      <button type="button" className="p-stepper__btn" onClick={() => onChange(snapQty(value + step, step))} aria-label={`Aumentar ${produto.nome}`}>
        <PIcon name="plus" size={18} />
      </button>
    </div>
  );
}

function ProductCard({ produto, inCart, onSet, accepting }) {
  const step = produto.multiplo || 1;
  return (
    <li className={`p-product${produto.disponivel ? '' : ' p-product--off'}`}>
      <ProductImage produto={produto} />
      <div className="p-product__body">
        <h3 className="p-product__name">{produto.nome}</h3>
        {produto.descricao ? <p className="p-product__desc">{produto.descricao}</p> : null}
        <p className="p-product__price">
          <strong>{brl(produto.preco)}</strong> <span className="p-muted">/ {produto.unidade}</span>
        </p>
        <p className="p-product__meta p-muted">
          {step !== 1 ? <span>Vendido de {qty(step)} em {qty(step)}</span> : null}
          {produto.caixaQtd ? <span>Caixa com {qty(produto.caixaQtd)}</span> : null}
        </p>
      </div>
      <div className="p-product__act">
        {!produto.disponivel ? (
          <span className="p-badge p-badge--warn">Indisponível</span>
        ) : inCart > 0 ? (
          <Stepper produto={produto} value={inCart} onChange={(v) => onSet(produto, v)} />
        ) : (
          <>
            <button type="button" className="p-btn p-btn--primary p-btn--sm" onClick={() => onSet(produto, step)} aria-label={`Adicionar ${produto.nome} ao carrinho`}>
              <PIcon name="plus" size={16} /> Adicionar
            </button>
            {produto.caixaQtd && produto.caixaQtd !== step ? (
              <button type="button" className="p-btn p-btn--ghost p-btn--sm" onClick={() => onSet(produto, snapQty(produto.caixaQtd, step))} aria-label={`Adicionar uma caixa de ${produto.nome}`}>
                + caixa ({qty(produto.caixaQtd)})
              </button>
            ) : null}
          </>
        )}
        {!accepting && produto.disponivel ? <span className="sr-only">A loja não recebe pedidos agora.</span> : null}
      </div>
    </li>
  );
}

export default function PortalCatalog() {
  const { loja, session, catalog, loadCatalog, cart, setQty, path } = usePortal();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);

  useEffect(() => {
    loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const produtos = catalog.data?.produtos ?? [];
  const categorias = useMemo(() => [...new Set(produtos.map((p) => p.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [produtos]);
  const inCart = useMemo(() => new Map(cart.map((i) => [i.id, i.qty])), [cart]);

  const filtered = useMemo(() => {
    const term = norm(search.trim());
    return produtos.filter(
      (p) => (!category || p.categoria === category) && (!onlyAvailable || p.disponivel) && (!term || norm(p.nome).includes(term) || norm(p.descricao).includes(term) || norm(p.categoria).includes(term))
    );
  }, [produtos, search, category, onlyAvailable]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const p of filtered) {
      const key = p.categoria || 'Outros';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [filtered]);

  const total = cart.reduce((sum, i) => sum + (produtos.find((p) => p.id === i.id)?.preco ?? 0) * i.qty, 0);
  const onSet = (produto, value) => setQty(produto.id, value, produto.multiplo || 1);
  const updated = catalog.data?.atualizadoEm ?? loja.data.catalogoAtualizadoEm;
  const pendente = session.conta?.estado === 'pendente';
  const bloqueada = session.conta?.estado === 'bloqueada';

  return (
    <div className={cart.length > 0 ? 'p-withbar' : undefined}>
      <PageTitle sub={updated ? `Catálogo atualizado em ${formatDateTime(updated)}.` : undefined}>Catálogo</PageTitle>

      {pendente ? (
        <Notice tone="warn" title="Cadastro em análise">
          Preços de atacado após aprovação da loja. Por enquanto, você vê os preços de varejo.
        </Notice>
      ) : null}
      {bloqueada ? (
        <Notice tone="danger" title="Conta com restrição">
          A loja não liberou esta conta para pedidos. Fale diretamente com a loja.
        </Notice>
      ) : null}
      {!loja.data.aceitaPedidos ? (
        <Notice tone="warn" title="A loja não está recebendo pedidos agora">
          Você pode olhar o catálogo, mas o envio do pedido só funciona quando a loja voltar a aceitar.
        </Notice>
      ) : null}
      {loja.data.mensagemAviso ? <Notice tone="info">{loja.data.mensagemAviso}</Notice> : null}
      <p className="p-muted p-small">Preço e disponibilidade são conferidos pela loja quando o pedido chega.</p>

      <div className="p-filters" role="search">
        <label className="p-search">
          <span className="sr-only">Buscar produto</span>
          <PIcon name="search" size={18} />
          <input className="p-search__input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto" autoComplete="off" enterKeyHint="search" />
        </label>
        {categorias.length > 1 ? (
          <div className="p-chips" role="group" aria-label="Categorias">
            <button type="button" className="p-chip" aria-pressed={category === ''} onClick={() => setCategory('')}>
              Todas
            </button>
            {categorias.map((c) => (
              <button key={c} type="button" className="p-chip" aria-pressed={category === c} onClick={() => setCategory(category === c ? '' : c)}>
                {c}
              </button>
            ))}
          </div>
        ) : null}
        <label className="p-check p-check--inline">
          <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
          <span>Mostrar só os disponíveis</span>
        </label>
      </div>

      {catalog.status === 'loading' && !catalog.data ? <Spinner label="Carregando o catálogo" /> : null}
      {catalog.status === 'error' && !catalog.data ? (
        <EmptyState
          icon="alert"
          title="Não foi possível carregar o catálogo"
          action={
            <button type="button" className="p-btn p-btn--primary" onClick={() => loadCatalog({ force: true })}>
              Tentar de novo
            </button>
          }
        >
          {catalog.error?.message}
        </EmptyState>
      ) : null}
      {catalog.data && produtos.length === 0 ? (
        <EmptyState icon="store" title="A loja ainda não publicou produtos">
          Volte mais tarde ou fale com a loja.
        </EmptyState>
      ) : null}
      {catalog.data && produtos.length > 0 && filtered.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nenhum produto encontrado"
          action={
            <button type="button" className="p-btn p-btn--ghost" onClick={() => (setSearch(''), setCategory(''), setOnlyAvailable(false))}>
              Limpar filtros
            </button>
          }
        >
          Tente outra palavra ou outra categoria.
        </EmptyState>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {catalog.data ? `${filtered.length} produtos` : ''}
      </p>

      {groups.map(([name, list]) => (
        <section key={name} className="p-group" aria-labelledby={`g-${norm(name).replace(/\W+/g, '-')}`}>
          <h2 className="p-h2" id={`g-${norm(name).replace(/\W+/g, '-')}`}>
            {name}
          </h2>
          <ul className="p-products">
            {list.map((p) => (
              <ProductCard key={p.id} produto={p} inCart={inCart.get(p.id) ?? 0} onSet={onSet} accepting={loja.data.aceitaPedidos} />
            ))}
          </ul>
        </section>
      ))}

      {cart.length > 0 ? (
        <div className="p-cartbar">
          <Link className="p-btn p-btn--primary p-btn--lg p-btn--block p-cartbar__btn" to={path('carrinho')}>
            <span>
              Ver carrinho · {cart.length} {cart.length === 1 ? 'item' : 'itens'}
            </span>
            <strong>{brl(total)}</strong>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
