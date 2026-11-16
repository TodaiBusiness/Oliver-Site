/* =========================================================================
   Endpoints de serviço (/api/service/*): a API do Panel lê e responde as
   conversas dos clientes. Cada teste é uma tentativa de abrir o que não deve.
   ========================================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, createAdmin, createClient, request } from './helpers.js';
import { createServiceAuth } from '../../server/http/serviceAuth.js';
import { bodyLimitFor } from '../../server/app.js';
import { SYSTEM_USER } from '../../server/config.js';

const KEY = 'chave-de-servico-do-panel-0123456789abcdef';
const ADMIN_GUID = '3'; // id do admin no Panel: bigint como texto
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const svc = (app, method, path, { key = KEY, body, query, headers, token } = {}) =>
  request(app, method, path, {
    body,
    query,
    token,
    headers: { ...(key ? { 'x-service-key': key } : {}), ...headers },
  });

async function conversa(app, cliente, texto = 'Olá, preciso de ajuda com o site.') {
  const sol = await request(app, 'POST', '/api/me/requests', {
    token: cliente.token,
    body: { type: 'Site', description: 'Preciso de um site institucional novo.' },
  });
  const id = sol.body.request.id;
  const msg = await request(app, 'POST', `/api/requests/${id}/messages`, {
    token: cliente.token,
    body: { body: texto },
  });
  assert.equal(msg.status, 201);
  return id;
}

/* ------------------------------------------------------------- autenticação */

test('sem SITE_SERVICE_API_KEY (ou curta) o serviço responde 503', async () => {
  for (const serviceKey of [undefined, '', 'curta-demais']) {
    const { app, close } = await createTestApp({ serviceKey });
    try {
      const r = await svc(app, 'GET', '/api/service/conversations', { key: 'curta-demais' });
      assert.equal(r.status, 503, `serviceKey=${serviceKey}`);
    } finally {
      close();
    }
  }
});

test('sem chave ou com chave errada: 401 sem detalhe, em qualquer rota de serviço', async () => {
  const { app, close } = await createTestApp({ serviceKey: KEY });
  try {
    const rotas = [
      ['GET', '/api/service/conversations'],
      ['GET', '/api/service/conversations/unread'],
      ['GET', '/api/service/conversations/1'],
      ['POST', '/api/service/conversations/1/read'],
      ['POST', '/api/service/conversations/1/messages'],
      ['GET', '/api/service/attachments/1'],
      ['GET', '/api/service/nao-existe'],
    ];
    let n = 0;
    for (const [metodo, caminho] of rotas) {
      for (const key of [null, 'errada', KEY.slice(0, -1), `${KEY}x`, '']) {
        /* IP diferente a cada chamada: aqui não é o limite que está em teste. */
        n += 1;
        const r = await svc(app, metodo, caminho, { key, headers: { 'x-forwarded-for': `203.0.113.${n}` } });
        assert.equal(r.status, 401, `${metodo} ${caminho} key=${key}`);
        assert.deepEqual(Object.keys(r.body).sort(), ['error', 'message']);
        assert.equal(r.body.message, 'Não autorizado.');
      }
    }
  } finally {
    close();
  }
});

test('cookie de cliente (ou de admin) não abre /api/service sem a chave', async () => {
  const { app, ctx, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const admin = await createAdmin(ctx, app);
    const id = await conversa(app, cliente);

    for (const token of [cliente.token, admin.token]) {
      for (const caminho of [
        '/api/service/conversations',
        '/api/service/conversations/unread',
        `/api/service/conversations/${id}`,
        '/api/service/attachments/1',
      ]) {
        const r = await request(app, 'GET', caminho, { token });
        assert.equal(r.status, 401, caminho);
      }
      const post = await request(app, 'POST', `/api/service/conversations/${id}/messages`, {
        token,
        body: { body: 'x', adminId: ADMIN_GUID, adminName: 'Invasor' },
      });
      assert.equal(post.status, 401);
    }
  } finally {
    close();
  }
});

test('requisição com Origin (navegador) é recusada mesmo com a chave', async () => {
  const { app, close } = await createTestApp({ serviceKey: KEY });
  try {
    const r = await svc(app, 'GET', '/api/service/conversations', {
      headers: { origin: 'https://site-malicioso.exemplo' },
    });
    assert.equal(r.status, 403);
  } finally {
    close();
  }
});

test('o serviço ignora Origin/CSRF dos POST e o cookie: só a chave vale', async () => {
  const { app, ctx, close } = await createTestApp({ serviceKey: KEY, allowedOrigins: ['https://site.com'] });
  try {
    const userId = await ctx.users.create({ name: 'Ana', company: null, email: 'ana@t.com', phone: null, passwordHash: 'x' });
    const id = await ctx.requests.create({ userId, type: 'Site', description: 'Descrição longa o bastante.', budget: null, deadline: null, status: 'NOVO' });
    await ctx.messages.create({ requestId: id, authorId: userId, body: 'oi' });
    /* Sem Origin, sem Referer, sem Sec-Fetch-Site: a API do Panel é assim. */
    const r = await svc(app, 'POST', `/api/service/conversations/${id}/read`);
    assert.equal(r.status, 204);
  } finally {
    close();
  }
});

test('chave errada repetida estoura o limite por IP (429)', async () => {
  const { app, close } = await createTestApp({ serviceKey: KEY });
  try {
    let ultimo;
    for (let i = 0; i < 25; i += 1) {
      ultimo = await svc(app, 'GET', '/api/service/conversations', {
        key: 'errada',
        headers: { 'x-forwarded-for': '198.51.100.9' },
      });
    }
    assert.equal(ultimo.status, 429);
    /* Outro IP não é afetado. */
    const outro = await svc(app, 'GET', '/api/service/conversations', {
      headers: { 'x-forwarded-for': '198.51.100.10' },
    });
    assert.equal(outro.status, 200);
  } finally {
    close();
  }
});

test('serviceAuth: comparação por digest, sem aceitar vazio, curto ou tipo errado', () => {
  const a = createServiceAuth(KEY);
  assert.equal(a.enabled, true);
  assert.equal(a.authorize(KEY), true);
  assert.equal(a.authorize(`${KEY} `), false);
  assert.equal(a.authorize(undefined), false);
  assert.equal(a.authorize(['x']), false);
  assert.equal(createServiceAuth('curta').authorize('curta'), false);
  assert.equal(createServiceAuth(undefined).enabled, false);
});

test('corpo máximo de 8 KB nas rotas de serviço', async () => {
  assert.equal(bodyLimitFor('/api/service/conversations/1/messages'), 8 * 1024);
  const { app, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const id = await conversa(app, cliente);
    const r = await svc(app, 'POST', `/api/service/conversations/${id}/messages`, {
      body: { body: 'a'.repeat(9000), adminId: ADMIN_GUID, adminName: 'Kaique' },
    });
    assert.equal(r.status, 413);
  } finally {
    close();
  }
});

/* ----------------------------------------------------------------- leitura */

test('lista conversas (só as com mensagem), não lidas, prévia e ordem', async () => {
  const { app, close } = await createTestApp({ serviceKey: KEY });
  try {
    const ana = await createClient(app, { name: 'Ana Souza', email: 'ana@teste.com' });
    const bruno = await createClient(app, { name: 'Bruno Lima', email: 'bruno@teste.com' });
    const idAna = await conversa(app, ana, 'Mensagem da Ana');
    await new Promise((r) => setTimeout(r, 5));
    const idBruno = await conversa(app, bruno, `Linha 1\n\nLinha 2 ${'x'.repeat(300)}`);
    /* Solicitação sem mensagem não aparece. */
    await request(app, 'POST', '/api/me/requests', {
      token: ana.token,
      body: { type: 'Automação', description: 'Sem nenhuma mensagem ainda.' },
    });

    const r = await svc(app, 'GET', '/api/service/conversations');
    assert.equal(r.status, 200);
    assert.deepEqual(
      r.body.conversations.map((c) => c.requestId),
      [String(idBruno), String(idAna)],
      'mais recente primeiro'
    );
    const [b, a] = r.body.conversations;
    assert.equal(b.clientName, 'Bruno Lima');
    assert.equal(b.clientEmail, 'bruno@teste.com');
    assert.equal(b.lastAuthorRole, 'CLIENT');
    assert.equal(b.lastAuthorName, 'Bruno Lima');
    assert.equal(b.unreadCount, 1);
    assert.ok(b.lastMessagePreview.length <= 140);
    assert.ok(!b.lastMessagePreview.includes('\n'));
    assert.match(b.lastMessageAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);
    assert.equal(a.lastMessagePreview, 'Mensagem da Ana');
    assert.ok(a.title.startsWith('Site'));
    assert.equal(a.status, 'NOVO');

    const total = await svc(app, 'GET', '/api/service/conversations/unread');
    assert.deepEqual(total.body, { count: 2 });

    const pag = await svc(app, 'GET', '/api/service/conversations', { query: { limit: '1', page: '2' } });
    assert.equal(pag.body.conversations.length, 1);
    assert.equal(pag.body.conversations[0].requestId, String(idAna));
  } finally {
    close();
  }
});

test('lê a conversa em ordem cronológica, com anexo, e marca como lida', async () => {
  const { app, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app, { name: 'Ana Souza' });
    const sol = await request(app, 'POST', '/api/me/requests', {
      token: cliente.token,
      body: { type: 'Site', description: 'Preciso de um site institucional novo.' },
    });
    const id = sol.body.request.id;
    await request(app, 'POST', `/api/requests/${id}/messages`, {
      token: cliente.token,
      body: { body: 'Primeira' },
    });
    const comImagem = await request(app, 'POST', `/api/requests/${id}/messages`, {
      token: cliente.token,
      body: { body: '', image: { dataBase64: PNG_1X1, filename: 'logo.png' } },
    });
    assert.equal(comImagem.status, 201);

    const r = await svc(app, 'GET', `/api/service/conversations/${id}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.request.requestId, String(id));
    assert.equal(r.body.request.clientEmail, cliente.user.email);
    assert.equal(r.body.messages.length, 2);
    assert.equal(r.body.messages[0].body, 'Primeira');
    assert.equal(r.body.messages[0].authorRole, 'CLIENT');
    assert.equal(r.body.messages[0].authorName, 'Ana Souza');
    assert.equal(r.body.messages[0].attachment, null);
    const anexo = r.body.messages[1].attachment;
    assert.equal(anexo.name, 'logo.png');
    assert.equal(anexo.contentType, 'image/png');
    assert.equal(typeof anexo.size, 'number');

    /* Prévia de mensagem só com imagem. */
    const lista = await svc(app, 'GET', '/api/service/conversations');
    assert.equal(lista.body.conversations[0].lastMessagePreview, '[Imagem]');
    assert.equal(lista.body.conversations[0].unreadCount, 2);

    /* Ler (GET) não marca como lida; o POST /read marca. */
    assert.equal((await svc(app, 'GET', '/api/service/conversations/unread')).body.count, 2);
    assert.equal((await svc(app, 'POST', `/api/service/conversations/${id}/read`)).status, 204);
    assert.equal((await svc(app, 'GET', '/api/service/conversations/unread')).body.count, 0);

    /* Download: bytes, tipo validado, nosniff, sem cache. */
    const img = await svc(app, 'GET', `/api/service/attachments/${anexo.id}`);
    assert.equal(img.status, 200);
    assert.equal(img.isRaw, true);
    assert.equal(img.headers['Content-Type'], 'image/png');
    assert.equal(img.headers['X-Content-Type-Options'], 'nosniff');
    assert.equal(img.headers['Cache-Control'], 'private, no-store');
    assert.equal(img.buffer.toString('base64'), PNG_1X1);

    assert.equal((await svc(app, 'GET', '/api/service/attachments/99999')).status, 404);
  } finally {
    close();
  }
});

test('ids malformados e inexistentes: 400/404, nunca erro interno', async () => {
  const { app, close } = await createTestApp({ serviceKey: KEY });
  try {
    for (const ruim of ['abc', '1e3', '0', '-1', '1.5', '0x10', '9'.repeat(30), "1'%20OR%201=1"]) {
      assert.equal((await svc(app, 'GET', `/api/service/conversations/${ruim}`)).status, 400, ruim);
      assert.equal((await svc(app, 'POST', `/api/service/conversations/${ruim}/read`)).status, 400, ruim);
      assert.equal((await svc(app, 'GET', `/api/service/attachments/${ruim}`)).status, 400, ruim);
    }
    assert.equal((await svc(app, 'GET', '/api/service/conversations/999999')).status, 404);
    assert.equal((await svc(app, 'POST', '/api/service/conversations/999999/read')).status, 404);
    const r = await svc(app, 'POST', '/api/service/conversations/999999/messages', {
      body: { body: 'oi', adminId: ADMIN_GUID, adminName: 'Kaique' },
    });
    assert.equal(r.status, 404);
  } finally {
    close();
  }
});

/* --------------------------------------------------------------- resposta */

test('resposta do Panel: 201, aparece para o cliente como "Nome · TODAI" e conta como não lida dele', async () => {
  const { app, ctx, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app, { name: 'Ana Souza' });
    const id = await conversa(app, cliente);

    const r = await svc(app, 'POST', `/api/service/conversations/${id}/messages`, {
      body: { body: '  Olá Ana, já vamos ver isso.  ', adminId: ADMIN_GUID, adminName: ' Kaique ' },
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.message.body, 'Olá Ana, já vamos ver isso.');
    assert.equal(r.body.message.authorRole, 'ADMIN');
    assert.equal(r.body.message.authorName, 'Kaique');
    assert.equal(r.body.message.attachment, null);
    assert.equal(typeof r.body.message.id, 'string');

    /* Gravado com o usuário de sistema e o autor externo. */
    const linha = await ctx.db.queryOne('SELECT * FROM messages WHERE id = ?', [Number(r.body.message.id)]);
    assert.equal(linha.author_external_name, 'Kaique');
    assert.equal(linha.author_external_id, ADMIN_GUID);
    const sistema = await ctx.db.queryOne('SELECT * FROM users WHERE id = ?', [linha.author_id]);
    assert.equal(sistema.email, SYSTEM_USER.EMAIL);
    assert.equal(sistema.role, 'ADMIN');

    /* O cliente vê o nome do admin; nada de id, e-mail ou guid. */
    const doCliente = await request(app, 'GET', `/api/requests/${id}/messages`, { token: cliente.token });
    const resposta = doCliente.body.messages.find((m) => m.author_external_name);
    assert.equal(resposta.author_external_name, 'Kaique');
    assert.equal(resposta.author_role, 'ADMIN');
    const bruto = JSON.stringify(doCliente.body);
    assert.ok(!bruto.includes(ADMIN_GUID), 'guid do admin do Panel não vai ao cliente');
    assert.ok(!bruto.includes('sistema.todai.invalid'), 'e-mail do usuário de sistema não vai ao cliente');
    assert.ok(!bruto.includes('author_external_id'));
  } finally {
    close();
  }
});

test('mensagem do Panel conta como não lida para o cliente e some ao ele abrir', async () => {
  const { app, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const id = await conversa(app, cliente);
    await svc(app, 'POST', `/api/service/conversations/${id}/messages`, {
      body: { body: 'Resposta', adminId: ADMIN_GUID, adminName: 'Kaique' },
    });

    const resumo = await request(app, 'GET', '/api/me/summary', { token: cliente.token });
    assert.equal(resumo.body.summary.unreadMessages, 1);
    const naoLidas = await request(app, 'GET', '/api/conversations/unread', { token: cliente.token });
    assert.equal(naoLidas.body.unread, 1);

    /* Resposta do Panel não entra na contagem de não lidas do Panel (só mensagem de cliente). */
    assert.equal((await svc(app, 'GET', '/api/service/conversations/unread')).body.count, 1);

    await request(app, 'GET', `/api/requests/${id}/messages`, { token: cliente.token });
    const depois = await request(app, 'GET', '/api/me/summary', { token: cliente.token });
    assert.equal(depois.body.summary.unreadMessages, 0);
  } finally {
    close();
  }
});

test('lista de conversas mostra o nome do admin do Panel como último autor', async () => {
  const { app, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const id = await conversa(app, cliente);
    await svc(app, 'POST', `/api/service/conversations/${id}/messages`, {
      body: { body: 'Resposta', adminId: ADMIN_GUID, adminName: 'Kaique' },
    });
    const c = (await svc(app, 'GET', '/api/service/conversations')).body.conversations[0];
    assert.equal(c.lastAuthorName, 'Kaique');
    assert.equal(c.lastAuthorRole, 'ADMIN');
    assert.equal(c.unreadCount, 1, 'a do cliente continua não lida até alguém marcar');
  } finally {
    close();
  }
});

test('mensagem antiga de admin do site continua com o nome do usuário', async () => {
  const { app, ctx, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const admin = await createAdmin(ctx, app);
    const id = await conversa(app, cliente);
    await request(app, 'POST', `/api/requests/${id}/messages`, {
      token: admin.token,
      body: { body: 'Resposta antiga do admin do site' },
    });
    const r = await svc(app, 'GET', `/api/service/conversations/${id}`);
    const antiga = r.body.messages.find((m) => m.body.startsWith('Resposta antiga'));
    assert.equal(antiga.authorName, 'Admin Teste');
    assert.equal(antiga.authorRole, 'ADMIN');
  } finally {
    close();
  }
});

test('validação da resposta: corpo, adminId e adminName', async () => {
  const { app, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const id = await conversa(app, cliente);
    const enviar = (body) => svc(app, 'POST', `/api/service/conversations/${id}/messages`, { body });
    const ok = { body: 'Texto', adminId: ADMIN_GUID, adminName: 'Kaique' };

    const casos = [
      [{ ...ok, body: '' }, 'body'],
      [{ ...ok, body: '   ' }, 'body'],
      [{ ...ok, body: 'a'.repeat(4001) }, 'body'],
      [{ ...ok, body: 123 }, 'body'],
      [{ ...ok, adminId: undefined }, 'adminId'],
      [{ ...ok, adminId: `${ADMIN_GUID}'; DROP TABLE users;--` }, 'adminId'],
      [{ ...ok, adminId: 7.5 }, 'adminId'],
      [{ ...ok, adminId: 'a'.repeat(65) }, 'adminId'],
      [{ ...ok, adminId: '' }, 'adminId'],
      [{ ...ok, adminId: 'id com espaço' }, 'adminId'],
      [{ ...ok, adminName: '' }, 'adminName'],
      [{ ...ok, adminName: 'a'.repeat(81) }, 'adminName'],
      [{ ...ok, adminName: '<script>alert(1)</script>' }, 'adminName'],
      [{ ...ok, adminName: 'Kai\nque' }, 'adminName'],
      [{ ...ok, adminName: 'Kai\u0000que' }, 'adminName'],
      [{ ...ok, adminName: ['Kaique'] }, 'adminName'],
    ];
    for (const [corpo, campo] of casos) {
      const r = await enviar(corpo);
      assert.equal(r.status, 400, JSON.stringify(corpo).slice(0, 80));
      assert.ok(r.body.details?.[campo], `erro no campo ${campo}`);
    }

    /* adminId numérico no JSON e guid também passam. */
    assert.equal((await enviar({ ...ok, adminId: 12 })).status, 201);
    assert.equal((await enviar({ ...ok, adminId: '3f2b8c1e-9d4a-4e6f-8a7b-1c2d3e4f5a6b' })).status, 201);

    /* Limites exatos passam. */
    assert.equal((await enviar({ ...ok, body: 'a'.repeat(4000), adminName: 'a'.repeat(80) })).status, 201);

    /* Campos extras são descartados: não dá para forjar autor, papel ou data. */
    const forjado = await enviar({
      ...ok,
      authorRole: 'CLIENT',
      authorId: 1,
      author_id: 1,
      createdAt: '2000-01-01T00:00:00Z',
      is_read: 1,
    });
    assert.equal(forjado.status, 201);
    assert.equal(forjado.body.message.authorRole, 'ADMIN');
    assert.ok(new Date(forjado.body.message.createdAt).getFullYear() >= 2026);
  } finally {
    close();
  }
});

test('nome com acento, apóstrofo e emoji é aceito e devolvido como texto puro', async () => {
  const { app, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const id = await conversa(app, cliente);
    const r = await svc(app, 'POST', `/api/service/conversations/${id}/messages`, {
      body: { body: 'oi', adminId: ADMIN_GUID, adminName: "João D'Ávila 🙂" },
    });
    assert.equal(r.status, 201);
    assert.equal(r.body.message.authorName, "João D'Ávila 🙂");
  } finally {
    close();
  }
});

test('o usuário de sistema nunca autentica nem recebe recuperação de senha', async () => {
  const sent = [];
  const { app, ctx, close } = await createTestApp({
    serviceKey: KEY,
    mailer: { configured: true, send: async (m) => sent.push(m) },
    forgotMinMs: 0,
  });
  try {
    const sistema = await ctx.db.queryOne('SELECT * FROM users WHERE email = ?', [SYSTEM_USER.EMAIL]);
    assert.ok(sistema, 'usuário de sistema criado pela migração');
    assert.equal(sistema.name, 'TODAI Atendimento');
    assert.equal(sistema.role, 'ADMIN');
    assert.ok(!sistema.password_hash.startsWith('scrypt$'));

    for (const password of ['', '!login-desativado', 'qualquer-senha-123', sistema.password_hash]) {
      const r = await request(app, 'POST', '/api/auth/login', {
        body: { email: SYSTEM_USER.EMAIL, password },
      });
      assert.equal(r.status, 401, `senha=${password}`);
    }
    const sessoes = await ctx.db.queryOne('SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?', [sistema.id]);
    assert.equal(Number(sessoes.n), 0);

    await request(app, 'POST', '/api/auth/forgot', { body: { email: SYSTEM_USER.EMAIL } });
    assert.equal(sent.length, 0, 'nenhum e-mail de recuperação para a conta de sistema');

    /* Não aparece na listagem de clientes nem na contagem. */
    assert.equal(await ctx.users.countClients(), 0);
  } finally {
    close();
  }
});

test('a migração é idempotente: reaplicar não duplica o usuário de sistema', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { aplicarMigracoesSqlite } = await import('../../server/db/sqlite.js');
  const { readFileSync } = await import('node:fs');
  const db = new DatabaseSync(':memory:');
  /* Banco "antigo": messages sem as colunas novas e com dados. */
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, company TEXT, email TEXT NOT NULL UNIQUE,
             phone TEXT, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'CLIENT', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
           CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER NOT NULL, author_id INTEGER NOT NULL,
             body TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
           INSERT INTO users (name,email,password_hash,role,created_at,updated_at) VALUES ('Ana','ana@x.com','h','CLIENT',1,1);
           INSERT INTO messages (request_id,author_id,body,created_at) VALUES (1,1,'antiga',1);`);
  aplicarMigracoesSqlite(db);
  aplicarMigracoesSqlite(db);
  const cols = db.prepare('PRAGMA table_info(messages)').all().map((c) => c.name);
  assert.ok(cols.includes('author_external_id') && cols.includes('author_external_name'));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM users WHERE email = ?").get(SYSTEM_USER.EMAIL).n, 1);
  assert.equal(db.prepare('SELECT body FROM messages').get().body, 'antiga', 'dados preservados');
  db.close();

  /* O schema do Postgres traz as mesmas colunas e o mesmo usuário, de forma idempotente. */
  const pg = readFileSync(new URL('../../server/db/schema.postgres.sql', import.meta.url), 'utf8');
  assert.match(pg, /ADD COLUMN IF NOT EXISTS author_external_id/);
  assert.match(pg, /ADD COLUMN IF NOT EXISTS author_external_name/);
  assert.match(pg, /ON CONFLICT \(email\) DO NOTHING/);
});
