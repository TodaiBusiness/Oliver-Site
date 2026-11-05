/* =========================================================================
   Configurações centralizadas.
   -------------------------------------------------------------------------
   Checklist — "Manutenção": nada de número fixo espalhado pelo código nem
   string mágica repetida. Tudo que é ajuste de comportamento mora aqui.
   ========================================================================= */

/** Rolagem (px) a partir da qual o header ganha fundo e borda. */
export const HEADER_SCROLL_OFFSET = 24;

/** Rolagem (px) a partir da qual o botão flutuante de WhatsApp aparece. */
export const FLOATING_WA_OFFSET = 600;

/**
 * Largura a partir da qual o menu desktop assume.
 * ⚠️ Precisa acompanhar o `@media (max-width: 900px)` em `sections.css`.
 */
export const DESKTOP_BREAKPOINT = 901;
export const DESKTOP_MEDIA_QUERY = `(min-width: ${DESKTOP_BREAKPOINT}px)`;

/** Chave do funil no sessionStorage. */
export const FUNNEL_STORAGE_KEY = 'todai:funil';

/** Protocolos aceitos em links vindos de dados (ver `safeUrl`). */
export const ALLOWED_URL_PROTOCOLS = ['http:', 'https:', 'mailto:'];

/** Seletor dos elementos focáveis dentro de um diálogo. */
export const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
