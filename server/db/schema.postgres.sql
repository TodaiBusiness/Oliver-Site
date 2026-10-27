-- ===========================================================================
-- Oliver Imports — schema PostgreSQL 14+ (Neon)
-- ---------------------------------------------------------------------------
-- Convenções (as mesmas do SQLite, para o SQL dos repositórios não mudar):
--  · Datas em BIGINT (epoch em milissegundos). Sem fuso horário, sem conversão
--    implícita, e o mesmo SQL vale para os dois bancos.
--  · Sinalizadores (featured, is_public, is_read, is_mockup) ficam em SMALLINT
--    0/1, e não em BOOLEAN: os repositórios comparam com `= 1` e `= 0`, o que o
--    Postgres recusaria contra uma coluna booleana.
--  · Toda chave estrangeira é declarada, com ON DELETE explícito.
--  · Índices criados para os filtros realmente usados (evita varredura).
--
-- Este arquivo é aplicado por `npm run db:migrate` e pode ser colado no SQL
-- Editor do Neon: tudo é IF NOT EXISTS, então rodar de novo não apaga nada.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL     NOT NULL,
  name          VARCHAR(120)  NOT NULL,
  company       VARCHAR(120)  NULL,
  email         VARCHAR(190)  NOT NULL,
  phone         VARCHAR(30)   NULL,
  password_hash VARCHAR(255)  NOT NULL,
  role          VARCHAR(10)   NOT NULL DEFAULT 'CLIENT',
  created_at    BIGINT        NOT NULL,
  updated_at    BIGINT        NOT NULL,
  CONSTRAINT pk_users        PRIMARY KEY (id),
  CONSTRAINT uq_users_email  UNIQUE (email),
  CONSTRAINT ck_users_role   CHECK (role IN ('CLIENT','ADMIN'))
);

CREATE TABLE IF NOT EXISTS projects (
  id           BIGSERIAL     NOT NULL,
  title        VARCHAR(160)  NOT NULL,
  slug         VARCHAR(160)  NOT NULL,
  tagline      VARCHAR(255)  NULL,
  description  TEXT          NULL,
  problem      TEXT          NULL,
  solution     TEXT          NULL,
  features     TEXT          NULL,  -- JSON serializado
  technologies TEXT          NULL,  -- JSON serializado
  category     VARCHAR(80)   NULL,
  image        VARCHAR(500)  NULL,
  link         VARCHAR(500)  NULL,
  status       VARCHAR(40)   NOT NULL DEFAULT 'RASCUNHO',
  featured     SMALLINT      NOT NULL DEFAULT 0,
  is_mockup    SMALLINT      NOT NULL DEFAULT 1,
  is_public    SMALLINT      NOT NULL DEFAULT 1,
  created_at   BIGINT        NOT NULL,
  updated_at   BIGINT        NOT NULL,
  CONSTRAINT pk_projects          PRIMARY KEY (id),
  CONSTRAINT uq_projects_slug     UNIQUE (slug),
  CONSTRAINT ck_projects_featured CHECK (featured  IN (0,1)),
  CONSTRAINT ck_projects_mockup   CHECK (is_mockup IN (0,1)),
  CONSTRAINT ck_projects_public   CHECK (is_public IN (0,1))
);

CREATE INDEX IF NOT EXISTS ix_projects_public ON projects (is_public, featured);

-- Vínculo cliente ↔ projeto (um projeto pode atender mais de um contato).
CREATE TABLE IF NOT EXISTS client_projects (
  user_id    BIGINT NOT NULL,
  project_id BIGINT NOT NULL,
  created_at BIGINT NOT NULL,
  CONSTRAINT pk_client_projects PRIMARY KEY (user_id, project_id),
  CONSTRAINT fk_cp_user    FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  CONSTRAINT fk_cp_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_client_projects_project ON client_projects (project_id);

CREATE TABLE IF NOT EXISTS project_requests (
  id          BIGSERIAL    NOT NULL,
  user_id     BIGINT       NOT NULL,
  type        VARCHAR(60)  NOT NULL,
  description TEXT         NOT NULL,
  budget      VARCHAR(60)  NULL,
  deadline    VARCHAR(60)  NULL,
  status      VARCHAR(40)  NOT NULL DEFAULT 'NOVO',
  created_at  BIGINT       NOT NULL,
  updated_at  BIGINT       NOT NULL,
  CONSTRAINT pk_project_requests PRIMARY KEY (id),
  CONSTRAINT fk_requests_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_requests_user   ON project_requests (user_id, created_at);
CREATE INDEX IF NOT EXISTS ix_requests_status ON project_requests (status, created_at);

CREATE TABLE IF NOT EXISTS messages (
  id         BIGSERIAL NOT NULL,
  request_id BIGINT    NOT NULL,
  author_id  BIGINT    NOT NULL,
  body       TEXT      NOT NULL,
  is_read    SMALLINT  NOT NULL DEFAULT 0,
  created_at BIGINT    NOT NULL,
  CONSTRAINT pk_messages PRIMARY KEY (id),
  CONSTRAINT ck_messages_read CHECK (is_read IN (0,1)),
  CONSTRAINT fk_messages_request FOREIGN KEY (request_id) REFERENCES project_requests(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_author  FOREIGN KEY (author_id)  REFERENCES users(id)            ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_messages_request ON messages (request_id, created_at);

-- `id` guarda o HASH do token de sessão, nunca o token cru.
-- VARCHAR e não CHAR: no Postgres o CHAR completa com espaços à direita.
CREATE TABLE IF NOT EXISTS sessions (
  id         VARCHAR(64) NOT NULL,
  user_id    BIGINT      NOT NULL,
  expires_at BIGINT      NOT NULL,
  created_at BIGINT      NOT NULL,
  CONSTRAINT pk_sessions PRIMARY KEY (id),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_sessions_user    ON sessions (user_id);
CREATE INDEX IF NOT EXISTS ix_sessions_expires ON sessions (expires_at);

-- Controle de força bruta no login.
CREATE TABLE IF NOT EXISTS login_attempts (
  id         BIGSERIAL    NOT NULL,
  email      VARCHAR(190) NOT NULL,
  created_at BIGINT       NOT NULL,
  CONSTRAINT pk_login_attempts PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS ix_attempts_email ON login_attempts (email, created_at);

-- Trilha de auditoria. NUNCA guarda senha nem token.
CREATE TABLE IF NOT EXISTS audit_logs (
  id            BIGSERIAL   NOT NULL,
  user_id       BIGINT      NULL,
  action        VARCHAR(60) NOT NULL,
  resource_type VARCHAR(40) NULL,
  resource_id   VARCHAR(60) NULL,
  details       TEXT        NULL,
  created_at    BIGINT      NOT NULL,
  CONSTRAINT pk_audit_logs PRIMARY KEY (id),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ix_audit_user   ON audit_logs (user_id, created_at);
CREATE INDEX IF NOT EXISTS ix_audit_action ON audit_logs (action, created_at);

-- Imagens enviadas no chat. Ficam no banco para o projeto rodar sem disco
-- (serverless) e sem depender de storage externo. `mime` guarda o tipo REAL
-- detectado pelos bytes, nunca o declarado pelo navegador.
CREATE TABLE IF NOT EXISTS attachments (
  id         BIGSERIAL    NOT NULL,
  message_id BIGINT       NOT NULL,
  filename   VARCHAR(120) NOT NULL,
  mime       VARCHAR(40)  NOT NULL,
  size       INTEGER      NOT NULL,
  content    BYTEA        NOT NULL,
  created_at BIGINT       NOT NULL,
  CONSTRAINT pk_attachments PRIMARY KEY (id),
  CONSTRAINT ck_attachments_size CHECK (size >= 0),
  CONSTRAINT fk_attachments_message FOREIGN KEY (message_id)
    REFERENCES messages(id) ON DELETE CASCADE
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
