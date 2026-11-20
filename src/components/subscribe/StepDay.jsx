import { motion, useReducedMotion } from 'motion/react';
import { BILLING_DAYS, formatDueDate, isShortMonthDue, nextDueDate } from '../../../shared/billing.js';
import { formatBRL } from '../../../shared/plan.js';
import MiniCalendar from './MiniCalendar.jsx';

export default function StepDay({ billingDay, onChange, error, total, quote, quoting }) {
  const reduce = useReducedMotion();
  const due = billingDay ? (quote?.nextDueDate ?? nextDueDate(billingDay)) : null;
  const charged = quote?.firstChargeAmount ?? total;
  const short = due ? isShortMonthDue(billingDay, due) : false;

  return (
    <div className="sub-day">
      <fieldset className="sub-day__fieldset">
        <legend className="sub-legend">Dia do vencimento</legend>
        <div className="sub-day__cards">
          {BILLING_DAYS.map((day) => {
            const selected = billingDay === day;
            return (
              <label key={day} className={`sub-day__card${selected ? ' is-selected' : ''}`}>
                <input
                  type="radio"
                  name="billingDay"
                  value={day}
                  checked={selected}
                  onChange={() => onChange(day)}
                  className="sub-day__input"
                />
                {selected ? (
                  <motion.span
                    layoutId="sub-day-ring"
                    className="sub-day__ring"
                    transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 32 }}
                  />
                ) : null}
                <span className="sub-day__label">Todo dia</span>
                <span className="sub-day__num">{day}</span>
                <span className="sub-day__next">próximo: {formatDueDate(nextDueDate(day))}</span>
              </label>
            );
          })}
        </div>
        {error ? <p className="field__error" role="alert">{error}</p> : null}
      </fieldset>

      <div className="sub-day__preview" aria-live="polite">
        {due ? (
          <>
            <MiniCalendar dueDate={due} />
            <p className={`sub-day__due${quoting ? ' is-loading' : ''}`} aria-busy={quoting}>
              Cobramos hoje a primeira mensalidade ({formatBRL(charged)}) e depois todo dia {billingDay}.
              {' '}Próximo vencimento: <strong>{formatDueDate(due)}</strong>
              {short ? ' (último dia do mês)' : ''}.
              <span className="sub-est">{!quoting && quote?.estimated ? 'valor estimado' : ''}</span>
            </p>
          </>
        ) : (
          <p className="sub-day__hint">Escolha o dia das próximas mensalidades para ver o vencimento no calendário.</p>
        )}
        <p className="sub-day__note">Em meses curtos, cobramos no último dia do mês.</p>
      </div>
    </div>
  );
}
