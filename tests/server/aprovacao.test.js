/* =========================================================================
   Aprovação de cliente novo: cadastro PENDENTE, login bloqueado, decisão do
   admin pelo Panel (/api/service/clients/:id/approve|reject), sessões,
   e-mails ao cliente e aviso ao admin pela API.
   ========================================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { activateClient, createTestApp, createClient, extractSessionToken, request } from './helpers.js';
import { aplicarMigracoesSqlite } from '../../server/db/sqlite.js';
import { registrationAlertService } from '../../server/services/registrationAlert.js';
import { AUDIT_ACTIONS } from '../../server/config.js';

const KEY = 'chave-de-servico-do-panel-0123456789abcdef';
const ACTOR = { actorId: '3', actorName: 'Kaique' };
const SENHA = 'SenhaForte123';

const svc = (app, method, path, { key = KEY, body, query } = {}) =>
  request(app, method, path, { body, query, headers: key ? { 'x-service-key': key } : {} });

function fakeMailer({ configured = true, fail = false } = {}) {
  const sent = [];
  return {
    sent,
    configured,
    live: configured,
    async send(mail) {
      if (fail) throw new Error('smtp fora');
      sent.push(mail);
    },
  };
}

const setup = (options = {}) => createTestApp({ serviceKey: KEY, ...options });

async function cadastrar(app, email = 'nova@teste.com', extra = {}) {
  const r = await request(app, 'POST', '/api/auth/register', {
    body: { name: 'Nova Cliente', company: 'Loja Nova', email, phone: '12999990000', password: SENHA, ...extra },
  });
  return r;
}

const login = (app, email, password = SENHA) =>
  request(app, 'POST', '/api/auth/login', { body: { email, password } });

test('cadastro fica PENDENTE, não cria sessão nem cookie e responde 201 {status}', async () => {
  const { app, ctx, close } = await setup();
  try {
    const r = await cadastrar(app);
    assert.equal(r.status, 201);
    assert.equal(r.body.status, 'PENDING');
    assert.match(r.body.message, /Recebemos seu cadastro/);
    assert.equal(r.body.user, undefined);
    assert.equal(r.headers['Set-Cookie'], undefined);
    const row = await ctx.users.findByEmailWithHash('nova@teste.com');
    assert.equal(row.status, 'PENDING');
    assert.equal(row.role, 'CLIENT');
    assert.equal((await ctx.db.query('SELECT id FROM sessions')).length, 0);
  } finally {
    close();
  }
});

test('login: pendente 403 CONTA_PENDENTE, recusado 403 CONTA_RECUSADA, sem sessão e sem contar falha', async () => {
  const { app, ctx, close } = await setup();
  try {
    await cadastrar(app);
    const pend = await login(app, 'nova@teste.com');
    assert.equal(pend.status, 403);
    assert.equal(pend.body.error, 'CONTA_PENDENTE');
    assert.equal(pend.body.message, 'Seu cadastro está aguardando autorização.');
    assert.equal(pend.headers['Set-Cookie'], undefined);
    assert.equal(await ctx.loginAttempts.countRecent('nova@teste.com'), 0);

    /* Senha errada continua 401 genérico, igual a e-mail inexistente. */
    const errada = await login(app, 'nova@teste.com', 'SenhaErrada123');
    const inexistente = await login(app, 'ninguem@teste.com', 'SenhaErrada123');
    assert.equal(errada.status, 401);
    assert.equal(errada.body.error, inexistente.body.error);

    const id = (await ctx.users.findByEmailWithHash('nova@teste.com')).id;
    const rej = await svc(app, 'POST', `/api/service/clients/${id}/reject`, { body: ACTOR });
    assert.equal(rej.status, 200);
    const recusada = await login(app, 'nova@teste.com');
    assert.equal(recusada.status, 403);
    assert.equal(recusada.body.error, 'CONTA_RECUSADA');
    assert.ok(!/motivo|reason/i.test(recusada.body.message));
    assert.equal((await ctx.db.query('SELECT id FROM sessions')).length, 0);

    /* Recadastro com e-mail recusado: 409 genérico. */
    assert.equal((await cadastrar(app)).status, 409);
  } finally {
    close();
  }
});

test('autorizar libera o login; cliente ativo entra normalmente', async () => {
  const { app, ctx, close } = await setup({ mailer: fakeMailer() });
  try {
    await cadastrar(app);
    const id = (await ctx.users.findByEmailWithHash('nova@teste.com')).id;
    const ok = await svc(app, 'POST', `/api/service/clients/${id}/approve`, { body: ACTOR });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.client.status, 'ACTIVE');
    assert.equal(ok.body.client.id, String(id));
    assert.ok(ok.body.client.decidedAt);
    assert.equal(ok.body.emailSent, true);

    const l = await login(app, 'nova@teste.com');
    assert.equal(l.status, 200);
    const me = await request(app, 'GET', '/api/auth/me', { token: extractSessionToken(l) });
    assert.equal(me.status, 200);
  } finally {
    close();
  }
});

test('recusar derruba as sessões abertas; REJECTED pode ser autorizado depois', async () => {
  const { app, ctx, close } = await setup();
  try {
    const c = await createClient(app);
    assert.equal((await request(app, 'GET', '/api/auth/me', { token: c.token })).status, 200);
    /* Cliente ATIVO não pode ser recusado (transição inexistente). */
    const bloqueado = await svc(app, 'POST', `/api/service/clients/${c.id}/reject`, { body: ACTOR });
    assert.equal(bloqueado.status, 409);

    /* Sessão de quem foi recusado depois de logar: força o estado e confere a sessão. */
    await ctx.db.execute("UPDATE users SET status = 'PENDING' WHERE id = ?", [c.id]);
    assert.equal((await request(app, 'GET', '/api/auth/me', { token: c.token })).status, 401);

    await ctx.db.execute("UPDATE users SET status = 'ACTIVE' WHERE id = ?", [c.id]);
    const c2 = await login(app, c.user.email);
    const t2 = extractSessionToken(c2);
    await ctx.db.execute("UPDATE users SET status = 'PENDING' WHERE id = ?", [c.id]);
    const rej = await svc(app, 'POST', `/api/service/clients/${c.id}/reject`, { body: ACTOR });
    assert.equal(rej.status, 200);
    assert.equal((await ctx.db.query('SELECT id FROM sessions WHERE user_id = ?', [c.id])).length, 0);
    assert.equal((await request(app, 'GET', '/api/auth/me', { token: t2 })).status, 401);

    const re = await svc(app, 'POST', `/api/service/clients/${c.id}/approve`, { body: ACTOR });
    assert.equal(re.status, 200);
    assert.equal((await login(app, c.user.email)).status, 200);
  } finally {
    close();
  }
});

test('decisão repetida é idempotente: 200, sem novo e-mail nem nova auditoria', async () => {
  const mailer = fakeMailer();
  const { app, ctx, close } = await setup({ mailer });
  try {
    await cadastrar(app);
    const id = (await ctx.users.findByEmailWithHash('nova@teste.com')).id;
    const a = await svc(app, 'POST', `/api/service/clients/${id}/approve`, { body: ACTOR });
    const b = await svc(app, 'POST', `/api/service/clients/${id}/approve`, { body: ACTOR });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(b.body.client.status, 'ACTIVE');
    assert.equal(mailer.sent.length, 1);
    const n = await ctx.db.queryOne('SELECT COUNT(*) AS n FROM audit_logs WHERE action = ?', [AUDIT_ACTIONS.CLIENT_APPROVED]);
    assert.equal(Number(n.n), 1);
  } finally {
    close();
  }
});

test('decisões simultâneas: só uma transição acontece (UPDATE condicional)', async () => {
  const mailer = fakeMailer();
  const { app, ctx, close } = await setup({ mailer });
  try {
    await cadastrar(app);
    const id = (await ctx.users.findByEmailWithHash('nova@teste.com')).id;
    const r = await Promise.all([
      svc(app, 'POST', `/api/service/clients/${id}/approve`, { body: ACTOR }),
      svc(app, 'POST', `/api/service/clients/${id}/approve`, { body: ACTOR }),
    ]);
    assert.deepEqual(r.map((x) => x.status), [200, 200]);
    assert.equal(mailer.sent.length, 1);
  } finally {
    close();
  }
});

test('e-mails ao cliente: textos certos, sem senha; falha do e-mail não desfaz a decisão', async () => {
  const mailer = fakeMailer();
  const { app, ctx, close } = await setup({ mailer });
  try {
    await cadastrar(app, 'um@teste.com');
    await cadastrar(app, 'dois@teste.com');
    const um = (await ctx.users.findByEmailWithHash('um@teste.com')).id;
    const dois = (await ctx.users.findByEmailWithHash('dois@teste.com')).id;

    await svc(app, 'POST', `/api/service/clients/${um}/approve`, { body: ACTOR });
    assert.equal(mailer.sent[0].to, 'um@teste.com');
    assert.equal(mailer.sent[0].subject, 'Sua conta TODAI foi autorizada');
    assert.ok(!mailer.sent[0].text.includes(SENHA));

    await svc(app, 'POST', `/api/service/clients/${dois}/reject`, { body: { ...ACTOR, reason: 'Fora do perfil' } });
    assert.equal(mailer.sent[1].subject, 'Sobre seu cadastro na TODAI');
    assert.ok(!mailer.sent[1].text.includes('Fora do perfil'), 'o motivo não vai ao cliente');
  } finally {
    close();
  }

  const quebrado = await setup({ mailer: fakeMailer({ fail: true }) });
  try {
    await cadastrar(quebrado.app);
    const id = (await quebrado.ctx.users.findByEmailWithHash('nova@teste.com')).id;
    const r = await svc(quebrado.app, 'POST', `/api/service/clients/${id}/approve`, { body: ACTOR });
    assert.equal(r.status, 200);
    assert.equal(r.body.emailSent, false);
    assert.equal(r.body.client.status, 'ACTIVE');
  } finally {
    quebrado.close();
  }

  const semEmail = await setup({ mailer: fakeMailer({ configured: false }) });
  try {
    await cadastrar(semEmail.app);
    const id = (await semEmail.ctx.users.findByEmailWithHash('nova@teste.com')).id;
    const r = await svc(semEmail.app, 'POST', `/api/service/clients/${id}/approve`, { body: ACTOR });
    assert.equal(r.body.emailSent, false);
  } finally {
    semEmail.close();
  }
});

test('auditoria: CLIENTE_AUTORIZADO/RECUSADO com ator, de/para, sem e-mail do cliente', async () => {
  const { app, ctx, close } = await setup();
  try {
    await cadastrar(app, 'secreto@teste.com');
    await cadastrar(app, 'outro@teste.com');
    const a = (await ctx.users.findByEmailWithHash('secreto@teste.com')).id;
    const b = (await ctx.users.findByEmailWithHash('outro@teste.com')).id;
    await svc(app, 'POST', `/api/service/clients/${a}/approve`, { body: ACTOR });
    await svc(app, 'POST', `/api/service/clients/${b}/reject`, { body: { ...ACTOR, reason: 'Sem perfil' } });

    const audit = await svc(app, 'GET', '/api/service/audit', { query: { action: 'CLIENTE_AUTORIZADO' } });
    assert.equal(audit.body.entries.length, 1);
    const e = audit.body.entries[0];
    assert.equal(e.actorName, 'Kaique');
    assert.equal(e.resourceId, String(a));
    assert.match(e.summary, /De: PENDING/);
    assert.match(e.summary, /Para: ACTIVE/);

    const rec = await svc(app, 'GET', '/api/service/audit', { query: { action: 'CLIENTE_RECUSADO' } });
    assert.match(rec.body.entries[0].summary, /Motivo: Sem perfil/);
    assert.ok(!JSON.stringify([audit.body, rec.body]).includes('teste.com'));
  } finally {
    close();
  }
});

test('serviço: filtro de status (padrão active), pending-count, ficha de pendente, 404 e validação', async () => {
  const { app, ctx, close } = await setup();
  try {
    const ativo = await createClient(app, { name: 'Ativo', email: 'ativo@teste.com' });
    await cadastrar(app, 'p1@teste.com');
    await cadastrar(app, 'p2@teste.com');
    const p2 = (await ctx.users.findByEmailWithHash('p2@teste.com')).id;
    await svc(app, 'POST', `/api/service/clients/${p2}/reject`, { body: ACTOR });

    const names = async (status) =>
      (await svc(app, 'GET', '/api/service/clients', { query: status ? { status } : {} })).body.clients.map((c) => c.email).sort();
    assert.deepEqual(await names(), ['ativo@teste.com']);
    assert.deepEqual(await names('active'), ['ativo@teste.com']);
    assert.deepEqual(await names('pending'), ['p1@teste.com']);
    assert.deepEqual(await names('rejected'), ['p2@teste.com']);
    assert.equal((await names('all')).length, 3);
    assert.equal((await svc(app, 'GET', '/api/service/clients', { query: { status: 'xx' } })).status, 400);

    const cnt = await svc(app, 'GET', '/api/service/clients/pending-count');
    assert.equal(cnt.status, 200);
    assert.deepEqual(cnt.body, { pending: 1 });

    const p1 = (await ctx.users.findByEmailWithHash('p1@teste.com')).id;
    const ficha = await svc(app, 'GET', `/api/service/clients/${p1}`);
    assert.equal(ficha.status, 200);
    assert.equal(ficha.body.client.status, 'PENDING');

    /* Só CLIENT: admin e id inexistente dão 404. */
    const admin = await ctx.users.create({
      name: 'Adm', company: null, email: 'adm@x.com', phone: null, passwordHash: 'x', role: 'ADMIN',
    });
    assert.equal((await svc(app, 'POST', `/api/service/clients/${admin}/approve`, { body: ACTOR })).status, 404);
    assert.equal((await svc(app, 'POST', '/api/service/clients/99999/reject', { body: ACTOR })).status, 404);
    assert.equal((await svc(app, 'POST', `/api/service/clients/${p1}/approve`, { body: {} })).status, 400);
    assert.equal((await svc(app, 'POST', `/api/service/clients/${p1}/reject`, { body: { ...ACTOR, reason: 'x'.repeat(301) } })).status, 400);
    assert.equal(ativo.id !== undefined, true);
  } finally {
    close();
  }
});

test('serviço: approve, reject e pending-count exigem a chave de serviço', async () => {
  const { app, close } = await setup();
  try {
    for (const [m, p] of [
      ['GET', '/api/service/clients/pending-count'],
      ['POST', '/api/service/clients/1/approve'],
      ['POST', '/api/service/clients/1/reject'],
    ]) {
      assert.equal((await svc(app, m, p, { key: null, body: ACTOR })).status, 401, p);
      assert.equal((await svc(app, m, p, { key: 'errada', body: ACTOR })).status, 401, p);
    }
    /* Sessão de cliente/admin do site não substitui a chave. */
    const c = await createClient(app);
    assert.equal((await request(app, 'POST', '/api/service/clients/1/approve', { token: c.token, body: ACTOR })).status, 401);
  } finally {
    close();
  }
});

test('contas antigas ficam ACTIVE na migração do SQLite (e a coluna é criada uma vez)', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, company TEXT,
    email TEXT NOT NULL UNIQUE, phone TEXT, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'CLIENT',
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`);
  db.prepare("INSERT INTO users (name,email,password_hash,created_at,updated_at) VALUES ('Velho','v@x.com','h',1,1)").run();
  aplicarMigracoesSqlite(db);
  aplicarMigracoesSqlite(db);
  const row = db.prepare("SELECT status, decided_at, decided_by, decision_note FROM users WHERE email='v@x.com'").get();
  assert.equal(row.status, 'ACTIVE');
  assert.equal(row.decided_at, null);
});

/* ------------------------------------------------------- aviso ao admin */

const LICENSING = { baseUrl: 'https://api.exemplo.test', serviceKey: 'chave-de-servico-de-teste', timeoutMs: 1000 };

test('aviso ao admin: chama a API com a chave e o DTO combinado, sem esperar', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, status: 202 };
  };
  const alert = registrationAlertService({ fetchImpl, licensing: LICENSING });
  const { app, ctx, close } = await setup({ registrationAlert: alert });
  try {
    const r = await cadastrar(app);
    assert.equal(r.status, 201);
    await alert.idle();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.exemplo.test/api/v1/site/client-registrations');
    assert.equal(calls[0].options.headers['X-Service-Key'], LICENSING.serviceKey);
    const body = JSON.parse(calls[0].options.body);
    const id = (await ctx.users.findByEmailWithHash('nova@teste.com')).id;
    assert.deepEqual(Object.keys(body).sort(), ['company', 'email', 'name', 'phone', 'requestedAt', 'siteUserId']);
    assert.equal(body.siteUserId, String(id));
    assert.equal(body.email, 'nova@teste.com');
    assert.ok(!JSON.stringify(body).includes(SENHA));
    assert.ok(!calls[0].options.body.includes('password'));
  } finally {
    close();
  }
});

test('aviso ao admin: API fora/lenta/erro não derruba o cadastro e audita CADASTRO_AVISO_ADMIN_FALHOU', async () => {
  for (const fetchImpl of [
    async () => ({ ok: false, status: 500 }),
    async () => {
      throw new Error('ECONNREFUSED');
    },
    (url, { signal }) =>
      new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('x'), { name: 'AbortError' })))),
  ]) {
    const alert = registrationAlertService({ fetchImpl, licensing: { ...LICENSING }, timeoutMs: 30 });
    const { app, ctx, close } = await setup({ registrationAlert: alert });
    try {
      const r = await cadastrar(app);
      assert.equal(r.status, 201);
      await alert.idle();
      const rows = await ctx.db.query('SELECT details FROM audit_logs WHERE action = ?', [AUDIT_ACTIONS.REGISTRATION_ALERT_FAILED]);
      assert.equal(rows.length, 1);
      assert.ok(!rows[0].details.includes('@'), 'sem e-mail na auditoria');
    } finally {
      close();
    }
  }
});

test('aviso ao admin: sem chave configurada o cadastro segue e nada é chamado', async () => {
  let called = false;
  const alert = registrationAlertService({
    fetchImpl: async () => {
      called = true;
      return { ok: true };
    },
    licensing: { baseUrl: '', serviceKey: '', timeoutMs: 1000 },
  });
  const { app, ctx, close } = await setup({ registrationAlert: alert });
  try {
    assert.equal((await cadastrar(app)).status, 201);
    await alert.idle();
    assert.equal(called, false);
    const n = await ctx.db.queryOne('SELECT COUNT(*) AS n FROM audit_logs WHERE action = ?', [AUDIT_ACTIONS.REGISTRATION_ALERT_FAILED]);
    assert.equal(Number(n.n), 0);
  } finally {
    close();
  }
});

test('activateClient do helper usa a mesma transição do serviço', async () => {
  const { app, close } = await setup();
  try {
    await cadastrar(app);
    assert.equal((await activateClient(app, 'nova@teste.com')).changed, true);
    assert.equal((await login(app, 'nova@teste.com')).status, 200);
  } finally {
    close();
  }
});
