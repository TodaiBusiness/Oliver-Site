/* =========================================================================
   Preparação do ambiente em UM comando: cria as tabelas e o administrador.

     npm run setup

   Em desenvolvimento (SQLite), se ADMIN_EMAIL/ADMIN_INITIAL_PASSWORD não
   estiverem definidos, usa credenciais padrão para você já entrar no painel —
   e avisa em letras garrafais para trocar.

   Em produção (PostgreSQL) isso NÃO acontece: sem as variáveis, o script para.
   Credencial padrão em servidor público é porta aberta.
   ========================================================================= */

import './env.mjs'; // precisa vir antes de config.js
import { ROLES, config } from '../server/config.js';
import { getDb, closeDb } from '../server/db/index.js';
import { createContext } from '../server/context.js';
import { hashPassword } from '../server/security/password.js';
import { normalizeEmail } from '../server/http/validation.js';

const PADRAO_DEV = {
  email: 'Oliverimports',
  senha: 'OliverAdmin2026',
};

const linha = (texto = '') => console.log(texto);

async function main() {
  const usandoPostgres = config.driver === 'postgres';

  linha('');
  linha('  TODAI — preparando o ambiente');
  linha('  ─────────────────────────────────────────');
  linha(`  Banco: ${usandoPostgres ? 'PostgreSQL (Neon)' : 'SQLite (desenvolvimento)'}`);

  /* ---------------------------------------------------------- credenciais */
  let email = normalizeEmail(config.admin.email);
  let senha = config.admin.password;
  let usandoPadrao = false;

  if (!email || !senha) {
    if (usandoPostgres) {
      throw new Error(
        'Em PostgreSQL é obrigatório definir ADMIN_EMAIL e ADMIN_INITIAL_PASSWORD.\n' +
          '  Nunca use credencial padrão num banco de produção.'
      );
    }
    email = normalizeEmail(PADRAO_DEV.email);
    senha = PADRAO_DEV.senha;
    usandoPadrao = true;
  }

  if (senha.length < 10) {
    throw new Error('ADMIN_INITIAL_PASSWORD precisa ter ao menos 10 caracteres.');
  }

  /* ------------------------------------------------------------- tabelas */
  const db = await getDb();
  await db.init();
  linha('  ✔ Tabelas criadas/verificadas');

  /* --------------------------------------------------------------- admin */
  const ctx = createContext(db);
  const passwordHash = await hashPassword(senha);
  const existente = await ctx.users.findByEmailWithHash(email);

  if (existente) {
    await ctx.users.updatePasswordHash(existente.id, passwordHash);
    linha(`  ✔ Administrador "${email}" já existia — senha atualizada`);
  } else {
    await ctx.users.create({
      name: 'Administrador',
      company: 'TODAI',
      email,
      phone: null,
      passwordHash,
      role: ROLES.ADMIN,
    });
    linha(`  ✔ Administrador criado: ${email}`);
  }

  /* -------------------------------------------------------------- resumo */
  const clientes = await ctx.users.countClients();
  const projetos = await ctx.projects.countAll();
  const solicitacoes = await ctx.requests.countAll();

  linha('');
  linha('  Situação do banco');
  linha(`    Clientes: ${clientes} · Projetos: ${projetos} · Solicitações: ${solicitacoes}`);
  linha('');
  linha('  Pronto. Rode `npm run dev` e acesse http://localhost:5173/login');
  linha('');
  linha(`    Usuário: ${email}`);
  linha(`    Senha:   ${usandoPadrao ? PADRAO_DEV.senha : '(a que você definiu)'}`);
  linha('');

  if (usandoPadrao) {
    linha('  ⚠ ATENÇÃO ─────────────────────────────────────────────');
    linha('  Esta é uma senha PADRÃO, só para desenvolvimento local.');
    linha('  Antes de publicar, rode de novo com a sua senha:');
    linha('');
    linha('    $env:ADMIN_EMAIL="Oliverimports"');
    linha('    $env:ADMIN_INITIAL_PASSWORD="sua-senha-forte"');
    linha('    npm run setup');
    linha('  ───────────────────────────────────────────────────────');
    linha('');
  }
}

main()
  .catch((error) => {
    console.error('\n  ✖ Falha na preparação:\n   ', error.message, '\n');
    process.exitCode = 1;
  })
  .finally(closeDb);
