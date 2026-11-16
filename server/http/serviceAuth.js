/* =========================================================================
   Autenticação dos endpoints de serviço (/api/service/*).

   Quem chama é a API do Panel, de servidor para servidor, com o cabeçalho
   X-Service-Key. Não há sessão, cookie nem Origin aqui.

   · Sem chave configurada (ou com menos de 32 caracteres) a rota fica DESLIGADA
     (503) — nunca abre por falta de configuração.
   · A comparação é em tempo constante: os dois lados passam por SHA-256 (tamanho
     fixo) e vão para `timingSafeEqual`, então nem o tamanho da chave vaza.
   ========================================================================= */

import { createHash, timingSafeEqual } from 'node:crypto';

export const SERVICE_KEY_MIN_LENGTH = 32;

export function createServiceAuth(apiKey) {
  const enabled = typeof apiKey === 'string' && apiKey.length >= SERVICE_KEY_MIN_LENGTH;
  const expected = enabled ? createHash('sha256').update(apiKey).digest() : null;

  function authorize(provided) {
    if (!enabled || typeof provided !== 'string' || !provided) return false;
    const given = createHash('sha256').update(provided).digest();
    return timingSafeEqual(given, expected);
  }

  return { enabled, authorize };
}
