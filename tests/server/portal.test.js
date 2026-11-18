/* =========================================================================
   Portal de pedidos da loja (/l/:slug): BFF, contas isoladas por loja, sessão,
   limites, callback de eventos e cliente HTTP da API.

   A API da loja é a FALSA de scripts/mock-portal-api.mjs (mesmo formato do
   contrato), ligada por um `fetch` falso: nada de rede. O banco é o SQLite de
   verdade, em memória.
   ========================================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTestApp, createClient, request } from './helpers.js';
import { portalApiClient } from '../../server/services/portalApi.js';
import { createMockBackend, mockFetch, MOCK_SERVICE_KEY } from '../../scripts/mock-portal-api.mjs';
import { createMailer, composeFrom } from '../../server/services/mailer.js';
import { bodyLimitFor } from '../../server/app.js';
import { seoFor } from '../../shared/seo.js';
import { statusDaSpa } from '../../server/http/static.js';

const SERVICE_KEY = 'chave-de-servico-do-panel-0123456789abcdef';
const SENHA = 'SenhaForte123';
const raiz = join(import.meta.dirname, '..', '..');

function fakeMailer({ failing = false } = {}) {
  const sent = [];
  return {
    configured: true,
    sent,
    async send(message) {
      if (failing) throw new Error('provedor fora');
      sent.push(message);
    },
  };
}

async function portalApp({ leaky = false, mailer = fakeMailer(), limits, ...options } = {}) {
  const backend = createMockBackend({ leaky });
  const portalApi = portalApiClient({
    fetchImpl: mockFetch(backend),
    licensing: { baseUrl: 'https://api.exemplo', serviceKey: MOCK_SERVICE_KEY, timeoutMs: 5000 },
    cacheMs: 0,
  });
  const t = await createTestApp({
    serviceKey: SERVICE_KEY,
    portalApi,
    mailer,
    forgotMinMs: 0,
    portalOptions: { limits, siteUrl: 'https://todai.exemplo' },
    ...options,
  });
  return { ...t, backend, mailer, portalApi };
}

/** Chamada ao BFF como o navegador faz: cabeçalho de escrita e cookie da loja. */
function portal(app, method, slug, path, { body, token, headers, query, ip } = {}) {
  return request(app, method, `/api/portal/${slug}${path}`, {
    body,
    query,
    headers: {
      'x-portal-request': '1',
      ...(token ? { cookie: `oi_portal_${slug}=${encodeURIComponent(token)}` } : {}),
      ...(ip ? { 'x-forwarded-for': ip } : {}),
      ...headers,
    },
  });
}

function tokenOf(response, slug) {
  for (const cookie of response.headers['Set-Cookie'] ?? []) {
    const match = new RegExp(`^oi_portal_${slug}=([^;]+)`).exec(cookie);
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

let counter = 0;
const novoCadastro = (extra = {}) => ({
  name: 'Maria Souza',
  email: `maria${++counter}@teste.com`,
  phone: '(12) 99999-1111',
  password: SENHA,
  acceptPrivacy: true,
  ...extra,
});

/** Cadastra e entra; devolve o token da sessão. */
async function entrar(app, slug = 'loja-demo', extra = {}, ip) {
  const dados = novoCadastro(extra);
  const cadastro = await portal(app, 'POST', slug, '/register', { body: dados, ip });
  assert.equal(cadastro.status, 202, JSON.stringify(cadastro.body));
  const login = await portal(app, 'POST', slug, '/login', { body: { email: dados.email, password: dados.password }, ip });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { ...dados, token: tokenOf(login, slug) };
}

const hoje = (dias = 1) => new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
const pedidoBase = (extra = {}) => ({
  itens: [{ produtoId: 'p-arroz', quantidade: 2 }],
  entrega: { tipo: 'retirada', data: hoje(), faixa: 'Manhã' },
  pagamento: 'na_retirada',
  observacao: 'Sem pressa',
  idempotencyKey: `chave-${Math.random().toString(36).slice(2, 12)}`,
  ...extra,
});

/* ------------------------------------------------------------- vitrine */

test('vitrine repassa abertoAgora e proximaAbertura (lista branca) e descarta o que não for do formato', async () => {
  const { app, close, backend } = await portalApp();
  try {
    const aberta = await portal(app, 'GET', 'loja-demo', '/vitrine');
    assert.equal(aberta.body.abertoAgora, true);
    assert.equal(aberta.body.proximaAbertura, null);
    assert.equal(aberta.body.prazoCancelarMin, 10);
    const fechada = await portal(app, 'GET', 'loja-fechada', '/vitrine');
    assert.equal(fechada.body.abertoAgora, false);
    assert.match(fechada.body.proximaAbertura, /^\d{4}-\d{2}-\d{2}T08:00$/);
    assert.equal(fechada.body.prazoCancelarMin, 0);
    assert.equal(fechada.body.emailContato, undefined);
  } finally {
    close();
  }
  const api = portalApiClient({
    fetchImpl: async () => new Response(JSON.stringify({ nomePublico: 'X', abertoAgora: 'sim', proximaAbertura: '<script>', extra: 1 }), { status: 200, headers: { 'content-type': 'application/json' } }),
    licensing: { baseUrl: 'https://api.exemplo', serviceKey: MOCK_SERVICE_KEY, timeoutMs: 5000 },
    cacheMs: 0,
  });
  const v = await api.vitrine('loja-x');
  assert.equal(v.abertoAgora, null);
  assert.equal(v.proximaAbertura, null);
  assert.equal(v.extra, undefined);
});

test('vitrine é pública, não traz preço nem catálogo e aponta o logo para o próprio site', async () => {
  const { app, close } = await portalApp({ leaky: true });
  try {
    const r = await portal(app, 'GET', 'loja-demo', '/vitrine');
    assert.equal(r.status, 200);
    assert.equal(r.body.nomePublico, 'Mercadinho Boa Praça');
    assert.equal(r.body.logoUrl, '/api/portal/loja-demo/logo');
    assert.equal(r.body.fiadoAtivo, true);
    assert.equal(r.body.emailContato, undefined);
    assert.ok(!JSON.stringify(r.body).includes('preco'));
    assert.ok(!('produtos' in r.body));
  } finally {
    close();
  }
});

test('loja inexistente e loja inativa respondem igual (404 PORTAL_INATIVO)', async () => {
  const { app, close } = await portalApp();
  try {
    const a = await portal(app, 'GET', 'loja-inativa', '/vitrine');
    const b = await portal(app, 'GET', 'nao-existe-aqui', '/vitrine');
    const c = await portal(app, 'GET', 'X', '/vitrine'); // slug inválido
    for (const r of [a, b, c]) {
      assert.equal(r.status, 404);
      assert.equal(r.body.error, 'PORTAL_INATIVO');
    }
    assert.deepEqual(a.body, b.body);
  } finally {
    close();
  }
});

/* --------------------------------------------------------------- cadastro */

test('cadastro: valida, exige aceite LGPD e não deixa conta órfã se a loja recusa', async () => {
  const { app, db, close } = await portalApp();
  try {
    const semAceite = await portal(app, 'POST', 'loja-demo', '/register', { body: novoCadastro({ acceptPrivacy: false }) });
    assert.equal(semAceite.status, 400);
    assert.ok(semAceite.body.details.acceptPrivacy);

    const fraca = await portal(app, 'POST', 'loja-demo', '/register', { body: novoCadastro({ password: 'curta' }) });
    assert.equal(fraca.status, 400);

    const revendaSemDados = await portal(app, 'POST', 'loja-demo', '/register', { body: novoCadastro({ type: 'revenda' }) });
    assert.equal(revendaSemDados.status, 400);
    assert.ok(revendaSemDados.body.details.business);
    assert.ok(revendaSemDados.body.details['endereco.rua']);

    const docRuim = await portal(app, 'POST', 'loja-demo', '/register', { body: novoCadastro({ document: '123' }) });
    assert.equal(docRuim.status, 400);

    const inativa = await portal(app, 'POST', 'loja-inativa', '/register', { body: novoCadastro() });
    assert.equal(inativa.status, 404);
    const total = await db.queryOne('SELECT COUNT(*) AS n FROM portal_accounts');
    assert.equal(total.n, 0, 'nada fica gravado se a loja não aceitou a conta');
  } finally {
    close();
  }
});

test('cadastro de revenda envia estabelecimento, documento e endereço à API; conta nasce pendente', async () => {
  const { app, backend, close } = await portalApp();
  try {
    const dados = novoCadastro({
      type: 'revenda',
      business: 'Bar do Cacá',
      document: '11.222.333/0001-81',
      address: { rua: 'Rua das Flores', numero: '12', bairro: 'Centro', cidade: 'Taubaté', uf: 'sp', cep: '12000-000' },
    });
    const r = await portal(app, 'POST', 'loja-demo', '/register', { body: { ...dados, role: 'ADMIN', estado: 'ativa' } });
    assert.equal(r.status, 202);
    const chamada = backend.calls.find((c) => c.method === 'POST' && c.path.endsWith('/contas'));
    assert.equal(chamada.body.estabelecimento, 'Bar do Cacá');
    assert.equal(chamada.body.documento, '11222333000181');
    assert.equal(chamada.body.endereco.uf, 'SP');
    assert.equal(chamada.body.endereco.cep, '12000000');
    assert.equal(chamada.body.role, undefined);
    assert.equal(chamada.body.estado, undefined);
    assert.ok(chamada.body.contaId);
    assert.ok(!JSON.stringify(chamada.body).includes('password'));

    const login = await portal(app, 'POST', 'loja-demo', '/login', { body: { email: dados.email, password: SENHA } });
    const me = await portal(app, 'GET', 'loja-demo', '/me', { token: tokenOf(login, 'loja-demo') });
    assert.equal(me.body.conta.estado, 'pendente');
    assert.equal(me.body.account.estabelecimento, 'Bar do Cacá');
    assert.equal(me.body.account.password_hash, undefined);
  } finally {
    close();
  }
});

test('e-mail já cadastrado: mesma resposta de um cadastro novo, sem segunda conta, com aviso por e-mail', async () => {
  const { app, db, mailer, close } = await portalApp();
  try {
    const dados = novoCadastro();
    const primeira = await portal(app, 'POST', 'loja-demo', '/register', { body: dados });
    const repetida = await portal(app, 'POST', 'loja-demo', '/register', { body: { ...dados, name: 'Outra Pessoa', password: 'OutraSenha999' } });
    assert.equal(repetida.status, primeira.status);
    assert.deepEqual(repetida.body, primeira.body);
    assert.equal(repetida.headers['Set-Cookie'], undefined);
    const total = await db.queryOne('SELECT COUNT(*) AS n FROM portal_accounts');
    assert.equal(total.n, 1);
    assert.equal(mailer.sent.length, 1);
    assert.equal(mailer.sent[0].to, dados.email);
    assert.match(mailer.sent[0].subject, /Mercadinho Boa Praça/);
    /* A senha original continua valendo; a "nova" não. */
    const ok = await portal(app, 'POST', 'loja-demo', '/login', { body: { email: dados.email, password: SENHA } });
    assert.equal(ok.status, 200);
    const nao = await portal(app, 'POST', 'loja-demo', '/login', { body: { email: dados.email, password: 'OutraSenha999' } });
    assert.equal(nao.status, 401);
  } finally {
    close();
  }
});

/* ------------------------------------------------------------------ login */

test('login: cookie HttpOnly/Lax por loja, hash no banco e erro igual para senha errada e e-mail inexistente', async () => {
  const { app, db, close } = await portalApp();
  try {
    const dados = novoCadastro();
    await portal(app, 'POST', 'loja-demo', '/register', { body: dados });
    const login = await portal(app, 'POST', 'loja-demo', '/login', { body: { email: dados.email.toUpperCase(), password: SENHA } });
    assert.equal(login.status, 200);
    const cookie = login.headers['Set-Cookie'][0];
    assert.match(cookie, /^oi_portal_loja-demo=/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\/api\/portal\/loja-demo/);
    assert.match(cookie, /Max-Age=\d+/);
    assert.ok(!JSON.stringify(login.body).includes('hash'));

    const token = tokenOf(login, 'loja-demo');
    const guardado = await db.query('SELECT id FROM portal_sessions');
    assert.equal(guardado.length, 1);
    assert.notEqual(guardado[0].id, token, 'o banco guarda só o hash do token');

    const errada = await portal(app, 'POST', 'loja-demo', '/login', { body: { email: dados.email, password: 'errada12345' } });
    const inexistente = await portal(app, 'POST', 'loja-demo', '/login', { body: { email: 'ninguem@teste.com', password: 'errada12345' } });
    assert.equal(errada.status, 401);
    assert.equal(inexistente.status, 401);
    assert.deepEqual(errada.body, inexistente.body);
  } finally {
    close();
  }
});

test('logout apaga a sessão e limpa o cookie', async () => {
  const { app, close } = await portalApp();
  try {
    const { token } = await entrar(app);
    const saiu = await portal(app, 'POST', 'loja-demo', '/logout', { token });
    assert.equal(saiu.status, 200);
    assert.match(saiu.headers['Set-Cookie'][0], /Max-Age=0/);
    const depois = await portal(app, 'GET', 'loja-demo', '/me', { token });
    assert.equal(depois.status, 401);
  } finally {
    close();
  }
});

test('sessão expira por inatividade e pelo limite absoluto', async () => {
  const { app, db, close } = await portalApp();
  try {
    const { token } = await entrar(app);
    await db.execute('UPDATE portal_sessions SET last_seen_at = ?', [Date.now() - 8 * 24 * 3600 * 1000]);
    assert.equal((await portal(app, 'GET', 'loja-demo', '/me', { token })).status, 401);

    const outro = await entrar(app);
    await db.execute('UPDATE portal_sessions SET expires_at = ?', [Date.now() - 1000]);
    assert.equal((await portal(app, 'GET', 'loja-demo', '/me', { token: outro.token })).status, 401);
  } finally {
    close();
  }
});

/* ---------------------------------------------------------- isolamento */

test('conta de uma loja não entra em outra; o mesmo e-mail tem duas contas independentes', async () => {
  const { app, close } = await portalApp();
  try {
    const a = await entrar(app, 'loja-demo');
    const naOutra = await portal(app, 'POST', 'so-retirada', '/login', { body: { email: a.email, password: a.password } });
    assert.equal(naOutra.status, 401);

    await portal(app, 'POST', 'so-retirada', '/register', { body: { ...novoCadastro(), email: a.email, password: 'SenhaDaOutra99' } });
    const logaB = await portal(app, 'POST', 'so-retirada', '/login', { body: { email: a.email, password: 'SenhaDaOutra99' } });
    assert.equal(logaB.status, 200);
    const senhaDeA = await portal(app, 'POST', 'so-retirada', '/login', { body: { email: a.email, password: a.password } });
    assert.equal(senhaDeA.status, 401);
  } finally {
    close();
  }
});

test('sessão de uma loja não vale em outra, nem trocando o nome do cookie', async () => {
  const { app, close } = await portalApp();
  try {
    const a = await entrar(app, 'loja-demo');
    assert.equal((await portal(app, 'GET', 'loja-demo', '/me', { token: a.token })).status, 200);

    /* Token de A no cookie "da loja B". */
    const cruzado = await portal(app, 'GET', 'so-retirada', '/me', {
      headers: { cookie: `oi_portal_so-retirada=${encodeURIComponent(a.token)}` },
    });
    assert.equal(cruzado.status, 401);
    /* Cookie de A enviado à loja B com o nome certo de A (o navegador nem enviaria): também não. */
    const nomeDeA = await portal(app, 'GET', 'so-retirada', '/catalogo', {
      headers: { cookie: `oi_portal_loja-demo=${encodeURIComponent(a.token)}` },
    });
    assert.equal(nomeDeA.status, 401);
  } finally {
    close();
  }
});

test('conta do portal não acessa /cliente nem /admin, e conta do site não entra no portal', async () => {
  const { app, close } = await portalApp();
  try {
    const p = await entrar(app);
    const comoSessaoDoSite = (path) => request(app, 'GET', path, { token: p.token });
    assert.equal((await comoSessaoDoSite('/api/auth/me')).status, 401);
    assert.equal((await comoSessaoDoSite('/api/me/summary')).status, 401);
    assert.equal((await comoSessaoDoSite('/api/admin/summary')).status, 401);
    assert.equal((await comoSessaoDoSite('/api/conversations')).status, 401);

    const cliente = await createClient(app);
    const noPortal = await portal(app, 'POST', 'loja-demo', '/login', { body: { email: cliente.user.email, password: cliente.user.password } });
    assert.equal(noPortal.status, 401, 'users e portal_accounts são tabelas separadas');
    const tokenDoSite = await portal(app, 'GET', 'loja-demo', '/me', { token: cliente.token });
    assert.equal(tokenDoSite.status, 401);
  } finally {
    close();
  }
});

/* ------------------------------------------------------ limites e CSRF */

test('limite de tentativas de login por e-mail e por endereço', async () => {
  const { app, close } = await portalApp();
  try {
    const dados = novoCadastro();
    await portal(app, 'POST', 'loja-demo', '/register', { body: dados, ip: '10.0.0.1' });
    const tenta = (ip) =>
      portal(app, 'POST', 'loja-demo', '/login', { body: { email: dados.email, password: 'errada12345' }, ip });
    for (let i = 0; i < 5; i++) assert.equal((await tenta('10.0.0.1')).status, 401);
    const bloqueada = await tenta('10.0.0.1');
    assert.equal(bloqueada.status, 429);
    /* Mesmo com a senha certa, a trava vale (força bruta não "descobre" a senha pelo status). */
    const certa = await portal(app, 'POST', 'loja-demo', '/login', { body: { email: dados.email, password: SENHA }, ip: '10.0.0.1' });
    assert.equal(certa.status, 429);
    /* Outro endereço não é afetado pela trava de e-mail+IP. */
    assert.equal((await tenta('10.0.0.2')).status, 401);

    /* Teto por endereço: 20 tentativas com e-mails diferentes. */
    let ultimo;
    for (let i = 0; i < 21; i++) {
      ultimo = await portal(app, 'POST', 'loja-demo', '/login', { body: { email: `x${i}@teste.com`, password: 'errada12345' }, ip: '10.0.0.9' });
    }
    assert.equal(ultimo.status, 429);
  } finally {
    close();
  }
});

test('limite de cadastros por endereço', async () => {
  const { app, close } = await portalApp();
  try {
    let ultimo;
    for (let i = 0; i < 6; i++) ultimo = await portal(app, 'POST', 'loja-demo', '/register', { body: novoCadastro(), ip: '10.1.1.1' });
    assert.equal(ultimo.status, 429);
  } finally {
    close();
  }
});

test('escrita sem o cabeçalho do portal ou de origem alheia é recusada (CSRF)', async () => {
  const { app, close } = await portalApp({ allowedOrigins: ['https://todai.exemplo'] });
  try {
    const dados = novoCadastro();
    const semCabecalho = await request(app, 'POST', '/api/portal/loja-demo/register', {
      body: dados,
      headers: { origin: 'https://todai.exemplo' },
    });
    assert.equal(semCabecalho.status, 403);

    const origemAlheia = await portal(app, 'POST', 'loja-demo', '/register', { body: dados, headers: { origin: 'https://evil.exemplo' } });
    assert.equal(origemAlheia.status, 403);

    const crossSite = await portal(app, 'POST', 'loja-demo', '/register', {
      body: dados,
      headers: { origin: 'https://todai.exemplo', 'sec-fetch-site': 'cross-site' },
    });
    assert.equal(crossSite.status, 403);

    const ok = await portal(app, 'POST', 'loja-demo', '/register', { body: dados, headers: { origin: 'https://todai.exemplo' } });
    assert.equal(ok.status, 202);
  } finally {
    close();
  }
});

/* -------------------------------------------------- recuperação de senha */

test('recuperar senha: resposta igual com ou sem conta; link vale uma vez, só na loja certa; derruba sessões', async () => {
  const { app, mailer, close } = await portalApp();
  try {
    const a = await entrar(app, 'loja-demo');
    mailer.sent.length = 0;

    const comConta = await portal(app, 'POST', 'loja-demo', '/forgot', { body: { email: a.email } });
    const semConta = await portal(app, 'POST', 'loja-demo', '/forgot', { body: { email: 'ninguem@teste.com' } });
    assert.equal(comConta.status, 202);
    assert.deepEqual(comConta.body, semConta.body);
    assert.equal(mailer.sent.length, 1);
    assert.equal(mailer.sent[0].to, a.email);
    assert.match(mailer.sent[0].text, /\/l\/loja-demo\/redefinir-senha#token=/);
    assert.ok(mailer.sent[0].html.includes('Mercadinho Boa Praça'));
    assert.match(mailer.sent[0].fromName, /Mercadinho Boa Praça/);
    const token = /#token=([A-Za-z0-9_-]+)/.exec(mailer.sent[0].text)[1];

    /* O link de uma loja não redefine a senha em outra. */
    const outraLoja = await portal(app, 'POST', 'so-retirada', '/reset', { body: { token, password: 'NovaSenha12345' } });
    assert.equal(outraLoja.status, 400);

    const fraca = await portal(app, 'POST', 'loja-demo', '/reset', { body: { token, password: 'curta' } });
    assert.equal(fraca.status, 400);

    const ok = await portal(app, 'POST', 'loja-demo', '/reset', { body: { token, password: 'NovaSenha12345' } });
    assert.equal(ok.status, 200);
    const reuso = await portal(app, 'POST', 'loja-demo', '/reset', { body: { token, password: 'OutraSenha12345' } });
    assert.equal(reuso.status, 400);

    assert.equal((await portal(app, 'GET', 'loja-demo', '/me', { token: a.token })).status, 401, 'sessões antigas caem');
    assert.equal((await portal(app, 'POST', 'loja-demo', '/login', { body: { email: a.email, password: SENHA } })).status, 401);
    assert.equal((await portal(app, 'POST', 'loja-demo', '/login', { body: { email: a.email, password: 'NovaSenha12345' } })).status, 200);
  } finally {
    close();
  }
});

test('recuperar senha: sem provedor de e-mail responde 503 e o limite por e-mail não muda a resposta', async () => {
  const semEmail = await portalApp({ mailer: { configured: false, async send() {} } });
  try {
    const r = await portal(semEmail.app, 'POST', 'loja-demo', '/forgot', { body: { email: 'a@teste.com' } });
    assert.equal(r.status, 503);
  } finally {
    semEmail.close();
  }

  const { app, mailer, close } = await portalApp();
  try {
    const a = await entrar(app);
    mailer.sent.length = 0;
    const respostas = [];
    for (let i = 0; i < 5; i++) {
      respostas.push(await portal(app, 'POST', 'loja-demo', '/forgot', { body: { email: a.email }, ip: `10.2.0.${i}` }));
    }
    assert.ok(respostas.every((r) => r.status === 202));
    assert.equal(mailer.sent.length, 3, 'no máximo 3 e-mails por hora para o mesmo endereço');
  } finally {
    close();
  }
});

/* ---------------------------------------------------- catálogo e preço */

test('sem login não há catálogo nem preço, e a API nem é chamada', async () => {
  const { app, backend, close } = await portalApp({ leaky: true });
  try {
    for (const path of ['/catalogo', '/me', '/pedidos', '/fiado', '/pedidos/abcdefgh12345678']) {
      const r = await portal(app, 'GET', 'loja-demo', path);
      assert.equal(r.status, 401, path);
    }
    const pedido = await portal(app, 'POST', 'loja-demo', '/pedidos', { body: pedidoBase() });
    assert.equal(pedido.status, 401);
    assert.equal(backend.calls.filter((c) => c.path.includes('/catalogo') || c.path.includes('/pedidos')).length, 0);
  } finally {
    close();
  }
});

test('catálogo traz um único preço (o da tabela da conta) e descarta qualquer outro que a API mande', async () => {
  const { app, backend, close } = await portalApp({ leaky: true });
  try {
    const a = await entrar(app);
    const antes = await portal(app, 'GET', 'loja-demo', '/catalogo', { token: a.token });
    assert.equal(antes.status, 200);
    const cerveja = antes.body.produtos.find((p) => p.id === 'p-cerveja');
    assert.equal(cerveja.preco, 4.5, 'conta pendente vê varejo');
    assert.deepEqual(
      Object.keys(cerveja).sort(),
      ['caixaQtd', 'categoria', 'descricao', 'disponivel', 'id', 'imagemUrl', 'multiplo', 'nome', 'preco', 'unidade'].sort()
    );
    const texto = JSON.stringify(antes.body);
    for (const proibido of ['precoVarejo', 'precoAtacado', 'precoRevenda', '3.8', '3.4']) {
      assert.ok(!texto.includes(proibido), `vazou ${proibido}`);
    }
    assert.match(cerveja.imagemUrl, /^\/api\/portal\/loja-demo\/produtos\/p-cerveja\/imagem\?v=/);
    assert.equal(antes.body.produtos.find((p) => p.id === 'p-suco').disponivel, false);

    /* A loja aprova a conta como atacado: passa a ver SÓ o preço de atacado. */
    const contaId = [...backend.state.contas.values()][0].contaId;
    backend.handle({ method: 'POST', path: `/__mock/contas/${contaId}/decisao`, body: { estado: 'ativa', tabela: 'atacado' } });
    const depois = await portal(app, 'GET', 'loja-demo', '/catalogo', { token: a.token });
    assert.equal(depois.body.produtos.find((p) => p.id === 'p-cerveja').preco, 3.8);
    assert.ok(!JSON.stringify(depois.body).includes('4.5'));
    const me = await portal(app, 'GET', 'loja-demo', '/me', { token: a.token });
    assert.deepEqual(me.body.conta, { estado: 'ativa', tabela: 'atacado' });
  } finally {
    close();
  }
});

test('o catálogo sempre é pedido com o contaId da sessão, nunca o da URL', async () => {
  const { app, backend, close } = await portalApp();
  try {
    const a = await entrar(app);
    const b = await entrar(app);
    await portal(app, 'GET', 'loja-demo', '/catalogo', { token: a.token, query: { contaId: 'alheia-0000' } });
    const idA = [...backend.state.contas.values()].find((c) => c.email === a.email.toLowerCase()).contaId;
    const chamada = backend.calls.filter((c) => c.path.endsWith('/catalogo')).at(-1);
    assert.equal(chamada.query.contaId, idA);
    assert.notEqual(b.email, a.email);
  } finally {
    close();
  }
});

/* ----------------------------------------------------------- imagens */

test('imagem do produto passa pelo site: só bytes de imagem de verdade, com nosniff', async () => {
  const { app, close } = await portalApp();
  try {
    const ok = await portal(app, 'GET', 'loja-demo', '/produtos/p-arroz/imagem');
    assert.equal(ok.status, 200);
    assert.equal(ok.headers['Content-Type'], 'image/png');
    assert.equal(ok.headers['X-Content-Type-Options'], 'nosniff');
    assert.match(ok.headers['Cache-Control'], /max-age/);
    assert.ok(ok.buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])));

    assert.equal((await portal(app, 'GET', 'loja-demo', '/produtos/nao-existe/imagem')).status, 404);
    assert.equal((await portal(app, 'GET', 'loja-demo', '/produtos/..%2F..%2Fx/imagem')).status, 404);
    assert.equal((await portal(app, 'GET', 'loja-demo', '/logo')).status, 200);
    assert.equal((await portal(app, 'GET', 'cor-ruim', '/logo')).status, 404);
  } finally {
    close();
  }
});

test('logo só vem de data URI de imagem ou de caminho da própria API (nunca URL externa)', async () => {
  const chamadas = [];
  const com = (logoUrl) =>
    portalApiClient({
      fetchImpl: async (url) => {
        chamadas.push(String(url));
        if (String(url).includes('/api/v1/site/portal/l')) return new Response(JSON.stringify({ nomePublico: 'L', logoUrl }), { status: 200 });
        return new Response('x', { status: 404 });
      },
      licensing: { baseUrl: 'https://api.exemplo', serviceKey: 'k'.repeat(32) },
      cacheMs: 0,
    });
  for (const ruim of ['https://evil.exemplo/logo.png', '//evil.exemplo/x.png', '/\\evil.exemplo/x.png', '/../../etc/passwd', 'javascript:alert(1)']) {
    chamadas.length = 0;
    await assert.rejects(com(ruim).logo('l'), (e) => e.status === 404, ruim);
    assert.deepEqual(chamadas.filter((u) => !u.includes('/api/v1/site/portal/l')), [], `não pode buscar ${ruim}`);
  }
});

test('logo enviada pelo PDV: só bytes de imagem, nosniff, ETag pelo conteúdo e 304 na revalidação', async () => {
  const { app, close } = await portalApp();
  try {
    const vitrine = await portal(app, 'GET', 'loja-demo', '/vitrine');
    assert.equal(vitrine.body.logoUrl, '/api/portal/loja-demo/logo');

    const ok = await portal(app, 'GET', 'loja-demo', '/logo');
    assert.equal(ok.status, 200);
    assert.equal(ok.headers['Content-Type'], 'image/png');
    assert.equal(ok.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(ok.headers['Cache-Control'], 'public, max-age=300');
    assert.match(ok.headers.ETag, /^"[0-9a-f]{32}"$/);
    assert.ok(ok.buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])));

    const igual = await portal(app, 'GET', 'loja-demo', '/logo', { headers: { 'if-none-match': ok.headers.ETag } });
    assert.equal(igual.status, 304);
    assert.equal(igual.buffer.length, 0);
    assert.equal(igual.headers.ETag, ok.headers.ETag);
    const outra = await portal(app, 'GET', 'loja-demo', '/logo', { headers: { 'if-none-match': '"outra-logo"' } });
    assert.equal(outra.status, 200);
  } finally {
    close();
  }
});

test('logo que a API devolve como SVG, HTML ou grande demais nunca chega ao navegador', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const casos = [
    Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
    Buffer.from('<html><script>alert(1)</script></html>'),
    Buffer.concat([png, Buffer.alloc(300 * 1024)]),
  ];
  for (const bytes of casos) {
    const api = portalApiClient({
      fetchImpl: async (url) =>
        String(url).includes('/logo')
          ? new Response(bytes, { status: 200, headers: { 'content-type': 'image/png' } })
          : new Response(JSON.stringify({ nomePublico: 'L', logoUrl: '/api/v1/site/portal/l/logo' }), { status: 200 }),
      licensing: { baseUrl: 'https://api.exemplo', serviceKey: 'k'.repeat(32) },
      cacheMs: 0,
    });
    await assert.rejects(api.logo('l'), (e) => e.status === 404);
  }
});

test('logo do caminho da API usa a chave de serviço e só o caminho da própria API', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const chamadas = [];
  const api = portalApiClient({
    fetchImpl: async (url, init) => {
      chamadas.push({ url: String(url), key: init.headers['X-Service-Key'] });
      return String(url).endsWith('/logo')
        ? new Response(png, { status: 200, headers: { 'content-type': 'image/png' } })
        : new Response(JSON.stringify({ nomePublico: 'L', logoUrl: '/api/v1/site/portal/l/logo' }), { status: 200 });
    },
    licensing: { baseUrl: 'https://api.exemplo', serviceKey: 'k'.repeat(32) },
    cacheMs: 0,
  });
  const logo = await api.logo('l');
  assert.equal(logo.mime, 'image/png');
  assert.deepEqual(
    chamadas.map((c) => c.url),
    ['https://api.exemplo/api/v1/site/portal/l', 'https://api.exemplo/api/v1/site/portal/l/logo']
  );
  assert.ok(chamadas.every((c) => c.key === 'k'.repeat(32)));
});

test('imagem que a API devolve como HTML ou grande demais é recusada', async () => {
  const html = Buffer.from('<script>alert(1)</script>');
  const grande = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(300 * 1024)]);
  for (const [bytes, tipo] of [[html, 'image/png'], [grande, 'image/png']]) {
    const api = portalApiClient({
      fetchImpl: async () => new Response(bytes, { status: 200, headers: { 'content-type': tipo } }),
      licensing: { baseUrl: 'https://api.exemplo', serviceKey: 'k'.repeat(32) },
    });
    await assert.rejects(api.imagem('loja-demo', 'p-1'), (e) => e.status === 404);
  }
});

/* ----------------------------------------------------------- pedidos */

test('pedido: contaId vem da sessão, idempotencyKey evita duplicar e outra conta não vê o pedido', async () => {
  const { app, backend, close } = await portalApp();
  try {
    const a = await entrar(app);
    const b = await entrar(app);
    const corpo = pedidoBase();
    const r1 = await portal(app, 'POST', 'loja-demo', '/pedidos', { token: a.token, body: { ...corpo, contaId: 'de-outra-pessoa', total: 0.01, precoUnitario: 0.01 } });
    assert.equal(r1.status, 201, JSON.stringify(r1.body));
    assert.equal(r1.body.pedido.estado, 'recebido');
    assert.equal(r1.body.pedido.total, 65.8);
    const r2 = await portal(app, 'POST', 'loja-demo', '/pedidos', { token: a.token, body: corpo });
    assert.equal(r2.body.pedido.pedidoId, r1.body.pedido.pedidoId, 'mesmo pedido, não duplica');

    const enviado = backend.calls.find((c) => c.method === 'POST' && c.path.endsWith('/pedidos')).body;
    const idA = [...backend.state.contas.values()].find((c) => c.email === a.email.toLowerCase()).contaId;
    assert.equal(enviado.contaId, idA);
    assert.equal(enviado.total, undefined);
    assert.equal(enviado.itens[0].precoUnitario, undefined);

    const lista = await portal(app, 'GET', 'loja-demo', '/pedidos', { token: a.token });
    assert.equal(lista.body.pedidos.length, 1);
    assert.equal((await portal(app, 'GET', 'loja-demo', '/pedidos', { token: b.token })).body.pedidos.length, 0);

    const id = r1.body.pedido.pedidoId;
    assert.equal((await portal(app, 'GET', 'loja-demo', `/pedidos/${id}`, { token: a.token })).status, 200);
    assert.equal((await portal(app, 'GET', 'loja-demo', `/pedidos/${id}`, { token: b.token })).status, 404);
    assert.equal((await portal(app, 'POST', 'loja-demo', `/pedidos/${id}/cancelar`, { token: b.token })).status, 404);
  } finally {
    close();
  }
});

test('pedido: validação no servidor e mensagens de recusa da loja em português', async () => {
  const { app, backend, close } = await portalApp();
  try {
    const a = await entrar(app);
    const envia = (extra) => portal(app, 'POST', 'loja-demo', '/pedidos', { token: a.token, body: pedidoBase(extra) });

    assert.equal((await envia({ itens: [] })).status, 400);
    assert.equal((await envia({ itens: [{ produtoId: 'p-arroz', quantidade: -1 }] })).status, 400);
    assert.equal((await envia({ itens: [{ produtoId: 'p-arroz', quantidade: 'abc' }] })).status, 400);
    assert.equal((await envia({ pagamento: 'cartao' })).status, 400);
    assert.equal((await envia({ pagamento: 'na_entrega' })).status, 400, 'retirada não paga "na entrega"');
    assert.equal((await envia({ entrega: { tipo: 'retirada', data: '2020-01-01' } })).status, 400);
    assert.equal((await envia({ entrega: { tipo: 'entrega', data: hoje(), endereco: {} }, pagamento: 'na_entrega' })).status, 400);
    assert.equal((await envia({ idempotencyKey: 'x' })).status, 400);
    assert.equal((await envia({ observacao: 'a'.repeat(501) })).status, 400);

    const minimo = await envia({ itens: [{ produtoId: 'p-agua', quantidade: 2 }] });
    assert.equal(minimo.status, 409);
    assert.equal(minimo.body.message, 'O pedido não atinge o valor mínimo da loja.');
    const indisponivel = await envia({ itens: [{ produtoId: 'p-suco', quantidade: 20 }] });
    assert.equal(indisponivel.status, 409);
    assert.match(indisponivel.body.message, /não está mais disponível/);
    const multiplo = await envia({ itens: [{ produtoId: 'p-banana', quantidade: 5.3 }] });
    assert.equal(multiplo.status, 400);
    assert.equal(multiplo.body.error, 'INVALID_MULTIPLE');

    const entrega = await envia({
      entrega: { tipo: 'entrega', data: hoje(), faixa: 'Tarde', endereco: { rua: 'Rua A', numero: '1', bairro: 'Centro', cidade: 'Taubaté' } },
      pagamento: 'na_entrega',
    });
    assert.equal(entrega.status, 201);
    assert.equal(entrega.body.pedido.total, 71.8, 'taxa de entrega somada pela API');
    /* Contrato da API: o endereço de entrega do pedido é UMA linha de texto (a API recusa objeto com 400). */
    const enviadoEntrega = backend.calls.filter((c) => c.method === 'POST' && c.path.endsWith('/pedidos')).at(-1).body;
    assert.equal(enviadoEntrega.entrega.endereco, 'Rua A, 1 - Centro - Taubaté');
  } finally {
    close();
  }
});

test('pedido: estados mudam na loja, aparecem para o cliente e o cancelamento respeita o prazo', async () => {
  const { app, backend, close } = await portalApp();
  try {
    const a = await entrar(app);
    const criado = await portal(app, 'POST', 'loja-demo', '/pedidos', { token: a.token, body: pedidoBase() });
    const id = criado.body.pedido.pedidoId;
    backend.handle({ method: 'POST', path: `/__mock/pedidos/${id}/estado`, body: { estado: 'aceito' } });
    const detalhe = await portal(app, 'GET', 'loja-demo', `/pedidos/${id}`, { token: a.token });
    assert.equal(detalhe.body.pedido.estado, 'aceito');
    assert.equal(detalhe.body.pedido.itens[0].nome, 'Arroz branco tipo 1 5 kg');

    const naoCancela = await portal(app, 'POST', 'loja-demo', `/pedidos/${id}/cancelar`, { token: a.token });
    assert.equal(naoCancela.status, 409);
    assert.ok(naoCancela.body.message);

    const outro = await portal(app, 'POST', 'loja-demo', '/pedidos', { token: a.token, body: pedidoBase() });
    const cancela = await portal(app, 'POST', 'loja-demo', `/pedidos/${outro.body.pedido.pedidoId}/cancelar`, { token: a.token });
    assert.equal(cancela.status, 200);
    assert.equal(cancela.body.estado, 'cancelado');
    assert.equal((await portal(app, 'GET', 'loja-demo', '/pedidos/id-invalido!', { token: a.token })).status, 404);
  } finally {
    close();
  }
});

test('fiado só existe em loja que usa fiado', async () => {
  const { app, close } = await portalApp();
  try {
    const a = await entrar(app, 'loja-demo');
    const ok = await portal(app, 'GET', 'loja-demo', '/fiado', { token: a.token });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.fiado.saldo, 186.4);
    assert.equal(ok.body.fiado.extrato.length, 3);

    const b = await entrar(app, 'so-retirada');
    assert.equal((await portal(app, 'GET', 'so-retirada', '/fiado', { token: b.token })).status, 404);
  } finally {
    close();
  }
});

/* -------------------------------------------------------- API da loja fora */

test('API da loja fora do ar: erro genérico, sem vazar endereço, chave nem detalhe', async () => {
  const { app, backend, close } = await portalApp();
  try {
    const a = await entrar(app);
    backend.handle = () => {
      throw new Error('segredo-interno https://api.exemplo/xyz');
    };
    const r = await portal(app, 'GET', 'loja-demo', '/catalogo', { token: a.token });
    assert.equal(r.status, 503);
    const texto = JSON.stringify(r.body);
    assert.ok(!texto.includes('segredo-interno'));
    assert.ok(!texto.includes('api.exemplo'));
    assert.ok(!texto.includes(MOCK_SERVICE_KEY));
  } finally {
    close();
  }
});

/* ------------------------------------------------------ cliente HTTP da API */

test('cliente da API: chave de serviço, caminho, tempo máximo e erro genérico', async () => {
  const calls = [];
  const api = portalApiClient({
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(JSON.stringify({ nomePublico: 'Loja X', aceitaPedidos: true, cores: { primaria: '#112233' } }), { status: 200 });
    },
    licensing: { baseUrl: 'https://api.exemplo/', serviceKey: 'chave-de-teste-do-portal', timeoutMs: 5000 },
    cacheMs: 0,
  });
  const v = await api.vitrine('loja-x');
  assert.equal(v.nomePublico, 'Loja X');
  assert.equal(calls[0].url, 'https://api.exemplo/api/v1/site/portal/loja-x');
  assert.equal(calls[0].options.headers['X-Service-Key'], 'chave-de-teste-do-portal');
  assert.ok(calls[0].options.signal);

  await api.catalogo('loja-x', 'conta/../1');
  assert.ok(calls[1].url.includes('conta%2F..%2F1') || calls[1].url.includes('contaId=conta%2F..%2F1'));

  /* Tempo estourado: AbortError vira 503 genérico. */
  const lenta = portalApiClient({
    fetchImpl: (url, { signal }) =>
      new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('abortado'), { name: 'AbortError' })))),
    licensing: { baseUrl: 'https://api.exemplo', serviceKey: 'k'.repeat(32), timeoutMs: 30 },
  });
  await assert.rejects(lenta.vitrine('loja-x'), (e) => e.status === 503 && e.code === 'PORTAL_INDISPONIVEL' && !/abortado/.test(e.message));

  /* 500 com corpo cheio de detalhe interno. */
  const quebrada = portalApiClient({
    fetchImpl: async () => new Response(JSON.stringify({ detail: 'NullReference em Foo.cs:12', code: 'x' }), { status: 500 }),
    licensing: { baseUrl: 'https://api.exemplo', serviceKey: 'k'.repeat(32) },
  });
  await assert.rejects(quebrada.pedidos('loja-x', 'c1'), (e) => e.status === 503 && !/NullReference/.test(e.message));

  /* Sem configuração: nem tenta. */
  const sem = portalApiClient({ fetchImpl: async () => assert.fail('não pode chamar'), licensing: {} });
  await assert.rejects(sem.vitrine('loja-x'), (e) => e.status === 503);
});

test('cliente da API: recusa de negócio usa texto próprio; texto da API só se for curto e sem controle', async () => {
  const com = (status, body) =>
    portalApiClient({
      fetchImpl: async () => new Response(JSON.stringify(body), { status }),
      licensing: { baseUrl: 'https://api.exemplo', serviceKey: 'k'.repeat(32) },
    });
  const pedido = { itens: [] };
  await assert.rejects(com(409, { code: 'min_order', detail: 'x' }).criarPedido('l', pedido), (e) => e.message === 'O pedido não atinge o valor mínimo da loja.');
  await assert.rejects(com(409, { code: 'coisa_nova', detail: 'A loja fecha às 18h.\n\u0000' }).criarPedido('l', pedido), (e) => e.message === 'A loja fecha às 18h.');
  await assert.rejects(com(400, { code: 'coisa_nova', detail: 'x'.repeat(500) }).criarPedido('l', pedido), (e) => /Confira os dados/.test(e.message));
  await assert.rejects(com(404, { code: 'portal_inactive' }).vitrine('l'), (e) => e.code === 'PORTAL_INATIVO');
  await assert.rejects(com(403, { code: 'addon_not_active' }).vitrine('l'), (e) => e.code === 'PORTAL_INATIVO');
});

/* -------------------------------------------------- eventos (API → site) */

const evento = (app, body, { key = SERVICE_KEY, headers } = {}) =>
  request(app, 'POST', '/api/service/portal/eventos', {
    body,
    headers: { ...(key ? { 'x-service-key': key } : {}), ...headers },
  });

test('eventos: exigem a chave de serviço e não aceitam navegador', async () => {
  const { app, mailer, close } = await portalApp();
  try {
    const corpo = { slug: 'loja-demo', contaId: 'x'.repeat(10), tipo: 'conta', estado: 'ativa' };
    assert.equal((await evento(app, corpo, { key: null })).status, 401);
    assert.equal((await evento(app, corpo, { key: 'errada' })).status, 401);
    assert.equal((await evento(app, corpo, { headers: { origin: 'https://evil.exemplo' } })).status, 403);
    assert.equal(mailer.sent.length, 0);
  } finally {
    close();
  }
});

test('eventos: pedido muda de estado e o dono da conta recebe e-mail com o nome da loja', async () => {
  const { app, backend, mailer, close } = await portalApp();
  try {
    const a = await entrar(app);
    const conta = [...backend.state.contas.values()].find((c) => c.email === a.email.toLowerCase());
    const criado = await portal(app, 'POST', 'loja-demo', '/pedidos', { token: a.token, body: pedidoBase() });
    const pedidoId = criado.body.pedido.pedidoId;
    mailer.sent.length = 0;

    const r = await evento(app, { slug: 'loja-demo', pedidoId, contaId: conta.contaId, tipo: 'pedido', estado: 'aceito' });
    assert.equal(r.status, 202);
    assert.equal(r.body.sent, true);
    const email = mailer.sent[0];
    assert.equal(email.to, a.email.toLowerCase());
    assert.match(email.fromName, /Mercadinho Boa Praça/);
    assert.match(email.subject, /Mercadinho Boa Praça/);
    assert.match(email.subject, /aceitou/);
    assert.match(email.subject, /#1\d{3}/);
    assert.equal(email.replyTo, 'contato@boapraca.exemplo');
    assert.ok(email.html.includes('<a href="https://todai.exemplo/l/loja-demo/pedidos/'));
    assert.match(email.text, /Acompanhar o pedido: https:\/\/todai\.exemplo\/l\/loja-demo\/pedidos\//);

    /* Repetição do mesmo evento (a API reenvia) não duplica o e-mail. */
    const repetido = await evento(app, { slug: 'loja-demo', pedidoId, contaId: conta.contaId, tipo: 'pedido', estado: 'aceito' });
    assert.equal(repetido.body.sent, false);
    assert.equal(mailer.sent.length, 1);

    const recusa = await evento(app, { slug: 'loja-demo', pedidoId, contaId: conta.contaId, tipo: 'pedido', estado: 'recusado', motivo: 'Sem estoque de arroz <b>hoje</b>' });
    assert.equal(recusa.body.sent, true);
    assert.match(mailer.sent[1].text, /Motivo informado pela loja: Sem estoque de arroz <b>hoje<\/b>/);
    assert.ok(!mailer.sent[1].html.includes('<b>hoje</b>'), 'o HTML escapa o que vem de fora');
    assert.ok(mailer.sent[1].html.includes('&lt;b&gt;hoje&lt;/b&gt;'));
  } finally {
    close();
  }
});

test('eventos: conta aprovada ou bloqueada, conta de outra loja, dados inválidos e provedor fora', async () => {
  const { app, backend, mailer, close } = await portalApp();
  try {
    const a = await entrar(app);
    const contaId = [...backend.state.contas.values()][0].contaId;
    mailer.sent.length = 0;

    const aprovada = await evento(app, { slug: 'loja-demo', contaId, tipo: 'conta', estado: 'ativa' });
    assert.equal(aprovada.body.sent, true);
    assert.match(mailer.sent[0].subject, /aprovado/);
    const bloqueada = await evento(app, { slug: 'loja-demo', contaId, tipo: 'conta', estado: 'bloqueada' });
    assert.match(mailer.sent[1].subject, /não foi possível liberar/);

    /* A mesma conta não existe na outra loja: nada é enviado. */
    const outraLoja = await evento(app, { slug: 'so-retirada', contaId, tipo: 'conta', estado: 'ativa' });
    assert.equal(outraLoja.body.sent, false);
    assert.equal(mailer.sent.length, 2);

    for (const ruim of [
      { slug: 'LOJA', contaId, tipo: 'conta', estado: 'ativa' },
      { slug: 'loja-demo', contaId: 'curto', tipo: 'conta', estado: 'ativa' },
      { slug: 'loja-demo', contaId, tipo: 'qualquer', estado: 'ativa' },
      { slug: 'loja-demo', contaId, tipo: 'pedido', estado: 'ativa' },
      { slug: 'loja-demo', contaId, tipo: 'pedido', estado: 'aceito', pedidoId: '../x' },
    ]) {
      assert.equal((await evento(app, ruim)).status, 400, JSON.stringify(ruim));
    }
    assert.ok(a.email);
  } finally {
    close();
  }

  const falho = await portalApp({ mailer: fakeMailer({ failing: true }) });
  try {
    const x = await entrar(falho.app);
    const id = [...falho.backend.state.contas.values()][0].contaId;
    const r = await evento(falho.app, { slug: 'loja-demo', contaId: id, tipo: 'conta', estado: 'ativa' });
    assert.equal(r.status, 503, 'a API pode tentar de novo');
    assert.ok(x.token);
  } finally {
    falho.close();
  }
});

/* ------------------------------------------------------------- mailer */

test('mailer: nome da loja no remetente, HTML e reply-to vão ao provedor; cabeçalhos não aceitam quebra de linha', async () => {
  const enviados = [];
  const mailer = createMailer({
    apiKey: 'chave',
    from: 'TODAI <avisos@todai.exemplo>',
    isProduction: true,
    fetchImpl: async (url, options) => {
      enviados.push(JSON.parse(options.body));
      return new Response('{}', { status: 200 });
    },
  });
  await mailer.send({
    to: 'a@b.com',
    subject: 'Pedido\r\nBcc: x@y.com',
    text: 't',
    html: '<p>h</p>',
    fromName: 'Loja "Boa" <script>\nX via TODAI',
    replyTo: 'loja@exemplo.com',
  });
  const corpo = enviados[0];
  assert.equal(corpo.from, 'Loja Boa script X via TODAI <avisos@todai.exemplo>');
  assert.equal(corpo.subject, 'Pedido Bcc: x@y.com');
  assert.equal(corpo.html, '<p>h</p>');
  assert.equal(corpo.reply_to, 'loja@exemplo.com');

  await mailer.send({ to: 'a@b.com', subject: 's', text: 't', replyTo: 'invalido' });
  assert.equal(enviados[1].reply_to, undefined);
  assert.equal(enviados[1].from, 'TODAI <avisos@todai.exemplo>');
  assert.equal(composeFrom('avisos@todai.exemplo', 'Loja'), 'Loja <avisos@todai.exemplo>');
});

/* ------------------------------------------------- roteamento e schema */

test('/l/* é privado (noindex), responde 200 na SPA e o corpo do portal tem teto próprio', () => {
  for (const path of ['/l/loja-demo', '/l/loja-demo/catalogo', '/l/loja-demo/pedidos/abc', '/L/Loja-Demo/entrar']) {
    const seo = seoFor(path);
    assert.equal(seo.noindex, true, path);
    assert.notEqual(seo.notFound, true, path);
    assert.equal(statusDaSpa(path), 200, path);
  }
  assert.equal(seoFor('/lixo').notFound, true);
  assert.equal(bodyLimitFor('/api/portal/loja-demo/pedidos'), 32 * 1024);
});

test('as tabelas do portal existem nos dois schemas e carregam store_slug; reset as apaga', async () => {
  const { db, close } = await portalApp();
  try {
    const nomes = (await db.query("SELECT name FROM sqlite_master WHERE type='table'")).map((r) => r.name);
    for (const t of ['portal_accounts', 'portal_sessions', 'portal_resets']) assert.ok(nomes.includes(t), t);
  } finally {
    close();
  }
  for (const arquivo of ['schema.sqlite.sql', 'schema.postgres.sql']) {
    const sql = readFileSync(join(raiz, 'server/db', arquivo), 'utf8');
    for (const t of ['portal_accounts', 'portal_sessions', 'portal_resets']) {
      const bloco = new RegExp(`CREATE TABLE IF NOT EXISTS ${t} \\(([\\s\\S]*?)\\n\\);`).exec(sql);
      assert.ok(bloco, `${arquivo}: ${t}`);
      assert.match(bloco[1], /store_slug/, `${arquivo}: ${t} sem store_slug`);
    }
    assert.match(sql, /UNIQUE \(store_slug, email\)|UNIQUE \(store_slug, email\)/);
  }
  for (const arquivo of ['reset.sqlite.sql', 'reset.postgres.sql']) {
    const sql = readFileSync(join(raiz, 'server/db', arquivo), 'utf8');
    for (const t of ['portal_accounts', 'portal_sessions', 'portal_resets']) assert.match(sql, new RegExp(`DROP TABLE IF EXISTS ${t}`));
  }
});

test('a faxina apaga sessões e links do portal vencidos', async () => {
  const { app, db, ctx, close } = await portalApp();
  try {
    const a = await entrar(app);
    await portal(app, 'POST', 'loja-demo', '/forgot', { body: { email: a.email } });
    await db.execute('UPDATE portal_sessions SET expires_at = 1');
    await db.execute('UPDATE portal_resets SET expires_at = 1');
    const r = await app.maintenance.run();
    assert.equal(r.portalSessions, 1);
    assert.equal(r.portalResets, 1);
    assert.equal((await db.queryOne('SELECT COUNT(*) AS n FROM portal_accounts')).n, 1);
    assert.ok(ctx);
  } finally {
    close();
  }
});
