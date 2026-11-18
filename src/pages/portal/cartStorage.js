/* Carrinho do portal: só ids e quantidades, no navegador (conveniência; o preço
   e o total NUNCA vêm daqui — o servidor recalcula). Tudo em try/catch: o
   armazenamento pode estar bloqueado (aba anônima) e o portal segue funcionando. */

const key = (slug) => `todai-portal-cart:${slug}`;

export function readCart(slug) {
  try {
    const raw = JSON.parse(localStorage.getItem(key(slug)) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((i) => i && typeof i.id === 'string' && Number.isFinite(i.qty) && i.qty > 0)
      .slice(0, 100)
      .map((i) => ({ id: i.id.slice(0, 64), qty: i.qty }));
  } catch {
    return [];
  }
}

export function writeCart(slug, items) {
  try {
    if (!items.length) localStorage.removeItem(key(slug));
    else localStorage.setItem(key(slug), JSON.stringify(items));
  } catch {
    /* sem armazenamento: o carrinho vale só nesta aba */
  }
}
