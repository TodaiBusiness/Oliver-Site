import { useEffect, useRef, useState } from 'react';
import { fetchSubscriptionQuote } from '../../api/subscribe.js';
import { monthlyPrice } from '../../../shared/plan.js';
import { nextDueDate } from '../../../shared/billing.js';

const DEBOUNCE_MS = 350;

const pad = (n) => String(n).padStart(2, '0');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Estimativa local, usada enquanto a cotação não chega (a tela nunca fica sem valor). */
function localEstimate(devices, billingDay) {
  const amount = monthlyPrice(devices);
  return {
    estimated: true, amount, firstChargeAmount: amount, firstChargeDate: today(),
    nextDueDate: nextDueDate(billingDay), billingDay,
  };
}

/**
 * Cotação para (computadores, dia). Com debounce; resposta de uma escolha
 * antiga é descartada. Devolve sempre um valor utilizável e `loading` para a
 * tela esmaecer os números em vez de trocá-los por um vazio.
 * Sem dia escolhido não consulta: devolve null.
 */
export default function useQuote(devices, billingDay) {
  const key = billingDay ? `${devices}:${billingDay}` : null;
  const [done, setDone] = useState(null); // { key, quote }
  const latest = useRef(null);

  useEffect(() => {
    latest.current = key;
    if (!key) return undefined;
    const timer = setTimeout(async () => {
      let quote;
      try {
        quote = await fetchSubscriptionQuote({ devices, billingDay });
      } catch {
        quote = localEstimate(devices, billingDay);
      }
      if (latest.current === key) setDone({ key, quote });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [key, devices, billingDay]);

  if (!key) return { quote: null, loading: false };
  if (done?.key === key) return { quote: done.quote, loading: false };
  return { quote: localEstimate(devices, billingDay), loading: true };
}
