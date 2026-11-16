/* =========================================================================
   Preparação do ambiente em UM comando: cria as tabelas e o administrador.

     npm run setup

   Em desenvolvimento (SQLite), se ADMIN_EMAIL/ADMIN_INITIAL_PASSWORD não
   estiverem definidos, cria o administrador `Todai` com uma senha ALEATÓRIA,
   mostrada uma única vez no terminal. Não existe senha padrão conhecida. Se o
   administrador já existe e a senha não foi informada, nada é alterado.

   Em produção (PostgreSQL) isso NÃO acontece: sem as variáveis, o script para.
   Credencial padrão em servidor público é porta aberta.
   ========================================================================= */

import './env.mjs'; // precisa vir antes de config.js
import { ROLES, config } from '../server/config.js';
import { getDb, closeDb } from '../server/db/index.js';
import { createContext } from '../server/context.js';
import { hashPassword } from '../server/security/password.js';
import { normalizeEmail, passwordProblem } from '../server/http/validation.js';
import { randomBytes } from 'node:crypto';

const PADRAO_DEV = { email: 'Todai' };

/** Senha aleatória que cumpre a regra de força (letras + números). */
const gerarSenha = () => `${randomBytes(12).toString('base64url')}a1`;

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
  let senhaGerada = false;

  if (!email || !senha) {
    if (usandoPostgres) {
      throw new Error(
        'Em PostgreSQL é obrigatório definir ADMIN_EMAIL e ADMIN_INITIAL_PASSWORD.\n' +
          '  Nunca use credencial padrão num banco de produção.'
      );
    }
    email = normalizeEmail(config.admin.email || PADRAO_DEV.email);
    senha = config.admin.password ?? null; // sem senha: decide abaixo
    senhaGerada = !senha;
  }

  if (senha) {
    const problema = passwordProblem(senha);
    if (problema) throw new Error(`ADMIN_INITIAL_PASSWORD recusada: ${problema}`);
  }

  /* ------------------------------------------------------------- tabelas */
  const db = await getDb();
  await db.init();
  linha('  ✔ Tabelas criadas/verificadas');

  /* --------------------------------------------------------------- admin */
  const ctx = createContext(db);
  const existente = await ctx.users.findByEmailWithHash(email);

  if (existente && !config.admin.password) {
    /* Sem senha informada, jamais mexe na de quem já existe. */
    senha = null;
    senhaGerada = false;
    linha(`  ✔ Administrador "${email}" já existia — senha mantida`);
  } else if (existente) {
    await ctx.users.updatePasswordHash(existente.id, await hashPassword(senha));
    linha(`  ✔ Administrador "${email}" já existia — senha atualizada`);
  } else {
    if (!senha) senha = gerarSenha();
    const passwordHash = await hashPassword(senha);
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
  if (senhaGerada) {
    linha(`    Senha:   ${senha}`);
    linha('');
    linha('  ⚠ Esta senha foi gerada agora e NÃO será mostrada de novo. Guarde-a.');
    linha('  Depois de entrar, ative o 2FA em Segurança (painel do administrador).');
  } else if (senha) {
    linha('    Senha:   (a que você definiu)');
  } else {
    linha('    Senha:   (a de antes; este comando não a alterou)');
  }
  linha('');
}

main()
  .catch((error) => {
    console.error('\n  ✖ Falha na preparação:\n   ', error.message, '\n');
    process.exitCode = 1;
  })
  .finally(closeDb);
