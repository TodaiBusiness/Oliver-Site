/* =========================================================================
   Cookie de sessão.

   HttpOnly  → JavaScript da página não lê o token (limita o estrago de XSS)
   Secure    → só trafega em HTTPS (desligado em dev, senão não funciona)
   SameSite  → Lax barra envio em requisição cross-site (defesa de CSRF)
   Path=/    → vale para toda a aplicação
   ========================================================================= */

import { PORTAL, SECURITY, config } from '../config.js';

export function parseCookies(header) {
  const cookies = {};
  if (typeof header !== 'string' || !header) return cookies;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;

    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!name) continue;

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value; // valor malformado não derruba o parser
    }
  }

  return cookies;
}

export function serializeSessionCookie(token, { maxAgeMs }) {
  const parts = [
    `${SECURITY.SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
  ];

  if (config.isProduction) parts.push('Secure');

  return parts.join('; ');
}

/** Cookie já vencido: é assim que o logout apaga a sessão no navegador. */
export function serializeClearedSessionCookie() {
  const parts = [
    `${SECURITY.SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];

  if (config.isProduction) parts.push('Secure');

  return parts.join('; ');
}

/* ---- Consentimento de cookies (cookie próprio `todai_consent`, lido sem HttpOnly pelo navegador) ---- */

export const CONSENT_COOKIE = 'todai_consent';

/**
 * True só quando o cookie de consentimento existe, é JSON válido e diz
 * analytics=true. Qualquer outra coisa (ausente, malformado, false) é "não".
 */
export function analyticsConsented(cookieHeader) {
  const raw = parseCookies(cookieHeader)[CONSENT_COOKIE];
  if (typeof raw !== 'string' || !raw || raw.length > 400) return false;
  try {
    const data = JSON.parse(raw);
    return data !== null && typeof data === 'object' && data.analytics === true;
  } catch {
    return false;
  }
}

/* ---- Cookie de sessão do PORTAL da loja: um por loja (`oi_portal_<slug>`) ----
   Path restrito à API daquela loja: o navegador nem envia o cookie de uma loja
   para outra, e o servidor ainda confere a loja gravada na sessão. */

export const portalCookieName = (slug) => `${PORTAL.COOKIE_PREFIX}${slug}`;

const portalCookie = (slug, value, maxAgeSeconds) => {
  const parts = [
    `${portalCookieName(slug)}=${value}`,
    `Path=/api/portal/${slug}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (config.isProduction) parts.push('Secure');
  return parts.join('; ');
};

export function serializePortalCookie(slug, token, { maxAgeMs }) {
  return portalCookie(slug, encodeURIComponent(token), Math.floor(maxAgeMs / 1000));
}

export function serializeClearedPortalCookie(slug) {
  return portalCookie(slug, '', 0);
}
