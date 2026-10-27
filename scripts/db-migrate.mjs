/* =========================================================================
   Cria/atualiza as tabelas no banco configurado.

   Uso:
     npm run db:migrate                 (SQLite local, padrão)
     DATABASE_DRIVER=postgres npm run db:migrate    (Neon — precisa de DATABASE_URL)

   Todas as instruções são CREATE TABLE IF NOT EXISTS — rodar de novo é
   seguro e não apaga dado nenhum.
   ========================================================================= */

import './env.mjs'; // precisa vir antes de config.js
import { config } from '../server/config.js';
import { getDb, closeDb } from '../server/db/index.js';

async function main() {
  console.log(`Banco: ${config.driver}`);

  if (config.driver === 'postgres') {
    if (!config.postgres.url) {
      throw new Error(
        'Falta DATABASE_URL (a URI do Neon). Configure o .env (ver .env.example).'
      );
    }

    /* Só host e nome do banco no log — a URI carrega a senha. */
    const { host, pathname } = new URL(config.postgres.url);
    console.log(`Conectando em ${host}${pathname}`);
  } else {
    console.log(`Arquivo: ${config.sqliteFile}`);
  }

  const db = await getDb();
  await db.init();

  const tables = [
    'users',
    'projects',
    'client_projects',
    'project_requests',
    'messages',
    'sessions',
    'login_attempts',
    'audit_logs',
    'attachments',
    'site_visit_stats',
  ];

  for (const table of tables) {
    const row = await db.queryOne(`SELECT COUNT(*) AS total FROM ${table}`);
    console.log(`  ✔ ${table.padEnd(18)} (${row.total} registros)`);
  }

  console.log('\nMigrations aplicadas com sucesso.');
}

main()
  .catch((error) => {
    console.error('\n✖ Falha na migration:', error.message);
    process.exitCode = 1;
  })
  .finally(closeDb);
