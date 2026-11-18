/* =========================================================================
   Textos dos e-mails do portal da loja (texto puro + HTML simples).
   O HTML usa só estilo inline e tabela (é o que cliente de e-mail aceita) e
   TUDO que vem de fora (nome da loja, motivo, nome da pessoa) é escapado.
   ========================================================================= */

import { cleanDisplayName } from './mailer.js';

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const brl = (value) =>
  Number.isFinite(value) ? value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : null;

/** Casca comum: título, parágrafos, botão opcional e rodapé. */
function layout({ store, title, paragraphs, action, footer }) {
  const body = paragraphs.map((p) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.5;color:#1f2937">${esc(p)}</p>`).join('');
  const button = action
    ? `<p style="margin:22px 0"><a href="${esc(action.url)}" style="background:#1d4ed8;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;display:inline-block">${esc(action.label)}</a></p>
       <p style="margin:0 0 14px;font-size:13px;color:#6b7280">Se o botão não abrir, copie este endereço: ${esc(action.url)}</p>`
    : '';
  return (
    `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:28px">` +
    `<tr><td><p style="margin:0 0 6px;font-size:13px;color:#6b7280">${esc(store ?? 'Loja')}</p>` +
    `<h1 style="margin:0 0 18px;font-size:22px;line-height:1.3;color:#111827">${esc(title)}</h1>` +
    `${body}${button}` +
    `<p style="margin:18px 0 0;font-size:12px;color:#6b7280">${esc(footer)}</p></td></tr></table></td></tr></table></body></html>`
  );
}

const FOOTER = 'Você recebeu este e-mail porque tem conta no portal desta loja. Feito com TODAI.';

const PEDIDO_TITULOS = {
  recebido: 'Recebemos o seu pedido',
  aceito: 'A loja aceitou o seu pedido',
  em_preparo: 'Seu pedido está em preparo',
  pronto: 'Seu pedido está pronto',
  entregue: 'Seu pedido foi concluído',
  recusado: 'A loja não pôde aceitar o seu pedido',
  cancelado: 'Seu pedido foi cancelado',
};

export function eventMessage({ store, name, tipo, estado, motivo, pedido, url }) {
  const lojaNome = cleanDisplayName(store, 60) || 'a loja';
  const first = String(name ?? '').trim().split(/\s+/)[0] || '';
  const greeting = first ? `Olá, ${first}.` : 'Olá.';

  if (tipo === 'conta') {
    const ativa = estado === 'ativa';
    const bloqueada = estado === 'bloqueada';
    const title = ativa ? 'Seu cadastro foi aprovado' : bloqueada ? 'Não foi possível liberar o seu cadastro' : 'Seu cadastro está em análise';
    const paragraphs = [
      greeting,
      ativa
        ? `${lojaNome} aprovou o seu cadastro. Os preços da sua conta já aparecem no catálogo.`
        : bloqueada
          ? `${lojaNome} não conseguiu liberar o seu cadastro. Fale diretamente com a loja para entender o motivo.`
          : `${lojaNome} está analisando o seu cadastro. Avisaremos quando houver novidade.`,
    ];
    return {
      subject: `${lojaNome}: ${title.toLowerCase()}`,
      text: `${paragraphs.join('\n\n')}\n\n${ativa ? `Abrir o catálogo: ${url}\n\n` : ''}${FOOTER}\n`,
      html: layout({ store: lojaNome, title, paragraphs, action: ativa ? { label: 'Abrir o catálogo', url } : null, footer: FOOTER }),
    };
  }

  const ref = pedido?.referencia ? ` ${pedido.referencia}` : '';
  const title = `${PEDIDO_TITULOS[estado] ?? 'Atualização do seu pedido'}`;
  const paragraphs = [greeting, `${title}${ref ? ` (pedido${ref})` : ''} em ${lojaNome}.`];
  if (estado === 'recusado' && motivo) paragraphs.push(`Motivo informado pela loja: ${motivo}`);
  if (estado === 'cancelado' && motivo) paragraphs.push(`Observação: ${motivo}`);
  const total = brl(pedido?.total);
  if (total && ['recebido', 'aceito'].includes(estado)) paragraphs.push(`Total do pedido: ${total}. O pagamento é feito na entrega ou na retirada.`);
  return {
    subject: `${lojaNome}: ${title.toLowerCase()}${ref ? ` (pedido${ref})` : ''}`,
    text: `${paragraphs.join('\n\n')}\n\nAcompanhar o pedido: ${url}\n\n${FOOTER}\n`,
    html: layout({ store: lojaNome, title, paragraphs, action: { label: 'Acompanhar o pedido', url }, footer: FOOTER }),
  };
}

export function resetMessage({ store, name, link }) {
  const lojaNome = cleanDisplayName(store, 60) || 'a loja';
  const first = String(name ?? '').trim().split(/\s+/)[0];
  const paragraphs = [
    first ? `Olá, ${first}.` : 'Olá.',
    `Recebemos um pedido para redefinir a senha da sua conta em ${lojaNome}. Use o botão abaixo em até 30 minutos.`,
    'Se você não pediu isso, ignore este e-mail: sua senha continua a mesma.',
  ];
  return {
    subject: `${lojaNome}: redefinir a sua senha`,
    text: `${paragraphs[0]}\n\n${paragraphs[1]}\n\n${link}\n\n${paragraphs[2]}\n\n${FOOTER}\n`,
    html: layout({ store: lojaNome, title: 'Redefinir a sua senha', paragraphs, action: { label: 'Criar nova senha', url: link }, footer: FOOTER }),
  };
}

export function duplicateMessage({ store, name, loginUrl, resetUrl }) {
  const lojaNome = cleanDisplayName(store, 60) || 'a loja';
  const first = String(name ?? '').trim().split(/\s+/)[0];
  const paragraphs = [
    first ? `Olá, ${first}.` : 'Olá.',
    `Alguém tentou criar uma conta em ${lojaNome} com este e-mail, mas ele já tem cadastro. Se foi você, é só entrar. Se esqueceu a senha, peça uma nova pelo link abaixo.`,
    'Se não foi você, ignore este e-mail: nada foi alterado.',
  ];
  return {
    subject: `${lojaNome}: você já tem conta`,
    text: `${paragraphs[0]}\n\n${paragraphs[1]}\n\nEntrar: ${loginUrl}\nEsqueci a senha: ${resetUrl}\n\n${paragraphs[2]}\n\n${FOOTER}\n`,
    html: layout({ store: lojaNome, title: 'Você já tem conta', paragraphs, action: { label: 'Entrar na minha conta', url: loginUrl }, footer: FOOTER }),
  };
}

/* --------------------------------------------------------------- agendamento */

const TZ = 'America/Sao_Paulo';

/** "sexta-feira, 20/11/2026 às 09:00" em hora de Brasília. Sem fuso na entrada = já é Brasília. */
export function formatBrasilia(inicio) {
  if (typeof inicio !== 'string') return null;
  let instant;
  if (/(?:Z|[+-]\d{2}:\d{2})$/.test(inicio)) {
    instant = new Date(inicio);
  } else {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(inicio);
    if (!m) return null;
    /* Brasília não tem horário de verão desde 2019: UTC-3 fixo. */
    instant = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + 3, +m[5]));
  }
  if (Number.isNaN(instant.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(instant)
      .map((p) => [p.type, p.value])
  );
  return `${parts.weekday}, ${parts.day}/${parts.month}/${parts.year} às ${parts.hour}:${parts.minute}`;
}

const AGENDAMENTO_TITULOS = {
  solicitado: 'Recebemos o seu pedido de agendamento',
  confirmado: 'Seu agendamento foi confirmado',
  recusado: 'A loja não pôde confirmar o seu agendamento',
  cancelado_cliente: 'Seu agendamento foi cancelado',
  cancelado_loja: 'A loja cancelou o seu agendamento',
  remarcado: 'Seu agendamento foi remarcado',
};

export function agendamentoMessage({ store, name, estado, motivo, agendamento, inicio, url }) {
  const lojaNome = cleanDisplayName(store, 60) || 'a loja';
  const first = String(name ?? '').trim().split(/\s+/)[0] || '';
  const title = AGENDAMENTO_TITULOS[estado] ?? 'Atualização do seu agendamento';
  const ref = agendamento?.referencia ? ` ${agendamento.referencia}` : '';
  const quando = formatBrasilia(inicio ?? agendamento?.inicio);
  const servicos = (agendamento?.servicos ?? []).map((s) => s.nome).filter(Boolean).join(', ');
  const paragraphs = [first ? `Olá, ${first}.` : 'Olá.', `${title} em ${lojaNome}${ref ? ` (agendamento${ref})` : ''}.`];
  if (servicos) paragraphs.push(`Serviço: ${servicos}.`);
  if (agendamento?.profissionalNome) paragraphs.push(`Profissional: ${agendamento.profissionalNome}.`);
  if (quando) paragraphs.push(`${estado === 'recusado' || estado === 'cancelado_cliente' || estado === 'cancelado_loja' ? 'Horário que era' : 'Horário'}: ${quando} (horário de Brasília).`);
  if (estado === 'solicitado') paragraphs.push('O horário fica reservado para você até a loja confirmar. Avisaremos por e-mail.');
  if (estado === 'recusado' && motivo) paragraphs.push(`Motivo informado pela loja: ${motivo}`);
  if ((estado === 'cancelado_loja' || estado === 'remarcado') && motivo) paragraphs.push(`Observação da loja: ${motivo}`);
  if (estado === 'recusado' || estado === 'cancelado_loja') paragraphs.push('Se quiser, escolha outro horário pelo portal.');
  return {
    subject: `${lojaNome}: ${title.toLowerCase()}${ref ? ` (agendamento${ref})` : ''}`,
    text: `${paragraphs.join('\n\n')}\n\nVer o agendamento: ${url}\n\n${FOOTER}\n`,
    html: layout({ store: lojaNome, title, paragraphs, action: { label: 'Ver o agendamento', url }, footer: FOOTER }),
  };
}
