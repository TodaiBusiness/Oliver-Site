/* =========================================================================
   Autenticação: cadastro, login (com segundo fator para ADMIN), logout e
   leitura da sessão.

   Decisões de segurança tomadas aqui:
   · A resposta de login é IGUAL para e-mail inexistente e senha errada —
     senão a tela vira um verificador de quem tem conta (user enumeration).
   · Mesmo quando o e-mail não existe, uma verificação de senha falsa é
     executada, para o tempo de resposta não denunciar a diferença.
   · O papel do usuário NUNCA vem do cliente: cadastro sempre cria CLIENT.
   · O token de sessão só existe no cookie; no banco fica o hash dele.
   · Login em dois passos: a senha certa NÃO cria sessão quando há 2FA; cria um
     desafio de uso único e curto, e só o código (TOTP ou de recuperação) o
     transforma em sessão. Falhas dos dois passos dividem o mesmo bloqueio.
   · Sessão expira por inatividade (cliente 30 min, admin 15 min) além das 8 h
     absolutas.
   ========================================================================= */

import { AUDIT_ACTIONS, LIMITS, ROLES, SECURITY } from '../config.js';
import { hashPassword, isLoginDisabled, needsRehash, verifyPassword } from '../security/password.js';
import { createSessionToken, hashToken } from '../security/tokens.js';
import { AppError, conflict, unauthorized } from '../http/errors.js';
import { clipUserAgent } from '../http/userAgent.js';
import {
  cleanText,
  createValidator,
  normalizeEmail,
} from '../http/validation.js';
import { createLoginGuard } from './loginGuard.js';
import { verifySecondFactor } from './twoFactor.js';

/* Hash descartável usado para gastar tempo quando o e-mail não existe. */
const DUMMY_HASH =
  'scrypt$32768$8$1$YWFhYWFhYWFhYWFhYWFhYQ==$' +
  'ZmFrZWhhc2hmYWtlaGFzaGZha2VoYXNoZmFrZWhhc2hmYWtlaGFzaGZha2VoYXNoZmFrZQ==';

const NO_IP = 'desconhecido';

const isUniqueViolation = (error) =>
  error?.code === '23505' || /UNIQUE constraint failed/i.test(String(error?.message ?? ''));

export function authService(ctx, { now = () => Date.now(), adminEnabled = true } = {}) {
  const guard = createLoginGuard(ctx, { now });

  /** Referência opaca do e-mail digitado (HMAC): permite correlacionar sem guardar o texto. */
  const emailRef = (email) => (ctx.vault.available ? ctx.vault.mac('email-ref', email).slice(0, 16) : null);

  const adminDisabled = () =>
    new AppError(
      403,
      'ADMIN_DESATIVADO',
      'O acesso de administradores agora é pelo Panel TODAI. A administração do site foi desativada.'
    );

  async function startSession(user, { ip, userAgent }) {
    if (user.role === ROLES.ADMIN && !adminEnabled) throw adminDisabled();
    const token = createSessionToken();
    const expiresAt = now() + SECURITY.SESSION_TTL_MS;

    await ctx.sessions.create({
      id: hashToken(token),
      userId: user.id,
      expiresAt,
      ip: ip ?? null,
      userAgent: clipUserAgent(userAgent),
    });

    await ctx.audit.log({
      userId: user.id,
      action: AUDIT_ACTIONS.LOGIN,
      resourceType: 'auth',
      ip,
      userAgent,
    });

    return { user: await publicUser(user.id), token, expiresAt };
  }

  async function publicUser(id) {
    const user = await ctx.users.findById(id);
    const totp = await ctx.twoFactor.get(id);
    return { ...user, twoFactorEnabled: Boolean(totp?.enabled) };
  }

  return {
    /** Cria uma conta de CLIENTE. */
    async register(input) {
      const validator = createValidator();
      validator.text('name', input.name, { max: LIMITS.NAME_MAX, label: 'o nome' });
      validator.optionalText('company', input.company, {
        max: LIMITS.COMPANY_MAX,
        label: 'a empresa',
      });
      validator.email('email', input.email);
      validator.optionalText('phone', input.phone, {
        max: LIMITS.PHONE_MAX,
        label: 'o telefone',
      });
      validator.password('password', input.password);
      validator.assert();

      const email = normalizeEmail(input.email);

      /* O hash vem ANTES de olhar se o e-mail existe: cadastro novo e cadastro
         repetido gastam o mesmo scrypt, e o tempo não separa os dois casos. */
      const passwordHash = await hashPassword(input.password);

      if (await ctx.users.existsByEmail(email)) {
        throw conflict('Já existe uma conta com este e-mail.');
      }

      let userId;
      try {
        userId = await ctx.users.create({
          name: cleanText(input.name),
          company: cleanText(input.company),
          email,
          phone: cleanText(input.phone),
          passwordHash,
          role: ROLES.CLIENT, // sempre CLIENT: papel não vem da requisição
        });
      } catch (error) {
        /* Dois cadastros simultâneos do mesmo e-mail: o UNIQUE decide. */
        if (isUniqueViolation(error)) throw conflict('Já existe uma conta com este e-mail.');
        throw error;
      }

      await ctx.audit.log({
        userId,
        action: AUDIT_ACTIONS.USER_REGISTERED,
        resourceType: 'user',
        resourceId: userId,
      });

      return ctx.users.findById(userId);
    },

    /**
     * Primeiro passo. Devolve `{ user, token, expiresAt }` (sessão criada) ou,
     * para conta com 2FA, `{ twoFactorRequired: true, challenge, expiresAt }`.
     */
    async login(input, { ip = NO_IP, userAgent = null } = {}) {
      const email = normalizeEmail(input.email);
      const password = typeof input.password === 'string' ? input.password : '';

      if (!email || !password) {
        throw unauthorized('E-mail ou senha incorretos.');
      }

      await guard.assertNotLocked(email, ip);

      const account = await ctx.users.findByEmailWithHash(email);

      /* Sem conta: ainda assim gasta o tempo de um hash, para não dar pista. */
      const passwordOk = account
        ? await verifyPassword(password, account.password_hash)
        : await verifyPassword(password, DUMMY_HASH);

      /* Conta de sistema (sem senha utilizável) nunca entra, nem por acidente. */
      if (account && isLoginDisabled(account.password_hash)) {
        await guard.registerFailure(email, ip);
        throw unauthorized('E-mail ou senha incorretos.');
      }

      if (!account || !passwordOk) {
        await guard.registerFailure(email, ip);
        await ctx.audit.log({
          userId: account?.id ?? null,
          action: AUDIT_ACTIONS.LOGIN_FAILED,
          resourceType: 'auth',
          details: { motivo: account ? 'senha_incorreta' : 'conta_inexistente', ref: emailRef(email) },
          ip,
          userAgent,
        });
        throw unauthorized('E-mail ou senha incorretos.');
      }

      /* Senha certa de um ADMIN com a administração do site desligada: só aqui a
         resposta muda (quem não sabe a senha não descobre nada por este caminho). */
      if (account.role === ROLES.ADMIN && !adminEnabled) throw adminDisabled();

      /* Parâmetros de hash endurecidos depois do cadastro? Atualiza agora. */
      if (needsRehash(account.password_hash)) {
        await ctx.users.updatePasswordHash(account.id, await hashPassword(password));
      }

      const totp = await ctx.twoFactor.get(account.id);
      if (totp?.enabled) {
        /* Senha certa, mas ainda não é login. O contador de falhas só zera
           depois do segundo passo (senão o passo 1 seria um oráculo de senha
           sem custo para o atacante). */
        const challenge = createSessionToken();
        const expiresAt = now() + SECURITY.TWO_FACTOR.CHALLENGE_TTL_MS;
        await ctx.twoFactor.createChallenge({ id: hashToken(challenge), userId: account.id, expiresAt });
        return { twoFactorRequired: true, challenge, expiresAt };
      }

      await guard.clear(email, ip);
      return startSession(account, { ip, userAgent });
    },

    /** Segundo passo: troca desafio + código por uma sessão. */
    async loginWithSecondFactor(input, { ip = NO_IP, userAgent = null } = {}) {
      const invalid = () =>
        unauthorized('A verificação expirou. Entre com e-mail e senha novamente.');

      if (typeof input.challenge !== 'string' || typeof input.code !== 'string') throw invalid();
      if (input.code.length > 40) throw unauthorized('Código incorreto.');

      const challengeId = hashToken(input.challenge);
      const challenge = await ctx.twoFactor.findChallenge(challengeId, now());
      if (!challenge) throw invalid();

      const account = await ctx.users.findById(challenge.user_id);
      if (!account) throw invalid();
      if (account.role === ROLES.ADMIN && !adminEnabled) throw adminDisabled();

      await guard.assertNotLocked(account.email, ip);

      /* Conta a tentativa ANTES de conferir: n requisições simultâneas não
         ganham n chutes. Estourou o limite do desafio → ele morre. */
      if (!(await ctx.twoFactor.bumpChallenge(challengeId, SECURITY.TWO_FACTOR.CHALLENGE_MAX_ATTEMPTS))) {
        await ctx.twoFactor.consumeChallenge(challengeId);
        throw invalid();
      }

      const result = await verifySecondFactor(ctx, account.id, input.code, { now: now() });

      if (!result) {
        await guard.registerFailure(account.email, ip);
        await ctx.audit.log({
          userId: account.id,
          action: AUDIT_ACTIONS.LOGIN_2FA_FAILED,
          resourceType: 'auth',
          ip,
          userAgent,
        });
        throw unauthorized('Código incorreto. Confira o app autenticador e tente de novo.');
      }

      /* Uso único: se outra requisição já gastou o desafio, esta não loga. */
      if (!(await ctx.twoFactor.consumeChallenge(challengeId))) throw invalid();

      await guard.clear(account.email, ip);

      if (result.method === 'recovery') {
        await ctx.audit.log({
          userId: account.id,
          action: AUDIT_ACTIONS.RECOVERY_CODE_USED,
          resourceType: 'auth',
          details: { restantes: await ctx.twoFactor.countUnusedRecoveryCodes(account.id) },
          ip,
          userAgent,
        });
      }

      return startSession(account, { ip, userAgent });
    },

    /**
     * Resolve o usuário a partir do token do cookie. Sessão parada além do
     * limite do papel (ou vencida) é apagada e responde como "sem sessão".
     */
    async resolveSession(token) {
      if (typeof token !== 'string' || !token) return null;

      const current = now();
      const id = hashToken(token);
      const session = await ctx.sessions.findValidWithUser(id, current);
      if (!session) return null;

      /* Administração do site desligada: sessão de ADMIN deixa de valer (e é
         apagada, para não "ressuscitar" se a flag voltar a ligar). */
      if (session.role === ROLES.ADMIN && !adminEnabled) {
        await ctx.sessions.delete(id);
        return null;
      }

      const idleLimit = SECURITY.SESSION_IDLE_MS[session.role] ?? SECURITY.SESSION_IDLE_MS.CLIENT;
      const lastSeen = Number(session.last_seen_at ?? session.created_at);

      if (current - lastSeen > idleLimit) {
        await ctx.sessions.delete(id);
        return null;
      }

      if (current - lastSeen > SECURITY.SESSION_TOUCH_MS) {
        await ctx.sessions.touch(id, current);
      }

      return {
        id: session.user_id,
        name: session.name,
        company: session.company,
        email: session.email,
        role: session.role,
        twoFactorEnabled: Boolean(Number(session.totp_enabled)),
        sessionId: session.session_id,
      };
    },

    async logout(token, userId = null) {
      if (typeof token !== 'string' || !token) return;

      await ctx.sessions.delete(hashToken(token));

      if (userId) {
        await ctx.audit.log({
          userId,
          action: AUDIT_ACTIONS.LOGOUT,
          resourceType: 'auth',
        });
      }
    },
  };
}
