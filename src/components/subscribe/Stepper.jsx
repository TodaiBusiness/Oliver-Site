import { motion, useReducedMotion } from 'motion/react';
import Icon from '../Icon.jsx';

export const STEPS = ['Empresa', 'Vencimento', 'Cartão'];

/** Indicador das três etapas; só volta para etapas já feitas. */
export default function Stepper({ current, onGo }) {
  const reduce = useReducedMotion();
  return (
    <ol className="sub-steps" aria-label="Etapas da assinatura">
      {STEPS.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className={`sub-steps__item${done ? ' is-done' : ''}${active ? ' is-current' : ''}`}>
            <button
              type="button"
              className="sub-steps__btn"
              disabled={!done}
              onClick={() => onGo(index)}
              aria-current={active ? 'step' : undefined}
            >
              <span className="sub-steps__dot">
                {done ? <Icon name="check" size={13} /> : index + 1}
              </span>
              <span className="sub-steps__label">{label}</span>
            </button>
            <span className="sub-steps__bar" aria-hidden="true">
              <motion.span
                className="sub-steps__fill"
                initial={false}
                animate={{ scaleX: done ? 1 : 0 }}
                transition={reduce ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
