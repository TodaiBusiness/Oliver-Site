/* =========================================================================
   Cofre de segredos em repouso.

   · `seal`/`open`: AES-256-GCM (confidencialidade + integridade) para o
     segredo TOTP. Formato: v1.<iv>.<tag>.<texto cifrado>, tudo base64url.
   · `mac`: HMAC-SHA-256 para o que só precisa ser comparado (códigos de
     recuperação, referência de e-mail no log). Sem a chave, um vazamento só do
     banco não deixa testar palpites offline.

   As chaves saem de SESSION_SECRET por HKDF, uma por finalidade: a chave que
   cifra não é a que assina.

   Em desenvolvimento, sem SESSION_SECRET, usa uma chave fixa e conhecida —
   suficiente para o fluxo funcionar, inútil como proteção. Em produção, sem
   SESSION_SECRET (>= 32 caracteres) o cofre fica `available: false` e o 2FA
   recusa ser ativado.
   ========================================================================= */

import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

const DEV_SECRET = 'todai-dev-only-secret-not-for-production-use';
const SALT = Buffer.from('todai-vault-v1');

export function createVault({ secret, isProduction = false } = {}) {
  const usable = typeof secret === 'string' && secret.length >= 32;
  const root = usable ? secret : isProduction ? null : DEV_SECRET;
  const available = root !== null;

  const derive = (purpose) =>
    Buffer.from(hkdfSync('sha256', root, SALT, `todai:${purpose}`, 32));

  const keys = {};
  const key = (purpose) => (keys[purpose] ??= derive(purpose));

  const ensure = () => {
    if (!available) throw new Error('SESSION_SECRET ausente: cofre indisponível.');
  };

  return {
    available,

    seal(plain) {
      ensure();
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key('seal'), iv);
      const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
      return ['v1', iv, cipher.getAuthTag(), data].map((p) => (Buffer.isBuffer(p) ? p.toString('base64url') : p)).join('.');
    },

    open(sealed) {
      ensure();
      const [version, iv, tag, data] = String(sealed).split('.');
      if (version !== 'v1' || !iv || !tag || !data) throw new Error('Formato inválido.');
      const decipher = createDecipheriv('aes-256-gcm', key('seal'), Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },

    mac(purpose, value) {
      ensure();
      return createHmac('sha256', key(`mac:${purpose}`)).update(String(value)).digest('hex');
    },
  };
}
