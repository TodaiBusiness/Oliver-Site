/* =========================================================================
   Tradução de SQL do driver PostgreSQL.

   Os repositórios escrevem SQL com `?` (forma do SQLite). Quem converte para
   a forma do Postgres é o driver — e é aí que um erro silencioso trocaria a
   ordem dos parâmetros de uma consulta. Por isso estes testes.

   Não abrem conexão: exercitam só as funções puras.
   ========================================================================= */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseConnectionString,
  toNumberedPlaceholders,
  withReturningId,
} from '../../server/db/postgres.js';

test('os marcadores viram $1, $2... na mesma ordem', () => {
  assert.equal(
    toNumberedPlaceholders('SELECT * FROM users WHERE email = ? AND role = ?'),
    'SELECT * FROM users WHERE email = $1 AND role = $2'
  );

  assert.equal(
    toNumberedPlaceholders('INSERT INTO t (a, b, c) VALUES (?, ?, ?)'),
    'INSERT INTO t (a, b, c) VALUES ($1, $2, $3)'
  );
});

test('interrogação dentro de texto do SQL não vira marcador', () => {
  assert.equal(
    toNumberedPlaceholders("SELECT ? AS q, 'e aí?' AS texto WHERE x = ?"),
    "SELECT $1 AS q, 'e aí?' AS texto WHERE x = $2"
  );
});

test('LIMIT e OFFSET continuam sendo parâmetros', () => {
  assert.equal(
    toNumberedPlaceholders('SELECT 1 WHERE u = ? ORDER BY id LIMIT ? OFFSET ?'),
    'SELECT 1 WHERE u = $1 ORDER BY id LIMIT $2 OFFSET $3'
  );
});

test('INSERT ganha RETURNING id', () => {
  assert.equal(
    withReturningId('INSERT INTO messages (body) VALUES (?)'),
    'INSERT INTO messages (body) VALUES (?) RETURNING id'
  );
});

test('tabela de chave composta não ganha RETURNING id', () => {
  const sql = `INSERT INTO client_projects (user_id, project_id, created_at)
         VALUES (?, ?, ?)`;
  assert.equal(withReturningId(sql), sql, 'client_projects não tem coluna id');
});

test('UPDATE e DELETE não são tocados', () => {
  for (const sql of [
    'UPDATE projects SET title = ? WHERE id = ?',
    'DELETE FROM sessions WHERE id = ?',
    'SELECT COUNT(*) AS total FROM users',
  ]) {
    assert.equal(withReturningId(sql), sql);
  }
});

test('RETURNING não é duplicado', () => {
  const sql = 'INSERT INTO users (name) VALUES (?) RETURNING id';
  assert.equal(withReturningId(sql), sql);
});

test('a URI do Neon é lida em campos separados', () => {
  const dados = parseConnectionString(
    'postgresql://todai:s3nh%40forte@ep-teste-pooler.sa-east-1.aws.neon.tech/todai_site?sslmode=require&channel_binding=require'
  );

  assert.deepEqual(dados, {
    host: 'ep-teste-pooler.sa-east-1.aws.neon.tech',
    port: 5432,
    user: 'todai',
    password: 's3nh@forte', // a senha vem codificada na URI e é decodificada
    database: 'todai_site',
  });
});
