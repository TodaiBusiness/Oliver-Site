import { useEffect, useState } from 'react';
import Icon from '../Icon.jsx';
import { useDialog } from '../../hooks/useDialog.js';
import { useStableCallback } from './useStableCallback.js';

/**
 * Painel lateral modal (formulários longos que não merecem uma página).
 * Foco preso e devolvido, Esc fecha, rolagem do fundo travada — tudo vindo de
 * `useDialog`. A animação só roda ao abrir/fechar (resposta à ação).
 */
export default function Drawer({ open, title, description, onClose, children, footer, titleId = 'drawer-title' }) {
  const { dialogRef, initialFocusRef } = useDialog(open, useStableCallback(onClose));
  const [montado, setMontado] = useState(open);

  useEffect(() => {
    if (open) setMontado(true);
  }, [open]);

  if (!open && !montado) return null;

  return (
    <div
      className={`drawer${open ? ' is-open' : ' is-closing'}`}
      role="presentation"
      onAnimationEnd={() => {
        if (!open) setMontado(false);
      }}
    >
      <div className="drawer__scrim" onClick={onClose} aria-hidden="true" />
      <div
        className="drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? `${titleId}-desc` : undefined}
        ref={dialogRef}
      >
        <header className="drawer__head">
          <div>
            <h2 className="drawer__title" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="drawer__desc" id={`${titleId}-desc`}>
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn--soft btn--icon btn--xs"
            onClick={onClose}
            aria-label="Fechar"
            ref={initialFocusRef}
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="drawer__body">{children}</div>
        {footer ? <footer className="drawer__foot">{footer}</footer> : null}
      </div>
    </div>
  );
}
