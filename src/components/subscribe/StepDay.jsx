import { motion, useReducedMotion } from 'motion/react';
import { BILLING_DAYS, formatDueDate, isShortMonthDue, nextDueDate } from '../../../shared/billing.js';
import MiniCalendar from './MiniCalendar.jsx';

export default function StepDay({ billingDay, onChange, error }) {
  const reduce = useReducedMotion();
  const due = billingDay ? nextDueDate(billingDay) : null;
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
            <p className="sub-day__due">
              Primeiro vencimento: <strong>{formatDueDate(due)}</strong>
              {short ? ' (último dia do mês)' : ''}
            </p>
          </>
        ) : (
          <p className="sub-day__hint">Escolha um dia para ver o primeiro vencimento no calendário.</p>
        )}
        <p className="sub-day__note">Em meses curtos, cobramos no último dia do mês.</p>
      </div>
    </div>
  );
}
