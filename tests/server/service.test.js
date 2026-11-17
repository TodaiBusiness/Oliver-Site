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

test('corpo máximo de 32 KB nas rotas de serviço (4000 acentuados/emoji passam)', async () => {
  assert.equal(bodyLimitFor('/api/service/conversations/1/messages'), 32 * 1024);
  const { app, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const id = await conversa(app, cliente);
    const r = await svc(app, 'POST', `/api/service/conversations/${id}/messages`, {
      body: { body: 'a'.repeat(40000), adminId: ADMIN_GUID, adminName: 'Kaique' },
    });
    assert.equal(r.status, 413);

    for (const texto of ['é'.repeat(4000), '🙂'.repeat(2000)]) {
      const ok = await svc(app, 'POST', `/api/service/conversations/${id}/messages`, {
        body: { body: texto, adminId: ADMIN_GUID, adminName: 'Kaique' },
      });
      assert.equal(ok.status, 201);
    }
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
      body: { body: '  Olá Ana, já vamos ver isso.  ', adminId: 'adm-77421-x', adminName: ' Kaique ' },
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
    assert.equal(linha.author_external_id, 'adm-77421-x');
    const sistema = await ctx.db.queryOne('SELECT * FROM users WHERE id = ?', [linha.author_id]);
    assert.equal(sistema.email, SYSTEM_USER.EMAIL);
    assert.equal(sistema.role, 'ADMIN');

    /* O cliente vê o nome do admin; nada de id, e-mail ou guid. */
    const doCliente = await request(app, 'GET', `/api/requests/${id}/messages`, { token: cliente.token });
    const resposta = doCliente.body.messages.find((m) => m.author_external_name);
    assert.equal(resposta.author_external_name, 'Kaique');
    assert.equal(resposta.author_role, 'ADMIN');
    const bruto = JSON.stringify(doCliente.body);
    assert.ok(!bruto.includes('adm-77421-x'), 'guid do admin do Panel não vai ao cliente');
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

/* ------------------------------------------------------ revisão (rodada 2) */

test('conversa com mais de 1000 mensagens traz as 1000 MAIS RECENTES, em ordem cronológica', async () => {
  const { app, ctx, close } = await createTestApp({ serviceKey: KEY });
  try {
    const userId = await ctx.users.create({ name: 'Ana', company: null, email: 'ana@t.com', phone: null, passwordHash: 'x' });
    const id = await ctx.requests.create({ userId, type: 'Site', description: 'Descrição longa o bastante.', budget: null, deadline: null, status: 'NOVO' });
    await ctx.db.transaction(async (tx) => {
      for (let i = 1; i <= 1005; i += 1) {
        await tx.execute(
          'INSERT INTO messages (request_id, author_id, body, is_read, created_at) VALUES (?, ?, ?, 0, ?)',
          [id, userId, `m${i}`, 1000000 + i]
        );
      }
    });
    const r = await svc(app, 'GET', `/api/service/conversations/${id}`);
    assert.equal(r.body.messages.length, 1000);
    assert.equal(r.body.messages[0].body, 'm6');
    assert.equal(r.body.messages[999].body, 'm1005');
  } finally {
    close();
  }
});

test('conta com o e-mail do usuário de sistema que não é a de sistema: recusa com 500 genérico', async () => {
  const { app, ctx, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const id = await conversa(app, cliente);
    await ctx.db.execute("UPDATE users SET role = 'CLIENT', password_hash = 'scrypt$x' WHERE email = ?", [SYSTEM_USER.EMAIL]);
    const r = await svc(app, 'POST', `/api/service/conversations/${id}/messages`, {
      body: { body: 'oi', adminId: ADMIN_GUID, adminName: 'Kaique' },
    });
    assert.equal(r.status, 500);
    assert.ok(!JSON.stringify(r.body).includes(SYSTEM_USER.EMAIL));
    const n = await ctx.db.queryOne('SELECT COUNT(*) AS n FROM messages WHERE author_external_name IS NOT NULL');
    assert.equal(Number(n.n), 0);
  } finally {
    close();
  }
});

test('limite por minuto é configurável (serviceRatePerMin); falhas de chave têm limite próprio', async () => {
  const { app, close } = await createTestApp({ serviceKey: KEY, serviceRatePerMin: 5 });
  try {
    const h = { 'x-forwarded-for': '198.51.100.50' };
    const codigos = [];
    for (let i = 0; i < 7; i += 1) {
      codigos.push((await svc(app, 'GET', '/api/service/conversations/unread', { headers: h })).status);
    }
    assert.deepEqual(codigos, [200, 200, 200, 200, 200, 429, 429]);
  } finally {
    close();
  }
  const padrao = (await import('../../server/config.js')).config.service.ratePerMin;
  assert.equal(padrao, 1200);
});

test('clientMessageId: reenvio igual não duplica; ids diferentes e ausente criam mensagens', async () => {
  const { app, ctx, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const id = await conversa(app, cliente);
    const enviar = (extra) =>
      svc(app, 'POST', `/api/service/conversations/${id}/messages`, {
        body: { body: 'Resposta', adminId: ADMIN_GUID, adminName: 'Kaique', ...extra },
      });
    const total = async () =>
      Number((await ctx.db.queryOne('SELECT COUNT(*) AS n FROM messages WHERE author_external_name IS NOT NULL')).n);

    const a = await enviar({ clientMessageId: 'envio-0001' });
    const b = await enviar({ clientMessageId: 'envio-0001' });
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.equal(b.body.message.id, a.body.message.id);
    assert.equal(await total(), 1);

    /* Concorrentes: a restrição única decide. */
    const [c, d] = await Promise.all([enviar({ clientMessageId: 'envio-0002' }), enviar({ clientMessageId: 'envio-0002' })]);
    assert.equal(c.body.message.id, d.body.message.id);
    assert.equal(await total(), 2);

    /* Mesmo id em outro admin é outra mensagem. */
    const outro = await svc(app, 'POST', `/api/service/conversations/${id}/messages`, {
      body: { body: 'x', adminId: '9', adminName: 'Outro', clientMessageId: 'envio-0001' },
    });
    assert.notEqual(outro.body.message.id, a.body.message.id);

    await enviar({});
    await enviar({});
    assert.equal(await total(), 5, 'sem id: comportamento atual (uma por chamada)');

    for (const ruim of ['curto', 'a'.repeat(65), 'com espaço aqui', 123, ['x']]) {
      const r = await enviar({ clientMessageId: ruim });
      assert.equal(r.status, 400, String(ruim));
      assert.ok(r.body.details.clientMessageId);
    }
  } finally {
    close();
  }
});

test('a chave de serviço lida do ambiente passa por trim', async () => {
  const antes = process.env.SITE_SERVICE_API_KEY;
  process.env.SITE_SERVICE_API_KEY = `  ${KEY}\n`;
  try {
    const { config } = await import(`../../server/config.js?trim=${Date.now()}`);
    assert.equal(config.service.apiKey, KEY);
    assert.equal(config.licensing.serviceKey, KEY);
  } finally {
    if (antes === undefined) delete process.env.SITE_SERVICE_API_KEY;
    else process.env.SITE_SERVICE_API_KEY = antes;
  }
});

/* ------------------------------------------------------ imagem do admin (Panel) */

const enviarMsg = (app, id, extra) =>
  svc(app, 'POST', `/api/service/conversations/${id}/messages`, {
    body: { adminId: ADMIN_GUID, adminName: 'Kaique', ...extra },
  });
const contaAnexos = async (ctx) => Number((await ctx.db.queryOne('SELECT COUNT(*) AS n FROM attachments')).n);
const contaMsgs = async (ctx) => Number((await ctx.db.queryOne('SELECT COUNT(*) AS n FROM messages')).n);

test('imagem válida com texto: 201, anexo ligado, cliente baixa, chat e listagem refletem', async () => {
  const { app, ctx, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const outro = await createClient(app);
    const id = await conversa(app, cliente);

    const r = await enviarMsg(app, id, {
      body: 'Segue o layout',
      attachment: { name: 'layout.png', contentType: 'image/png', dataBase64: PNG_1X1 },
    });
    assert.equal(r.status, 201);
    const m = r.body.message;
    assert.equal(m.body, 'Segue o layout');
    assert.equal(m.authorRole, 'ADMIN');
    assert.equal(m.authorName, 'Kaique');
    assert.equal(m.attachment.name, 'layout.png');
    assert.equal(m.attachment.contentType, 'image/png');
    assert.equal(m.attachment.size, Buffer.from(PNG_1X1, 'base64').length);
    assert.ok(m.attachment.id);

    /* Cliente dono baixa pelo site; outro cliente não (IDOR). */
    const baixa = await request(app, 'GET', `/api/attachments/${m.attachment.id}`, { token: cliente.token });
    assert.equal(baixa.status, 200);
    assert.equal(baixa.headers['Content-Type'], 'image/png');
    assert.equal(baixa.headers['X-Content-Type-Options'], 'nosniff');
    assert.deepEqual(baixa.buffer, Buffer.from(PNG_1X1, 'base64'));
    const alheio = await request(app, 'GET', `/api/attachments/${m.attachment.id}`, { token: outro.token });
    assert.equal(alheio.status, 404);
    const semLogin = await request(app, 'GET', `/api/attachments/${m.attachment.id}`);
    assert.equal(semLogin.status, 401);

    /* Pelo serviço também. */
    const viaSvc = await svc(app, 'GET', `/api/service/attachments/${m.attachment.id}`);
    assert.equal(viaSvc.status, 200);
    assert.equal(viaSvc.headers['Cache-Control'], 'private, no-store');

    /* GET da conversa e chat do cliente enxergam o anexo. */
    const conv = await svc(app, 'GET', `/api/service/conversations/${id}`);
    assert.equal(conv.body.messages.at(-1).attachment.id, m.attachment.id);
    const chat = await request(app, 'GET', `/api/requests/${id}/messages`, { token: cliente.token });
    const doAdmin = chat.body.messages.at(-1);
    assert.equal(doAdmin.author_external_name, 'Kaique');
    assert.equal(doAdmin.attachments[0].filename, 'layout.png');
  } finally {
    close();
  }
});

test('só imagem (sem texto): prévia [Imagem] na listagem', async () => {
  const { app, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const id = await conversa(app, cliente);
    for (const body of [undefined, '', '   ']) {
      const r = await enviarMsg(app, id, {
        body,
        attachment: { name: 'a.png', contentType: 'image/png', dataBase64: PNG_1X1 },
      });
      assert.equal(r.status, 201, JSON.stringify(body));
      assert.equal(r.body.message.body, '');
      assert.ok(r.body.message.attachment);
    }
    const lista = await svc(app, 'GET', '/api/service/conversations');
    assert.equal(lista.body.conversations[0].lastMessagePreview, '[Imagem]');
    assert.equal(lista.body.conversations[0].lastAuthorRole, 'ADMIN');
  } finally {
    close();
  }
});

test('sem body e sem attachment: 400', async () => {
  const { app, ctx, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const id = await conversa(app, cliente);
    const antes = await contaMsgs(ctx);
    for (const extra of [{}, { body: '  ' }, { attachment: null, body: '' }]) {
      const r = await enviarMsg(app, id, extra);
      assert.equal(r.status, 400, JSON.stringify(extra));
    }
    assert.equal(await contaMsgs(ctx), antes);
  } finally {
    close();
  }
});

test('o conteúdo manda: HTML/SVG/texto com contentType image/png é recusado, sem mensagem órfã', async () => {
  const { app, ctx, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const id = await conversa(app, cliente);
    const antes = await contaMsgs(ctx);
    const falsos = [
      '<html><script>alert(1)</script></html>',
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      'GIF',
      'texto qualquer',
    ];
    for (const conteudo of falsos) {
      const r = await enviarMsg(app, id, {
        body: 'oi',
        attachment: {
          name: 'x.png',
          contentType: 'image/png',
          dataBase64: Buffer.from(conteudo).toString('base64'),
        },
      });
      assert.equal(r.status, 400, conteudo);
      assert.match(r.body.message, /Formato não aceito/);
    }
    assert.equal(await contaMsgs(ctx), antes);
    assert.equal(await contaAnexos(ctx), 0);

    /* contentType divergente mas conteúdo PNG: grava o tipo detectado. */
    const ok = await enviarMsg(app, id, {
      attachment: { name: 'foto.jpg', contentType: 'text/html', dataBase64: PNG_1X1 },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.message.attachment.contentType, 'image/png');
  } finally {
    close();
  }
});

test('imagem acima de 3 MB: 413 claro; base64 inválido e vazio: 400; nada gravado', async () => {
  const { app, ctx, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const id = await conversa(app, cliente);
    const antes = await contaMsgs(ctx);

    const grande = Buffer.concat([Buffer.from(PNG_1X1, 'base64'), Buffer.alloc(3 * 1024 * 1024)]);
    const r = await enviarMsg(app, id, {
      attachment: { name: 'g.png', contentType: 'image/png', dataBase64: grande.toString('base64') },
    });
    assert.equal(r.status, 413);
    assert.match(r.body.message, /3 MB/);

    for (const ruim of ['isso não é base64!!', '', '%%%', 'AAA=AAA', 123, null, ['x']]) {
      const x = await enviarMsg(app, id, { body: 'oi', attachment: { name: 'a.png', dataBase64: ruim } });
      assert.equal(x.status, 400, String(ruim));
    }
    for (const attachment of ['texto', 5, ['x']]) {
      const x = await enviarMsg(app, id, { body: 'oi', attachment });
      assert.equal(x.status, 400);
    }
    assert.equal(await contaMsgs(ctx), antes);
    assert.equal(await contaAnexos(ctx), 0);
  } finally {
    close();
  }
});

test('nome de arquivo malicioso é limpo (caminho, controle, <>, máx. 120)', async () => {
  const { app, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const id = await conversa(app, cliente);
    const casos = [
      ['../../etc/passwd.png', 'passwd.png'],
      ['C:\\Users\\x\\foto.png', 'foto.png'],
      ['<img src=x onerror=alert(1)>.png', 'img src=x onerror=alert(1).png'],
      ['a\r\nb\u0000c\u202e.png', 'abc.png'],
      ['', 'imagem.png'],
      ['..', 'imagem.png'],
      ['São João 🙂.png', 'São João 🙂.png'],
      [undefined, 'imagem.png'],
      [{ x: 1 }, 'imagem.png'],
    ];
    for (const [name, esperado] of casos) {
      const r = await enviarMsg(app, id, { attachment: { name, dataBase64: PNG_1X1 } });
      assert.equal(r.status, 201, String(name));
      assert.equal(r.body.message.attachment.name, esperado, String(name));
      /* Nome com emoji/acento não pode derrubar o download (cabeçalho Latin-1). */
      const d = await svc(app, 'GET', `/api/service/attachments/${r.body.message.attachment.id}`);
      assert.equal(d.status, 200);
      assert.match(d.headers['Content-Disposition'], /^inline; filename="[\x20-\x7e]*"/);
    }
    const longo = await enviarMsg(app, id, { attachment: { name: `${'a'.repeat(300)}.png`, dataBase64: PNG_1X1 } });
    assert.ok(Array.from(longo.body.message.attachment.name).length <= 120);
    assert.ok(longo.body.message.attachment.name.endsWith('.png'));
  } finally {
    close();
  }
});

test('texto continua limitado a 4000 com imagem; campos extras do anexo são ignorados', async () => {
  const { app, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const id = await conversa(app, cliente);
    const r = await enviarMsg(app, id, {
      body: 'a'.repeat(4001),
      attachment: { name: 'a.png', dataBase64: PNG_1X1 },
    });
    assert.equal(r.status, 400);
    assert.ok(r.body.details.body);
  } finally {
    close();
  }
});

test('limite de corpo: 4,8 MB só no POST de mensagem com chave VÁLIDA; o resto continua pequeno', async () => {
  const { app, close } = await createTestApp({ serviceKey: KEY });
  try {
    const grande = 4 * 1024 * 1024;
    const msg = '/api/service/conversations/1/messages';
    const com = (path, headers) => app.bodyPolicy({ path, headers });

    /* Sem chave, chave errada, com Origin ou sem nada: o corpo nem é lido. */
    for (const headers of [{}, { 'x-service-key': 'errada' }, { 'X-Service-Key': `${KEY}x` }, { 'x-service-key': KEY, origin: 'https://x.exemplo' }]) {
      const p = com(msg, headers);
      assert.equal(p.reject, true, JSON.stringify(headers));
      assert.ok(p.limit < grande);
    }

    /* Chave válida: teto maior, apenas nesse POST. */
    const ok = com(msg, { 'X-Service-Key': KEY });
    assert.equal(ok.reject, false);
    assert.ok(ok.limit >= grande + 512 * 1024 && ok.limit <= 5 * 1024 * 1024);
    for (const outro of [
      '/api/service/conversations',
      '/api/service/conversations/1',
      '/api/service/conversations/1/read',
      '/api/service/conversations/1/messages/extra',
      '/api/service/attachments/1',
    ]) {
      const p = com(outro, { 'x-service-key': KEY });
      assert.equal(p.reject, false);
      assert.equal(p.limit, 32 * 1024, outro);
    }
    assert.equal(com('/api/auth/login', {}).limit, bodyLimitFor('/api/auth/login'));
    assert.equal(com('/api/auth/login', {}).reject, false);
    assert.equal(bodyLimitFor(msg), 32 * 1024, 'sem a informação de chave válida o teto é o pequeno');

    /* Serviço desligado: reject (503 vem do porteiro). */
    const off = await createTestApp({ serviceKey: undefined });
    try {
      assert.equal(off.app.bodyPolicy({ path: msg, headers: { 'x-service-key': KEY } }).reject, true);
    } finally {
      off.close();
    }

    /* Sem chave, o handle responde 401 mesmo se alguém empurrar um corpo enorme. */
    const r = await svc(app, 'POST', msg, { key: null, body: { adminName: 'x', attachment: { dataBase64: 'A'.repeat(grande) } } });
    assert.equal(r.status, 401);

    /* Com chave, corpo sem imagem acima de 32 KB segue 413. */
    const cliente = await createClient(app);
    const id = await conversa(app, cliente);
    const longo = await enviarMsg(app, id, { body: 'a'.repeat(40000) });
    assert.equal(longo.status, 413);
  } finally {
    close();
  }
});

test('idempotência com imagem: reenvio (e corrida) devolve a mesma mensagem e grava o anexo uma vez', async () => {
  const { app, ctx, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const id = await conversa(app, cliente);
    const envio = (cmid) =>
      enviarMsg(app, id, {
        body: 'com foto',
        clientMessageId: cmid,
        attachment: { name: 'f.png', contentType: 'image/png', dataBase64: PNG_1X1 },
      });

    const a = await envio('imagem-0001');
    const b = await envio('imagem-0001');
    assert.equal(a.status, 201);
    assert.equal(b.status, 201);
    assert.equal(b.body.message.id, a.body.message.id);
    assert.equal(b.body.message.attachment.id, a.body.message.attachment.id);
    assert.equal(await contaAnexos(ctx), 1);

    const [c, d] = await Promise.all([envio('imagem-0002'), envio('imagem-0002')]);
    assert.equal(c.status, 201);
    assert.equal(d.status, 201);
    assert.equal(c.body.message.id, d.body.message.id);
    assert.ok(c.body.message.attachment);
    assert.ok(d.body.message.attachment);
    assert.equal(c.body.message.attachment.id, d.body.message.attachment.id);
    assert.equal(await contaAnexos(ctx), 2);

    /* Imagem recusada com clientMessageId: nada fica, e o reenvio correto funciona. */
    const ruim = await enviarMsg(app, id, {
      clientMessageId: 'imagem-0003',
      attachment: { name: 'x.png', dataBase64: Buffer.from('<html>').toString('base64') },
    });
    assert.equal(ruim.status, 400);
    const bom = await envio('imagem-0003');
    assert.equal(bom.status, 201);
    assert.equal(await contaAnexos(ctx), 3);
  } finally {
    close();
  }
});

test('falha ao gravar o anexo desfaz a mensagem (sem órfã)', async () => {
  const { app, ctx, close } = await createTestApp({ serviceKey: KEY });
  try {
    const cliente = await createClient(app);
    const id = await conversa(app, cliente);
    const antes = await contaMsgs(ctx);
    const original = app.ctx.attachments.create;
    app.ctx.attachments.create = async () => {
      throw new Error('disco cheio');
    };
    try {
      const r = await enviarMsg(app, id, { attachment: { name: 'a.png', dataBase64: PNG_1X1 } });
      assert.equal(r.status, 500);
    } finally {
      app.ctx.attachments.create = original;
    }
    assert.equal(await contaMsgs(ctx), antes);
  } finally {
    close();
  }
});
