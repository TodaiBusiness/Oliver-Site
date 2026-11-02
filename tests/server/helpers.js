/* =========================================================================
   Infraestrutura dos testes de servidor.

   Cada teste roda contra um banco SQLite EM MEMÓRIA, criado e destruído no
   próprio teste. Nada é simulado: o schema é o de verdade, as queries são as
   de verdade e a API é chamada pelo mesmo caminho que o navegador usaria.
   ========================================================================= */

import { createTestDb } from '../../server/db/index.js';
import { createApp } from '../../server/app.js';
import { createContext } from '../../server/context.js';
import { hashPassword } from '../../server/security/password.js';
import { ROLES, SECURITY } from '../../server/config.js';

/** Sobe uma aplicação limpa. */
export async function createTestApp() {
  const db = await createTestDb();
  await db.init();

  const app = createApp(db);
  const ctx = createContext(db);

  return { app, db, ctx, close: () => db.close() };
}

/** Extrai o token de sessão do cabeçalho Set-Cookie. */
export function extractSessionToken(response) {
  const cookies = response.headers['Set-Cookie'] ?? [];
  for (const cookie of cookies) {
    const match = new RegExp(`${SECURITY.SESSION_COOKIE}=([^;]*)`).exec(cookie);
    if (match && match[1]) return decodeURIComponent(match[1]);
  }
  return null;
}

/** Chamada à API. `token` vira cookie, como no navegador. */
export function request(app, method, path, { body, token, query, headers } = {}) {
  return app.handle({
    method,
    path,
    query: query ?? {},
    body: body ?? {},
    headers: {
      ...(token ? { cookie: `${SECURITY.SESSION_COOKIE}=${encodeURIComponent(token)}` } : {}),
      ...headers,
    },
  });
}

/** Cria um cliente pela API e devolve o token de sessão. */
export async function createClient(app, overrides = {}) {
  const user = {
    name: 'Cliente Teste',
    company: 'Empresa Teste',
    email: `cliente${Math.random().toString(36).slice(2, 9)}@teste.com`,
    phone: '12999999999',
    password: 'SenhaForte123',
    ...overrides,
  };

  await request(app, 'POST', '/api/auth/register', { body: user });
  const login = await request(app, 'POST', '/api/auth/login', {
    body: { email: user.email, password: user.password },
  });

  return { user, token: extractSessionToken(login), id: login.body.user.id };
}

/** Cria um ADMIN direto no banco (não existe rota que promova alguém). */
export async function createAdmin(ctx, app, password = 'AdminForte123') {
  const email = `admin${Math.random().toString(36).slice(2, 9)}@teste.com`;

  const id = await ctx.users.create({
    name: 'Admin Teste',
    company: 'TODAI',
    email,
    phone: null,
    passwordHash: await hashPassword(password),
    role: ROLES.ADMIN,
  });

  const login = await request(app, 'POST', '/api/auth/login', {
    body: { email, password },
  });

  return { id, email, password, token: extractSessionToken(login) };
}
