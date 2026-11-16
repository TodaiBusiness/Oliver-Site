/* =========================================================================
   Desativa o 2FA de um administrador (emergência: perdeu o aparelho E os
   códigos de recuperação, ou o SESSION_SECRET mudou).

     node scripts/admin-2fa-reset.mjs admin@exemplo.com

   Exige acesso ao banco (DATABASE_URL / SQLITE_FILE), ou seja, a quem já
   controla o servidor. Apaga o segredo, os códigos de recuperação e todas as
   sessões da conta; o próximo login volta a pedir só e-mail e senha, e o 2FA
   pode ser configurado de novo em Segurança.
   ========================================================================= */

import './env.mjs'; // precisa vir antes de config.js
import { AUDIT_ACTIONS } from '../server/config.js';
import { getDb, closeDb } from '../server/db/index.js';
import { createContext } from '../server/context.js';
import { normalizeEmail } from '../server/http/validation.js';

async function main() {
  const email = normalizeEmail(process.argv[2]);
  if (!email) throw new Error('Uso: node scripts/admin-2fa-reset.mjs <e-mail do administrador>');

  const db = await getDb();
  await db.init();
  const ctx = createContext(db);

  const account = await ctx.users.findByEmailWithHash(email);
  if (!account || account.role !== 'ADMIN') throw new Error('Administrador não encontrado.');

  await ctx.twoFactor.remove(account.id);
  const sessoes = await ctx.sessions.deleteAllForUser(account.id);
  await ctx.audit.log({
    userId: account.id,
    action: AUDIT_ACTIONS.TWO_FACTOR_DISABLED,
    resourceType: 'auth',
    details: { origem: 'script_admin_2fa_reset' },
    ip: 'script',
  });

  console.log(`✔ 2FA de "${email}" desativado; ${sessoes} sessão(ões) encerrada(s).`);
}

main()
  .catch((error) => {
    console.error('\n✖ Falha:', error.message);
    process.exitCode = 1;
  })
  .finally(closeDb);
