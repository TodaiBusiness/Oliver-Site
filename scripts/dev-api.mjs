/* =========================================================================
   Servidor de API para desenvolvimento local.

   Em produção quem atende /api é o próprio `server.js` (hoje no Render; no
   plano, na VPS da Hostinger). Localmente subimos a MESMA aplicação
   (`server/app.js`) num servidor http comum, para o front funcionar de verdade
   durante o desenvolvimento.

   Uso:  npm run dev:api      (o `npm run dev` já sobe os dois juntos)
   ========================================================================= */

import { createServer } from 'node:http';
import './env.mjs'; // precisa vir antes de config.js
import { LIMITS } from '../server/config.js';
import { getDb } from '../server/db/index.js';
import { createApp } from '../server/app.js';
import { lerCorpo } from '../server/http/static.js';
import { isEventStreamRequest, serveEventStream } from '../server/http/sse.js';

const PORT = Number(process.env.API_PORT ?? 8788);

/* A imagem do chat viaja em base64 (cresce ~33%): o teto precisa folgar sobre
   UPLOAD_MAX_BYTES, senão o upload morre na leitura antes de ser validado. */
const MAX_BODY_BYTES = Math.ceil(LIMITS.UPLOAD_MAX_BYTES * 1.5) + 64 * 1024;

const db = await getDb();
await db.init(); // garante as tabelas em ambiente novo

const app = createApp(db, {
  allowedOrigins: [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    `http://localhost:${PORT}`,
  ],
});

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://localhost:${PORT}`);
    if (isEventStreamRequest(request, url.pathname)) {
      await serveEventStream(app, request, response);
      return;
    }

    const politica = app.bodyPolicy({ path: url.pathname, headers: request.headers });

    /* /api/service/* sem chave válida: corpo não é lido; o porteiro responde. */
    if (politica.reject) {
      const negado = await app.handle({
        method: request.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        headers: request.headers,
        remoteAddress: request.socket.remoteAddress,
        body: {},
      });
      response.writeHead(negado.status, { ...negado.headers, Connection: 'close' });
      response.end(JSON.stringify(negado.body));
      return;
    }

    const { body: raw, tooLarge } = await lerCorpo(request, politica.limit ?? MAX_BODY_BYTES);

    if (tooLarge) {
      response.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' });
      response.end(
        JSON.stringify({ error: 'CORPO_GRANDE_DEMAIS', message: 'Corpo grande demais.' })
      );
      return;
    }

    let body = {};
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({ error: 'JSON_INVALIDO', message: 'Corpo inválido.' })
        );
        return;
      }
    }

    const result = await app.handle({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      headers: request.headers,
      remoteAddress: request.socket.remoteAddress,
      body,
    });

    /* Resposta binária (imagem do chat): manda os bytes como estão. */
    if (result.isRaw) {
      response.writeHead(result.status, result.headers);
      response.end(result.buffer);
      return;
    }

    response.writeHead(result.status, result.headers);
    response.end(JSON.stringify(result.body));
  } catch (error) {
    console.error('[dev-api] falha:', error?.message);
    response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({ error: 'ERRO_INTERNO', message: 'Erro interno.' })
    );
  }
});

server.listen(PORT, () => {
  console.log(`[dev-api] ouvindo em http://localhost:${PORT}`);
  console.log('[dev-api] o Vite encaminha /api para cá (ver vite.config.js)');
});
