/* Formatação e rótulos do portal (pt-BR). */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const QTY = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

export const brl = (value) => (Number.isFinite(value) ? BRL.format(value) : '—');
export const qty = (value) => QTY.format(value);

/** `2026-11-18` ou ISO completo → "18/11/2026". */
export function formatDate(value) {
  if (!value) return '';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR');
}

/** ISO → "18/11/2026 às 09:30". */
export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.toLocaleDateString('pt-BR')} às ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

export const ESTADOS = {
  recebido: { label: 'Recebido', tone: 'info', hint: 'A loja já recebeu o pedido e vai confirmar em breve.' },
  aceito: { label: 'Aceito', tone: 'ok', hint: 'A loja aceitou o pedido.' },
  em_preparo: { label: 'Em preparo', tone: 'ok', hint: 'A loja está separando o seu pedido.' },
  pronto: { label: 'Pronto', tone: 'ok', hint: 'Pedido pronto para retirada ou entrega.' },
  entregue: { label: 'Entregue', tone: 'ok', hint: 'Pedido concluído.' },
  recusado: { label: 'Recusado', tone: 'danger', hint: 'A loja não pôde atender este pedido.' },
  cancelado: { label: 'Cancelado', tone: 'warn', hint: 'Pedido cancelado.' },
};

export const ESTADOS_FINAIS = new Set(['entregue', 'recusado', 'cancelado']);
export const ETAPAS = ['recebido', 'aceito', 'em_preparo', 'pronto', 'entregue'];

export const estadoInfo = (estado) => ESTADOS[estado] ?? { label: estado || 'Em andamento', tone: 'info', hint: '' };

export const PAGAMENTOS = {
  na_entrega: 'Pagar na entrega',
  na_retirada: 'Pagar na retirada',
  fiado: 'Fiado (sujeito à autorização da loja)',
};

export const TABELAS = { varejo: 'Varejo', atacado: 'Atacado', revenda: 'Revenda' };

export const FAIXAS_PADRAO = ['Manhã (8h às 12h)', 'Tarde (12h às 18h)', 'Fim da tarde (18h às 20h)'];

/** Horários da loja: aceita lista de textos ou mapa dia → texto; devolve linhas para exibir. */
export function horariosEmLinhas(horarios) {
  if (!horarios) return [];
  if (typeof horarios === 'string') return [horarios];
  if (Array.isArray(horarios)) {
    return horarios
      .map((h) => (typeof h === 'string' ? h : h && typeof h === 'object' ? [h.dia, h.texto ?? [h.abre, h.fecha].filter(Boolean).join(' às ')].filter(Boolean).join(': ') : ''))
      .filter(Boolean);
  }
  if (typeof horarios === 'object') {
    return Object.entries(horarios)
      .filter(([k, v]) => k !== 'faixas' && typeof v === 'string')
      .map(([dia, texto]) => `${dia}: ${texto}`);
  }
  return [];
}

export function faixasDaLoja(horarios) {
  const faixas = horarios && !Array.isArray(horarios) && Array.isArray(horarios.faixas) ? horarios.faixas : null;
  const lista = (faixas ?? []).filter((f) => typeof f === 'string' && f.trim()).map((f) => f.trim().slice(0, 40));
  return lista.length ? lista : FAIXAS_PADRAO;
}

/** Quantidade no passo do múltiplo, sem sobra de ponto flutuante. */
export function snapQty(value, multiplo = 1) {
  const step = multiplo > 0 ? multiplo : 1;
  const n = Math.round(value / step);
  return Math.round(n * step * 1000) / 1000;
}

export const isoToday = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
