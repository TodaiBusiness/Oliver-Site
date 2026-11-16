/* =========================================================================
   Serviços sob orçamento: landing page, site completo e SaaS/sistema.
   -------------------------------------------------------------------------
   Nenhum valor ou prazo é prometido aqui: o preço e o prazo saem da proposta,
   depois que a gente entende o que o projeto precisa. O que muda o preço de
   cada serviço está em `pricingFactors`.
   ========================================================================= */

import { COMPANY_NAME } from './company.js';

export const SERVICES = [
  {
    slug: 'landing-pages',
    to: '/servicos/landing-pages',
    name: 'Landing page',
    plural: 'Landing pages',
    short: 'Uma página, uma ação.',
    summary:
      'Uma página única, feita para uma ação só: pedir orçamento, agendar, se inscrever ou comprar.',
    h1: 'Uma página feita para uma ação só.',
    lead:
      'A landing page tira o visitante do caminho e leva ele ao que importa: o contato, a inscrição ou a compra. Ideal para campanha, oferta e lançamento.',
    whatIs: [
      'É uma página única, sem menu com dezenas de links, que conta uma coisa e termina num botão ou formulário.',
      'Você manda o tráfego dos anúncios, do Instagram ou do WhatsApp para ela e mede o que chegou.',
    ],
    forWho: [
      'Quem vai anunciar e precisa de um destino claro para o anúncio.',
      'Quem lança um produto, curso, evento ou promoção por tempo limitado.',
      'Quem hoje recebe pedidos só por mensagem e quer um jeito organizado de começar a conversa.',
    ],
    includes: [
      'Texto e estrutura pensados para a ação que você quer.',
      'Layout responsivo, que funciona bem no celular.',
      'Formulário ou botão de WhatsApp com mensagem já preenchida.',
      'Carregamento rápido e título e descrição para buscadores.',
      'Publicação no seu domínio.',
    ],
    notIncludes: ['Loja com carrinho e muitos produtos', 'Área com login para clientes', 'Blog com muitas páginas'],
    delivery: {
      caption: 'Estrutura típica de uma landing page',
      blocks: [
        { label: 'Chamada principal e botão', size: 'lg' },
        { label: 'O que você ganha', size: 'md' },
        { label: 'Como funciona', size: 'md' },
        { label: 'Dúvidas frequentes', size: 'sm' },
        { label: 'Formulário ou WhatsApp', size: 'lg', accent: true },
      ],
    },
    process: [
      { title: 'Conversa', text: 'Você conta a oferta, o público e o que quer que a pessoa faça.' },
      { title: 'Estrutura e texto', text: 'Montamos a ordem das seções e escrevemos junto com você.' },
      { title: 'Desenho e código', text: 'Você aprova o visual e a página é construída.' },
      { title: 'Teste e publicação', text: 'Conferimos em celular e computador e colocamos no ar.' },
    ],
    pricingFactors: [
      'Quantidade de seções e de textos a escrever',
      'Se você já tem identidade visual e imagens',
      'Integrações com formulário, WhatsApp ou ferramenta de anúncios',
    ],
    faq: [
      {
        q: 'Preciso ter o texto pronto?',
        a: 'Não. Você explica a oferta e a gente ajuda a transformar isso em texto. Se você já tem material, usamos como base.',
      },
      {
        q: 'Dá para medir os resultados?',
        a: 'Sim. A página pode ter os eventos de clique e envio de formulário prontos para a sua ferramenta de métricas.',
      },
      {
        q: 'Depois posso transformar em um site completo?',
        a: 'Pode. A landing page vira a página inicial e as outras páginas entram aos poucos, sem refazer o que já existe.',
      },
    ],
    whatsapp: `Olá! Vi o site da ${COMPANY_NAME} e quero um orçamento de landing page.`,
  },
  {
    slug: 'sites',
    to: '/servicos/sites',
    name: 'Site completo',
    plural: 'Sites',
    short: 'A empresa inteira, apresentada.',
    summary:
      'Várias páginas para mostrar quem você é, o que faz, os serviços, os projetos e como falar com você.',
    h1: 'O site que apresenta a empresa inteira.',
    lead:
      'Um site completo é o endereço da sua empresa na internet: quem é, o que faz, o que já entregou e como contratar. Feito para ser encontrado no Google e para passar confiança.',
    whatIs: [
      'É um conjunto de páginas ligadas por um menu: início, serviços, sobre, projetos, contato e o que mais fizer sentido.',
      'Funciona como cartão de visita permanente, que você atualiza sem depender de redes sociais.',
    ],
    forWho: [
      'Empresas que querem ser encontradas por quem busca o serviço no Google.',
      'Profissionais e escritórios que precisam mostrar trabalhos e credenciais.',
      'Quem já tem uma landing page e quer crescer para uma presença completa.',
    ],
    includes: [
      'Mapa do site com as páginas que o seu negócio realmente precisa.',
      'Layout responsivo e identidade visual aplicada em todas as páginas.',
      'Estrutura para buscadores: títulos, descrições e endereços limpos.',
      'Formulário de contato e botão de WhatsApp.',
      'Publicação, domínio e orientação para você mesmo editar o que mudar com frequência.',
    ],
    notIncludes: ['Login e área restrita com regras de acesso', 'Cobrança recorrente e assinaturas', 'Painéis com dados em tempo real'],
    delivery: {
      caption: 'Mapa típico de um site completo',
      sitemap: [
        { label: 'Início', children: ['Destaques', 'Chamada para contato'] },
        { label: 'Serviços', children: ['Um para cada serviço'] },
        { label: 'Sobre', children: ['História', 'Equipe'] },
        { label: 'Projetos', children: ['Casos e imagens'] },
        { label: 'Contato', children: ['Formulário', 'WhatsApp'] },
      ],
    },
    process: [
      { title: 'Conversa', text: 'Entendemos o negócio, o público e o que o site precisa resolver.' },
      { title: 'Mapa e conteúdo', text: 'Definimos as páginas e juntamos textos e imagens.' },
      { title: 'Design e desenvolvimento', text: 'Você aprova o visual de páginas-chave antes de o resto ser construído.' },
      { title: 'Revisão e publicação', text: 'Testamos em vários aparelhos, ajustamos e publicamos.' },
    ],
    pricingFactors: [
      'Número de páginas e de seções em cada uma',
      'Quantidade de conteúdo novo a escrever ou fotografar',
      'Recursos extras, como blog, galeria ou integrações',
    ],
    faq: [
      {
        q: 'Qual a diferença para uma landing page?',
        a: 'A landing page tem um objetivo só e uma página. O site completo tem várias páginas e cobre tudo o que a empresa precisa mostrar.',
      },
      {
        q: 'Consigo mudar textos e fotos depois?',
        a: 'Sim. Combinamos no início como você quer atualizar o site e deixamos isso simples, ou cuidamos das mudanças para você.',
      },
      {
        q: 'O site aparece no Google?',
        a: 'Construímos a base para isso: estrutura, velocidade e descrições. Aparecer bem nas buscas também depende de conteúdo e do tempo.',
      },
    ],
    whatsapp: `Olá! Vi o site da ${COMPANY_NAME} e quero um orçamento de site completo.`,
  },
  {
    slug: 'saas',
    to: '/servicos/saas',
    name: 'SaaS e sistema',
    plural: 'SaaS e sistemas',
    short: 'Um sistema que o cliente usa todo dia.',
    summary:
      'Um sistema com login, banco de dados e regras de negócio, que você usa na operação ou vende como assinatura.',
    h1: 'Um sistema feito para o jeito que o seu negócio funciona.',
    lead:
      'Quando planilha, mensagem e papel já não dão conta, é hora de um sistema. Nós desenhamos, construímos e evoluímos o software junto com a sua operação, ou o seu produto de assinatura.',
    whatIs: [
      'SaaS é um software acessado pelo navegador, com conta de usuário, que as pessoas usam de forma recorrente. Pode ser interno, para a sua equipe, ou um produto que você vende.',
      'Um sistema complexo reúne cadastros, regras, relatórios e integrações num único lugar, com permissões por perfil.',
    ],
    forWho: [
      'Empresas que controlam a operação em planilhas e querem organizar tudo.',
      'Quem tem uma ideia de produto digital e precisa de uma primeira versão que funcione.',
      'Negócios que precisam ligar sistemas que já usam, como pagamentos, notas ou entregas.',
    ],
    includes: [
      'Levantamento do processo e definição do que entra na primeira versão.',
      'Login, perfis de acesso e banco de dados.',
      'Telas e regras desenhadas para o seu fluxo, não para um fluxo genérico.',
      'Entrega em etapas, com acompanhamento na área do cliente.',
      'Testes antes de cada entrega e suporte depois que entra em uso.',
    ],
    notIncludes: ['Uma versão final fechada no primeiro dia: o sistema cresce em etapas', 'Aplicativo nas lojas de celular, a combinar à parte'],
    delivery: {
      caption: 'Peças típicas de um sistema',
      parts: [
        { label: 'Login e perfis', detail: 'Quem entra e o que cada um vê' },
        { label: 'Cadastros', detail: 'Clientes, produtos, pedidos' },
        { label: 'Regras do negócio', detail: 'O que o sistema decide sozinho' },
        { label: 'Relatórios', detail: 'Os números de que você precisa' },
        { label: 'Integrações', detail: 'Pagamento, e-mail, outros sistemas' },
      ],
    },
    process: [
      { title: 'Descoberta', text: 'Mapeamos como a operação funciona hoje e onde ela trava.' },
      { title: 'Escopo e proposta', text: 'Definimos o que entra primeiro, as etapas e o orçamento.' },
      { title: 'Desenvolvimento em etapas', text: 'Entregamos por partes, e você acompanha e valida cada uma.' },
      { title: 'Testes', text: 'Validamos cada fluxo antes de usar com dados reais.' },
      { title: 'No ar e evolução', text: 'Colocamos em uso e seguimos melhorando conforme a operação pede.' },
    ],
    pricingFactors: [
      'Quantidade de telas, cadastros e regras de negócio',
      'Integrações com outros sistemas e serviços',
      'Perfis de usuário e nível de segurança exigido',
      'Se é uso interno ou um produto vendido a vários clientes',
    ],
    faq: [
      {
        q: 'Por onde começamos, se o sistema é grande?',
        a: 'Pela parte que mais dói hoje. A primeira etapa é pequena e já entra em uso. As outras vêm depois, na ordem que fizer sentido.',
      },
      {
        q: 'O código fica comigo?',
        a: 'Isso é combinado na proposta, antes de começar. Deixamos claro o que é seu e como funciona a manutenção.',
      },
      {
        q: 'Vocês cuidam do sistema depois de pronto?',
        a: 'Sim. Corrigimos, ajustamos e evoluímos, com o combinado de suporte escrito na proposta.',
      },
    ],
    whatsapp: `Olá! Vi o site da ${COMPANY_NAME} e quero um orçamento de sistema ou SaaS.`,
  },
];

export const SERVICE_BY_SLUG = Object.fromEntries(SERVICES.map((service) => [service.slug, service]));

/** Linhas da tabela comparativa. `values` segue a ordem de SERVICES. */
export const COMPARISON = [
  { label: 'Serve para', values: ['Uma campanha, oferta ou lançamento', 'Apresentar a empresa e ser encontrada', 'Operar ou vender um software'] },
  { label: 'Tamanho', values: ['Uma página', 'Várias páginas', 'Várias telas, com dados'] },
  { label: 'Login de usuários', values: ['Não', 'Normalmente não', 'Sim, com perfis de acesso'] },
  { label: 'Banco de dados', values: ['Não precisa', 'Só para formulários', 'Sim, é o centro do sistema'] },
  { label: 'Entrega', values: ['Uma vez', 'Uma vez, com ajustes depois', 'Em etapas, com evolução contínua'] },
  { label: 'Orçamento', values: ['Sob orçamento', 'Sob orçamento', 'Sob orçamento'] },
];

/** "Qual escolher?": a necessidade do visitante aponta para um serviço. */
export const CHOOSER = [
  { id: 'campanha', text: 'Vou anunciar uma oferta ou lançamento', slug: 'landing-pages' },
  { id: 'captar', text: 'Quero que as pessoas me chamem pelo WhatsApp ou formulário', slug: 'landing-pages' },
  { id: 'empresa', text: 'Quero apresentar a empresa e aparecer no Google', slug: 'sites' },
  { id: 'portfolio', text: 'Preciso mostrar trabalhos, equipe e serviços', slug: 'sites' },
  { id: 'operacao', text: 'Quero controlar a operação num só lugar', slug: 'saas' },
  { id: 'produto', text: 'Tenho uma ideia de produto para vender por assinatura', slug: 'saas' },
];
