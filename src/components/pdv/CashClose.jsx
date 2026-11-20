import { useId, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { CASH_OPENING, CASH_SALES } from '../../data/pdv.js';
import { brl, cashDifference, parseCents, shares } from './pdvLogic.js';
import useCountUp from './useCountUp.js';

/** Fechamento de caixa: vendas por forma de pagamento e conferência do dinheiro. */
export default function CashClose() {
  const reduce = useReducedMotion();
  const uid = useId();
  const [counted, setCounted] = useState('');

  const rows = shares(CASH_SALES);
  const expected = CASH_OPENING + CASH_SALES[0].value;
  const hasValue = counted.trim() !== '';
  const { diff, status } = cashDifference(expected, parseCents(counted));
  const shownDiff = useCountUp(Math.abs(diff), reduce);

  return (
    <div className="pdv-demo pdv-cash">
      <ul className="pdv-bars" aria-label="Vendas por forma de pagamento">
        {rows.map((r) => (
          <li key={r.id} className="pdv-bar">
            <div className="pdv-bar__row">
              <span>{r.label}</span>
              <span className="pdv-bar__val">{brl(r.value)} <b>{r.pct}%</b></span>
            </div>
            <div className="pdv-bar__track" aria-hidden="true">
              <motion.div
                className="pdv-bar__fill"
                initial={reduce ? { width: `${r.pct}%` } : { width: 0 }}
                whileInView={{ width: `${r.pct}%` }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </li>
        ))}
      </ul>

      <div className="pdv-count">
        <p className="pdv-count__exp">
          Dinheiro esperado na gaveta <strong>{brl(expected)}</strong>
          <span> (saldo inicial {brl(CASH_OPENING)} + vendas em dinheiro)</span>
        </p>
        <label htmlFor={`${uid}-c`}>Dinheiro contado</label>
        <input
          id={`${uid}-c`}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={counted}
          onChange={(e) => setCounted(e.target.value)}
        />
        <p className="pdv-count__res" role="status" aria-live="polite">
          {!hasValue ? (
            'Conte a gaveta e digite o valor.'
          ) : status === 'exato' ? (
            <strong className="is-ok">Caixa batendo</strong>
          ) : status === 'sobra' ? (
            <>Sobra <strong className="is-ok">{brl(shownDiff)}</strong></>
          ) : (
            <>Falta <strong className="is-bad">{brl(shownDiff)}</strong></>
          )}
        </p>
      </div>
    </div>
  );
}
