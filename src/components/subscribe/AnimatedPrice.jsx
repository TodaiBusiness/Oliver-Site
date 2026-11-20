import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { formatBRL } from '../../../shared/plan.js';

/** Valor em reais que "rola" até o novo número; com movimento reduzido troca direto. */
export default function AnimatedPrice({ value, className }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    if (reduce || from.current === value) {
      from.current = value;
      setShown(value);
      return undefined;
    }
    const controls = animate(from.current, value, {
      duration: 0.55,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setShown(Math.round(latest)),
      onComplete: () => {
        from.current = value;
        setShown(value);
      },
    });
    return () => {
      from.current = value;
      controls.stop();
    };
  }, [value, reduce]);

  return (
    <span className={className}>
      <span aria-hidden="true">{formatBRL(shown)}</span>
      <span className="sub-sr">{formatBRL(value)}</span>
    </span>
  );
}
