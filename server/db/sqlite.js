/* =========================================================================
   Driver SQLite — desenvolvimento e testes.
   Usa o módulo `node:sqlite`, embutido no Node 22+: nenhuma dependência.
   ========================================================================= */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { normalizeParams, toNumber } from './normalize.js';
import { LOGIN_DISABLED_HASH, SYSTEM_USER } from '../config.js';

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
  /* Mensagens respondidas pelo Panel: quem respondeu (guid e nome do
     administrador do Panel). author_id aponta para o usuário de sistema. */
  ['messages', 'author_external_id', 'TEXT'],
  ['messages', 'author_external_name', 'TEXT'],
  /* Idempotência do envio pelo Panel (reenvio com o mesmo id não duplica). */
  ['messages', 'client_message_id', 'TEXT'],
  /* Arquivar conversa (Panel) e marca de mudança para o feed /conversations/changes. */
  ['project_requests', 'archived_at', 'INTEGER'],
  ['project_requests', 'panel_changed_at', 'INTEGER'],
  /* Aviso por e-mail quando a equipe responde (1 = recebe; o cliente desliga em Conta > Segurança). */
  ['users', 'notify_email', 'INTEGER NOT NULL DEFAULT 1'],
];

export function aplicarMigracoesSqlite(db) {
  for (const [tabela, coluna, tipo] of COLUNAS_NOVAS) {
    const existentes = db.prepare(`PRAGMA table_info(${tabela})`).all();
    if (!existentes.length) continue; // tabela ainda não existe: o schema a cria completa
    if (!existentes.some((c) => c.name === coluna)) {
      db.exec(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`);
    }
  }

  /* Usuário de sistema que assina as mensagens do Panel (idempotente: o e-mail é UNIQUE).
     Hash inválido de propósito: nenhuma senha confere, então o login é impossível. */
  const temTabela = (nome) => db.prepare(`PRAGMA table_info(${nome})`).all().length > 0;
  if (!temTabela('users') || !temTabela('messages')) return;
  const agora = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO users (name, company, email, phone, password_hash, role, created_at, updated_at)
     VALUES (?, 'TODAI', ?, NULL, ?, 'ADMIN', ?, ?)`
  ).run(SYSTEM_USER.NAME, SYSTEM_USER.EMAIL, LOGIN_DISABLED_HASH, agora, agora);
  db.exec('CREATE INDEX IF NOT EXISTS ix_messages_unread ON messages (is_read, request_id)');
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_messages_client_id
             ON messages (request_id, author_external_id, client_message_id)
             WHERE client_message_id IS NOT NULL`);
  /* Feed de mudanças do Panel: consultas por faixa de tempo, sem varrer a tabela. */
  db.exec('CREATE INDEX IF NOT EXISTS ix_messages_created ON messages (created_at)');
  if (temTabela('project_requests')) {
    db.exec('CREATE INDEX IF NOT EXISTS ix_requests_panel_changed ON project_requests (panel_changed_at)');
    db.exec('CREATE INDEX IF NOT EXISTS ix_requests_updated ON project_requests (updated_at)');
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
