/* =========================================================================
   Consentimento de cookies (LGPD).
   -------------------------------------------------------------------------
   A escolha fica no cookie próprio `todai_consent`, sem nenhum dado pessoal:
     {"v":1,"necessary":true,"analytics":false,"ts":1760000000000}
   · v        versão da política. Se a política mudar e este número subir,
              a faixa volta a perguntar.
   · necessary sempre true (sessão, tema e consentimento não se desligam).
   · analytics só true quando a pessoa aceitou a contagem de visitas.
   O servidor lê o mesmo cookie (server/http/cookies.js) e ignora a coleta de
   visitas sem ele. Leitura segura: qualquer coisa fora do formato é "sem
   consentimento", e a faixa pergunta de novo.
   ========================================================================= */

export const CONSENT_COOKIE = 'todai_consent';
export const CONSENT_VERSION = 1;
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 12 meses

/** Lê um valor já decodificado do cookie e devolve a escolha, ou null se inválida. */
export function parseConsent(raw, version = CONSENT_VERSION) {
  if (typeof raw !== 'string' || !raw || raw.length > 400) return null;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  if (data.v !== version) return null;
  if (typeof data.analytics !== 'boolean') return null;
  return {
    v: data.v,
    necessary: true,
    analytics: data.analytics,
    ts: Number.isFinite(data.ts) ? data.ts : 0,
  };
}

export function serializeConsent({ analytics }, now = Date.now()) {
  return JSON.stringify({
    v: CONSENT_VERSION,
    necessary: true,
    analytics: analytics === true,
    ts: now,
  });
}

function readCookieValue(name, cookieString) {
  for (const part of cookieString.split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    if (part.slice(0, index).trim() !== name) continue;
    const value = part.slice(index + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return null;
}

/** Escolha guardada no navegador, ou null quando não há (ou não vale mais). */
export function readConsent(cookieString = globalThis.document?.cookie ?? '') {
  try {
    return parseConsent(readCookieValue(CONSENT_COOKIE, cookieString));
  } catch {
    return null;
  }
}

function writeCookie(value, maxAge) {
  const secure = globalThis.location?.protocol === 'https:' ? '; Secure' : '';
  document.cookie =
    `${CONSENT_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

/* ---- Estado em memória, para a faixa, o painel e o rastreador reagirem juntos ---- */

const listeners = new Set();
let state = { consent: null, panelOpen: false, ready: false };

function emit(next) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function subscribeConsent(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getConsentState() {
  if (!state.ready && typeof document !== 'undefined') {
    state = { ...state, consent: readConsent(), ready: true };
  }
  return state;
}

/** Guarda a escolha e avisa quem estiver ouvindo (o rastreador para na hora). */
export function saveConsent({ analytics }) {
  const value = serializeConsent({ analytics });
  try {
    writeCookie(value, MAX_AGE_SECONDS);
  } catch {
    /* Cookies bloqueados: a escolha vale só nesta página. */
  }
  emit({ consent: parseConsent(value), panelOpen: false, ready: true });
}

export const acceptAll = () => saveConsent({ analytics: true });
export const acceptNecessaryOnly = () => saveConsent({ analytics: false });

export function openConsentPreferences() {
  getConsentState();
  emit({ panelOpen: true });
}

export function closeConsentPreferences() {
  emit({ panelOpen: false });
}

/** True só quando a pessoa aceitou as estatísticas. */
export function analyticsAllowed() {
  return getConsentState().consent?.analytics === true;
}
