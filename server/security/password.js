/* =========================================================================
   Hash de senha.
   -------------------------------------------------------------------------
   POR QUE scrypt E NÃO Argon2id/bcrypt:
   os dois exigem módulo nativo compilado, que costuma falhar em ambiente
   serverless (Netlify Functions). O `scrypt` vem embutido no Node, é
   memory-hard como o Argon2 e é recomendado pelo OWASP para este uso.

   O hash é gravado num formato autodescritivo:
       scrypt$N$r$p$<salt-base64>$<hash-base64>
   Assim dá para endurecer os parâmetros no futuro sem invalidar as senhas
   já cadastradas (ver `needsRehash`).

   Para trocar por Argon2id depois, só este arquivo muda.
   ========================================================================= */

import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { LOGIN_DISABLED_HASH, SECURITY } from '../config.js';

const scryptAsync = promisify(scrypt);
const ALGORITHM = 'scrypt';

const derive = (password, salt, { N, r, p, keyLength, maxmem }) =>
  scryptAsync(password.normalize('NFKC'), salt, keyLength, { N, r, p, maxmem });

/** Gera o hash de uma senha nova. */
export async function hashPassword(password) {
  const { N, r, p, keyLength, saltBytes, maxmem } = SECURITY.SCRYPT;
  const salt = randomBytes(saltBytes);
  const hash = await derive(password, salt, { N, r, p, keyLength, maxmem });

  return [
    ALGORITHM,
    N,
    r,
    p,
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

/**
 * Confere a senha contra o hash guardado.
 * Sempre devolve boolean — nunca lança — para não vazar detalhe por exceção.
 */
export async function verifyPassword(password, stored) {
  try {
    if (typeof password !== 'string' || typeof stored !== 'string') return false;

    const [algorithm, rawN, rawR, rawP, saltB64, hashB64] = stored.split('$');
    if (algorithm !== ALGORITHM) return false;

    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    if (!salt.length || !expected.length) return false;

    const derived = await derive(password, salt, {
      N: Number(rawN),
      r: Number(rawR),
      p: Number(rawP),
      keyLength: expected.length,
      maxmem: SECURITY.SCRYPT.maxmem,
    });

    /* Comparação em tempo constante: evita descobrir o hash por medição. */
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** `true` quando o hash foi gerado com parâmetros mais fracos que os atuais. */
export function needsRehash(stored) {
  if (typeof stored !== 'string') return true;

  const [algorithm, rawN, rawR, rawP] = stored.split('$');
  if (algorithm !== ALGORITHM) return true;

  const { N, r, p } = SECURITY.SCRYPT;
  return Number(rawN) < N || Number(rawR) < r || Number(rawP) < p;
}

/** Conta sem login possível (usuário de sistema): nenhuma senha, reset ou sessão a abre. */
export function isLoginDisabled(stored) {
  return stored === LOGIN_DISABLED_HASH;
}
