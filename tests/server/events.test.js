/* =========================================================================
   Tempo real do chat (SSE) e aviso por e-mail ao cliente.
   ========================================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createTestApp, createAdmin, createClient, extractSessionToken, request } from './helpers.js';
import { isEventStreamRequest, serveEventStream } from '../../server/http/sse.js';
import { SECURITY } from '../../server/config.js';
import {
  buildEmail,
  firstName,
  messageNotifyService,
  safePublicOrigin,
  NOTIFY_SUBJECT,
} from '../../server/services/messageNotify.js';

const KEY = 'chave-de-servico-do-panel-0123456789abcdef';
const SITE = 'https://todai.example';

const cookie = (token) => ({ cookie: `${SECURITY.SESSION_COOKIE}=${encodeURIComponent(token)}` });

/** Abre o stream pela API e devolve o que chegou (texto) e como fechar. */
async function abrir(app, token, headers = {}) {
  const r = await app.openEventStream({ headers: { ...cookie(token), ...headers } });
  if (!r.stream) return { r, texto: () => '' };
  let texto = '';
  let fechado = false;
  const detach = r.stream({
    write: (t) => {
      texto += t;
      return true;
    },
    end: () => {
      fechado = true;
    },
  });
  return { r, texto: () => texto, fechado: () => fechado, detach };
}

async function novaSolicitacao(app, cliente) {
  const sol = await request(app, 'POST', '/api/me/requests', {
    token: cliente.token,
    body: { type: 'Site', description: 'Preciso de um site institucional novo.' },
  });
  return sol.body.request.id;
}

const doPanel = (app, id, body = 'Resposta da equipe') =>
  request(app, 'POST', `/api/service/conversations/${id}/messages`, {
    headers: { 'x-service-key': KEY },
    body: { body, adminId: '3', adminName: 'Kaique' },
  });

/* ------------------------------------------------------------------- SSE */

test('SSE: sem sessão 401; com sessão 200 e cabeçalhos sem buffering', async () => {
  const { app, close } = await createTestApp();
  try {
    const sem = await app.openEventStream({ headers: {} });
    assert.equal(sem.status, 401);
    assert.equal(sem.stream, undefined);

    const c = await createClient(app);
    const { r, texto } = await abrir(app, c.token);
    assert.equal(r.status, 200);
    assert.match(r.headers['Content-Type'], /^text\/event-stream/);
    assert.equal(r.headers['X-Accel-Buffering'], 'no');
    assert.match(r.headers['Cache-Control'], /no-cache/);
    assert.match(texto(), /event: ready/);
  } finally {
    app.events.closeAll();
    close();
  }
});

test('SSE: origem de outro site é recusada (403)', async () => {
  const { app, close } = await createTestApp({ allowedOrigins: [SITE] });
  try {
    const email = 'origem@teste.com';
    const o = { origin: SITE };
    await request(app, 'POST', '/api/auth/register', {
      headers: o,
      body: { name: 'Cliente Teste', email, phone: '12999999999', password: 'SenhaForte123' },
    });
    const login = await request(app, 'POST', '/api/auth/login', { headers: o, body: { email, password: 'SenhaForte123' } });
    const c = { token: extractSessionToken(login) };
    const ok = await app.openEventStream({ headers: { ...cookie(c.token), origin: SITE } });
    assert.equal(ok.status, 200);
    const r = await app.openEventStream({ headers: { ...cookie(c.token), origin: 'https://evil.example' } });
    assert.equal(r.status, 403);
  } finally {
    close();
  }
});

test('SSE: o dono recebe a mensagem do Panel e da equipe; outro cliente NÃO recebe nada', async () => {
  const { app, ctx, close } = await createTestApp({ serviceKey: KEY });
  try {
    const dono = await createClient(app);
    const outro = await createClient(app);
    const admin = await createAdmin(ctx, app);
    const id = await novaSolicitacao(app, dono);

    const sDono = await abrir(app, dono.token);
    const sOutro = await abrir(app, outro.token);
    const sAdmin = await abrir(app, admin.token);

    const p = await doPanel(app, id);
    assert.equal(p.status, 201);
    const a = await request(app, 'POST', `/api/requests/${id}/messages`, {
      token: admin.token,
      body: { body: 'Resposta do admin do site' },
    });
    assert.equal(a.status, 201);

    const eventos = [...sDono.texto().matchAll(/event: message\ndata: (.*)\n/g)].map((m) => JSON.parse(m[1]));
    assert.deepEqual(
      eventos.map((e) => e.requestId),
      [id, id]
    );
    assert.equal(eventos[1].id, a.body.message.id);
    /* Nenhum texto de mensagem viaja no evento. */
    assert.ok(!sDono.texto().includes('Resposta'));
    assert.ok(!sOutro.texto().includes('event: message'));
    assert.ok(!sAdmin.texto().includes('event: message'));
  } finally {
    app.events.closeAll();
    close();
  }
});

test('SSE: mensagem do cliente chega às outras abas dele; leitura gera `read`', async () => {
  const { app, close } = await createTestApp({ serviceKey: KEY });
  try {
    const c = await createClient(app);
    const id = await novaSolicitacao(app, c);
    const aba2 = await abrir(app, c.token);

    await request(app, 'POST', `/api/requests/${id}/messages`, { token: c.token, body: { body: 'oi' } });
    assert.match(aba2.texto(), /event: message/);

    await doPanel(app, id);
    const antes = aba2.texto();
    /* Cliente lê (marca a do Panel como lida) → `read` by client. */
    await request(app, 'GET', `/api/requests/${id}/messages`, { token: c.token });
    assert.match(aba2.texto().slice(antes.length), /event: read\ndata: \{"requestId":\d+,"by":"client"\}/);

    /* Panel marca as do cliente como lidas → `read` by team. */
    const depois = aba2.texto();
    await request(app, 'POST', `/api/service/conversations/${id}/read`, { headers: { 'x-service-key': KEY } });
    assert.match(aba2.texto().slice(depois.length), /"by":"team"/);
  } finally {
    app.events.closeAll();
    close();
  }
});

test('SSE: no máximo 3 conexões por usuário (429) e limite global; fechar libera vaga', async () => {
  const { app, close } = await createTestApp({ eventsOptions: { maxGlobal: 3 } });
  try {
    const c = await createClient(app);
    const abertas = [await abrir(app, c.token), await abrir(app, c.token), await abrir(app, c.token)];
    assert.ok(abertas.every((a) => a.r.status === 200));
    const quarta = await abrir(app, c.token);
    assert.equal(quarta.r.status, 429);

    abertas[0].detach();
    assert.equal((await abrir(app, c.token)).r.status, 200);

    /* Global (3): 2 restantes + 1 nova = 3; outro usuário também é recusado. */
    const d = await createClient(app);
    assert.equal((await abrir(app, d.token)).r.status, 429);
  } finally {
    app.events.closeAll();
    close();
  }
});

test('SSE: logout fecha a conexão; heartbeat manda ping e fecha sessão vencida', async () => {
  const { app, db, close } = await createTestApp({ eventsOptions: { heartbeatMs: 10_000 } });
  try {
    const c = await createClient(app);
    const s = await abrir(app, c.token);
    await app.events._beat();
    assert.match(s.texto(), /: ping/);

    await request(app, 'POST', '/api/auth/logout', { token: c.token });
    assert.equal(s.fechado(), true);
    assert.equal(app.events.stats().total, 0);

    /* Sessão que vence sem logout: a batida percebe e encerra. */
    const d = await createClient(app);
    const s2 = await abrir(app, d.token);
    await db.execute('UPDATE sessions SET expires_at = ?', [Date.now() - 1000]);
    await app.events._beat();
    assert.equal(s2.fechado(), true);
    assert.equal(app.events.stats().total, 0);
  } finally {
    app.events.closeAll();
    close();
  }
});

test('SSE: heartbeat periódico dispara sozinho (timer) e some quando não há conexões', async () => {
  const { app, close } = await createTestApp({ eventsOptions: { heartbeatMs: 20 } });
  try {
    const c = await createClient(app);
    const s = await abrir(app, c.token);
    await new Promise((r) => setTimeout(r, 120));
    assert.ok((s.texto().match(/: ping/g) ?? []).length >= 2);
    s.detach();
  } finally {
    close();
  }
});

test('SSE por HTTP real: stream chega pelo socket e a desconexão libera a vaga', async () => {
  const { app, close } = await createTestApp({ serviceKey: KEY });
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (isEventStreamRequest(req, url.pathname)) return serveEventStream(app, req, res, { 'X-Geral': '1' });
    res.writeHead(404).end();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  try {
    const c = await createClient(app);
    const id = await novaSolicitacao(app, c);
    const ctl = new AbortController();
    const resp = await fetch(`http://127.0.0.1:${port}/api/events`, { headers: cookie(c.token), signal: ctl.signal });
    assert.equal(resp.status, 200);
    assert.equal(resp.headers.get('x-accel-buffering'), 'no');
    assert.equal(resp.headers.get('x-geral'), '1');
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let acc = '';
    const ler = async (regex) => {
      while (!regex.test(acc)) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += dec.decode(value);
      }
    };
    await ler(/event: ready/);
    await doPanel(app, id);
    await ler(/event: message/);
    assert.match(acc, /"requestId":\d+/);

    ctl.abort();
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(app.events.stats().total, 0);

    const sem = await fetch(`http://127.0.0.1:${port}/api/events`);
    assert.equal(sem.status, 401);
  } finally {
    app.events.closeAll();
    server.close();
    close();
  }
});

/* ---------------------------------------------------------------- e-mail */

function mailerFake({ live = true, falha = false } = {}) {
  const enviados = [];
  return {
    live,
    enviados,
    async send(msg) {
      if (falha) throw new Error('Resend respondeu 500');
      enviados.push(msg);
    },
  };
}

const espera = () => new Promise((r) => setTimeout(r, 30));

test('e-mail: resposta do Panel avisa UMA vez por rajada, sem o texto da mensagem', async () => {
  const mailer = mailerFake();
  const { app, close } = await createTestApp({ serviceKey: KEY, mailer, notifyOptions: { siteUrl: SITE } });
  try {
    const c = await createClient(app, { name: 'Ana Souza', email: 'ana@teste.com' });
    const id = await novaSolicitacao(app, c);

    await doPanel(app, id, 'Segredo: senha do servidor é 1234');
    await espera();
    await doPanel(app, id, 'Segunda resposta logo em seguida');
    await espera();

    assert.equal(mailer.enviados.length, 1);
    const m = mailer.enviados[0];
    assert.equal(m.to, 'ana@teste.com');
    assert.equal(m.subject, NOTIFY_SUBJECT);
    assert.equal(m.subject, 'Você recebeu uma resposta da TODAI');
    assert.ok(m.text.includes(`${SITE}/cliente/mensagens/${id}`));
    assert.ok(m.html.includes(`${SITE}/cliente/mensagens/${id}`));
    assert.ok(m.text.includes('Para parar de receber estes avisos, desligue em Conta > Segurança'));
    assert.ok(!m.text.includes('Segredo') && !m.html.includes('Segredo') && !m.text.includes('senha'));

    /* Cliente lê tudo: a próxima resposta volta a avisar. */
    await request(app, 'GET', `/api/requests/${id}/messages`, { token: c.token });
    await doPanel(app, id, 'Nova depois de ler');
    await espera();
    assert.equal(mailer.enviados.length, 2);
  } finally {
    close();
  }
});

test('e-mail: respeita notify_email=0 (toggle PATCH /api/me/notifications) e mensagem do cliente não avisa', async () => {
  const mailer = mailerFake();
  const { app, close } = await createTestApp({ serviceKey: KEY, mailer, notifyOptions: { siteUrl: SITE } });
  try {
    const c = await createClient(app);
    const id = await novaSolicitacao(app, c);

    const g = await request(app, 'GET', '/api/me/notifications', { token: c.token });
    assert.deepEqual(g.body, { notifyEmail: true }); // padrão ligado

    await request(app, 'POST', `/api/requests/${id}/messages`, { token: c.token, body: { body: 'oi' } });
    await espera();
    assert.equal(mailer.enviados.length, 0);

    const off = await request(app, 'PATCH', '/api/me/notifications', { token: c.token, body: { notifyEmail: false } });
    assert.equal(off.status, 200);
    assert.deepEqual((await request(app, 'GET', '/api/me/notifications', { token: c.token })).body, { notifyEmail: false });
    await doPanel(app, id);
    await espera();
    assert.equal(mailer.enviados.length, 0);

    await request(app, 'PATCH', '/api/me/notifications', { token: c.token, body: { notifyEmail: true } });
    await request(app, 'GET', `/api/requests/${id}/messages`, { token: c.token });
    await doPanel(app, id);
    await espera();
    assert.equal(mailer.enviados.length, 1);
  } finally {
    close();
  }
});

test('toggle: exige sessão e valida estritamente o corpo', async () => {
  const { app, close } = await createTestApp();
  try {
    assert.equal((await request(app, 'PATCH', '/api/me/notifications', { body: { notifyEmail: false } })).status, 401);
    assert.equal((await request(app, 'GET', '/api/me/notifications')).status, 401);
    const c = await createClient(app);
    for (const body of [{}, { notifyEmail: 'false' }, { notifyEmail: 0 }, { notifyEmail: null }, { notifyEmail: true, role: 'ADMIN' }, { x: 1 }]) {
      const r = await request(app, 'PATCH', '/api/me/notifications', { token: c.token, body });
      assert.equal(r.status, 400, JSON.stringify(body));
    }
    assert.deepEqual((await request(app, 'GET', '/api/me/notifications', { token: c.token })).body, { notifyEmail: true });
  } finally {
    close();
  }
});

test('e-mail: falha do provedor não afeta a mensagem; sem RESEND só registra uma vez', async () => {
  const falho = mailerFake({ falha: true });
  const logs = [];
  const a = await createTestApp({
    serviceKey: KEY,
    mailer: falho,
    notifyOptions: { siteUrl: SITE, logError: (t) => logs.push(t) },
  });
  try {
    const c = await createClient(a.app);
    const id = await novaSolicitacao(a.app, c);
    const r = await doPanel(a.app, id);
    assert.equal(r.status, 201);
    await espera();
    assert.equal(logs.length, 1);
    assert.ok(!logs[0].includes(c.user.email));
  } finally {
    a.close();
  }

  const off = mailerFake({ live: false });
  const logs2 = [];
  const b = await createTestApp({
    serviceKey: KEY,
    mailer: off,
    notifyOptions: { siteUrl: SITE, log: (t) => logs2.push(t) },
  });
  try {
    const c = await createClient(b.app);
    const id = await novaSolicitacao(b.app, c);
    assert.equal((await doPanel(b.app, id)).status, 201);
    assert.equal((await doPanel(b.app, id)).status, 201);
    await espera();
    assert.equal(off.enviados.length, 0);
    assert.equal(logs2.length, 1);
    assert.match(logs2[0], /e-mail desligado/);
  } finally {
    b.close();
  }
});

test('e-mail: o aviso não atrasa a mensagem (envio lento roda em segundo plano)', async () => {
  let liberar;
  const lento = { live: true, send: () => new Promise((r) => (liberar = r)) };
  const { app, close } = await createTestApp({ serviceKey: KEY, mailer: lento, notifyOptions: { siteUrl: SITE } });
  try {
    const c = await createClient(app);
    const id = await novaSolicitacao(app, c);
    const t0 = Date.now();
    const r = await doPanel(app, id);
    assert.equal(r.status, 201);
    assert.ok(Date.now() - t0 < 1000);
    await espera();
    liberar?.();
  } finally {
    close();
  }
});

test('e-mail: sem SITE_PUBLIC_URL https/permitido não envia; helpers', async () => {
  assert.equal(safePublicOrigin('http://todai.example'), null);
  assert.equal(safePublicOrigin(''), null);
  assert.equal(safePublicOrigin(undefined), null);
  assert.equal(safePublicOrigin('javascript:alert(1)'), null);
  assert.equal(safePublicOrigin('https://user:pw@todai.example'), null);
  assert.equal(safePublicOrigin('https://evil.example', [SITE]), null);
  assert.equal(safePublicOrigin('https://todai.example/qualquer/coisa', [SITE]), SITE);

  const mailer = mailerFake();
  const { app, close } = await createTestApp({ serviceKey: KEY, mailer, notifyOptions: { siteUrl: 'http://inseguro.example', log: () => {} } });
  try {
    const c = await createClient(app);
    const id = await novaSolicitacao(app, c);
    await doPanel(app, id);
    await espera();
    assert.equal(mailer.enviados.length, 0);
  } finally {
    close();
  }

  /* Nome vira só o primeiro nome, escapado no HTML. */
  assert.equal(firstName('  Ana   Souza '), 'Ana');
  assert.equal(firstName('<script>x</script> Y'), 'script');
  const { html, text } = buildEmail({ name: '"><img src=x onerror=1>', link: `${SITE}/cliente/mensagens/1` });
  assert.ok(!html.includes('<img'));
  assert.ok(!text.includes('<'));
});

test('e-mail: janela de 15 min usa o relógio (mensagem antiga não bloqueia)', async () => {
  const mailer = mailerFake();
  let agora = Date.now();
  const { app, ctx, close } = await createTestApp({ serviceKey: KEY });
  try {
    const c = await createClient(app);
    const id = await novaSolicitacao(app, c);
    const svc = messageNotifyService(ctx, { mailer, siteUrl: SITE, now: () => agora });

    const sistema = await ctx.db.queryOne("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1");
    const m1 = await ctx.messages.create({ requestId: id, authorId: sistema.id, body: 'a' });
    assert.equal(await svc.notifyTeamMessage({ requestId: id, messageId: m1, ownerId: c.id }), 'sent');
    const m2 = await ctx.messages.create({ requestId: id, authorId: sistema.id, body: 'b' });
    assert.equal(await svc.notifyTeamMessage({ requestId: id, messageId: m2, ownerId: c.id }), 'recent');

    agora += 16 * 60 * 1000; // passou a janela
    const m3 = await ctx.messages.create({ requestId: id, authorId: sistema.id, body: 'c' });
    await ctx.db.execute('UPDATE messages SET created_at = ? WHERE id IN (?, ?)', [Date.now() - 20 * 60 * 1000, m1, m2]);
    assert.equal(await svc.notifyTeamMessage({ requestId: id, messageId: m3, ownerId: c.id }), 'sent');
  } finally {
    close();
  }
});
