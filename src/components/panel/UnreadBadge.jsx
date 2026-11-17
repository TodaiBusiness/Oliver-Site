import { useEffect, useRef, useState } from 'react';
import { api } from '../../api/client.js';
import { useAuth } from '../../app/AuthContext.jsx';
import { useEventStream } from '../../hooks/useEventStream.js';
import { debounce, intervaloDePolling } from '../../hooks/eventStreamCore.js';

/* Confere de tempos em tempos para o menu não ficar desatualizado. */
const INTERVALO = { rapido: 60_000, lento: 240_000 };

/**
 * Bolinha com o número de mensagens não lidas no item "Mensagens" do menu.
 * Busca só o número (`/conversations/unread`), não a lista inteira.
 */
export default function UnreadBadge() {
  const { isAdmin } = useAuth();
  const [total, setTotal] = useState(0);
  const buscarRef = useRef(null);
  const agendar = useRef(null);
  agendar.current ??= debounce(() => buscarRef.current?.(), 300);

  /* Tempo real: chegou ou foi lida uma mensagem → o número atualiza na hora. */
  const status = useEventStream({
    enabled: !isAdmin, // o stream é só do dono (cliente)
    onMessage: () => agendar.current(),
    onRead: () => agendar.current(),
    onResync: () => agendar.current(),
  });

  useEffect(() => {
    let ativo = true;

    const buscar = async () => {
      try {
        const { unread } = await api.get('/conversations/unread');
        if (ativo) setTotal(unread);
      } catch {
        /* Falha aqui é irrelevante: o indicador some, o menu continua. */
      }
    };

    buscarRef.current = buscar;
    buscar();
    const timer = setInterval(buscar, intervaloDePolling(status, INTERVALO));

    /* Ao enviar/ler mensagem, a conversa avisa e o número atualiza na hora. */
    window.addEventListener('mensagens:mudou', buscar);

    return () => {
      ativo = false;
      clearInterval(timer);
      window.removeEventListener('mensagens:mudou', buscar);
    };
  }, [status]);

  if (!total) return null;

  return (
    <span className="nav-badge" aria-label={`${total} não lidas`}>
      {total > 99 ? '99+' : total}
    </span>
  );
}
