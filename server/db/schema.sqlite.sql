-- ===========================================================================
-- TODAI — schema SQLite (desenvolvimento e testes)
-- ---------------------------------------------------------------------------
-- Mesmos nomes de tabela e coluna do PostgreSQL, para o SQL dos repositórios
-- ser exatamente o mesmo nos dois bancos. As diferenças ficam só aqui.
-- ===========================================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  company       TEXT,
  email         TEXT    NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'CLIENT'
                        CHECK (role IN ('CLIENT','ADMIN')),
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT    NOT NULL,
  slug         TEXT    NOT NULL UNIQUE,
  tagline      TEXT,
  description  TEXT,
  problem      TEXT,
  solution     TEXT,
  features     TEXT,
  technologies TEXT,
  category     TEXT,
  image        TEXT,
  link         TEXT,
  status       TEXT    NOT NULL DEFAULT 'RASCUNHO',
  featured     INTEGER NOT NULL DEFAULT 0,
  is_mockup    INTEGER NOT NULL DEFAULT 1,
  is_public    INTEGER NOT NULL DEFAULT 1,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_projects_public ON projects (is_public, featured);

CREATE TABLE IF NOT EXISTS client_projects (
  user_id    INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, project_id)
);

CREATE INDEX IF NOT EXISTS ix_client_projects_project ON client_projects (project_id);

CREATE TABLE IF NOT EXISTS project_requests (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL,
  description TEXT    NOT NULL,
  budget      TEXT,
  deadline    TEXT,
  status      TEXT    NOT NULL DEFAULT 'NOVO',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_requests_user   ON project_requests (user_id, created_at);
CREATE INDEX IF NOT EXISTS ix_requests_status ON project_requests (status, created_at);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER NOT NULL REFERENCES project_requests(id) ON DELETE CASCADE,
  author_id  INTEGER NOT NULL REFERENCES users(id)            ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  author_external_id   TEXT,     -- guid do administrador no Panel (resposta vinda de lá)
  author_external_name TEXT,     -- nome mostrado ao cliente: "<nome> · TODAI"
  client_message_id    TEXT      -- id de idempotência enviado pelo Panel
);

CREATE INDEX IF NOT EXISTS ix_messages_request ON messages (request_id, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT    PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER,          -- inatividade; NULL = nunca usada depois do login
  ip           TEXT,
  user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS ix_sessions_user    ON sessions (user_id);
CREATE INDEX IF NOT EXISTS ix_sessions_expires ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  ip         TEXT                -- bloqueio por (e-mail + IP)
);

CREATE INDEX IF NOT EXISTS ix_attempts_email ON login_attempts (email, created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT    NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  details       TEXT,
  created_at    INTEGER NOT NULL,
  ip            TEXT,
  user_agent    TEXT
);

CREATE INDEX IF NOT EXISTS ix_audit_user   ON audit_logs (user_id, created_at);
CREATE INDEX IF NOT EXISTS ix_audit_action ON audit_logs (action, created_at);

CREATE TABLE IF NOT EXISTS attachments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  filename   TEXT    NOT NULL,
  mime       TEXT    NOT NULL,
  size       INTEGER NOT NULL,
  content    BLOB    NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_attachments_message ON attachments (message_id);

-- Visitas do site, agregadas por dia e por recorte (país, cidade, origem,
-- campanha, aparelho, página). Sem IP e sem identificador de pessoa.
CREATE TABLE IF NOT EXISTS site_visit_stats (
  stat_day TEXT    NOT NULL,
  dim      TEXT    NOT NULL,
  label    TEXT    NOT NULL,
  visits   INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (stat_day, dim, label)
);

-- Cotas por usuário (contagem de mensagens por autor e janela de tempo).
CREATE INDEX IF NOT EXISTS ix_messages_author ON messages (author_id, created_at);

-- Segundo fator (TOTP) dos administradores. O segredo fica CIFRADO
-- (AES-256-GCM, chave derivada de SESSION_SECRET). `last_step` é o último
-- passo de 30 s aceito: impede reaproveitar o mesmo código (replay).
CREATE TABLE IF NOT EXISTS user_totp (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_enc TEXT    NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 0,
  last_step  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  enabled_at INTEGER
);

-- Códigos de recuperação: só o HMAC fica no banco; cada um vale uma vez.
CREATE TABLE IF NOT EXISTS recovery_codes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  TEXT    NOT NULL,
  used_at    INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_recovery_user ON recovery_codes (user_id, code_hash);

-- Desafio do login em dois passos: criado depois da senha correta, vale uma
-- vez só e por pouco tempo. Só o hash do token fica aqui.
CREATE TABLE IF NOT EXISTS login_challenges (
  id         TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_challenges_user ON login_challenges (user_id);

-- Recuperação de senha por e-mail: só o SHA-256 do token fica aqui; vale uma
-- vez e por pouco tempo.
CREATE TABLE IF NOT EXISTS password_resets (
  id         TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_resets_user ON password_resets (user_id);

-- Modelos de resposta rápida da equipe (Panel): compartilhados, texto puro.
CREATE TABLE IF NOT EXISTS reply_templates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT    NOT NULL,
  body            TEXT    NOT NULL,
  updated_at      INTEGER NOT NULL,
  updated_by_name TEXT    NOT NULL
);

-- ===========================================================================
-- Portal de pedidos da loja (/l/:slug). Contas, sessões e recuperações do
-- PORTAL são tabelas próprias e todas carregam a loja (store_slug): a conta de
-- uma loja não existe em outra, e nada daqui se mistura com `users`/`sessions`
-- (clientes e admin do site). O que é da loja (preço, pedido, aprovação) fica
-- na API; aqui só ficam identidade e senha.
-- ===========================================================================
CREATE TABLE IF NOT EXISTS portal_accounts (
  id            TEXT    PRIMARY KEY,
  store_slug    TEXT    NOT NULL,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL,
  phone         TEXT    NOT NULL,
  document      TEXT,
  business_name TEXT,
  address       TEXT    NOT NULL DEFAULT '{}',
  password_hash TEXT    NOT NULL,
  consent_at    INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE (store_slug, email)
);

CREATE TABLE IF NOT EXISTS portal_sessions (
  id           TEXT    PRIMARY KEY,
  store_slug   TEXT    NOT NULL,
  account_id   TEXT    NOT NULL REFERENCES portal_accounts(id) ON DELETE CASCADE,
  expires_at   INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  ip           TEXT,
  user_agent   TEXT
);

CREATE INDEX IF NOT EXISTS ix_portal_sessions_account ON portal_sessions (account_id);
CREATE INDEX IF NOT EXISTS ix_portal_sessions_expires ON portal_sessions (expires_at);

CREATE TABLE IF NOT EXISTS portal_resets (
  id         TEXT    PRIMARY KEY,
  store_slug TEXT    NOT NULL,
  account_id TEXT    NOT NULL REFERENCES portal_accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_portal_resets_account ON portal_resets (account_id);
