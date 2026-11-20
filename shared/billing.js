/* =========================================================================
   Assinatura no cartão: dia de vencimento e validação de cartão.
   -------------------------------------------------------------------------
   Funções puras, usadas pela tela (para avisar na hora) e pelo servidor (que
   é quem vale). Nada aqui guarda nem registra dados de cartão.
   ========================================================================= */

export const BILLING_DAYS = Object.freeze([15, 20, 30]);

const pad = (n) => String(n).padStart(2, '0');
const daysInMonth = (year, monthIndex) => new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();

const digitsOf = (value) => String(value ?? '').replace(/\D/g, '');

/** Aceita Date ou 'YYYY-MM-DD' e devolve {year, month (0-11), day}. */
function parts(value) {
  if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (match) return { year: +match[1], month: +match[2] - 1, day: +match[3] };
  }
  const date = value instanceof Date ? value : new Date();
  return { year: date.getFullYear(), month: date.getMonth(), day: date.getDate() };
}

/**
 * Próximo vencimento para o dia escolhido, como 'YYYY-MM-DD', SEMPRE depois de
 * hoje (a primeira mensalidade é cobrada na hora; o dia vale para os ciclos seguintes).
 * Mês curto: o dia 30 cai no último dia do mês (28/29 em fevereiro).
 */
export function nextDueDate(billingDay, today = new Date()) {
  const { year, month, day } = parts(today);
  const effective = (y, m) => Math.min(billingDay, daysInMonth(y, m));

  let y = year;
  let m = month;
  if (effective(y, m) <= day) {
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return `${y}-${pad(m + 1)}-${pad(effective(y, m))}`;
}

/** True quando o dia escolhido não existe no mês do vencimento (cai no último dia). */
export function isShortMonthDue(billingDay, dueDate) {
  const { day } = parts(dueDate);
  return day < billingDay;
}

export function formatDueDate(dueDate) {
  const { year, month, day } = parts(dueDate);
  return `${pad(day)}/${pad(month + 1)}/${year}`;
}

/* ------------------------------------------------------------------ cartão */

/** Algoritmo de Luhn sobre os dígitos. */
export function luhn(number) {
  const digits = digitsOf(number);
  if (digits.length < 12) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

const ELO = [
  /^4011(78|79)/, /^43(1274|8935)/, /^45(1416|7393|763[12])/, /^50(4175|6699|67[0-6]\d|677[0-8]|9\d{3})/,
  /^627780/, /^63(6297|6368)/, /^65(0(03[1-3]|03[5-9]|04[0-9]|05[01])|0(40[5-9]|4[1-3]\d)|0(48[5-9]|49\d|5[0-3]\d)|0(54[1-9]|5[5-8]\d|59[0-8])|0(70\d|71[0-8]|72[0-7])|0(90[1-9]|9[1-7]\d)|165[2-9]|166\d|167[0-9]|5(0[0-9]\d|1[0-9]\d|5[0-8]))/,
];

/** 'visa' | 'master' | 'elo' | 'amex' | 'hipercard' | null, pelo prefixo. */
export function cardBrand(number) {
  const d = digitsOf(number);
  if (!d) return null;
  if (/^(606282|3841)/.test(d)) return 'hipercard';
  if (ELO.some((re) => re.test(d))) return 'elo';
  if (/^3[47]/.test(d)) return 'amex';
  if (/^4/.test(d)) return 'visa';
  if (/^(5[1-5]|2(2[2-9]\d|[3-6]\d\d|7[01]\d|720))/.test(d)) return 'master';
  return null;
}

export const BRAND_LABEL = Object.freeze({
  visa: 'Visa',
  master: 'Mastercard',
  elo: 'Elo',
  amex: 'American Express',
  hipercard: 'Hipercard',
});

/** Máscara de digitação: 4-6-5 para Amex, grupos de 4 nas demais (até 19 dígitos). */
export function formatCardNumber(value) {
  const d = digitsOf(value).slice(0, 19);
  if (cardBrand(d) === 'amex') {
    return [d.slice(0, 4), d.slice(4, 10), d.slice(10, 15)].filter(Boolean).join(' ');
  }
  return d.replace(/(\d{4})(?=\d)/g, '$1 ');
}

/** Só os 4 últimos dígitos, para exibir. */
export const cardLast4 = (number) => digitsOf(number).slice(-4);

/** Mensagem de erro do número, ou null. */
export function cardNumberProblem(number) {
  const d = digitsOf(number);
  if (!d) return 'Informe o número do cartão.';
  const brand = cardBrand(d);
  const expected = brand === 'amex' ? [15] : brand === 'hipercard' ? [16, 19] : [16];
  if (d.length < 13 || (!expected.includes(d.length) && d.length > 13 && brand)) {
    return 'O número do cartão está incompleto ou com dígitos a mais.';
  }
  if (d.length > 19 || !luhn(d)) return 'Confira o número do cartão.';
  return null;
}

/** '12/30', '1230', '12/2030' -> {month:'12', year:'2030'} ou null. */
export function parseExpiry(text) {
  const d = digitsOf(text);
  if (d.length !== 4 && d.length !== 6) return null;
  const month = d.slice(0, 2);
  const year = d.length === 4 ? `20${d.slice(2)}` : d.slice(2);
  return { month, year };
}

/** Máscara MM/AA durante a digitação. */
export function formatExpiry(value) {
  const d = digitsOf(value).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/** Validade: mês 01-12 e ainda não vencido (vale até o fim do mês). */
export function expiryProblem(month, year, today = new Date()) {
  const m = Number(month);
  const y = Number(year);
  if (!/^\d{2}$/.test(String(month)) || !/^\d{4}$/.test(String(year)) || m < 1 || m > 12) {
    return 'Informe a validade como MM/AA.';
  }
  const { year: cy, month: cm } = parts(today);
  if (y < cy || (y === cy && m - 1 < cm) || y > cy + 20) return 'Cartão vencido ou validade inválida.';
  return null;
}

/** CCV de 3 dígitos (4 na American Express). */
export function ccvProblem(ccv, brand = null) {
  const d = String(ccv ?? '');
  if (!/^\d{3,4}$/.test(d)) return 'O código de segurança tem 3 ou 4 dígitos.';
  if (brand === 'amex' && d.length !== 4) return 'Na American Express o código tem 4 dígitos.';
  if (brand && brand !== 'amex' && d.length !== 3) return 'O código de segurança tem 3 dígitos.';
  return null;
}

export const postalCodeProblem = (value) =>
  digitsOf(value).length === 8 ? null : 'Informe o CEP com 8 dígitos.';

export function formatPostalCode(value) {
  const d = digitsOf(value).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}
