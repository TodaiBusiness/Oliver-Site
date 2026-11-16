/* =========================================================================
   Driver SQLite — desenvolvimento e testes.
   Usa o módulo `node:sqlite`, embutido no Node 22+: nenhuma dependência.
   ========================================================================= */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { normalizeParams, toNumber } from './normalize.js';

const SCHEMA_PATH = resolve(import.meta.dirname, 'schema.sqlite.sql');

/* SQLite não tem `ADD COLUMN IF NOT EXISTS`: o que o schema ganhou depois da
   primeira versão entra aqui, conferindo `PRAGMA table_info` antes (idempotente).
   Bancos novos já nascem com as colunas pelo CREATE TABLE. */
const COLUNAS_NOVAS = [
  ['sessions', 'last_seen_at', 'INTEGER'],
  ['sessions', 'ip', 'TEXT'],
  ['sessions', 'user_agent', 'TEXT'],
  ['login_attempts', 'ip', 'TEXT'],
  ['audit_logs', 'ip', 'TEXT'],
  ['audit_logs', 'user_agent', 'TEXT'],
];

export function aplicarMigracoesSqlite(db) {
  for (const [tabela, coluna, tipo] of COLUNAS_NOVAS) {
    const existentes = db.prepare(`PRAGMA table_info(${tabela})`).all();
    if (!existentes.some((c) => c.name === coluna)) {
      db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
    }
  }
}

export function createSqliteDriver({ file = ':memory:' } = {}) {
  if (file !== ':memory:') mkdirSync(dirname(resolve(file)), { recursive: true });

  const db = new DatabaseSync(file);

  /* Integridade referencial não é ligada por padrão no SQLite. */
  db.exec('PRAGMA foreign_keys = ON');

  return {
    dialect: 'sqlite',

    /** Cria as tabelas (idempotente). */
    async init() {
      db.exec(readFileSync(SCHEMA_PATH, 'utf8'));
      aplicarMigracoesSqlite(db);
    },

    async query(sql, params = []) {
      return db.prepare(sql).all(...normalizeParams(params));
    },

    async queryOne(sql, params = []) {
      const rows = db.prepare(sql).all(...normalizeParams(params));
      return rows[0] ?? null;
    },

    async execute(sql, params = []) {
      const result = db.prepare(sql).run(...normalizeParams(params));
      return {
        insertId: toNumber(result.lastInsertRowid),
        affectedRows: toNumber(result.changes),
      };
    },

    /** Transação: reverte tudo se a função lançar. */
    async transaction(run) {
      db.exec('BEGIN');
      try {
        const result = await run(this);
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },

    async close() {
      db.close();
    },
  };
}
