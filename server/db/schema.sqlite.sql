-- ===========================================================================
-- Oliver Imports — schema SQLite (desenvolvimento e testes)
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
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_messages_request ON messages (request_id, created_at);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_sessions_user    ON sessions (user_id);
CREATE INDEX IF NOT EXISTS ix_sessions_expires ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_attempts_email ON login_attempts (email, created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action        TEXT    NOT NULL,
  resource_type TEXT,
  resource_id   TEXT,
  details       TEXT,
  created_at    INTEGER NOT NULL
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
