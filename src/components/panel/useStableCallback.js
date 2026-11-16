import { useCallback, useRef } from 'react';

/** Função com identidade fixa que sempre chama a versão mais recente.
    `useDialog` reinicia o foco quando o `onClose` muda; sem isto, digitar num
    formulário dentro do diálogo devolveria o foco ao botão de fechar. */
export function useStableCallback(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args) => ref.current(...args), []);
}
