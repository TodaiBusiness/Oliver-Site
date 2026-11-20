import { api, withQuery } from './client.js';

/** Cotação da assinatura: cobrado hoje e próximo vencimento (pode vir estimada). */
export const fetchSubscriptionQuote = ({ devices, billingDay }) =>
  api.get(withQuery('/subscribe/quote', { devices, billingDay }));
