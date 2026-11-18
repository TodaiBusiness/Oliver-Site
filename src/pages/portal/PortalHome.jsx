import { Link } from 'react-router-dom';
import { usePortal } from './PortalContext.jsx';
import { PIcon, Notice } from './ui.jsx';
import { brl, formatDateTime, horariosEmLinhas } from './format.js';

/** Entrada da loja: quem é, como pedir e o que fazer agora (entrar, criar conta ou ver o catálogo). */
export default function PortalHome() {
  const { loja, signedIn, session, path } = usePortal();
  const d = loja.data;
  const horarios = horariosEmLinhas(d.horarios);
  const pendente = signedIn && session.conta?.estado === 'pendente';

  return (
    <div className="p-home">
      <section className="p-hero" aria-labelledby="p-hero-title">
        <p className="p-eyebrow">Pedidos online</p>
        <h1 className="p-hero__title" id="p-hero-title" tabIndex={-1}>
          {d.nomePublico}
        </h1>
        <p className="p-hero__lead">
          Peça pelo celular e retire na loja ou receba em casa. O pagamento é feito na entrega ou na retirada.
        </p>

        {!d.aceitaPedidos ? (
          <Notice tone="warn" title="A loja não está recebendo pedidos agora">
            Você pode olhar o catálogo, mas só consegue enviar pedidos quando a loja voltar a aceitar.
          </Notice>
        ) : null}
        {d.mensagemAviso ? (
          <Notice tone="info" title="Aviso da loja">
            {d.mensagemAviso}
          </Notice>
        ) : null}
        {pendente ? (
          <Notice tone="warn" title="Cadastro em análise">
            Preços de atacado após aprovação da loja. Enquanto isso, você vê os preços de varejo.
          </Notice>
        ) : null}

        <div className="p-actions">
          {signedIn ? (
            <>
              <Link className="p-btn p-btn--primary p-btn--lg" to={path('catalogo')}>
                Ver o catálogo
              </Link>
              <Link className="p-btn p-btn--ghost p-btn--lg" to={path('pedidos')}>
                Meus pedidos
              </Link>
            </>
          ) : (
            <>
              <Link className="p-btn p-btn--primary p-btn--lg" to={path('entrar')}>
                Entrar
              </Link>
              <Link className="p-btn p-btn--ghost p-btn--lg" to={path('cadastro')}>
                Criar conta
              </Link>
            </>
          )}
        </div>
        {!signedIn ? <p className="p-muted p-small">Os preços aparecem depois que você entra na sua conta.</p> : null}
      </section>

      <section className="p-cards" aria-label="Como funciona a loja">
        <article className="p-card">
          <PIcon name="bag" />
          <h2 className="p-card__title">Retirada</h2>
          <p className="p-muted">{d.retirada ? 'Escolha o dia e a faixa de horário e busque na loja.' : 'Esta loja não faz retirada pelo portal.'}</p>
        </article>
        <article className="p-card">
          <PIcon name="truck" />
          <h2 className="p-card__title">Entrega</h2>
          <p className="p-muted">
            {d.entrega
              ? d.taxaEntrega > 0
                ? `Entregamos no seu endereço. Taxa de ${brl(d.taxaEntrega)}.`
                : 'Entregamos no seu endereço, sem taxa.'
              : 'Esta loja não faz entrega pelo portal.'}
          </p>
        </article>
        <article className="p-card">
          <PIcon name="receipt" />
          <h2 className="p-card__title">Pedido mínimo</h2>
          <p className="p-muted">{d.pedidoMinimo > 0 ? `${brl(d.pedidoMinimo)} em produtos.` : 'Sem valor mínimo.'}</p>
        </article>
      </section>

      {horarios.length ? (
        <section className="p-section" aria-labelledby="p-horarios">
          <h2 className="p-h2" id="p-horarios">
            <PIcon name="clock" /> Horários
          </h2>
          <ul className="p-list">
            {horarios.map((linha) => (
              <li key={linha}>{linha}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {d.catalogoAtualizadoEm ? (
        <p className="p-muted p-small p-stamp">Catálogo atualizado em {formatDateTime(d.catalogoAtualizadoEm)}.</p>
      ) : null}
    </div>
  );
}
