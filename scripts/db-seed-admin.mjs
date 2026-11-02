/* =========================================================================
   Cria (ou atualiza a senha) do administrador inicial.

   As credenciais vêm SÓ de variável de ambiente — nunca do código:
     ADMIN_EMAIL=...
     ADMIN_INITIAL_PASSWORD=...

   Uso:
     npm run db:seed-admin

   A senha é convertida em hash (scrypt) antes de tocar no banco. Em nenhum
   momento ela é gravada ou registrada em texto puro.
   ========================================================================= */

import './env.mjs'; // precisa vir antes de config.js
import { ROLES, config } from '../server/config.js';
import { getDb, closeDb } from '../server/db/index.js';
import { createContext } from '../server/context.js';
import { hashPassword } from '../server/security/password.js';
import { normalizeEmail } from '../server/http/validation.js';

const IS_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function main() {
  const identifier = normalizeEmail(config.admin.email);
  const password = config.admin.password;

  if (!identifier || !password) {
    throw new Error(
      'Defina ADMIN_EMAIL e ADMIN_INITIAL_PASSWORD no ambiente antes de rodar.\n' +
        '  Exemplo (PowerShell):\n' +
        '    $env:ADMIN_EMAIL="admin@todai.com.br"\n' +
        '    $env:ADMIN_INITIAL_PASSWORD="uma-senha-forte"\n' +
        '    npm run db:seed-admin'
    );
  }

  if (password.length < 10) {
    throw new Error('ADMIN_INITIAL_PASSWORD precisa ter ao menos 10 caracteres.');
  }

  if (!IS_EMAIL.test(identifier)) {
    console.warn(
      `⚠ "${identifier}" não tem formato de e-mail.\n` +
        '  O login funciona assim mesmo (é comparação de texto), mas o ideal é\n' +
        '  usar um e-mail real para recuperação de conta no futuro.\n'
    );
  }

  const db = await getDb();
  await db.init();

  const ctx = createContext(db);
  const passwordHash = await hashPassword(password);
  const existing = await ctx.users.findByEmailWithHash(identifier);

  if (existing) {
    await ctx.users.updatePasswordHash(existing.id, passwordHash);
    console.log(`✔ Senha do administrador "${identifier}" atualizada.`);
  } else {
    const id = await ctx.users.create({
      name: 'Administrador',
      company: 'Oliver Imports',
      email: identifier,
      phone: null,
      passwordHash,
      role: ROLES.ADMIN,
    });
    console.log(`✔ Administrador criado (id ${id}): ${identifier}`);
  }

  console.log('\n⚠ Troque esta senha após o primeiro acesso.');
  console.log('  Rode este mesmo comando com outra ADMIN_INITIAL_PASSWORD.');
}

main()
  .catch((error) => {
    console.error('\n✖ Falha ao criar o administrador:\n', error.message);
    process.exitCode = 1;
  })
  .finally(closeDb);
