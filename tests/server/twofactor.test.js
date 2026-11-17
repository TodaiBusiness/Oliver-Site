/* 2FA TOTP do administrador: ativar, login em dois passos, recuperação,
   replay, bloqueio, cifra em repouso e desativação. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, createAdmin, createClient, request, extractSessionToken } from './helpers.js';
import { base32Decode, base32Encode, hotp, totpAt, verifyTotp, stepAt } from '../../server/security/totp.js';
import { SECURITY } from '../../server/config.js';

/** Código de um passo à frente do relógio (o servidor aceita ±1): nunca coincide com o da ativação. */
const codeAhead = (secret, steps = 1) => totpAt(secret, Date.now() + steps * 30_000);

async function enable2fa(app, admin) {
  const setup = await request(app, 'POST', '/api/auth/2fa/setup', {
    token: admin.token,
    body: { password: admin.password },
  });
  assert.equal(setup.status, 200);
  const enabled = await request(app, 'POST', '/api/auth/2fa/enable', {
    token: admin.token,
    body: { code: totpAt(setup.body.secret) },
  });
  assert.equal(enabled.status, 200);
  return { secret: setup.body.secret, recoveryCodes: enabled.body.recoveryCodes, setup, enabled };
}

/** Libera o anti-replay para o teste poder usar outro código do mesmo período. */
const forgetLastStep = (ctx, userId) => ctx.db.execute('UPDATE user_totp SET last_step = 0 WHERE user_id = ?', [userId]);

/* ------------------------------------------------------------ primitivas */

test('TOTP bate com os vetores da RFC 4226/6238', () => {
  const key = Buffer.from('12345678901234567890');
  assert.equal(hotp(key, 1, 8), '94287082');
  assert.equal(hotp(key, Math.floor(1111111109 / 30), 8), '07081804');
  assert.equal(base32Encode(key), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.deepEqual(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'), key);
});

test('tolera ±1 janela, recusa mais que isso e recusa passo já usado', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  const now = 1_700_000_000_000;
  const step = stepAt(now);
  const at = (delta) => totpAt(secret, now + delta * 30_000);

  assert.equal(verifyTotp(secret, at(0), { now }), step);
  assert.equal(verifyTotp(secret, at(-1), { now }), step - 1);
  assert.equal(verifyTotp(secret, at(1), { now }), step + 1);
  assert.equal(verifyTotp(secret, at(2), { now }), null);
  assert.equal(verifyTotp(secret, at(-2), { now }), null);
  assert.equal(verifyTotp(secret, at(0), { now, minStep: step }), null, 'passo já usado');
  assert.equal(verifyTotp(secret, 'abcdef', { now }), null);
  assert.equal(verifyTotp(secret, '12345', { now }), null);
});

/* ---------------------------------------------------------- compatibilidade */

test('admin sem 2FA continua entrando só com senha', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    assert.ok(admin.token);
    const me = await request(app, 'GET', '/api/auth/me', { token: admin.token });
    assert.equal(me.body.user.twoFactorEnabled, false);
  } finally {
    close();
  }
});

/* ------------------------------------------------------------------ ativar */

test('ativar exige a senha, um código válido e entrega 10 códigos de recuperação', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);

    const semSenha = await request(app, 'POST', '/api/auth/2fa/setup', {
      token: admin.token,
      body: { password: 'errada12345' },
    });
    assert.equal(semSenha.status, 401);

    const setup = await request(app, 'POST', '/api/auth/2fa/setup', {
      token: admin.token,
      body: { password: admin.password },
    });
    assert.equal(setup.status, 200);
    assert.match(setup.body.secret, /^[A-Z2-7]{32}$/);
    assert.match(setup.body.otpauthUrl, /^otpauth:\/\/totp\/TODAI:/);
    assert.ok(setup.body.otpauthUrl.includes(`secret=${setup.body.secret}`));

    /* Pendente não vale: o login continua sem pedir o código. */
    const status = await request(app, 'GET', '/api/auth/2fa', { token: admin.token });
    assert.equal(status.body.enabled, false);

    const errado = await request(app, 'POST', '/api/auth/2fa/enable', {
      token: admin.token,
      body: { code: '000000' },
    });
    assert.equal(errado.status, 401);

    const ok = await request(app, 'POST', '/api/auth/2fa/enable', {
      token: admin.token,
      body: { code: totpAt(setup.body.secret) },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.recoveryCodes.length, SECURITY.TWO_FACTOR.RECOVERY_CODES);
    assert.equal(new Set(ok.body.recoveryCodes).size, 10);

    const depois = await request(app, 'GET', '/api/auth/2fa', { token: admin.token });
    assert.equal(depois.body.enabled, true);
    assert.equal(depois.body.recoveryCodesRemaining, 10);

    /* Não dá para refazer o setup por cima de um 2FA ativo. */
    const de_novo = await request(app, 'POST', '/api/auth/2fa/setup', {
      token: admin.token,
      body: { password: admin.password },
    });
    assert.equal(de_novo.status, 409);
  } finally {
    close();
  }
});

test('segredo e códigos de recuperação não ficam em texto puro no banco', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    const { secret, recoveryCodes } = await enable2fa(app, admin);

    const row = await ctx.db.queryOne('SELECT secret_enc FROM user_totp WHERE user_id = ?', [admin.id]);
    assert.ok(row.secret_enc.startsWith('v1.'));
    assert.ok(!row.secret_enc.includes(secret));

    const todos = JSON.stringify(await ctx.db.query('SELECT code_hash FROM recovery_codes'));
    for (const code of recoveryCodes) {
      assert.ok(!todos.includes(code.replace(/-/g, '')), 'código de recuperação em texto puro');
    }
  } finally {
    close();
  }
});

/* ----------------------------------------------------------- login em 2 passos */

test('com 2FA, a senha certa NÃO cria sessão: devolve um desafio', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    await enable2fa(app, admin);

    const passo1 = await request(app, 'POST', '/api/auth/login', {
      body: { email: admin.email, password: admin.password },
    });
    assert.equal(passo1.status, 200);
    assert.equal(passo1.body.twoFactorRequired, true);
    assert.ok(passo1.body.challenge);
    assert.equal(passo1.body.user, undefined);
    assert.equal(extractSessionToken(passo1), null, 'nenhum cookie antes do código');
  } finally {
    close();
  }
});

test('segundo passo com código correto abre a sessão; o mesmo código não vale de novo (replay)', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    const { secret } = await enable2fa(app, admin);
    const login = () =>
      request(app, 'POST', '/api/auth/login', { body: { email: admin.email, password: admin.password } });

    const c1 = (await login()).body.challenge;
    const code = codeAhead(secret);
    const ok = await request(app, 'POST', '/api/auth/login/2fa', { body: { challenge: c1, code } });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.role, 'ADMIN');
    const token = extractSessionToken(ok);
    assert.ok(token);
    assert.equal((await request(app, 'GET', '/api/auth/me', { token })).status, 200);

    /* Mesmo código, desafio novo: recusado. */
    const c2 = (await login()).body.challenge;
    const replay = await request(app, 'POST', '/api/auth/login/2fa', { body: { challenge: c2, code } });
    assert.equal(replay.status, 401);

    /* O código da ativação (passo anterior) também já foi gasto. */
    const antigo = await request(app, 'POST', '/api/auth/login/2fa', {
      body: { challenge: c2, code: totpAt(secret) },
    });
    assert.equal(antigo.status, 401);
  } finally {
    close();
  }
});

test('o desafio é de uso único e morre depois de errar demais', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    const { secret } = await enable2fa(app, admin);
    const login = () =>
      request(app, 'POST', '/api/auth/login', { body: { email: admin.email, password: admin.password } });

    /* Uso único. */
    const c1 = (await login()).body.challenge;
    const code = codeAhead(secret);
    assert.equal((await request(app, 'POST', '/api/auth/login/2fa', { body: { challenge: c1, code } })).status, 200);
    await forgetLastStep(ctx, admin.id);
    const reuso = await request(app, 'POST', '/api/auth/login/2fa', { body: { challenge: c1, code } });
    assert.equal(reuso.status, 401, 'desafio já gasto');

    /* Erros demais matam o desafio, mesmo que o próximo código esteja certo. */
    await ctx.db.execute('DELETE FROM login_attempts');
    const c2 = (await login()).body.challenge;
    for (let i = 0; i < SECURITY.TWO_FACTOR.CHALLENGE_MAX_ATTEMPTS; i += 1) {
      const r = await request(app, 'POST', '/api/auth/login/2fa', { body: { challenge: c2, code: '111111' } });
      assert.equal(r.status, 401);
    }
    await ctx.db.execute('DELETE FROM login_attempts'); // isola do bloqueio por IP
    const depois = await request(app, 'POST', '/api/auth/login/2fa', {
      body: { challenge: c2, code: codeAhead(secret) },
    });
    assert.equal(depois.status, 401, 'desafio esgotado');
  } finally {
    close();
  }
});

test('desafio expirado ou inventado é recusado', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    const { secret } = await enable2fa(app, admin);

    const falso = await request(app, 'POST', '/api/auth/login/2fa', {
      body: { challenge: 'inventado', code: codeAhead(secret) },
    });
    assert.equal(falso.status, 401);

    const c = (await request(app, 'POST', '/api/auth/login', {
      body: { email: admin.email, password: admin.password },
    })).body.challenge;
    await ctx.db.execute('UPDATE login_challenges SET expires_at = ?', [Date.now() - 1000]);
    const expirado = await request(app, 'POST', '/api/auth/login/2fa', {
      body: { challenge: c, code: codeAhead(secret) },
    });
    assert.equal(expirado.status, 401);
  } finally {
    close();
  }
});

test('falhas no segundo passo entram no bloqueio por (e-mail + IP)', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    await enable2fa(app, admin);

    let ultimo;
    for (let i = 0; i < SECURITY.LOGIN_MAX_ATTEMPTS + 1; i += 1) {
      const c = (await request(app, 'POST', '/api/auth/login', {
        body: { email: admin.email, password: admin.password },
      }));
      if (c.status === 429) { ultimo = c; break; }
      ultimo = await request(app, 'POST', '/api/auth/login/2fa', {
        body: { challenge: c.body.challenge, code: '123456' },
      });
    }
    assert.equal(ultimo.status, 429);
    assert.ok(ultimo.headers['Retry-After']);
  } finally {
    close();
  }
});

/* ------------------------------------------------------------- recuperação */

test('código de recuperação entra uma vez só e é auditado', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    const { recoveryCodes } = await enable2fa(app, admin);
    const login = () =>
      request(app, 'POST', '/api/auth/login', { body: { email: admin.email, password: admin.password } });

    const code = recoveryCodes[0].toLowerCase(); // minúsculas e com hífens: tolerado
    const ok = await request(app, 'POST', '/api/auth/login/2fa', {
      body: { challenge: (await login()).body.challenge, code },
    });
    assert.equal(ok.status, 200);

    const dnv = await request(app, 'POST', '/api/auth/login/2fa', {
      body: { challenge: (await login()).body.challenge, code },
    });
    assert.equal(dnv.status, 401, 'código de recuperação já usado');

    const outro = await request(app, 'POST', '/api/auth/login/2fa', {
      body: { challenge: (await login()).body.challenge, code: recoveryCodes[1] },
    });
    assert.equal(outro.status, 200, 'os demais continuam valendo');

    const logs = await ctx.db.query("SELECT action, details FROM audit_logs WHERE action = 'CODIGO_RECUPERACAO_USADO'");
    assert.equal(logs.length, 2);
    assert.equal((await request(app, 'GET', '/api/auth/2fa', { token: extractSessionToken(outro) })).body.recoveryCodesRemaining, 8);
  } finally {
    close();
  }
});

test('dois usos simultâneos do mesmo código de recuperação: só um passa', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    const { recoveryCodes } = await enable2fa(app, admin);
    const c1 = (await request(app, 'POST', '/api/auth/login', { body: { email: admin.email, password: admin.password } })).body.challenge;
    const c2 = (await request(app, 'POST', '/api/auth/login', { body: { email: admin.email, password: admin.password } })).body.challenge;

    const [a, b] = await Promise.all([
      request(app, 'POST', '/api/auth/login/2fa', { body: { challenge: c1, code: recoveryCodes[0] } }),
      request(app, 'POST', '/api/auth/login/2fa', { body: { challenge: c2, code: recoveryCodes[0] } }),
    ]);
    assert.deepEqual([a.status, b.status].sort(), [200, 401]);
  } finally {
    close();
  }
});

test('regenerar códigos invalida os antigos', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    const { secret, recoveryCodes } = await enable2fa(app, admin);
    await forgetLastStep(ctx, admin.id);

    const novos = await request(app, 'POST', '/api/auth/2fa/recovery-codes', {
      token: admin.token,
      body: { password: admin.password, code: codeAhead(secret) },
    });
    assert.equal(novos.status, 200);
    assert.equal(novos.body.recoveryCodes.length, 10);

    const c = (await request(app, 'POST', '/api/auth/login', { body: { email: admin.email, password: admin.password } })).body.challenge;
    const velho = await request(app, 'POST', '/api/auth/login/2fa', { body: { challenge: c, code: recoveryCodes[0] } });
    assert.equal(velho.status, 401);
  } finally {
    close();
  }
});

/* ------------------------------------------------------------ desativação */

test('desativar exige senha E código', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    const { secret } = await enable2fa(app, admin);
    await forgetLastStep(ctx, admin.id);

    const semCodigo = await request(app, 'POST', '/api/auth/2fa/disable', {
      token: admin.token,
      body: { password: admin.password, code: '000000' },
    });
    assert.equal(semCodigo.status, 401);

    const semSenha = await request(app, 'POST', '/api/auth/2fa/disable', {
      token: admin.token,
      body: { password: 'errada12345', code: codeAhead(secret) },
    });
    assert.equal(semSenha.status, 401);

    const ok = await request(app, 'POST', '/api/auth/2fa/disable', {
      token: admin.token,
      body: { password: admin.password, code: codeAhead(secret) },
    });
    assert.equal(ok.status, 200);

    const login = await request(app, 'POST', '/api/auth/login', {
      body: { email: admin.email, password: admin.password },
    });
    assert.ok(extractSessionToken(login), 'sem 2FA volta a entrar só com a senha');
    assert.equal((await ctx.db.query('SELECT 1 FROM recovery_codes')).length, 0);
  } finally {
    close();
  }
});

test('ativar 2FA derruba as outras sessões do admin', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    const outra = extractSessionToken(
      await request(app, 'POST', '/api/auth/login', { body: { email: admin.email, password: admin.password } })
    );
    await enable2fa(app, admin);
    assert.equal((await request(app, 'GET', '/api/auth/me', { token: admin.token })).status, 200);
    assert.equal((await request(app, 'GET', '/api/auth/me', { token: outra })).status, 401);
  } finally {
    close();
  }
});

test('segredo ilegível (SESSION_SECRET trocado) nunca autentica', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    const { secret } = await enable2fa(app, admin);
    await ctx.db.execute("UPDATE user_totp SET secret_enc = 'v1.AAAA.AAAA.AAAA'");
    const c = (await request(app, 'POST', '/api/auth/login', { body: { email: admin.email, password: admin.password } })).body.challenge;
    const r = await request(app, 'POST', '/api/auth/login/2fa', { body: { challenge: c, code: codeAhead(secret) } });
    assert.equal(r.status, 401);
  } finally {
    close();
  }
});
