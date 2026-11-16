/* =========================================================================
   TOTP (RFC 6238) sobre HOTP (RFC 4226), só com `node:crypto`.

   SHA-1, 6 dígitos, passo de 30 s: é o que todo app autenticador (Google
   Authenticator, Authy, 1Password, Microsoft) entende sem configuração.
   O SHA-1 aqui é do HMAC, que continua seguro para este uso.
   ========================================================================= */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTP_PERIOD_S = 30;
export const TOTP_DIGITS = 6;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  const clean = String(text).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Base32 inválido.');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Segredo novo: 160 bits, o tamanho recomendado pela RFC 4226. */
export function generateTotpSecret() {
  return base32Encode(randomBytes(20));
}

/** HOTP de um contador (RFC 4226, seção 5.3). */
export function hotp(secretBuffer, counter, digits = TOTP_DIGITS) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secretBuffer).update(message).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/** Número do passo de 30 s em que `timeMs` cai. */
export const stepAt = (timeMs = Date.now(), period = TOTP_PERIOD_S) =>
  Math.floor(timeMs / 1000 / period);

export function totpAt(secretBase32, timeMs = Date.now()) {
  return hotp(base32Decode(secretBase32), stepAt(timeMs));
}

/**
 * Confere o código. Devolve o NÚMERO DO PASSO que casou (para o chamador
 * gravá-lo e recusar reuso) ou `null`.
 *
 * · `window`: quantos passos para cada lado são aceitos (deriva de relógio).
 * · `minStep`: passos <= a este já foram usados — anti-replay.
 * · Todos os candidatos são comparados, sem sair no primeiro acerto, e a
 *   comparação é em tempo constante.
 */
export function verifyTotp(secretBase32, code, { now = Date.now(), window = 1, minStep = 0 } = {}) {
  if (typeof code !== 'string') return null;
  const clean = code.replace(/[\s-]/g, '');
  if (!/^\d{6}$/.test(clean)) return null;

  const secret = base32Decode(secretBase32);
  const informado = Buffer.from(clean);
  const atual = stepAt(now);

  let achado = null;
  for (let step = atual - window; step <= atual + window; step += 1) {
    if (step <= 0) continue;
    const esperado = Buffer.from(hotp(secret, step));
    const confere = timingSafeEqual(informado, esperado);
    if (confere && step > minStep && (achado === null || step > achado)) achado = step;
  }
  return achado;
}

/** Endereço `otpauth://` que os apps leem (também vira QR code). */
export function otpauthUrl({ secret, account, issuer }) {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const query = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_S),
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}
