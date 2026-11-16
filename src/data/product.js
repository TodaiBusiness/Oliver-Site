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

/* Passeio pelo sistema: cada item é uma tela real do TODAI (capturas com dados
   de exemplo em public/sistema/<id>-escuro.webp e <id>-claro.webp). Os fatos
   de cada tela vêm de docs/FUNCIONALIDADES.md do sistema. */
export const TOUR = [
  {
    id: 'painel',
    tab: 'Painel',
    title: 'A loja de relance',
    alt: 'Painel do TODAI com filtros do período e a tabela de caixas abertos, com vendas e total por forma de pagamento.',
    facts: [
      'Receita, lucro, margem e ticket médio do período, comparados com o período anterior.',
      'Cada caixa com as próprias vendas, sem contar a mesma venda duas vezes.',
      'Filtros por categoria, forma de pagamento e situação do estoque.',
    ],
  },
  {
    id: 'comandas',
    tab: 'Comandas',
    title: 'Venda no balcão e por comanda',
    alt: 'Tela de comandas do TODAI com a lista de comandas abertas, os itens da comanda CMD-2099 e o botão Finalizar venda.',
    facts: [
      'Abra comandas, lance itens, dê desconto e feche a venda com F12.',
      'A venda rápida do balcão fica sempre aberta para o próximo cliente.',
      'Item cancelado não some: fica registrado e o administrador é avisado.',
    ],
  },
  {
    id: 'caixa',
    tab: 'Caixa',
    title: 'Caixa que fecha certo',
    alt: 'Tela de fechamento de caixa do TODAI com o resumo do caixa e as vendas por forma de pagamento.',
    facts: [
      'Abertura com troco, sangria e suprimento.',
      'Vendas separadas por dinheiro, débito, crédito e PIX, com a participação de cada uma.',
      'Conferência do dinheiro com sobra ou falta calculadas.',
    ],
  },
  {
    id: 'estoque',
    tab: 'Estoque',
    title: 'Estoque e riscos',
    alt: 'Tela Estoque e Riscos do TODAI com o valor por categoria e a tabela de produtos com situação, falta e sugestão de reposição.',
    facts: [
      'Estoque mínimo por produto, com os itens críticos em destaque e a quantidade sugerida para repor.',
      'Entradas, saídas e inventário por contagem.',
      'Aviso quando o preço fica abaixo do custo.',
    ],
  },
  {
    id: 'financeiro',
    tab: 'Financeiro',
    title: 'Contas a pagar e a receber',
    alt: 'Tela Financeiro do TODAI com contas a receber, contas a pagar, resultado do mês e projeção de caixa.',
    facts: [
      'Contas a receber e a pagar no mesmo lugar.',
      'Projeção de caixa para os próximos 30 dias.',
      'Resultado do mês e despesas por categoria.',
    ],
  },
  {
    id: 'relatorios',
    tab: 'Relatórios',
    title: 'Relatórios da loja',
    alt: 'Tela de relatórios do TODAI com faturamento, lucro bruto, margem, ticket médio e a evolução por dia.',
    facts: [
      'Faturamento, lucro, margem e ticket médio por semana, mês ou ano.',
      'Evolução por dia, com o melhor e o pior dia do período.',
      'Exporte os dados para usar fora do sistema.',
    ],
  },
  {
    id: 'balanca',
    tab: 'Balança',
    title: 'Balança e etiquetas',
    alt: 'Tela Balanças e etiquetas do TODAI com os padrões de etiqueta e o testador de etiquetas.',
    facts: [
      'Venda por peso com a balança Toledo Prix 3 Fit ligada ao computador pela porta serial.',
      'Padrões de etiqueta e um testador para conferir antes de vender.',
      'Teste de conexão com a balança dentro do sistema.',
    ],
  },
];

/* O que mais existe no sistema, agrupado como a barra lateral agrupa. Fonte:
   docs/MODULOS.md. Os módulos opcionais nascem desligados e se ligam em
   Configurações → Módulos. */
export const MORE_MODULES = [
  {
    group: 'Vendas',
    items: ['Clientes', 'Orçamentos e pedidos', 'Entregas', 'Código de barras', 'Atalhos personalizados'],
  },
  {
    group: 'Compras e estoque',
    items: ['Fornecedores', 'Compras', 'Inventário', 'Lotes e validade', 'Fichas técnicas'],
  },
  {
    group: 'Equipe',
    items: ['Funcionários', 'Ponto', 'Comissões', 'Permissões por perfil'],
  },
  {
    group: 'Controle',
    items: ['Auditoria', 'Alertas', 'Módulos que você liga e desliga'],
  },
  {
    group: 'Restaurante e serviços',
    items: ['Mesas', 'Cozinha', 'Delivery', 'Agenda'],
  },
];

export const STEPS = [
  { title: 'Compre pelo site', text: 'Preencha os dados da empresa e pague pelo Mercado Pago.' },
  { title: 'Receba por e-mail', text: 'Em poucos minutos chegam o código de ativação e o link do instalador.' },
  { title: 'Instale e ative', text: 'Instale no computador da loja, digite o código e comece a vender.' },
];

/** Aviso sobre a conexão, mostrado depois dos passos. */
export const OFFLINE_NOTE =
  'Sem internet? O sistema confere a licença a cada 12 horas e continua funcionando por até 72 horas sem conexão.';

/** Link do instalador. Vem do build; sem ele a página de download avisa. */
export const INSTALLER_URL = import.meta.env?.VITE_INSTALLER_URL || '';
