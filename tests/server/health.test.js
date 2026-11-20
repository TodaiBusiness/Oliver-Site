/* =========================================================================
   /api/health confere o esquema do banco, e o servidor migra ao subir.

   Incidente de 20/11/2026: a imagem nova do site subiu sem o db-migrate.mjs,
   o login do portal quebrou ("coluna status não existe", "tabela
   portal_sessions não existe") e o /api/health continuava dando 200.
   ========================================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createTestDb } from '../../server/db/index.js';
import { createApp } from '../../server/app.js';
import { checkSchema, parseRequiredSchema, requiredSchema } from '../../server/db/schemaCheck.js';
import { healthService } from '../../server/services/health.js';
import { applySchemaOnStart, migrateOnStartEnabled } from '../../server/db/startupMigration.js';
import { createTestApp, request } from './helpers.js';

const silencioso = { log: () => {} };

test('o parser do schema acha as tabelas e as colunas que quebraram o login em 20/11', () => {
  const exigido = requiredSchema();
  assert.ok(exigido.has('portal_sessions'));
  for (const c of ['status', 'decided_at', 'notify_email', 'email', 'password_hash']) {
    assert.ok(exigido.get('users').has(c), `users.${c}`);
  }
  /* Restrições não viram coluna (nem a continuação "REFERENCES ..." da linha de baixo). */
  for (const colunas of exigido.values()) {
    for (const proibida of ['constraint', 'primary', 'unique', 'foreign', 'check', 'references']) {
      assert.ok(!colunas.has(proibida), proibida);
    }
  }
});

test('o parser ignora comentários e entende CREATE TABLE e ALTER TABLE ADD COLUMN', () => {
  const sql = `
    -- CREATE TABLE fantasma (x INT);
    CREATE TABLE IF NOT EXISTS a (
      id   BIGINT NOT NULL,
      nome VARCHAR(10) NULL, -- comentário
      CONSTRAINT pk_a PRIMARY KEY (id),
      CONSTRAINT fk_a FOREIGN KEY (id)
        REFERENCES b(id) ON DELETE CASCADE
    );
    ALTER TABLE a ADD COLUMN IF NOT EXISTS extra INT NULL;
  `;
  const exigido = parseRequiredSchema(sql);
  assert.deepEqual([...exigido.keys()], ['a']);
  assert.deepEqual([...exigido.get('a')].sort(), ['extra', 'id', 'nome']);
});

test('banco em dia: checkSchema aprova e /api/health responde 200', async () => {
  const { app, db, close } = await createTestApp();
  try {
    assert.deepEqual(await checkSchema(db), { ok: true });
    const r = await request(app, 'GET', '/api/health');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { ok: true });
  } finally {
    close();
  }
});

test('banco sem portal_sessions e sem users.status: /api/health responde 503 e o log diz o que falta', async () => {
  const db = await createTestDb();
  await db.init();
  try {
    await db.execute('DROP TABLE portal_sessions');
    await db.execute('DROP INDEX IF EXISTS ix_users_status');
    await db.execute('ALTER TABLE users DROP COLUMN status');

    const r0 = await checkSchema(db);
    assert.equal(r0.ok, false);
    assert.ok(r0.missing.includes('portal_sessions'));
    assert.ok(r0.missing.includes('users.status'));
    assert.ok(!r0.missing.includes('users.email'), 'só o que falta de verdade');

    const logs = [];
    const app = createApp(db, { health: healthService(db, { ttlMs: 0, log: (m) => logs.push(m) }) });
    const r = await request(app, 'GET', '/api/health');
    assert.equal(r.status, 503);
    assert.equal(r.body.ok, false);
    assert.equal(r.body.error, 'BANCO_DESATUALIZADO');
    assert.ok(!JSON.stringify(r.body).includes('portal_sessions'), 'a resposta pública não lista o esquema');
    assert.match(logs.join('\n'), /portal_sessions/);
    assert.match(logs.join('\n'), /users\.status/);

    /* Rodar a migração (o que o server.js faz ao subir) conserta: volta a 200. */
    const m = await applySchemaOnStart(db, { env: {}, ...silencioso });
    assert.equal(m.applied, true);
    assert.equal((await request(app, 'GET', '/api/health')).status, 200);
  } finally {
    await db.close();
  }
});

test('banco fora do ar: 503 BANCO_INDISPONIVEL (não confunde com desatualizado)', async () => {
  const quebrado = { query: async () => { throw new Error('connect ECONNREFUSED'); } };
  const saude = healthService(quebrado, { ttlMs: 0, log: () => {} });
  assert.deepEqual(await saude.check(), {
    ok: false,
    code: 'BANCO_INDISPONIVEL',
    message: 'O banco de dados não respondeu.',
  });
});

test('o resultado fica guardado pelo ttl e pedidos simultâneos fazem uma conferência só', async () => {
  let agora = 0;
  let chamadas = 0;
  const check = async () => {
    chamadas += 1;
    await new Promise((r) => setTimeout(r, 5));
    return { ok: true };
  };
  const saude = healthService({}, { ttlMs: 1000, now: () => agora, check, log: () => {} });
  await Promise.all([saude.check(), saude.check(), saude.check()]);
  assert.equal(chamadas, 1);
  agora = 500;
  await saude.check();
  assert.equal(chamadas, 1, 'dentro do ttl não consulta de novo');
  agora = 1500;
  await saude.check();
  assert.equal(chamadas, 2);
});

test('o log não repete a mesma falha a cada health check', async () => {
  const logs = [];
  const check = async () => ({ ok: false, missing: ['portal_sessions'] });
  const saude = healthService({}, { ttlMs: 0, check, log: (m) => logs.push(m) });
  await saude.check();
  await saude.check();
  await saude.check();
  assert.equal(logs.length, 1);
});

test('DB_MIGRATE_ON_START: ligado por padrão, "false" desliga', async () => {
  assert.equal(migrateOnStartEnabled({}), true);
  assert.equal(migrateOnStartEnabled({ DB_MIGRATE_ON_START: 'true' }), true);
  assert.equal(migrateOnStartEnabled({ DB_MIGRATE_ON_START: ' FALSE ' }), false);

  let chamou = false;
  const r = await applySchemaOnStart(
    { init: async () => { chamou = true; } },
    { env: { DB_MIGRATE_ON_START: 'false' }, ...silencioso }
  );
  assert.deepEqual(r, { applied: false, skipped: true });
  assert.equal(chamou, false);
});

test('migração que falha ou trava não derruba o servidor', async () => {
  const erros = [];
  const opcoes = { env: {}, log: () => {}, logError: (...a) => erros.push(a.join(' ')) };

  const falha = await applySchemaOnStart({ init: async () => { throw new Error('permission denied'); } }, opcoes);
  assert.equal(falha.applied, false);
  assert.match(erros.at(-1), /permission denied/);

  const trava = await applySchemaOnStart({ init: () => new Promise(() => {}) }, { ...opcoes, timeoutMs: 20 });
  assert.equal(trava.applied, false);
  assert.match(erros.at(-1), /passou de/);
});

test('server.js aplica o esquema ao subir, antes de montar a aplicação', () => {
  const fonte = readFileSync(resolve(import.meta.dirname, '../../server.js'), 'utf8');
  const migra = fonte.indexOf('await applySchemaOnStart(db)');
  assert.ok(migra > 0, 'server.js chama applySchemaOnStart');
  assert.ok(migra < fonte.indexOf('createApp(db'), 'antes do createApp');
});
