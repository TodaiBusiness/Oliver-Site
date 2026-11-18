/* =========================================================================
   Aviso ao admin de que há cadastro novo aguardando autorização.
   -------------------------------------------------------------------------
   O site só AVISA a API de licenciamento (que manda o e-mail ao suporte);
   quem decide é o admin, no Panel. Melhor esforço: timeout curto, nunca
   bloqueia nem derruba o cadastro. Falha vira auditoria
   (CADASTRO_AVISO_ADMIN_FALHOU), sem e-mail nem texto de erro do provedor.
   Sem LICENSING_API_BASE_URL/SITE_SERVICE_API_KEY o aviso não existe e o
   cadastro segue normalmente.
   ========================================================================= */

import { config } from '../config.js';

const DEFAULT_TIMEOUT_MS = 8000;

export function registrationAlertService({
  fetchImpl = fetch,
  licensing = config.licensing,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  const configured = Boolean(licensing.baseUrl && licensing.serviceKey);
  const inFlight = new Set();

  async function deliver(payload) {
    const url = new URL(
      'api/v1/site/client-registrations',
      licensing.baseUrl.endsWith('/') ? licensing.baseUrl : `${licensing.baseUrl}/`
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Service-Key': licensing.serviceKey },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) return { ok: false, reason: `http_${response.status}` };
      return { ok: true };
    } catch (cause) {
      return { ok: false, reason: cause?.name === 'AbortError' ? 'timeout' : 'rede' };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    configured,

    /**
     * Dispara sem esperar. `onFailure(reason)` é chamado (e engolido se lançar)
     * quando a entrega falha.
     */
    notify(payload, onFailure = () => {}) {
      if (!configured) return;
      const job = deliver(payload)
        .then((result) => (result.ok ? undefined : onFailure(result.reason)))
        .catch(() => {})
        .finally(() => inFlight.delete(job));
      inFlight.add(job);
    },

    /** Para testes: espera os avisos em andamento. */
    async idle() {
      while (inFlight.size) await Promise.allSettled([...inFlight]);
    },
  };
}
