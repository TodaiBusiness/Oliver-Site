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

/*
  Nomes que a loja deu aos estados (Configuração de Operação do PDV, ex.: "No forno"), vindos da vitrine. Só troca o rótulo: o tom e a dica
  continuam os de fábrica. Sem nomes (loja ou servidor antigo), vale o de fábrica.
*/
let nomesDaLoja = null;
export function definirNomesEstados(nomes) {
  nomesDaLoja = nomes && typeof nomes === 'object' ? nomes : null;
}

export const estadoInfo = (estado, nomeDoPedido = null) => {
  const base = ESTADOS[estado] ?? { label: estado || 'Em andamento', tone: 'info', hint: '' };
  const nome = nomeDoPedido || nomesDaLoja?.[estado];
  return nome ? { ...base, label: nome } : base;
};

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
    /* Formato que a API manda: { dom: [{ abre, fecha }], seg: [...] }; dia com lista vazia = fechado. */
    const porDia = DIAS_API.filter(([k]) => Array.isArray(horarios[k]));
    if (porDia.length) {
      return porDia.map(([k, nome]) => {
        const faixas = horarios[k]
          .filter((f) => f && typeof f.abre === 'string' && typeof f.fecha === 'string')
          .map((f) => `${f.abre} às ${f.fecha}`);
        return `${nome}: ${faixas.length ? faixas.join(' e ') : 'fechado'}`;
      });
    }
    return Object.entries(horarios)
      .filter(([k, v]) => k !== 'faixas' && typeof v === 'string')
      .map(([dia, texto]) => `${dia}: ${texto}`);
  }
  return [];
}

const DIAS_API = [
  ['seg', 'Segunda'],
  ['ter', 'Terça'],
  ['qua', 'Quarta'],
  ['qui', 'Quinta'],
  ['sex', 'Sexta'],
  ['sab', 'Sábado'],
  ['dom', 'Domingo'],
];

const DIAS_SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

/** "amanhã às 08:00", "segunda às 08:00"... a partir de `yyyy-MM-ddTHH:mm` (Brasília), comparando com o dia de hoje em Brasília. */
export function aberturaEmTexto(iso, nowMs = Date.now()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(iso ?? '');
  if (!m) return null;
  const alvo = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const hoje = Date.parse(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(nowMs));
  const dias = Math.round((alvo - hoje) / 86400000);
  const hora = `${m[4]}:${m[5]}`;
  if (dias <= 0) return `hoje às ${hora}`;
  if (dias === 1) return `amanhã às ${hora}`;
  if (dias < 7) return `${DIAS_SEMANA[new Date(alvo).getUTCDay()]} às ${hora}`;
  return `${m[3]}/${m[2]} às ${hora}`;
}

/** Selo da loja: `null` se a API não informou; senão `{ aberto, texto }` (fechada nunca é erro, só informação). */
export function statusDaLoja(loja, nowMs = Date.now()) {
  if (!loja || typeof loja.abertoAgora !== 'boolean') return null;
  if (loja.abertoAgora) return { aberto: true, texto: 'Aberto agora' };
  const quando = aberturaEmTexto(loja.proximaAbertura, nowMs);
  return { aberto: false, texto: quando ? `Fechado agora · abre ${quando}` : 'Fechado agora' };
}

/** Cliente pode cancelar? Prazo 0 = a loja não permite; senão vale o que a API disse (`podeCancelar`) ou a conta do prazo. */
export function podeCancelarPedido(pedido, prazoMin, nowMs = Date.now()) {
  if (!pedido || pedido.estado !== 'recebido' || prazoMin === 0) return false;
  if (typeof pedido.podeCancelar === 'boolean') return pedido.podeCancelar;
  if (pedido.cancelavelAte) return nowMs <= Date.parse(pedido.cancelavelAte);
  if (prazoMin && pedido.criadoEm) return nowMs - Date.parse(pedido.criadoEm) <= prazoMin * 60000;
  return true;
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

/* ------------------------------------------------------------ agenda */

const TZ_BR = 'America/Sao_Paulo';

/** Hoje em Brasília, `yyyy-MM-dd`. */
export const hojeBrasilia = (nowMs = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ_BR }).format(nowMs);

/** `yyyy-MM-dd` + n dias (aritmética de calendário, sem fuso). */
export function somaDias(dia, n) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Início do atendimento (com fuso ou já em Brasília) → `{ dia, hora, ms }` em Brasília. */
export function partesBrasilia(inicio) {
  if (typeof inicio !== 'string') return null;
  let ms;
  if (/(?:Z|[+-]\d{2}:\d{2})$/.test(inicio)) ms = Date.parse(inicio);
  else {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(inicio);
    ms = m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + 3, +m[5]) : NaN;
  }
  if (!Number.isFinite(ms)) return null;
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ_BR, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(ms)
      .map((x) => [x.type, x.value])
  );
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}`, ms };
}

/** `2026-11-20` → "sexta-feira, 20 de novembro". */
export const diaExtenso = (dia) =>
  dia ? new Date(`${dia}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }) : '';

/** `2026-11-20` → { sem: 'sex', num: '20', mes: 'nov' } (para os botões de dia). */
export function diaCurto(dia) {
  const d = new Date(`${dia}T12:00:00Z`);
  const f = (opt) => d.toLocaleDateString('pt-BR', { ...opt, timeZone: 'UTC' }).replace('.', '');
  return { sem: f({ weekday: 'short' }), num: f({ day: 'numeric' }), mes: f({ month: 'short' }) };
}

/** "sexta-feira, 20 de novembro às 09:00". */
export function quandoEmTexto(inicio) {
  const p = partesBrasilia(inicio);
  return p ? `${diaExtenso(p.dia)} às ${p.hora}` : '';
}

/** 45 → "45 min", 90 → "1 h 30 min", 120 → "2 h". */
export function duracaoEmTexto(min) {
  if (!Number.isFinite(min) || min <= 0) return '';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

export const periodoDoHorario = (hora) => {
  const h = Number(hora.slice(0, 2));
  return h < 12 ? 'Manhã' : h < 18 ? 'Tarde' : 'Noite';
};

export const ESTADOS_AGENDAMENTO = {
  solicitado: { label: 'Aguardando a loja', tone: 'info', hint: 'O horário está reservado para você. A loja confirma em breve.' },
  confirmado: { label: 'Confirmado', tone: 'ok', hint: 'A loja confirmou o seu horário.' },
  recusado: { label: 'Recusado', tone: 'danger', hint: 'A loja não pôde confirmar este horário. Escolha outro.' },
  cancelado_cliente: { label: 'Cancelado por você', tone: 'warn', hint: 'Você cancelou este agendamento.' },
  cancelado_loja: { label: 'Cancelado pela loja', tone: 'warn', hint: 'A loja cancelou este agendamento. Escolha outro horário.' },
  remarcado: { label: 'Remarcado pela loja', tone: 'info', hint: 'A loja alterou o horário. Confira a nova data.' },
  concluido: { label: 'Concluído', tone: 'ok', hint: 'Atendimento realizado.' },
  nao_compareceu: { label: 'Não compareceu', tone: 'warn', hint: 'O atendimento não aconteceu.' },
};
export const estadoAgendamento = (estado) => ESTADOS_AGENDAMENTO[estado] ?? { label: estado || 'Em andamento', tone: 'info', hint: '' };
export const AGENDAMENTO_ATIVO = new Set(['solicitado', 'confirmado', 'remarcado']);

const semAcento = (t) => String(t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export const ehPetShop = (agenda) => semAcento(agenda?.preset).includes('pet');

/** Rótulos por preset (o que a loja publicou vence o padrão). */
export function rotulosDaAgenda(agenda) {
  const preset = semAcento(agenda?.preset);
  const base = preset.includes('barb')
    ? { profissional: 'Barbeiro', profissionais: 'Barbeiros', artigo: 'o', qualquer: 'Qualquer barbeiro' }
    : preset.includes('pet')
      ? { profissional: 'Tosador', profissionais: 'Tosadores', artigo: 'o', qualquer: 'Qualquer tosador' }
      : { profissional: 'Profissional', profissionais: 'Profissionais', artigo: 'o', qualquer: 'Qualquer profissional' };
  const r = agenda?.rotulos ?? {};
  const profissional = r.profissional || base.profissional;
  return {
    ...base,
    profissional,
    profissionais: r.profissionais || (r.profissional ? `${profissional}s` : base.profissionais),
    qualquer: r.qualquer || (r.profissional ? `Qualquer ${profissional.toLowerCase()}` : base.qualquer),
    agendar: r.agendar || 'Agendar horário',
  };
}

/** Preço e duração de um serviço conforme o porte (quando a loja diferencia). */
export function servicoPorPorte(servico, porte) {
  const doPorte = servico.exigePorte && porte ? servico.porte?.[porte] : null;
  return { duracao: doPorte?.duracao ?? servico.duracao, preco: doPorte?.preco ?? servico.preco };
}

/** "a partir de" quando o preço varia com o porte e o porte ainda não foi escolhido. */
export function precoMinimoServico(servico) {
  const precos = Object.values(servico.porte ?? {}).map((p) => p?.preco).filter(Number.isFinite);
  return servico.exigePorte && precos.length ? Math.min(...precos) : servico.preco;
}

/** Dá para cancelar ou remarcar? `podeCancelar` da API vence; senão vale o prazo da loja antes do início. */
export function podeAlterarAgendamento(ag, prazoMin, nowMs = Date.now()) {
  if (!ag || !AGENDAMENTO_ATIVO.has(ag.estado)) return false; // solicitado, confirmado e remarcado seguram o horário (a API aceita cancelar e remarcar)
  if (typeof ag.podeCancelar === 'boolean') return ag.podeCancelar;
  const inicio = partesBrasilia(ag.inicio)?.ms;
  if (!Number.isFinite(inicio)) return false;
  return inicio - nowMs >= (prazoMin ?? 0) * 60000;
}

/**
 * "Pedir de novo": produtos dos pedidos anteriores (os mais recentes primeiro, sem repetir),
 * só os que ainda estão no catálogo e disponíveis.
 */
export function produtosParaPedirDeNovo(pedidos, produtos, max = 10) {
  if (!Array.isArray(pedidos) || !Array.isArray(produtos)) return [];
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const ordenados = [...pedidos].sort((a, b) => String(b.criadoEm ?? '').localeCompare(String(a.criadoEm ?? '')));
  const vistos = new Set();
  const lista = [];
  for (const pedido of ordenados) {
    for (const item of pedido?.itens ?? []) {
      const produto = porId.get(item?.produtoId);
      if (!produto || !produto.disponivel || vistos.has(produto.id)) continue;
      vistos.add(produto.id);
      lista.push(produto);
      if (lista.length >= max) return lista;
    }
  }
  return lista;
}

/** Faixa de mais vendidos: os disponíveis com posição no campo pedido, na ordem da posição. */
export function produtosMaisVendidos(produtos, campo = 'maisVendido') {
  if (!Array.isArray(produtos)) return [];
  return produtos
    .filter((p) => p?.disponivel && Number.isInteger(p[campo]))
    .sort((a, b) => a[campo] - b[campo]);
}

/**
 * Quantidade digitada: com vírgula é o jeito brasileiro ("1.234,5"); sem vírgula, o ponto é decimal quando o produto vende fração
 * (teclado do celular que só tem "." : "1.5" kg é 1,5 e não 15) e separador de milhar quando vende inteiro ("1.200" un).
 */
export function parseQtd(text, step = 1) {
  const t = String(text ?? '').trim();
  if (t.includes(',')) return Number(t.replace(/\./g, '').replace(',', '.'));
  return Number(step < 1 ? t : t.replace(/\./g, ''));
}

