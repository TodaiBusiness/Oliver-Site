/* Recuperação de senha por e-mail: resposta neutra, token de uso único com
   validade, sessões derrubadas, 2FA preservado, limites e mailer. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../../server/db/index.js';
import { createApp } from '../../server/app.js';
import { createContext } from '../../server/context.js';
import { createMailer } from '../../server/services/mailer.js';
import { createClient, createAdmin, request, extractSessionToken } from './helpers.js';
import { totpAt } from '../../server/security/totp.js';

async function setup() {
  const db = await createTestDb();
  await db.init();
  const sent = [];
  const mailer = {
    configured: true,
    send: async (mail) => {
      sent.push(mail);
    },
  };
  const app = createApp(db, { mailer, forgotMinMs: 0, adminEnabled: true });
  return { app, db, ctx: createContext(db), sent, close: () => db.close() };
}

const tokenOf = (mail) => /#token=([\w-]+)/.exec(mail.text)[1];
const forgot = (app, email, ip = '203.0.113.1') =>
  request(app, 'POST', '/api/auth/forgot', { body: { email }, headers: { 'x-forwarded-for': ip } });

test('a resposta é idêntica com conta, sem conta e com e-mail inválido', async () => {
  const { app, sent, close } = await setup();
  try {
    const { user } = await createClient(app);
    const a = await forgot(app, user.email, '1.1.1.1');
    const b = await forgot(app, 'ninguem@teste.com', '1.1.1.2');
    const c = await forgot(app, 'nao-e-email', '1.1.1.3');
    const d = await request(app, 'POST', '/api/auth/forgot', { body: {}, headers: { 'x-forwarded-for': '1.1.1.4' } });
    for (const r of [a, b, c, d]) {
      assert.equal(r.status, 202);
      assert.deepEqual(r.body, a.body);
    }
    assert.equal(sent.length, 1, 'só a conta real recebe e-mail');
    assert.equal(sent[0].to, user.email);
  } finally {
    close();
  }
});

test('o e-mail tem o link com o token no fragmento e o banco guarda só o SHA-256', async () => {
  const { app, ctx, sent, close } = await setup();
  try {
    const { user } = await createClient(app);
    await forgot(app, user.email);
    assert.match(sent[0].text, /\/redefinir-senha#token=/);
    assert.ok(!sent[0].text.includes('?token='), 'nada de token na query');
    const token = tokenOf(sent[0]);
    assert.ok(token.length >= 43, '32 bytes em base64url');
    const rows = await ctx.db.query('SELECT id FROM password_resets');
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].id, token);
    assert.match(rows[0].id, /^[0-9a-f]{64}$/);
  } finally {
    close();
  }
});

test('redefinir troca a senha, derruba TODAS as sessões e audita', async () => {
  const { app, ctx, sent, close } = await setup();
  try {
    const { user, token } = await createClient(app);
    await forgot(app, user.email);
    const reset = await request(app, 'POST', '/api/auth/reset', {
      body: { token: tokenOf(sent[0]), password: 'NovaSenha789' },
    });
    assert.equal(reset.status, 200);

    assert.equal((await request(app, 'GET', '/api/auth/me', { token })).status, 401);
    assert.equal((await request(app, 'POST', '/api/auth/login', { body: { email: user.email, password: user.password } })).status, 401);
    assert.equal((await request(app, 'POST', '/api/auth/login', { body: { email: user.email, password: 'NovaSenha789' } })).status, 200);

    const log = await ctx.db.query("SELECT details FROM audit_logs WHERE action = 'SENHA_REDEFINIDA'");
    assert.equal(log.length, 1);
    assert.ok(!JSON.stringify(log).includes('NovaSenha789'));
  } finally {
    close();
  }
});

test('o token é de uso único', async () => {
  const { app, sent, close } = await setup();
  try {
    const { user } = await createClient(app);
    await forgot(app, user.email);
    const token = tokenOf(sent[0]);
    assert.equal((await request(app, 'POST', '/api/auth/reset', { body: { token, password: 'NovaSenha789' } })).status, 200);
    const de_novo = await request(app, 'POST', '/api/auth/reset', { body: { token, password: 'OutraSenha789' } });
    assert.equal(de_novo.status, 400);
    assert.equal((await request(app, 'POST', '/api/auth/login', { body: { email: user.email, password: 'NovaSenha789' } })).status, 200);
  } finally {
    close();
  }
});

test('dois usos simultâneos do mesmo link: só um passa', async () => {
  const { app, sent, close } = await setup();
  try {
    const { user } = await createClient(app);
    await forgot(app, user.email);
    const token = tokenOf(sent[0]);
    const [a, b] = await Promise.all([
      request(app, 'POST', '/api/auth/reset', { body: { token, password: 'SenhaA12345' } }),
      request(app, 'POST', '/api/auth/reset', { body: { token, password: 'SenhaB12345' } }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 400]);
  } finally {
    close();
  }
});

test('token expirado ou inventado é recusado', async () => {
  const { app, ctx, sent, close } = await setup();
  try {
    const { user } = await createClient(app);
    await forgot(app, user.email);
    const token = tokenOf(sent[0]);
    await ctx.db.execute('UPDATE password_resets SET expires_at = ?', [Date.now() - 1]);
    assert.equal((await request(app, 'POST', '/api/auth/reset', { body: { token, password: 'NovaSenha789' } })).status, 400);
    assert.equal((await request(app, 'POST', '/api/auth/reset', { body: { token: 'x'.repeat(43), password: 'NovaSenha789' } })).status, 400);
    assert.equal((await request(app, 'POST', '/api/auth/reset', { body: { password: 'NovaSenha789' } })).status, 400);
  } finally {
    close();
  }
});

test('o link vale 30 minutos', async () => {
  const { app, ctx, sent, close } = await setup();
  try {
    const { user } = await createClient(app);
    const antes = Date.now();
    await forgot(app, user.email);
    const row = await ctx.db.queryOne('SELECT expires_at FROM password_resets');
    assert.ok(row.expires_at - antes <= 30 * 60_000 + 2000 && row.expires_at - antes > 29 * 60_000);
    void sent;
  } finally {
    close();
  }
});

test('pedir outro link invalida o anterior', async () => {
  const { app, sent, close } = await setup();
  try {
    const { user } = await createClient(app);
    await forgot(app, user.email, '1.1.1.1');
    await forgot(app, user.email, '1.1.1.2');
    assert.equal(sent.length, 2);
    assert.equal((await request(app, 'POST', '/api/auth/reset', { body: { token: tokenOf(sent[0]), password: 'NovaSenha789' } })).status, 400);
    assert.equal((await request(app, 'POST', '/api/auth/reset', { body: { token: tokenOf(sent[1]), password: 'NovaSenha789' } })).status, 200);
  } finally {
    close();
  }
});

test('senha fraca é recusada SEM queimar o token', async () => {
  const { app, sent, close } = await setup();
  try {
    const { user } = await createClient(app);
    await forgot(app, user.email);
    const token = tokenOf(sent[0]);
    const fraca = await request(app, 'POST', '/api/auth/reset', { body: { token, password: 'curta' } });
    assert.equal(fraca.status, 400);
    assert.ok(fraca.body.details.password);
    assert.equal((await request(app, 'POST', '/api/auth/reset', { body: { token, password: 'NovaSenha789' } })).status, 200);
  } finally {
    close();
  }
});

test('admin com 2FA continua exigindo o segundo fator depois de redefinir', async () => {
  const { app, ctx, sent, close } = await setup();
  try {
    const admin = await createAdmin(ctx, app);
    const setupRes = await request(app, 'POST', '/api/auth/2fa/setup', { token: admin.token, body: { password: admin.password } });
    await request(app, 'POST', '/api/auth/2fa/enable', { token: admin.token, body: { code: totpAt(setupRes.body.secret) } });

    await forgot(app, admin.email);
    assert.equal((await request(app, 'POST', '/api/auth/reset', { body: { token: tokenOf(sent[0]), password: 'NovaSenha789' } })).status, 200);

    const login = await request(app, 'POST', '/api/auth/login', { body: { email: admin.email, password: 'NovaSenha789' } });
    assert.equal(login.body.twoFactorRequired, true);
    assert.equal(extractSessionToken(login), null);
    assert.equal((await ctx.db.query('SELECT 1 FROM user_totp WHERE enabled = 1')).length, 1);
  } finally {
    close();
  }
});

test('limite por IP (429) e por e-mail (resposta igual, sem novo envio)', async () => {
  const { app, sent, close } = await setup();
  try {
    const { user } = await createClient(app);
    for (let i = 0; i < 5; i += 1) {
      const r = await forgot(app, user.email, `10.0.0.${i}`);
      assert.equal(r.status, 202, 'por e-mail: continua neutro');
    }
    assert.equal(sent.length, 3, 'o 4º e o 5º não enviam');

    let ultimo;
    for (let i = 0; i < 6; i += 1) ultimo = await forgot(app, 'outro@teste.com', '9.9.9.9');
    assert.equal(ultimo.status, 429);
  } finally {
    close();
  }
});

test('o tempo da resposta é uniforme (mínimo fixo) com e sem conta', async () => {
  const db = await createTestDb();
  await db.init();
  const app = createApp(db, { mailer: { configured: true, send: async () => {} }, forgotMinMs: 150 });
  try {
    const { user } = await createClient(app);
    const medir = async (email, ip) => {
      const t = Date.now();
      await forgot(app, email, ip);
      return Date.now() - t;
    };
    const com = await medir(user.email, '2.2.2.1');
    const sem = await medir('ninguem@teste.com', '2.2.2.2');
    assert.ok(com >= 140 && sem >= 140, `com=${com} sem=${sem}`);
  } finally {
    await db.close();
  }
});

test('falha do provedor de e-mail não muda a resposta', async () => {
  const db = await createTestDb();
  await db.init();
  const app = createApp(db, { mailer: { configured: true, send: async () => { throw new Error('falhou'); } }, forgotMinMs: 0 });
  try {
    const { user } = await createClient(app);
    const r = await forgot(app, user.email);
    assert.equal(r.status, 202);
  } finally {
    await db.close();
  }
});

test('em produção sem provedor de e-mail: 503 igual para qualquer e-mail, nada vaza', async () => {
  const db = await createTestDb();
  await db.init();
  const mailer = createMailer({ apiKey: undefined, from: undefined, isProduction: true, log: () => assert.fail('não pode logar') });
  assert.equal(mailer.configured, false);
  const app = createApp(db, { mailer, forgotMinMs: 0 });
  try {
    const { user } = await createClient(app);
    const a = await forgot(app, user.email, '5.5.5.1');
    const b = await forgot(app, 'ninguem@teste.com', '5.5.5.2');
    assert.equal(a.status, 503);
    assert.deepEqual(a.body, b.body);
    await assert.rejects(mailer.send({ to: 'x@x.com', subject: 's', text: 'link secreto' }), /não está configurado/);
  } finally {
    await db.close();
  }
});

test('mailer: sem chave em dev só registra no console; com chave chama o Resend', async () => {
  const logs = [];
  const dev = createMailer({ apiKey: undefined, from: undefined, isProduction: false, log: (t) => logs.push(t) });
  assert.equal(dev.configured, true);
  await dev.send({ to: 'a@b.com', subject: 'Oi', text: 'http://x/#token=abc' });
  assert.match(logs[0], /NÃO enviado/);
  assert.match(logs[0], /token=abc/);

  const calls = [];
  const live = createMailer({
    apiKey: 're_123',
    from: 'TODAI <nao-responda@todaibusiness.com>',
    isProduction: true,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200 };
    },
  });
  await live.send({ to: 'a@b.com', subject: 'Oi', text: 'corpo' });
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer re_123');
  const payload = JSON.parse(calls[0].init.body);
  assert.deepEqual(payload.to, ['a@b.com']);
  assert.equal(payload.from, 'TODAI <nao-responda@todaibusiness.com>');

  const quebrado = createMailer({ apiKey: 'k', from: 'f@x.com', fetchImpl: async () => ({ ok: false, status: 500 }) });
  await assert.rejects(quebrado.send({ to: 'a@b.com', subject: 's', text: 't' }), /500/);
});
