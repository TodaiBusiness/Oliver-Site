/* =========================================================================
   /api/service/projects: a tela "Site" do Panel gerencia os projetos do site.
   ========================================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, createClient, request } from './helpers.js';
import { SYSTEM_USER } from '../../server/config.js';

const KEY = 'chave-de-servico-do-panel-0123456789abcdef';
const ACTOR = { actorId: '3', actorName: 'Kaique' };

const svc = (app, method, path, { key = KEY, body, query, headers } = {}) =>
  request(app, method, path, {
    body,
    query,
    headers: { ...(key ? { 'x-service-key': key } : {}), ...headers },
  });

const full = (over = {}) => ({
  ...ACTOR,
  title: 'Sistema de Gestão',
  tagline: 'Resumo curto',
  description: 'Descrição',
  problem: 'Problema',
  solution: 'Solução',
  features: ['A', 'B'],
  technologies: ['React'],
  category: 'Web',
  image: 'https://exemplo.com/a.png',
  link: 'https://exemplo.com',
  status: 'ENTREGUE',
  featured: false,
  isMockup: false,
  isPublic: true,
  ...over,
});

async function setup() {
  const t = await createTestApp({ serviceKey: KEY });
  return t;
}

const create = (app, over) => svc(app, 'POST', '/api/service/projects', { body: full(over) });

test('autenticação: sem chave/errada 401, sem env 503, com Origin 403', async () => {
  const { app, close } = await setup();
  try {
    let n = 0;
    for (const [m, p] of [
      ['GET', '/api/service/projects'],
      ['GET', '/api/service/projects/1'],
      ['POST', '/api/service/projects'],
      ['PUT', '/api/service/projects/1'],
      ['DELETE', '/api/service/projects/1'],
    ]) {
      for (const key of [null, 'errada', `${KEY}x`]) {
        n += 1;
        const r = await svc(app, m, p, { key, headers: { 'x-forwarded-for': `203.0.113.${n}` } });
        assert.equal(r.status, 401, `${m} ${p} ${key}`);
        assert.deepEqual(Object.keys(r.body).sort(), ['error', 'message']);
      }
      const o = await svc(app, m, p, { headers: { origin: 'https://evil.example', 'x-forwarded-for': '198.51.100.9' } });
      assert.equal(o.status, 403);
    }
  } finally {
    close();
  }
  const off = await createTestApp({ serviceKey: undefined });
  try {
    assert.equal((await svc(off.app, 'GET', '/api/service/projects')).status, 503);
  } finally {
    off.close();
  }
});

test('sessão de cliente (cookie) não abre os projetos de serviço', async () => {
  const { app, close } = await setup();
  try {
    const c = await createClient(app);
    const r = await request(app, 'GET', '/api/service/projects', { token: c.token });
    assert.equal(r.status, 401);
  } finally {
    close();
  }
});

test('CRUD completo: formato do contrato, slug, ordem e clientCount', async () => {
  const { app, close } = await setup();
  try {
    const c = await create(app);
    assert.equal(c.status, 201);
    const p = c.body.project;
    assert.equal(typeof p.id, 'string');
    assert.equal(p.slug, 'sistema-de-gestao');
    assert.equal(p.clientCount, 0);
    assert.deepEqual(p.features, ['A', 'B']);
    assert.equal(p.status, 'ENTREGUE');
    assert.equal(p.isPublic, true);
    assert.equal(new Date(p.createdAt).toISOString(), p.createdAt);
    assert.equal(new Date(p.updatedAt).toISOString(), p.updatedAt);
    assert.deepEqual(
      Object.keys(p).sort(),
      ['id', 'slug', 'title', 'tagline', 'description', 'problem', 'solution', 'features', 'technologies',
        'category', 'image', 'link', 'status', 'featured', 'isMockup', 'isPublic', 'clientCount',
        'createdAt', 'updatedAt'].sort()
    );

    const g = await svc(app, 'GET', `/api/service/projects/${p.id}`);
    assert.equal(g.status, 200);
    assert.deepEqual(g.body.project, p);

    const u = await svc(app, 'PUT', `/api/service/projects/${p.id}`, {
      body: full({ title: 'Outro Nome', featured: true, isPublic: false, status: 'RASCUNHO' }),
    });
    assert.equal(u.status, 200);
    assert.equal(u.body.project.slug, 'outro-nome');
    assert.equal(u.body.project.featured, true);
    assert.equal(u.body.project.isPublic, false);
    assert.equal(u.body.project.id, p.id);
    assert.equal(u.body.project.createdAt, p.createdAt);

    await create(app, { title: 'Segundo', isPublic: true });
    const l = await svc(app, 'GET', '/api/service/projects', { query: { limit: '50', page: '1' } });
    assert.equal(l.status, 200);
    assert.equal(l.body.projects.length, 2);
    assert.equal(l.body.projects[0].title, 'Outro Nome'); // featured primeiro, mesmo oculto
    assert.equal(l.body.projects[1].title, 'Segundo');

    assert.equal((await svc(app, 'GET', '/api/service/projects/9999')).status, 404);
    assert.equal((await svc(app, 'GET', '/api/service/projects/abc')).status, 400);
    assert.equal((await svc(app, 'GET', '/api/service/projects/1e3')).status, 400);
    assert.equal((await svc(app, 'PUT', '/api/service/projects/9999', { body: full() })).status, 404);

    const d = await svc(app, 'DELETE', `/api/service/projects/${p.id}`, { query: ACTOR });
    assert.equal(d.status, 204);
    assert.equal((await svc(app, 'GET', `/api/service/projects/${p.id}`)).status, 404);
    assert.equal((await svc(app, 'DELETE', `/api/service/projects/${p.id}`, { query: ACTOR })).status, 404);
  } finally {
    close();
  }
});

test('paginação da lista', async () => {
  const { app, close } = await setup();
  try {
    for (let i = 0; i < 3; i += 1) assert.equal((await create(app, { title: `Proj ${i}` })).status, 201);
    const a = await svc(app, 'GET', '/api/service/projects', { query: { limit: '2', page: '1' } });
    const b = await svc(app, 'GET', '/api/service/projects', { query: { limit: '2', page: '2' } });
    assert.equal(a.body.projects.length, 2);
    assert.equal(b.body.projects.length, 1);
    assert.notEqual(a.body.projects[0].id, b.body.projects[0].id);
  } finally {
    close();
  }
});

test('validação por campo: 400 DADOS_INVALIDOS com details em português', async () => {
  const { app, close } = await setup();
  try {
    const casos = [
      [{ title: '' }, 'title'],
      [{ title: 'x'.repeat(161) }, 'title'],
      [{ title: 123 }, 'title'],
      [{ tagline: 'x'.repeat(256) }, 'tagline'],
      [{ description: 'x'.repeat(4001) }, 'description'],
      [{ problem: 'x'.repeat(4001) }, 'problem'],
      [{ solution: 'x'.repeat(4001) }, 'solution'],
      [{ category: 'x'.repeat(81) }, 'category'],
      [{ image: 'x'.repeat(501) }, 'image'],
      [{ status: 'PUBLICADO' }, 'status'],
      [{ actorId: 'a b' }, 'actorId'],
      [{ actorId: 'x'.repeat(65) }, 'actorId'],
      [{ actorId: undefined }, 'actorId'],
      [{ actorName: '' }, 'actorName'],
      [{ actorName: 'x'.repeat(81) }, 'actorName'],
      [{ actorName: 'Ka<b>ique' }, 'actorName'],
      [{ actorName: 'Ka\nique' }, 'actorName'],
    ];
    for (const [over, campo] of casos) {
      const r = await create(app, over);
      assert.equal(r.status, 400, campo);
      assert.equal(r.body.error, 'DADOS_INVALIDOS');
      assert.ok(r.body.details[campo], `details.${campo}`);
      assert.ok(typeof r.body.message === 'string' && r.body.message);
    }
    const lista = await svc(app, 'GET', '/api/service/projects');
    assert.equal(lista.body.projects.length, 0);
    /* título no limite passa */
    assert.equal((await create(app, { title: 'x'.repeat(160) })).status, 201);
  } finally {
    close();
  }
});

test('slug duplicado: 409 no POST e no PUT; mesmo projeto mantém o próprio slug', async () => {
  const { app, close } = await setup();
  try {
    const a = (await create(app, { title: 'Meu Projeto' })).body.project;
    const dup = await create(app, { title: 'MEU projeto!' });
    assert.equal(dup.status, 409);
    const b = (await create(app, { title: 'Outro' })).body.project;
    assert.equal((await svc(app, 'PUT', `/api/service/projects/${b.id}`, { body: full({ title: 'Meu Projeto' }) })).status, 409);
    assert.equal((await svc(app, 'PUT', `/api/service/projects/${a.id}`, { body: full({ title: 'Meu Projeto', tagline: 'novo' }) })).status, 200);
  } finally {
    close();
  }
});

test('listas >30 são cortadas, link inválido vira null, acentos e emoji preservados', async () => {
  const { app, close } = await setup();
  try {
    const r = await create(app, {
      title: 'Ação Rápida 🚀',
      description: 'á'.repeat(4000),
      features: Array.from({ length: 45 }, (_, i) => `f${i}`),
      technologies: ['  ', 'Node', '✨'],
      link: 'javascript:alert(1)',
    });
    assert.equal(r.status, 201);
    const p = r.body.project;
    assert.equal(p.features.length, 30);
    assert.deepEqual(p.technologies, ['Node', '✨']);
    assert.equal(p.link, null);
    assert.equal(p.title, 'Ação Rápida 🚀');
    assert.equal(p.slug, 'acao-rapida');
    assert.equal(p.description.length, 4000);
    for (const link of ['ftp://x.com', 'data:text/html,x', 'não é url']) {
      assert.equal((await create(app, { title: `L ${link.length}`, link })).body.project.link, null);
    }
    assert.equal((await create(app, { title: 'Ok http', link: 'http://a.com/x' })).body.project.link, 'http://a.com/x');
  } finally {
    close();
  }
});

test('mass assignment: id, slug, createdAt e clientCount do corpo são ignorados', async () => {
  const { app, close } = await setup();
  try {
    const r = await create(app, { id: '999', slug: 'hack', createdAt: '2000-01-01T00:00:00Z', clientCount: 50, is_public: 0 });
    assert.equal(r.status, 201);
    assert.notEqual(r.body.project.id, '999');
    assert.equal(r.body.project.slug, 'sistema-de-gestao');
    assert.equal(r.body.project.clientCount, 0);
    assert.ok(r.body.project.createdAt.startsWith(String(new Date().getFullYear())));
  } finally {
    close();
  }
});

test('corpo acima de 32 KB: 413', async () => {
  const { app, close } = await setup();
  try {
    const r = await create(app, { features: Array.from({ length: 30 }, () => 'x'.repeat(1200)) });
    assert.equal(r.status, 413);
    assert.equal((await svc(app, 'PUT', '/api/service/projects/1', { body: full({ description: 'é'.repeat(40000) }) })).status, 413);
  } finally {
    close();
  }
});

test('exclusão com vínculo: 409 PROJETO_VINCULADO com clientCount e nada é apagado', async () => {
  const { app, ctx, close } = await setup();
  try {
    const p = (await create(app)).body.project;
    const c1 = await createClient(app);
    const c2 = await createClient(app);
    await ctx.projects.linkToUser(c1.id, Number(p.id));
    await ctx.projects.linkToUser(c2.id, Number(p.id));

    const g = await svc(app, 'GET', `/api/service/projects/${p.id}`);
    assert.equal(g.body.project.clientCount, 2);
    assert.equal((await svc(app, 'GET', '/api/service/projects')).body.projects[0].clientCount, 2);

    const d = await svc(app, 'DELETE', `/api/service/projects/${p.id}`, { query: ACTOR });
    assert.equal(d.status, 409);
    assert.equal(d.body.code, 'PROJETO_VINCULADO');
    assert.equal(d.body.clientCount, 2);
    assert.ok(d.body.message);
    assert.equal((await svc(app, 'GET', `/api/service/projects/${p.id}`)).status, 200);
    assert.equal((await ctx.projects.listForUser(c1.id)).length, 1);

    /* Ocultar (PUT isPublic=false) continua possível */
    const o = await svc(app, 'PUT', `/api/service/projects/${p.id}`, { body: full({ isPublic: false }) });
    assert.equal(o.body.project.isPublic, false);
    assert.equal(o.body.project.clientCount, 2);

    /* Sem o autor, nem tenta */
    assert.equal((await svc(app, 'DELETE', `/api/service/projects/${p.id}`)).status, 400);
  } finally {
    close();
  }
});

test('auditoria: usuário de sistema como userId e o ator em details; sem e-mail na resposta', async () => {
  const { app, ctx, db, close } = await setup();
  try {
    const p = (await create(app)).body.project;
    await svc(app, 'PUT', `/api/service/projects/${p.id}`, { body: full({ title: 'Editado' }) });
    await svc(app, 'DELETE', `/api/service/projects/${p.id}`, { query: { actorId: 'abc_9-Z', actorName: 'Ana Müller' } });

    const sistema = await ctx.users.findByEmailWithHash(SYSTEM_USER.EMAIL);
    const rows = await db.query(
      `SELECT user_id, action, resource_type, resource_id, details FROM audit_logs
        WHERE resource_type = 'project' ORDER BY id`
    );
    assert.deepEqual(rows.map((r) => r.action), ['PROJETO_CRIADO', 'PROJETO_EDITADO', 'PROJETO_EXCLUIDO']);
    for (const r of rows) {
      assert.equal(r.user_id, sistema.id);
      assert.equal(r.resource_id, p.id);
    }
    assert.deepEqual(JSON.parse(rows[0].details), { title: 'Sistema de Gestão', actorId: '3', actorName: 'Kaique' });
    assert.deepEqual(JSON.parse(rows[2].details), { title: 'Editado', actorId: 'abc_9-Z', actorName: 'Ana Müller' });
    /* nunca a descrição */
    assert.ok(!rows.some((r) => r.details.includes('Descrição')));
  } finally {
    close();
  }
});

test('não vaza campos internos nem o e-mail do usuário de sistema', async () => {
  const { app, close } = await setup();
  try {
    const r = await create(app);
    const texto = JSON.stringify(r.body) + JSON.stringify((await svc(app, 'GET', '/api/service/projects')).body);
    assert.ok(!texto.includes(SYSTEM_USER.EMAIL));
    assert.ok(!/is_public|is_mockup|created_at|password|user_id/.test(texto));
  } finally {
    close();
  }
});

test('/api/projects (público): projeto público aparece; rascunho/oculto não; sem campos de serviço', async () => {
  const { app, close } = await setup();
  try {
    const pub = (await create(app, { title: 'Visível', isPublic: true })).body.project;
    const oculto = (await create(app, { title: 'Escondido', isPublic: false })).body.project;
    const rasc = (await create(app, { title: 'Rascunho', status: 'RASCUNHO', isPublic: false })).body.project;

    let r = await request(app, 'GET', '/api/projects');
    let titulos = r.body.projects.map((p) => p.title);
    assert.deepEqual(titulos, ['Visível']);
    assert.ok(!('clientCount' in r.body.projects[0]));

    await svc(app, 'PUT', `/api/service/projects/${oculto.id}`, { body: full({ title: 'Escondido', isPublic: true }) });
    r = await request(app, 'GET', '/api/projects');
    assert.deepEqual(r.body.projects.map((p) => p.title).sort(), ['Escondido', 'Visível']);

    await svc(app, 'PUT', `/api/service/projects/${pub.id}`, { body: full({ title: 'Visível', isPublic: false }) });
    r = await request(app, 'GET', '/api/projects');
    assert.deepEqual(r.body.projects.map((p) => p.title), ['Escondido']);
    assert.ok(rasc);
  } finally {
    close();
  }
});
