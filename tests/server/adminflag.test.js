/* =========================================================================
   SITE_ADMIN_ENABLED: com a flag desligada (padrão) a administração do site
   não existe mais; ligada, o comportamento antigo volta inteiro.
   ========================================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTestDb } from '../../server/db/index.js';
import { createApp } from '../../server/app.js';
import { createContext } from '../../server/context.js';
import { hashPassword } from '../../server/security/password.js';
import { analyticsService } from '../../server/services/analytics.js';
import { createClient, extractSessionToken, request } from './helpers.js';

const READ_KEY = 'r'.repeat(40);

async function setup() {
  const db = await createTestDb();
  await db.init();
  const analytics = analyticsService(db, { readKey: READ_KEY });
  const ligada = createApp(db, { adminEnabled: true, analytics });
  const desligada = createApp(db, { adminEnabled: false, analytics });
  const padrao = createApp(db, { analytics });
  const ctx = createContext(db);
  const senha = 'AdminForte123';
  const email = 'admin@teste.com';
  const id = await ctx.users.create({
    name: 'Admin', company: 'TODAI', email, phone: null,
    passwordHash: await hashPassword(senha), role: 'ADMIN',
  });
  const entrar = (app) => request(app, 'POST', '/api/auth/login', { body: { email, password: senha } });
  return { db, ctx, ligada, desligada, padrao, entrar, adminId: id, close: () => db.close() };
}

test('o padrão do servidor é administração desligada', async () => {
  const t = await setup();
  try {
    const cfg = await request(t.padrao, 'GET', '/api/config/public');
    assert.deepEqual(cfg.body, { adminEnabled: false });
    assert.equal((await t.entrar(t.padrao)).status, 403);
  } finally {
    t.close();
  }
});

test('config pública expõe só { adminEnabled } e reflete a flag', async () => {
  const t = await setup();
  try {
    assert.deepEqual((await request(t.ligada, 'GET', '/api/config/public')).body, { adminEnabled: true });
    assert.deepEqual((await request(t.desligada, 'GET', '/api/config/public')).body, { adminEnabled: false });
  } finally {
    t.close();
  }
});

test('desligada: login de ADMIN é recusado com mensagem clara; cliente entra normalmente', async () => {
  const t = await setup();
  try {
    const r = await t.entrar(t.desligada);
    assert.equal(r.status, 403);
    assert.equal(r.body.error, 'ADMIN_DESATIVADO');
    assert.match(r.body.message, /Panel/);
    assert.equal(extractSessionToken(r), null, 'nenhum cookie de sessão');
    const sessoes = await t.db.queryOne('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?', [t.adminId]);
    assert.equal(Number(sessoes.n), 0);

    /* Senha errada continua igual a antes (não revela que é admin). */
    const errada = await request(t.desligada, 'POST', '/api/auth/login', {
      body: { email: 'admin@teste.com', password: 'SenhaErrada999' },
    });
    assert.equal(errada.status, 401);

    const cliente = await createClient(t.desligada);
    assert.ok(cliente.token);
    assert.equal((await request(t.desligada, 'GET', '/api/auth/me', { token: cliente.token })).status, 200);
  } finally {
    t.close();
  }
});

test('desligada: /api/admin/* responde 410 (com ou sem sessão); analytics por chave continua', async () => {
  const t = await setup();
  try {
    const login = await t.entrar(t.ligada);
    const token = extractSessionToken(login);

    for (const [metodo, caminho] of [
      ['GET', '/api/admin/summary'],
      ['GET', '/api/admin/clients'],
      ['GET', '/api/admin/audit'],
      ['POST', '/api/admin/projects'],
      ['DELETE', '/api/admin/projects/1'],
      ['GET', '/api/admin/nao-existe'],
    ]) {
      for (const tk of [token, undefined]) {
        const r = await request(t.desligada, metodo, caminho, { token: tk });
        assert.equal(r.status, 410, `${metodo} ${caminho}`);
        assert.equal(r.body.error, 'ADMIN_DESATIVADO');
      }
    }

    const relatorio = await request(t.desligada, 'GET', '/api/analytics/report', {
      headers: { 'X-Analytics-Key': READ_KEY },
    });
    assert.equal(relatorio.status, 200, 'leitura de visitas por chave não depende da flag');
  } finally {
    t.close();
  }
});

test('desligada: sessão de admin criada antes deixa de valer (e não ressuscita ao religar)', async () => {
  const t = await setup();
  try {
    const token = extractSessionToken(await t.entrar(t.ligada));
    assert.equal((await request(t.ligada, 'GET', '/api/auth/me', { token })).status, 200);

    assert.equal((await request(t.desligada, 'GET', '/api/auth/me', { token })).status, 401);
    assert.equal((await request(t.desligada, 'GET', '/api/conversations', { token })).status, 401);
    assert.equal((await request(t.desligada, 'POST', '/api/requests/1/messages', { token, body: { body: 'x' } })).status, 401);

    assert.equal((await request(t.ligada, 'GET', '/api/auth/me', { token })).status, 401, 'sessão apagada');
  } finally {
    t.close();
  }
});

test('ligada: tudo volta ao comportamento antigo', async () => {
  const t = await setup();
  try {
    const login = await t.entrar(t.ligada);
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, 'ADMIN');
    const token = extractSessionToken(login);

    const resumo = await request(t.ligada, 'GET', '/api/admin/summary', { token });
    assert.equal(resumo.status, 200);
    /* O usuário de sistema não conta como cliente. */
    assert.equal(resumo.body.summary.clients, 0);
    assert.equal((await request(t.ligada, 'GET', '/api/admin/clients', { token })).status, 200);

    /* Cliente continua sem acesso ao admin (403 pelo papel, não 410). */
    const cliente = await createClient(t.ligada);
    assert.equal((await request(t.ligada, 'GET', '/api/admin/summary', { token: cliente.token })).status, 403);
  } finally {
    t.close();
  }
});

test('2FA: com a flag desligada nem o segundo passo cria sessão de admin', async () => {
  const t = await setup();
  try {
    /* Desafio emitido enquanto a flag estava ligada, usado depois de desligar. */
    const { createSessionToken, hashToken } = await import('../../server/security/tokens.js');
    const desafio = createSessionToken();
    await t.ctx.twoFactor.createChallenge({ id: hashToken(desafio), userId: t.adminId, expiresAt: Date.now() + 60000 });
    const r = await request(t.desligada, 'POST', '/api/auth/login/2fa', {
      body: { challenge: desafio, code: '123456' },
    });
    assert.equal(r.status, 403);
    assert.equal(extractSessionToken(r), null);
  } finally {
    t.close();
  }
});

/* ----------------------------------------------------------------- front */

test('front: /admin mostra o aviso quando desligado e links de admin dependem da flag', () => {
  const rota = readFileSync(new URL('../../src/app/ProtectedRoute.jsx', import.meta.url), 'utf8');
  assert.match(rota, /requireAdmin && !adminEnabled/);
  assert.match(rota, /AdminDisabled/);

  const aviso = readFileSync(new URL('../../src/pages/AdminDisabled.jsx', import.meta.url), 'utf8');
  assert.match(aviso, /A administração agora é no Panel/);

  const auth = readFileSync(new URL('../../src/app/AuthContext.jsx', import.meta.url), 'utf8');
  assert.match(auth, /\/config\/public/);
  assert.match(auth, /isAdmin: adminEnabled && user\?\.role === 'ADMIN'/);
});

test('front: resposta do Panel aparece como "<nome> · TODAI" e não agrupa admins diferentes', () => {
  const msg = readFileSync(new URL('../../src/components/chat/ChatMessage.jsx', import.meta.url), 'utf8');
  assert.match(msg, /author_external_name\} · TODAI/);
  const autor = readFileSync(new URL('../../src/components/chat/autor.js', import.meta.url), 'utf8');
  assert.match(autor, /author_external_name/);
});
