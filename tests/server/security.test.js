/* =========================================================================
   Testes de segurança atacando a API diretamente.
   Cada teste representa uma tentativa real de abuso.
   ========================================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, createAdmin, createClient, request } from './helpers.js';
import { ROLES } from '../../server/config.js';

/* ------------------------------------------------------- SQL injection */

test('SQL injection no login não autentica nem quebra o banco', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    await request(app, 'POST', '/api/auth/register', {
      body: { name: 'Ana', email: 'ana@teste.com', password: 'SenhaForte123' },
    });

    const payloads = [
      "' OR '1'='1",
      "ana@teste.com' --",
      "ana@teste.com'; DROP TABLE users; --",
      "' OR 1=1 --",
      "admin'/*",
      "' UNION SELECT 1,2,3,4 --",
    ];

    for (const payload of payloads) {
      const porEmail = await request(app, 'POST', '/api/auth/login', {
        body: { email: payload, password: 'qualquer' },
      });
      assert.ok(
        porEmail.status >= 400,
        `payload não podia autenticar: ${payload}`
      );

      const porSenha = await request(app, 'POST', '/api/auth/login', {
        body: { email: 'ana@teste.com', password: payload },
      });
      assert.ok(porSenha.status >= 400, `payload na senha: ${payload}`);
    }

    /* A tabela continua de pé e o usuário existe. */
    const usuarios = await ctx.db.query("SELECT id FROM users WHERE role = 'CLIENT'");
    assert.equal(usuarios.length, 1, 'nenhuma tabela pode ter sido destruída');
  } finally {
    close();
  }
});

test('SQL injection na busca de clientes é tratada como texto', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    await createClient(app, { name: 'Cliente Real', email: 'real@teste.com' });

    const resposta = await request(app, 'GET', '/api/admin/clients', {
      token: admin.token,
      query: { search: "%' OR '1'='1" },
    });

    assert.equal(resposta.status, 200);
    assert.equal(
      resposta.body.clients.length,
      0,
      'a injeção não pode virar filtro verdadeiro'
    );

    const usuarios = await ctx.db.query("SELECT id FROM users WHERE email <> 'atendimento@sistema.todai.invalid'");
    assert.equal(usuarios.length, 2, 'banco intacto');
  } finally {
    close();
  }
});

test('id malicioso na URL é recusado antes de chegar ao banco', async () => {
  const { app, close } = await createTestApp();
  try {
    const cliente = await createClient(app);

    for (const id of ['1 OR 1=1', "1'--", 'abc', '-1', '0', '1;DROP TABLE users']) {
      const resposta = await request(app, 'GET', `/api/requests/${id}`, {
        token: cliente.token,
      });
      assert.ok(
        resposta.status === 400 || resposta.status === 404,
        `id "${id}" deveria ser recusado, veio ${resposta.status}`
      );
    }
  } finally {
    close();
  }
});

/* -------------------------------------------- acesso sem autenticação */

test('rotas protegidas exigem sessão', async () => {
  const { app, close } = await createTestApp();
  try {
    const rotas = [
      ['GET', '/api/auth/me'],
      ['GET', '/api/me/projects'],
      ['GET', '/api/me/requests'],
      ['POST', '/api/me/requests'],
      ['GET', '/api/requests/1'],
      ['GET', '/api/requests/1/messages'],
      ['POST', '/api/requests/1/messages'],
      ['GET', '/api/admin/summary'],
      ['GET', '/api/admin/clients'],
      ['GET', '/api/admin/requests'],
      ['GET', '/api/admin/projects'],
      ['POST', '/api/admin/projects'],
      ['PUT', '/api/admin/projects/1'],
      ['DELETE', '/api/admin/projects/1'],
      ['GET', '/api/admin/audit'],
    ];

    for (const [method, path] of rotas) {
      const resposta = await request(app, method, path);
      assert.equal(resposta.status, 401, `${method} ${path} deveria exigir login`);
    }
  } finally {
    close();
  }
});

/* --------------------------------- autorização por papel (admin only) */

test('cliente não acessa nenhuma rota administrativa', async () => {
  const { app, close } = await createTestApp();
  try {
    const cliente = await createClient(app);

    const rotas = [
      ['GET', '/api/admin/summary'],
      ['GET', '/api/admin/clients'],
      ['GET', '/api/admin/requests'],
      ['GET', '/api/admin/projects'],
      ['POST', '/api/admin/projects'],
      ['PUT', '/api/admin/projects/1'],
      ['DELETE', '/api/admin/projects/1'],
      ['GET', '/api/admin/audit'],
      ['PATCH', '/api/admin/requests/1/status'],
    ];

    for (const [method, path] of rotas) {
      const resposta = await request(app, method, path, { token: cliente.token });
      assert.equal(resposta.status, 403, `${method} ${path} deveria dar 403`);
    }
  } finally {
    close();
  }
});

/* ------------------------------------------------- escalada de papel */

test('não dá para virar ADMIN pelo cadastro', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const resposta = await request(app, 'POST', '/api/auth/register', {
      body: {
        name: 'Esperto',
        email: 'esperto@teste.com',
        password: 'SenhaForte123',
        role: 'ADMIN',
        isAdmin: true,
        user_role: 'ADMIN',
      },
    });

    assert.equal(resposta.status, 201);
    assert.equal(resposta.body.status, 'PENDING');

    const noBanco = await ctx.users.findByEmailWithHash('esperto@teste.com');
    assert.equal(noBanco.role, ROLES.CLIENT, 'o papel não pode vir da requisição');
  } finally {
    close();
  }
});

test('cliente com papel forjado no corpo continua sem acesso admin', async () => {
  const { app, close } = await createTestApp();
  try {
    const cliente = await createClient(app);

    const resposta = await request(app, 'POST', '/api/admin/projects', {
      token: cliente.token,
      body: { title: 'Invasão', role: 'ADMIN' },
    });

    assert.equal(resposta.status, 403);
  } finally {
    close();
  }
});

/* ------------------------------------------------------------- IDOR */

test('cliente não lê a solicitação de outro cliente', async () => {
  const { app, close } = await createTestApp();
  try {
    const ana = await createClient(app, { email: 'ana@teste.com' });
    const bruno = await createClient(app, { email: 'bruno@teste.com' });

    const criada = await request(app, 'POST', '/api/me/requests', {
      token: ana.token,
      body: { type: 'Site', description: 'Preciso de um site institucional novo.' },
    });
    assert.equal(criada.status, 201);
    const requestId = criada.body.request.id;

    /* Bruno tenta trocar o id na URL. */
    const leitura = await request(app, 'GET', `/api/requests/${requestId}`, {
      token: bruno.token,
    });
    assert.equal(leitura.status, 404, 'não deve confirmar nem que existe');

    const mensagens = await request(app, 'GET', `/api/requests/${requestId}/messages`, {
      token: bruno.token,
    });
    assert.equal(mensagens.status, 404);

    const escrita = await request(app, 'POST', `/api/requests/${requestId}/messages`, {
      token: bruno.token,
      body: { body: 'Consigo escrever aqui?' },
    });
    assert.equal(escrita.status, 404, 'não pode escrever em conversa alheia');
  } finally {
    close();
  }
});

test('a lista de solicitações traz apenas as do próprio cliente', async () => {
  const { app, close } = await createTestApp();
  try {
    const ana = await createClient(app, { email: 'ana@teste.com' });
    const bruno = await createClient(app, { email: 'bruno@teste.com' });

    await request(app, 'POST', '/api/me/requests', {
      token: ana.token,
      body: { type: 'Site', description: 'Solicitação da Ana, bem detalhada.' },
    });
    await request(app, 'POST', '/api/me/requests', {
      token: bruno.token,
      body: { type: 'Automação', description: 'Solicitação do Bruno, detalhada.' },
    });

    const lista = await request(app, 'GET', '/api/me/requests', { token: ana.token });

    assert.equal(lista.body.requests.length, 1);
    assert.match(lista.body.requests[0].description, /Ana/);
  } finally {
    close();
  }
});

test('admin enxerga a solicitação de qualquer cliente', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    const ana = await createClient(app, { email: 'ana@teste.com' });

    const criada = await request(app, 'POST', '/api/me/requests', {
      token: ana.token,
      body: { type: 'Site', description: 'Preciso de um site institucional novo.' },
    });

    const vista = await request(app, 'GET', `/api/requests/${criada.body.request.id}`, {
      token: admin.token,
    });

    assert.equal(vista.status, 200);
    assert.equal(vista.body.request.user_email, 'ana@teste.com');
  } finally {
    close();
  }
});

/* -------------------------------------------------- mass assignment */

test('campos não declarados são ignorados na criação de solicitação', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const ana = await createClient(app, { email: 'ana@teste.com' });
    const bruno = await createClient(app, { email: 'bruno@teste.com' });

    const criada = await request(app, 'POST', '/api/me/requests', {
      token: ana.token,
      body: {
        type: 'Site',
        description: 'Uma descrição suficientemente longa aqui.',
        status: 'CONCLUIDO', // tentativa de definir o status
        user_id: bruno.id, // tentativa de criar em nome de outro
        id: 999,
      },
    });

    assert.equal(criada.status, 201);
    assert.equal(criada.body.request.status, 'NOVO', 'status inicial é do servidor');

    const noBanco = await ctx.db.queryOne(
      'SELECT user_id, status FROM project_requests WHERE id = ?',
      [criada.body.request.id]
    );
    assert.equal(noBanco.user_id, ana.id, 'dono é sempre quem está logado');
    assert.equal(noBanco.status, 'NOVO');
  } finally {
    close();
  }
});

test('status inválido é recusado na atualização administrativa', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    const ana = await createClient(app);

    const criada = await request(app, 'POST', '/api/me/requests', {
      token: ana.token,
      body: { type: 'Site', description: 'Uma descrição suficientemente longa.' },
    });

    const invalido = await request(
      app,
      'PATCH',
      `/api/admin/requests/${criada.body.request.id}/status`,
      { token: admin.token, body: { status: 'INVENTADO' } }
    );
    assert.equal(invalido.status, 400);

    const valido = await request(
      app,
      'PATCH',
      `/api/admin/requests/${criada.body.request.id}/status`,
      { token: admin.token, body: { status: 'EM_DESENVOLVIMENTO' } }
    );
    assert.equal(valido.status, 200);
    assert.equal(valido.body.request.status, 'EM_DESENVOLVIMENTO');
  } finally {
    close();
  }
});

/* --------------------------------------------------- XSS armazenado */

test('link de projeto com javascript: é descartado', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);

    const criado = await request(app, 'POST', '/api/admin/projects', {
      token: admin.token,
      body: {
        title: 'Projeto com link malicioso',
        link: 'javascript:alert(document.cookie)',
        technologies: ['C#'],
      },
    });

    assert.equal(criado.status, 201);
    assert.equal(criado.body.project.link, null, 'javascript: não pode ser gravado');

    const comData = await request(app, 'POST', '/api/admin/projects', {
      token: admin.token,
      body: { title: 'Outro projeto', link: 'data:text/html,<script>alert(1)</script>' },
    });
    assert.equal(comData.body.project.link, null);

    const valido = await request(app, 'POST', '/api/admin/projects', {
      token: admin.token,
      body: { title: 'Projeto valido', link: 'https://exemplo.com' },
    });
    assert.equal(valido.body.project.link, 'https://exemplo.com');
  } finally {
    close();
  }
});

test('texto com HTML é guardado como texto, sem interpretar', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const ana = await createClient(app);
    const payload = '<script>alert("xss")</script> preciso de um site.';

    const criada = await request(app, 'POST', '/api/me/requests', {
      token: ana.token,
      body: { type: 'Site', description: payload },
    });

    assert.equal(criada.status, 201);
    /* O dado é preservado literalmente; quem escapa é o React na exibição. */
    assert.equal(criada.body.request.description, payload);
  } finally {
    close();
  }
});

/* ------------------------------------------------- payloads inválidos */

test('corpo estranho não derruba a API', async () => {
  const { app, close } = await createTestApp();
  try {
    const entradas = [
      null,
      undefined,
      'texto puro',
      42,
      [],
      { email: { $ne: null }, password: { $ne: null } }, // tentativa NoSQL
      { email: ['a@b.com'], password: ['x'] },
    ];

    for (const body of entradas) {
      const resposta = await request(app, 'POST', '/api/auth/login', { body });
      assert.ok(
        resposta.status >= 400 && resposta.status < 500,
        `esperado erro de cliente, veio ${resposta.status}`
      );
      assert.ok(resposta.body.message, 'deve haver mensagem de erro');
    }
  } finally {
    close();
  }
});

test('paginação não aceita limite absurdo', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);

    const resposta = await request(app, 'GET', '/api/admin/clients', {
      token: admin.token,
      query: { limit: '999999999', page: '-5' },
    });

    assert.equal(resposta.status, 200, 'não pode explodir');
    assert.ok(Array.isArray(resposta.body.clients));
  } finally {
    close();
  }
});

test('erro interno não vaza detalhe do banco para o cliente', async () => {
  const { app, close } = await createTestApp();
  try {
    const resposta = await request(app, 'GET', '/api/rota/que/nao/existe');
    assert.equal(resposta.status, 404);
    assert.ok(!JSON.stringify(resposta.body).toLowerCase().includes('sqlite'));
    assert.ok(!JSON.stringify(resposta.body).toLowerCase().includes('select'));
  } finally {
    close();
  }
});
