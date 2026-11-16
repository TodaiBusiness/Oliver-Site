/* Troca de senha, sessões, inatividade, lockout por (e-mail + IP), purga,
   auditoria com IP/UA, cotas, CSRF, cadastro e configuração. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, createAdmin, createClient, request, extractSessionToken } from './helpers.js';
import { AUDIT_ACTIONS, LIMITS, SECURITY, assertProductionConfig } from '../../server/config.js';
import { isTrustedRequestOrigin, bodyLimitFor, createApp } from '../../server/app.js';
import { lockDuration } from '../../server/services/loginGuard.js';
import { passwordProblem } from '../../server/http/validation.js';

const loginAs = (app, email, password, extra = {}) =>
  request(app, 'POST', '/api/auth/login', { body: { email, password }, ...extra });

/* ---------------------------------------------------------- trocar senha */

test('trocar a senha exige a atual, aplica a regra de força e derruba as outras sessões', async () => {
  const { app, close } = await createTestApp();
  try {
    const { user, token } = await createClient(app);
    const outra = extractSessionToken(await loginAs(app, user.email, user.password));
    assert.ok(outra);

    const errada = await request(app, 'POST', '/api/auth/password', {
      token,
      body: { currentPassword: 'naoeassim123', newPassword: 'NovaSenha456' },
    });
    assert.equal(errada.status, 401);

    const fraca = await request(app, 'POST', '/api/auth/password', {
      token,
      body: { currentPassword: user.password, newPassword: 'curta' },
    });
    assert.equal(fraca.status, 400);
    assert.ok(fraca.body.details.newPassword);

    const igual = await request(app, 'POST', '/api/auth/password', {
      token,
      body: { currentPassword: user.password, newPassword: user.password },
    });
    assert.equal(igual.status, 400);

    const ok = await request(app, 'POST', '/api/auth/password', {
      token,
      body: { currentPassword: user.password, newPassword: 'NovaSenha456' },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.revokedSessions, 1);

    assert.equal((await request(app, 'GET', '/api/auth/me', { token })).status, 200, 'a atual continua');
    assert.equal((await request(app, 'GET', '/api/auth/me', { token: outra })).status, 401, 'a outra caiu');

    assert.equal((await loginAs(app, user.email, user.password)).status, 401);
    assert.equal((await loginAs(app, user.email, 'NovaSenha456')).status, 200);
  } finally {
    close();
  }
});

test('trocar a senha é auditado e senha atual errada conta no bloqueio', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const { user, token } = await createClient(app);
    await request(app, 'POST', '/api/auth/password', {
      token,
      body: { currentPassword: user.password, newPassword: 'NovaSenha456' },
    });
    const logs = await ctx.db.query('SELECT action, details FROM audit_logs WHERE action = ?', [AUDIT_ACTIONS.PASSWORD_CHANGED]);
    assert.equal(logs.length, 1);
    assert.ok(!JSON.stringify(logs).includes('NovaSenha456'));

    for (let i = 0; i < SECURITY.LOGIN_MAX_ATTEMPTS; i += 1) {
      await request(app, 'POST', '/api/auth/password', {
        token,
        body: { currentPassword: 'errada12345', newPassword: 'OutraSenha789' },
      });
    }
    const bloqueado = await request(app, 'POST', '/api/auth/password', {
      token,
      body: { currentPassword: 'NovaSenha456', newPassword: 'OutraSenha789' },
    });
    assert.ok([429].includes(bloqueado.status));
  } finally {
    close();
  }
});

test('exige login para trocar senha e gerir sessões', async () => {
  const { app, close } = await createTestApp();
  try {
    for (const [m, p] of [
      ['POST', '/api/auth/password'],
      ['GET', '/api/auth/sessions'],
      ['POST', '/api/auth/sessions/revoke-all'],
      ['DELETE', '/api/auth/sessions/abcdef0123456789'],
      ['GET', '/api/auth/2fa'],
    ]) {
      assert.equal((await request(app, m, p)).status, 401, `${m} ${p}`);
    }
  } finally {
    close();
  }
});

/* --------------------------------------------------------------- sessões */

test('lista as sessões, encerra uma e sai de todos os dispositivos', async () => {
  const { app, close } = await createTestApp();
  try {
    const { user, token } = await createClient(app);
    const outra = extractSessionToken(
      await loginAs(app, user.email, user.password, {
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36', 'x-forwarded-for': '203.0.113.9' },
      })
    );

    const lista = await request(app, 'GET', '/api/auth/sessions', { token });
    assert.equal(lista.body.sessions.length, 2);
    const atual = lista.body.sessions.find((s) => s.current);
    const remota = lista.body.sessions.find((s) => !s.current);
    assert.ok(atual);
    assert.equal(remota.device, 'Chrome em Windows');
    assert.equal(remota.ip, '203.0.113.9');
    assert.equal(remota.id.length, 16);
    assert.ok(!JSON.stringify(lista.body).includes(outra), 'o token nunca sai');

    const propria = await request(app, 'DELETE', `/api/auth/sessions/${atual.id}`, { token });
    assert.equal(propria.status, 400);

    assert.equal((await request(app, 'DELETE', '/api/auth/sessions/0000000000000000', { token })).status, 404);

    assert.equal((await request(app, 'DELETE', `/api/auth/sessions/${remota.id}`, { token })).status, 200);
    assert.equal((await request(app, 'GET', '/api/auth/me', { token: outra })).status, 401);

    const todas = await request(app, 'POST', '/api/auth/sessions/revoke-all', { token });
    assert.equal(todas.status, 200);
    assert.match(todas.headers['Set-Cookie'][0], /Max-Age=0/);
    assert.equal((await request(app, 'GET', '/api/auth/me', { token })).status, 401);
  } finally {
    close();
  }
});

test('não encerra sessão de outro usuário', async () => {
  const { app, close } = await createTestApp();
  try {
    const ana = await createClient(app);
    const bruno = await createClient(app);
    const dela = (await request(app, 'GET', '/api/auth/sessions', { token: ana.token })).body.sessions[0];
    const r = await request(app, 'DELETE', `/api/auth/sessions/${dela.id}`, { token: bruno.token });
    assert.equal(r.status, 404);
    assert.equal((await request(app, 'GET', '/api/auth/me', { token: ana.token })).status, 200);
  } finally {
    close();
  }
});

/* ----------------------------------------------------------- inatividade */

test('sessão parada além do limite do papel expira (cliente 30 min, admin 15 min)', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const cliente = await createClient(app);
    const admin = await createAdmin(ctx, app);
    const ago = (ms) => Date.now() - ms;

    /* 20 min parado: cliente segue, admin cai. */
    await ctx.db.execute('UPDATE sessions SET last_seen_at = ?', [ago(20 * 60_000)]);
    assert.equal((await request(app, 'GET', '/api/auth/me', { token: cliente.token })).status, 200);
    assert.equal((await request(app, 'GET', '/api/auth/me', { token: admin.token })).status, 401);

    /* 40 min parado: cliente também cai (e a sessão some do banco). */
    await ctx.db.execute('UPDATE sessions SET last_seen_at = ?', [ago(40 * 60_000)]);
    assert.equal((await request(app, 'GET', '/api/auth/me', { token: cliente.token })).status, 401);
    assert.equal((await ctx.db.query('SELECT 1 FROM sessions')).length, 0);
  } finally {
    close();
  }
});

test('usar a sessão renova o relógio da inatividade', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const cliente = await createClient(app);
    const antes = Date.now() - 10 * 60_000;
    await ctx.db.execute('UPDATE sessions SET last_seen_at = ?', [antes]);
    await request(app, 'GET', '/api/auth/me', { token: cliente.token });
    const row = await ctx.db.queryOne('SELECT last_seen_at FROM sessions');
    assert.ok(row.last_seen_at > antes + 9 * 60_000);
  } finally {
    close();
  }
});

/* ------------------------------------------------- bloqueio de login */

test('lockout é por (e-mail + IP): outro IP não é bloqueado pelo ataque', async () => {
  const { app, close } = await createTestApp();
  try {
    const { user } = await createClient(app);
    const atacante = { headers: { 'x-forwarded-for': '198.51.100.7' } };
    const dono = { headers: { 'x-forwarded-for': '203.0.113.20' } };

    for (let i = 0; i < SECURITY.LOGIN_MAX_ATTEMPTS; i += 1) {
      await loginAs(app, user.email, 'errada12345', atacante);
    }
    const barrado = await loginAs(app, user.email, 'errada12345', atacante);
    assert.equal(barrado.status, 429);
    assert.ok(Number(barrado.headers['Retry-After']) >= 1);
    assert.ok(barrado.body.retryAfterSeconds >= 1);

    assert.equal((await loginAs(app, user.email, user.password, dono)).status, 200, 'a vítima entra');
  } finally {
    close();
  }
});

test('a espera cresce a cada falha e tem teto', () => {
  assert.equal(lockDuration(SECURITY.LOGIN_MAX_ATTEMPTS - 1), 0);
  assert.equal(lockDuration(SECURITY.LOGIN_MAX_ATTEMPTS), SECURITY.LOGIN_LOCK_BASE_MS);
  assert.equal(lockDuration(SECURITY.LOGIN_MAX_ATTEMPTS + 1), SECURITY.LOGIN_LOCK_BASE_MS * 2);
  assert.equal(lockDuration(500), SECURITY.LOGIN_WINDOW_MS);
});

test('depois da espera o login volta a ser tentado', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const { user } = await createClient(app);
    for (let i = 0; i < SECURITY.LOGIN_MAX_ATTEMPTS; i += 1) await loginAs(app, user.email, 'errada12345');
    assert.equal((await loginAs(app, user.email, user.password)).status, 429);
    await ctx.db.execute('UPDATE login_attempts SET created_at = created_at - ?', [SECURITY.LOGIN_LOCK_BASE_MS + 1000]);
    assert.equal((await loginAs(app, user.email, user.password)).status, 200);
  } finally {
    close();
  }
});

/* ------------------------------------------------------------- purga */

test('a faxina remove sessões vencidas/paradas, tentativas, desafios e auditoria antiga', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const { id } = await createClient(app);
    const velho = Date.now() - 400 * 24 * 3600_000;
    await ctx.db.execute('INSERT INTO login_attempts (email, created_at, ip) VALUES (?, ?, ?)', ['x@x.com', Date.now() - SECURITY.LOGIN_WINDOW_MS - 1000, '1.1.1.1']);
    await ctx.db.execute('INSERT INTO login_attempts (email, created_at, ip) VALUES (?, ?, ?)', ['y@x.com', Date.now(), '1.1.1.1']);
    await ctx.db.execute('INSERT INTO audit_logs (user_id, action, created_at) VALUES (?, ?, ?)', [id, 'VELHO', velho]);
    await ctx.db.execute('INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)', ['a'.repeat(64), id, Date.now() - 1, velho, velho]);
    await ctx.db.execute('INSERT INTO sessions (id, user_id, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)', ['b'.repeat(64), id, Date.now() + 1e7, Date.now() - 5 * 3600_000, Date.now() - 5 * 3600_000]);
    await ctx.db.execute('INSERT INTO login_challenges (id, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)', ['c'.repeat(64), id, Date.now() - 1, velho]);

    const r = await app.maintenance.run();
    assert.equal(r.sessionsExpired, 1);
    assert.equal(r.sessionsIdle, 1);
    assert.equal(r.loginAttempts, 1);
    assert.equal(r.challenges, 1);
    assert.equal(r.audit, 1);

    assert.equal((await ctx.db.query('SELECT 1 FROM login_attempts')).length, 1, 'a recente fica');
    assert.equal((await ctx.db.query("SELECT 1 FROM sessions WHERE id <> ?", ['x'])).length, 1, 'a sessão ativa fica');
  } finally {
    close();
  }
});

/* ----------------------------------------------------------- auditoria */

test('auditoria grava IP e user agent, e negação de papel tem tipo próprio', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const { user, token } = await createClient(app);
    await loginAs(app, user.email, 'errada12345', {
      headers: { 'x-forwarded-for': '203.0.113.5', 'user-agent': 'TesteAgent/1.0' },
    });
    const falho = await ctx.db.queryOne("SELECT * FROM audit_logs WHERE action = 'LOGIN_FALHOU'");
    assert.equal(falho.ip, '203.0.113.5');
    assert.equal(falho.user_agent, 'TesteAgent/1.0');
    assert.ok(!falho.details.includes(user.email), 'o e-mail digitado não vai para o log');
    assert.ok(falho.details.includes('senha_incorreta'));

    const negado = await request(app, 'GET', '/api/admin/summary', {
      token,
      headers: { 'x-forwarded-for': '203.0.113.6' },
    });
    assert.equal(negado.status, 403);
    const logs = await ctx.db.query("SELECT action, ip FROM audit_logs WHERE resource_type = 'authz'");
    assert.deepEqual(logs.map((l) => l.action), ['ACESSO_NEGADO']);
    assert.equal(logs[0].ip, '203.0.113.6');
    assert.equal((await ctx.db.query("SELECT 1 FROM audit_logs WHERE action = 'LOGIN_FALHOU' AND resource_type = 'authz'")).length, 0);
  } finally {
    close();
  }
});

/* ------------------------------------------------------------- cotas */

test('cota de solicitações por dia', async () => {
  const { app, close } = await createTestApp();
  try {
    const { token } = await createClient(app);
    let ultimo;
    for (let i = 0; i < LIMITS.REQUESTS_PER_DAY + 1; i += 1) {
      ultimo = await request(app, 'POST', '/api/me/requests', {
        token,
        body: { type: 'Site', description: 'Descrição longa o bastante para passar.' },
      });
    }
    assert.equal(ultimo.status, 429);
  } finally {
    close();
  }
});

test('cota de mensagens por hora vale para cliente e não para o admin', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    const { token, id } = await createClient(app);
    const criada = await request(app, 'POST', '/api/me/requests', {
      token,
      body: { type: 'Site', description: 'Descrição longa o bastante para passar.' },
    });
    const rid = criada.body.request.id;
    const agora = Date.now();
    for (let i = 0; i < LIMITS.MESSAGES_PER_HOUR; i += 1) {
      await ctx.db.execute('INSERT INTO messages (request_id, author_id, body, created_at) VALUES (?, ?, ?, ?)', [rid, id, 'x', agora]);
      await ctx.db.execute('INSERT INTO messages (request_id, author_id, body, created_at) VALUES (?, ?, ?, ?)', [rid, admin.id, 'y', agora]);
    }
    const cliente = await request(app, 'POST', `/api/requests/${rid}/messages`, { token, body: { body: 'mais uma' } });
    assert.equal(cliente.status, 429);
    const doAdmin = await request(app, 'POST', `/api/requests/${rid}/messages`, { token: admin.token, body: { body: 'resposta' } });
    assert.equal(doAdmin.status, 201);
  } finally {
    close();
  }
});

test('cota diária de imagens (quantidade e bytes)', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const { token, id } = await createClient(app);
    const rid = (await request(app, 'POST', '/api/me/requests', {
      token,
      body: { type: 'Site', description: 'Descrição longa o bastante para passar.' },
    })).body.request.id;
    const msg = await ctx.db.execute('INSERT INTO messages (request_id, author_id, body, created_at) VALUES (?, ?, ?, ?)', [rid, id, 'img', Date.now()]);
    await ctx.db.execute(
      'INSERT INTO attachments (message_id, filename, mime, size, content, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [msg.insertId, 'a.png', 'image/png', LIMITS.ATTACHMENT_BYTES_PER_DAY, Buffer.from('x'), Date.now()]
    );
    /* PNG 1x1 válido. */
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const r = await request(app, 'POST', `/api/requests/${rid}/messages`, {
      token,
      body: { body: 'olha', image: { dataBase64: png, filename: 'b.png' } },
    });
    assert.equal(r.status, 429);
    assert.equal((await ctx.db.query('SELECT 1 FROM messages WHERE body = ?', ['olha'])).length, 0, 'mensagem não fica órfã');
  } finally {
    close();
  }
});

/* -------------------------------------------------------------- CSRF */

test('CSRF: Origin, Referer ou Sec-Fetch-Site — sem nenhum, recusa', () => {
  const ok = ['https://site.com'];
  assert.equal(isTrustedRequestOrigin({ origin: 'https://site.com' }, ok), true);
  assert.equal(isTrustedRequestOrigin({ origin: 'https://evil.com' }, ok), false);
  assert.equal(isTrustedRequestOrigin({ origin: 'null' }, ok), false);
  assert.equal(isTrustedRequestOrigin({ referer: 'https://site.com/login' }, ok), true);
  assert.equal(isTrustedRequestOrigin({ referer: 'https://evil.com/x' }, ok), false);
  assert.equal(isTrustedRequestOrigin({ referer: 'lixo' }, ok), false);
  assert.equal(isTrustedRequestOrigin({ 'sec-fetch-site': 'same-origin' }, ok), true);
  assert.equal(isTrustedRequestOrigin({ 'sec-fetch-site': 'cross-site' }, ok), false);
  assert.equal(isTrustedRequestOrigin({}, ok), false);
  /* Origin presente e errado não é salvo por Referer bom. */
  assert.equal(isTrustedRequestOrigin({ origin: 'https://evil.com', referer: 'https://site.com/' }, ok), false);
});

test('CSRF na API: POST sem Origin/Referer/Sec-Fetch-Site é 403 quando há origens configuradas', async () => {
  const { createTestDb } = await import('../../server/db/index.js');
  const bd = await createTestDb();
  await bd.init();
  const comOrigens = createApp(bd, { allowedOrigins: ['https://site.com'] });
  try {
    const body = { email: 'a@b.com', password: 'x' };
    assert.equal((await request(comOrigens, 'POST', '/api/auth/login', { body })).status, 403);
    assert.equal((await request(comOrigens, 'POST', '/api/auth/login', { body, headers: { origin: 'https://evil.com' } })).status, 403);
    assert.equal((await request(comOrigens, 'POST', '/api/auth/login', { body, headers: { origin: 'https://site.com' } })).status, 401);
    assert.equal((await request(comOrigens, 'POST', '/api/auth/login', { body, headers: { 'sec-fetch-site': 'same-origin' } })).status, 401);
    assert.equal((await request(comOrigens, 'GET', '/api/health')).status, 200, 'GET não precisa');
  } finally {
    await bd.close();
  }
});

/* ------------------------------------------------- cadastro e corpo */

test('cadastro repetido leva o mesmo tempo de hash e tem teto por IP', async () => {
  const { app, close } = await createTestApp();
  try {
    const body = { name: 'Ana', email: 'ana@teste.com', password: 'SenhaForte123' };
    const ip = { headers: { 'x-forwarded-for': '203.0.113.50' } };
    assert.equal((await request(app, 'POST', '/api/auth/register', { body, ...ip })).status, 201);
    assert.equal((await request(app, 'POST', '/api/auth/register', { body, ...ip })).status, 409);
    let status;
    for (let i = 0; i < 10; i += 1) {
      status = (await request(app, 'POST', '/api/auth/register', { body, ...ip })).status;
    }
    assert.equal(status, 429);
  } finally {
    close();
  }
});

test('cadastro simultâneo do mesmo e-mail: um 201 e um 409, nunca 500', async () => {
  const { app, close } = await createTestApp();
  try {
    const body = { name: 'Ana', email: 'ana@teste.com', password: 'SenhaForte123' };
    const [a, b] = await Promise.all([
      request(app, 'POST', '/api/auth/register', { body }),
      request(app, 'POST', '/api/auth/register', { body }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409]);
  } finally {
    close();
  }
});

test('rotas de autenticação têm teto de corpo próprio; o global continua para upload', () => {
  assert.equal(bodyLimitFor('/api/auth/login'), SECURITY.AUTH_MAX_BODY_BYTES);
  assert.equal(bodyLimitFor('/api/auth/register'), SECURITY.AUTH_MAX_BODY_BYTES);
  assert.equal(bodyLimitFor('/api/requests/1/messages'), null);
  assert.ok(SECURITY.AUTH_MAX_BODY_BYTES <= 16 * 1024);
});

/* -------------------------------------------------- respostas da API */

test('respostas da API: no-store, nosniff e CORP same-origin', async () => {
  const { app, close } = await createTestApp();
  try {
    const { token } = await createClient(app);
    for (const r of [
      await request(app, 'GET', '/api/auth/me', { token }),
      await request(app, 'GET', '/api/auth/me'),
      await request(app, 'GET', '/api/health'),
    ]) {
      assert.equal(r.headers['Cache-Control'], 'no-store');
      assert.equal(r.headers['X-Content-Type-Options'], 'nosniff');
      assert.equal(r.headers['Cross-Origin-Resource-Policy'], 'same-origin');
    }
  } finally {
    close();
  }
});

test('o cookie de sessão é HttpOnly, SameSite=Lax e Secure em produção', async () => {
  const { serializeSessionCookie } = await import('../../server/http/cookies.js');
  const cookie = serializeSessionCookie('abc', { maxAgeMs: 1000 });
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  /* `Secure` depende de NODE_ENV=production, lido na carga do módulo. */
  const filho = await import('node:child_process').then((m) =>
    m.execFileSync(process.execPath, ['-e', "import('./server/http/cookies.js').then(m=>console.log(m.serializeSessionCookie('a',{maxAgeMs:1000})))"], {
      env: { ...process.env, NODE_ENV: 'production' },
      encoding: 'utf8',
    })
  );
  assert.match(filho, /; Secure/);
});

/* ------------------------------------------------------- configuração */

test('produção exige Postgres (ou aceite explícito do SQLite)', () => {
  const base = { isProduction: true, postgres: {}, licensing: {} };
  assert.throws(() => assertProductionConfig({ ...base, driver: 'sqlite' }, {}), /DATABASE_DRIVER=postgres/);
  assert.doesNotThrow(() => assertProductionConfig({ ...base, driver: 'sqlite' }, { ALLOW_SQLITE_IN_PRODUCTION: 'true' }));
  assert.throws(() => assertProductionConfig({ ...base, driver: 'postgres' }, {}), /DATABASE_URL/);
  assert.doesNotThrow(() => assertProductionConfig({ ...base, driver: 'postgres', postgres: { url: 'postgres://x' }, sessionSecret: 'x'.repeat(40) }, {}));
  /* Fora de produção, SQLite segue valendo. */
  assert.doesNotThrow(() => assertProductionConfig({ ...base, isProduction: false, driver: 'sqlite' }, {}));
});

test('a regra de senha é única', () => {
  assert.ok(passwordProblem('curta1'));
  assert.ok(passwordProblem('somenteletrasaqui'));
  assert.ok(passwordProblem('12345678901'));
  assert.equal(passwordProblem('Senha-Forte-123'), null);
});

test('migração do SQLite é idempotente e completa bancos antigos', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { aplicarMigracoesSqlite } = await import('../../server/db/sqlite.js');
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id INTEGER, expires_at INTEGER, created_at INTEGER);
           CREATE TABLE login_attempts (id INTEGER PRIMARY KEY, email TEXT, created_at INTEGER);
           CREATE TABLE audit_logs (id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT, resource_type TEXT, resource_id TEXT, details TEXT, created_at INTEGER);`);
  aplicarMigracoesSqlite(db);
  aplicarMigracoesSqlite(db);
  const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
  assert.ok(cols('sessions').includes('last_seen_at') && cols('sessions').includes('user_agent'));
  assert.ok(cols('login_attempts').includes('ip'));
  assert.ok(cols('audit_logs').includes('ip') && cols('audit_logs').includes('user_agent'));
  db.close();
});
