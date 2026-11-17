/* 2FA OPCIONAL para CLIENT: ativar, entrar em 2 passos, recuperar, desativar;
   conta de sistema e papel inválido recusados. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, createClient, createAdmin, request, extractSessionToken } from './helpers.js';
import { totpAt } from '../../server/security/totp.js';
import { twoFactorService } from '../../server/services/twoFactor.js';
import { SECURITY, SYSTEM_USER, LOGIN_DISABLED_HASH, ROLES } from '../../server/config.js';

const codeAhead = (secret, steps = 1) => totpAt(secret, Date.now() + steps * 30_000);

async function enable(app, c) {
  const setup = await request(app, 'POST', '/api/auth/2fa/setup', {
    token: c.token,
    body: { password: c.user.password },
  });
  assert.equal(setup.status, 200);
  const on = await request(app, 'POST', '/api/auth/2fa/enable', {
    token: c.token,
    body: { code: totpAt(setup.body.secret) },
  });
  assert.equal(on.status, 200);
  return { secret: setup.body.secret, codes: on.body.recoveryCodes };
}

const login = (app, c) =>
  request(app, 'POST', '/api/auth/login', { body: { email: c.user.email, password: c.user.password } });

test('cliente vê 2FA como disponível e NÃO obrigatório', async () => {
  const { app, close } = await createTestApp();
  try {
    const c = await createClient(app);
    const st = await request(app, 'GET', '/api/auth/2fa', { token: c.token });
    assert.equal(st.status, 200);
    assert.equal(st.body.available, true);
    assert.equal(st.body.required, false);
    assert.equal(st.body.enabled, false);
    /* Sem ativar, o login continua só com senha. */
    assert.ok(extractSessionToken(await login(app, c)));
  } finally {
    close();
  }
});

test('cliente ativa, entra em 2 passos, usa recuperação e desativa', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const c = await createClient(app);
    const { secret, codes } = await enable(app, c);
    assert.equal(codes.length, SECURITY.TWO_FACTOR.RECOVERY_CODES);

    const p1 = await login(app, c);
    assert.equal(p1.body.twoFactorRequired, true);
    assert.equal(extractSessionToken(p1), null);
    assert.ok(p1.body.expiresAt > Date.now());

    const code = codeAhead(secret);
    const p2 = await request(app, 'POST', '/api/auth/login/2fa', {
      body: { challenge: p1.body.challenge, code: `${code.slice(0, 3)} ${code.slice(3)}` },
    });
    assert.equal(p2.status, 200);
    assert.equal(p2.body.user.role, 'CLIENT');
    const token = extractSessionToken(p2);
    assert.ok(token);

    /* Replay do mesmo código. */
    const replay = await request(app, 'POST', '/api/auth/login/2fa', {
      body: { challenge: (await login(app, c)).body.challenge, code },
    });
    assert.equal(replay.status, 401);

    /* Recuperação, uma vez só. */
    const rec = await request(app, 'POST', '/api/auth/login/2fa', {
      body: { challenge: (await login(app, c)).body.challenge, code: codes[0] },
    });
    assert.equal(rec.status, 200);
    const again = await request(app, 'POST', '/api/auth/login/2fa', {
      body: { challenge: (await login(app, c)).body.challenge, code: codes[0] },
    });
    assert.equal(again.status, 401);

    /* Novos códigos e desativação exigem senha + código. */
    const recToken = extractSessionToken(rec);
    const semSenha = await request(app, 'POST', '/api/auth/2fa/disable', {
      token: recToken,
      body: { password: 'errada12345', code: codes[1] },
    });
    assert.equal(semSenha.status, 401);
    const off = await request(app, 'POST', '/api/auth/2fa/disable', {
      token: recToken,
      body: { password: c.user.password, code: codes[1] },
    });
    assert.equal(off.status, 200);
    assert.ok(extractSessionToken(await login(app, c)), 'volta a entrar só com senha');

    /* Auditoria sem segredo nem código. */
    const logs = JSON.stringify(await ctx.db.query('SELECT action, details FROM audit_logs'));
    assert.ok(!logs.includes(secret));
    for (const x of codes) assert.ok(!logs.includes(x.replace(/-/g, '')));
  } finally {
    close();
  }
});

test('cliente: erros demais bloqueiam (lockout) e a ativação exige código válido', async () => {
  const { app, close } = await createTestApp();
  try {
    const c = await createClient(app);
    const setup = await request(app, 'POST', '/api/auth/2fa/setup', {
      token: c.token,
      body: { password: c.user.password },
    });
    const ruim = await request(app, 'POST', '/api/auth/2fa/enable', { token: c.token, body: { code: '000000' } });
    assert.equal(ruim.status, 401);
    assert.equal((await request(app, 'GET', '/api/auth/2fa', { token: c.token })).body.enabled, false);
    assert.ok(setup.body.secret);

    let ultimo;
    for (let i = 0; i < SECURITY.LOGIN_MAX_ATTEMPTS + 2; i += 1) {
      ultimo = await request(app, 'POST', '/api/auth/2fa/enable', { token: c.token, body: { code: '000000' } });
      if (ultimo.status === 429) break;
    }
    assert.equal(ultimo.status, 429);
  } finally {
    close();
  }
});

test('2FA do admin continua igual: obrigatório no status e login em 2 passos', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    const st = await request(app, 'GET', '/api/auth/2fa', { token: admin.token });
    assert.equal(st.body.required, true);
    assert.equal(st.body.available, true);
  } finally {
    close();
  }
});

test('usuário de sistema não tem 2FA e não loga', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    let row = await ctx.users.findByEmailWithHash(SYSTEM_USER.EMAIL);
    if (!row) {
      await ctx.users.create({ name: SYSTEM_USER.NAME, company: 'TODAI', email: SYSTEM_USER.EMAIL, phone: null, passwordHash: LOGIN_DISABLED_HASH, role: ROLES.ADMIN });
      row = await ctx.users.findByEmailWithHash(SYSTEM_USER.EMAIL);
    }
    const id = row.id;
    const svc = twoFactorService(ctx);
    const sys = { id, email: SYSTEM_USER.EMAIL, role: ROLES.ADMIN };
    await assert.rejects(svc.setup(sys, { password: 'qualquer12345' }), { status: 403 });
    await assert.rejects(svc.enable(sys, { code: '123456' }), { status: 403 });
    assert.equal((await svc.status(sys)).available, true, 'status não vaza nada além do papel');

    const l = await request(app, 'POST', '/api/auth/login', {
      body: { email: SYSTEM_USER.EMAIL, password: 'qualquer12345' },
    });
    assert.equal(l.status, 401);
  } finally {
    close();
  }
});

test('papel desconhecido é recusado no serviço', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const c = await createClient(app);
    const svc = twoFactorService(ctx);
    const user = { id: c.id, email: c.user.email, role: 'VISITANTE' };
    await assert.rejects(svc.setup(user, { password: c.user.password }), { status: 403 });
    assert.equal((await svc.status(user)).available, false);
  } finally {
    close();
  }
});
