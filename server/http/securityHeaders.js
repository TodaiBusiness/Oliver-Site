/* =========================================================================
   Cabeçalhos de segurança do site — fonte única.

   `server.js` os envia; `netlify.toml` repete os mesmos valores (o Netlify os
   aplica por conta própria) e o teste tests/server/headers.test.js falha se os
   dois divergirem.

   · script-src 'self' sem 'unsafe-inline': o build gera um <script src> só.
   · style-src 'self' SEM 'unsafe-inline': o CSS sai todo em arquivo e o React
     aplica `style={{...}}` via CSSOM (element.style.x = ...), que a CSP não
     bloqueia. O que quebraria é um <style> ou style="..." escrito no HTML
     (incluindo dangerouslySetInnerHTML): o teste de código-fonte
     tests/server/headers.test.js procura por isso em src/.
   · img-src data: cobre a textura de ruído do CSS e a prévia das imagens.
   ========================================================================= */

export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; " +
  "img-src 'self' data:; media-src 'self'; font-src 'self'; connect-src 'self'; form-action 'self'; " +
  "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests";

export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': CSP,
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), payment=(), usb=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cross-Origin-Opener-Policy': 'same-origin',
  /* Páginas e arquivos estáticos: `same-site` (apex e www). As respostas da API
     (e as imagens do chat) usam `same-origin`, definido em app.js. */
  'Cross-Origin-Resource-Policy': 'same-site',
});
