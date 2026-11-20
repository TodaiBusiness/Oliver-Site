import { PLAN, formatBRL } from '../../../shared/plan.js';
import { BRAND_LABEL, cardBrand, formatDueDate, nextDueDate } from '../../../shared/billing.js';
import AnimatedPrice from './AnimatedPrice.jsx';

export default function Summary({ total, devices, billingDay, number }) {
  const extra = Math.max(0, devices - PLAN.includedDevices);
  const due = billingDay ? formatDueDate(nextDueDate(billingDay)) : 'a escolher';
  const brand = cardBrand(number);
  const last4 = number.length >= 4 ? number.slice(-4) : null;

  return (
    <aside className="sub-summary" aria-label="Resumo da assinatura">
      <p className="sub-summary__plan">{PLAN.name}</p>
      <p className="sub-summary__price">
        <AnimatedPrice value={total} className="sub-summary__value" />
        <span>por mês</span>
      </p>
      <dl className="sub-summary__list">
        <div><dt>Plano base (1 computador)</dt><dd>{formatBRL(PLAN.basePrice)}</dd></div>
        <div><dt>{extra} {extra === 1 ? 'computador extra' : 'computadores extras'}</dt><dd>{formatBRL(extra * PLAN.extraDevicePrice)}</dd></div>
        <div><dt>Vencimento</dt><dd>{billingDay ? `dia ${billingDay}` : 'a escolher'}</dd></div>
        <div><dt>Primeiro vencimento</dt><dd>{due}</dd></div>
        {last4 ? <div><dt>{brand ? BRAND_LABEL[brand] : 'Cartão'}</dt><dd>final {last4}</dd></div> : null}
      </dl>
      <p className="sub-summary__legal">
        Cobrança mensal recorrente no cartão. O valor final é calculado pelo servidor na hora da cobrança.
      </p>
    </aside>
  );
}
