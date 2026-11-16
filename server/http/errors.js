/* =========================================================================
   Erros da aplicação.
   Checklist "Erros": exceção tratada, com mensagem adequada e sem vazar
   detalhe interno para o cliente.
   ========================================================================= */

export class AppError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) =>
  new AppError(400, 'DADOS_INVALIDOS', message, details);

export const unauthorized = (message = 'Faça login para continuar.') =>
  new AppError(401, 'NAO_AUTENTICADO', message);

/* 404 (e não 403) quando o recurso é de outra pessoa: responder "existe, mas
   você não pode" já entrega informação. */
export const notFound = (message = 'Recurso não encontrado.') =>
  new AppError(404, 'NAO_ENCONTRADO', message);

export const forbidden = (message = 'Você não tem acesso a este recurso.') =>
  new AppError(403, 'SEM_PERMISSAO', message);

export const conflict = (message) => new AppError(409, 'CONFLITO', message);

/** `retryAfterSeconds` (opcional) vira o cabeçalho Retry-After e `details`. */
export const tooManyRequests = (message, retryAfterSeconds = null) => {
  const error = new AppError(429, 'MUITAS_TENTATIVAS', message);
  if (retryAfterSeconds) error.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds));
  return error;
};
