/* =========================================================================
   /api/service/clients, /requests/:id/status e /audit: telas "Contas do site"
   e "Atividade do site" do Panel.
   ========================================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, createClient, request } from './helpers.js';
import { REQUEST_STATUS_VALUES, ROLES } from '../../server/config.js';

const KEY = 'chave-de-servico-do-panel-0123456789abcdef';
const ACTOR = { actorId: '3', actorName: 'Kaique' };

const svc = (app, method, path, { key = KEY, body, query, headers } = {}) =>
  request(app, method, path, {
    body,
    query,
    headers: { ...(key ? { 'x-service-key': key } : {}), ...headers },
  });

const setup = () => createTestApp({ serviceKey: KEY });

async function newRequest(app, token, description = 'Preciso de um sistema de estoque completo') {
  const r = await request(app, 'POST', '/api/me/requests', {
    token,
    body: { type: 'Sistema / ERP', description },
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return String(r.body.request.id);
}

const ROUTES = [
  ['GET', '/api/service/clients'],
  ['GET', '/api/service/clients/1'],
  ['POST', '/api/service/requests/1/status'],
  ['GET', '/api/service/audit'],
];

test('autenticação: sem chave/errada 401, sem env 503, com Origin 403, cookie ignorado', async () => {
  const { app, close } = await setup();
  try {
    const c = await createClient(app);
    let n = 0;
    for (const [m, p] of ROUTES) {
      for (const key of [null, 'errada', `${KEY}x`]) {
        n += 1;
        const r = await svc(app, m, p, { key, headers: { 'x-forwarded-for': `203.0.113.${n}` } });
        assert.equal(r.status, 401, `${m} ${p} ${key}`);
        assert.deepEqual(Object.keys(r.body).sort(), ['error', 'message']);
      }
      const o = await svc(app, m, p, {
        headers: { origin: 'https://evil.example', 'x-forwarded-for': '198.51.100.9' },
      });
      assert.equal(o.status, 403, `${m} ${p} origin`);
      const cookie = await request(app, m, p, { token: c.token, headers: { 'x-forwarded-for': '198.51.100.10' } });
      assert.equal(cookie.status, 401, `${m} ${p} cookie`);
    }
  } finally {
    close();
  }
  const off = await createTestApp({ serviceKey: undefined });
  try {
    for (const [m, p] of ROUTES) assert.equal((await svc(off.app, m, p)).status, 503);
  } finally {
    off.close();
  }
});

test('lista de clientes: formato, só CLIENT, contagens, busca e paginação estável', async () => {
  const { app, ctx, close } = await setup();
  try {
    const ana = await createClient(app, { name: 'Ana Souza', company: 'Alfa Ltda', email: 'ana@alfa.com' });
    const bia = await createClient(app, { name: 'Bia 100%', company: 'Beta_SA', email: 'bia@beta.com' });
    const caio = await createClient(app, { name: 'Caio Lima', company: 'Gama', email: 'caio@gama.com' });
    await newRequest(app, ana.token);
    await newRequest(app, ana.token, 'Outra necessidade de automação importante');
    const project = await ctx.projects.create({
      slug: 'p1', title: 'P1', tagline: '', description: '', problem: '', solution: '',
      features: '[]', technologies: '[]', category: '', image: '', link: null,
      status: 'ENTREGUE', featured: 0, isMockup: 0, isPublic: 1,
    });
    await ctx.projects.linkToUser(Number(ana.id), project);
    /* Admin e usuário de sistema não aparecem. */
    await ctx.users.create({
      name: 'Admin X', company: null, email: 'adm@x.com', phone: null, passwordHash: 'x', role: ROLES.ADMIN,
    });

    const r = await svc(app, 'GET', '/api/service/clients');
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body), ['clients']);
    assert.equal(r.body.clients.length, 3);
    assert.ok(!JSON.stringify(r.body).includes('Admin X'));
    const a = r.body.clients.find((c) => c.name === 'Ana Souza');
    assert.deepEqual(Object.keys(a).sort(), [
      'company', 'createdAt', 'email', 'id', 'lastActivityAt', 'name', 'phone', 'projectCount', 'requestCount',
    ]);
    assert.equal(a.id, String(ana.id));
    assert.equal(a.requestCount, 2);
    assert.equal(a.projectCount, 1);
    assert.equal(a.email, 'ana@alfa.com');
    assert.ok(new Date(a.lastActivityAt) >= new Date(a.createdAt));
    assert.equal(r.body.clients.find((c) => c.name === 'Caio Lima').requestCount, 0);

    /* Busca por nome, e-mail, empresa (sem diferenciar caixa). */
    for (const [q, expected] of [['ana', 'Ana Souza'], ['BETA.com', 'Bia 100%'], ['gama', 'Caio Lima']]) {
      const s = await svc(app, 'GET', '/api/service/clients', { query: { q } });
      assert.deepEqual(s.body.clients.map((c) => c.name), [expected], q);
    }
    /* Curingas do LIKE são literais. */
    assert.equal((await svc(app, 'GET', '/api/service/clients', { query: { q: '%' } })).body.clients.length, 1);
    assert.equal((await svc(app, 'GET', '/api/service/clients', { query: { q: '_' } })).body.clients.length, 1);
    assert.equal((await svc(app, 'GET', '/api/service/clients', { query: { q: "a' OR '1'='1" } })).body.clients.length, 0);
    assert.equal((await svc(app, 'GET', '/api/service/clients', { query: { q: 'zzz' } })).body.clients.length, 0);

    /* Paginação estável e sem repetição. */
    const seen = [];
    for (const page of [1, 2, 3]) {
      const p = await svc(app, 'GET', '/api/service/clients', { query: { limit: '1', page: String(page) } });
      assert.equal(p.body.clients.length, 1);
      seen.push(p.body.clients[0].id);
    }
    assert.equal(new Set(seen).size, 3);
    assert.equal((await svc(app, 'GET', '/api/service/clients', { query: { limit: '1', page: '4' } })).body.clients.length, 0);
    /* Limites: 1..100; lixo cai no padrão. */
    for (const limit of ['0', '-5', 'abc', '1e3', '9999']) {
      const p = await svc(app, 'GET', '/api/service/clients', { query: { limit, page: '-2' } });
      assert.equal(p.status, 200);
      assert.equal(p.body.clients.length, 3);
    }
  } finally {
    close();
  }
});

test('detalhe do cliente: solicitações com unreadCount e projetos; 404 e id inválido', async () => {
  const { app, ctx, close } = await setup();
  try {
    const ana = await createClient(app, { name: 'Ana Souza' });
    const bia = await createClient(app, { name: 'Bia' });
    const reqId = await newRequest(app, ana.token);
    await newRequest(app, bia.token);
    await request(app, 'POST', `/api/requests/${reqId}/messages`, { token: ana.token, body: { body: 'Olá time' } });
    await request(app, 'POST', `/api/requests/${reqId}/messages`, { token: ana.token, body: { body: 'Segunda' } });
    const project = await ctx.projects.create({
      slug: 'p2', title: 'Projeto Dois', tagline: '', description: '', problem: '', solution: '',
      features: '[]', technologies: '[]', category: '', image: '', link: null,
      status: 'EM_DESENVOLVIMENTO', featured: 0, isMockup: 0, isPublic: 1,
    });
    await ctx.projects.linkToUser(Number(ana.id), project);

    const r = await svc(app, 'GET', `/api/service/clients/${ana.id}`);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body), ['client', 'requests', 'projects']);
    assert.equal(r.body.client.name, 'Ana Souza');
    assert.equal(r.body.requests.length, 1);
    assert.deepEqual(Object.keys(r.body.requests[0]).sort(), [
      'createdAt', 'requestId', 'status', 'title', 'type', 'unreadCount',
    ]);
    assert.equal(r.body.requests[0].requestId, reqId);
    assert.equal(r.body.requests[0].type, 'Sistema / ERP');
    assert.equal(r.body.requests[0].status, 'NOVO');
    assert.equal(r.body.requests[0].unreadCount, 2);
    assert.deepEqual(r.body.projects, [{ id: String(project), title: 'Projeto Dois', status: 'EM_DESENVOLVIMENTO' }]);
    /* Não vaza a solicitação de outra conta. */
    assert.ok(!JSON.stringify(r.body).includes('Bia'));

    for (const bad of ['abc', '0', '-1', '1e3', '0x10', '1.5']) {
      assert.equal((await svc(app, 'GET', `/api/service/clients/${bad}`)).status, 400, bad);
    }
    assert.equal((await svc(app, 'GET', '/api/service/clients/999999')).status, 404);
    /* Admin/usuário de sistema não é "cliente". */
    const sys = await ctx.users.findByEmailWithHash('atendimento@sistema.todai.invalid');
    if (sys) assert.equal((await svc(app, 'GET', `/api/service/clients/${sys.id}`)).status, 404);
  } finally {
    close();
  }
});

test('status: válido grava e audita com o ator; inválido 400; inexistente 404', async () => {
  const { app, ctx, close } = await setup();
  try {
    const ana = await createClient(app, { name: 'Ana Souza' });
    const reqId = await newRequest(app, ana.token);

    const ok = await svc(app, 'POST', `/api/service/requests/${reqId}/status`, {
      body: { status: 'EM_ANALISE', ...ACTOR },
    });
    assert.equal(ok.status, 200);
    assert.deepEqual(Object.keys(ok.body), ['request']);
    assert.deepEqual(Object.keys(ok.body.request).sort(), ['requestId', 'status', 'updatedAt']);
    assert.equal(ok.body.request.requestId, reqId);
    assert.equal(ok.body.request.status, 'EM_ANALISE');
    assert.ok(!Number.isNaN(Date.parse(ok.body.request.updatedAt)));
    assert.equal((await ctx.requests.findByIdWithUser(Number(reqId))).status, 'EM_ANALISE');

    /* Todos os status do site valem. */
    for (const status of REQUEST_STATUS_VALUES) {
      const r = await svc(app, 'POST', `/api/service/requests/${reqId}/status`, { body: { status, ...ACTOR } });
      assert.equal(r.status, 200, status);
    }

    /* Inválido (status e ator) não altera nada. */
    await svc(app, 'POST', `/api/service/requests/${reqId}/status`, { body: { status: 'CONCLUIDO', ...ACTOR } });
    for (const body of [
      { status: 'INEXISTENTE', ...ACTOR },
      { status: '', ...ACTOR },
      { ...ACTOR },
      { status: ['NOVO'], ...ACTOR },
      { status: 'NOVO' },
      { status: 'NOVO', actorId: 'a b', actorName: 'Kaique' },
      { status: 'NOVO', actorId: '3', actorName: '<b>x</b>' },
    ]) {
      const r = await svc(app, 'POST', `/api/service/requests/${reqId}/status`, { body });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.equal(r.body.error, 'DADOS_INVALIDOS');
      assert.ok(r.body.details && Object.keys(r.body.details).length > 0);
    }
    assert.equal((await ctx.requests.findByIdWithUser(Number(reqId))).status, 'CONCLUIDO');

    assert.equal(
      (await svc(app, 'POST', '/api/service/requests/999999/status', { body: { status: 'NOVO', ...ACTOR } })).status,
      404
    );
    for (const bad of ['abc', '0', '1e3']) {
      assert.equal(
        (await svc(app, 'POST', `/api/service/requests/${bad}/status`, { body: { status: 'NOVO', ...ACTOR } })).status,
        400
      );
    }
    /* Corpo > 32 KB. */
    const big = await svc(app, 'POST', `/api/service/requests/${reqId}/status`, {
      body: { status: 'NOVO', ...ACTOR, lixo: 'x'.repeat(40 * 1024) },
    });
    assert.equal(big.status, 413);
  } finally {
    close();
  }
});

test('auditoria: ator, ip, summary por allowlist, filtros, ordem id desc e paginação', async () => {
  const { app, ctx, close } = await setup();
  try {
    const ana = await createClient(app, { name: 'Ana Souza' });
    const reqId = await newRequest(app, ana.token);
    await svc(app, 'POST', `/api/service/requests/${reqId}/status`, {
      body: { status: 'ORCAMENTO', ...ACTOR },
      headers: { 'x-forwarded-for': '203.0.113.77' },
    });
    await svc(app, 'POST', `/api/service/requests/${reqId}/status`, {
      body: { status: 'CONCLUIDO', actorId: '4', actorName: 'Marina' },
    });

    const r = await svc(app, 'GET', '/api/service/audit');
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body), ['entries']);
    const entries = r.body.entries;
    const ids = entries.map((e) => Number(e.id));
    assert.deepEqual(ids, [...ids].sort((x, y) => y - x), 'id desc');
    for (const e of entries) {
      assert.deepEqual(Object.keys(e).sort(), [
        'action', 'actorName', 'createdAt', 'id', 'ip', 'resourceId', 'resourceType', 'summary',
      ]);
      assert.equal(typeof e.id, 'string');
    }
    const status = entries.filter((e) => e.action === 'SOLICITACAO_STATUS_ALTERADO');
    assert.equal(status.length, 2);
    assert.equal(status[0].actorName, 'Marina');
    assert.equal(status[1].actorName, 'Kaique');
    assert.equal(status[0].resourceType, 'request');
    assert.equal(status[0].resourceId, reqId);
    assert.match(status[0].summary, /De: ORCAMENTO/);
    assert.match(status[0].summary, /Para: CONCLUIDO/);
    assert.ok(!status[0].summary.includes('actor'));
    /* Evento de cliente sem ator em details: nome do usuário do evento. */
    const criada = entries.find((e) => e.action === 'SOLICITACAO_CRIADA');
    assert.equal(criada.actorName, 'Ana Souza');

    /* Filtro por ação (exata) e por q (ator em details, ação, recurso). */
    const f = await svc(app, 'GET', '/api/service/audit', { query: { action: 'SOLICITACAO_STATUS_ALTERADO' } });
    assert.equal(f.body.entries.length, 2);
    assert.ok(f.body.entries.every((e) => e.action === 'SOLICITACAO_STATUS_ALTERADO'));
    assert.equal((await svc(app, 'GET', '/api/service/audit', { query: { action: 'NAO_EXISTE' } })).body.entries.length, 0);
    assert.equal((await svc(app, 'GET', '/api/service/audit', { query: { action: "x'; DROP TABLE users;--" } })).status, 400);
    const q1 = await svc(app, 'GET', '/api/service/audit', { query: { q: 'marina' } });
    assert.deepEqual(q1.body.entries.map((e) => e.actorName), ['Marina']);
    const q2 = await svc(app, 'GET', '/api/service/audit', { query: { q: 'Ana Souza' } });
    assert.ok(q2.body.entries.length >= 1);
    assert.ok(q2.body.entries.every((e) => e.actorName === 'Ana Souza'));
    assert.equal((await svc(app, 'GET', '/api/service/audit', { query: { q: '%' } })).body.entries.length, 0);

    /* Paginação estável. */
    const total = entries.length;
    const seen = [];
    for (let page = 1; page <= total; page += 1) {
      const p = await svc(app, 'GET', '/api/service/audit', { query: { limit: '1', page: String(page) } });
      assert.equal(p.body.entries.length, 1);
      seen.push(p.body.entries[0].id);
    }
    assert.deepEqual(seen, entries.map((e) => e.id));
    assert.equal(
      (await svc(app, 'GET', '/api/service/audit', { query: { limit: '5000' } })).body.entries.length,
      total
    );

    void ctx;
  } finally {
    close();
  }
});

test('auditoria e clientes não vazam segredo, hash, token, e-mail de login falho nem user agent', async () => {
  const { app, ctx, close } = await setup();
  try {
    const ana = await createClient(app, { name: 'Ana Souza', email: 'ana.real@alfa.com' });
    const reqId = await newRequest(app, ana.token);

    /* Login falho com e-mail digitado (existente e inexistente), com user agent enorme. */
    const digitado = 'digitado.errado@vazamento.example';
    const longUa = `Mozilla/5.0 ${'X'.repeat(500)}`;
    await request(app, 'POST', '/api/auth/login', {
      body: { email: digitado, password: 'SenhaErrada123' },
      headers: { 'user-agent': longUa },
    });
    await request(app, 'POST', '/api/auth/login', {
      body: { email: 'ana.real@alfa.com', password: 'SenhaErrada123' },
      headers: { 'user-agent': longUa },
    });
    /* Eventos com details sensíveis plantados diretamente. */
    await ctx.audit.log({
      userId: Number(ana.id),
      action: 'TESTE',
      resourceType: 'auth',
      details: {
        title: 'ok',
        password: 'senha-secreta-1',
        password_hash: 'scrypt$hash$vazado',
        token: 'tok-vazado-123',
        cliente: 'cliente@vazou.com',
        email: 'email@vazou.com',
        ref: 'refopaca',
        actorId: '9',
      },
      ip: '203.0.113.5',
      userAgent: 'UA-COMPLETO-DO-NAVEGADOR',
    });
    await svc(app, 'POST', `/api/service/requests/${reqId}/status`, { body: { status: 'EM_ANALISE', ...ACTOR } });

    const audit = JSON.stringify((await svc(app, 'GET', '/api/service/audit')).body);
    const clients = JSON.stringify((await svc(app, 'GET', '/api/service/clients')).body);
    const detail = JSON.stringify((await svc(app, 'GET', `/api/service/clients/${ana.id}`)).body);
    const teste = (await svc(app, 'GET', '/api/service/audit', { query: { action: 'TESTE' } })).body.entries[0];
    assert.equal(teste.summary, 'Título: ok');
    assert.equal(teste.ip, '203.0.113.5');

    const hashDoCliente = (await ctx.users.findByEmailWithHash('ana.real@alfa.com')).password_hash;
    for (const [nome, corpo] of [['audit', audit], ['clients', clients], ['detail', detail]]) {
      for (const proibido of [
        'password_hash', 'passwordHash', 'password', 'token', 'scrypt$', hashDoCliente,
        'senha-secreta-1', 'tok-vazado-123', 'vazou.com', digitado, 'vazamento.example',
        'refopaca', 'user_agent', 'userAgent', 'UA-COMPLETO', 'Mozilla', 'details',
        'SenhaErrada123', 'session', 'sessao',
      ]) {
        assert.ok(!corpo.includes(proibido), `${nome} vazou "${proibido}"`);
      }
    }
    /* O e-mail do próprio cliente só sai em /clients (contrato), nunca na auditoria. */
    assert.ok(!audit.includes('ana.real@alfa.com'));
    assert.ok(clients.includes('ana.real@alfa.com'));
    /* Busca não vira oráculo de campos escondidos. */
    for (const q of ['vazou.com', 'tok-vazado', 'refopaca', 'digitado.errado']) {
      assert.equal((await svc(app, 'GET', '/api/service/audit', { query: { q } })).body.entries.length, 0, q);
    }
  } finally {
    close();
  }
});

test('mensagem enviada pelo Panel aparece na auditoria com o nome do admin, sem o texto', async () => {
  const { app, close } = await setup();
  try {
    const ana = await createClient(app);
    const reqId = await newRequest(app, ana.token);
    const send = await svc(app, 'POST', `/api/service/conversations/${reqId}/messages`, {
      body: { body: 'texto confidencial da resposta', adminId: '3', adminName: 'Kaique' },
    });
    assert.equal(send.status, 201);
    const r = await svc(app, 'GET', '/api/service/audit', { query: { action: 'MENSAGEM_PANEL_ENVIADA' } });
    assert.equal(r.body.entries.length, 1);
    assert.equal(r.body.entries[0].actorName, 'Kaique');
    assert.ok(!JSON.stringify(r.body).includes('confidencial'));
  } finally {
    close();
  }
});
