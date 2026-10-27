/* =========================================================================
   Ponte entre o Netlify e a aplicação.

   Arquitetura obrigatória:
       Navegador  →  esta função (servidor)  →  PostgreSQL (Neon)
   O navegador NUNCA fala com o banco: as credenciais só existem aqui, em
   variáveis de ambiente do Netlify.

   Toda a lógica está em `server/app.js` — este arquivo só traduz formatos.
   ========================================================================= */

import { assertProductionConfig } from '../../server/config.js';
import { getDb } from '../../server/db/index.js';
import { bodyLimitFor, createApp } from '../../server/app.js';
import { parseAllowedOrigins } from '../../server/http/origins.js';
import { normalizeApiPath } from '../../server/http/path.js';

/* Reaproveitados entre invocações na mesma instância (evita reconectar). */
let appPromise = null;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      assertProductionConfig();
      const db = await getDb();

      /* Mesma regra do server.js: sem barra final e, em produção, sem origem = falha fechado. */
      const allowedOrigins = parseAllowedOrigins(process.env, { exigir: true });

      return createApp(db, { allowedOrigins });
    })().catch((error) => {
      appPromise = null; // permite nova tentativa na próxima invocação
      throw error;
    });
  }

  return appPromise;
}

export default async function handler(request) {
  try {
    const app = await getApp();
    const url = new URL(request.url);

    /* O corpo pode vir vazio ou malformado — não pode derrubar a função. */
    let body = {};
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        const raw = await request.text();
        const limite = bodyLimitFor(normalizeApiPath(url.pathname));
        if (limite !== null && Buffer.byteLength(raw) > limite) {
          return json(413, {
            error: 'CORPO_GRANDE_DEMAIS',
            message: 'O corpo da requisição passa do tamanho permitido.',
          });
        }
        body = raw ? JSON.parse(raw) : {};
      } catch {
        return json(400, {
          error: 'JSON_INVALIDO',
          message: 'Corpo da requisição não é um JSON válido.',
        });
      }
    }

    const result = await app.handle({
      method: request.method,
      path: normalizeApiPath(url.pathname),
      query: Object.fromEntries(url.searchParams),
      headers: Object.fromEntries(request.headers),
      body,
    });

    if (result.isRaw) {
      return new Response(result.buffer, {
        status: result.status,
        headers: result.headers,
      });
    }

    const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8' });
    for (const cookie of result.headers['Set-Cookie'] ?? []) {
      headers.append('Set-Cookie', cookie);
    }

    return new Response(JSON.stringify(result.body), {
      status: result.status,
      headers,
    });
  } catch (error) {
    console.error('[netlify/api] falha:', error?.message);
    return json(500, {
      error: 'ERRO_INTERNO',
      message: 'Serviço indisponível no momento.',
    });
  }
}

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

/* O roteamento de /api/* para cá é feito por redirect no netlify.toml
   (mecanismo clássico, previsível quanto à ordem em relação à SPA).
   O handler acima aceita tanto /api/... quanto /.netlify/functions/api/... */
