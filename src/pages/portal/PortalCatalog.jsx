import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortal } from './PortalContext.jsx';
import { EmptyState, Notice, PIcon, PageTitle, Spinner } from './ui.jsx';
import { brl, formatDateTime, produtosMaisVendidos, produtosParaPedirDeNovo, qty, snapQty } from './format.js';
import { OBS_ITEM_MAX } from './cartStorage.js';

const norm = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Foto do produto (servida pelo próprio site); sem foto ou com falha, uma inicial. */
export function ProductImage({ produto }) {
  const [failed, setFailed] = useState(false);
  if (!produto.imagemUrl || failed) {
    return (
      <span className={`p-thumb p-thumb--empty p-ph--${tomDoProduto(produto)}`} aria-hidden="true">
        {produto.nome.trim().charAt(0).toUpperCase()}
      </span>
    );
  }
  return <img className="p-thumb" src={produto.imagemUrl} alt="" width="96" height="96" loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

/** Controle de quantidade no passo do múltiplo; digitar também vale (ajusta ao múltiplo ao sair do campo). */
export function Stepper({ produto, value, onChange, compact = false, big = false }) {
  const step = produto.multiplo || 1;
  const [text, setText] = useState(qty(value));
  useEffect(() => setText(qty(value)), [value]);
  const commit = () => {
    const parsed = Number(String(text).replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(parsed)) return setText(qty(value));
    onChange(Math.max(0, snapQty(parsed, step)));
  };
  return (
    <div className={`p-stepper${compact ? ' p-stepper--compact' : ''}${big ? ' p-stepper--big' : ''}`} role="group" aria-label={`Quantidade de ${produto.nome}`}>
      <button type="button" className="p-stepper__btn" onClick={() => onChange(Math.max(0, snapQty(value - step, step)))} aria-label={`Diminuir ${produto.nome}`}>
        <PIcon name={value - step <= 0 ? 'trash' : 'minus'} size={big ? 24 : 18} />
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
        <PIcon name="plus" size={big ? 24 : 18} />
      </button>
    </div>
  );
}

/** Tom do desenho de quem não tem foto: o mesmo para a categoria inteira (fica organizado na grade). */
export function tomDoProduto(produto) {
  const base = norm(produto.categoria || produto.nome || '');
  let h = 0;
  for (const ch of base) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 6;
}

/** Foto grande da grade e da janela do produto; sem foto, um desenho com a inicial no tom da categoria. */
export function ProductPhoto({ produto, big = false }) {
  const [failed, setFailed] = useState(false);
  const cls = `p-photo${big ? ' p-photo--big' : ''}`;
  if (!produto.imagemUrl || failed) {
    return (
      <span className={`${cls} p-photo--empty p-ph--${tomDoProduto(produto)}`} aria-hidden="true">
        <span className="p-photo__mono">{produto.nome.trim().charAt(0).toUpperCase()}</span>
        {produto.categoria ? <span className="p-photo__cat">{produto.categoria}</span> : null}
      </span>
    );
  }
  return <img className={cls} src={produto.imagemUrl} alt="" loading={big ? 'eager' : 'lazy'} decoding="async" onError={() => setFailed(true)} />;
}

function ProductTile({ produto, inCart, onOpen, onQuickAdd }) {
  const step = produto.multiplo || 1;
  const off = !produto.disponivel;
  return (
    <li className={`p-tile${off ? ' p-tile--off' : ''}${inCart > 0 ? ' p-tile--in' : ''}`}>
      <button type="button" className="p-tile__open" onClick={() => onOpen(produto)} aria-label={`${produto.nome}, ${brl(produto.preco)} por ${produto.unidade}${off ? ', indisponível' : ''}${inCart > 0 ? `, ${qty(inCart)} no carrinho` : ''}. Ver detalhes`}>
        <span className="p-tile__media">
          <ProductPhoto produto={produto} />
          {off ? <span className="p-tile__flag">Indisponível</span> : null}
        </span>
        <span className="p-tile__body">
          <span className="p-tile__name">{produto.nome}</span>
          {produto.descricao ? <span className="p-tile__desc">{produto.descricao}</span> : null}
          <span className="p-tile__price">
            <strong>{brl(produto.preco)}</strong>
            <span className="p-muted"> / {produto.unidade}</span>
          </span>
          {step !== 1 ? <span className="p-tile__meta">De {qty(step)} em {qty(step)}</span> : null}
        </span>
      </button>
      {!off ? (
        <button
          type="button"
          className={`p-tile__add${inCart > 0 ? ' p-tile__add--count' : ''}`}
          onClick={() => onQuickAdd(produto)}
          aria-label={inCart > 0 ? `Mais ${qty(step)} de ${produto.nome} (tem ${qty(inCart)} no carrinho)` : `Adicionar ${produto.nome} ao carrinho`}
        >
          {inCart > 0 ? <span className="p-tile__count">{qty(inCart)}</span> : null}
          <PIcon name="plus" size={20} />
        </button>
      ) : null}
    </li>
  );
}

/** Janela do produto: foto grande, descrição, quantidade grande e observação do item. */
function ProductSheet({ produto, inCart, note, onClose, onSave, accepting }) {
  const ref = useRef(null);
  const step = produto.multiplo || 1;
  const [value, setValue] = useState(inCart > 0 ? inCart : step);
  const [obs, setObs] = useState(note ?? '');
  const off = !produto.disponivel;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal?.();
    const html = document.documentElement;
    html.classList.add('p-noscroll');
    return () => html.classList.remove('p-noscroll');
  }, []);

  const total = produto.preco * value;
  const remover = inCart > 0 && value === 0;
  const label = off
    ? 'Indisponível agora'
    : remover
      ? 'Tirar do carrinho'
      : `${inCart > 0 ? 'Atualizar carrinho' : 'Adicionar'} · ${brl(total)}`;

  return (
    <dialog
      ref={ref}
      className="p-sheet"
      aria-labelledby="p-sheet-title"
      onCancel={(e) => (e.preventDefault(), onClose())}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      <div className="p-sheet__in">
        <button type="button" className="p-sheet__close" onClick={onClose} aria-label="Fechar">
          <PIcon name="x" size={22} />
        </button>
        <ProductPhoto produto={produto} big />
        <div className="p-sheet__body">
          <h2 className="p-sheet__title" id="p-sheet-title">
            {produto.nome}
          </h2>
          {produto.descricao ? <p className="p-sheet__desc">{produto.descricao}</p> : null}
          <p className="p-sheet__price">
            <strong>{brl(produto.preco)}</strong> <span className="p-muted">/ {produto.unidade}</span>
          </p>
          {step !== 1 || produto.caixaQtd ? (
            <p className="p-sheet__meta p-muted">
              {step !== 1 ? <span>Vendido de {qty(step)} em {qty(step)}</span> : null}
              {produto.caixaQtd ? <span>Caixa com {qty(produto.caixaQtd)}</span> : null}
            </p>
          ) : null}

          {off ? (
            <Notice tone="warn">Este produto está indisponível agora.</Notice>
          ) : (
            <>
              <div className="p-sheet__qty">
                <span className="p-sheet__label">Quantidade</span>
                <Stepper produto={produto} value={value} onChange={setValue} big />
                {produto.caixaQtd && produto.caixaQtd !== step ? (
                  <button type="button" className="p-btn p-btn--ghost p-btn--sm" onClick={() => setValue(snapQty(value + produto.caixaQtd, step))}>
                    + 1 caixa ({qty(produto.caixaQtd)})
                  </button>
                ) : null}
              </div>
              <label className="p-sheet__obs">
                <span className="p-sheet__label">
                  Observação <span className="p-muted">(opcional)</span>
                </span>
                <textarea
                  className="p-input p-textarea"
                  rows={2}
                  maxLength={OBS_ITEM_MAX}
                  value={obs}
                  onChange={(e) => setObs(e.target.value)}
                  placeholder="Ex.: sem cebola, bem gelado, cortar em fatias"
                />
                <span className="p-muted p-small">
                  {obs.length} de {OBS_ITEM_MAX}
                </span>
              </label>
            </>
          )}
          {!accepting && !off ? <p className="p-muted p-small">A loja não está recebendo pedidos agora, mas você pode montar o carrinho.</p> : null}
        </div>
        <div className="p-sheet__foot">
          <button
            type="button"
            className={`p-btn ${remover ? 'p-btn--ghost' : 'p-btn--primary'} p-btn--lg p-btn--block`}
            disabled={off || (value === 0 && inCart === 0)}
            onClick={() => onSave(produto, value, obs)}
          >
            {label}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Faixa que rola para o lado ("Pedir de novo", "Mais vendidos"): um toque no + põe no carrinho. */
function FaixaProdutos({ id, titulo, produtos, itemOf, onOpen, onQuickAdd }) {
  if (produtos.length === 0) return null;
  return (
    <section className="p-again" aria-labelledby={`${id}-t`}>
      <h2 className="p-h2" id={`${id}-t`}>
        {titulo}
      </h2>
      <ul className="p-again__list">
        {produtos.map((p) => {
          const inCart = itemOf.get(p.id)?.qty ?? 0;
          return (
            <li key={p.id} className={`p-again__item${inCart > 0 ? ' p-again__item--in' : ''}`}>
              <button type="button" className="p-again__open" onClick={() => onOpen(p)} aria-label={`${p.nome}, ${brl(p.preco)} por ${p.unidade}. Ver detalhes`}>
                <span className="p-again__media">
                  <ProductPhoto produto={p} />
                </span>
                <span className="p-again__name">{p.nome}</span>
                <strong className="p-again__price">{brl(p.preco)}</strong>
              </button>
              <button
                type="button"
                className={`p-tile__add p-again__add${inCart > 0 ? ' p-tile__add--count' : ''}`}
                onClick={() => onQuickAdd(p)}
                aria-label={inCart > 0 ? `Mais ${qty(p.multiplo || 1)} de ${p.nome} (tem ${qty(inCart)} no carrinho)` : `Adicionar ${p.nome} ao carrinho`}
              >
                {inCart > 0 ? <span className="p-tile__count">{qty(inCart)}</span> : null}
                <PIcon name="plus" size={18} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const idDoGrupo = (name) => `g-${norm(name).replace(/\W+/g, '-')}`;

export default function PortalCatalog() {
  const { loja, session, catalog, loadCatalog, cart, setQty, setNote, path, api, signedIn } = usePortal();
  const [pedidos, setPedidos] = useState([]);
  const [search, setSearch] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [open, setOpen] = useState(null);
  const [toast, setToast] = useState(null);
  const [active, setActive] = useState('');
  const toastTimer = useRef(null);

  useEffect(() => {
    loadCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /* Pedidos anteriores só para a faixa "Pedir de novo"; se falhar, a faixa simplesmente não aparece. */
  useEffect(() => {
    if (!signedIn) return undefined;
    let vivo = true;
    api
      .pedidos()
      .then((r) => vivo && setPedidos(Array.isArray(r?.pedidos) ? r.pedidos : []))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [api, signedIn]);

  const produtos = catalog.data?.produtos ?? [];
  const itemOf = useMemo(() => new Map(cart.map((i) => [i.id, i])), [cart]);
  const deNovo = useMemo(() => produtosParaPedirDeNovo(pedidos, produtos), [pedidos, produtos]);
  /* Mais vendidos: o cliente comum vê o do caixa; quem compra para revender (a API só manda a posição de revenda para essas contas)
     vê primeiro o que os revendedores mais pedem e depois o que os clientes da loja mais procuram. */
  const maisVarejo = useMemo(() => produtosMaisVendidos(produtos, 'maisVendido'), [produtos]);
  const maisRevenda = useMemo(() => produtosMaisVendidos(produtos, 'maisVendidoRevenda'), [produtos]);
  const revende = maisRevenda.length > 0;

  const filtered = useMemo(() => {
    const term = norm(search.trim());
    return produtos.filter((p) => (!onlyAvailable || p.disponivel) && (!term || norm(p.nome).includes(term) || norm(p.descricao).includes(term) || norm(p.categoria).includes(term)));
  }, [produtos, search, onlyAvailable]);

  /* Grupos por categoria; dentro de cada um, os disponíveis primeiro. */
  const groups = useMemo(() => {
    const map = new Map();
    for (const p of filtered) {
      const key = p.categoria || 'Outros';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
      .map(([name, list]) => [name, [...list].sort((a, b) => Number(b.disponivel) - Number(a.disponivel))]);
  }, [filtered]);

  /* A categoria que está na tela fica marcada na barra de categorias. */
  useEffect(() => {
    if (groups.length < 2 || typeof IntersectionObserver === 'undefined') return undefined;
    const seen = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = groups.map(([n]) => idDoGrupo(n)).find((id) => seen.get(id));
        if (first) setActive(first);
      },
      { rootMargin: '-200px 0px -50% 0px' }
    );
    for (const [n] of groups) {
      const el = document.getElementById(idDoGrupo(n));
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [groups]);

  /* Mantém o chip ativo visível na barra (rolagem horizontal). */
  useEffect(() => {
    if (!active) return;
    document.querySelector(`.p-chips [data-group="${active}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [active]);

  const priceOf = (id) => produtos.find((p) => p.id === id)?.preco ?? 0;
  const total = cart.reduce((sum, i) => sum + priceOf(i.id) * i.qty, 0);
  const updated = catalog.data?.atualizadoEm ?? loja.data.catalogoAtualizadoEm;
  const pendente = session.conta?.estado === 'pendente';
  const bloqueada = session.conta?.estado === 'bloqueada';

  const avisar = (texto, novoTotal) => {
    clearTimeout(toastTimer.current);
    setToast({ texto, total: novoTotal, n: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  /* Total do carrinho depois de mudar UM item (o estado novo ainda não chegou aqui). */
  const totalCom = (produto, value) => total - priceOf(produto.id) * (itemOf.get(produto.id)?.qty ?? 0) + produto.preco * value;

  const quickAdd = (produto) => {
    const step = produto.multiplo || 1;
    const next = snapQty((itemOf.get(produto.id)?.qty ?? 0) + step, step);
    setQty(produto.id, next, step);
    avisar(`${produto.nome} no carrinho (${qty(next)})`, totalCom(produto, next));
  };

  const save = (produto, value, obs) => {
    const step = produto.multiplo || 1;
    const had = itemOf.get(produto.id)?.qty ?? 0;
    setQty(produto.id, value, step);
    if (value > 0) setNote(produto.id, obs);
    setOpen(null);
    if (value === 0) avisar(`${produto.nome} saiu do carrinho`, totalCom(produto, 0));
    else avisar(had > 0 ? `${produto.nome} atualizado (${qty(value)})` : `${produto.nome} adicionado (${qty(value)})`, totalCom(produto, value));
  };

  const irPara = (name) => {
    const id = idDoGrupo(name);
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };

  const openItem = open ? itemOf.get(open.id) : null;

  return (
    <div className={`p-shop${cart.length > 0 ? ' p-withbar' : ''}`}>
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

      <div className="p-shopbar" role="search">
        <label className="p-search">
          <span className="sr-only">Buscar produto</span>
          <PIcon name="search" size={18} />
          <input className="p-search__input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar produto" autoComplete="off" enterKeyHint="search" />
          {search ? (
            <button type="button" className="p-search__clear" onClick={() => setSearch('')} aria-label="Limpar a busca">
              <PIcon name="x" size={18} />
            </button>
          ) : null}
        </label>
        {groups.length > 1 ? (
          <nav className="p-chips" aria-label="Ir para a categoria">
            {groups.map(([name, list]) => (
              <button key={name} type="button" className="p-chip" data-group={idDoGrupo(name)} aria-current={active === idDoGrupo(name) ? 'true' : undefined} onClick={() => irPara(name)}>
                {name} <span className="p-chip__n">{list.length}</span>
              </button>
            ))}
          </nav>
        ) : null}
      </div>

      <div className="p-shop__tools">
        <label className="p-check p-check--inline">
          <input type="checkbox" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} />
          <span>Só os disponíveis</span>
        </label>
        <p className="p-muted p-small">Preço e disponibilidade são conferidos pela loja quando o pedido chega.</p>
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
            <button type="button" className="p-btn p-btn--ghost" onClick={() => (setSearch(''), setOnlyAvailable(false))}>
              Limpar a busca
            </button>
          }
        >
          Tente outra palavra.
        </EmptyState>
      ) : null}

      <p className="sr-only" role="status" aria-live="polite">
        {catalog.data ? `${filtered.length} produtos` : ''}
      </p>

      {!search.trim() ? (
        <>
          <FaixaProdutos id="p-again" titulo="Pedir de novo" produtos={deNovo} itemOf={itemOf} onOpen={setOpen} onQuickAdd={quickAdd} />
          {revende ? (
            <FaixaProdutos id="p-top-revenda" titulo="Mais pedidos por revendedores" produtos={maisRevenda} itemOf={itemOf} onOpen={setOpen} onQuickAdd={quickAdd} />
          ) : null}
          <FaixaProdutos
            id="p-top"
            titulo={revende ? 'Mais procurados pelos clientes da loja' : 'Mais vendidos'}
            produtos={maisVarejo}
            itemOf={itemOf}
            onOpen={setOpen}
            onQuickAdd={quickAdd}
          />
        </>
      ) : null}

      {groups.map(([name, list]) => (
        <section key={name} className="p-group" id={idDoGrupo(name)} aria-labelledby={`${idDoGrupo(name)}-t`}>
          <h2 className="p-h2" id={`${idDoGrupo(name)}-t`}>
            {name}
          </h2>
          <ul className="p-grid">
            {list.map((p) => (
              <ProductTile key={p.id} produto={p} inCart={itemOf.get(p.id)?.qty ?? 0} onOpen={setOpen} onQuickAdd={quickAdd} />
            ))}
          </ul>
        </section>
      ))}

      {open ? (
        <ProductSheet
          key={open.id}
          produto={open}
          inCart={openItem?.qty ?? 0}
          note={openItem?.obs ?? ''}
          accepting={loja.data.aceitaPedidos}
          onClose={() => setOpen(null)}
          onSave={save}
        />
      ) : null}

      <div className="p-toast-zone" role="status" aria-live="polite">
        {toast ? (
          <div key={toast.n} className="p-toast">
            <PIcon name="check" size={18} />
            <span className="p-toast__text">{toast.texto}</span>
            <strong className="p-toast__total">{brl(toast.total)}</strong>
          </div>
        ) : null}
      </div>

      {cart.length > 0 ? (
        <div className="p-cartbar">
          <Link className="p-btn p-btn--primary p-btn--lg p-btn--block p-cartbar__btn" to={path('carrinho')}>
            <span className="p-cartbar__count" aria-hidden="true">
              {cart.length}
            </span>
            <span className="p-cartbar__label">Ver carrinho</span>
            <strong>{brl(total)}</strong>
            <span className="sr-only">
              , {cart.length} {cart.length === 1 ? 'item' : 'itens'}
            </span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
