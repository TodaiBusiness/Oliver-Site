/* =========================================================================
   Lista de origens aceitas na conferência de Origin (defesa de CSRF), comum ao
   server.js (Render) e à função do Netlify. Tira espaços, barra final e
   duplicatas: o navegador manda `Origin: https://site.com`, sem barra.
   Com `exigir`, produção sem nenhuma origem falha fechado (derruba o boot);
   fora de produção só avisa.
   ========================================================================= */

/* Origens de produção da TODAI. Valem fora do Render (sem RENDER_EXTERNAL_URL) com
   NODE_ENV=production, para a VPS não depender de variável do Render. */
const ORIGENS_PRODUCAO = ['https://todai.com.br', 'https://www.todai.com.br'];

export function parseAllowedOrigins(env = process.env, { exigir = false } = {}) {
  const origens = [...(env.ALLOWED_ORIGINS ?? '').split(','), env.RENDER_EXTERNAL_URL ?? '',
    ...(env.NODE_ENV === 'production' && !env.RENDER_EXTERNAL_URL ? ORIGENS_PRODUCAO : [])]
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)
    .filter((origin, indice, lista) => lista.indexOf(origin) === indice);

  if (exigir && !origens.length) {
    const aviso =
      'ALLOWED_ORIGINS vazio e RENDER_EXTERNAL_URL ausente: a conferência de ' +
      'Origin (defesa de CSRF) ficaria desligada. Defina ALLOWED_ORIGINS com a ' +
      'URL pública do site, sem barra final.';
    if (env.NODE_ENV === 'production') throw new Error(`[server] ${aviso}`);
    console.warn(`[server] ${aviso}`);
  }
  return origens;
}
