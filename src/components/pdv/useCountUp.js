import { useEffect, useRef, useState } from 'react';
import { animate } from 'motion/react';

/** Número que "conta" até o novo valor. Sem animação quando reduce é verdadeiro. */
export default function useCountUp(target, reduce, duration = 0.45) {
  const [value, setValue] = useState(target);
  const from = useRef(target);

  useEffect(() => {
    if (reduce) {
      from.current = target;
      setValue(target);
      return undefined;
    }
    const controls = animate(from.current, target, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        from.current = v;
        setValue(Math.round(v));
      },
    });
    return () => controls.stop();
  }, [target, reduce, duration]);

  return value;
}
