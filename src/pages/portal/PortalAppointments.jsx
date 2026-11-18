import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { usePortal } from './PortalContext.jsx';
import { AgendaIndisponivel, AgendaTabs, SlotPicker, useAgenda } from './PortalBooking.jsx';
import { EmptyState, Notice, PIcon, PageTitle, Spinner, usePolling, useLoad } from './ui.jsx';
import {
  AGENDAMENTO_ATIVO,
  brl,
  duracaoEmTexto,
  estadoAgendamento,
  formatDateTime,
  hojeBrasilia,
  partesBrasilia,
  podeAlterarAgendamento,
  quandoEmTexto,
  rotulosDaAgenda,
} from './format.js';

const POLL_MS = 20_000;
const PORTE_NOME = { P: 'pequeno', M: 'médio', G: 'grande' };

function AgBadge({ estado }) {
  const info = estadoAgendamento(estado);
  return <span className={`p-badge p-badge--${info.tone}`}>{info.label}</span>;
}

/** Resumo de uma linha: "Corte + Barba". */
const resumoServicos = (ag) => ag.servicos.map((s) => s.nome).join(' + ') || 'Agendamento';

/* ------------------------------------------------------------ lista */
export function PortalAppointments() {
  const { api, path } = usePortal();
  const [state, reload] = useLoad(() => api.agendamentos().then((r) => r.agendamentos), [api]);
  const [announce, setAnnounce] = useState('');
  const known = useRef(new Map());

  const lista = state.data ?? [];
  const agora = Date.now();
  const proximos = lista.filter((a) => AGENDAMENTO_ATIVO.has(a.estado) && (partesBrasilia(a.inicio)?.ms ?? 0) >= agora - 3600000);
  const andamento = lista.some((a) => a.estado === 'solicitado');
  usePolling(() => reload(true), POLL_MS, andamento);

  useEffect(() => {
    if (!state.data) return;
    const changes = [];
    for (const a of state.data) {
      const before = known.current.get(a.id);
      if (before && before !== a.estado) changes.push(`Agendamento ${a.referencia}: ${estadoAgendamento(a.estado).label}.`);
      known.current.set(a.id, a.estado);
    }
    if (changes.length) setAnnounce(changes.join(' '));
  }, [state.data]);

  const anteriores = lista.filter((a) => !proximos.includes(a));

  const bloco = (titulo, itens, id) =>
    itens.length ? (
      <section className="p-section" aria-labelledby={id}>
        <h2 className="p-h2" id={id}>
          {titulo}
        </h2>
        <ul className="p-orders">
          {itens.map((a) => (
            <li key={a.id}>
              <Link className="p-order" to={path(`agendamentos/${a.id}`)}>
                <span className="p-order__top">
                  <strong>{resumoServicos(a)}</strong>
                  <AgBadge estado={a.estado} />
                </span>
                <span>{quandoEmTexto(a.inicio)}</span>
                <span className="p-order__bottom p-muted p-small">
                  <span>
                    {a.referencia}
                    {a.profissionalNome ? ` · com ${a.profissionalNome}` : ''}
                    {a.pet?.nome ? ` · ${a.pet.nome}` : ''}
                  </span>
                  <strong>{brl(a.total)}</strong>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  return (
    <div>
      <PageTitle sub={andamento ? 'Os agendamentos aguardando a loja atualizam sozinhos.' : undefined}>Meus agendamentos</PageTitle>
      <AgendaTabs atual="agendamentos" />
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      {state.status === 'loading' ? <Spinner label="Carregando os agendamentos" /> : null}
      {state.status === 'error' ? (
        <AgendaIndisponivel state={state} reload={reload} />
      ) : null}
      {state.status === 'ready' && lista.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Você ainda não tem agendamentos"
          action={
            <Link className="p-btn p-btn--primary" to={path('agendar')}>
              Agendar um horário
            </Link>
          }
        >
          Quando você marcar um horário, ele aparece aqui com o andamento.
        </EmptyState>
      ) : null}
      {bloco('Próximos', proximos, 'ag-prox')}
      {bloco('Anteriores', anteriores, 'ag-ant')}
    </div>
  );
}

/* ---------------------------------------------------------- detalhe */
export function PortalAppointment() {
  const { id } = useParams();
  const { api, path } = usePortal();
  const location = useLocation();
  const [state, reload] = useLoad(() => api.agendamento(id).then((r) => r.agendamento), [api, id]);
  const [agendaState] = useAgenda();
  const [modo, setModo] = useState(null); // null | 'cancelar' | 'remarcar'
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [announce, setAnnounce] = useState('');
  const before = useRef(null);

  const ag = state.data;
  const agenda = agendaState.data;
  const prazo = agenda?.regras?.prazoCancelarMin;
  const rot = rotulosDaAgenda(agenda);
  usePolling(() => reload(true), POLL_MS, Boolean(ag) && ag.estado === 'solicitado');

  useEffect(() => {
    if (!ag) return;
    if (before.current && before.current !== ag.estado) setAnnounce(`O agendamento agora está: ${estadoAgendamento(ag.estado).label}.`);
    before.current = ag.estado;
  }, [ag]);

  const podeAlterar = useMemo(() => podeAlterarAgendamento(ag, prazo), [ag, prazo]);

  const cancelar = async () => {
    setBusy(true);
    setErro(null);
    try {
      await api.cancelarAgendamento(id);
      setModo(null);
      setAviso('Agendamento cancelado. A loja foi avisada.');
      await reload(true);
    } catch (e) {
      setErro(e.message);
      setModo(null);
      reload(true);
    } finally {
      setBusy(false);
    }
  };

  if (state.status === 'loading') return <Spinner label="Carregando o agendamento" />;
  if (state.status === 'error' && !ag) {
    return (
      <EmptyState
        icon="alert"
        title={state.error?.status === 404 ? 'Agendamento não encontrado' : 'Não foi possível carregar o agendamento'}
        action={
          <Link className="p-btn p-btn--primary" to={path('agendamentos')}>
            Voltar para meus agendamentos
          </Link>
        }
      >
        {state.error?.status === 404 ? 'Ele não existe ou não é da sua conta.' : state.error?.message}
      </EmptyState>
    );
  }

  const info = estadoAgendamento(ag.estado);
  const ativo = ['solicitado', 'confirmado'].includes(ag.estado);
  return (
    <div>
      <p className="p-back">
        <Link className="p-link" to={path('agendamentos')}>
          ← Meus agendamentos
        </Link>
      </p>
      <PageTitle sub={ag.criadoEm ? `Pedido feito em ${formatDateTime(ag.criadoEm)}` : undefined}>Agendamento {ag.referencia}</PageTitle>
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      {location.state?.novo ? (
        <Notice tone="ok" title={location.state.estado === 'confirmado' ? 'Horário confirmado' : 'Pedido de horário enviado'}>
          {location.state.estado === 'confirmado'
            ? 'A loja confirmou o seu horário. Avisamos por e-mail se algo mudar.'
            : 'O horário está reservado para você até a loja confirmar. Avisamos por e-mail.'}
        </Notice>
      ) : null}
      {aviso ? <Notice tone="ok">{aviso}</Notice> : null}

      <div className="p-statusline">
        <AgBadge estado={ag.estado} />
        <span className="p-muted">{info.hint}</span>
      </div>
      {['recusado', 'cancelado_loja', 'remarcado'].includes(ag.estado) && ag.motivo ? (
        <Notice tone={ag.estado === 'remarcado' ? 'info' : 'danger'} title="Recado da loja">
          {ag.motivo}
        </Notice>
      ) : null}

      <dl className="p-facts p-facts--card">
        <div>
          <dt>Quando</dt>
          <dd>
            <strong>{quandoEmTexto(ag.inicio)}</strong> <span className="p-muted p-small">(horário de Brasília)</span>
          </dd>
        </div>
        <div>
          <dt>Serviços</dt>
          <dd>
            <ul className="p-list p-list--tight">
              {ag.servicos.map((s) => (
                <li key={`${s.servicoId}-${s.nome}`}>
                  {s.nome}
                  {s.duracao ? ` · ${duracaoEmTexto(s.duracao)}` : ''}
                  {Number.isFinite(s.preco) ? ` · ${brl(s.preco)}` : ''}
                </li>
              ))}
            </ul>
          </dd>
        </div>
        {ag.profissionalNome ? (
          <div>
            <dt>{rot.profissional}</dt>
            <dd>{ag.profissionalNome}</dd>
          </div>
        ) : null}
        {ag.pet ? (
          <div>
            <dt>Pet</dt>
            <dd>
              {ag.pet.nome}
              {ag.pet.especie ? ` · ${ag.pet.especie}` : ''}
              {ag.pet.raca ? ` · ${ag.pet.raca}` : ''}
              {ag.pet.porte ? ` · porte ${PORTE_NOME[ag.pet.porte]}` : ''}
            </dd>
          </div>
        ) : null}
        {ag.observacao ? (
          <div>
            <dt>Seu recado</dt>
            <dd>{ag.observacao}</dd>
          </div>
        ) : null}
        <div>
          <dt>Total estimado</dt>
          <dd>
            <strong>{brl(ag.total)}</strong> <span className="p-muted p-small">Pagamento na loja.</span>
          </dd>
        </div>
      </dl>

      {erro ? <Notice tone="danger">{erro}</Notice> : null}

      {ativo && modo !== 'remarcar' ? (
        <div className="p-actions p-actions--stack">
          {podeAlterar && modo !== 'cancelar' ? (
            <>
              <button type="button" className="p-btn p-btn--primary p-btn--block" onClick={() => (setModo('remarcar'), setErro(null), setAviso(null))}>
                <PIcon name="repeat" size={18} /> Remarcar
              </button>
              <button type="button" className="p-btn p-btn--danger p-btn--block" onClick={() => (setModo('cancelar'), setErro(null))}>
                Cancelar agendamento
              </button>
            </>
          ) : null}
          {podeAlterar && modo === 'cancelar' ? (
            <div className="p-confirm" role="group" aria-label="Confirmar cancelamento">
              <p>Cancelar o agendamento {ag.referencia}? O horário volta a ficar livre para outras pessoas.</p>
              <div className="p-actions">
                <button type="button" className="p-btn p-btn--danger" onClick={cancelar} disabled={busy}>
                  {busy ? 'Cancelando…' : 'Sim, cancelar'}
                </button>
                <button type="button" className="p-btn p-btn--ghost" onClick={() => setModo(null)}>
                  Voltar
                </button>
              </div>
            </div>
          ) : null}
          {!podeAlterar ? (
            <p className="p-muted p-small">
              O prazo para cancelar ou remarcar já passou{Number.isFinite(prazo) && prazo > 0 ? ` (até ${duracaoEmTexto(prazo)} antes do horário)` : ''}. Fale com a loja se precisar.
            </p>
          ) : null}
        </div>
      ) : null}

      {ativo && modo === 'remarcar' ? (
        <Remarcar
          ag={ag}
          agenda={agenda}
          loading={agendaState.status === 'loading'}
          onDone={async () => {
            setModo(null);
            setAviso('Pedido de novo horário enviado. A loja confirma em breve.');
            await reload(true);
          }}
          onCancel={() => setModo(null)}
        />
      ) : null}

      {!ativo ? (
        <div className="p-actions p-actions--stack">
          <Link className="p-btn p-btn--primary p-btn--block" to={path('agendar')}>
            Agendar outro horário
          </Link>
        </div>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------- remarcar */
function Remarcar({ ag, agenda, loading, onDone, onCancel }) {
  const { api } = usePortal();
  const [data, setData] = useState(() => partesBrasilia(ag.inicio)?.dia ?? hojeBrasilia());
  const [slot, setSlot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const titleRef = useRef(null);
  const rot = rotulosDaAgenda(agenda);

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
  }, []);

  const hoje = hojeBrasilia();
  useEffect(() => {
    if (data < hoje) setData(hoje);
  }, [data, hoje]);

  if (loading || !agenda) return <Spinner label="Abrindo a agenda" />;

  const enviar = async () => {
    setBusy(true);
    setErro(null);
    try {
      await api.remarcarAgendamento(ag.id, { novoInicio: slot.inicio, ...(ag.profissionalId ? { profissionalId: slot.profissionalId } : {}) });
      await onDone();
    } catch (e) {
      if (['SLOT_TAKEN', 'TOO_SOON', 'TOO_FAR'].includes(e.code)) {
        setSlot(null);
        setAviso(e.code === 'SLOT_TAKEN' ? 'Esse horário acabou de ser ocupado. Escolha outro da lista atualizada.' : e.message);
        setReloadToken((n) => n + 1);
      } else setErro(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="p-section p-remarcar" aria-labelledby="ag-remarcar-titulo">
      <h2 className="p-h2" id="ag-remarcar-titulo" tabIndex={-1} ref={titleRef}>
        Escolha o novo horário
      </h2>
      <p className="p-muted">
        Atual: {quandoEmTexto(ag.inicio)}. Ao remarcar, o pedido volta para a loja confirmar e o horário antigo é liberado.
      </p>
      {erro ? <Notice tone="danger">{erro}</Notice> : null}
      <SlotPicker
        servicoIds={ag.servicos.map((s) => s.servicoId)}
        profissionalId={ag.profissionalId}
        porte={ag.pet?.porte ?? undefined}
        regras={agenda.regras}
        data={data}
        onData={(d) => (setData(d), setSlot(null), setAviso(null))}
        value={slot}
        onChange={setSlot}
        reloadToken={reloadToken}
        rotulos={rot}
        notice={aviso}
      />
      {slot ? (
        <p className="p-picked" role="status">
          <PIcon name="check" size={18} /> {quandoEmTexto(slot.inicio)}
        </p>
      ) : null}
      <div className="p-wizard-actions">
        <button type="button" className="p-btn p-btn--ghost" onClick={onCancel} disabled={busy}>
          Voltar
        </button>
        <button type="button" className="p-btn p-btn--primary p-btn--lg" onClick={enviar} disabled={!slot || busy}>
          {busy ? 'Enviando…' : 'Confirmar novo horário'}
        </button>
      </div>
    </section>
  );
}
