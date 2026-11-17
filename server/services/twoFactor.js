/* =========================================================================
   Segundo fator (TOTP) para ADMIN e CLIENT (opcional para o cliente): ativar, conferir, desativar e códigos de
   recuperação.

   · O segredo é sorteado aqui, cifrado (AES-GCM) antes de ir ao banco e só
     decifrado na hora de conferir um código.
   · Ativar exige a SENHA (sessão roubada não consegue trancar o dono para
     fora) e um código válido do app (prova de que o app foi configurado).
   · Desativar e gerar códigos novos exigem senha + código.
   · Códigos de recuperação: 12 caracteres sem ambiguidade (60 bits), mostrados
     UMA vez; no banco só o HMAC. Cada um vale uma vez.
   · Todo código TOTP aceito grava o passo (anti-replay, decidido pelo banco).
   ========================================================================= */

import { randomInt } from 'node:crypto';
import { AUDIT_ACTIONS, ROLES, SECURITY } from '../config.js';
import { AppError, badRequest, conflict, forbidden, unauthorized } from '../http/errors.js';
import { isLoginDisabled, verifyPassword } from '../security/password.js';
import { generateTotpSecret, otpauthUrl, stepAt, verifyTotp } from '../security/totp.js';
import { createLoginGuard } from './loginGuard.js';

/* Sem 0/O/1/I/L: o código é copiado à mão. */
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RECOVERY_LENGTH = 12;

const normalizeRecovery = (value) => String(value).toUpperCase().replace(/[\s-]/g, '');
const isTotpShape = (value) => /^\d{6}$/.test(String(value).replace(/[\s-]/g, ''));

const generateRecoveryCode = () =>
  Array.from({ length: RECOVERY_LENGTH }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join('');

/** "ABCD-EFGH-JKMN" para exibir. */
export const formatRecoveryCode = (code) => code.match(/.{1,4}/g).join('-');

/**
 * Confere o código de segundo fator de `userId`: TOTP de 6 dígitos ou código de
 * recuperação. Devolve `{ method: 'totp' | 'recovery' }` ou `null`. Não lança
 * por código errado nem por segredo ilegível (cofre com chave trocada).
 */
export async function verifySecondFactor(ctx, userId, code, { now = Date.now() } = {}) {
  if (typeof code !== 'string' || !code.trim()) return null;

  const row = await ctx.twoFactor.get(userId);
  if (!row || !row.enabled) return null;

  if (isTotpShape(code)) {
    let step;
    try {
      step = verifyTotp(ctx.vault.open(row.secret_enc), code, {
        now,
        window: SECURITY.TWO_FACTOR.WINDOW,
        minStep: Number(row.last_step),
      });
    } catch (error) {
      console.error('[2fa] segredo ilegível (SESSION_SECRET mudou?):', error?.message);
      return null;
    }
    if (step === null) return null;
    return (await ctx.twoFactor.advanceStep(userId, step)) ? { method: 'totp' } : null;
  }

  const normalized = normalizeRecovery(code);
  if (normalized.length !== RECOVERY_LENGTH || !ctx.vault.available) return null;
  const hash = ctx.vault.mac('recovery', normalized);
  return (await ctx.twoFactor.consumeRecoveryCode(userId, hash)) ? { method: 'recovery' } : null;
}

export function twoFactorService(ctx, { now = () => Date.now() } = {}) {
  const guard = createLoginGuard(ctx, { now });

  /* Só ADMIN e CLIENT têm 2FA. Conta de sistema (login desligado, como o
     "TODAI Atendimento") nunca configura nem usa. Para o cliente é opcional. */
  const ELIGIBLE = new Set([ROLES.ADMIN, ROLES.CLIENT]);
  const requireEligible = async (user) => {
    if (!ELIGIBLE.has(user.role)) throw forbidden('Esta conta não pode usar a verificação em duas etapas.');
    const account = await ctx.users.findByIdWithHash(user.id);
    if (!account || isLoginDisabled(account.password_hash)) {
      throw forbidden('Esta conta não pode usar a verificação em duas etapas.');
    }
  };

  const requireVault = () => {
    if (!ctx.vault.available) {
      throw new AppError(
        503,
        'DOIS_FATORES_INDISPONIVEL',
        'O segundo fator está indisponível: falta configurar SESSION_SECRET no servidor.'
      );
    }
  };

  /** Senha atual conferida; falha conta no mesmo bloqueio do login. */
  async function assertPassword(user, password, ip) {
    await guard.assertNotLocked(user.email, ip);
    const account = await ctx.users.findByIdWithHash(user.id);
    const ok = typeof password === 'string' && password
      ? await verifyPassword(password, account?.password_hash)
      : false;
    if (!ok) {
      await guard.registerFailure(user.email, ip);
      await ctx.audit.log({
        userId: user.id,
        action: AUDIT_ACTIONS.PASSWORD_CHANGE_FAILED,
        resourceType: 'auth',
        details: { operacao: '2fa' },
        ip,
      });
      throw unauthorized('Senha incorreta.');
    }
  }

  async function issueRecoveryCodes(userId) {
    const plain = Array.from({ length: SECURITY.TWO_FACTOR.RECOVERY_CODES }, generateRecoveryCode);
    await ctx.twoFactor.replaceRecoveryCodes(
      userId,
      plain.map((code) => ctx.vault.mac('recovery', code))
    );
    return plain.map(formatRecoveryCode);
  }

  /** Código do app (ou de recuperação) conferido contra o 2FA JÁ ATIVO. */
  async function assertSecondFactor(user, code, ip) {
    const result = await verifySecondFactor(ctx, user.id, code, { now: now() });
    if (!result) {
      await guard.registerFailure(user.email, ip);
      await ctx.audit.log({
        userId: user.id,
        action: AUDIT_ACTIONS.LOGIN_2FA_FAILED,
        resourceType: 'auth',
        details: { operacao: 'conta' },
        ip,
      });
      throw unauthorized('Código incorreto.');
    }
    return result;
  }

  return {
    async status(user) {
      const row = await ctx.twoFactor.get(user.id);
      return {
        available: ELIGIBLE.has(user.role) && ctx.vault.available,
        required: user.role === ROLES.ADMIN,
        enabled: Boolean(row?.enabled),
        recoveryCodesRemaining: row?.enabled ? await ctx.twoFactor.countUnusedRecoveryCodes(user.id) : 0,
      };
    },

    /** Sorteia o segredo e o guarda PENDENTE. Nada vale até `enable`. */
    async setup(user, { password }, { ip } = {}) {
      await requireEligible(user);
      requireVault();
      await assertPassword(user, password, ip);

      const existing = await ctx.twoFactor.get(user.id);
      if (existing?.enabled) throw conflict('O segundo fator já está ativo. Desative-o antes de configurar de novo.');

      const secret = generateTotpSecret();
      await ctx.twoFactor.savePending(user.id, ctx.vault.seal(secret));

      return {
        secret,
        otpauthUrl: otpauthUrl({ secret, account: user.email, issuer: SECURITY.TWO_FACTOR.ISSUER }),
      };
    },

    /** Confirma com um código do app, liga o 2FA e entrega os códigos de recuperação. */
    async enable(user, { code }, { ip } = {}) {
      await requireEligible(user);
      requireVault();

      const row = await ctx.twoFactor.get(user.id);
      if (!row) throw badRequest('Comece pela configuração do segundo fator.');
      if (row.enabled) throw conflict('O segundo fator já está ativo.');

      await guard.assertNotLocked(user.email, ip);

      let step = null;
      try {
        step = typeof code === 'string' && isTotpShape(code)
          ? verifyTotp(ctx.vault.open(row.secret_enc), code, {
              now: now(),
              window: SECURITY.TWO_FACTOR.WINDOW,
              minStep: 0,
            })
          : null;
      } catch {
        step = null;
      }

      if (step === null || !(await ctx.twoFactor.enable(user.id, step))) {
        await guard.registerFailure(user.email, ip);
        throw unauthorized('Código incorreto. Confira o app autenticador e tente de novo.');
      }

      const recoveryCodes = await issueRecoveryCodes(user.id);

      /* Quem ativou fica; qualquer outra sessão aberta com a senha sozinha cai. */
      await ctx.sessions.deleteOthersForUser(user.id, user.sessionId);

      await ctx.audit.log({
        userId: user.id,
        action: AUDIT_ACTIONS.TWO_FACTOR_ENABLED,
        resourceType: 'auth',
        ip,
      });

      return { recoveryCodes };
    },

    /** Desliga o 2FA. Exige senha E código (do app ou de recuperação). */
    async disable(user, { password, code }, { ip } = {}) {
      await requireEligible(user);
      const row = await ctx.twoFactor.get(user.id);
      if (!row?.enabled) throw badRequest('O segundo fator não está ativo.');

      await assertPassword(user, password, ip);
      await assertSecondFactor(user, code, ip);

      await ctx.twoFactor.remove(user.id);
      await ctx.audit.log({
        userId: user.id,
        action: AUDIT_ACTIONS.TWO_FACTOR_DISABLED,
        resourceType: 'auth',
        ip,
      });
      return { ok: true };
    },

    /** Gera 10 códigos novos e invalida os antigos. Exige senha + código do app. */
    async regenerateRecoveryCodes(user, { password, code }, { ip } = {}) {
      await requireEligible(user);
      requireVault();
      const row = await ctx.twoFactor.get(user.id);
      if (!row?.enabled) throw badRequest('O segundo fator não está ativo.');

      await assertPassword(user, password, ip);
      await assertSecondFactor(user, code, ip);

      const recoveryCodes = await issueRecoveryCodes(user.id);
      await ctx.audit.log({
        userId: user.id,
        action: AUDIT_ACTIONS.RECOVERY_CODES_REGENERATED,
        resourceType: 'auth',
        ip,
      });
      return { recoveryCodes };
    },
  };
}

export { stepAt };
