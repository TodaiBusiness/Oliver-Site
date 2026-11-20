import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

const WEEK = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Calendário do mês do vencimento ('YYYY-MM-DD'), com o dia marcado. */
export default function MiniCalendar({ dueDate }) {
  const reduce = useReducedMotion();
  const [year, month, day] = dueDate.split('-').map(Number);
  const first = new Date(year, month - 1, 1).getDay();
  const total = new Date(year, month, 0).getDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  const key = `${year}-${month}`;

  return (
    <div className="sub-cal">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={key}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: reduce ? 0 : 0.22 }}
        >
          <p className="sub-cal__title">
            {MONTHS[month - 1]} de {year}
          </p>
          <div className="sub-cal__grid" role="img" aria-label={`Vencimento em ${day} de ${MONTHS[month - 1]} de ${year}`}>
            {WEEK.map((w) => (
              <span key={w} className="sub-cal__week" aria-hidden="true">
                {w}
              </span>
            ))}
            {cells.map((n, i) =>
              n === null ? (
                <span key={`v${i}`} aria-hidden="true" />
              ) : (
                <span key={n} className={`sub-cal__day${n === day ? ' is-due' : ''}`} aria-hidden="true">
                  {n === day ? (
                    <motion.span
                      layoutId="sub-due-marker"
                      className="sub-cal__marker"
                      transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 30 }}
                    />
                  ) : null}
                  <span className="sub-cal__num">{n}</span>
                </span>
              )
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
