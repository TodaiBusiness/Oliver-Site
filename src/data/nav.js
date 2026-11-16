/* =========================================================================
   Navegação do site público: uma fonte só para o menu, o rodapé e as telas
   que apontam para os serviços. Cada serviço mora em /servicos/<slug>.
   ========================================================================= */

export const SERVICES_NAV = [
  {
    slug: 'landing-pages',
    to: '/servicos/landing-pages',
    label: 'Landing pages',
    hint: 'Uma página para uma ação: captar contatos ou vender uma oferta.',
  },
  {
    slug: 'sites',
    to: '/servicos/sites',
    label: 'Sites',
    hint: 'Várias páginas para apresentar a empresa e ser encontrada.',
  },
  {
    slug: 'saas',
    to: '/servicos/saas',
    label: 'SaaS e sistemas',
    hint: 'Sistema com login, dados e regras, usado todo dia.',
  },
];

/** Links principais do menu. `services: true` abre o submenu de serviços. */
export const MAIN_NAV = [
  { label: 'Início', to: '/', end: true },
  { label: 'Sistema', to: '/sistema' },
  { label: 'Serviços', to: '/servicos', services: true },
  { label: 'Projetos', to: '/projetos' },
  { label: 'Como funciona', to: '/como-funciona' },
  { label: 'Preços', to: '/precos' },
];

/** Colunas do rodapé, por grupo. */
export const FOOTER_GROUPS = [
  {
    title: 'Sistema TODAI',
    links: [
      { label: 'Conhecer o sistema', to: '/sistema' },
      { label: 'Preços', to: '/precos' },
      { label: 'Comprar', to: '/comprar' },
      { label: 'Baixar', to: '/baixar' },
      { label: 'Minha licença', to: '/minha-licenca' },
    ],
  },
  {
    title: 'Serviços',
    links: [
      { label: 'Comparar os três', to: '/servicos' },
      ...SERVICES_NAV.map(({ label, to }) => ({ label, to })),
    ],
  },
  {
    title: 'Empresa',
    links: [
      { label: 'Projetos', to: '/projetos' },
      { label: 'Como funciona', to: '/como-funciona' },
      { label: 'Área do cliente', to: '/area-do-cliente' },
      { label: 'Contato', to: '/contato' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Termos de uso', to: '/termos' },
      { label: 'Privacidade', to: '/privacidade' },
    ],
  },
];
