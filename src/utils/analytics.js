/* =========================================================================
   Camada de eventos — preparada para analytics, sem instalar nada.
   -------------------------------------------------------------------------
   Nenhuma biblioteca é carregada e nenhum dado sai do navegador (e, mesmo plugado, só com o aceite das estatísticas). A função
   apenas empurra o evento para `window.dataLayer` SE algum dia você plugar
   Google Tag Manager / GA4 / Plausible. Enquanto isso, é um no-op silencioso.

   Para ativar depois, basta incluir a tag do seu provedor no index.html.
   ========================================================================= */

import { analyticsAllowed } from './consent.js';

/** Nomes dos eventos disparados pelo site (mantidos em um só lugar). */
export const EVENTS = {
  HERO_CTA_CLICK: 'hero_cta_click',
  SOLUTION_SELECTED: 'solution_selected',
  PROJECT_VIEWED: 'project_viewed',
  FUNNEL_STARTED: 'funnel_started',
  FUNNEL_STEP_COMPLETED: 'funnel_step_completed',
  WHATSAPP_CLICKED: 'whatsapp_clicked',
  QUOTE_REQUEST_SENT: 'quote_request_sent',
};

export function track(event, payload = {}) {
  if (typeof window === 'undefined') return;
  /* Sem aceite das estatísticas, nada é empurrado para provedor algum. */
  if (!analyticsAllowed()) return;

  const data = { event, ...payload };

  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push(data);
  }

  if (import.meta.env.DEV) {
    console.debug('[analytics]', event, payload);
  }
}
