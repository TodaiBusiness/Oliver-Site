/* =========================================================================
   Regras de apresentação da conversa que não dependem de React (testáveis).
   ========================================================================= */

/** Mensagens seguidas do mesmo autor, até este intervalo, dividem o cabeçalho. */
export const AGRUPAR_ATE_MS = 5 * 60 * 1000;

/** Nome do usuário de sistema que assina as respostas do Panel no banco. */
export const NOME_SISTEMA = 'TODAI Atendimento';

/* Respostas do Panel dividem o mesmo author_id (usuário de sistema): o que
   distingue um admin do outro é o nome. */
export const mesmoAutor = (a, b) =>
  a.author_id === b.author_id &&
  (a.author_external_name ?? null) === (b.author_external_name ?? null);

/** `anterior` e `atual` estão no mesmo dia (quem chama já agrupa por dia). */
export const deveAgrupar = (anterior, atual) =>
  Boolean(anterior) &&
  mesmoAutor(anterior, atual) &&
  Math.abs(Number(atual.created_at) - Number(anterior.created_at)) <= AGRUPAR_ATE_MS;

/**
 * Como a equipe aparece para o cliente.
 *  · resposta do Panel ........ "Kaique · TODAI"
 *  · admin do site ............ "Nome" + etiqueta TODAI
 *  · usuário de sistema sem nome "Equipe TODAI"
 */
export function autorDaEquipe(mensagem) {
  const externo = mensagem.author_external_name;
  if (externo) return { nome: `${externo} · TODAI`, inicial: externo, etiqueta: false };
  if (!mensagem.author_name || mensagem.author_name === NOME_SISTEMA) {
    return { nome: 'Equipe TODAI', inicial: 'T', etiqueta: false };
  }
  return { nome: mensagem.author_name, inicial: mensagem.author_name, etiqueta: true };
}

/** Está (quase) no fim da lista? Decide se uma mensagem nova rola sozinha. */
export const pertoDoFim = (el, margem = 96) =>
  !el || el.scrollHeight - el.scrollTop - el.clientHeight <= margem;

/** Texto do indicador de conexão. */
export function rotuloDeConexao(status) {
  switch (status) {
    case 'conectado':
      return 'Ao vivo';
    case 'reconectando':
      return 'Reconectando…';
    case 'conectando':
      return 'Conectando…';
    case 'pausado':
      return 'Em pausa';
    default:
      return 'Atualiza a cada 30 s';
  }
}
