/* =========================================================================
   Cliente HTTP do portal da loja (/api/portal/:slug/...).
   Separado de api/client.js: a sessão do portal é OUTRA (cookie oi_portal_<slug>),
   e um 401 aqui não derruba a conta do site. Toda escrita leva X-Portal-Request,
   que o servidor exige (um site de terceiros não consegue enviá-lo).
   ========================================================================= */

import { ApiError } from './client.js';

export const PORTAL_SESSION_EXPIRED = 'todai:portal-session-expired';

async function request(slug, method, path, body) {
  let response;
  try {
    response = await fetch(`/api/portal/${encodeURIComponent(slug)}${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        'X-Portal-Request': '1',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'SEM_CONEXAO', 'Sem conexão. Confira a internet e tente de novo.');
  }

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError(response.status, 'RESPOSTA_INVALIDA', 'Resposta inesperada. Tente de novo.');
    }
  }

  if (!response.ok) {
    /* 401 em rota que exige sessão: a sessão caiu (inatividade, troca de senha). Login errado também é 401, mas aí a pessoa já está na tela de entrada. */
    if (response.status === 401 && !path.startsWith('/login') && path !== '/me') {
      window.dispatchEvent(new CustomEvent(PORTAL_SESSION_EXPIRED, { detail: { slug } }));
    }
    throw new ApiError(
      response.status,
      payload.error ?? 'ERRO',
      payload.message ?? 'Algo deu errado. Tente de novo.',
      payload.details
    );
  }
  return payload;
}

export function portalApi(slug) {
  const get = (path) => request(slug, 'GET', path);
  const post = (path, body) => request(slug, 'POST', path, body ?? {});
  return {
    vitrine: () => get('/vitrine'),
    me: () => get('/me'),
    login: (body) => post('/login', body),
    logout: () => post('/logout'),
    register: (body) => post('/register', body),
    forgot: (email) => post('/forgot', { email }),
    reset: (body) => post('/reset', body),
    catalogo: () => get('/catalogo'),
    pedidos: () => get('/pedidos'),
    pedido: (id) => get(`/pedidos/${encodeURIComponent(id)}`),
    criarPedido: (body) => post('/pedidos', body),
    cancelar: (id) => post(`/pedidos/${encodeURIComponent(id)}/cancelar`),
    fiado: () => get('/fiado'),
    agenda: () => get('/agenda'),
    horarios: ({ servicos, profissionalId, data, porte }) => {
      const q = new URLSearchParams({ servicos: servicos.join(','), profissionalId: profissionalId || 'qualquer', data });
      if (porte) q.set('porte', porte);
      return get(`/agenda/horarios?${q}`);
    },
    agendamentos: () => get('/agendamentos'),
    agendamento: (id) => get(`/agendamentos/${encodeURIComponent(id)}`),
    criarAgendamento: (body) => post('/agendamentos', body),
    cancelarAgendamento: (id) => post(`/agendamentos/${encodeURIComponent(id)}/cancelar`),
    remarcarAgendamento: (id, body) => post(`/agendamentos/${encodeURIComponent(id)}/remarcar`, body),
  };
}
