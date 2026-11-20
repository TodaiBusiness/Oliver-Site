/* =========================================================================
   Migração do esquema ao subir o servidor (server.js).

   É o mesmo db.init() do `npm run db:migrate`: só CREATE/ALTER ... IF NOT
   EXISTS, então rodar de novo não muda nada. Falha (ou demora demais) NÃO
   derruba o servidor: fica no log, e o /api/health acusa o que faltar.
   ========================================================================= */

export const STARTUP_MIGRATION_TIMEOUT_MS = 60_000;

/** `DB_MIGRATE_ON_START=false` desliga; qualquer outro valor (ou nenhum) liga. */
export function migrateOnStartEnabled(env = process.env) {
  return env.DB_MIGRATE_ON_START?.trim().toLowerCase() !== 'false';
}

/**
 * Devolve `{ applied: true }`, `{ applied: false, skipped: true }` ou
 * `{ applied: false, error }`. Nunca lança.
 */
export async function applySchemaOnStart(
  db,
  { env = process.env, timeoutMs = STARTUP_MIGRATION_TIMEOUT_MS, log = console.log, logError = console.error } = {}
) {
  if (!migrateOnStartEnabled(env)) {
    log('DB_MIGRATE_ON_START=false: o esquema do banco não foi conferido ao subir.');
    return { applied: false, skipped: true };
  }

  /* Teto de tempo: uma tabela presa por outra conexão não pode impedir o site de abrir a porta. */
  let teto;
  try {
    await Promise.race([
      db.init(),
      new Promise((_, rejeitar) => {
        teto = setTimeout(() => rejeitar(new Error(`passou de ${timeoutMs / 1000} s`)), timeoutMs);
      }),
    ]);
    log('Esquema do banco conferido e atualizado (db.init).');
    return { applied: true };
  } catch (error) {
    logError(
      '✖ Falha ao atualizar o esquema do banco ao subir. O site segue no ar, mas o /api/health vai acusar o que faltar:',
      error?.message ?? error
    );
    return { applied: false, error };
  } finally {
    clearTimeout(teto);
  }
}
