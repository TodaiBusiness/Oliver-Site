-- ===========================================================================
-- Oliver Imports — RESET do banco SQLite (desenvolvimento e testes)
-- ---------------------------------------------------------------------------
-- Cole este arquivo inteiro no cliente SQLite que você usa contra
-- `server/data/oliver.db` (ex.: `sqlite3 server/data/oliver.db` e depois
-- `.read server/db/reset.sqlite.sql`) e execute. Ele APAGA todos os dados
-- das 9 tabelas do site — não existe desfazer.
--
-- "DROP TABLE", e não "DROP * FROM": "DROP * FROM tabela" não é um comando
-- SQL válido em banco nenhum — "DROP" nunca leva FROM nem asterisco, é
-- sempre "DROP TABLE <nome>". A sintaxe abaixo é a real; o formato "um
-- comando por linha, com uma linha em branco entre eles" é o que foi
-- respeitado.
--
-- Ordem: o SQLite, ao contrário do Postgres, não impede apagar uma tabela
-- referenciada por outra que ainda existe — a checagem de chave estrangeira
-- vale para INSERT/UPDATE/DELETE, não para DROP TABLE. A ordem abaixo
-- (filho antes de pai) foi mantida mesmo assim, pelo mesmo motivo do
-- arquivo do Postgres: são o mesmo roteiro, e um script que só funciona
-- numa ordem específica no SQLite quebraria ao ser copiado para lá.
--
-- Depois de rodar isto o banco fica SEM TABELA NENHUMA. Para reconstruir
-- vazio: `npm run db:migrate` (aplica `schema.sqlite.sql`, que é todo
-- CREATE TABLE IF NOT EXISTS) e, se quiser um admin de novo,
-- `npm run db:seed-admin`.
-- ===========================================================================

DROP TABLE IF EXISTS attachments;

DROP TABLE IF EXISTS audit_logs;

DROP TABLE IF EXISTS site_visit_stats;

DROP TABLE IF EXISTS login_attempts;

DROP TABLE IF EXISTS client_projects;

DROP TABLE IF EXISTS sessions;

DROP TABLE IF EXISTS messages;

DROP TABLE IF EXISTS project_requests;

DROP TABLE IF EXISTS projects;

DROP TABLE IF EXISTS users;


-- ===========================================================================
-- RESET DO BANCO INTEIRO (não só das tabelas)
-- ---------------------------------------------------------------------------
-- SQLite não tem comando `DROP DATABASE` — "o banco" aqui É o arquivo
-- `server/data/oliver.db`, e não existe SQL nenhum que o apague; SQL roda
-- DENTRO de uma conexão já aberta com o arquivo. O equivalente real de
-- apagar o banco inteiro é apagar o arquivo, fora do SQL:
--
--   PowerShell:  Remove-Item server/data/oliver.db
--   Bash:        rm server/data/oliver.db
--
-- Isso é mais completo que os DROP TABLE de cima: leva junto qualquer coisa
-- que exista no arquivo além das 9 tabelas do site. Depois de apagar,
-- `npm run db:migrate` recria o arquivo do zero.
-- ===========================================================================


-- ===========================================================================
-- SELECT de cada tabela
-- ---------------------------------------------------------------------------
-- Rodar isto DEPOIS dos DROP acima, na mesma execução, dá erro em toda linha
-- — "no such table", porque as tabelas não existem mais nesse ponto. Este
-- bloco é para rodar SEPARADO: antes do reset, para ver o que tinha antes de
-- apagar, ou depois de `npm run db:migrate` recriar as tabelas, para
-- confirmar que voltaram vazias.
-- ===========================================================================

SELECT * FROM users;

SELECT * FROM projects;

SELECT * FROM client_projects;

SELECT * FROM project_requests;

SELECT * FROM messages;

SELECT * FROM sessions;

SELECT * FROM login_attempts;

SELECT * FROM audit_logs;

SELECT * FROM attachments;
