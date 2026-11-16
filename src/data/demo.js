/* Roteiro do "como funciona": cinco cenas, ~5,6 s cada (≈ 28 s o ciclo). */

export const SCENE_MS = 5600;

export const SCENES = [
  {
    id: 'ideia',
    title: 'Você conta a ideia',
    text: 'Pelo formulário do site ou pelo WhatsApp, do jeito que for mais fácil. Não precisa ter nada definido.',
  },
  {
    id: 'proposta',
    title: 'Escopo e proposta',
    text: 'A gente transforma a conversa em escopo, etapas e orçamento. Você só começa se aprovar.',
  },
  {
    id: 'etapas',
    title: 'Desenvolvimento por etapas',
    text: 'Cada etapa entregue aparece na sua área do cliente, com mensagens ligadas ao projeto.',
  },
  {
    id: 'testes',
    title: 'Testes',
    text: 'Antes de ir para o ar, conferimos cada fluxo no computador e no celular.',
  },
  {
    id: 'no-ar',
    title: 'No ar',
    text: 'O projeto entra em uso, e a gente segue ajustando conforme a sua operação pede.',
  },
];
