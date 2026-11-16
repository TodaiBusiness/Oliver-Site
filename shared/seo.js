/* =========================================================================
   Título e descrição de cada rota (P-008 do site, aprovado pelo dono em
   20/10/2026). Fonte única: o React troca o <head> quando a rota muda
   (src/app/RouteSeo.jsx) e o servidor Node troca o <title> e as metas do
   index.html antes de enviar (server.js), para buscadores e prévias de link
   que não rodam JavaScript verem o título certo.
   ========================================================================= */

import { PLAN } from './plan.js';

const COMPANY = 'TODAI';
const PRICE = `instalação de R$ ${PLAN.installPrice} e mensalidade a partir de R$ ${PLAN.basePrice}`;

/** Rotas públicas: aparecem no Google. */
const PUBLIC = {
  '/': {
    title: `${COMPANY} | Sistemas, sites e software sob medida`,
    description: `${PLAN.name}, sistema pronto de estoque, caixa e vendas para lojas, e landing pages, sites e sistemas sob medida. Peça um orçamento à ${COMPANY}.`,
  },
  '/sistema': {
    title: `${PLAN.name} | Estoque, caixa e vendas para a sua loja`,
    description: `Sistema para Windows com estoque, comandas, caixa e resultado da loja num só lugar. ${PRICE}. Da ${COMPANY}.`,
  },
  '/precos': {
    title: `Preços | ${PLAN.name} e serviços sob orçamento | ${COMPANY}`,
    description: `${PRICE} no ${PLAN.name}. Landing pages, sites e sistemas sob medida saem em proposta, sem compromisso.`,
  },
  '/servicos': {
    title: `Serviços: landing page, site ou sistema | ${COMPANY}`,
    description: `Entenda a diferença entre landing page, site completo e SaaS ou sistema sob medida, compare lado a lado e veja qual serve ao seu caso.`,
  },
  '/servicos/landing-pages': {
    title: `Landing pages sob medida | ${COMPANY}`,
    description: `Uma página feita para uma ação só: captar contatos, vender uma oferta ou divulgar um lançamento. Peça um orçamento.`,
  },
  '/servicos/sites': {
    title: `Criação de sites completos | ${COMPANY}`,
    description: `Sites com várias páginas para apresentar a empresa, mostrar projetos e ser encontrada no Google. Peça um orçamento.`,
  },
  '/servicos/saas': {
    title: `SaaS e sistemas sob medida | ${COMPANY}`,
    description: `Sistemas com login, banco de dados e regras do seu negócio, entregues em etapas e acompanhados na área do cliente. Peça um orçamento.`,
  },
  '/projetos': {
    title: `Projetos | ${COMPANY}`,
    description: `Sistemas em uso e projetos em desenvolvimento da ${COMPANY}: o problema, a solução e as funcionalidades de cada um.`,
  },
  '/como-funciona': {
    title: `Como funciona | ${COMPANY}`,
    description: `Da primeira conversa ao projeto no ar: ideia, proposta, desenvolvimento por etapas com acompanhamento, testes e entrega.`,
  },
  '/contato': {
    title: `Contato e orçamento | ${COMPANY}`,
    description: `Conte o que você precisa por WhatsApp, e-mail ou formulário e receba uma proposta da ${COMPANY}.`,
  },
  '/comprar': {
    title: `Comprar o ${PLAN.name} | ${COMPANY}`,
    description: `Assine o ${PLAN.name}: ${PRICE}. Pagamento pelo Mercado Pago e código de ativação por e-mail.`,
  },
  '/baixar': {
    title: `Baixar o ${PLAN.name} | Instalador para Windows`,
    description: `Instalador do ${PLAN.name} para Windows 10 ou 11. Depois de instalar, ative com o código recebido por e-mail.`,
  },
  '/termos': {
    title: `Termos de uso | ${COMPANY}`,
    description: `Termos de uso do ${PLAN.name} e dos serviços da ${COMPANY}.`,
  },
  '/privacidade': {
    title: `Política de privacidade | ${COMPANY}`,
    description: `Como a ${COMPANY} trata os dados de quem compra e usa o ${PLAN.name}.`,
  },
};

/** Rotas de conta e de painel: título próprio, fora dos buscadores. */
const PRIVATE = [
  ['/obrigado', `Compra recebida | ${PLAN.name}`],
  ['/minha-licenca', `Minha licença | ${PLAN.name}`],
  ['/login', `Entrar | ${COMPANY}`],
  ['/cadastro', `Criar conta | ${COMPANY}`],
  ['/area-do-cliente', `Área do cliente | ${COMPANY}`],
  ['/cliente', `Área do cliente | ${COMPANY}`],
  ['/admin', `Painel | ${COMPANY}`],
];

const NOT_FOUND = { title: `Página não encontrada | ${COMPANY}`, description: PUBLIC['/'].description, noindex: true, notFound: true };

/** Caminho normalizado como o React Router: sem barra final e sem diferenciar maiúsculas. */
export function normalizeSeoPath(pathname) {
  return (pathname || '/').replace(/\/+$/, '').toLowerCase() || '/';
}

/** Título, descrição e se a página fica fora dos buscadores, para um caminho. */
export function seoFor(pathname) {
  const path = normalizeSeoPath(pathname);
  if (PUBLIC[path]) return { ...PUBLIC[path], noindex: false };
  const privado = PRIVATE.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  if (privado) return { title: privado[1], description: PUBLIC['/'].description, noindex: true };
  return NOT_FOUND;
}

const escapeHtml = (text) =>
  String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Troca no index.html (já com a URL do site no lugar de __SITE_URL__) o título, as descrições, o canonical e as
 * URLs do Open Graph pelo da rota pedida, e põe `noindex` nas rotas privadas. Só mexe nas tags que o index.html
 * tem; o resto da página sai igual.
 */
export function applySeo(html, pathname) {
  const seo = seoFor(pathname);
  const path = normalizeSeoPath(pathname);
  const title = escapeHtml(seo.title);
  const description = escapeHtml(seo.description);
  const pathAttr = escapeHtml(path === '/' ? '/' : path);
  let out = html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/, `$1${title}$2`)
    .replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/, `$1${description}$2`)
    .replace(/(<link\s+rel="canonical"\s+href="[^"]*?)\/?(")/, (_, abre, fecha) => `${abre}${pathAttr}${fecha}`)
    .replace(/(<meta\s+property="og:url"\s+content="[^"]*?)\/?(")/, (_, abre, fecha) => `${abre}${pathAttr}${fecha}`);
  if (seo.noindex) out = out.replace('</head>', '  <meta name="robots" content="noindex" />\n  </head>');
  return out;
}

/** Dados do <head> da rota para a navegação interna (SPA): mesma regra do applySeo, sem tocar no DOM. */
export function seoHeadFor(pathname, baseUrl) {
  const seo = seoFor(pathname);
  return {
    title: seo.title,
    description: seo.description,
    robots: seo.noindex ? 'noindex' : 'index, follow',
    url: `${baseUrl}${normalizeSeoPath(pathname)}`,
  };
}
