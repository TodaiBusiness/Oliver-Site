/* =========================================================================
   Integridade do banco: chaves estrangeiras, constraints, cascata e índices.
   ========================================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, createClient, request } from './helpers.js';

test('todas as tabelas são criadas pelo schema', async () => {
  const { db, close } = await createTestApp();
  try {
    const esperadas = [
      'users',
      'projects',
      'client_projects',
      'project_requests',
      'messages',
      'sessions',
      'login_attempts',
      'audit_logs',
    ];

    const rows = await db.query("SELECT name FROM sqlite_master WHERE type = 'table'");
    const existentes = rows.map((row) => row.name);

    for (const tabela of esperadas) {
      assert.ok(existentes.includes(tabela), `faltou a tabela ${tabela}`);
    }
  } finally {
    close();
  }
});

test('os índices previstos existem', async () => {
  const { db, close } = await createTestApp();
  try {
    const rows = await db.query("SELECT name FROM sqlite_master WHERE type = 'index'");
    const nomes = rows.map((row) => row.name);

    for (const indice of [
      'ix_requests_user',
      'ix_requests_status',
      'ix_messages_request',
      'ix_sessions_user',
      'ix_sessions_expires',
      'ix_attempts_email',
      'ix_audit_user',
    ]) {
      assert.ok(nomes.includes(indice), `faltou o índice ${indice}`);
    }
  } finally {
    close();
  }
});

test('e-mail duplicado é barrado pela constraint UNIQUE', async () => {
  const { db, ctx, close } = await createTestApp();
  try {
    await ctx.users.create({
      name: 'Ana',
      company: null,
      email: 'ana@teste.com',
      phone: null,
      passwordHash: 'scrypt$x',
    });

    await assert.rejects(
      () =>
        ctx.users.create({
          name: 'Outra Ana',
          company: null,
          email: 'ana@teste.com',
          phone: null,
          passwordHash: 'scrypt$y',
        }),
      /UNIQUE|constraint/i,
      'o banco deve recusar e-mail repetido'
    );

    /* Fora o usuário de sistema que a migração cria. */
    const total = await db.queryOne(
      "SELECT COUNT(*) AS total FROM users WHERE email <> 'atendimento@sistema.todai.invalid'"
    );
    assert.equal(Number(total.total), 1);
  } finally {
    close();
  }
});

test('papel fora do previsto é barrado pelo CHECK', async () => {
  const { db, close } = await createTestApp();
  try {
    await assert.rejects(
      () =>
        db.execute(
          `INSERT INTO users (name, email, password_hash, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          ['Hacker', 'h@teste.com', 'x', 'SUPERADMIN', Date.now(), Date.now()]
        ),
      /CHECK|constraint/i
    );
  } finally {
    close();
  }
});

test('solicitação sem usuário existente é barrada pela chave estrangeira', async () => {
  const { db, close } = await createTestApp();
  try {
    await assert.rejects(
      () =>
        db.execute(
          `INSERT INTO project_requests
             (user_id, type, description, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [9999, 'Site', 'descrição', 'NOVO', Date.now(), Date.now()]
        ),
      /FOREIGN KEY|constraint/i
    );
  } finally {
    close();
  }
});

test('excluir o usuário leva junto sessões, solicitações e mensagens', async () => {
  const { app, db, close } = await createTestApp();
  try {
    const cliente = await createClient(app);

    const criada = await request(app, 'POST', '/api/me/requests', {
      token: cliente.token,
      body: { type: 'Site', description: 'Uma descrição suficientemente longa.' },
    });
    await request(app, 'POST', `/api/requests/${criada.body.request.id}/messages`, {
      token: cliente.token,
      body: { body: 'Mensagem de teste da cascata.' },
    });

    const antes = async (tabela) =>
      Number((await db.queryOne(`SELECT COUNT(*) AS total FROM ${tabela}`)).total);

    assert.equal(await antes('sessions'), 1);
    assert.equal(await antes('project_requests'), 1);
    assert.equal(await antes('messages'), 1);

    await db.execute('DELETE FROM users WHERE id = ?', [cliente.id]);

    assert.equal(await antes('sessions'), 0, 'sessões devem cair junto');
    assert.equal(await antes('project_requests'), 0, 'solicitações devem cair junto');
    assert.equal(await antes('messages'), 0, 'mensagens devem cair junto');
  } finally {
    close();
  }
});

test('excluir o projeto desfaz o vínculo com o cliente', async () => {
  const { app, db, ctx, close } = await createTestApp();
  try {
    const cliente = await createClient(app);
    const projectId = await ctx.projects.create({
      title: 'Projeto vinculado',
      slug: 'projeto-vinculado',
      tagline: null,
      description: null,
      problem: null,
      solution: null,
      features: '[]',
      technologies: '[]',
      category: null,
      image: null,
      link: null,
      status: 'ENTREGUE',
      featured: 0,
      isMockup: 1,
      isPublic: 1,
    });

    await ctx.projects.linkToUser(cliente.id, projectId);

    const meus = await request(app, 'GET', '/api/me/projects', { token: cliente.token });
    assert.equal(meus.body.projects.length, 1);

    await db.execute('DELETE FROM projects WHERE id = ?', [projectId]);

    const vinculos = await db.queryOne('SELECT COUNT(*) AS total FROM client_projects');
    assert.equal(Number(vinculos.total), 0, 'o vínculo deve cair junto');
  } finally {
    close();
  }
});

test('a transação desfaz tudo quando algo falha no meio', async () => {
  const { db, close } = await createTestApp();
  try {
    await assert.rejects(() =>
      db.transaction(async (trx) => {
        await trx.execute(
          `INSERT INTO users (name, email, password_hash, role, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
          ['Ana', 'ana@teste.com', 'x', 'CLIENT', Date.now(), Date.now()]
        );
        throw new Error('falha proposital no meio da transação');
      })
    );

    const total = await db.queryOne(
      "SELECT COUNT(*) AS total FROM users WHERE email <> 'atendimento@sistema.todai.invalid'"
    );
    assert.equal(Number(total.total), 0, 'o INSERT deveria ter sido revertido');
  } finally {
    close();
  }
});
