import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useConsent } from '../hooks/useConsent.js';

/** Áreas logadas: não são o site público e não entram na medição. */
/* /l = portal de pedidos das lojas: dado de consumidor, nunca entra na medição do site. */
const PRIVATE_PREFIXES = ['/l', '/admin', '/cliente', '/login', '/cadastro', '/esqueci-senha', '/redefinir-senha'];

function trackingRefused() {
  return (
    navigator.doNotTrack === '1' ||
    window.doNotTrack === '1' ||
    navigator.globalPrivacyControl === true
  );
}

/**
 * Conta a visualização de página (inclusive a navegação dentro do site, que
 * não recarrega), mas só depois de a pessoa aceitar as estatísticas na faixa
 * de cookies; ao revogar, para na hora. Não grava cookie nem localStorage e não
 * manda identificador: só o caminho e, na primeira página da visita, a origem e a campanha (utm_*).
 * País, cidade e aparelho o servidor deduz dos cabeçalhos da própria requisição.
 * Falha de rede é ignorada — medir nunca atrapalha quem navega.
 */
export default function PageTracker() {
  const { pathname } = useLocation();
  const first = useRef(true);
  const allowed = useConsent().consent?.analytics === true;

  useEffect(() => {
    const entry = first.current;
    first.current = false;

    if (!allowed) return;
    if (trackingRefused()) return;
    if (PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return;

    const payload = { path: pathname, entry };
    if (entry) {
      const params = new URLSearchParams(window.location.search);
      payload.referrer = document.referrer || '';
      payload.utmCampaign = params.get('utm_campaign') || '';
      payload.utmSource = params.get('utm_source') || '';
    }

    fetch('/api/analytics/collect', {
      method: 'POST',
      credentials: 'same-origin', // leva o cookie de consentimento, que o servidor confere
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).catch(() => {});
    // Só a rota e a permissão disparam a contagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, allowed]);

  return null;
}
