/* Carrinho do portal: só ids, quantidades e a observação de cada item, no navegador (conveniência; o preço
   e o total NUNCA vêm daqui — o servidor recalcula). Tudo em try/catch: o
   armazenamento pode estar bloqueado (aba anônima) e o portal segue funcionando. */

/** Tamanho máximo da observação de UM item ("sem cebola"). */
export const OBS_ITEM_MAX = 140;
/** Tamanho máximo da observação do pedido aceito pela API. */
export const OBS_PEDIDO_MAX = 500;

const key = (slug) => `todai-portal-cart:${slug}`;

export function readCart(slug) {
  try {
    const raw = JSON.parse(localStorage.getItem(key(slug)) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((i) => i && typeof i.id === 'string' && Number.isFinite(i.qty) && i.qty > 0)
      .slice(0, 100)
      .map((i) => {
        const obs = typeof i.obs === 'string' ? i.obs.trim().slice(0, OBS_ITEM_MAX) : '';
        return obs ? { id: i.id.slice(0, 64), qty: i.qty, obs } : { id: i.id.slice(0, 64), qty: i.qty };
      });
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

/**
 * A API só tem UMA observação por pedido: as observações dos itens entram no começo
 * ("• Açaí 500 ml: sem granola"), depois a observação geral. Nunca passa de 500.
 */
export function juntarObservacao(itens, geral) {
  const linhas = itens
    .filter((i) => i.obs && i.obs.trim())
    .map((i) => `• ${(i.nome ?? 'Item').trim()}: ${i.obs.trim()}`);
  const partes = [...linhas];
  const g = (geral ?? '').trim();
  if (g) partes.push(linhas.length ? `\n${g}` : g);
  return partes.join('\n').slice(0, OBS_PEDIDO_MAX);
}
