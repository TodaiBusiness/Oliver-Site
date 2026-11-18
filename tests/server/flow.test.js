/* =========================================================================
   Fluxo completo, na ordem em que acontece na vida real:
   cliente se cadastra → faz login → abre solicitação → conversa com o admin
   → admin muda o status → cliente vê a atualização.
   ========================================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { activateClient, createTestApp, createAdmin, extractSessionToken, request } from './helpers.js';
import { REQUEST_STATUS } from '../../server/config.js';

test('jornada completa: cadastro → solicitação → conversa → status', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    /* 1. Admin já existe (criado pelo seed em produção). */
    const admin = await createAdmin(ctx, app);
    assert.ok(admin.token, 'admin deve conseguir logar');

    /* 2. Cliente se cadastra. */
    const cadastro = await request(app, 'POST', '/api/auth/register', {
      body: {
        name: 'Marina Alves',
        company: 'Padaria Central',
        email: 'marina@padaria.com',
        phone: '12988887777',
        password: 'SenhaSegura123',
      },
    });
    assert.equal(cadastro.status, 201);
    assert.equal(cadastro.body.status, 'PENDING');
    assert.equal(cadastro.body.user, undefined);
    assert.equal((await ctx.users.findByEmailWithHash('marina@padaria.com')).role, 'CLIENT');

    /* 3. Só entra depois de autorizado. */
    const antes = await request(app, 'POST', '/api/auth/login', {
      body: { email: 'marina@padaria.com', password: 'SenhaSegura123' },
    });
    assert.equal(antes.status, 403);
    await activateClient(app, 'marina@padaria.com');
    const login = await request(app, 'POST', '/api/auth/login', {
      body: { email: 'marina@padaria.com', password: 'SenhaSegura123' },
    });
    assert.equal(login.status, 200);
    const clienteToken = extractSessionToken(login);

    /* 4. Painel vazio — sem inventar dado. */
    const painelVazio = await request(app, 'GET', '/api/me/summary', {
      token: clienteToken,
    });
    assert.deepEqual(painelVazio.body.summary, {
      projects: 0,
      requests: 0,
      unreadMessages: 0,
    });

    const semProjetos = await request(app, 'GET', '/api/me/projects', {
      token: clienteToken,
    });
    assert.deepEqual(semProjetos.body.projects, []);

    /* 5. Abre uma solicitação. */
    const solicitacao = await request(app, 'POST', '/api/me/requests', {
      token: clienteToken,
      body: {
        type: 'Sistema / ERP',
        description: 'Preciso controlar estoque e vendas das duas lojas.',
        budget: 'A combinar',
        deadline: '3 meses',
      },
    });
    assert.equal(solicitacao.status, 201);
    assert.equal(solicitacao.body.request.status, REQUEST_STATUS.NEW);
    const requestId = solicitacao.body.request.id;

    /* 6. Admin vê a solicitação na lista. */
    const listaAdmin = await request(app, 'GET', '/api/admin/requests', {
      token: admin.token,
    });
    assert.equal(listaAdmin.status, 200);
    assert.equal(listaAdmin.body.requests.length, 1);
    assert.equal(listaAdmin.body.requests[0].user_email, 'marina@padaria.com');

    /* 7. Admin responde. */
    const resposta = await request(app, 'POST', `/api/requests/${requestId}/messages`, {
      token: admin.token,
      body: { body: 'Oi Marina! Consigo te ajudar. Vamos conversar sobre o estoque?' },
    });
    assert.equal(resposta.status, 201);

    /* 8. Cliente vê a mensagem não lida no resumo. */
    const comMensagem = await request(app, 'GET', '/api/me/summary', {
      token: clienteToken,
    });
    assert.equal(comMensagem.body.summary.unreadMessages, 1);
    assert.equal(comMensagem.body.summary.requests, 1);

    /* 9. Cliente lê a conversa (e isso marca como lida). */
    const conversa = await request(app, 'GET', `/api/requests/${requestId}/messages`, {
      token: clienteToken,
    });
    assert.equal(conversa.body.messages.length, 1);
    assert.equal(conversa.body.messages[0].author_role, 'ADMIN');

    const depoisDeLer = await request(app, 'GET', '/api/me/summary', {
      token: clienteToken,
    });
    assert.equal(depoisDeLer.body.summary.unreadMessages, 0, 'deve zerar após leitura');

    /* 10. Cliente responde. */
    const treplica = await request(app, 'POST', `/api/requests/${requestId}/messages`, {
      token: clienteToken,
      body: { body: 'Perfeito! Podemos falar amanhã de manhã.' },
    });
    assert.equal(treplica.status, 201);

    /* 11. Admin muda o status. */
    const mudanca = await request(app, 'PATCH', `/api/admin/requests/${requestId}/status`, {
      token: admin.token,
      body: { status: REQUEST_STATUS.IN_PROGRESS },
    });
    assert.equal(mudanca.status, 200);

    /* 12. Cliente enxerga o novo status. */
    const atualizada = await request(app, 'GET', `/api/requests/${requestId}`, {
      token: clienteToken,
    });
    assert.equal(atualizada.body.request.status, REQUEST_STATUS.IN_PROGRESS);

    /* 13. Logout encerra a sessão. */
    await request(app, 'POST', '/api/auth/logout', { token: clienteToken });
    const depoisDoLogout = await request(app, 'GET', '/api/me/summary', {
      token: clienteToken,
    });
    assert.equal(depoisDoLogout.status, 401);

    /* 14. A auditoria registrou as ações relevantes. */
    const auditoria = await request(app, 'GET', '/api/admin/audit', {
      token: admin.token,
      query: { limit: '50' },
    });
    const acoes = auditoria.body.logs.map((log) => log.action);

    assert.ok(acoes.includes('USUARIO_CRIADO'));
    assert.ok(acoes.includes('LOGIN'));
    assert.ok(acoes.includes('SOLICITACAO_CRIADA'));
    assert.ok(acoes.includes('MENSAGEM_ENVIADA'));
    assert.ok(acoes.includes('SOLICITACAO_STATUS_ALTERADO'));
    assert.ok(acoes.includes('LOGOUT'));

    /* Nenhuma senha ou token pode ter ido parar na auditoria. */
    const auditoriaTexto = JSON.stringify(auditoria.body);
    assert.ok(!auditoriaTexto.includes('SenhaSegura123'));
    assert.ok(!auditoriaTexto.includes('scrypt$'));
  } finally {
    close();
  }
});

test('CRUD de projeto pelo admin reflete no site público', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);

    /* Site começa sem projeto. */
    const inicial = await request(app, 'GET', '/api/projects');
    assert.deepEqual(inicial.body.projects, []);

    /* CRIAR */
    const criado = await request(app, 'POST', '/api/admin/projects', {
      token: admin.token,
      body: {
        title: 'Sistema de Gestão Empresarial',
        tagline: 'Estoque, vendas, PDV e comandas.',
        problem: 'Processos separados.',
        solution: 'Sistema integrado.',
        features: ['Estoque', 'PDV', 'Comandas'],
        technologies: ['C#', 'MySQL'],
        category: 'Sistema Desktop',
        status: 'EM_DESENVOLVIMENTO',
        featured: true,
        isPublic: true,
      },
    });
    assert.equal(criado.status, 201);
    assert.equal(criado.body.project.slug, 'sistema-de-gestao-empresarial');
    assert.deepEqual(criado.body.project.technologies, ['C#', 'MySQL']);
    const projectId = criado.body.project.id;

    /* Aparece no site público. */
    const publico = await request(app, 'GET', '/api/projects');
    assert.equal(publico.body.projects.length, 1);
    assert.equal(publico.body.projects[0].title, 'Sistema de Gestão Empresarial');

    /* EDITAR */
    const editado = await request(app, 'PUT', `/api/admin/projects/${projectId}`, {
      token: admin.token,
      body: {
        title: 'Sistema de Gestão Empresarial',
        tagline: 'Agora com relatórios.',
        technologies: ['C#', 'MySQL', 'Relatórios'],
        status: 'ENTREGUE',
        isPublic: true,
      },
    });
    assert.equal(editado.status, 200);
    assert.equal(editado.body.project.tagline, 'Agora com relatórios.');
    assert.equal(editado.body.project.status, 'ENTREGUE');

    /* Despublicar tira do site sem apagar. */
    await request(app, 'PUT', `/api/admin/projects/${projectId}`, {
      token: admin.token,
      body: { title: 'Sistema de Gestão Empresarial', isPublic: false },
    });
    const escondido = await request(app, 'GET', '/api/projects');
    assert.equal(escondido.body.projects.length, 0, 'não deve aparecer no site');

    const aindaNoAdmin = await request(app, 'GET', '/api/admin/projects', {
      token: admin.token,
    });
    assert.equal(aindaNoAdmin.body.projects.length, 1, 'mas continua no painel');

    /* EXCLUIR */
    const excluido = await request(app, 'DELETE', `/api/admin/projects/${projectId}`, {
      token: admin.token,
    });
    assert.equal(excluido.status, 200);

    const depois = await request(app, 'GET', '/api/admin/projects', { token: admin.token });
    assert.equal(depois.body.projects.length, 0);

    /* Excluir de novo devolve 404, não erro 500. */
    const denovo = await request(app, 'DELETE', `/api/admin/projects/${projectId}`, {
      token: admin.token,
    });
    assert.equal(denovo.status, 404);
  } finally {
    close();
  }
});

test('dois projetos com o mesmo título são recusados (slug único)', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);
    const body = { title: 'Projeto Repetido', technologies: [] };

    const primeiro = await request(app, 'POST', '/api/admin/projects', {
      token: admin.token,
      body,
    });
    const segundo = await request(app, 'POST', '/api/admin/projects', {
      token: admin.token,
      body,
    });

    assert.equal(primeiro.status, 201);
    assert.equal(segundo.status, 409);
  } finally {
    close();
  }
});

test('o resumo administrativo traz números reais do banco', async () => {
  const { app, ctx, close } = await createTestApp();
  try {
    const admin = await createAdmin(ctx, app);

    const vazio = await request(app, 'GET', '/api/admin/summary', { token: admin.token });
    assert.deepEqual(vazio.body.summary, {
      clients: 0,
      projects: 0,
      requests: 0,
      pendingRequests: 0,
      messages: 0,
    });

    const { token } = await (await import('./helpers.js')).createClient(app);
    await request(app, 'POST', '/api/me/requests', {
      token,
      body: { type: 'Site', description: 'Uma descrição suficientemente longa.' },
    });
    await request(app, 'POST', '/api/admin/projects', {
      token: admin.token,
      body: { title: 'Projeto do resumo', technologies: [] },
    });

    const cheio = await request(app, 'GET', '/api/admin/summary', { token: admin.token });
    assert.equal(cheio.body.summary.clients, 1);
    assert.equal(cheio.body.summary.projects, 1);
    assert.equal(cheio.body.summary.requests, 1);
    assert.equal(cheio.body.summary.pendingRequests, 1);
  } finally {
    close();
  }
});
