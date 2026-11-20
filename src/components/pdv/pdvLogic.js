/* Lógica pura das demonstrações do PDV (sem React), coberta por tests/pdv.test.js. */

/** Dinheiro em centavos evita erro de ponto flutuante nas somas. */
export const brl = (cents) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Interpreta o que a pessoa digitou ("12,50", "12.5", "R$ 12") em centavos. Inválido vira 0. */
export function parseCents(texto) {
  const limpo = String(texto ?? '')
    .replace(/[^\d,.]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const n = Number.parseFloat(limpo);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

/** Soma da comanda: [{ price (centavos), qty }]. */
export function cartTotal(items) {
  return items.reduce((s, i) => s + i.price * i.qty, 0);
}

export function addItem(items, product) {
  const found = items.find((i) => i.id === product.id);
  if (!found) return [...items, { id: product.id, name: product.name, price: product.price, qty: 1 }];
  return items.map((i) => (i.id === product.id ? { ...i, qty: i.qty + 1 } : i));
}

/** Muda a quantidade; chegando a 0 o item sai da comanda. */
export function changeQty(items, id, delta) {
  return items
    .map((i) => (i.id === id ? { ...i, qty: i.qty + delta } : i))
    .filter((i) => i.qty > 0);
}

/** Troco e falta de um pagamento em dinheiro. */
export function change(total, received) {
  const diff = received - total;
  return { troco: Math.max(diff, 0), falta: Math.max(-diff, 0), ok: received >= total && total > 0 };
}

/** Minúsculas, sem acento, espaços aparados. */
export function normalize(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Busca da paleta: por qualquer palavra do nome ou do grupo, ou pelas iniciais ("cp" -> Contas a pagar).
 * Nome que começa com o termo vem primeiro; depois iniciais; depois o resto.
 */
export function searchScreens(screens, query) {
  const q = normalize(query);
  if (!q) return screens;
  const scored = [];
  screens.forEach((s, index) => {
    const nome = normalize(s.name);
    const grupo = normalize(s.group);
    const palavras = nome.split(/\s+/);
    const iniciais = palavras.filter((p) => p.length > 2).map((p) => p[0]).join('');
    let score = 0;
    if (nome.startsWith(q)) score = 3;
    else if (iniciais.startsWith(q) && q.length >= 2) score = 2;
    else if (palavras.some((p) => p.startsWith(q)) || grupo.split(/\s+/).some((p) => p.startsWith(q))) score = 1;
    if (score) scored.push({ s, score, index });
  });
  return scored.sort((a, b) => b.score - a.score || a.index - b.index).map((x) => x.s);
}

/** Partes de um texto para destacar o termo buscado (ignora acento e caixa). Devolve [{ text, hit }]. */
export function highlightParts(texto, query) {
  const q = normalize(query);
  if (!q) return [{ text: texto, hit: false }];
  // normalize() de caracteres compostos pode mudar o tamanho; compara letra a letra.
  const letras = [...texto];
  const base = letras.map((c) => c.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase());
  const alvo = base.join('');
  const pos = alvo.indexOf(q);
  if (pos < 0 || base.some((b) => b.length !== 1)) return [{ text: texto, hit: false }];
  return [
    { text: letras.slice(0, pos).join(''), hit: false },
    { text: letras.slice(pos, pos + q.length).join(''), hit: true },
    { text: letras.slice(pos + q.length).join(''), hit: false },
  ].filter((p) => p.text);
}

/** Participação percentual de cada forma de pagamento (soma 100, maior resto). */
export function shares(rows) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!total) return rows.map((r) => ({ ...r, pct: 0 }));
  const raw = rows.map((r) => (r.value / total) * 100);
  const floor = raw.map(Math.floor);
  let resto = 100 - floor.reduce((a, b) => a + b, 0);
  const ordem = raw.map((v, i) => [v - floor[i], i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of ordem) {
    if (resto <= 0) break;
    floor[i] += 1;
    resto -= 1;
  }
  return rows.map((r, i) => ({ ...r, pct: floor[i] }));
}

/** Conferência do dinheiro: sobra (+) ou falta (-) frente ao esperado em gaveta. */
export function cashDifference(expected, counted) {
  const diff = counted - expected;
  return { diff, status: diff === 0 ? 'exato' : diff > 0 ? 'sobra' : 'falta' };
}

/** Estoque depois das vendas do dia, situação e sugestão de reposição. */
export function stockAfterSales(p, sold) {
  const atual = Math.max(p.stock - sold, 0);
  const critico = atual <= p.min;
  // repõe até o dobro do mínimo
  const repor = critico ? Math.max(p.min * 2 - atual, 0) : 0;
  return { atual, critico, repor, vendido: p.stock - atual };
}
