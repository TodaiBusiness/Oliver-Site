import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePortal } from './PortalContext.jsx';
import { EmptyState, Field, Notice, PIcon, PageTitle, Spinner, describedBy, useLoad } from './ui.jsx';
import {
  brl,
  diaCurto,
  diaExtenso,
  duracaoEmTexto,
  ehPetShop,
  hojeBrasilia,
  partesBrasilia,
  periodoDoHorario,
  precoMinimoServico,
  quandoEmTexto,
  rotulosDaAgenda,
  servicoPorPorte,
  somaDias,
} from './format.js';

const newKey = () =>
  globalThis.crypto?.randomUUID?.().replace(/-/g, '') ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

const PORTES = [
  ['P', 'Pequeno', 'até 10 kg'],
  ['M', 'Médio', '10 a 25 kg'],
  ['G', 'Grande', 'acima de 25 kg'],
];
const ESPECIES = ['Cão', 'Gato', 'Outro'];
const DIAS_NA_FAIXA = 14;

/** Abas "Novo agendamento" e "Meus agendamentos", comuns às duas telas. */
export function AgendaTabs({ atual }) {
  const { path } = usePortal();
  const tabs = [
    ['agendar', 'Novo agendamento'],
    ['agendamentos', 'Meus agendamentos'],
  ];
  return (
    <nav className="p-tabs" aria-label="Agenda">
      {tabs.map(([to, label]) => (
        <Link key={to} to={path(to)} className="p-tab" aria-current={atual === to ? 'page' : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

/** Carrega a agenda publicada; 404 = a loja não oferece agendamento. */
export function useAgenda() {
  const { api } = usePortal();
  return useLoad(() => api.agenda().then((r) => r.agenda), [api]);
}

export function AgendaIndisponivel({ state, reload }) {
  const { path } = usePortal();
  const naoTem = state.error?.status === 404;
  return (
    <EmptyState
      icon={naoTem ? 'calendar' : 'alert'}
      title={naoTem ? 'Esta loja não recebe agendamentos pelo portal' : 'Não foi possível abrir a agenda'}
      action={
        naoTem ? (
          <Link className="p-btn p-btn--primary" to={path('')}>
            Voltar para o início
          </Link>
        ) : (
          <button type="button" className="p-btn p-btn--primary" onClick={() => reload()}>
            Tentar de novo
          </button>
        )
      }
    >
      {naoTem ? 'Para marcar um horário, fale diretamente com a loja.' : state.error?.message}
    </EmptyState>
  );
}

/* ======================================================= escolha de horário */

const MOTIVOS_VAZIO = {
  sem_expediente: 'A loja não atende neste dia.',
  sem_profissional: 'Ninguém atende este serviço neste dia.',
  antecedencia: 'Já passou do prazo para marcar neste dia.',
  fora_antecedencia: 'Já passou do prazo para marcar neste dia.',
  muito_longe: 'Este dia está além do prazo que a loja aceita.',
  folga: 'Folga neste dia.',
};

/**
 * Dia + horários livres. Os horários vêm prontos da API (jornada, pausas, folgas, ocupação):
 * aqui só se escolhe. Mostrados em hora de Brasília, em botões por período.
 */
export function SlotPicker({ servicoIds, profissionalId, porte, regras, data, onData, value, onChange, reloadToken = 0, rotulos, notice }) {
  const { api } = usePortal();
  const hoje = hojeBrasilia();
  const maxDias = Number.isFinite(regras?.antecedenciaMaxDias) && regras.antecedenciaMaxDias > 0 ? regras.antecedenciaMaxDias : 60;
  const minDia = hoje;
  const maxDia = somaDias(hoje, maxDias);
  const dias = useMemo(() => Array.from({ length: Math.min(DIAS_NA_FAIXA, maxDias + 1) }, (_, i) => somaDias(hoje, i)), [hoje, maxDias]);
  const [state, setState] = useState({ status: 'loading', slots: [], motivo: null, error: null });
  const [retry, setRetry] = useState(0);
  const chave = `${servicoIds.join(',')}|${profissionalId ?? ''}|${porte ?? ''}|${data}|${reloadToken}|${retry}`;
  const lastValue = useRef(value);
  lastValue.current = value;

  useEffect(() => {
    let vivo = true;
    setState((s) => ({ ...s, status: 'loading', error: null }));
    api
      .horarios({ servicos: servicoIds, profissionalId, data, porte })
      .then((r) => {
        if (!vivo) return;
        /* Um horário por início (com "qualquer", a API pode mandar o mesmo horário de mais de uma pessoa). */
        const vistos = new Set();
        const slots = r.slots.filter((s) => (vistos.has(s.inicio) ? false : vistos.add(s.inicio)));
        setState({ status: 'ready', slots, motivo: r.motivoVazio ?? null, error: null });
        /* Horário escolhido que sumiu da lista (outro cliente levou): limpa a escolha. */
        if (lastValue.current && !slots.some((s) => s.inicio === lastValue.current.inicio)) onChange(null);
      })
      .catch((error) => vivo && setState({ status: 'error', slots: [], motivo: null, error }));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, chave]);

  const porPeriodo = useMemo(() => {
    const grupos = new Map();
    for (const slot of state.slots) {
      const hora = partesBrasilia(slot.inicio)?.hora;
      if (!hora) continue;
      const periodo = periodoDoHorario(hora);
      if (!grupos.has(periodo)) grupos.set(periodo, []);
      grupos.get(periodo).push({ ...slot, hora });
    }
    return ['Manhã', 'Tarde', 'Noite'].filter((p) => grupos.has(p)).map((p) => [p, grupos.get(p)]);
  }, [state.slots]);

  const proximoDia = somaDias(data, 1);
  const quantos = state.slots.length;

  return (
    <div className="p-slotpicker">
      <fieldset className="p-fieldset p-fieldset--flat">
        <legend className="p-legend">Escolha o dia</legend>
        <div className="p-days" role="group" aria-label="Próximos dias">
          {dias.map((dia) => {
            const c = diaCurto(dia);
            return (
              <button key={dia} type="button" className="p-day" aria-pressed={data === dia} onClick={() => onData(dia)} aria-label={diaExtenso(dia)}>
                <span className="p-day__sem">{dia === hoje ? 'hoje' : c.sem}</span>
                <span className="p-day__num">{c.num}</span>
                <span className="p-day__mes">{c.mes}</span>
              </button>
            );
          })}
        </div>
        <Field id="ag-outra-data" label="Outra data" hint="Use se o dia que você quer não está na lista acima.">
          <input
            id="ag-outra-data"
            className="p-input p-input--date"
            type="date"
            min={minDia}
            max={maxDia}
            value={data}
            aria-describedby="ag-outra-data-hint"
            onChange={(e) => e.target.value && e.target.value >= minDia && e.target.value <= maxDia && onData(e.target.value)}
          />
        </Field>
      </fieldset>

      <h3 className="p-h3" id="ag-horarios-titulo">
        Horários livres em {diaExtenso(data)}
      </h3>
      <p className="p-muted p-small">Horários de Brasília.</p>
      {notice ? (
        <div className="p-notice p-notice--warn" role="alert">
          <PIcon name="alert" />
          <div className="p-notice__body">{notice}</div>
        </div>
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {state.status === 'ready' ? (quantos ? `${quantos} horários livres em ${diaExtenso(data)}.` : 'Nenhum horário livre neste dia.') : ''}
      </p>

      {state.status === 'loading' ? <Spinner label="Buscando horários livres" /> : null}
      {state.status === 'error' ? (
        <EmptyState
          icon="alert"
          title="Não foi possível buscar os horários"
          action={
            <button type="button" className="p-btn p-btn--primary" onClick={() => setRetry((n) => n + 1)}>
              Tentar de novo
            </button>
          }
        >
          {state.error?.message}
        </EmptyState>
      ) : null}
      {state.status === 'ready' && quantos === 0 ? (
        <EmptyState
          icon="calendar"
          title="Sem horários livres neste dia"
          action={
            proximoDia <= maxDia ? (
              <button type="button" className="p-btn p-btn--ghost" onClick={() => onData(proximoDia)}>
                Ver {diaExtenso(proximoDia)}
              </button>
            ) : null
          }
        >
          {MOTIVOS_VAZIO[state.motivo] ?? 'Todos os horários estão ocupados.'} Escolha outro dia
          {rotulos && profissionalId ? ` ou outro ${rotulos.profissional.toLowerCase()}` : ''}.
        </EmptyState>
      ) : null}

      {state.status === 'ready' && quantos > 0 ? (
        <div className="p-periods" aria-labelledby="ag-horarios-titulo">
          {porPeriodo.map(([periodo, slots]) => (
            <section key={periodo} className="p-period" aria-label={periodo}>
              <h4 className="p-period__title">{periodo}</h4>
              <div className="p-slots" role="group" aria-label={`Horários da ${periodo.toLowerCase()}`}>
                {slots.map((slot) => (
                  <button
                    key={slot.inicio}
                    type="button"
                    className="p-slot"
                    aria-pressed={value?.inicio === slot.inicio}
                    onClick={() => onChange({ inicio: slot.inicio, profissionalId: slot.profissionalId, profissionalNome: slot.profissionalNome })}
                  >
                    {slot.hora}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ================================================================ porte */

export function PortePicker({ value, onChange, error }) {
  return (
    <fieldset className="p-fieldset p-fieldset--flat" aria-describedby={error ? 'ag-porte-error' : undefined}>
      <legend className="p-legend">Porte do pet</legend>
      <div className="p-grid3">
        {PORTES.map(([id, nome, dica]) => (
          <label key={id} className="p-choice p-choice--compact">
            <input type="radio" name="ag-porte" checked={value === id} onChange={() => onChange(id)} />
            <span>
              <strong>{nome}</strong>
              <small>{dica}</small>
            </span>
          </label>
        ))}
      </div>
      {error ? (
        <p className="p-field__error" id="ag-porte-error">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

/* ============================================================ fluxo em passos */

export default function PortalBooking() {
  const [state, reload] = useAgenda();
  const { loja } = usePortal();

  if (state.status === 'loading') return <Spinner label="Abrindo a agenda" />;
  if (state.status === 'error' || !state.data) {
    return (
      <div>
        <PageTitle>Agendar</PageTitle>
        <AgendaIndisponivel state={state} reload={reload} />
      </div>
    );
  }
  return <BookingFlow agenda={state.data} loja={loja.data} />;
}

function BookingFlow({ agenda, loja }) {
  const { api, path } = usePortal();
  const navigate = useNavigate();
  const rot = rotulosDaAgenda(agenda);
  const pet = ehPetShop(agenda);
  const regras = agenda.regras ?? {};

  const [passo, setPasso] = useState(0);
  const [servicos, setServicos] = useState([]);
  const [profissionalId, setProfissionalId] = useState('qualquer');
  const [data, setData] = useState(hojeBrasilia());
  const [slot, setSlot] = useState(null);
  const [porte, setPorte] = useState('');
  const [petDados, setPetDados] = useState({ nome: '', especie: 'Cão', raca: '' });
  const [observacao, setObservacao] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [slotAviso, setSlotAviso] = useState(null);
  const [erro, setErro] = useState(null);
  const [campos, setCampos] = useState({});
  const [enviando, setEnviando] = useState(false);
  const titleRef = useRef(null);
  const errorRef = useRef(null);
  const keyRef = useRef(null);

  const escolhidos = useMemo(() => agenda.servicos.filter((s) => servicos.includes(s.id)), [agenda.servicos, servicos]);
  const precisaPorte = escolhidos.some((s) => s.exigePorte);
  const profissionais = useMemo(
    () => agenda.profissionais.filter((p) => servicos.every((id) => p.servicos.includes(id))),
    [agenda.profissionais, servicos]
  );
  const profissionalAtual = profissionalId === 'qualquer' ? null : agenda.profissionais.find((p) => p.id === profissionalId);

  const passos = useMemo(
    () => [
      ['servicos', 'Serviço'],
      ['profissional', rot.profissional],
      ['horario', 'Dia e horário'],
      ...(pet ? [['pet', 'Seu pet']] : []),
      ['revisar', 'Revisar e enviar'],
    ],
    [pet, rot.profissional]
  );
  const id = passos[passo][0];

  /* Cada passo novo leva o foco ao título (leitor de tela anuncia). */
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [passo]);

  /* Mudou algo que invalida o horário escolhido: nova chave de envio e horário limpo. */
  useEffect(() => {
    keyRef.current = null;
  }, [servicos, profissionalId, slot, porte, petDados, observacao]);

  const total = escolhidos.reduce((s, sv) => s + (servicoPorPorte(sv, porte).preco ?? 0), 0);
  const duracaoTotal = escolhidos.reduce((s, sv) => s + (servicoPorPorte(sv, porte).duracao ?? 0), 0);
  const algumPrecoVariavel = escolhidos.some((s) => s.exigePorte) && !porte;

  const alternarServico = (sid) => {
    setServicos((atual) => (atual.includes(sid) ? atual.filter((x) => x !== sid) : [...atual, sid]));
    setSlot(null);
    setSlotAviso(null);
    setErro(null);
    /* Quem não faz o conjunto escolhido deixa de valer: volta para "qualquer". */
    setProfissionalId('qualquer');
  };

  const falha = (mensagem, detalhes) => {
    setErro(mensagem);
    setCampos(detalhes && typeof detalhes === 'object' ? detalhes : {});
    setTimeout(() => errorRef.current?.focus(), 0);
  };

  const validaPasso = () => {
    setErro(null);
    setCampos({});
    if (id === 'servicos' && servicos.length === 0) return falha('Escolha ao menos um serviço para continuar.'), false;
    if (id === 'horario') {
      if (precisaPorte && !porte) return setCampos({ 'pet.porte': 'Escolha o porte do pet para ver os horários.' }), falha('Escolha o porte do pet para ver os horários.'), false;
      if (!slot) return falha('Escolha um horário livre para continuar.'), false;
    }
    if (id === 'pet') {
      const c = {};
      if (!petDados.nome.trim()) c['pet.nome'] = 'Informe o nome do pet.';
      if (!porte) c['pet.porte'] = 'Escolha o porte do pet.';
      if (Object.keys(c).length) return falha('Complete os dados do pet.', c), false;
    }
    return true;
  };

  const avancar = () => validaPasso() && setPasso((p) => Math.min(p + 1, passos.length - 1));
  const voltar = () => {
    setErro(null);
    setCampos({});
    setPasso((p) => Math.max(p - 1, 0));
  };

  const enviar = async () => {
    setErro(null);
    setCampos({});
    keyRef.current ??= newKey();
    setEnviando(true);
    try {
      const { agendamento } = await api.criarAgendamento({
        servicos,
        profissionalId: slot.profissionalId,
        inicio: slot.inicio,
        ...(pet ? { pet: { nome: petDados.nome.trim(), especie: petDados.especie, raca: petDados.raca.trim(), porte } } : {}),
        ...(precisaPorte || pet ? { porte } : {}),
        observacao: observacao.trim(),
        idempotencyKey: keyRef.current,
      });
      navigate(path(`agendamentos/${agendamento.id}`), { state: { novo: true, estado: agendamento.estado }, replace: true });
    } catch (e) {
      if (['SLOT_TAKEN', 'TOO_SOON', 'TOO_FAR', 'INVALID_SLOT'].includes(e.code)) {
        /* Horário ocupado (outra pessoa foi mais rápida) ou fora da janela: volta aos horários, já recarregados. */
        setSlot(null);
        setSlotAviso(
          e.code === 'SLOT_TAKEN'
            ? 'Esse horário acabou de ser ocupado por outra pessoa. Escolha outro horário da lista atualizada.'
            : e.message
        );
        setReloadToken((n) => n + 1);
        setPasso(passos.findIndex(([k]) => k === 'horario'));
      } else {
        falha(e.message ?? 'Não foi possível enviar o agendamento.', e.details);
      }
    } finally {
      setEnviando(false);
    }
  };

  const fe = (name) => campos[name];
  const ultimo = passo === passos.length - 1;
  const lojaFechada = loja.abertoAgora === false;

  return (
    <div className="p-booking">
      <PageTitle>{rot.agendar}</PageTitle>
      <AgendaTabs atual="agendar" />

      <ol className="p-wsteps" aria-label="Passos do agendamento">
        {passos.map(([k, label], i) => (
          <li key={k} className={`p-wstep${i < passo ? ' p-wstep--done' : ''}${i === passo ? ' p-wstep--now' : ''}`} aria-current={i === passo ? 'step' : undefined}>
            <span className="p-wstep__bar" aria-hidden="true" />
            <span className="sr-only">
              Passo {i + 1}: {label}
              {i < passo ? ' (concluído)' : ''}
            </span>
          </li>
        ))}
      </ol>
      <p className="p-wstep__label">
        Passo {passo + 1} de {passos.length}
      </p>

      {erro ? (
        <div className="p-notice p-notice--danger" role="alert" tabIndex={-1} ref={errorRef}>
          <PIcon name="alert" />
          <div className="p-notice__body">{erro}</div>
        </div>
      ) : null}

      <section className="p-step-panel" aria-labelledby="ag-passo-titulo">
        <h2 className="p-h2" id="ag-passo-titulo" tabIndex={-1} ref={titleRef}>
          {id === 'servicos' && 'O que você quer fazer?'}
          {id === 'profissional' && `Com qual ${rot.profissional.toLowerCase()}?`}
          {id === 'horario' && 'Quando?'}
          {id === 'pet' && 'Sobre o seu pet'}
          {id === 'revisar' && 'Confira e envie'}
        </h2>

        {id === 'servicos' ? (
          <fieldset className="p-fieldset p-fieldset--flat">
            <legend className="sr-only">Serviços</legend>
            <p className="p-muted p-small">Você pode escolher mais de um.</p>
            <ul className="p-services">
              {agenda.servicos.map((sv) => {
                const marcado = servicos.includes(sv.id);
                const variavel = sv.exigePorte && sv.porte;
                return (
                  <li key={sv.id}>
                    <label className={`p-service${marcado ? ' p-service--on' : ''}`}>
                      <input type="checkbox" checked={marcado} onChange={() => alternarServico(sv.id)} />
                      <span className="p-service__body">
                        <strong>{sv.nome}</strong>
                        <small>
                          {variavel ? 'Duração e preço conforme o porte' : duracaoEmTexto(sv.duracao)}
                          {sv.categoria ? ` · ${sv.categoria}` : ''}
                        </small>
                      </span>
                      <span className="p-service__price">
                        {variavel ? <small>a partir de </small> : null}
                        {brl(precoMinimoServico(sv))}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {agenda.servicos.length === 0 ? <Notice tone="warn">A loja ainda não publicou serviços para agendar.</Notice> : null}
            {escolhidos.length ? (
              <p className="p-muted p-small" aria-live="polite">
                {escolhidos.length} {escolhidos.length === 1 ? 'serviço' : 'serviços'}
                {!algumPrecoVariavel && duracaoTotal ? ` · ${duracaoEmTexto(duracaoTotal)}` : ''}
                {!algumPrecoVariavel ? ` · ${brl(total)}` : ''}
              </p>
            ) : null}
          </fieldset>
        ) : null}

        {id === 'profissional' ? (
          <fieldset className="p-fieldset p-fieldset--flat">
            <legend className="sr-only">{rot.profissional}</legend>
            <label className="p-choice">
              <input
                type="radio"
                name="ag-pro"
                checked={profissionalId === 'qualquer'}
                onChange={() => (setProfissionalId('qualquer'), setSlot(null))}
              />
              <span>
                <strong>{rot.qualquer}</strong>
                <small>Mais horários livres: a loja encaixa com quem estiver disponível.</small>
              </span>
            </label>
            {profissionais.map((p) => (
              <label key={p.id} className="p-choice">
                <input type="radio" name="ag-pro" checked={profissionalId === p.id} onChange={() => (setProfissionalId(p.id), setSlot(null))} />
                <span>
                  <strong>{p.nome}</strong>
                </span>
              </label>
            ))}
            {profissionais.length === 0 ? (
              <Notice tone="warn">Nenhum {rot.profissional.toLowerCase()} faz todos esses serviços juntos. Volte e marque em agendamentos separados.</Notice>
            ) : null}
          </fieldset>
        ) : null}

        {id === 'horario' ? (
          <>
            {precisaPorte ? (
              <PortePicker value={porte} onChange={(v) => (setPorte(v), setSlot(null))} error={fe('pet.porte')} />
            ) : null}
            {!precisaPorte || porte ? (
              <SlotPicker
                servicoIds={servicos}
                profissionalId={profissionalId === 'qualquer' ? null : profissionalId}
                porte={precisaPorte ? porte : undefined}
                regras={regras}
                data={data}
                onData={(d) => (setData(d), setSlot(null), setSlotAviso(null))}
                value={slot}
                onChange={setSlot}
                reloadToken={reloadToken}
                rotulos={rot}
                notice={slotAviso}
              />
            ) : (
              <p className="p-muted">Escolha o porte para ver os horários, porque a duração muda com ele.</p>
            )}
            {slot ? (
              <p className="p-picked" role="status">
                <PIcon name="check" size={18} /> {quandoEmTexto(slot.inicio)}
                {profissionalId === 'qualquer' && slot.profissionalNome ? ` · com ${slot.profissionalNome}` : ''}
              </p>
            ) : null}
          </>
        ) : null}

        {id === 'pet' ? (
          <div className="p-form">
            <Field id="pet-nome" label="Nome do pet" error={fe('pet.nome')}>
              <input id="pet-nome" className="p-input" value={petDados.nome} maxLength={60} autoComplete="off" required aria-invalid={!!fe('pet.nome') || undefined} aria-describedby={describedBy('pet-nome', { error: fe('pet.nome') })} onChange={(e) => setPetDados((d) => ({ ...d, nome: e.target.value }))} />
            </Field>
            <div className="p-grid2">
              <Field id="pet-especie" label="Espécie">
                <select id="pet-especie" className="p-input" value={petDados.especie} onChange={(e) => setPetDados((d) => ({ ...d, especie: e.target.value }))}>
                  {ESPECIES.map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </select>
              </Field>
              <Field id="pet-raca" label="Raça" optional>
                <input id="pet-raca" className="p-input" value={petDados.raca} maxLength={60} autoComplete="off" onChange={(e) => setPetDados((d) => ({ ...d, raca: e.target.value }))} />
              </Field>
            </div>
            {precisaPorte ? (
              <p className="p-muted">
                Porte: <strong>{PORTES.find(([k]) => k === porte)?.[1]}</strong>. Para trocar, volte ao passo anterior.
              </p>
            ) : (
              <PortePicker value={porte} onChange={setPorte} error={fe('pet.porte')} />
            )}
          </div>
        ) : null}

        {id === 'revisar' ? (
          <div>
            <dl className="p-facts p-facts--card">
              <div>
                <dt>Serviços</dt>
                <dd>
                  <ul className="p-list p-list--tight">
                    {escolhidos.map((sv) => {
                      const v = servicoPorPorte(sv, porte);
                      return (
                        <li key={sv.id}>
                          {sv.nome} · {duracaoEmTexto(v.duracao)} · {brl(v.preco)}
                        </li>
                      );
                    })}
                  </ul>
                </dd>
              </div>
              <div>
                <dt>{rot.profissional}</dt>
                <dd>{slot?.profissionalNome ?? profissionalAtual?.nome ?? rot.qualquer}</dd>
              </div>
              <div>
                <dt>Quando</dt>
                <dd>{quandoEmTexto(slot?.inicio)}</dd>
              </div>
              {pet ? (
                <div>
                  <dt>Pet</dt>
                  <dd>
                    {petDados.nome} · {petDados.especie}
                    {petDados.raca ? ` · ${petDados.raca}` : ''} · porte {PORTES.find(([k]) => k === porte)?.[1]?.toLowerCase()}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>Total estimado</dt>
                <dd>
                  <strong>{brl(total)}</strong> · {duracaoEmTexto(duracaoTotal)}
                </dd>
              </div>
            </dl>

            <Field id="ag-obs" label="Recado para a loja" optional hint={`${observacao.length} de 500 caracteres.`} error={fe('observacao')}>
              <textarea id="ag-obs" className="p-input p-textarea" rows={3} maxLength={500} value={observacao} onChange={(e) => setObservacao(e.target.value)} aria-describedby={describedBy('ag-obs', { error: fe('observacao'), hint: true })} />
            </Field>

            <Notice tone="info" icon="clock" title={regras.confirmacaoAuto ? 'Confirmação automática' : 'A loja confirma o seu horário'}>
              {regras.confirmacaoAuto
                ? 'Ao enviar, o horário já fica confirmado.'
                : 'Ao enviar, o horário fica reservado para você até a loja confirmar. Avisamos por e-mail.'}
              {lojaFechada ? ' A loja está fechada agora e confirma quando abrir.' : ''}
            </Notice>
            <p className="p-muted p-small">
              Não há pagamento online: você paga na loja.
              {Number.isFinite(regras.prazoCancelarMin) ? ` Você pode cancelar ou remarcar até ${duracaoEmTexto(regras.prazoCancelarMin) || 'o horário marcado'} antes.` : ''}
            </p>
          </div>
        ) : null}
      </section>

      <div className="p-wizard-actions">
        {passo > 0 ? (
          <button type="button" className="p-btn p-btn--ghost" onClick={voltar} disabled={enviando}>
            Voltar
          </button>
        ) : (
          <span />
        )}
        {ultimo ? (
          <button type="button" className="p-btn p-btn--primary p-btn--lg" onClick={enviar} disabled={enviando || !slot}>
            {enviando ? 'Enviando…' : 'Enviar agendamento'}
          </button>
        ) : (
          <button type="button" className="p-btn p-btn--primary p-btn--lg" onClick={avancar}>
            Continuar
          </button>
        )}
      </div>
    </div>
  );
}
