/* Rótulos legíveis para os status guardados no banco. */

const LABELS = {
  NOVO: 'Novo',
  EM_ANALISE: 'Em análise',
  ORCAMENTO: 'Orçamento',
  EM_DESENVOLVIMENTO: 'Em desenvolvimento',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
  RASCUNHO: 'Rascunho',
  ENTREGUE: 'Entregue',
};

/** Cor por família de status — azul (acento) só para o que é progresso real. */
const TONES = {
  NOVO: 'info',
  EM_ANALISE: 'info',
  ORCAMENTO: 'warn',
  EM_DESENVOLVIMENTO: 'accent',
  CONCLUIDO: 'accent',
  ENTREGUE: 'accent',
  CANCELADO: 'muted',
  RASCUNHO: 'muted',
};

export function statusLabel(status) {
  return LABELS[status] ?? status;
}

export default function StatusBadge({ status }) {
  return (
    <span className={`status status--${TONES[status] ?? 'muted'}`}>
      <span className="status__dot" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
}
