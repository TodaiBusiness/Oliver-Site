import { useId, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { STOCK_PRODUCTS } from '../../data/pdv.js';
import { stockAfterSales } from './pdvLogic.js';

/** Estoque: quanto mais se vende, mais perto do mínimo. Passou do mínimo, marca crítico e sugere repor. */
export default function StockRisk() {
  const reduce = useReducedMotion();
  const uid = useId();
  const [sold, setSold] = useState(0);

  const rows = STOCK_PRODUCTS.map((p) => ({ p, ...stockAfterSales(p, Math.min(sold, p.stock)) }));
  const criticos = rows.filter((r) => r.critico).length;
  const maxStock = Math.max(...STOCK_PRODUCTS.map((p) => p.stock));

  return (
    <div className="pdv-demo pdv-stock">
      <div className="pdv-stock__ctl">
        <label htmlFor={`${uid}-s`}>
          Vendidos hoje, por produto <strong>{sold}</strong>
        </label>
        <input
          id={`${uid}-s`}
          type="range"
          min="0"
          max="30"
          step="1"
          value={sold}
          onChange={(e) => setSold(Number(e.target.value))}
        />
        <p className="pdv-stock__sum" role="status" aria-live="polite">
          {criticos === 0 ? 'Nenhum produto crítico.' : `${criticos} ${criticos === 1 ? 'produto crítico' : 'produtos críticos'}.`}
        </p>
      </div>

      <ul className="pdv-stock__list">
        {rows.map(({ p, atual, critico, repor }) => (
          <li key={p.id} className={`pdv-sk${critico ? ' is-crit' : ''}`}>
            <div className="pdv-sk__row">
              <span className="pdv-sk__name">{p.name}</span>
              <span className="pdv-sk__qty">
                {atual} <small>/ mín. {p.min}</small>
              </span>
            </div>
            <div
              className="pdv-sk__track"
              role="img"
              aria-label={`${p.name}: ${atual} em estoque, mínimo ${p.min}${critico ? ', crítico' : ''}`}
            >
              <motion.div
                className="pdv-sk__fill"
                initial={false}
                animate={{ width: `${(atual / maxStock) * 100}%` }}
                transition={{ duration: reduce ? 0 : 0.3, ease: [0.22, 1, 0.36, 1] }}
              />
              <span className="pdv-sk__min" style={{ left: `${(p.min / maxStock) * 100}%` }} aria-hidden="true" />
            </div>
            <p className="pdv-sk__note" aria-hidden={!critico}>
              {critico ? `Crítico. Sugestão: repor ${repor} un.` : ' '}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
