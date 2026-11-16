/* =========================================================================
   PROJETOS: o que a TODAI construiu.
   -------------------------------------------------------------------------
   Cada projeto usa uma captura real. `image` é o caminho base em public/ sem
   o tema e sem a extensão: o site carrega <image>-escuro.webp ou
   <image>-claro.webp conforme o tema do visitante. `gallery` segue a mesma
   regra e aparece no detalhe.

   Campos: id, title, tagline, category, status, technologies, image, imageAlt,
   featured, gallery, problem, solution, features, link.
   `link: null` esconde o botão "Abrir projeto" em vez de gerar link morto.
   ========================================================================= */

export const projects = [
  {
    id: 'erp',
    title: 'Sistema de Gestão Empresarial',
    tagline: 'Estoque, vendas, PDV e comandas em um sistema só.',
    category: 'Sistema Desktop',
    status: 'Pronto',
    technologies: ['C#', 'PostgreSQL', 'PDV', 'Estoque', 'Comandas'],
    image: '/sistema/painel',
    imageAlt:
      'Painel do TODAI com os filtros do período e a tabela de caixas abertos, com vendas e total por forma de pagamento.',
    featured: true,
    gallery: ['/sistema/comandas', '/sistema/caixa', '/sistema/estoque'],
    problem:
      'Venda, estoque e comandas viviam em fluxos separados, obrigando a repetir a mesma informação em mais de um lugar e dificultando enxergar a operação como um todo.',
    solution:
      'Um sistema integrado onde o mesmo cadastro alimenta o PDV, o controle de estoque e o fechamento de comandas, com os dados centralizados em um banco PostgreSQL.',
    features: [
      'Controle de estoque',
      'Registro de vendas',
      'PDV',
      'Comandas',
      'Banco de dados PostgreSQL',
      'Relatórios operacionais',
    ],
    link: null,
  },
  {
    id: 'site-institucional',
    title: 'Site Institucional',
    tagline: 'Presença digital responsiva e rápida.',
    category: 'Web',
    status: 'Entregue',
    technologies: ['HTML', 'CSS', 'JavaScript', 'Netlify'],
    image: '/sistema/site',
    imageAlt:
      'Página inicial do site da TODAI, com o título, os botões de compra e uma tela do sistema.',
    featured: false,
    gallery: [],
    problem:
      'A empresa não tinha uma presença digital que correspondesse ao nível do trabalho que entrega.',
    solution:
      'Site institucional moderno e responsivo, construído para carregar rápido e funcionar bem em qualquer tela, publicado com deploy contínuo.',
    features: [
      'Layout responsivo',
      'Performance otimizada',
      'Estrutura para SEO',
      'Deploy contínuo',
    ],
    link: null,
  },
  {
    id: 'integracoes-delivery',
    title: 'Integrações de delivery',
    tagline: 'Pedidos de iFood e 99Food na Central de Delivery do sistema.',
    category: 'Integração',
    status: 'Em desenvolvimento',
    technologies: ['C#', 'APIs', 'iFood', '99Food'],
    image: '/sistema/integracoes',
    imageAlt:
      'Tela Integrações de delivery do TODAI, com os cartões do iFood e da 99Food e o botão Conectar com código.',
    featured: false,
    gallery: [],
    problem:
      'Pedidos de aplicativos de delivery chegam por canais separados do sistema e precisam ser conferidos e lançados à mão.',
    solution:
      'Conexão com a conta oficial da loja para receber os pedidos na Central de Delivery. Os dados de acesso ficam protegidos no computador da loja.',
    features: [
      'Conexão com a conta oficial do iFood por código',
      'Conexão com a 99Food, quando o acesso for liberado',
      'Central de Delivery para receber os pedidos',
      'Conexão manual para casos avançados',
    ],
    link: null,
  },
];

export const featuredProject = projects.find((p) => p.featured) ?? projects[0];
export const otherProjects = projects.filter((p) => p.id !== featuredProject.id);
