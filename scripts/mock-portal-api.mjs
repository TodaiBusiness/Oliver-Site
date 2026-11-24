/* =========================================================================
   API da loja FALSA, só para desenvolvimento e testes do portal (/l/:slug).
   -------------------------------------------------------------------------
   Implementa o lado da API do contrato do portal (itens 9 a 16: /api/v1/site/portal)
   em memória, com o mesmo formato de resposta. NÃO é a API real: não persiste nada
   e não confere licença. Serve a dois usos:

   · testes (`createMockBackend` + `mockFetch`): o servidor do site recebe um
     `fetch` que cai aqui, sem rede;
   · rodar o portal à mão: `node scripts/mock-portal-api.mjs` sobe a API falsa
     em http://localhost:8799. Para o site local falar com ela:
         LICENSING_API_BASE_URL=http://localhost:8799 SITE_SERVICE_API_KEY=<a mesma chave> npm run dev:api
     (a chave padrão do mock é a do exemplo abaixo; MOCK_PORTAL_KEY troca).

   Controles de bancada (fora do contrato), sob /__mock:
     POST /__mock/pedidos/:id/estado {estado}      muda o estado do pedido
     POST /__mock/contas/:id/decisao {estado,tabela}  aprova ou bloqueia a conta
     POST /__mock/agendamentos/:id/estado {estado,motivo}  a loja confirma, recusa, conclui...
     POST /__mock/agenda/ocupacao {slug,profissionalId,inicio,fim}  ocupa um horário (como o PDV)
   Agenda (Parte 5, B1 a B4): lojas `barbearia-demo` (preset Barbearia) e `petshop-demo` (preset Pet shop,
   serviços por porte); as demais dão 404 portal_agenda_inactive. Horários em Brasília (-03:00).
   Lojas prontas: `loja-demo` (fiado ligado, atacado), `so-retirada` (sem entrega,
   sem fiado), `loja-inativa` (404 portal_inactive) e `cor-ruim` (cores com
   contraste insuficiente, para testar o recálculo) e `loja-fechada` (fechada agora, abre amanhã às 08:00; prazo de cancelar 0).
   ========================================================================= */

import { createServer } from 'node:http';
import { deflateSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';

export const MOCK_SERVICE_KEY = 'chave-do-mock-do-portal-0123456789abcdef';

/* ---------------------------------------------------------------- PNG */
const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

/** PNG de verdade (RGB), com faixas diagonais suaves da cor dada. */
export function makePng(size, [r, g, b]) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const k = ((x + y) >> 3) % 2 ? 1 : 0.88;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = Math.round(r * k);
      raw[o + 1] = Math.round(g * k);
      raw[o + 2] = Math.round(b * k);
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(CRC(body));
    return Buffer.concat([len, body, crc]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head[8] = 8;
  head[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------- dados */
const PRODUTOS = [
  ['p-cerveja', 'Cerveja lata 350 ml', 'Bebidas', 'un', 'Gelada ou natural, lata 350 ml.', 4.5, 3.8, 3.4, true, 12, 12, [230, 160, 40]],
  ['p-refri', 'Refrigerante cola 2 L', 'Bebidas', 'un', null, 9.9, 8.5, 7.9, true, 1, 6, [200, 50, 50]],
  ['p-agua', 'Água mineral sem gás 500 ml', 'Bebidas', 'un', null, 2.5, 1.9, 1.6, true, 1, 12, [90, 160, 220]],
  ['p-suco', 'Suco de uva integral 1 L', 'Bebidas', 'un', 'Sem açúcar adicionado.', 12.9, 10.9, 9.9, false, 1, 6, [120, 60, 150]],
  ['p-arroz', 'Arroz branco tipo 1 5 kg', 'Mercearia', 'pct', 'Grãos selecionados.', 32.9, 28.9, 26.5, true, 1, 6, [220, 210, 180]],
  ['p-feijao', 'Feijão carioca 1 kg', 'Mercearia', 'pct', null, 8.9, 7.6, 7.1, true, 1, 20, [150, 100, 70]],
  ['p-cafe', 'Café torrado e moído 500 g', 'Mercearia', 'pct', 'Torra média, embalagem a vácuo.', 18.5, 15.9, 14.9, true, 1, 10, [90, 60, 40]],
  ['p-macarrao', 'Macarrão espaguete 500 g', 'Mercearia', 'pct', null, 5.2, 4.3, 3.9, true, 1, 20, [230, 200, 110]],
  ['p-detergente', 'Detergente neutro 500 ml', 'Limpeza', 'un', null, 2.99, 2.4, 2.1, true, 1, 24, [120, 200, 160]],
  ['p-sabao', 'Sabão em pó 1,6 kg', 'Limpeza', 'un', null, 21.9, 18.9, 17.5, true, 1, 8, [80, 130, 210]],
  ['p-banana', 'Banana prata', 'Hortifruti', 'kg', 'Vendida por quilo.', 7.9, 6.5, 5.9, true, 0.5, null, [240, 215, 80]],
  ['p-tomate', 'Tomate italiano', 'Hortifruti', 'kg', null, 9.5, 8.2, 7.4, true, 0.5, null, [210, 70, 50]],
  ['p-ovos', 'Ovos brancos bandeja 30', 'Hortifruti', 'bandeja', null, 24.9, 21.5, 19.9, true, 1, 12, [235, 225, 205]],
  ['p-leite', 'Leite integral 1 L', 'Laticínios', 'un', null, 5.4, 4.7, 4.4, true, 1, 12, [220, 230, 240]],
].map(([id, nome, categoria, unidade, descricao, v, a, rv, disponivel, multiplo, caixaQtd, cor]) => ({
  id, nome, categoria, unidade, descricao, v, a, rv, disponivel, multiplo, caixaQtd, cor,
}));


/* --------------------------------------------------------------- agenda */
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
const expediente = (sabado = true) => ({
  dom: [],
  seg: [{ abre: '09:00', fecha: '12:00' }, { abre: '13:00', fecha: '19:00' }],
  ter: [{ abre: '09:00', fecha: '12:00' }, { abre: '13:00', fecha: '19:00' }],
  qua: [{ abre: '09:00', fecha: '12:00' }, { abre: '13:00', fecha: '19:00' }],
  qui: [{ abre: '09:00', fecha: '12:00' }, { abre: '13:00', fecha: '19:00' }],
  sex: [{ abre: '09:00', fecha: '12:00' }, { abre: '13:00', fecha: '19:00' }],
  sab: sabado ? [{ abre: '09:00', fecha: '15:00' }] : [],
});

const AGENDA_BARBEARIA = {
  preset: 'Barbearia',
  rotulos: { profissional: 'Barbeiro', profissionais: 'Barbeiros', servico: 'Serviço', agendar: 'Agendar horário' },
  servicos: [
    { id: 's-corte', nome: 'Corte masculino', categoria: 'Cabelo', duracao: 30, folga: 5, preco: 45, exigePorte: false, ativo: true },
    { id: 's-barba', nome: 'Barba com toalha quente', categoria: 'Barba', duracao: 20, folga: 5, preco: 30, exigePorte: false, ativo: true },
    { id: 's-combo', nome: 'Corte + barba', categoria: 'Combo', duracao: 50, folga: 10, preco: 70, exigePorte: false, ativo: true },
    { id: 's-sobrancelha', nome: 'Sobrancelha', categoria: 'Barba', duracao: 10, folga: 0, preco: 15, exigePorte: false, ativo: true },
    { id: 's-antigo', nome: 'Serviço desativado', categoria: 'Cabelo', duracao: 30, folga: 0, preco: 10, exigePorte: false, ativo: false },
  ],
  profissionais: [
    { id: 'pr-rafa', nome: 'Rafa', cor: '#0f766e', servicos: [{ id: 's-corte' }, { id: 's-barba' }, { id: 's-combo' }, { id: 's-sobrancelha' }], horarios: expediente() },
    { id: 'pr-dani', nome: 'Dani', cor: '#9a3412', servicos: [{ id: 's-corte' }, { id: 's-combo' }, { id: 's-sobrancelha' }], horarios: expediente(false) },
  ],
  regras: { slotMin: 30, antecedenciaMinMin: 60, antecedenciaMaxDias: 30, prazoCancelarMin: 120, confirmacaoAuto: false },
};

const AGENDA_PET = {
  preset: 'Pet shop',
  rotulos: { profissional: 'Tosador', profissionais: 'Tosadores', servico: 'Serviço', agendar: 'Agendar banho e tosa' },
  servicos: [
    { id: 's-banho', nome: 'Banho', categoria: 'Banho', duracao: 45, folga: 10, preco: 50, exigePorte: true, porte: { P: { duracao: 40, preco: 45 }, M: { duracao: 60, preco: 60 }, G: { duracao: 90, preco: 80 } }, ativo: true },
    { id: 's-tosa', nome: 'Banho e tosa', categoria: 'Tosa', duracao: 90, folga: 10, preco: 90, exigePorte: true, porte: { P: { duracao: 75, preco: 80 }, M: { duracao: 100, preco: 100 }, G: { duracao: 130, preco: 130 } }, ativo: true },
    { id: 's-unha', nome: 'Corte de unhas', categoria: 'Extras', duracao: 15, folga: 0, preco: 20, exigePorte: false, ativo: true },
  ],
  profissionais: [
    { id: 'pr-leo', nome: 'Léo', cor: '#1d4ed8', servicos: [{ id: 's-banho' }, { id: 's-tosa' }, { id: 's-unha' }], horarios: expediente() },
    { id: 'pr-bia', nome: 'Bia', cor: '#be185d', servicos: [{ id: 's-banho' }, { id: 's-unha' }], horarios: expediente() },
  ],
  regras: { slotMin: 30, antecedenciaMinMin: 120, antecedenciaMaxDias: 45, prazoCancelarMin: 240, confirmacaoAuto: false },
};

const BR = 3 * 3600000; // Brasília = UTC-3 (sem horário de verão)
const pad2 = (n) => String(n).padStart(2, '0');
/** Instante (ms) de "yyyy-MM-dd" + "HH:MM" em Brasília. */
const brMs = (data, hhmm) => Date.parse(`${data}T${hhmm}:00-03:00`);
/** ms → "yyyy-MM-ddTHH:mm:ss-03:00". */
const brIso = (ms) => `${new Date(ms - BR).toISOString().slice(0, 19)}-03:00`;
const brDia = (ms) => new Date(ms - BR).toISOString().slice(0, 10);
const hhmmToMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const minToHhmm = (m) => `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;

/** "yyyy-MM-ddT08:00" do dia seguinte em Brasília (o formato de `proximaAbertura` da API). */
const amanhaAsOito = (ms) =>
  `${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(ms + 86400000)}T08:00`;

const BASE_LOJA = {
  aceitaPedidos: true,
  retirada: true,
  entrega: true,
  taxaEntrega: 6,
  pedidoMinimo: 40,
  mensagemAviso: 'Pedidos feitos até as 16h saem no mesmo dia.',
  horarios: ['Seg a sex: 8h às 19h', 'Sábado: 8h às 14h'],
  aberto: true, // simula o cálculo da API: abertoAgora + proximaAbertura (amanhã às 08:00 de Brasília)
  prazoCancelarMin: 10,
  fiadoAtivo: false,
  catalogoAtualizadoEm: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
};

export function createMockBackend({ serviceKey = MOCK_SERVICE_KEY, leaky = false, now = () => Date.now() } = {}) {
  const lojas = {
    'loja-demo': {
      ...BASE_LOJA,
      nomePublico: 'Mercadinho Boa Praça',
      cores: { primaria: '#0f766e', secundaria: '#fde68a', fundo: '#f8fafc' },
      fiadoAtivo: true,
      emailContato: 'contato@boapraca.exemplo',
      logo: makePng(96, [15, 118, 110]),
    },
    'so-retirada': {
      ...BASE_LOJA,
      nomePublico: 'Empório do Zé',
      cores: { primaria: '#9a3412', secundaria: '#fed7aa', fundo: '#fffbeb' },
      entrega: false,
      taxaEntrega: 0,
      pedidoMinimo: 0,
    },
    'cor-ruim': {
      ...BASE_LOJA,
      nomePublico: 'Doces da Lu',
      cores: { primaria: '#ffe066', secundaria: '#fff3b0', fundo: '#fffde7' },
      logo: null,
    },
    'loja-fechada': {
      ...BASE_LOJA,
      nomePublico: 'Padaria Estrela',
      cores: { primaria: '#1e3a8a', secundaria: '#dbeafe', fundo: '#0f172a' },
      aberto: false,
      prazoCancelarMin: 0,
      logo: null,
    },
    'barbearia-demo': {
      ...BASE_LOJA,
      nomePublico: 'Barbearia Navalha',
      cores: { primaria: '#1f2937', secundaria: '#fde68a', fundo: '#fafaf9' },
      aceitaPedidos: false,
      mensagemAviso: null,
      horarios: ['Ter a sáb: 9h às 19h'],
      logo: null,
      agenda: AGENDA_BARBEARIA,
    },
    'petshop-demo': {
      ...BASE_LOJA,
      nomePublico: 'Pet Feliz Banho e Tosa',
      cores: { primaria: '#1d4ed8', secundaria: '#bfdbfe', fundo: '#f8fafc' },
      aceitaPedidos: false,
      aberto: false,
      mensagemAviso: 'Traga a carteirinha de vacinação.',
      horarios: ['Seg a sex: 9h às 19h', 'Sábado: 9h às 15h'],
      logo: null,
      agenda: AGENDA_PET,
    },
    'loja-inativa': { inativa: true },
  };
  const agendamentos = new Map(); // id -> agendamento
  const idemAg = new Map(); // `${slug}|${key}` -> agendamento
  const ocupacao = []; // {slug, profissionalId, ini, fim} (ms) — o que o PDV publica
  let seqAg = 0;
  const contas = new Map(); // `${slug}|${contaId}` -> conta
  const pedidos = new Map(); // id -> pedido
  const idem = new Map(); // `${slug}|${key}` -> pedido
  let seq = 1000;

  const calls = [];
  const json = (status, body) => ({ status, json: body });
  const problem = (status, code, detail) => json(status, { status, code, detail, title: code });
  const priceOf = (p, tabela) => (tabela === 'revenda' ? p.rv : tabela === 'atacado' ? p.a : p.v);
  const round2 = (n) => Math.round(n * 100) / 100;

  function pedidoView(p) {
    const cancelavel = p.estado === 'recebido' && now() - p.criadoMs <= lojas[p.slug].prazoCancelarMin * 60000;
    return {
      id: p.id,
      referencia: p.referencia,
      estado: p.estado,
      criadoEm: new Date(p.criadoMs).toISOString(),
      atualizadoEm: new Date(p.atualizadoMs).toISOString(),
      itens: p.itens,
      total: p.total,
      entrega: p.entrega,
      pagamento: p.pagamento,
      observacao: p.observacao,
      motivoRecusa: p.motivoRecusa ?? null,
      podeCancelar: cancelavel,
    };
  }


  /* ---------------------------------------------------------- agenda */

  const ATIVOS = new Set(['solicitado', 'confirmado']);

  function duracaoDe(agenda, ids, porte) {
    let dur = 0;
    let folga = 0;
    let total = 0;
    const itens = [];
    for (const id of ids) {
      const sv = agenda.servicos.find((x) => x.id === id && x.ativo);
      if (!sv) return { erro: problem(400, 'invalid_service', 'Serviço inválido.') };
      let d = sv.duracao;
      let preco = sv.preco;
      if (sv.exigePorte) {
        if (!porte || !sv.porte?.[porte]) return { erro: problem(400, 'porte_required', 'Informe o porte do pet.') };
        d = sv.porte[porte].duracao;
        preco = sv.porte[porte].preco;
      }
      dur += d;
      folga = Math.max(folga, sv.folga ?? 0);
      total += preco;
      itens.push({ servicoId: sv.id, nome: sv.nome, duracao: d, preco });
    }
    return { dur, folga, total: round2(total), itens };
  }

  /** Início livre de um profissional (ms), sem contar o agendamento `ignorarId` (remarcar). */
  function livre(slug, pro, ini, fimBloq, ignorarId) {
    for (const o of ocupacao) if (o.slug === slug && o.profissionalId === pro.id && ini < o.fim && o.ini < fimBloq) return false;
    for (const a of agendamentos.values()) {
      if (a.slug !== slug || a.id === ignorarId || !ATIVOS.has(a.estado) || a.profissionalId !== pro.id) continue;
      if (ini < a.fimBloqueioMs && a.inicioMs < fimBloq) return false;
    }
    return true;
  }

  function slotsDe(slug, agenda, { ids, profissionalId, data, porte, ignorarId }) {
    const calc = duracaoDe(agenda, ids, porte);
    if (calc.erro) return { erro: calc.erro };
    const r = agenda.regras;
    const agora = now();
    const dow = SEMANA[new Date(`${data}T12:00:00Z`).getUTCDay()];
    const pros = agenda.profissionais.filter(
      (p) => (!profissionalId || p.id === profissionalId) && ids.every((id) => p.servicos.some((x) => x.id === id))
    );
    if (profissionalId && !pros.length) return { erro: problem(400, 'invalid_professional', 'Profissional inválido.') };
    const mapa = new Map();
    let temExpediente = false;
    for (const p of pros) {
      for (const faixa of p.horarios[dow] ?? []) {
        temExpediente = true;
        for (let m = hhmmToMin(faixa.abre); m + calc.dur <= hhmmToMin(faixa.fecha); m += r.slotMin) {
          const ini = brMs(data, minToHhmm(m));
          if (ini < agora + r.antecedenciaMinMin * 60000 || ini > agora + r.antecedenciaMaxDias * 86400000) continue;
          const fimBloq = ini + (calc.dur + calc.folga) * 60000;
          if (!livre(slug, p, ini, fimBloq, ignorarId)) continue;
          if (!mapa.has(ini)) mapa.set(ini, { inicio: brIso(ini), fim: brIso(ini + calc.dur * 60000), profissionalId: p.id, profissionalNome: p.nome });
        }
      }
    }
    const slots = [...mapa.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    const motivoVazio = slots.length ? undefined : !temExpediente ? 'sem_expediente' : 'sem_horarios';
    return { slots, motivoVazio, calc };
  }

  function agView(a, agenda) {
    const antes = a.inicioMs - now();
    return {
      id: a.id,
      referencia: a.referencia,
      estado: a.estado,
      criadoEm: new Date(a.criadoMs).toISOString(),
      servicos: a.servicos,
      profissionalId: a.profissionalId,
      profissionalNome: a.profissionalNome,
      inicio: brIso(a.inicioMs),
      fim: brIso(a.fimMs),
      pet: a.pet,
      observacao: a.observacao,
      total: a.total,
      motivo: a.motivo ?? null,
      podeCancelar: ATIVOS.has(a.estado) && antes >= agenda.regras.prazoCancelarMin * 60000,
    };
  }

  function agendaRoute(method, slug, loja, parts, query, body) {
    const agenda = loja.agenda;
    if (!agenda) return problem(404, 'portal_agenda_inactive');
    /* B1 */
    if (method === 'GET' && parts.length === 1) {
      return json(200, {
        preset: agenda.preset,
        rotulos: agenda.rotulos,
        servicos: agenda.servicos.filter((x) => x.ativo),
        profissionais: agenda.profissionais.map((p) => ({ id: p.id, nome: p.nome, cor: p.cor, servicos: p.servicos })),
        regras: agenda.regras,
        temAgenda: true,
        /* "Vazamento" proposital (só leaky): o site precisa descartar. */
        ...(leaky ? { custoInterno: 12.5, comissao: 0.4 } : {}),
      });
    }
    /* B2 */
    if (method === 'GET' && parts[1] === 'horarios') {
      const ids = String(query.servicos ?? '').split(',').filter(Boolean);
      const pro = query.profissionalId && query.profissionalId !== 'qualquer' ? query.profissionalId : null;
      if (!ids.length || !/^\d{4}-\d{2}-\d{2}$/.test(query.data ?? '')) return problem(400, 'invalid_request', 'Pedido inválido.');
      const r = slotsDe(slug, agenda, { ids, profissionalId: pro, data: query.data, porte: query.porte });
      if (r.erro) return r.erro;
      return json(200, { slots: r.slots, ...(r.motivoVazio ? { motivoVazio: r.motivoVazio } : {}) });
    }
    return null;
  }

  function criarAgendamento(slug, loja, body) {
    const agenda = loja.agenda;
    const c = contas.get(`${slug}|${body.contaId}`);
    if (!c) return problem(404, 'account_not_found');
    if (c.estado === 'bloqueada') return problem(409, 'account_blocked', 'Conta bloqueada.');
    const previo = idemAg.get(`${slug}|${body.idempotencyKey}`);
    if (previo) return json(200, { id: previo.id, referencia: previo.referencia, estado: previo.estado, inicio: brIso(previo.inicioMs), fim: brIso(previo.fimMs), total: previo.total });
    const ids = [...new Set(body.servicos ?? [])];
    if (!ids.length) return problem(400, 'invalid_service', 'Escolha um serviço.');
    const porte = body.porte ?? body.pet?.porte;
    if (agenda.preset === 'Pet shop' && !body.pet?.nome) return problem(400, 'pet_required', 'Informe os dados do pet.');
    const inicioMs = Date.parse(body.inicio);
    if (!Number.isFinite(inicioMs)) return problem(400, 'invalid_slot', 'Horário inválido.');
    const r = agenda.regras;
    if (inicioMs < now() + r.antecedenciaMinMin * 60000) return problem(409, 'too_soon', 'Muito próximo.');
    if (inicioMs > now() + r.antecedenciaMaxDias * 86400000) return problem(409, 'too_far', 'Muito distante.');
    const data = brDia(inicioMs);
    const res = slotsDe(slug, agenda, { ids, profissionalId: body.profissionalId ?? null, data, porte });
    if (res.erro) return res.erro;
    const slot = res.slots.find((s) => Date.parse(s.inicio) === inicioMs);
    if (!slot) return problem(409, 'slot_taken', 'Horário ocupado.');
    /* "Qualquer": a API escolhe quem estiver livre (aqui, o do primeiro horário). */
    const pro = agenda.profissionais.find((p) => p.id === slot.profissionalId);
    const ag = {
      id: randomUUID(),
      slug,
      contaId: body.contaId,
      referencia: `AG-W${String(++seqAg).padStart(4, '0')}`,
      estado: r.confirmacaoAuto ? 'confirmado' : 'solicitado',
      criadoMs: now(),
      servicos: res.calc.itens,
      profissionalId: pro.id,
      profissionalNome: pro.nome,
      inicioMs,
      fimMs: inicioMs + res.calc.dur * 60000,
      fimBloqueioMs: inicioMs + (res.calc.dur + res.calc.folga) * 60000,
      pet: body.pet ?? null,
      observacao: body.observacao ?? '',
      total: res.calc.total,
      porte,
    };
    agendamentos.set(ag.id, ag);
    idemAg.set(`${slug}|${body.idempotencyKey}`, ag);
    return json(201, { id: ag.id, referencia: ag.referencia, estado: ag.estado, inicio: brIso(ag.inicioMs), fim: brIso(ag.fimMs), total: ag.total });
  }

  function agendamentosRoute(method, slug, loja, parts, query, body) {
    const agenda = loja.agenda;
    if (!agenda) return problem(404, 'portal_agenda_inactive');
    if (method === 'POST' && parts.length === 1) return criarAgendamento(slug, loja, body);
    if (method === 'GET' && parts.length === 1) {
      const lista = [...agendamentos.values()].filter((a) => a.slug === slug && a.contaId === query.contaId);
      return json(200, { agendamentos: lista.sort((a, b) => b.inicioMs - a.inicioMs).map((a) => agView(a, agenda)) });
    }
    const a = agendamentos.get(parts[1]);
    if (!a || a.slug !== slug || a.contaId !== query.contaId) return problem(404, 'booking_not_found');
    if (method === 'GET' && parts.length === 2) return json(200, agView(a, agenda));
    if (method === 'POST' && parts[2] === 'cancelar') {
      if (!ATIVOS.has(a.estado)) return problem(409, 'invalid_state', 'Estado inválido.');
      if (a.inicioMs - now() < agenda.regras.prazoCancelarMin * 60000) return problem(409, 'cancel_window_closed', 'Prazo vencido.');
      a.estado = 'cancelado_cliente';
      return json(200, { estado: a.estado });
    }
    if (method === 'POST' && parts[2] === 'remarcar') {
      if (!ATIVOS.has(a.estado)) return problem(409, 'invalid_state', 'Estado inválido.');
      if (a.inicioMs - now() < agenda.regras.prazoCancelarMin * 60000) return problem(409, 'cancel_window_closed', 'Prazo vencido.');
      const novo = Date.parse(body.novoInicio);
      if (!Number.isFinite(novo)) return problem(400, 'invalid_slot', 'Horário inválido.');
      const r = agenda.regras;
      if (novo < now() + r.antecedenciaMinMin * 60000) return problem(409, 'too_soon', 'Muito próximo.');
      if (novo > now() + r.antecedenciaMaxDias * 86400000) return problem(409, 'too_far', 'Muito distante.');
      const res = slotsDe(slug, agenda, { ids: a.servicos.map((x) => x.servicoId), profissionalId: body.profissionalId ?? a.profissionalId, data: brDia(novo), porte: a.porte, ignorarId: a.id });
      if (res.erro) return res.erro;
      const slot = res.slots.find((s) => Date.parse(s.inicio) === novo);
      if (!slot) return problem(409, 'slot_taken', 'Horário ocupado.');
      const pro = agenda.profissionais.find((p) => p.id === slot.profissionalId);
      Object.assign(a, {
        estado: 'solicitado',
        inicioMs: novo,
        fimMs: novo + res.calc.dur * 60000,
        fimBloqueioMs: novo + (res.calc.dur + res.calc.folga) * 60000,
        profissionalId: pro.id,
        profissionalNome: pro.nome,
      });
      return json(200, { estado: a.estado, inicio: brIso(a.inicioMs) });
    }
    return null;
  }

  function handle({ method, path, query = {}, body = {}, headers = {} }) {
    calls.push({ method, path, query, body });

    if (path.startsWith('/__mock/')) return bench(method, path, body);

    const m = /^\/api\/v1\/site\/portal\/([^/]+)(?:\/(.*))?$/.exec(path);
    if (!m) return problem(404, 'not_found');
    if (serviceKey && headers['x-service-key'] !== serviceKey) return problem(401, 'unauthorized');
    const [, slug, rest = ''] = m;
    const loja = lojas[slug];
    if (!loja || loja.inativa) return problem(404, 'portal_inactive');
    const parts = rest ? rest.split('/') : [];

    /* 9. vitrine */
    if (method === 'GET' && parts.length === 0) {
      return json(200, {
        nomePublico: loja.nomePublico,
        cores: loja.cores,
        logoUrl: loja.logo ? `/api/v1/site/portal/${slug}/logo` : null,
        aceitaPedidos: loja.aceitaPedidos,
        abertoAgora: (loja.agenda || loja.aceitaPedidos) && loja.aberto,
        proximaAbertura: (loja.agenda || loja.aceitaPedidos) && !loja.aberto ? amanhaAsOito(now()) : null,
        retirada: loja.retirada,
        entrega: loja.entrega,
        taxaEntrega: loja.taxaEntrega,
        pedidoMinimo: loja.pedidoMinimo,
        mensagemAviso: loja.mensagemAviso,
        horarios: loja.horarios,
        prazoCancelarMin: loja.prazoCancelarMin,
        catalogoAtualizadoEm: loja.catalogoAtualizadoEm,
        fiadoAtivo: loja.fiadoAtivo,
        emailContato: loja.emailContato,
        temAgenda: Boolean(loja.agenda),
      });
    }
    if (method === 'GET' && parts[0] === 'logo' && loja.logo) return { status: 200, binary: loja.logo, contentType: 'image/png' };

    /* Agenda (B1 a B4) */
    if (parts[0] === 'agenda') {
      const r = agendaRoute(method, slug, loja, parts, query, body);
      if (r) return r;
    }
    if (parts[0] === 'agendamentos') {
      const r = agendamentosRoute(method, slug, loja, parts, query, body);
      if (r) return r;
    }

    /* 10 e 11. contas */
    if (parts[0] === 'contas') {
      if (method === 'POST' && parts.length === 1) {
        if (!body.contaId || !body.nome || !body.email) return problem(400, 'invalid_account', 'Dados da conta incompletos.');
        contas.set(`${slug}|${body.contaId}`, { ...body, estado: 'pendente', tabela: 'varejo' });
        return json(202, { estado: 'pendente' });
      }
      if (method === 'GET' && parts.length === 2) {
        const c = contas.get(`${slug}|${parts[1]}`);
        return c ? json(200, { estado: c.estado, tabela: c.tabela }) : problem(404, 'account_not_found');
      }
    }

    /* 12. catálogo (um único preço) */
    if (method === 'GET' && parts[0] === 'catalogo') {
      const c = contas.get(`${slug}|${query.contaId}`);
      if (!c) return problem(404, 'account_not_found');
      const ativa = c.estado === 'ativa';
      const tabela = ativa ? c.tabela : 'varejo';
      return json(200, {
        versao: '7',
        atualizadoEm: loja.catalogoAtualizadoEm,
        produtos: PRODUTOS.map((p) => ({
          produtoId: p.id,
          nome: p.nome,
          categoria: p.categoria,
          unidade: p.unidade,
          descricao: p.descricao,
          precoAplicado: priceOf(p, tabela),
          disponivel: p.disponivel,
          multiplo: p.multiplo,
          caixaQtd: p.caixaQtd,
          imagemHash: `h-${p.id}`,
          /* "Vazamento" proposital (só com leaky): o site precisa descartar. */
          ...(leaky ? { precoVarejo: p.v, precoAtacado: p.a, precoRevenda: p.rv } : {}),
        })),
      });
    }

    /* 13. imagem */
    if (method === 'GET' && parts[0] === 'produtos' && parts[2] === 'imagem') {
      const p = PRODUTOS.find((x) => x.id === parts[1]);
      return p ? { status: 200, binary: makePng(96, p.cor), contentType: 'image/png' } : problem(404, 'not_found');
    }

    /* 14 e 15. pedidos */
    if (parts[0] === 'pedidos') {
      if (method === 'POST' && parts.length === 1) return criarPedido(slug, loja, body);
      if (method === 'GET' && parts.length === 1) {
        const lista = [...pedidos.values()].filter((p) => p.slug === slug && p.contaId === query.contaId);
        return json(200, { pedidos: lista.sort((a, b) => b.criadoMs - a.criadoMs).map(pedidoView) });
      }
      const p = pedidos.get(parts[1]);
      if (!p || p.slug !== slug || p.contaId !== query.contaId) return problem(404, 'order_not_found');
      if (method === 'GET' && parts.length === 2) return json(200, pedidoView(p));
      if (method === 'POST' && parts[2] === 'cancelar') {
        if (p.estado !== 'recebido') return problem(409, 'invalid_state', 'Estado inválido.');
        if (now() - p.criadoMs > loja.prazoCancelarMin * 60000) return problem(409, 'cancel_window_closed', 'Prazo vencido.');
        p.estado = 'cancelado';
        p.atualizadoMs = now();
        return json(200, { estado: 'cancelado' });
      }
    }

    /* 16. fiado */
    if (method === 'GET' && parts[0] === 'fiado') {
      if (!loja.fiadoAtivo) return problem(404, 'not_found');
      if (!contas.has(`${slug}|${query.contaId}`)) return problem(404, 'account_not_found');
      const dia = (d) => new Date(now() + d * 86400000).toISOString().slice(0, 10);
      return json(200, {
        saldo: 186.4,
        vencido: 42.9,
        proximoVencimento: dia(6),
        atualizadoEm: new Date(now() - 2 * 3600000).toISOString(),
        extrato: [
          { data: dia(-3), descricao: 'Compra 10231', valor: 143.5, tipo: 'compra', vencimento: dia(6) },
          { data: dia(-12), descricao: 'Compra 10198', valor: 42.9, tipo: 'compra', vencimento: dia(-2) },
          { data: dia(-20), descricao: 'Pagamento recebido', valor: -80, tipo: 'pagamento' },
        ],
      });
    }
    return problem(404, 'not_found');
  }

  function criarPedido(slug, loja, body) {
    const c = contas.get(`${slug}|${body.contaId}`);
    if (!c) return problem(404, 'account_not_found');
    /* Como a API real: conta bloqueada e fiado não liberado são 403 com código próprio. */
    if (c.estado === 'bloqueada') return problem(403, 'account_blocked', 'Esta conta não pode fazer pedidos nesta loja.');
    if (body.pagamento === 'fiado' && !loja.fiadoAtivo) return problem(403, 'fiado_not_authorized', 'Esta conta não tem fiado autorizado pela loja.');
    const previo = idem.get(`${slug}|${body.idempotencyKey}`);
    if (previo) return json(200, { pedidoId: previo.id, referencia: previo.referencia, estado: previo.estado, total: previo.total });
    if (!loja.aceitaPedidos) return problem(409, 'orders_disabled', 'A loja não aceita pedidos.');
    const tabela = c.estado === 'ativa' ? c.tabela : 'varejo';
    const itens = [];
    for (const it of body.itens ?? []) {
      const p = PRODUTOS.find((x) => x.id === it.produtoId);
      if (!p || !p.disponivel) return problem(409, 'item_unavailable', `${p?.nome ?? 'Produto'} indisponível.`);
      const resto = Math.abs(it.quantidade / p.multiplo - Math.round(it.quantidade / p.multiplo));
      if (it.quantidade <= 0 || resto > 1e-6) return problem(400, 'invalid_multiple', 'Múltiplo inválido.');
      itens.push({ produtoId: p.id, nome: p.nome, quantidade: it.quantidade, unidade: p.unidade, precoUnitario: priceOf(p, tabela), tabela });
    }
    if (!itens.length) return problem(400, 'empty_order', 'Pedido vazio.');
    const subtotal = itens.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0);
    if (subtotal < loja.pedidoMinimo) return problem(409, 'min_order', 'Abaixo do mínimo.');
    if (body.entrega?.tipo === 'entrega' && !loja.entrega) return problem(409, 'delivery_unavailable');
    if (body.entrega?.tipo === 'retirada' && !loja.retirada) return problem(409, 'pickup_unavailable');
    const taxa = body.entrega?.tipo === 'entrega' ? loja.taxaEntrega : 0;
    const pedido = {
      id: randomUUID(),
      slug,
      contaId: body.contaId,
      referencia: `#${++seq}`,
      estado: 'recebido',
      criadoMs: now(),
      atualizadoMs: now(),
      itens,
      total: round2(subtotal + taxa),
      entrega: { ...body.entrega, taxa },
      pagamento: body.pagamento,
      observacao: body.observacao ?? '',
      idempotencyKey: body.idempotencyKey,
    };
    pedidos.set(pedido.id, pedido);
    idem.set(`${slug}|${body.idempotencyKey}`, pedido);
    return json(201, { pedidoId: pedido.id, referencia: pedido.referencia, estado: 'recebido', total: pedido.total });
  }

  function bench(method, path, body) {
    const estado = /^\/__mock\/pedidos\/([^/]+)\/estado$/.exec(path);
    if (method === 'POST' && estado) {
      const p = pedidos.get(estado[1]);
      if (!p) return problem(404, 'not_found');
      p.estado = body.estado;
      p.motivoRecusa = body.motivo ?? null;
      p.atualizadoMs = now();
      return json(200, { ok: true });
    }
    const agEstado = /^\/__mock\/agendamentos\/([^/]+)\/estado$/.exec(path);
    if (method === 'POST' && agEstado) {
      const a = agendamentos.get(agEstado[1]);
      if (!a) return problem(404, 'not_found');
      a.estado = body.estado;
      a.motivo = body.motivo ?? null;
      return json(200, { ok: true });
    }
    if (method === 'POST' && path === '/__mock/agenda/ocupacao') {
      ocupacao.push({ slug: body.slug, profissionalId: body.profissionalId, ini: Date.parse(body.inicio), fim: Date.parse(body.fim) });
      return json(200, { ok: true });
    }
    const decisao = /^\/__mock\/contas\/([^/]+)\/decisao$/.exec(path);
    if (method === 'POST' && decisao) {
      const c = [...contas.entries()].find(([k]) => k.endsWith(`|${decisao[1]}`));
      if (!c) return problem(404, 'not_found');
      c[1].estado = body.estado;
      c[1].tabela = body.tabela ?? c[1].tabela;
      return json(200, { ok: true });
    }
    return problem(404, 'not_found');
  }

  return { handle, calls, state: { lojas, contas, pedidos, agendamentos, ocupacao }, PRODUTOS };
}

/** `fetch` falso que responde com a API falsa (para os testes e para o servidor local sem rede). */
export function mockFetch(backend) {
  return async (url, options = {}) => {
    const u = new URL(String(url));
    const headers = Object.fromEntries(Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const result = backend.handle({
      method: options.method ?? 'GET',
      path: u.pathname,
      query: Object.fromEntries(u.searchParams),
      body: options.body ? JSON.parse(options.body) : {},
      headers,
    });
    if (result.binary) return new Response(result.binary, { status: result.status, headers: { 'content-type': result.contentType } });
    return new Response(JSON.stringify(result.json ?? {}), { status: result.status, headers: { 'content-type': 'application/json' } });
  };
}

/* ------------------------------------------------- servidor (uso manual) */
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.MOCK_PORTAL_PORT ?? 8799);
  const key = process.env.MOCK_PORTAL_KEY ?? MOCK_SERVICE_KEY;
  const backend = createMockBackend({ serviceKey: key });
  createServer((request, response) => {
    const chunks = [];
    request.on('data', (c) => chunks.push(c));
    request.on('end', () => {
      const url = new URL(request.url, `http://localhost:${port}`);
      let body = {};
      try {
        body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      } catch {
        body = {};
      }
      const result = backend.handle({
        method: request.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body,
        headers: request.headers,
      });
      if (result.binary) {
        response.writeHead(result.status, { 'Content-Type': result.contentType });
        response.end(result.binary);
        return;
      }
      response.writeHead(result.status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(result.json ?? {}));
    });
  }).listen(port, () => {
    console.log(`[mock-portal] API falsa em http://localhost:${port} (chave: ${key})`);
    console.log('[mock-portal] lojas: loja-demo, so-retirada, cor-ruim, loja-fechada, barbearia-demo, petshop-demo, loja-inativa');
  });
}
