/* Conteúdo da página /sistema/pdv. Só o que o sistema faz hoje (base: docs/FUNCIONALIDADES.md). */

export const PDV_PARTS = [
  {
    id: 'venda',
    title: 'Venda e comandas',
    shot: 'comandas',
    lead:
      'O balcão abre pronto para vender: a Venda rápida #000 está sempre aberta, com um campo grande de busca ou leitor de código de barras. Quando precisa, você abre comandas numeradas, com cliente opcional.',
    facts: [
      'Enter adiciona o produto, Esc limpa a busca; o mesmo item soma na linha existente.',
      'O estoque só baixa no fechamento, pela quantidade total. Cancelar uma comanda não mexe no estoque.',
      'Item cancelado sai da venda, mas fica guardado em "Itens cancelados" e o administrador recebe um aviso.',
      'Desconto por item e na comanda, com limite por perfil e senha mestra acima dele.',
      'Venda suspensa e devolução de venda já fechada, com estoque e caixa acertados.',
    ],
  },
  {
    id: 'finalizar',
    title: 'Finalizar venda',
    shot: null,
    lead:
      'A janela de pagamento mostra o total a pagar em destaque e como o cliente vai pagar. Uma única confirmação fecha a venda, e o texto do botão diz o que ainda falta quando algo está pendente.',
    facts: [
      'Dinheiro F1, Pix F2, Pix QR Code Shift+F2, Cartão F3, Outros F9 e Dividir F6; Confirmar em F4.',
      'Em dinheiro, o troco e a falta são calculados enquanto você digita; pagamento insuficiente é recusado.',
      'Conta dividida aceita várias formas de pagamento na mesma venda.',
      'O Pix QR Code usa a chave da loja e o valor da venda, e o caixa confirma o recebimento à mão.',
      'Proteção contra clique duplo no botão de confirmar.',
    ],
  },
  {
    id: 'caixa',
    title: 'Caixa',
    shot: 'caixa',
    lead:
      'O dia do caixa começa com o saldo da gaveta e termina na conferência do dinheiro físico. No meio, tudo o que entrou e saiu fica separado por forma de pagamento.',
    facts: [
      'Abertura com saldo em gaveta e lançamento de suprimento, sangria e devolução.',
      'Resumo do período: saldo inicial, vendas, entradas, saídas, devoluções, cancelamentos e total líquido.',
      'Vendas por dinheiro, débito, crédito, Pix e outros, cada uma com a sua participação em %.',
      'Conferência do dinheiro com sobra ou falta calculada, observação e bloqueio de fechamento em duplicidade.',
      'Histórico de fechamentos com detalhe somente leitura.',
    ],
  },
  {
    id: 'estoque',
    title: 'Estoque',
    shot: 'estoque',
    lead:
      'Produtos com preço, custo, categoria e estoque mínimo. O sistema destaca o que está acabando antes de faltar na prateleira.',
    facts: [
      'Entrada, saída e ajuste por contagem, com histórico de movimentações.',
      'Aviso de prejuízo quando o preço fica abaixo do custo.',
      'Filtros e busca por nome, código e situação do estoque.',
      'Pedido de compra e recebimento que dá entrada no estoque.',
      'Produto desativado fica fora da venda; item com histórico nunca é excluído.',
    ],
  },
  {
    id: 'financeiro',
    title: 'Financeiro e relatórios',
    shot: 'financeiro',
    shot2: 'relatorios',
    lead:
      'O Painel resume receita, custo, lucro e margem do período, com comparação com o período anterior. O financeiro cuida do que a loja deve e do que tem a receber.',
    facts: [
      'Painel com receita, custo, lucro, margem, ticket médio e produtos críticos.',
      'Ranking por lucro e por receita; análise por categoria, forma de pagamento e dia.',
      'Contas a pagar com pagamento parcial e controle de boletos; Contas a receber com baixa por parcela.',
      'Lançamentos por categoria e recorrentes, fornecedores e compras.',
      'Exporta listas e relatórios em CSV, Excel, Word e PDF.',
    ],
  },
  {
    id: 'atalhos',
    title: 'Atalhos e busca Ctrl+K',
    shot: null,
    lead:
      'Quase tudo se faz sem tirar a mão do teclado. A busca global abre uma paleta no centro da janela e leva você à tela certa em poucas teclas.',
    facts: [
      'Ctrl+K lista só as telas que o módulo ligado e a sua permissão deixam abrir.',
      'Ignora maiúsculas e acentos, e acha pelas iniciais: "cp" acha Contas a pagar.',
      'Com 2 ou mais letras também acha dados, como produtos, clientes e vendas.',
      'Ctrl+/ mostra a ajuda dos atalhos; todos são configuráveis, e você pode gravar os seus.',
      'Voltar e avançar com Alt+Seta, tela cheia em F11 e tema claro ou escuro em F10.',
    ],
  },
  {
    id: 'balanca',
    title: 'Balança e etiquetas',
    shot: 'balanca',
    lead:
      'Produtos vendidos por peso entram direto do equipamento. A balança Toledo Prix 3 Fit conversa com o PDV pela porta serial, e você testa a conexão antes de vender.',
    facts: [
      'Quatro variantes de protocolo, com porta, velocidade, paridade e casas decimais configuráveis.',
      'Teste de conexão com leitura real e exibição do quadro recebido.',
      'Mensagens claras para porta ocupada, inexistente, tempo esgotado ou queda de conexão.',
      'Leitor de código de barras com opção de adicionar 1 unidade ou perguntar a quantidade.',
    ],
  },
  {
    id: 'portal',
    title: 'Portal de pedidos e agenda',
    shot: 'site',
    lead:
      'A loja pode ter uma página própria onde clientes veem o catálogo e fazem pedidos. Os pedidos chegam ao PDV para você aceitar ou recusar. Com a Agenda de serviços, o cliente também pede horário.',
    facts: [
      'Módulo desligado por padrão e dependente do adicional "Página de pedidos".',
      'O PDV publica só o que mudou no catálogo e avisa o cliente pelo site.',
      'Contas de atacado e revenda só valem depois de aprovadas.',
      'Agenda para barbearia, estúdio de beleza e pet shop, com profissionais, pausas e horários livres.',
      'Agendamentos do portal podem ser confirmados, recusados, remarcados ou cancelados.',
    ],
  },
  {
    id: 'equipe',
    title: 'Equipe e controle',
    shot: 'integracoes',
    lead:
      'Cada pessoa vê e faz só o que o perfil permite. O que importa fica registrado, e o sistema se mantém atualizado e com cópia de segurança.',
    facts: [
      'Usuários, perfis e permissões; funcionários, ponto e comissões.',
      'Auditoria de ações e aviso ao administrador quando um item é cancelado.',
      'Desconto acima do limite do perfil pede a senha mestra.',
      'Várias unidades com transferência entre elas. O estoque separado por unidade ainda não é de ponta a ponta.',
      'Atualização segura do programa, backup automático e manual.',
    ],
  },
];

/** Telas reais do menu lateral (grupo = grupo do menu), para a demonstração do Ctrl+K. */
export const SCREENS = [
  { name: 'Painel', group: 'Início' },
  { name: 'Venda rápida', group: 'Vender' },
  { name: 'Comandas', group: 'Vender' },
  { name: 'Pedidos do portal', group: 'Vender' },
  { name: 'Agenda', group: 'Vender' },
  { name: 'Produtos', group: 'Estoque' },
  { name: 'Movimentações', group: 'Estoque' },
  { name: 'Compras', group: 'Compras' },
  { name: 'Fornecedores', group: 'Compras' },
  { name: 'Clientes', group: 'Clientes' },
  { name: 'Fiado', group: 'Clientes' },
  { name: 'Orçamentos', group: 'Clientes' },
  { name: 'Contas a pagar', group: 'Financeiro' },
  { name: 'Contas a receber', group: 'Financeiro' },
  { name: 'Fechamento de caixa', group: 'Financeiro' },
  { name: 'Funcionários', group: 'Equipe' },
  { name: 'Configurações', group: 'Sistema' },
];

/** Produtos do simulador (preço em centavos). */
export const PRODUCTS = [
  { id: 'cafe', name: 'Café coado', price: 450 },
  { id: 'pao', name: 'Pão de queijo', price: 590 },
  { id: 'suco', name: 'Suco natural', price: 890 },
  { id: 'agua', name: 'Água 500 ml', price: 350 },
  { id: 'sand', name: 'Sanduíche', price: 1790 },
  { id: 'bolo', name: 'Fatia de bolo', price: 1250 },
  { id: 'cook', name: 'Cookie', price: 780 },
  { id: 'refri', name: 'Refrigerante', price: 690 },
];

/** Vendas do dia por forma de pagamento (centavos), para a demonstração do fechamento. */
export const CASH_SALES = [
  { id: 'dinheiro', label: 'Dinheiro', value: 184050 },
  { id: 'debito', label: 'Débito', value: 126400 },
  { id: 'credito', label: 'Crédito', value: 213900 },
  { id: 'pix', label: 'Pix', value: 159200 },
  { id: 'outros', label: 'Outros', value: 12000 },
];
export const CASH_OPENING = 20000;

/** Produtos da demonstração de estoque. */
export const STOCK_PRODUCTS = [
  { id: 'cafe', name: 'Café 500 g', stock: 24, min: 8 },
  { id: 'leite', name: 'Leite integral 1 L', stock: 36, min: 12 },
  { id: 'arroz', name: 'Arroz 5 kg', stock: 18, min: 6 },
  { id: 'oleo', name: 'Óleo de soja 900 ml', stock: 15, min: 5 },
  { id: 'acucar', name: 'Açúcar 1 kg', stock: 20, min: 8 },
];
