/* =========================================================================
   Adaptador HTTP do stream de eventos (GET /api/events) para o servidor Node
   puro (server.js e scripts/dev-api.mjs). A regra fica em app.openEventStream;
   aqui só se liga a resposta do Node ao "sink" do hub.

   Sem corpo e sem limite de corpo: a rota é GET e nada é lido. O tempo de
   inatividade do socket é desligado (o heartbeat de 25 s mantém a linha viva).
   ========================================================================= */

export const EVENTS_PATH = '/api/events';

/** Verdadeiro se a requisição é para o stream (GET, com ou sem querystring). */
export function isEventStreamRequest(request, pathname) {
  return request.method === 'GET' && pathname === EVENTS_PATH;
}

/**
 * Responde o stream. `extraHeaders`: cabeçalhos gerais do servidor (segurança);
 * os do stream têm a última palavra.
 */
export async function serveEventStream(app, request, response, extraHeaders = {}) {
  const result = await app.openEventStream({
    headers: request.headers,
    remoteAddress: request.socket.remoteAddress,
  });

  if (!result.stream) {
    response.writeHead(result.status, { ...extraHeaders, ...result.headers });
    response.end(JSON.stringify(result.body));
    return;
  }

  request.socket.setTimeout(0);
  request.socket.setNoDelay(true);
  response.writeHead(result.status, { ...extraHeaders, ...result.headers });
  response.flushHeaders?.();

  /* `assertCanOpen` já recusou o excesso antes do 200; `open` repete a conta
     no mesmo tick, então só falha se o socket já caiu. */
  const detach = result.stream({
    write: (text) => response.write(text),
    end: () => response.end(),
    pendingBytes: () => response.writableLength,
  });
  const soltar = () => detach();
  request.on('close', soltar);
  response.on('close', soltar);
}
