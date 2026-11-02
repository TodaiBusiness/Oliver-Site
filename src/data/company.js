/* =========================================================================
   CONFIGURAÇÃO CENTRAL DA EMPRESA
   -------------------------------------------------------------------------
   >>> ESTE É O ÚNICO ARQUIVO QUE VOCÊ PRECISA EDITAR PARA MUDAR SEUS DADOS.
   Nome, e-mail e WhatsApp são lidos daqui pelo site inteiro.
   ========================================================================= */

/**
 * WhatsApp em FORMATO INTERNACIONAL, somente números.
 * Estrutura: código do país + DDD + número.
 * Atual: (12) 98823-2512 → 55 + 12 + 988232512
 */
export const WHATSAPP_NUMBER = '5512988232512';

/**
 * E-mail de contato.
 * Pode vir de variável de ambiente (`VITE_COMPANY_EMAIL` no .env) para não
 * ficar fixo no código quando você tiver o endereço oficial da TODAI.
 * Enquanto não houver, cai no endereço informado anteriormente.
 */
export const EMAIL =
  import.meta.env?.VITE_COMPANY_EMAIL || 'vendas@todai.com.br';

/** Nome da empresa exibido no site inteiro (header, footer, títulos, SEO). */
export const COMPANY_NAME = 'TODAI';

/**
 * Razão social que aparece nos Termos de uso e na Política de privacidade
 * (informada pelo dono em 20/10/2026). CNPJ e endereço ainda não existem:
 * quando existirem, entram aqui (LEGAL_TAX_ID, LEGAL_ADDRESS) e nos textos.
 */
export const LEGAL_NAME = 'Nexus Soluções Tecnológicas Ltda';

export const company = {
  name: COMPANY_NAME,
  email: EMAIL,
  whatsapp: WHATSAPP_NUMBER,
  tagline: 'Desenvolvimento de software e soluções digitais',
  description:
    'Desenvolvemos sistemas, sites, automações e soluções digitais sob medida, com foco em performance, experiência do usuário e crescimento.',
};

/**
 * Mensagens pré-preenchidas do WhatsApp.
 * O funil gera a sua própria mensagem dinamicamente — ver `src/data/funnel.js`.
 */
export const WHATSAPP_MESSAGES = {
  default: `Olá! Vi o site da ${COMPANY_NAME} e gostaria de conhecer melhor os projetos e soluções de software.`,
  project: `Olá! Vi o site da ${COMPANY_NAME} e gostaria de conversar sobre um projeto de software.`,
  contact: `Olá! Vim pelo site da ${COMPANY_NAME} e gostaria de entrar em contato.`,
  floating: `Olá! Vim pelo site da ${COMPANY_NAME} e gostaria de conhecer os serviços.`,
  clientArea: `Olá! Vim pelo site da ${COMPANY_NAME} e gostaria de solicitar acesso à área do cliente.`,
  /* Completado com o nome do projeto no modal de detalhe. */
  projectPrefix: `Olá! Vi o site da ${COMPANY_NAME} e me interessei pelo projeto`,
};

/** Itens do menu de navegação (usados no header e no footer). */
export const NAV_LINKS = [
  { label: 'Início', href: '#inicio' },
  { label: 'Sistema', href: '#sistema' },
  { label: 'Preço', href: '#preco' },
  { label: 'Sob medida', href: '#projetos' },
  { label: 'Contato', href: '#contato' },
];
