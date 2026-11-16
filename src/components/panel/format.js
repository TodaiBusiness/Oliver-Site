/* Formatação de datas e textos compartilhada pelas telas do painel. */

const num = (ms) => new Date(Number(ms));

export const formatarData = (ms) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(num(ms));

export const formatarDataHora = (ms) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(num(ms));

/** "há 5 min", "há 3 h", "ontem" ou a data — o que for mais útil de relance. */
export function tempoRelativo(ms, agora = Date.now()) {
  const diff = agora - Number(ms);
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.round(horas / 24);
  if (dias === 1) return 'ontem';
  if (dias < 7) return `há ${dias} dias`;
  return formatarData(ms);
}

/** "1 projeto" / "2 projetos". */
export const plural = (n, singular, pluralTxt) => `${n} ${n === 1 ? singular : pluralTxt}`;

export const inicial = (nome = '?') => nome.trim().charAt(0).toUpperCase() || '?';
