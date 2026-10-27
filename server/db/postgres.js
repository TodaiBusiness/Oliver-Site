/* =========================================================================
   Driver PostgreSQL — produção (Neon).

   Usa `pg` com pool e SEMPRE parâmetros ($1, $2, ...): nenhum valor vindo do
   usuário é concatenado no SQL, que é a defesa real contra SQL injection.

   Duas traduções acontecem aqui, e só aqui, para que os repositórios
   continuem escrevendo o mesmo SQL do SQLite:
     · `?` vira `$1, $2, ...`
     · `INSERT` ganha `RETURNING id`, que é como o Postgres devolve o id novo
       (não existe `insertId` como no MySQL).
   ========================================================================= */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeParams } from './normalize.js';

const SCHEMA_PATH = resolve(import.meta.dirname, 'schema.postgres.sql');

/* Tabelas sem coluna `id` — nelas o RETURNING id não existe e quebraria o
   INSERT. O vínculo cliente ↔ projeto e as contagens de visitas, de chave composta. */
const TABELAS_SEM_ID = new Set(['client_projects', 'site_visit_stats']);

const INSERT_INTO = /^\s*insert\s+into\s+"?([a-z_][a-z0-9_]*)"?/i;

/**
 * `?` → `$1, $2, ...`, respeitando literais entre aspas (um `?` dentro de
 * uma string do SQL é texto, não marcador).
 */
export function toNumberedPlaceholders(sql) {
  let resultado = '';
  let posicao = 0;
  let aspas = null;

  for (const caractere of sql) {
    if (aspas) {
      resultado += caractere;
      if (caractere === aspas) aspas = null;
      continue;
    }

    if (caractere === "'" || caractere === '"') {
      aspas = caractere;
      resultado += caractere;
      continue;
    }

    if (caractere === '?') {
      posicao += 1;
      resultado += `$${posicao}`;
      continue;
    }

    resultado += caractere;
  }

  return resultado;
}

/** Acrescenta `RETURNING id` ao INSERT quando a tabela tem essa coluna. */
export function withReturningId(sql) {
  const encontrado = INSERT_INTO.exec(sql);
  if (!encontrado) return sql;
  if (TABELAS_SEM_ID.has(encontrado[1].toLowerCase())) return sql;
  if (/\breturning\b/i.test(sql)) return sql;

  return `${sql.trimEnd().replace(/;$/, '')} RETURNING id`;
}

/**
 * Neon (e qualquer Postgres gerenciado) entrega uma URI. Ela é lida aqui em
 * campos separados de propósito: assim o TLS é decidido por este arquivo, e
 * não por parâmetros da URI (`sslmode`, `channel_binding`) cuja interpretação
 * varia entre versões da biblioteca.
 */
export function parseConnectionString(connectionString) {
  const url = new URL(connectionString);

  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: decodeURIComponent(url.pathname.replace(/^\//, '')),
  };
}

export async function createPostgresDriver(options) {
  /* Import dinâmico: quem roda em SQLite não precisa ter o `pg` instalado. */
  const { default: pg } = await import('pg');

  /* BIGINT chega como string por padrão (o tipo cabe mais que um Number).
     Aqui ele guarda id e data em epoch — bem abaixo do limite seguro —, e a
     aplicação inteira trabalha com Number. */
  pg.types.setTypeParser(pg.types.builtins.INT8, (valor) => Number(valor));

  const pool = new pg.Pool({
    ...parseConnectionString(options.url),

    /* TLS com validação de certificado e hostname: sem isso a conexão até é
       criptografada, mas aceita qualquer servidor que se apresente no meio do
       caminho. `false` só existe para um Postgres local sem TLS. */
    ssl: options.ssl ? { rejectUnauthorized: true } : false,

    max: 5, // serverless: poucas conexões por instância
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
  });

  /* Erro em conexão ociosa do pool derruba o processo se ninguém escutar. */
  pool.on('error', (error) => {
    console.error('[postgres] conexão ociosa falhou:', error?.message);
  });

  const run = async (executor, sql, params) =>
    executor.query(toNumberedPlaceholders(sql), normalizeParams(params));

  const runExecute = async (executor, sql, params) => {
    const resultado = await run(executor, withReturningId(sql), params);
    const id = resultado.rows[0]?.id;

    return {
      /* Só faz sentido para as tabelas de id numérico; nas demais fica 0,
         que é o que os chamadores já ignoram. */
      insertId: typeof id === 'number' ? id : 0,
      affectedRows: Number(resultado.rowCount ?? 0),
    };
  };

  const wrap = (client) => ({
    dialect: 'postgres',

    async query(sql, params = []) {
      const resultado = await run(client, sql, params);
      return resultado.rows;
    },

    async queryOne(sql, params = []) {
      const resultado = await run(client, sql, params);
      return resultado.rows[0] ?? null;
    },

    async execute(sql, params = []) {
      return runExecute(client, sql, params);
    },
  });

  return {
    dialect: 'postgres',

    /**
     * Executa o schema. Sem parâmetros no meio, o Postgres aceita o arquivo
     * inteiro de uma vez — e o faz dentro de uma transação implícita, então
     * um erro de DDL não deixa metade das tabelas criadas.
     */
    async init() {
      const client = await pool.connect();
      try {
        await client.query(readFileSync(SCHEMA_PATH, 'utf8'));
      } finally {
        client.release();
      }
    },

    async query(sql, params = []) {
      const resultado = await run(pool, sql, params);
      return resultado.rows;
    },

    async queryOne(sql, params = []) {
      const resultado = await run(pool, sql, params);
      return resultado.rows[0] ?? null;
    },

    async execute(sql, params = []) {
      return runExecute(pool, sql, params);
    },

    async transaction(runInTransaction) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const resultado = await runInTransaction(wrap(client));
        await client.query('COMMIT');
        return resultado;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },

    async close() {
      await pool.end();
    },
  };
}
