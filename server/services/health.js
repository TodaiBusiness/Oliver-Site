/* =========================================================================
   Saúde do site para o /api/health.

   200 só quando o banco responde E tem todas as tabelas e colunas que este
   código usa (server/db/schemaCheck.js). Antes, o /api/health dava 200 mesmo
   com o banco desatualizado, e o teste de fumaça do deploy da VPS
   (Panel-Desktop/deploy/hostinger/scripts/smoke-test.sh) aprovava uma versão
   com o login do portal quebrado. Com 503 ele reprova e volta sozinho para a
   versão anterior.

   O resultado fica guardado por alguns segundos: a rota é pública e o Docker a
   chama a cada poucos segundos, então ninguém consegue usá-la para martelar o
   banco. A resposta pública só diz o motivo genérico; a lista do que falta vai
   para o log do servidor (docker logs).
   ========================================================================= */

import { checkSchema } from '../db/schemaCheck.js';

export const HEALTH_CACHE_MS = 15_000;

export function healthService(
  db,
  { ttlMs = HEALTH_CACHE_MS, now = () => Date.now(), log = console.error, check = checkSchema } = {}
) {
  let ultimo = null; // { em, resultado }
  let emAndamento = null;
  let ultimoLog = '';

  const registrar = (mensagem) => {
    /* Só loga quando a situação muda, para não encher o log a cada health check. */
    if (mensagem === ultimoLog) return;
    ultimoLog = mensagem;
    if (mensagem) log(mensagem);
  };

  async function avaliar() {
    try {
      const r = await check(db);
      if (r.ok) {
        if (ultimoLog) log('[health] banco de novo em dia com o código.');
        ultimoLog = '';
        return { ok: true };
      }
      registrar(
        `[health] BANCO DESATUALIZADO para esta versão do site. Falta: ${r.missing.join(', ')}. ` +
          'Rode "node scripts/db-migrate.mjs" (na VPS: bash scripts/dc.sh run --rm --no-deps site node scripts/db-migrate.mjs).'
      );
      return { ok: false, code: 'BANCO_DESATUALIZADO', message: 'O banco de dados está desatualizado para esta versão.' };
    } catch (error) {
      registrar(`[health] banco indisponível: ${error?.message ?? error}`);
      return { ok: false, code: 'BANCO_INDISPONIVEL', message: 'O banco de dados não respondeu.' };
    }
  }

  return {
    async check() {
      if (ultimo && now() - ultimo.em < ttlMs) return ultimo.resultado;
      /* Pedidos simultâneos esperam a mesma conferência em vez de abrir outra. */
      emAndamento ??= avaliar().finally(() => {
        emAndamento = null;
      });
      const resultado = await emAndamento;
      ultimo = { em: now(), resultado };
      return resultado;
    },
  };
}
