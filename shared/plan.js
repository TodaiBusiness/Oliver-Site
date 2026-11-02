/* =========================================================================
   Plano à venda.
   -------------------------------------------------------------------------
   ATENÇÃO: o preço que vale é o que a API de licenciamento calcula na hora de
   criar a cobrança (plano "Cloud" no banco dela). Estes números só servem para
   mostrar o valor estimado ao visitante; se um mudar, o outro precisa mudar
   junto. A API confere no checkout, então um valor desatualizado aqui nunca
   vira cobrança errada, só uma estimativa errada na tela.
   ========================================================================= */

export const PLAN = Object.freeze({
  name: 'TODAI',
  /** Mensalidade com o computador incluído. */
  basePrice: 110,
  includedDevices: 1,
  /** Por computador a mais. */
  extraDevicePrice: 20,
  /** Teto do formulário de compra; acima disso é negociação pelo WhatsApp. */
  maxDevices: 20,
});

/** Mensalidade estimada para `devices` computadores. */
export function monthlyPrice(devices, plan = PLAN) {
  const count = Math.max(plan.includedDevices, Math.trunc(Number(devices) || 0));
  return plan.basePrice + (count - plan.includedDevices) * plan.extraDevicePrice;
}

export function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}
