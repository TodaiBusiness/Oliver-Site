import { useEffect, useId, useState } from 'react';
import { api } from '../api/client.js';

/**
 * Liga/desliga o aviso por e-mail quando a equipe responde.
 * API: GET/PATCH /api/me/notifications ({ notifyEmail: boolean }).
 *
 * Uso (líder, ao juntar com a tela de segurança — src/pages/SecuritySettings.jsx):
 *   import NotifyEmailToggle from '../components/NotifyEmailToggle.jsx';
 *   <NotifyEmailToggle />                 // com descrição, para a página de conta
 *   <NotifyEmailToggle compact />         // só o interruptor, para cabeçalhos
 */
export default function NotifyEmailToggle({ compact = false }) {
  const id = useId();
  const [ligado, setLigado] = useState(null); // null = carregando
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let ativo = true;
    api
      .get('/me/notifications')
      .then((r) => ativo && setLigado(Boolean(r.notifyEmail)))
      .catch(() => ativo && setLigado(null));
    return () => {
      ativo = false;
    };
  }, []);

  const alternar = async () => {
    if (ligado === null || salvando) return;
    const novo = !ligado;
    setLigado(novo); // otimista; volta se o servidor recusar
    setSalvando(true);
    setErro(null);
    try {
      const r = await api.patch('/me/notifications', { notifyEmail: novo });
      setLigado(Boolean(r.notifyEmail));
    } catch (problema) {
      setLigado(!novo);
      setErro(problema.message || 'Não foi possível salvar. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className={`notify-toggle${compact ? ' notify-toggle--compact' : ''}`}>
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={ligado === true}
        aria-describedby={`${id}-ajuda`}
        className="notify-toggle__switch"
        disabled={ligado === null || salvando}
        onClick={alternar}
      >
        <span className="notify-toggle__knob" aria-hidden="true" />
      </button>
      <label htmlFor={id} className="notify-toggle__label">
        Receber aviso por e-mail
      </label>
      <span id={`${id}-ajuda`} className={compact ? 'sr-only' : 'notify-toggle__help'}>
        Enviamos um e-mail curto, sem o texto da mensagem, quando a equipe da TODAI responde. No máximo um a cada 15 minutos por conversa.
      </span>
      {erro ? (
        <span className="notify-toggle__error" role="alert">
          {erro}
        </span>
      ) : null}
    </div>
  );
}
