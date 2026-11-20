/* =========================================================================
   Cotação da assinatura (GET /api/subscribe/quote).
   -------------------------------------------------------------------------
   Pergunta à API de licenciamento quanto será cobrado hoje e qual o próximo
   vencimento para N computadores e o dia escolhido. Se a API falhar, estiver
   desligada ou responder algo estranho, devolve a ESTIMATIVA local
   ({estimated:true}), nunca um erro: a tela precisa sempre mostrar um valor.
   Não recebe nem devolve dado de cartão.
   ========================================================================= */

import { config } from '../config.js';
import { badRequest, tooManyRequests } from '../http/errors.js';
import { createRateLimiter } from '../http/rateLimit.js';
import { monthlyPrice, PLAN } from '../../shared/plan.js';
import { BILLING_DAYS, nextDueDate } from '../../shared/billing.js';

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const TIMEOUT_MS = 4000;
const CACHE_OK_MS = 30 * 1000;
/* Falha também fica em cache (curto), para a API fora do ar não segurar cada pedido por 4 s. */
const CACHE_FALLBACK_MS = 10 * 1000;
const CACHE_MAX_ENTRIES = PLAN.maxDevices * BILLING_DAYS.length;

const pad = (n) => String(n).padStart(2, '0');
const isoDay = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const DATE = /^\d{4}-\d{2}-\d{2}/;

export function subscribeQuoteService({
  fetchImpl = fetch,
  licensing = config.licensing,
  now = () => new Date(),
} = {}) {
  const limiter = createRateLimiter({ max: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS });
  const configured = Boolean(licensing.baseUrl && licensing.serviceKey);
  const cache = new Map();

  function estimate(devices, billingDay) {
    const today = now();
    const amount = monthlyPrice(devices);
    return {
      estimated: true,
      amount,
      firstChargeAmount: amount,
      firstChargeDate: isoDay(today),
      nextDueDate: nextDueDate(billingDay, today),
      billingDay,
    };
  }

  async function fetchQuote(devices, billingDay) {
    const url = new URL(
      'api/v1/site/subscription/quote',
      licensing.baseUrl.endsWith('/') ? licensing.baseUrl : `${licensing.baseUrl}/`
    );
    url.searchParams.set('devices', String(devices));
    url.searchParams.set('billingDay', String(billingDay));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        method: 'GET',
        headers: { 'X-Service-Key': licensing.serviceKey },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const body = JSON.parse(await response.text());
      const amount = Number(body?.amount);
      const first = Number(body?.firstChargeAmount ?? body?.amount);
      if (
        !Number.isFinite(amount) || amount < 0 ||
        !Number.isFinite(first) || first < 0 ||
        !DATE.test(String(body.nextDueDate)) ||
        !BILLING_DAYS.includes(Number(body.billingDay))
      ) {
        return null;
      }
      return {
        estimated: false,
        amount,
        firstChargeAmount: first,
        firstChargeDate: DATE.test(String(body.firstChargeDate)) ? String(body.firstChargeDate).slice(0, 10) : isoDay(now()),
        nextDueDate: String(body.nextDueDate).slice(0, 10),
        billingDay: Number(body.billingDay),
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function quote(input, { clientKey = 'desconhecido' } = {}) {
    const devices = Number(input.devices);
    const billingDay = Number(input.billingDay);
    const errors = {};
    if (!Number.isInteger(devices) || devices < 1 || devices > PLAN.maxDevices) {
      errors.devices = `Escolha de 1 a ${PLAN.maxDevices} computadores.`;
    }
    if (!BILLING_DAYS.includes(billingDay)) errors.billingDay = 'Escolha o dia 15, 20 ou 30.';
    if (Object.keys(errors).length) throw badRequest('Confira os campos.', errors);

    if (!limiter.hit(clientKey)) throw tooManyRequests('Muitas consultas seguidas. Aguarde um instante.', 30);

    const key = `${devices}:${billingDay}`;
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;

    let value = configured ? await fetchQuote(devices, billingDay) : null;
    let ttl = CACHE_OK_MS;
    if (!value) {
      value = estimate(devices, billingDay);
      ttl = CACHE_FALLBACK_MS;
    }

    if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value);
    cache.set(key, { value, expiresAt: Date.now() + ttl });
    return value;
  }

  return { quote };
}
