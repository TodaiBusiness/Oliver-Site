import { useDialog } from '../../hooks/useDialog.js';
import { useStableCallback } from './useStableCallback.js';

/**
 * Confirmação antes de ação destrutiva.
 * Reaproveita o mesmo `useDialog` do modal de projeto: foco preso, Esc fecha
 * e o foco volta para quem abriu.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  onCancel,
}) {
  const { dialogRef, initialFocusRef } = useDialog(open, useStableCallback(onCancel));

  if (!open) return null;

  return (
    <div className="modal" role="presentation" onClick={onCancel}>
      <div
        className="confirm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
        ref={dialogRef}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="confirm__title" id="confirm-title">
          {title}
        </h2>
        <p className="confirm__message" id="confirm-message">
          {message}
        </p>

        <div className="confirm__actions">
          {/* O foco começa em "Cancelar": a saída segura é o padrão. */}
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onCancel}
            ref={initialFocusRef}
          >
            {cancelLabel}
          </button>
          <button type="button" className="btn btn--danger btn--sm" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
