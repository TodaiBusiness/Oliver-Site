/* =========================================================================
   O produto à venda: TODAI (estoque + PDV para Windows).
   -------------------------------------------------------------------------
   Tudo que o site afirma sobre o sistema vem daqui e só pode citar o que o
   sistema faz de verdade hoje (ver `Sistema-Gerenciamento-Estoque/docs/
   FUNCIONALIDADES.md`). Funcionalidade que ainda não foi provada em produção
   (como a emissão de NFC-e) NÃO entra nesta lista até ser provada.
   ========================================================================= */

import { PLAN } from '../../shared/plan.js';

export const PRODUCT = Object.freeze({
  name: PLAN.name,
  tagline: 'Estoque, caixa e vendas num só sistema para a sua loja.',
  platform: 'Windows 10 ou 11',
});

export const FEATURES = [
  {
    icon: 'layers',
    title: 'Estoque sob controle',
    text: 'Produtos com custo, preço e estoque mínimo, entradas, saídas e contagem. O sistema avisa quando um preço fica abaixo do custo.',
  },
  {
    icon: 'bolt',
    title: 'Comandas e venda rápida',
    text: 'Abra comandas, lance itens, dê desconto e feche com a forma de pagamento. O balcão tem uma venda rápida sempre pronta para o próximo cliente.',
  },
  {
    icon: 'database',
    title: 'Caixa que fecha certo',
    text: 'Abertura com troco, sangria e suprimento, conferência do dinheiro e fechamento com sobra ou falta calculadas, separado por dinheiro, débito, crédito e PIX.',
  },
  {
    icon: 'trending',
    title: 'Resultado da loja',
    text: 'Receita, lucro, margem, ticket médio e ranking de produtos, com comparação com o período anterior.',
  },
  {
    icon: 'cpu',
    title: 'Balança integrada',
    text: 'Venda por peso com a balança Toledo Prix 3 Fit ligada ao computador, pela porta serial.',
  },
  {
    icon: 'refresh',
    title: 'Aguenta internet ruim',
    text: 'O sistema confere a licença a cada 12 horas e continua funcionando por até 72 horas sem conexão.',
  },
];

export const STEPS = [
  { title: 'Compre pelo site', text: 'Preencha os dados da empresa e pague pelo Mercado Pago.' },
  { title: 'Receba por e-mail', text: 'Em poucos minutos chegam o código de ativação e o link do instalador.' },
  { title: 'Instale e ative', text: 'Instale no computador da loja, digite o código e comece a vender.' },
];

/** Link do instalador. Vem do build; sem ele a página de download avisa. */
export const INSTALLER_URL = import.meta.env?.VITE_INSTALLER_URL || '';
