/* =========================================================================
   Servidor de produção — um processo Node servindo DUAS coisas:

     /api/*        → a aplicação (server/app.js), que fala com o PostgreSQL
     qualquer outra→ os arquivos estáticos de `dist/` (o site React)

   Servir os dois na MESMA origem não é detalhe de arrumação: o cookie de
   sessão é HttpOnly + SameSite=Lax e o front chama `/api` com
   `credentials: 'same-origin'`. Separar o site da API em domínios diferentes
   exigiria SameSite=None, que é justamente a configuração que abre espaço
   para CSRF. Aqui não é preciso.

   Uso:
     npm run build && npm start
     PORT=10000 npm start        (o Render define PORT sozinho)

   O schema do banco É aplicado aqui, ao subir (db.init(), o mesmo do
   `npm run db:migrate`: só CREATE/ALTER ... IF NOT EXISTS, pode rodar de novo).
   Motivo: em 20/11/2026 a imagem nova subiu na VPS sem a migração e o login do
   portal quebrou. Se a migração falhar, o servidor NÃO morre: loga o erro e
   segue no ar, e o /api/health responde 503 com o banco desatualizado (o teste
   de fumaça do deploy reprova e volta a versão anterior).
   DB_MIGRATE_ON_START=false desliga (para migrar só à mão).
   ========================================================================= */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { LIMITS, assertProductionConfig } from './server/config.js';
import { getDb } from './server/db/index.js';
import { applySchemaOnStart } from './server/db/startupMigration.js';
import { createApp } from './server/app.js';
import { normalizeApiPath } from './server/http/path.js';
import { parseAllowedOrigins } from './server/http/origins.js';
import { SECURITY_HEADERS } from './server/http/securityHeaders.js';
import { applySeo } from './shared/seo.js';
import { caminhoEstatico, lerCorpo, statusDaSpa } from './server/http/static.js';
import { isEventStreamRequest, serveEventStream } from './server/http/sse.js';

const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';

/** Pasta gerada por `npm run build`. */
const DIST = resolve(import.meta.dirname, 'dist');

/* Corpo máximo aceito. A imagem do chat viaja em base64 (cresce ~33%), então
   o limite precisa folgar sobre UPLOAD_MAX_BYTES, senão o upload morre na
   leitura antes de a validação sequer rodar. */
const MAX_BODY_BYTES = Math.ceil(LIMITS.UPLOAD_MAX_BYTES * 1.5) + 64 * 1024;

const TIPOS = new Map(
  Object.entries({
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.webm': 'video/webm',
    '.mp4': 'video/mp4',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
  })
);

/* Cabeçalhos de segurança: fonte única em server/http/securityHeaders.js
   (e repetidos no netlify.toml, com teste contra divergência). */
const SEGURANCA = SECURITY_HEADERS;

/* ------------------------------------------------------------- inicialização */

assertProductionConfig();

const db = await getDb();

await applySchemaOnStart(db);

/* Origens autorizadas a enviar POST/PUT/PATCH/DELETE (defesa de CSRF).

   O fallback para RENDER_EXTERNAL_URL — que o Render injeta com o endereço
   .onrender.com do serviço — existe porque a URL pública só é conhecida DEPOIS
   do primeiro deploy. Sem ele, o site subiria com a checagem de Origin
   desligada justamente na estreia, que é quando ninguém confere.

   A barra final é removida: o navegador manda `Origin: https://site.com`, sem
   barra, então `https://site.com/` na configuração nunca casaria — e a falha
   apareceria como um 403 no login, sem pista nenhuma da causa. */
const allowedOrigins = parseAllowedOrigins(process.env, { exigir: true });

const app = createApp(db, { allowedOrigins });

/* ------------------------------------------------------------------ auxiliares */

/** `Range: bytes=a-b` simples (um intervalo). null = sem Range; 'invalido' = 416. */
function lerRange(cabecalho, tamanho) {
  if (typeof cabecalho !== 'string') return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(cabecalho.trim());
  if (!m || (m[1] === '' && m[2] === '')) return 'invalido';
  let inicio;
  let fim;
  if (m[1] === '') {
    inicio = Math.max(0, tamanho - Number(m[2]));
    fim = tamanho - 1;
  } else {
    inicio = Number(m[1]);
    fim = m[2] === '' ? tamanho - 1 : Math.min(Number(m[2]), tamanho - 1);
  }
  return inicio > fim || inicio >= tamanho ? 'invalido' : { inicio, fim };
}

async function enviarArquivo(response, caminho, { status = 200, imutavel = false, range = null } = {}) {
  const completo = await readFile(caminho);
  const tipo = TIPOS.get(extname(caminho).toLowerCase()) ?? 'application/octet-stream';
  const intervalo = lerRange(range, completo.length);

  if (intervalo === 'invalido') {
    response.writeHead(416, { ...SEGURANCA, 'Content-Range': `bytes */${completo.length}` });
    response.end();
    return;
  }
  /* Vídeo precisa de Range (Safari e seek); vale para qualquer arquivo estático. */
  const conteudo = intervalo ? completo.subarray(intervalo.inicio, intervalo.fim + 1) : completo;
  if (intervalo) status = 206;

  response.writeHead(status, {
    ...SEGURANCA,
    'Content-Type': tipo,
    'Accept-Ranges': 'bytes',
    ...(intervalo ? { 'Content-Range': `bytes ${intervalo.inicio}-${intervalo.fim}/${completo.length}` } : {}),
    'Content-Length': conteudo.length,
    /* Os nomes em /assets trazem hash do conteúdo: mudou o arquivo, mudou o
       nome. Por isso podem ser guardados para sempre. O index.html, não —
       ele é quem aponta para os nomes novos. */
    'Cache-Control': imutavel
      ? 'public, max-age=31536000, immutable'
      : 'no-cache',
  });

  response.end(conteudo);
}

/* ------------------------------------------------------------------ requisições */

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);

    /* ------------------------------------------------------------------ API */
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const apiPath = normalizeApiPath(url.pathname);

      /* Tempo real do chat (SSE): GET sem corpo, resposta que não termina. */
      if (isEventStreamRequest(request, apiPath)) {
        await serveEventStream(app, request, response, SEGURANCA);
        return;
      }

      const politica = app.bodyPolicy({ path: apiPath, headers: request.headers });

      /* /api/service/* sem chave válida: o corpo NÃO é lido (nem 1 byte); o
         porteiro responde 401/503/403/429 e a conexão é encerrada. */
      if (politica.reject) {
        const negado = await app.handle({
          method: request.method,
          path: apiPath,
          query: Object.fromEntries(url.searchParams),
          headers: request.headers,
          remoteAddress: request.socket.remoteAddress,
          body: {},
        });
        response.writeHead(negado.status, { ...SEGURANCA, ...negado.headers, Connection: 'close' });
        response.end(JSON.stringify(negado.body));
        return;
      }

      const { body: bruto, tooLarge } = await lerCorpo(request, politica.limit ?? MAX_BODY_BYTES);

      if (tooLarge) {
        response.writeHead(413, {
          ...SEGURANCA,
          'Content-Type': 'application/json; charset=utf-8',
          Connection: 'close',
        });
        response.end(
          JSON.stringify({
            error: 'CORPO_GRANDE_DEMAIS',
            message: 'O corpo da requisição passa do tamanho permitido.',
          })
        );
        return;
      }

      let body = {};
      if (bruto) {
        try {
          body = JSON.parse(bruto);
        } catch {
          response.writeHead(400, {
            ...SEGURANCA,
            'Content-Type': 'application/json; charset=utf-8',
          });
          response.end(
            JSON.stringify({
              error: 'JSON_INVALIDO',
              message: 'Corpo da requisição não é um JSON válido.',
            })
          );
          return;
        }
      }

      const resultado = await app.handle({
        method: request.method,
        path: normalizeApiPath(url.pathname),
        query: Object.fromEntries(url.searchParams),
        headers: request.headers,
        remoteAddress: request.socket.remoteAddress,
        body,
      });

      /* Resposta binária (imagem do chat): manda os bytes como estão. Os
         cabeçalhos vêm primeiro para que os do próprio resultado (Content-Type,
         nosniff, Content-Disposition) continuem tendo a última palavra. */
      if (resultado.isRaw) {
        response.writeHead(resultado.status, { ...SEGURANCA, ...resultado.headers });
        response.end(resultado.buffer);
        return;
      }

      /* A API também responde com os cabeçalhos de segurança: sem `nosniff`,
         um JSON com conteúdo enviado pelo usuário pode ser reinterpretado como
         HTML por navegador antigo e virar XSS na própria origem do site. */
      /* Os cabeçalhos da própria resposta (no-store, CORP same-origin,
         Retry-After, Set-Cookie) têm a última palavra sobre os gerais. */
      const headers = { ...SEGURANCA, ...resultado.headers };

      response.writeHead(resultado.status, headers);
      response.end(JSON.stringify(resultado.body));
      return;
    }

    /* -------------------------------------------------------------- estáticos */
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end();
      return;
    }

    const caminho = caminhoEstatico(DIST, url.pathname);
    if (caminho === undefined) {
      /* Percent-encoding inválido (%E0%A4%A): pedido malformado, não falha nossa. */
      response.writeHead(400, SEGURANCA);
      response.end();
      return;
    }
    if (!caminho) {
      response.writeHead(400);
      response.end();
      return;
    }

    const arquivo = await stat(caminho).catch(() => null);

    if (arquivo?.isFile()) {
      await enviarArquivo(response, caminho, {
        range: request.headers.range,
        imutavel: url.pathname.startsWith('/assets/'),
      });
      return;
    }

    /* Caminho com extensão (/assets/x.js, /favicon.ico) que não existe: 404 sem
       o HTML do app, senão o navegador tentaria rodar HTML como script. */
    const status = statusDaSpa(url.pathname);
    if (extname(url.pathname)) {
      response.writeHead(404, { ...SEGURANCA, 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Não encontrado.');
      return;
    }

    /* Single-page app: qualquer outra rota é do React Router, então devolve o
       index.html — com 404 quando a rota não existe (o React mostra a página
       404 usando este mesmo HTML). O título, a descrição e o
       canonical já saem com os da rota (P-008), para buscadores e prévias de
       link que não rodam JavaScript. */
    const html = applySeo(await readFile(join(DIST, 'index.html'), 'utf8'), url.pathname);
    const corpo = Buffer.from(html, 'utf8');
    response.writeHead(status, {
      ...SEGURANCA,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': corpo.length,
      'Cache-Control': 'no-cache',
    });
    response.end(corpo);
  } catch (error) {
    console.error('[server] falha:', error?.message);
    if (!response.headersSent) {
      response.writeHead(500, {
        ...SEGURANCA,
        'Content-Type': 'application/json; charset=utf-8',
      });
    }
    response.end(
      JSON.stringify({ error: 'ERRO_INTERNO', message: 'Serviço indisponível no momento.' })
    );
  }
});

/* Faxina de sessões vencidas, tentativas de login e auditoria antiga. Também
   roda sob demanda no login (maintenance.maybeRun), para quem não tem processo longo. */
setInterval(() => {
  app.maintenance.run().catch((error) => console.error('[server] faxina falhou:', error?.message));
}, 60 * 60 * 1000).unref();

server.listen(PORT, HOST, () => {
  console.log(`[server] ouvindo em http://${HOST}:${PORT}`);
  console.log(`[server] estáticos: ${DIST}`);
  console.log(`[server] origens autorizadas: ${allowedOrigins.join(', ') || '(nenhuma)'}`);
});

/* O Render manda SIGTERM ao trocar de versão: fechar o pool evita que a
   instância antiga segure conexões do Neon enquanto a nova sobe. */
for (const sinal of ['SIGTERM', 'SIGINT']) {
  process.on(sinal, () => {
    console.log(`[server] ${sinal} recebido, encerrando.`);
    app.events.closeAll(); // senão o SSE seguraria o close() para sempre
    server.close(() => {
      db.close().finally(() => process.exit(0));
    });
  });
}
