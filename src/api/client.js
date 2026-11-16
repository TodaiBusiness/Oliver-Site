/* =========================================================================
   Cliente HTTP da API.
   -------------------------------------------------------------------------
   `credentials: 'same-origin'` faz o cookie de sessão viajar sozinho. O token
   NUNCA passa por localStorage nem por JavaScript — ele é HttpOnly, então
   nem este arquivo consegue lê-lo. É essa a intenção.
   ========================================================================= */

const BASE = '/api';

/** Disparado quando uma chamada autenticada volta 401. */
export const SESSION_EXPIRED_EVENT = 'todai:session-expired';

/** Erro com o status e os detalhes por campo devolvidos pelo servidor. */
export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details ?? null;
  }
}

async function request(method, path, body) {
  let response;

  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    /* Falha de rede não pode virar tela branca. */
    throw new ApiError(0, 'SEM_CONEXAO', 'Não foi possível falar com o servidor.');
  }

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError(response.status, 'RESPOSTA_INVALIDA', 'Resposta inesperada.');
    }
  }

  if (!response.ok) {
    /* Sessão que caiu (inatividade, troca de senha em outro aparelho, "sair de
       todos"): avisa o AuthContext para voltar ao login em vez de deixar a tela
       cheia de erros. As rotas de entrada têm o seu próprio 401. */
    if (response.status === 401 && !path.startsWith('/auth/login') && path !== '/auth/me') {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
    throw new ApiError(
      response.status,
      payload.error ?? 'ERRO',
      payload.message ?? 'Algo deu errado.',
      payload.details
    );
  }

  return payload;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  put: (path, body) => request('PUT', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  delete: (path) => request('DELETE', path),
};

/** Monta querystring ignorando valores vazios. */
export function withQuery(path, params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}
