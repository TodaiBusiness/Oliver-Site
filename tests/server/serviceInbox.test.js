/* =========================================================================
   Caixa de conversas do Panel (/api/service/*): filtros e busca, arquivar,
   feed de mudanças e modelos de resposta. O banco é o de verdade (SQLite).
   ========================================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestApp, createClient, request } from './helpers.js';
import { encodeCursor, decodeCursor, CURSOR_OVERLAP_MS } from '../../server/services/panelInbox.js';

const KEY = 'chave-de-servico-do-panel-0123456789abcdef';
const ACTOR = { actorId: '3', actorName: 'Kaique' };

const svc = (app, method, path, { key = KEY, body, query, headers } = {}) =>
  request(app, method, path, {
    body,
    query,
    headers: { ...(key ? { 'x-service-key': key } : {}), ...headers },
  });

const setup = async () => {
  const t = await createTestApp({ serviceKey: KEY });
  ctxAtual = t.ctx;
  return t;
};
let ctxAtual = null;

let seq = 0;
/** Cliente novo + solicitação + 1ª mensagem do cliente (pela API do site, como o navegador). */
async function conversaApi(app, { name = 'Cliente Teste', email, type = 'Site', description = 'Preciso de um site novo.', texto = 'Olá, preciso de ajuda.' } = {}) {
  seq += 1;
  const cliente = await createClient(app, { name, email: email ?? `c${seq}x${Date.now()}@teste.com` });
  const sol = await request(app, 'POST', '/api/me/requests', {
    token: cliente.token,
    body: { type, description },
  });
  const id = sol.body.request.id;
  const msg = await request(app, 'POST', `/api/requests/${id}/messages`, {
    token: cliente.token,
    body: { body: texto },
  });
  assert.equal(msg.status, 201, JSON.stringify(msg.body));
  return { id, cliente };
}

/** Cliente + solicitação + 1ª mensagem direto no banco (o cadastro pela API tem limite por IP). */
async function conversa(app, { name = 'Cliente Teste', email, type = 'Site', description = 'Preciso de um site novo.', texto = 'Olá, preciso de ajuda.' } = {}) {
  seq += 1;
  const userId = await ctxAtual.users.create({
    name, company: null, email: email ?? `d${seq}x${Date.now()}@teste.com`, phone: null, passwordHash: 'x', role: 'CLIENT',
  });
  const id = await ctxAtual.requests.create({ userId, type, description, budget: null, deadline: null, status: 'NOVO' });
  await ctxAtual.messages.create({ requestId: id, authorId: userId, body: texto });
  return { id, userId, cliente: { id: userId } };
}
const clienteEscreve = (c, texto) => ctxAtual.messages.create({ requestId: c.id, authorId: c.userId, body: texto });

const lista = async (app, query = {}) => {
  const r = await svc(app, 'GET', '/api/service/conversations', { query });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.conversations;
};
const ids = (conversas) => conversas.map((c) => c.requestId);
const arquivar = (app, id, body = ACTOR) => svc(app, 'POST', `/api/service/conversations/${id}/archive`, { body });
const desarquivar = (app, id, body = ACTOR) => svc(app, 'POST', `/api/service/conversations/${id}/unarchive`, { body });
const changes = (app, since) => svc(app, 'GET', '/api/service/conversations/changes', { query: since ? { since } : {} });
/** Cursor "de uma hora atrás": tudo recente é novo. */
const antes = () => encodeCursor(Date.now() - 3_600_000);

const resposta = (app, id, texto = 'Resposta da equipe') =>
  svc(app, 'POST', `/api/service/conversations/${id}/messages`, {
    body: { body: texto, adminId: '3', adminName: 'Kaique' },
  });

/* ------------------------------------------------------------ lista/filtros */

test('lista: campos atuais + status e archived; padrão = não arquivadas', async () => {
  const { app, close } = await setup();
  try {
    const a = await conversa(app, { name: 'Ana' });
    const b = await conversa(app, { name: 'Bia' });
    await arquivar(app, a.id);

    const padrao = await lista(app);
    assert.deepEqual(ids(padrao), [String(b.id)]);
    assert.deepEqual(Object.keys(padrao[0]).sort(), [
      'archived', 'clientEmail', 'clientName', 'lastAuthorName', 'lastAuthorRole',
      'lastMessageAt', 'lastMessagePreview', 'requestId', 'status', 'title', 'unreadCount',
    ]);
    assert.equal(padrao[0].status, 'NOVO');
    assert.equal(padrao[0].archived, false);

    const arq = await lista(app, { filter: 'archived' });
    assert.deepEqual(ids(arq), [String(a.id)]);
    assert.equal(arq[0].archived, true);
    assert.deepEqual(ids(await lista(app, { filter: 'all' })), [String(b.id)]);
  } finally {
    close();
  }
});

test('filter=unread, status e filtros inválidos', async () => {
  const { app, close } = await setup();
  try {
    const a = await conversa(app, { name: 'Ana' });
    const b = await conversa(app, { name: 'Bia' });
    await svc(app, 'POST', `/api/service/conversations/${a.id}/read`);
    assert.deepEqual(ids(await lista(app, { filter: 'unread' })), [String(b.id)]);

    await svc(app, 'POST', `/api/service/requests/${a.id}/status`, { body: { status: 'EM_ANALISE', ...ACTOR } });
    assert.deepEqual(ids(await lista(app, { status: 'EM_ANALISE' })), [String(a.id)]);
    assert.deepEqual(ids(await lista(app, { status: 'NOVO' })), [String(b.id)]);
    assert.deepEqual(await lista(app, { status: 'CONCLUIDO' }), []);

    for (const query of [{ filter: 'xx' }, { status: 'INVENTADO' }, { filter: ['all', 'unread'] }]) {
      const r = await svc(app, 'GET', '/api/service/conversations', { query });
      assert.equal(r.status, 400);
      assert.equal(r.body.error, 'DADOS_INVALIDOS');
      assert.ok(r.body.details.filter || r.body.details.status);
    }
  } finally {
    close();
  }
});

test('busca: nome, e-mail, título e texto das mensagens, sem duplicar conversa', async () => {
  const { app, close } = await setup();
  try {
    const a = await conversa(app, { name: 'Ana Souza', email: 'ana.souza@exemplo.com', type: 'Aplicativo', description: 'Quero um app de entregas', texto: 'Quando fica pronto o orçamento?' });
    const b = await conversa(app, { name: 'Bruno Lima', email: 'bruno@outra.com', type: 'Site', description: 'Loja virtual', texto: 'Bom dia' });
    /* várias mensagens na mesma conversa casando com o termo */
    for (let i = 0; i < 3; i += 1) {
      await clienteEscreve(b, `Sobre o orçamento ${i}`);
    }
    await resposta(app, b.id, 'O orçamento sai amanhã');

    assert.deepEqual(ids(await lista(app, { q: 'souza' })), [String(a.id)]); // nome, sem diferenciar caixa
    assert.deepEqual(ids(await lista(app, { q: 'ana.souza@' })), [String(a.id)]); // e-mail
    assert.deepEqual(ids(await lista(app, { q: 'entregas' })), [String(a.id)]); // título/descrição
    assert.deepEqual(ids(await lista(app, { q: 'aplicativo' })), [String(a.id)]); // tipo
    const porTexto = await lista(app, { q: 'orçamento' });
    assert.deepEqual(ids(porTexto).sort(), [String(a.id), String(b.id)].sort());
    assert.equal(new Set(ids(porTexto)).size, porTexto.length, 'sem duplicar');
    assert.deepEqual(await lista(app, { q: 'nada-disso' }), []);
    /* busca respeita o filtro */
    await arquivar(app, b.id);
    assert.deepEqual(ids(await lista(app, { q: 'orçamento' })), [String(a.id)]);
    assert.deepEqual(ids(await lista(app, { q: 'orçamento', filter: 'archived' })), [String(b.id)]);
  } finally {
    close();
  }
});

test('busca: %, _, !, emoji e acentos são texto literal (LIKE com ESCAPE)', async () => {
  const { app, close } = await setup();
  try {
    const pct = await conversa(app, { name: 'Pct', texto: 'Desconto de 50% hoje' });
    const und = await conversa(app, { name: 'Und', texto: 'arquivo_final pronto' });
    const exc = await conversa(app, { name: 'Exc', texto: 'Urgente! responda' });
    const emo = await conversa(app, { name: 'Emo', texto: 'Obrigado 😀 pela atenção' });
    const plano = await conversa(app, { name: 'Plano', texto: 'arquivoXfinal e 50 reais' });

    assert.deepEqual(ids(await lista(app, { q: '%' })), [String(pct.id)], '% não é curinga');
    assert.deepEqual(ids(await lista(app, { q: '50%' })), [String(pct.id)]);
    assert.deepEqual(ids(await lista(app, { q: '_' })), [String(und.id)], '_ não é curinga');
    assert.deepEqual(ids(await lista(app, { q: 'arquivo_final' })), [String(und.id)]);
    assert.deepEqual(ids(await lista(app, { q: '!' })), [String(exc.id)]);
    assert.deepEqual(ids(await lista(app, { q: 'Urgente!' })), [String(exc.id)]);
    assert.deepEqual(ids(await lista(app, { q: '😀' })), [String(emo.id)]);
    assert.deepEqual(ids(await lista(app, { q: 'atenção' })), [String(emo.id)]);
    assert.deepEqual(ids(await lista(app, { q: "x' OR 1=1 --" })), [], 'sem injeção');
    assert.ok(plano.id);
  } finally {
    close();
  }
});

test('busca: ≤100 caracteres e sem caracteres de controle', async () => {
  const { app, close } = await setup();
  try {
    const a = await conversa(app, { texto: 'a'.repeat(100) });
    await conversa(app, { texto: 'conversa normal' });
    /* 300 caracteres: só os 100 primeiros valem (não vira erro nem busca gigante) */
    assert.deepEqual(ids(await lista(app, { q: 'a'.repeat(300) })), [String(a.id)]);
    /* controle vira espaço; só controle = sem filtro */
    assert.equal((await lista(app, { q: 'conversa\u0000\u0007normal' })).length, 1, 'controle vira espaço: acha "conversa normal"');
    assert.equal((await lista(app, { q: 'conversa\u200bnormal' })).length, 1, 'zero-width também');
    assert.equal((await lista(app, { q: '\u0000\n\t' })).length, 2);
    assert.equal((await lista(app, { q: '   ' })).length, 2);
    assert.equal((await lista(app, { q: ['a', 'b'] })).length, 2, 'q repetido é ignorado');
  } finally {
    close();
  }
});

test('paginação estável: sem repetir nem pular conversa', async () => {
  const { app, close } = await setup();
  try {
    const todas = [];
    for (let i = 0; i < 7; i += 1) todas.push(String((await conversa(app, { name: `C${i}` })).id));
    const vistas = [];
    for (let page = 1; page <= 4; page += 1) vistas.push(...ids(await lista(app, { limit: 3, page })));
    assert.equal(vistas.length, 7);
    assert.deepEqual([...vistas].sort(), [...todas].sort());
    assert.deepEqual(ids(await lista(app, { limit: 100 })), vistas, 'mesma ordem em qualquer paginação');
  } finally {
    close();
  }
});

/* ---------------------------------------------------------------- arquivar */

test('arquivar e desarquivar: 204, auditoria com ator, idempotente', async () => {
  const { app, db, close } = await setup();
  try {
    const { id } = await conversa(app);
    assert.equal((await arquivar(app, id)).status, 204);
    assert.equal((await arquivar(app, id)).status, 204, 'repetir não falha');
    assert.equal((await desarquivar(app, id)).status, 204);
    assert.equal((await desarquivar(app, id)).status, 204);

    const logs = await db.query(
      `SELECT a.action, a.resource_type, a.resource_id, a.details, u.email
         FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
        WHERE a.action IN ('CONVERSA_ARQUIVADA','CONVERSA_DESARQUIVADA') ORDER BY a.id`
    );
    assert.deepEqual(logs.map((l) => l.action), ['CONVERSA_ARQUIVADA', 'CONVERSA_DESARQUIVADA'], 'só quando mudou');
    assert.equal(logs[0].resource_id, String(id));
    assert.equal(logs[0].email, 'atendimento@sistema.todai.invalid');
    assert.deepEqual(JSON.parse(logs[0].details), { requestId: id, actorId: '3', actorName: 'Kaique' });
  } finally {
    close();
  }
});

test('arquivar: ator inválido 400 por campo, conversa inexistente 404, id inválido 400', async () => {
  const { app, close } = await setup();
  try {
    const { id } = await conversa(app);
    for (const body of [{}, { actorId: 'a b', actorName: 'K' }, { actorId: '3', actorName: '<b>x' }, { actorId: '3', actorName: 'x'.repeat(81) }]) {
      const r = await arquivar(app, id, body);
      assert.equal(r.status, 400);
      assert.equal(r.body.error, 'DADOS_INVALIDOS');
      assert.ok(r.body.details.actorId || r.body.details.actorName);
    }
    assert.equal((await arquivar(app, 99999)).status, 404);
    assert.equal((await desarquivar(app, 99999)).status, 404);
    assert.equal((await arquivar(app, 'abc')).status, 400);
    assert.equal((await lista(app)).length, 1, 'nada foi arquivado');
  } finally {
    close();
  }
});

test('mensagem nova do CLIENTE desarquiva sozinha; resposta da equipe não', async () => {
  const { app, close } = await setup();
  try {
    const { id, cliente } = await conversaApi(app);
    await arquivar(app, id);
    assert.equal((await resposta(app, id)).status, 201);
    assert.deepEqual(ids(await lista(app, { filter: 'archived' })), [String(id)], 'resposta da equipe mantém arquivada');

    const nova = await request(app, 'POST', `/api/requests/${id}/messages`, { token: cliente.token, body: { body: 'Voltei' } });
    assert.equal(nova.status, 201);
    assert.deepEqual(await lista(app, { filter: 'archived' }), []);
    assert.deepEqual(ids(await lista(app)), [String(id)]);
  } finally {
    close();
  }
});

test('o cliente no site não vê nada diferente ao ser arquivado', async () => {
  const { app, close } = await setup();
  try {
    const { id, cliente } = await conversaApi(app);
    const ver = async () => ({
      reqs: JSON.stringify((await request(app, 'GET', '/api/me/requests', { token: cliente.token })).body),
      msgs: JSON.stringify((await request(app, 'GET', `/api/requests/${id}/messages`, { token: cliente.token })).body),
      one: JSON.stringify((await request(app, 'GET', `/api/requests/${id}`, { token: cliente.token })).body),
      conv: JSON.stringify((await request(app, 'GET', '/api/conversations', { token: cliente.token })).body),
    });
    const antesDe = await ver();
    await arquivar(app, id);
    const depois = await ver();
    assert.deepEqual(depois, antesDe);
    assert.ok(!/archiv|panel_changed/i.test(Object.values(depois).join('')));
  } finally {
    close();
  }
});

test('não lidas: conversa arquivada sai do contador de /unread e do feed', async () => {
  const { app, close } = await setup();
  try {
    const a = await conversa(app);
    await conversa(app);
    assert.equal((await svc(app, 'GET', '/api/service/conversations/unread')).body.count, 2);
    await arquivar(app, a.id);
    assert.equal((await svc(app, 'GET', '/api/service/conversations/unread')).body.count, 1);
    assert.equal((await changes(app)).body.unreadCount, 1);
    assert.deepEqual(ids(await lista(app, { filter: 'unread' })).length, 1);
  } finally {
    close();
  }
});

/* ----------------------------------------------------------------- changes */

test('changes: cursor opaco, sem since só cursor e unreadCount', async () => {
  const { app, close } = await setup();
  try {
    await conversa(app);
    const r = await changes(app);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.body).sort(), ['changed', 'cursor', 'unreadCount']);
    assert.deepEqual(r.body.changed, []);
    assert.equal(r.body.unreadCount, 1);
    assert.equal(typeof r.body.cursor, 'string');
    assert.match(r.body.cursor, /^[A-Za-z0-9_-]+$/);
    const t = decodeCursor(r.body.cursor);
    assert.ok(Math.abs(Date.now() - CURSOR_OVERLAP_MS - t) < 5000);
    assert.equal(decodeCursor('lixo'), null);
  } finally {
    close();
  }
});

test('changes: mensagem de cliente, arquivar/desarquivar e situação aparecem; resposta da equipe não', async () => {
  const { app, close } = await setup();
  try {
    const a = await conversa(app, { name: 'A' });
    const b = await conversa(app, { name: 'B' });
    const c = await conversa(app, { name: 'C' });
    const d = await conversa(app, { name: 'D' });

    /* cursor no futuro próximo: nada além do que acontecer depois dele conta */
    const base = Date.now() + 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    const since = encodeCursor(base);
    assert.deepEqual((await changes(app, since)).body.changed, []);

    await clienteEscreve(a, 'nova');
    await arquivar(app, b.id);
    await svc(app, 'POST', `/api/service/requests/${c.id}/status`, { body: { status: 'ORCAMENTO', ...ACTOR } });
    await resposta(app, d.id); // equipe: não é mudança

    const r = await changes(app, since);
    assert.equal(r.status, 200);
    assert.deepEqual([...r.body.changed].sort(), [String(a.id), String(b.id), String(c.id)].sort());
    assert.ok(!r.body.changed.includes(String(d.id)));
    assert.ok(decodeCursor(r.body.cursor) >= decodeCursor(since));

    await desarquivar(app, b.id);
    assert.ok((await changes(app, since)).body.changed.includes(String(b.id)));
    assert.deepEqual((await changes(app, encodeCursor(Date.now() + 60_000))).body.changed, [], 'cursor no futuro: nada');
  } finally {
    close();
  }
});

test('changes: mensagem antiga (antes do cursor) não aparece; cursor inválido 400', async () => {
  const { app, db, close } = await setup();
  try {
    const a = await conversa(app);
    const velho = Date.now() - 7_200_000;
    await db.execute('UPDATE messages SET created_at = ?', [velho]);
    await db.execute('UPDATE project_requests SET updated_at = ?', [velho]);
    assert.deepEqual((await changes(app, antes())).body.changed, []);
    assert.deepEqual((await changes(app, encodeCursor(velho - 1))).body.changed, [String(a.id)]);

    for (const since of ['x', '!!!!', 'Y3F3ZXJ0eQ', 'a'.repeat(100), Buffer.from('c1.abc').toString('base64url')]) {
      const r = await changes(app, since);
      assert.equal(r.status, 400, since);
      assert.equal(r.body.error, 'DADOS_INVALIDOS');
      assert.ok(r.body.details.since);
    }
  } finally {
    close();
  }
});

test('changes: no máximo 200 por chamada; a seguinte continua de onde parou', async () => {
  const { app, ctx, close } = await setup();
  try {
    const userId = await ctx.users.create({ name: 'Massa', company: null, email: 'massa@teste.com', phone: null, passwordHash: 'x', role: 'CLIENT' });
    const t0 = Date.now() - 600_000;
    const esperados = [];
    for (let i = 0; i < 250; i += 1) {
      const rid = await ctx.requests.create({ userId, type: 'Site', description: `d${i}`, budget: null, deadline: null, status: 'NOVO' });
      esperados.push(String(rid));
      await ctx.db.execute(
        'INSERT INTO messages (request_id, author_id, body, is_read, created_at) VALUES (?, ?, ?, 0, ?)',
        [rid, userId, `m${i}`, t0 + i * 10]
      );
    }
    await ctx.db.execute('UPDATE project_requests SET updated_at = ?', [t0]);
    const colhidas = new Set();
    let since = encodeCursor(t0 - 1);
    let chamadas = 0;
    for (; chamadas < 5; chamadas += 1) {
      const r = (await changes(app, since)).body;
      assert.ok(r.changed.length <= 200);
      if (chamadas === 0) assert.equal(r.changed.length, 200);
      r.changed.forEach((x) => colhidas.add(x));
      if (colhidas.size === 250 && r.changed.length < 200) break;
      since = r.cursor;
    }
    assert.deepEqual([...colhidas].sort(), [...esperados].sort(), 'nada se perdeu');
  } finally {
    close();
  }
});

test('changes: desempenho com 5.000 mensagens e uso de índice', async () => {
  const { app, ctx, db, close } = await setup();
  try {
    const userId = await ctx.users.create({ name: 'Massa', company: null, email: 'massa@teste.com', phone: null, passwordHash: 'x', role: 'CLIENT' });
    const t0 = Date.now() - 3_600_000;
    await db.transaction(async (tx) => {
      for (let i = 0; i < 500; i += 1) {
        const { insertId } = await tx.execute(
          `INSERT INTO project_requests (user_id, type, description, status, created_at, updated_at)
           VALUES (?, 'Site', ?, 'NOVO', ?, ?)`,
          [userId, `d${i}`, t0, t0]
        );
        for (let j = 0; j < 10; j += 1) {
          await tx.execute(
            'INSERT INTO messages (request_id, author_id, body, is_read, created_at) VALUES (?, ?, ?, 0, ?)',
            [insertId, userId, `mensagem ${i}-${j}`, t0 + i * 10 + j]
          );
        }
      }
    });
    assert.equal((await db.queryOne('SELECT COUNT(*) AS n FROM messages')).n, 5000);

    const since = encodeCursor(Date.now() - 1000);
    const inicio = performance.now();
    for (let i = 0; i < 20; i += 1) assert.equal((await changes(app, since)).status, 200);
    const medio = (performance.now() - inicio) / 20;
    assert.ok(medio < 100, `changes levou ${medio.toFixed(1)} ms em média`);

    /* o plano usa os índices das três faixas */
    const plano = (
      await db.query(
        `EXPLAIN QUERY PLAN SELECT rid, MAX(ts) FROM (
           SELECT m.request_id AS rid, m.created_at AS ts FROM messages m JOIN users a ON a.id = m.author_id
            WHERE m.created_at > 1 AND a.role = 'CLIENT'
           UNION ALL SELECT r.id, r.panel_changed_at FROM project_requests r WHERE r.panel_changed_at > 1
           UNION ALL SELECT r.id, r.updated_at FROM project_requests r WHERE r.updated_at > 1
         ) GROUP BY rid`
      )
    ).map((l) => l.detail).join('\n');
    assert.match(plano, /ix_messages_created/);
    assert.match(plano, /ix_requests_panel_changed/);
    assert.match(plano, /ix_requests_updated/);
  } finally {
    close();
  }
});

/* ------------------------------------------------------------------ modelos */

const tpl = (over = {}) => ({ title: 'Boas-vindas', body: 'Olá {nome}, sobre {assunto}...', ...ACTOR, ...over });

test('modelos: criar, listar, editar (objeto completo) e excluir', async () => {
  const { app, db, close } = await setup();
  try {
    assert.deepEqual((await svc(app, 'GET', '/api/service/templates')).body, { templates: [] });

    const criado = await svc(app, 'POST', '/api/service/templates', { body: tpl() });
    assert.equal(criado.status, 201);
    const t = criado.body.template;
    assert.deepEqual(Object.keys(t).sort(), ['body', 'id', 'title', 'updatedAt', 'updatedByName']);
    assert.equal(t.id, '1');
    assert.equal(t.title, 'Boas-vindas');
    assert.equal(t.body, 'Olá {nome}, sobre {assunto}...');
    assert.equal(t.updatedByName, 'Kaique');
    assert.match(t.updatedAt, /^\d{4}-\d\d-\d\dT.*Z$/);

    await svc(app, 'POST', '/api/service/templates', { body: tpl({ title: 'Aviso de prazo', body: 'Prazo ok' }) });
    const lst = (await svc(app, 'GET', '/api/service/templates')).body.templates;
    assert.deepEqual(lst.map((x) => x.title), ['Aviso de prazo', 'Boas-vindas'], 'ordem alfabética');

    const put = await svc(app, 'PUT', `/api/service/templates/${t.id}`, {
      body: { title: 'Saudação', body: 'Oi!', actorId: '9', actorName: 'Maria' },
    });
    assert.equal(put.status, 200);
    assert.equal(put.body.template.title, 'Saudação');
    assert.equal(put.body.template.updatedByName, 'Maria');

    const del = await svc(app, 'DELETE', `/api/service/templates/${t.id}`, { query: { actorId: '9', actorName: 'Maria' } });
    assert.equal(del.status, 204);
    assert.equal((await svc(app, 'GET', '/api/service/templates')).body.templates.length, 1);

    const logs = await db.query("SELECT action, resource_id, details FROM audit_logs WHERE action LIKE 'MODELO_RESPOSTA_%' ORDER BY id");
    assert.deepEqual(logs.map((l) => l.action), ['MODELO_RESPOSTA_CRIADO', 'MODELO_RESPOSTA_CRIADO', 'MODELO_RESPOSTA_EDITADO', 'MODELO_RESPOSTA_EXCLUIDO']);
    assert.deepEqual(JSON.parse(logs[2].details), { title: 'Saudação', actorId: '9', actorName: 'Maria' });
    assert.ok(!logs.some((l) => /Oi!|Olá/.test(l.details)), 'texto do modelo não vai para a auditoria');
  } finally {
    close();
  }
});

test('modelos: validação por campo, objeto completo e texto puro', async () => {
  const { app, close } = await setup();
  try {
    const ruim = [
      [tpl({ title: '' }), 'title'],
      [tpl({ title: 'x'.repeat(61) }), 'title'],
      [tpl({ title: 'a\u0000b' }), 'title'],
      [tpl({ title: 5 }), 'title'],
      [tpl({ body: '' }), 'body'],
      [tpl({ body: 'x'.repeat(2001) }), 'body'],
      [tpl({ body: 'a\u0000b' }), 'body'],
      [tpl({ body: null }), 'body'],
      [tpl({ actorId: undefined }), 'actorId'],
      [tpl({ actorName: 'x<y' }), 'actorName'],
    ];
    for (const [body, campo] of ruim) {
      const r = await svc(app, 'POST', '/api/service/templates', { body });
      assert.equal(r.status, 400, campo);
      assert.equal(r.body.error, 'DADOS_INVALIDOS');
      assert.ok(r.body.details[campo], `${campo}: ${JSON.stringify(r.body.details)}`);
    }
    const juntos = await svc(app, 'POST', '/api/service/templates', { body: { title: '', body: '', actorId: '', actorName: '' } });
    assert.deepEqual(Object.keys(juntos.body.details).sort(), ['actorId', 'actorName', 'body', 'title']);
    /* limites exatos passam; quebra de linha e emoji também */
    assert.equal((await svc(app, 'POST', '/api/service/templates', { body: tpl({ title: 'x'.repeat(60), body: 'y'.repeat(2000) }) })).status, 201);
    assert.equal((await svc(app, 'POST', '/api/service/templates', { body: tpl({ title: 'Emoji 😀', body: 'Linha 1\r\nLinha 2\n\tfim 😀' }) })).status, 201);

    /* HTML fica como texto: guardado e devolvido sem interpretação */
    const html = '<img src=x onerror=alert(1)> <b>oi</b> &amp;';
    const r = await svc(app, 'POST', '/api/service/templates', { body: tpl({ title: 'Html', body: html }) });
    assert.equal(r.status, 201);
    assert.equal(r.body.template.body, html);

    /* PUT parcial não vale: objeto completo */
    const id = r.body.template.id;
    const parcial = await svc(app, 'PUT', `/api/service/templates/${id}`, { body: { title: 'só título', ...ACTOR } });
    assert.equal(parcial.status, 400);
    assert.ok(parcial.body.details.body);

    assert.equal((await svc(app, 'PUT', '/api/service/templates/999', { body: tpl() })).status, 404);
    assert.equal((await svc(app, 'DELETE', '/api/service/templates/999', { query: ACTOR })).status, 404);
    assert.equal((await svc(app, 'DELETE', `/api/service/templates/${id}`)).status, 400, 'DELETE sem ator');
    assert.equal((await svc(app, 'PUT', '/api/service/templates/abc', { body: tpl() })).status, 400);
    assert.equal((await svc(app, 'POST', '/api/service/templates', { body: { ...tpl(), body: 'x'.repeat(40_000) } })).status, 413);
  } finally {
    close();
  }
});

test('modelos: no máximo 50 (409), e excluir libera vaga', async () => {
  const { app, close } = await setup();
  try {
    for (let i = 0; i < 50; i += 1) {
      const r = await svc(app, 'POST', '/api/service/templates', { body: tpl({ title: `Modelo ${i}` }) });
      assert.equal(r.status, 201, `#${i}`);
    }
    const r = await svc(app, 'POST', '/api/service/templates', { body: tpl({ title: 'Excedente' }) });
    assert.equal(r.status, 409);
    assert.equal(r.body.error, 'LIMITE_DE_MODELOS');
    assert.equal((await svc(app, 'GET', '/api/service/templates')).body.templates.length, 50);
    assert.equal((await svc(app, 'DELETE', '/api/service/templates/1', { query: ACTOR })).status, 204);
    assert.equal((await svc(app, 'POST', '/api/service/templates', { body: tpl({ title: 'Cabe agora' }) })).status, 201);
  } finally {
    close();
  }
});

/* ------------------------------------------------------- vazamento e acesso */

test('nenhuma resposta nova vaza hash, sessão ou e-mail fora do contrato', async () => {
  const { app, close } = await setup();
  try {
    const { id } = await conversa(app, { email: 'dono@exemplo.com' });
    await arquivar(app, id);
    await svc(app, 'POST', '/api/service/templates', { body: tpl() });
    const respostas = [
      await svc(app, 'GET', '/api/service/conversations', { query: { filter: 'archived' } }),
      await changes(app, antes()),
      await svc(app, 'GET', '/api/service/templates'),
    ];
    const texto = JSON.stringify(respostas.map((r) => r.body));
    for (const proibido of ['password', 'scrypt', 'hash', 'session', 'oi_session', 'user_id', 'archived_at', 'panel_changed_at', 'atendimento@sistema']) {
      assert.ok(!texto.toLowerCase().includes(proibido), `vazou: ${proibido}`);
    }
    /* o e-mail do cliente só aparece na lista (campo clientEmail), nunca em changes/modelos */
    assert.ok(!JSON.stringify(respostas[1].body).includes('dono@exemplo.com'));
    assert.ok(!JSON.stringify(respostas[2].body).includes('dono@exemplo.com'));
    for (const r of respostas) {
      assert.equal(r.headers['Cache-Control'], 'no-store');
      assert.equal(r.headers['X-Content-Type-Options'], 'nosniff');
    }
  } finally {
    close();
  }
});

const ROTAS_NOVAS = [
  ['GET', '/api/service/conversations/changes'],
  ['POST', '/api/service/conversations/1/archive'],
  ['POST', '/api/service/conversations/1/unarchive'],
  ['GET', '/api/service/templates'],
  ['POST', '/api/service/templates'],
  ['PUT', '/api/service/templates/1'],
  ['DELETE', '/api/service/templates/1'],
];

test('autenticação: sem chave 401 sem detalhe, cookie não vale, Origin 403, sem env 503', async () => {
  const { app, close } = await setup();
  try {
    const { cliente } = await conversaApi(app);
    let n = 0;
    for (const [metodo, caminho] of ROTAS_NOVAS) {
      for (const key of [null, 'errada', `${KEY}x`]) {
        n += 1;
        const r = await svc(app, metodo, caminho, { key, headers: { 'x-forwarded-for': `198.51.100.${n}` } });
        assert.equal(r.status, 401, `${metodo} ${caminho}`);
        assert.deepEqual(Object.keys(r.body).sort(), ['error', 'message']);
      }
      const comCookie = await request(app, metodo, caminho, { token: cliente.token, headers: { 'x-forwarded-for': `198.51.100.${200 + n}` } });
      assert.equal(comCookie.status, 401);
      const origem = await svc(app, metodo, caminho, { headers: { origin: 'https://evil.exemplo', 'x-forwarded-for': `198.51.100.${100 + n}` } });
      assert.equal(origem.status, 403);
    }
  } finally {
    close();
  }
  const sem = await createTestApp({ serviceKey: undefined });
  try {
    for (const [metodo, caminho] of ROTAS_NOVAS) {
      assert.equal((await svc(sem.app, metodo, caminho)).status, 503, caminho);
    }
  } finally {
    sem.close();
  }
});

test('rate limit vale para as rotas novas', async () => {
  const { app, close } = await createTestApp({ serviceKey: KEY, serviceRatePerMin: 5 });
  try {
    let ultimo;
    for (let i = 0; i < 8; i += 1) ultimo = await svc(app, 'GET', '/api/service/templates');
    assert.equal(ultimo.status, 429);
  } finally {
    close();
  }
});

test('migração do SQLite é idempotente e preserva dados', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { aplicarMigracoesSqlite } = await import('../../server/db/sqlite.js');
  const { readFileSync } = await import('node:fs');
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, company TEXT, email TEXT NOT NULL UNIQUE,
             phone TEXT, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'CLIENT', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
           CREATE TABLE project_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, type TEXT NOT NULL, description TEXT NOT NULL,
             budget TEXT, deadline TEXT, status TEXT NOT NULL DEFAULT 'NOVO', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
           CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT, request_id INTEGER NOT NULL, author_id INTEGER NOT NULL,
             body TEXT NOT NULL, is_read INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
           INSERT INTO users (name,email,password_hash,role,created_at,updated_at) VALUES ('Ana','ana@x.com','h','CLIENT',1,1);
           INSERT INTO project_requests (user_id,type,description,created_at,updated_at) VALUES (1,'Site','antiga',1,1);`);
  aplicarMigracoesSqlite(db);
  aplicarMigracoesSqlite(db);
  const cols = db.prepare('PRAGMA table_info(project_requests)').all().map((c) => c.name);
  assert.ok(cols.includes('archived_at') && cols.includes('panel_changed_at'));
  assert.equal(db.prepare('SELECT description FROM project_requests').get().description, 'antiga');
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index'").all().map((i) => i.name);
  for (const nome of ['ix_messages_created', 'ix_requests_panel_changed', 'ix_requests_updated']) assert.ok(idx.includes(nome), nome);
  db.close();

  for (const arquivo of ['schema.sqlite.sql', 'schema.postgres.sql']) {
    const sql = readFileSync(new URL(`../../server/db/${arquivo}`, import.meta.url), 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS reply_templates/, arquivo);
  }
  const pg = readFileSync(new URL('../../server/db/schema.postgres.sql', import.meta.url), 'utf8');
  assert.match(pg, /ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS archived_at/);
  assert.match(pg, /ALTER TABLE project_requests ADD COLUMN IF NOT EXISTS panel_changed_at/);
});
