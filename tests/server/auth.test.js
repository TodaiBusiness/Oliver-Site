/* Autenticação: cadastro, login, sessão, logout e força bruta. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activateClient, createTestApp, createClient, extractSessionToken, request } from './helpers.js';
import { hashPassword, verifyPassword, needsRehash } from '../../server/security/password.js';
import { SECURITY } from '../../server/config.js';

test('a senha nunca é guardada em texto puro', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const senha = 'SenhaForte123';
    await request(app, 'POST', '/api/auth/register', {
      body: { name: 'Ana', email: 'ana@teste.com', password: senha },
    });

    const row = await ctx.users.findByEmailWithHash('ana@teste.com');

    assert.ok(row.password_hash, 'deveria existir um hash');
    assert.ok(!row.password_hash.includes(senha), 'a senha não pode aparecer no hash');
    assert.match(row.password_hash, /^scrypt\$/, 'formato esperado do hash');
    assert.ok(await verifyPassword(senha, row.password_hash));
    assert.ok(!(await verifyPassword('senhaErrada123', row.password_hash)));
  } finally {
    close();
  }
});

test('cada hash usa um salt diferente', async () => {
  const a = await hashPassword('MesmaSenha123');
  const b = await hashPassword('MesmaSenha123');
  assert.notEqual(a, b, 'hashes iguais indicariam ausência de salt');
});

test('needsRehash detecta parâmetros fracos', async () => {
  assert.equal(needsRehash(await hashPassword('Qualquer123')), false);
  assert.equal(needsRehash('scrypt$1024$8$1$c2FsdA==$aGFzaA=='), true);
  assert.equal(needsRehash('md5$abc'), true);
  assert.equal(needsRehash(null), true);
});

test('o cadastro recusa senha fraca e e-mail inválido', async () => {
  const { app, close } = await createTestApp();
  try {
    const curta = await request(app, 'POST', '/api/auth/register', {
      body: { name: 'Ana', email: 'ana@teste.com', password: '123' },
    });
    assert.equal(curta.status, 400);
    assert.ok(curta.body.details.password);

    const semNumero = await request(app, 'POST', '/api/auth/register', {
      body: { name: 'Ana', email: 'ana@teste.com', password: 'somenteletras' },
    });
    assert.equal(semNumero.status, 400);

    const email = await request(app, 'POST', '/api/auth/register', {
      body: { name: 'Ana', email: 'nao-e-email', password: 'SenhaForte123' },
    });
    assert.equal(email.status, 400);
    assert.ok(email.body.details.email);
  } finally {
    close();
  }
});

test('não permite dois cadastros com o mesmo e-mail', async () => {
  const { app, close } = await createTestApp();
  try {
    const body = { name: 'Ana', email: 'ana@teste.com', password: 'SenhaForte123' };
    const primeiro = await request(app, 'POST', '/api/auth/register', { body });
    const segundo = await request(app, 'POST', '/api/auth/register', { body });

    assert.equal(primeiro.status, 201);
    assert.equal(segundo.status, 409);
  } finally {
    close();
  }
});

test('e-mail é normalizado (maiúsculas e espaços não criam conta duplicada)', async () => {
  const { app, close } = await createTestApp();
  try {
    await request(app, 'POST', '/api/auth/register', {
      body: { name: 'Ana', email: 'Ana@Teste.com', password: 'SenhaForte123' },
    });
    await activateClient(app, 'ana@teste.com');

    const duplicado = await request(app, 'POST', '/api/auth/register', {
      body: { name: 'Ana', email: '  ANA@TESTE.COM  ', password: 'SenhaForte123' },
    });
    assert.equal(duplicado.status, 409);

    const login = await request(app, 'POST', '/api/auth/login', {
      body: { email: 'ANA@teste.com', password: 'SenhaForte123' },
    });
    assert.equal(login.status, 200);
  } finally {
    close();
  }
});

test('a resposta de login não revela se o e-mail existe', async () => {
  const { app, close } = await createTestApp();
  try {
    await request(app, 'POST', '/api/auth/register', {
      body: { name: 'Ana', email: 'ana@teste.com', password: 'SenhaForte123' },
    });

    const senhaErrada = await request(app, 'POST', '/api/auth/login', {
      body: { email: 'ana@teste.com', password: 'SenhaErrada123' },
    });
    const inexistente = await request(app, 'POST', '/api/auth/login', {
      body: { email: 'ninguem@teste.com', password: 'SenhaErrada123' },
    });

    assert.equal(senhaErrada.status, inexistente.status);
    assert.equal(senhaErrada.body.message, inexistente.body.message);
    assert.equal(senhaErrada.body.error, inexistente.body.error);
  } finally {
    close();
  }
});

test('o cookie de sessão é HttpOnly, SameSite e não contém a senha', async () => {
  const { app, close } = await createTestApp();
  try {
    await request(app, 'POST', '/api/auth/register', {
      body: { name: 'Ana', email: 'ana@teste.com', password: 'SenhaForte123' },
    });
    await activateClient(app, 'ana@teste.com');
    const login = await request(app, 'POST', '/api/auth/login', {
      body: { email: 'ana@teste.com', password: 'SenhaForte123' },
    });

    const cookie = login.headers['Set-Cookie'][0];
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Path=\//);
    assert.ok(!cookie.includes('SenhaForte123'));
    assert.ok(!JSON.stringify(login.body).includes('SenhaForte123'));
    assert.ok(!JSON.stringify(login.body).includes('password_hash'));
  } finally {
    close();
  }
});

test('no banco fica o hash do token, não o token do cookie', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const { token } = await createClient(app);
    const sessoes = await ctx.db.query('SELECT id FROM sessions');

    assert.equal(sessoes.length, 1);
    assert.notEqual(sessoes[0].id, token, 'o token cru não pode estar no banco');
    assert.equal(sessoes[0].id.length, 64, 'esperado SHA-256 em hexadecimal');
  } finally {
    close();
  }
});

test('logout invalida a sessão de verdade', async () => {
  const { app, close } = await createTestApp();
  try {
    const { token } = await createClient(app);

    const antes = await request(app, 'GET', '/api/auth/me', { token });
    assert.equal(antes.status, 200);

    const saida = await request(app, 'POST', '/api/auth/logout', { token });
    assert.equal(saida.status, 200);
    assert.match(saida.headers['Set-Cookie'][0], /Max-Age=0/);

    const depois = await request(app, 'GET', '/api/auth/me', { token });
    assert.equal(depois.status, 401, 'o token não pode mais funcionar');
  } finally {
    close();
  }
});

test('sessão vencida é recusada', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const { token } = await createClient(app);

    /* Empurra o vencimento para o passado. */
    await ctx.db.execute('UPDATE sessions SET expires_at = ?', [Date.now() - 1000]);

    const resposta = await request(app, 'GET', '/api/auth/me', { token });
    assert.equal(resposta.status, 401);
  } finally {
    close();
  }
});

test('token inventado ou alterado não autentica', async () => {
  const { app, close } = await createTestApp();
  try {
    const { token } = await createClient(app);

    for (const falso of ['abc', '', token + 'x', token.slice(0, -1), 'null']) {
      const resposta = await request(app, 'GET', '/api/auth/me', { token: falso });
      assert.equal(resposta.status, 401, `token "${falso}" não deveria funcionar`);
    }
  } finally {
    close();
  }
});

test('bloqueia após tentativas repetidas de login (força bruta)', async () => {
  const { app, close } = await createTestApp();
  try {
    await request(app, 'POST', '/api/auth/register', {
      body: { name: 'Ana', email: 'ana@teste.com', password: 'SenhaForte123' },
    });

    let bloqueado = null;
    for (let i = 0; i < SECURITY.LOGIN_MAX_ATTEMPTS + 1; i += 1) {
      bloqueado = await request(app, 'POST', '/api/auth/login', {
        body: { email: 'ana@teste.com', password: 'SenhaErrada123' },
      });
    }

    assert.equal(bloqueado.status, 429, 'deveria bloquear por excesso de tentativas');

    /* E o bloqueio vale mesmo com a senha correta. */
    const comSenhaCerta = await request(app, 'POST', '/api/auth/login', {
      body: { email: 'ana@teste.com', password: 'SenhaForte123' },
    });
    assert.equal(comSenhaCerta.status, 429);
  } finally {
    close();
  }
});

test('login bem-sucedido zera o contador de tentativas', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    await request(app, 'POST', '/api/auth/register', {
      body: { name: 'Ana', email: 'ana@teste.com', password: 'SenhaForte123' },
    });
    await activateClient(app, 'ana@teste.com');

    await request(app, 'POST', '/api/auth/login', {
      body: { email: 'ana@teste.com', password: 'errada123' },
    });
    assert.equal(await ctx.loginAttempts.countRecent('ana@teste.com'), 1);

    const ok = await request(app, 'POST', '/api/auth/login', {
      body: { email: 'ana@teste.com', password: 'SenhaForte123' },
    });
    assert.equal(ok.status, 200);
    assert.equal(await ctx.loginAttempts.countRecent('ana@teste.com'), 0);
  } finally {
    close();
  }
});

test('/auth/me não devolve identificador de sessão nem hash de senha', async () => {
  const { app, close } = await createTestApp();
  try {
    const { token } = await createClient(app);
    const resposta = await request(app, 'GET', '/api/auth/me', { token });

    assert.equal(resposta.status, 200);
    assert.ok(!('sessionId' in resposta.body.user), 'sessionId não pode vazar');
    assert.ok(!('password_hash' in resposta.body.user));

    const texto = JSON.stringify(resposta.body);
    assert.ok(!texto.includes('scrypt$'));
    assert.ok(!texto.includes(token), 'o token não pode aparecer no corpo');
  } finally {
    close();
  }
});
