/* =========================================================================
   Portal da loja, Parte 5 (agenda): BFF /api/portal/:slug/agenda*, cliente
   HTTP da API (B1 a B4) e e-mail do callback tipo 'agendamento' (B5).
   A API da loja é a FALSA de scripts/mock-portal-api.mjs, ligada por um
   `fetch` falso. O banco é o SQLite de verdade, em memória.
   ========================================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, request } from './helpers.js';
import { portalApiClient } from '../../server/services/portalApi.js';
import { createMockBackend, mockFetch, MOCK_SERVICE_KEY } from '../../scripts/mock-portal-api.mjs';
import { agendamentoMessage, formatBrasilia } from '../../server/services/portalMail.js';

const SERVICE_KEY = 'chave-de-servico-do-panel-0123456789abcdef';
const SENHA = 'SenhaForte123';
const BARBER = 'barbearia-demo';
const PET = 'petshop-demo';

function fakeMailer() {
  const sent = [];
  return { configured: true, sent, async send(message) { sent.push(message); } };
}

async function agendaApp({ leaky = false, mailer = fakeMailer() } = {}) {
  const backend = createMockBackend({ leaky });
  const portalApi = portalApiClient({
    fetchImpl: mockFetch(backend),
    licensing: { baseUrl: 'https://api.exemplo', serviceKey: MOCK_SERVICE_KEY, timeoutMs: 5000 },
    cacheMs: 0,
  });
  const t = await createTestApp({ serviceKey: SERVICE_KEY, portalApi, mailer, forgotMinMs: 0, portalOptions: { siteUrl: 'https://todai.exemplo' } });
  return { ...t, backend, mailer, portalApi };
}

function portal(app, method, slug, path, { body, token, headers, query } = {}) {
  return request(app, method, `/api/portal/${slug}${path}`, {
    body,
    query,
    headers: { 'x-portal-request': '1', ...(token ? { cookie: `oi_portal_${slug}=${encodeURIComponent(token)}` } : {}), ...headers },
  });
}

let counter = 0;
async function entrar(app, slug = BARBER) {
  const dados = { name: 'Joana Lima', email: `joana${++counter}@teste.com`, phone: '(12) 99999-1111', password: SENHA, acceptPrivacy: true };
  const cadastro = await portal(app, 'POST', slug, '/register', { body: dados });
  assert.equal(cadastro.status, 202, JSON.stringify(cadastro.body));
  const login = await portal(app, 'POST', slug, '/login', { body: { email: dados.email, password: dados.password } });
  assert.equal(login.status, 200);
  let token = null;
  for (const cookie of login.headers['Set-Cookie'] ?? []) {
    const m = new RegExp(`^oi_portal_${slug}=([^;]+)`).exec(cookie);
    if (m) token = decodeURIComponent(m[1]);
  }
  return { ...dados, token };
}

const contaIdDe = (backend, user) => [...backend.state.contas.values()].find((c) => c.email === user.email.toLowerCase()).contaId;

/** Um dia útil (não domingo) com folga de dias à frente, em Brasília. */
function diaUtil(extra = 3) {
  for (let i = extra; i < extra + 8; i++) {
    const d = new Date(Date.now() + i * 86400000);
    if (d.getUTCDay() !== 0) return d.toISOString().slice(0, 10);
  }
  throw new Error('sem dia útil');
}

async function primeiroSlot(app, user, { slug = BARBER, servicos = 's-corte', profissionalId = 'qualquer', porte, data = diaUtil() } = {}) {
  const r = await portal(app, 'GET', slug, '/agenda/horarios', { token: user.token, query: { servicos, profissionalId, data, ...(porte ? { porte } : {}) } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.slots.length > 0);
  return r.body.slots[0];
}

const key = () => `chave-${Math.random().toString(36).slice(2, 12)}`;
const reserva = (slot, extra = {}) => ({ servicos: ['s-corte'], profissionalId: slot.profissionalId, inicio: slot.inicio, observacao: 'Degradê', idempotencyKey: key(), ...extra });

/* ------------------------------------------------------------ vitrine e agenda */

test('vitrine diz temAgenda só nas lojas com agenda publicada; /agenda 404 nas outras', async () => {
  const { app, close } = await agendaApp();
  try {
    assert.equal((await portal(app, 'GET', BARBER, '/vitrine')).body.temAgenda, true);
    assert.equal((await portal(app, 'GET', 'loja-demo', '/vitrine')).body.temAgenda, false);
    const user = await entrar(app, 'loja-demo');
    const r = await portal(app, 'GET', 'loja-demo', '/agenda', { token: user.token });
    assert.equal(r.status, 404);
    assert.equal(r.body.error, 'AGENDA_INATIVA');
  } finally {
    close();
  }
});

test('/agenda exige sessão e entrega só a lista branca (sem campos extras da API)', async () => {
  const { app, close } = await agendaApp({ leaky: true });
  try {
    assert.equal((await portal(app, 'GET', BARBER, '/agenda')).status, 401);
    const user = await entrar(app);
    const r = await portal(app, 'GET', BARBER, '/agenda', { token: user.token });
    assert.equal(r.status, 200);
    const { agenda } = r.body;
    assert.equal(agenda.preset, 'Barbearia');
    assert.equal(agenda.rotulos.profissional, 'Barbeiro');
    assert.equal(agenda.servicos.length, 4, 'serviço desativado não aparece');
    assert.deepEqual(Object.keys(agenda.servicos[0]).sort(), ['categoria', 'duracao', 'exigePorte', 'id', 'nome', 'porte', 'preco']);
    assert.deepEqual(agenda.profissionais[0].servicos, ['s-corte', 's-barba', 's-combo', 's-sobrancelha']);
    assert.equal(agenda.regras.prazoCancelarMin, 120);
    const texto = JSON.stringify(r.body);
    assert.ok(!texto.includes('custoInterno') && !texto.includes('comissao') && !texto.includes('horarios'));
  } finally {
    close();
  }
});

test('serviços por porte chegam só com duração e preço de cada porte', async () => {
  const { app, close } = await agendaApp();
  try {
    const user = await entrar(app, PET);
    const { agenda } = (await portal(app, 'GET', PET, '/agenda', { token: user.token })).body;
    const banho = agenda.servicos.find((s) => s.id === 's-banho');
    assert.equal(banho.exigePorte, true);
    assert.deepEqual(banho.porte.G, { duracao: 90, preco: 80 });
    assert.equal(agenda.rotulos.profissional, 'Tosador');
  } finally {
    close();
  }
});

/* ----------------------------------------------------------------- horários */

test('horários: valida a entrada antes de chamar a API e repassa a consulta certa', async () => {
  const { app, close, backend } = await agendaApp();
  try {
    const user = await entrar(app);
    const antes = backend.calls.length;
    const ruins = [
      { servicos: '', data: diaUtil() },
      { servicos: 's-corte', data: '20/11/2026' },
      { servicos: 's-corte', data: diaUtil(), profissionalId: '../x' },
      { servicos: 's-corte', data: diaUtil(), porte: 'XG' },
      { servicos: Array.from({ length: 11 }, (_, i) => `s${i}`).join(','), data: diaUtil() },
      { servicos: 's-corte;drop', data: diaUtil() },
    ];
    for (const query of ruins) {
      const r = await portal(app, 'GET', BARBER, '/agenda/horarios', { token: user.token, query });
      assert.equal(r.status, 400, JSON.stringify(query));
    }
    assert.equal(backend.calls.length, antes, 'entrada inválida não chega na API');

    const ok = await portal(app, 'GET', BARBER, '/agenda/horarios', { token: user.token, query: { servicos: 's-corte,s-barba', data: diaUtil(), profissionalId: 'pr-rafa', extra: 'x' } });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.slots.length > 0);
    assert.deepEqual(Object.keys(ok.body.slots[0]).sort(), ['duracaoMin', 'fim', 'inicio', 'profissionalId', 'profissionalNome', 'total']);
    const chamada = backend.calls.at(-1);
    assert.equal(chamada.query.servicos, 's-corte,s-barba');
    assert.equal(chamada.query.profissionalId, 'pr-rafa');
    assert.equal(chamada.query.extra, undefined);

    const domingo = new Date(Date.now() + 86400000);
    while (domingo.getUTCDay() !== 0) domingo.setUTCDate(domingo.getUTCDate() + 1);
    const vazio = await portal(app, 'GET', BARBER, '/agenda/horarios', { token: user.token, query: { servicos: 's-corte', data: domingo.toISOString().slice(0, 10) } });
    assert.deepEqual(vazio.body.slots, []);
    assert.equal(vazio.body.motivoVazio, 'sem_expediente');
  } finally {
    close();
  }
});

test('horários: pet exige porte e a duração muda com ele', async () => {
  const { app, close } = await agendaApp();
  try {
    const user = await entrar(app, PET);
    const semPorte = await portal(app, 'GET', PET, '/agenda/horarios', { token: user.token, query: { servicos: 's-banho', data: diaUtil() } });
    assert.equal(semPorte.status, 400);
    const p = await primeiroSlot(app, user, { slug: PET, servicos: 's-banho', porte: 'P' });
    const g = await primeiroSlot(app, user, { slug: PET, servicos: 's-banho', porte: 'G' });
    assert.equal((Date.parse(p.fim) - Date.parse(p.inicio)) / 60000, 40);
    assert.equal((Date.parse(g.fim) - Date.parse(g.inicio)) / 60000, 90);
  } finally {
    close();
  }
});

/* ---------------------------------------------------------- criar agendamento */

test('criar: contaId vem da sessão, lista branca de campos, idempotência e total da API', async () => {
  const { app, close, backend } = await agendaApp();
  try {
    const a = await entrar(app);
    const slot = await primeiroSlot(app, a);
    const corpo = reserva(slot, { contaId: 'de-outra-pessoa', total: 0.01, estado: 'confirmado', preco: 1, servicos: ['s-corte', 's-corte'] });
    const r1 = await portal(app, 'POST', BARBER, '/agendamentos', { token: a.token, body: corpo });
    assert.equal(r1.status, 201, JSON.stringify(r1.body));
    assert.equal(r1.body.agendamento.estado, 'solicitado');
    assert.equal(r1.body.agendamento.total, 45);
    assert.match(r1.body.agendamento.referencia, /^AG-W\d{4}$/);

    const enviado = backend.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/agendamentos')).at(-1).body;
    assert.equal(enviado.contaId, contaIdDe(backend, a));
    assert.deepEqual(Object.keys(enviado).sort(), ['contaId', 'idempotencyKey', 'inicio', 'observacao', 'profissionalId', 'servicos']);
    assert.deepEqual(enviado.servicos, ['s-corte'], 'serviço repetido vira um só');

    const r2 = await portal(app, 'POST', BARBER, '/agendamentos', { token: a.token, body: corpo });
    assert.equal(r2.body.agendamento.id, r1.body.agendamento.id, 'mesma chave, mesmo agendamento');
    assert.equal(backend.state.agendamentos.size, 1);
  } finally {
    close();
  }
});

test('criar: validação de entrada (nada inválido chega na API)', async () => {
  const { app, close, backend } = await agendaApp();
  try {
    const user = await entrar(app, PET);
    const slot = await primeiroSlot(app, user, { slug: PET, servicos: 's-unha' });
    const base = { servicos: ['s-unha'], profissionalId: slot.profissionalId, inicio: slot.inicio, pet: { nome: 'Thor', especie: 'Cão', raca: 'SRD', porte: 'M' }, idempotencyKey: key() };
    const antes = backend.calls.length;
    const casos = [
      { ...base, servicos: [] },
      { ...base, servicos: 'banho' },
      { ...base, servicos: ['a b'] },
      { ...base, servicos: Array.from({ length: 11 }, (_, i) => `s${i}`) },
      { ...base, inicio: 'amanhã cedo' },
      { ...base, inicio: undefined },
      { ...base, profissionalId: { $ne: 1 } },
      { ...base, pet: { ...base.pet, nome: '' } },
      { ...base, pet: { ...base.pet, porte: 'GG' } },
      { ...base, pet: { ...base.pet, especie: '' } },
      { ...base, pet: 'Thor' },
      { ...base, porte: 'P' },
      { ...base, observacao: 'x'.repeat(501) },
      { ...base, idempotencyKey: 'curta' },
      { ...base, idempotencyKey: undefined },
    ];
    for (const [i, body] of casos.entries()) {
      const r = await portal(app, 'POST', PET, '/agendamentos', { token: user.token, body });
      assert.equal(r.status, 400, `caso ${i}: ${JSON.stringify(r.body)}`);
    }
    assert.equal(backend.calls.length, antes);
    const sem = await portal(app, 'POST', PET, '/agendamentos', { token: user.token, body: base, headers: { 'x-portal-request': '' } });
    assert.equal(sem.status, 403, 'escrita exige o cabeçalho do portal');
    const ok = await portal(app, 'POST', PET, '/agendamentos', { token: user.token, body: base });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const guardado = [...backend.state.agendamentos.values()][0];
    assert.equal(guardado.pet.nome, 'Thor');
    assert.equal(guardado.pet.porte, 'M');
  } finally {
    close();
  }
});

test('criar: horário ocupado dá 409 SLOT_TAKEN e o segundo cliente não leva o mesmo horário', async () => {
  const { app, close, backend } = await agendaApp();
  try {
    const a = await entrar(app);
    const b = await entrar(app);
    const slot = await primeiroSlot(app, a, { profissionalId: 'pr-rafa' });
    const r1 = await portal(app, 'POST', BARBER, '/agendamentos', { token: a.token, body: reserva(slot) });
    assert.equal(r1.status, 201);
    const r2 = await portal(app, 'POST', BARBER, '/agendamentos', { token: b.token, body: reserva(slot) });
    assert.equal(r2.status, 409);
    assert.equal(r2.body.error, 'SLOT_TAKEN');
    assert.match(r2.body.message, /ocupado/);
    assert.equal(backend.state.agendamentos.size, 1);
    const depois = await portal(app, 'GET', BARBER, '/agenda/horarios', { token: b.token, query: { servicos: 's-corte', profissionalId: 'pr-rafa', data: slot.inicio.slice(0, 10) } });
    assert.ok(!depois.body.slots.some((s) => s.inicio === slot.inicio), 'horário sai da lista');
  } finally {
    close();
  }
});

test('criar: antecedência mínima e máxima viram 409 com texto próprio', async () => {
  const { app, close } = await agendaApp();
  try {
    const user = await entrar(app);
    const brt = (ms) => `${new Date(ms - 3 * 3600000).toISOString().slice(0, 19)}-03:00`;
    const cedo = await portal(app, 'POST', BARBER, '/agendamentos', { token: user.token, body: reserva({ profissionalId: 'pr-rafa', inicio: brt(Date.now() + 5 * 60000) }) });
    assert.equal(cedo.status, 409);
    assert.equal(cedo.body.error, 'TOO_SOON');
    const longe = await portal(app, 'POST', BARBER, '/agendamentos', { token: user.token, body: reserva({ profissionalId: 'pr-rafa', inicio: brt(Date.now() + 90 * 86400000) }) });
    assert.equal(longe.status, 409);
    assert.equal(longe.body.error, 'TOO_FAR');
  } finally {
    close();
  }
});

/* ----------------------------------------------- isolamento por conta e por loja */

test('lista e detalhe: só os agendamentos da própria conta; ids de outra conta/loja dão 404', async () => {
  const { app, close } = await agendaApp();
  try {
    const a = await entrar(app);
    const b = await entrar(app);
    const slot = await primeiroSlot(app, a);
    const criado = (await portal(app, 'POST', BARBER, '/agendamentos', { token: a.token, body: reserva(slot) })).body.agendamento;

    const listaA = await portal(app, 'GET', BARBER, '/agendamentos', { token: a.token });
    assert.equal(listaA.body.agendamentos.length, 1);
    assert.equal((await portal(app, 'GET', BARBER, '/agendamentos', { token: b.token })).body.agendamentos.length, 0);

    const detalhe = await portal(app, 'GET', BARBER, `/agendamentos/${criado.id}`, { token: a.token, query: { contaId: 'tentativa-outra-conta' } });
    assert.equal(detalhe.status, 200);
    assert.equal(detalhe.body.agendamento.profissionalNome, slot.profissionalNome);
    assert.equal(detalhe.body.agendamento.servicos[0].nome, 'Corte masculino');

    assert.equal((await portal(app, 'GET', BARBER, `/agendamentos/${criado.id}`, { token: b.token })).status, 404);
    assert.equal((await portal(app, 'POST', BARBER, `/agendamentos/${criado.id}/cancelar`, { token: b.token })).status, 404);
    assert.equal((await portal(app, 'POST', BARBER, `/agendamentos/${criado.id}/remarcar`, { token: b.token, body: { novoInicio: slot.inicio } })).status, 404);

    /* Cookie de uma loja não vale na outra, mesmo com o id certo. */
    assert.equal((await portal(app, 'GET', PET, `/agendamentos/${criado.id}`, { token: a.token })).status, 401);
    const doPet = await entrar(app, PET);
    assert.equal((await portal(app, 'GET', PET, `/agendamentos/${criado.id}`, { token: doPet.token })).status, 404);
    assert.equal((await portal(app, 'GET', PET, '/agendamentos', { token: doPet.token })).body.agendamentos.length, 0);
    for (const id of ['../x', 'a b', 'x'.repeat(80)]) {
      assert.equal((await portal(app, 'GET', BARBER, `/agendamentos/${encodeURIComponent(id)}`, { token: a.token })).status, 404);
    }
  } finally {
    close();
  }
});

/* ------------------------------------------------------- cancelar e remarcar */

test('cancelar: dentro do prazo cancela; depois do prazo a API recusa com texto próprio', async () => {
  const { app, close, backend } = await agendaApp();
  try {
    const a = await entrar(app);
    const slot = await primeiroSlot(app, a);
    const id = (await portal(app, 'POST', BARBER, '/agendamentos', { token: a.token, body: reserva(slot) })).body.agendamento.id;
    const cancelado = await portal(app, 'POST', BARBER, `/agendamentos/${id}/cancelar`, { token: a.token });
    assert.equal(cancelado.status, 200);
    assert.equal(cancelado.body.estado, 'cancelado_cliente');
    assert.equal((await portal(app, 'POST', BARBER, `/agendamentos/${id}/cancelar`, { token: a.token })).status, 409);
    assert.equal((await portal(app, 'POST', BARBER, `/agendamentos/${id}/cancelar`, { token: a.token, headers: { 'x-portal-request': '' } })).status, 403);

    const slot2 = await primeiroSlot(app, a);
    assert.equal(slot2.inicio, slot.inicio, 'horário cancelado volta a ficar livre');
    const id2 = (await portal(app, 'POST', BARBER, '/agendamentos', { token: a.token, body: reserva(slot2) })).body.agendamento.id;
    backend.state.agendamentos.get(id2).inicioMs = Date.now() + 30 * 60000;
    const tarde = await portal(app, 'POST', BARBER, `/agendamentos/${id2}/cancelar`, { token: a.token });
    assert.equal(tarde.status, 409);
    assert.equal(tarde.body.error, 'CANCEL_WINDOW_CLOSED');
    assert.match(tarde.body.message, /prazo/i);
  } finally {
    close();
  }
});

test('remarcar: volta a solicitado, libera o horário antigo e valida o novo', async () => {
  const { app, close } = await agendaApp();
  try {
    const a = await entrar(app);
    const b = await entrar(app);
    const dia = diaUtil();
    const r = await portal(app, 'GET', BARBER, '/agenda/horarios', { token: a.token, query: { servicos: 's-corte', profissionalId: 'pr-rafa', data: dia } });
    const s1 = r.body.slots[0];
    const s2 = r.body.slots[4];
    const s3 = r.body.slots[6];
    const id = (await portal(app, 'POST', BARBER, '/agendamentos', { token: a.token, body: reserva(s1) })).body.agendamento.id;
    await portal(app, 'POST', BARBER, '/agendamentos', { token: b.token, body: reserva(s3) });

    const ruim = await portal(app, 'POST', BARBER, `/agendamentos/${id}/remarcar`, { token: a.token, body: { novoInicio: 'quando der' } });
    assert.equal(ruim.status, 400);
    const ocupado = await portal(app, 'POST', BARBER, `/agendamentos/${id}/remarcar`, { token: a.token, body: { novoInicio: s3.inicio, profissionalId: 'pr-rafa' } });
    assert.equal(ocupado.status, 409);
    assert.equal(ocupado.body.error, 'SLOT_TAKEN');

    const ok = await portal(app, 'POST', BARBER, `/agendamentos/${id}/remarcar`, { token: a.token, body: { novoInicio: s2.inicio, profissionalId: 'pr-rafa', estado: 'confirmado' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.estado, 'solicitado');
    const detalhe = (await portal(app, 'GET', BARBER, `/agendamentos/${id}`, { token: a.token })).body.agendamento;
    assert.equal(Date.parse(detalhe.inicio), Date.parse(s2.inicio));
    assert.equal(detalhe.estado, 'solicitado');
    const livres = (await portal(app, 'GET', BARBER, '/agenda/horarios', { token: b.token, query: { servicos: 's-corte', profissionalId: 'pr-rafa', data: dia } })).body.slots;
    assert.ok(livres.some((s) => s.inicio === s1.inicio), 'horário antigo liberado');
    assert.ok(!livres.some((s) => s.inicio === s2.inicio));
  } finally {
    close();
  }
});

/* --------------------------------------------------------- cliente HTTP (fetch falso) */

test('cliente HTTP: URL, método, chave de serviço, contaId e corpo certos em B1 a B4', async () => {
  const chamadas = [];
  const respostas = [
    { servicos: [{ id: 's1', nome: 'Corte', preco: 10, duracao: 30, ativo: true, custo: 3 }], profissionais: [{ id: 'p1', nome: 'Ana', servicos: [{ id: 's1', preco: 1 }], horarios: { seg: [] } }], regras: {} },
    { slots: [{ inicio: '2026-11-20T09:00:00-03:00', fim: '2026-11-20T09:30:00-03:00', profissionalId: 'p1', profissionalNome: 'Ana', interno: 1 }, { inicio: null }] },
    { id: 'ag1', referencia: 'AG-W0001', estado: 'solicitado', inicio: '2026-11-20T09:00:00-03:00', total: 10 },
    { agendamentos: [{ id: 'ag1', estado: 'confirmado', servicos: [], pet: { nome: 'Rex', porte: 'Z', dono: 'x' }, segredo: 1 }] },
    { id: 'ag1', estado: 'solicitado' },
    { estado: 'cancelado_cliente' },
    { estado: 'solicitado', inicio: '2026-11-21T09:00:00-03:00' },
  ];
  const api = portalApiClient({
    fetchImpl: async (url, opts) => {
      chamadas.push({ url: new URL(url), ...opts });
      return new Response(JSON.stringify(respostas[chamadas.length - 1]), { status: 200, headers: { 'content-type': 'application/json' } });
    },
    licensing: { baseUrl: 'https://api.exemplo', serviceKey: 'chave-secreta-0123456789', timeoutMs: 5000 },
    cacheMs: 0,
  });
  const agenda = await api.agenda('loja-x');
  assert.deepEqual(Object.keys(agenda.servicos[0]).sort(), ['categoria', 'duracao', 'exigePorte', 'id', 'nome', 'porte', 'preco']);
  assert.deepEqual(agenda.profissionais[0], { id: 'p1', nome: 'Ana', cor: null, servicos: ['s1'] });
  const h = await api.horarios('loja-x', { servicos: ['s1', 's2'], profissionalId: null, data: '2026-11-20', porte: 'P' });
  assert.equal(h.slots.length, 1);
  assert.equal(h.slots[0].interno, undefined);
  const novo = await api.criarAgendamento('loja-x', { contaId: 'c1', servicos: ['s1'] });
  assert.equal(novo.referencia, 'AG-W0001');
  const lista = await api.agendamentos('loja-x', 'c1');
  assert.equal(lista[0].segredo, undefined);
  assert.equal(lista[0].pet.porte, null);
  assert.equal(lista[0].pet.dono, undefined);
  await api.agendamento('loja-x', 'ag1', 'c1');
  await api.cancelarAgendamento('loja-x', 'ag1', 'c1');
  await api.remarcarAgendamento('loja-x', 'ag1', 'c1', { novoInicio: '2026-11-21T09:00:00-03:00' });

  assert.equal(chamadas[0].url.pathname, '/api/v1/site/portal/loja-x/agenda');
  assert.equal(chamadas[1].url.pathname, '/api/v1/site/portal/loja-x/agenda/horarios');
  assert.equal(chamadas[1].url.searchParams.get('servicos'), 's1,s2');
  assert.equal(chamadas[1].url.searchParams.get('profissionalId'), 'qualquer');
  assert.equal(chamadas[1].url.searchParams.get('porte'), 'P');
  assert.equal(chamadas[2].method, 'POST');
  assert.equal(chamadas[2].url.pathname, '/api/v1/site/portal/loja-x/agendamentos');
  assert.deepEqual(JSON.parse(chamadas[2].body), { contaId: 'c1', servicos: ['s1'] });
  assert.equal(chamadas[3].url.searchParams.get('contaId'), 'c1');
  assert.equal(chamadas[4].url.pathname, '/api/v1/site/portal/loja-x/agendamentos/ag1');
  assert.equal(chamadas[4].url.searchParams.get('contaId'), 'c1');
  assert.equal(chamadas[5].url.pathname, '/api/v1/site/portal/loja-x/agendamentos/ag1/cancelar');
  assert.equal(chamadas[5].url.searchParams.get('contaId'), 'c1');
  assert.equal(chamadas[6].url.pathname, '/api/v1/site/portal/loja-x/agendamentos/ag1/remarcar');
  assert.equal(chamadas[6].method, 'POST');
  for (const c of chamadas) assert.equal(c.headers['X-Service-Key'], 'chave-secreta-0123456789');
});

test('cliente HTTP: segmentos são escapados e erros viram texto genérico ou recusa de negócio', async () => {
  const com = (status, body) =>
    portalApiClient({
      fetchImpl: async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
      licensing: { baseUrl: 'https://api.exemplo', serviceKey: 'k'.repeat(20), timeoutMs: 5000 },
      cacheMs: 0,
    });
  await assert.rejects(com(404, { code: 'portal_agenda_inactive' }).agenda('l'), (e) => e.code === 'AGENDA_INATIVA' && e.status === 404);
  await assert.rejects(com(404, { code: 'portal_inactive' }).agenda('l'), (e) => e.code === 'PORTAL_INATIVO');
  await assert.rejects(com(409, { code: 'slot_taken', detail: 'texto interno <script>' }).criarAgendamento('l', {}), (e) => e.status === 409 && e.code === 'SLOT_TAKEN' && /ocupado/.test(e.message) && !/script/.test(e.message));
  await assert.rejects(com(500, { detail: 'stack secreto' }).agendamentos('l', 'c'), (e) => e.status === 503 && !/secreto/.test(e.message));
  await assert.rejects(com(500, {}).horarios('l', { servicos: ['a'], data: '2026-11-20' }), (e) => e.status === 503);
  await assert.rejects(com(400, { code: 'porte_required' }).horarios('l', { servicos: ['a'], data: '2026-11-20' }), (e) => e.status === 400 && /porte/.test(e.message));
  const urls = [];
  const api = portalApiClient({
    fetchImpl: async (url) => {
      urls.push(String(url));
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    },
    licensing: { baseUrl: 'https://api.exemplo', serviceKey: 'k'.repeat(20), timeoutMs: 5000 },
    cacheMs: 0,
  });
  await api.agendamento('l', 'a/../b', 'c/1');
  assert.ok(urls[0].includes('a%2F..%2Fb') && urls[0].includes('contaId=c%2F1'));
  const semConfig = portalApiClient({ licensing: { baseUrl: '', serviceKey: '' } });
  await assert.rejects(semConfig.agenda('l'), (e) => e.status === 503);
});

/* ------------------------------------------------- callback e e-mail (B5) */

const evento = (app, body, { key = SERVICE_KEY } = {}) =>
  request(app, 'POST', '/api/service/portal/eventos', { body, headers: key ? { 'x-service-key': key } : {} });

async function comAgendamento() {
  const t = await agendaApp();
  const user = await entrar(t.app);
  const slot = await primeiroSlot(t.app, user, { profissionalId: 'pr-rafa' });
  const ag = (await portal(t.app, 'POST', BARBER, '/agendamentos', { token: user.token, body: reserva(slot) })).body.agendamento;
  return { ...t, user, slot, ag, contaId: contaIdDe(t.backend, user) };
}

test('evento agendamento: e-mail ao cliente com loja, serviço, profissional e hora de Brasília', async () => {
  const t = await comAgendamento();
  try {
    assert.equal((await evento(t.app, {}, { key: null })).status, 401);
    const r = await evento(t.app, { slug: BARBER, agendamentoId: t.ag.id, contaId: t.contaId, tipo: 'agendamento', estado: 'solicitado', inicio: '2026-11-20T09:30:00-03:00' });
    assert.equal(r.status, 202, JSON.stringify(r.body));
    assert.equal(r.body.sent, true);
    const m = t.mailer.sent.at(-1);
    assert.equal(m.to, t.user.email.toLowerCase());
    assert.match(m.fromName, /Barbearia Navalha/);
    assert.match(m.subject, /recebemos o seu pedido de agendamento/);
    assert.match(m.subject, /AG-W0001/);
    assert.match(m.text, /sexta-feira, 20\/11\/2026 às 09:30 \(horário de Brasília\)/);
    assert.match(m.text, /Corte masculino/);
    assert.match(m.text, /Profissional: Rafa/);
    assert.match(m.text, /https:\/\/todai\.exemplo\/l\/barbearia-demo\/agendamentos\//);
    assert.match(m.html, /Barbearia Navalha/);
  } finally {
    t.close();
  }
});

test('evento agendamento: cada estado relevante manda e-mail; concluído e falta não; repetido não duplica', async () => {
  const t = await comAgendamento();
  try {
    const base = { slug: BARBER, agendamentoId: t.ag.id, contaId: t.contaId, tipo: 'agendamento', inicio: '2026-11-20T14:00:00-03:00' };
    const esperado = {
      confirmado: /foi confirmado/,
      recusado: /não pôde confirmar/,
      cancelado_loja: /cancelou o seu agendamento/,
      cancelado_cliente: /foi cancelado/,
      remarcado: /foi remarcado/,
    };
    for (const [estado, re] of Object.entries(esperado)) {
      const r = await evento(t.app, { ...base, estado, motivo: 'Imprevisto na loja' });
      assert.equal(r.body.sent, true, estado);
      assert.match(t.mailer.sent.at(-1).subject, re, estado);
    }
    const enviados = t.mailer.sent.length;
    for (const estado of ['concluido', 'nao_compareceu']) {
      const r = await evento(t.app, { ...base, estado });
      assert.equal(r.body.sent, false);
      assert.equal(r.body.reason, 'sem_aviso');
    }
    const repetido = await evento(t.app, { ...base, estado: 'confirmado' });
    assert.equal(repetido.body.reason, 'repetido');
    const outroHorario = await evento(t.app, { ...base, estado: 'remarcado', inicio: '2026-11-21T10:00:00-03:00' });
    assert.equal(outroHorario.body.sent, true, 'remarcar para outro horário avisa de novo');
    assert.equal(t.mailer.sent.length, enviados + 1);
    const recusa = t.mailer.sent.find((m) => /não pôde confirmar/.test(m.subject));
    assert.match(recusa.text, /Motivo informado pela loja: Imprevisto na loja/);
    assert.match(recusa.text, /escolha outro horário/);
  } finally {
    t.close();
  }
});

test('evento agendamento: HTML escapa loja e motivo; entrada inválida é 400; conta alheia não recebe', async () => {
  const t = await comAgendamento();
  try {
    t.backend.state.lojas[BARBER].nomePublico = '<img src=x onerror=alert(1)> Barbearia';
    const r = await evento(t.app, { slug: BARBER, agendamentoId: t.ag.id, contaId: t.contaId, tipo: 'agendamento', estado: 'recusado', motivo: '<script>alert(2)</script>', inicio: '2026-11-20T09:00:00-03:00' });
    assert.equal(r.body.sent, true);
    const html = t.mailer.sent.at(-1).html;
    assert.ok(!/<img|<script/i.test(html), html);
    assert.match(html, /&lt;script&gt;/);

    const base = { slug: BARBER, agendamentoId: t.ag.id, contaId: t.contaId, tipo: 'agendamento', estado: 'confirmado' };
    for (const ruim of [
      { ...base, estado: 'pronto' },
      { ...base, agendamentoId: '../x' },
      { ...base, agendamentoId: undefined },
      { ...base, inicio: 'amanhã' },
      { ...base, contaId: 'curto' },
      { ...base, slug: 'LOJA' },
    ]) {
      assert.equal((await evento(t.app, ruim)).status, 400, JSON.stringify(ruim));
    }
    const desconhecida = await evento(t.app, { ...base, contaId: 'conta-que-nao-existe-1' });
    assert.equal(desconhecida.body.reason, 'conta_desconhecida');
    const outraLoja = await evento(t.app, { ...base, slug: PET });
    assert.equal(outraLoja.body.reason, 'conta_desconhecida', 'a conta é por loja');
  } finally {
    t.close();
  }
});

test('evento agendamento: provedor de e-mail fora dá 503 para a API tentar de novo', async () => {
  const mailer = { configured: true, sent: [], async send() { throw new Error('fora'); } };
  const t = await agendaApp({ mailer });
  try {
    const user = await entrar(t.app);
    const slot = await primeiroSlot(t.app, user);
    const ag = (await portal(t.app, 'POST', BARBER, '/agendamentos', { token: user.token, body: reserva(slot) })).body.agendamento;
    const r = await evento(t.app, { slug: BARBER, agendamentoId: ag.id, contaId: contaIdDe(t.backend, user), tipo: 'agendamento', estado: 'confirmado' });
    assert.equal(r.status, 503);
  } finally {
    t.close();
  }
});

test('formatBrasilia e agendamentoMessage: com e sem fuso, sempre em Brasília', () => {
  assert.equal(formatBrasilia('2026-11-20T09:30:00-03:00'), 'sexta-feira, 20/11/2026 às 09:30');
  assert.equal(formatBrasilia('2026-11-20T12:30:00Z'), 'sexta-feira, 20/11/2026 às 09:30');
  assert.equal(formatBrasilia('2026-11-20T09:30'), 'sexta-feira, 20/11/2026 às 09:30');
  assert.equal(formatBrasilia('2026-11-20T01:00:00Z'), 'quinta-feira, 19/11/2026 às 22:00');
  assert.equal(formatBrasilia('lixo'), null);
  assert.equal(formatBrasilia(null), null);
  const m = agendamentoMessage({ store: 'Loja & Cia', name: 'Ana Maria', estado: 'solicitado', agendamento: null, inicio: null, url: 'https://x.exemplo/l/a' });
  assert.match(m.html, /Loja &amp; Cia/);
  assert.match(m.text, /Olá, Ana\./);
  assert.ok(!/Horário:/.test(m.text), 'sem horário, a linha some');
});

test('B1 no formato REAL da API (duracaoMin, portes[], passoMin, antecedenciaMinHoras, servicoId, confirmacaoAutomatica) vira o que a tela usa', async () => {
  const real = {
    temAgenda: true,
    preset: 'petshop',
    rotulos: { profissional: 'Tosador/Banhista', profissionais: 'Tosadores/Banhistas', servico: 'Serviço', atendimento: 'Banho e tosa', cliente: 'Tutor' },
    exigePet: true,
    servicos: [
      { id: 1, nome: 'Corte', categoria: 'Tosa', descricao: null, duracaoMin: 30, preco: 40, exigePorte: false, cor: null, portes: [], profissionalIds: [10] },
      {
        id: 2, nome: 'Banho', categoria: 'Banho', descricao: null, duracaoMin: 60, preco: 60, exigePorte: true, cor: null,
        portes: [{ porte: 'G', duracaoMin: null, preco: 95 }, { porte: 'P', duracaoMin: 45, preco: null }], profissionalIds: [10, 11],
      },
    ],
    profissionais: [{ id: 10, nome: 'Bruno', cor: '#2F6F4F', servicos: [{ servicoId: 1, duracaoMin: null, preco: null }, { servicoId: 2, duracaoMin: 70, preco: 70 }] }],
    regras: { passoMin: 15, antecedenciaMinHoras: 2, antecedenciaMaxDias: 60, cancelamentoMinHoras: 24, prazoCancelarMin: 1440, confirmacaoAutomatica: true },
    atualizadoEm: '2026-11-18T10:00:00+00:00',
  };
  const api = portalApiClient({
    fetchImpl: async () => new Response(JSON.stringify(real), { status: 200, headers: { 'content-type': 'application/json' } }),
    licensing: { baseUrl: 'https://api.exemplo', serviceKey: 'chave-secreta-0123456789', timeoutMs: 5000 },
    cacheMs: 0,
  });
  const agenda = await api.agenda('loja-x');
  assert.equal(agenda.servicos[0].duracao, 30);
  assert.deepEqual(agenda.servicos[1].porte, { P: { duracao: 45, preco: 60 }, M: { duracao: 60, preco: 60 }, G: { duracao: 60, preco: 95 } });
  assert.deepEqual(agenda.profissionais[0].servicos, ['1', '2']);
  assert.deepEqual(agenda.regras, { slotMin: 15, antecedenciaMinMin: 120, antecedenciaMaxDias: 60, prazoCancelarMin: 1440, confirmacaoAuto: true });
});
