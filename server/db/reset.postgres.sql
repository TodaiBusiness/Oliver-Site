-- ===========================================================================
-- Oliver Imports — RESET do banco PostgreSQL (Neon)
-- ---------------------------------------------------------------------------
-- Cole este arquivo inteiro no SQL Editor do Neon e execute. Ele APAGA todos
-- os dados das 9 tabelas do site — não existe desfazer.
--
-- "DROP TABLE", e não "DROP * FROM": "DROP * FROM tabela" não é um comando
-- SQL válido em nenhum banco — "DROP" nunca leva FROM nem asterisco, é
-- sempre "DROP TABLE <nome>". A sintaxe abaixo é a real; o formato "um
-- comando por linha, com uma linha em branco entre eles" é o que foi
-- respeitado.
--
-- ORDEM IMPORTA no Postgres: uma tabela referenciada por chave estrangeira
-- de outra tabela que ainda existe não pode ser apagada (erro "cannot drop
-- table ... because other objects depend on it"). A ordem abaixo é filho
-- antes de pai — cada tabela desce antes de qualquer outra que dependa dela.
-- O CASCADE é redundância proposital: garante que a ordem errada também
-- funcione, sem trocar o que cada linha apaga.
--
-- Depois de rodar isto o banco fica SEM TABELA NENHUMA. Para reconstruir
-- vazio: `npm run db:migrate` (aplica `schema.postgres.sql`, que é todo
-- CREATE TABLE IF NOT EXISTS) e, se quiser um admin de novo,
-- `npm run db:seed-admin`.
-- ===========================================================================

DROP TABLE IF EXISTS attachments CASCADE;

DROP TABLE IF EXISTS audit_logs CASCADE;

DROP TABLE IF EXISTS site_visit_stats CASCADE;

DROP TABLE IF EXISTS login_attempts CASCADE;

DROP TABLE IF EXISTS client_projects CASCADE;

DROP TABLE IF EXISTS sessions CASCADE;

DROP TABLE IF EXISTS messages CASCADE;

DROP TABLE IF EXISTS project_requests CASCADE;

DROP TABLE IF EXISTS projects CASCADE;

DROP TABLE IF EXISTS users CASCADE;


-- ===========================================================================
-- RESET DO BANCO INTEIRO (não só das tabelas)
-- ---------------------------------------------------------------------------
-- Um `DROP DATABASE oliver_site;` de verdade não roda aqui: o Postgres
-- recusa apagar o banco ao qual a própria sessão está conectada, e o SQL
-- Editor do Neon sempre está conectado ao banco selecionado — não tem como
-- rodar esse comando de dentro dele. Precisaria de outra conexão (psql
-- ligado no banco `postgres`, por exemplo), e o Neon gerencia o banco por
-- branch, então normalmente não se apaga o banco desse jeito lá.
--
-- O equivalente que FUNCIONA de dentro do SQL Editor, e que zera tudo —
-- tabelas, sequências, índices, tudo que estiver no schema `public`, não só
-- as 9 tabelas listadas acima — é apagar e recriar o schema:
--
-- DROP SCHEMA IF EXISTS public CASCADE;
--
-- CREATE SCHEMA public;
--
-- Deixado comentado de propósito: é mais destrutivo que os DROP TABLE de
-- cima (leva junto qualquer coisa que exista no schema, mesmo fora das 9
-- tabelas do site) e mais raro de precisar. Descomente as duas linhas só se
-- for isso mesmo que quer.
-- ===========================================================================


-- ===========================================================================
-- SELECT de cada tabela
-- ---------------------------------------------------------------------------
-- Rodar isto DEPOIS dos DROP acima, na mesma execução, dá erro em toda linha
-- — "relation ... does not exist", porque as tabelas não existem mais nesse
-- ponto. Este bloco é para rodar SEPARADO: antes do reset, para ver o que
-- tinha antes de apagar, ou depois de `npm run db:migrate` recriar as
-- tabelas, para confirmar que voltaram vazias.
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
