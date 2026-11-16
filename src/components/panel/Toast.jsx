import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../Icon.jsx';
import PanelIcon from './PanelIcon.jsx';

const ToastContext = createContext(null);

let contador = 0;

/**
 * Avisos curtos de resultado de uma ação ("Status atualizado"), com ação
 * opcional ("Desfazer"). Fica numa região `aria-live` única, então leitores de
 * tela anunciam sem roubar o foco.
 *
 * toast.success(texto, { action: { label, onClick }, duration })
 * toast.error(texto, { action })
 */
export function ToastProvider({ children }) {
  const [itens, setItens] = useState([]);
  const timers = useRef(new Map());

  const fechar = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItens((atuais) => atuais.filter((item) => item.id !== id));
  }, []);

  const mostrar = useCallback(
    (tipo, texto, { action, duration } = {}) => {
      const id = ++contador;
      /* Com ação (desfazer) o aviso fica mais tempo; erro só sai se dispensado. */
      const tempo = duration ?? (tipo === 'error' ? 0 : action ? 8000 : 4500);
      setItens((atuais) => [...atuais.slice(-2), { id, tipo, texto, action }]);
      if (tempo) timers.current.set(id, setTimeout(() => fechar(id), tempo));
      return id;
    },
    [fechar]
  );

  useEffect(() => {
    const ativos = timers.current;
    return () => ativos.forEach(clearTimeout);
  }, []);

  const api = useMemo(
    () => ({
      success: (texto, opcoes) => mostrar('success', texto, opcoes),
      error: (texto, opcoes) => mostrar('error', texto, opcoes),
      dismiss: fechar,
    }),
    [mostrar, fechar]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="region" aria-label="Avisos" aria-live="polite">
        {itens.map((item) => (
          <div className={`toast-item toast-item--${item.tipo}`} key={item.id}>
            <span className="toast-item__icon" aria-hidden="true">
              {item.tipo === 'error' ? <PanelIcon name="alert" size={16} /> : <Icon name="check" size={16} />}
            </span>
            <span className="toast-item__text">{item.texto}</span>
            {item.action ? (
              <button
                type="button"
                className="toast-item__action"
                onClick={() => {
                  fechar(item.id);
                  item.action.onClick();
                }}
              >
                {item.action.label}
              </button>
            ) : null}
            <button
              type="button"
              className="toast-item__close"
              onClick={() => fechar(item.id)}
              aria-label="Dispensar aviso"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  /* Sem provedor (teste, uso isolado): não quebra, só não mostra. */
  return ctx ?? { success: () => 0, error: () => 0, dismiss: () => {} };
}
