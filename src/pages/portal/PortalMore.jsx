import { Link } from 'react-router-dom';
import { usePortal } from './PortalContext.jsx';
import { EmptyState, Notice, PageTitle, Spinner, useLoad } from './ui.jsx';
import { TABELAS, brl, formatDate, formatDateTime } from './format.js';

/* ------------------------------------------------------------- fiado */
export function PortalFiado() {
  const { api, loja, path } = usePortal();
  const [state, reload] = useLoad(() => api.fiado().then((r) => r.fiado), [api]);

  if (!loja.data.fiadoAtivo || state.error?.status === 404) {
    return (
      <div>
        <PageTitle>Fiado</PageTitle>
        <EmptyState
          icon="wallet"
          title="Esta loja não usa fiado no portal"
          action={
            <Link className="p-btn p-btn--primary" to={path('catalogo')}>
              Ver o catálogo
            </Link>
          }
        >
          Para saber sobre pagamento a prazo, fale com a loja.
        </EmptyState>
      </div>
    );
  }
  if (state.status === 'loading') return <Spinner label="Carregando o fiado" />;
  if (state.status === 'error' && !state.data) {
    return (
      <EmptyState
        icon="alert"
        title="Não foi possível carregar o fiado"
        action={
          <button type="button" className="p-btn p-btn--primary" onClick={() => reload()}>
            Tentar de novo
          </button>
        }
      >
        {state.error?.message}
      </EmptyState>
    );
  }
  const f = state.data;
  return (
    <div>
      <PageTitle sub={f.atualizadoEm ? `Atualizado em ${formatDateTime(f.atualizadoEm)}.` : undefined}>Fiado</PageTitle>
      <Notice tone="info">Somente consulta. Para pagar ou combinar prazos, fale com a loja.</Notice>

      <dl className="p-balance">
        <div className="p-balance__item">
          <dt>Saldo em aberto</dt>
          <dd>{brl(f.saldo)}</dd>
        </div>
        <div className={`p-balance__item${f.vencido > 0 ? ' p-balance__item--late' : ''}`}>
          <dt>Vencido</dt>
          <dd>{brl(f.vencido)}</dd>
        </div>
        <div className="p-balance__item">
          <dt>Próximo vencimento</dt>
          <dd>{f.proximoVencimento ? formatDate(f.proximoVencimento) : 'Nenhum'}</dd>
        </div>
      </dl>

      <section className="p-section" aria-labelledby="f-ext">
        <h2 className="p-h2" id="f-ext">
          Extrato
        </h2>
        {f.extrato.length === 0 ? (
          <p className="p-muted">Sem movimentos recentes.</p>
        ) : (
          <ul className="p-lines p-lines--plain">
            {f.extrato.map((e, i) => (
              <li key={`${e.data}-${i}`} className="p-line p-line--plain">
                <div className="p-line__body">
                  <p className="p-line__name">{e.descricao || 'Movimento'}</p>
                  <p className="p-muted p-small">
                    {formatDate(e.data)}
                    {e.vencimento ? ` · vence em ${formatDate(e.vencimento)}` : ''}
                  </p>
                </div>
                <strong className={e.valor < 0 ? 'p-credit' : undefined}>
                  {e.valor < 0 ? `− ${brl(Math.abs(e.valor))}` : brl(e.valor)}
                  {e.valor < 0 ? <span className="sr-only"> (pagamento)</span> : null}
                </strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------- conta */
export function PortalAccount() {
  const { session, signOut, path } = usePortal();
  const a = session.account;
  const conta = session.conta;
  const e = a.endereco ?? {};
  const endereco = [[e.rua, e.numero].filter(Boolean).join(', '), e.complemento, e.bairro, [e.cidade, e.uf].filter(Boolean).join('/'), e.cep].filter(Boolean).join(' · ');

  return (
    <div>
      <PageTitle>Minha conta</PageTitle>

      {conta?.estado === 'pendente' ? (
        <Notice tone="warn" title="Cadastro em análise">
          Preços de atacado após aprovação da loja. Enquanto isso, você pede com preços de varejo. Avisaremos por e-mail.
        </Notice>
      ) : null}
      {conta?.estado === 'ativa' ? (
        <Notice tone="ok" title="Cadastro aprovado">
          Tabela de preços: {TABELAS[conta.tabela] ?? conta.tabela}.
        </Notice>
      ) : null}
      {conta?.estado === 'bloqueada' ? (
        <Notice tone="danger" title="Conta com restrição">
          A loja não liberou esta conta para pedidos. Fale diretamente com a loja.
        </Notice>
      ) : null}
      {!conta ? <Notice tone="info">Não foi possível conferir a situação do cadastro agora. Tente de novo mais tarde.</Notice> : null}

      <dl className="p-facts p-facts--card">
        <div>
          <dt>Nome</dt>
          <dd>{a.nome}</dd>
        </div>
        {a.estabelecimento ? (
          <div>
            <dt>Estabelecimento</dt>
            <dd>{a.estabelecimento}</dd>
          </div>
        ) : null}
        <div>
          <dt>E-mail</dt>
          <dd>{a.email}</dd>
        </div>
        <div>
          <dt>Telefone</dt>
          <dd>{a.telefone}</dd>
        </div>
        <div>
          <dt>Endereço</dt>
          <dd>{endereco || 'Não informado'}</dd>
        </div>
      </dl>
      <p className="p-muted p-small">
        Para corrigir algum dado, fale com a loja. Veja como cuidamos dos seus dados na{' '}
        <a className="p-link" href="/privacidade" target="_blank" rel="noopener noreferrer">
          política de privacidade
        </a>
        .
      </p>
      <div className="p-actions p-actions--stack">
        <button type="button" className="p-btn p-btn--ghost p-btn--block" onClick={signOut}>
          Sair da conta
        </button>
        <Link className="p-btn p-btn--ghost p-btn--block" to={path('esqueci-senha')}>
          Trocar a senha
        </Link>
      </div>
    </div>
  );
}

export function PortalNotFound() {
  const { path } = usePortal();
  return (
    <EmptyState
      icon="search"
      title="Página não encontrada"
      action={
        <Link className="p-btn p-btn--primary" to={path()}>
          Ir para o início da loja
        </Link>
      }
    >
      O endereço não existe nesta loja.
    </EmptyState>
  );
}
