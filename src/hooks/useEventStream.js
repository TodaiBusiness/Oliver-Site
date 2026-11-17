import { useEffect, useRef, useState } from 'react';
import { createEventStream } from './eventStreamCore.js';

/* Uma conexão por aba, criada na primeira vez que alguém escuta. */
let compartilhado = null;
const stream = () => (compartilhado ??= createEventStream());

/**
 * Escuta o tempo real do chat (GET /api/events).
 *
 *   const status = useEventStream({ onMessage, onRead, onResync });
 *
 * · onMessage({ requestId, id }) — mensagem nova numa conversa do usuário;
 * · onRead({ requestId, by })    — mensagens lidas ('client' ou 'team');
 * · onResync()                   — reconectou/voltou à aba: recarregue.
 * Devolve o estado ('conectado', 'reconectando', 'polling', 'pausado',
 * 'conectando'). Sem EventSource ou com o stream indisponível o estado é
 * 'polling' e o chamador mantém o polling que já tinha.
 *
 * Os callbacks ficam em ref: trocá-los não reabre nada.
 */
export function useEventStream({ onMessage, onRead, onResync, enabled = true } = {}) {
  const [status, setStatus] = useState(() => (enabled ? stream().status : 'polling'));
  const refs = useRef({});
  refs.current = { onMessage, onRead, onResync };

  useEffect(() => {
    if (!enabled) return undefined;
    return stream().subscribe({
      onMessage: (d) => refs.current.onMessage?.(d),
      onRead: (d) => refs.current.onRead?.(d),
      onResync: () => refs.current.onResync?.(),
      onStatus: setStatus,
    });
  }, [enabled]);

  return status;
}
