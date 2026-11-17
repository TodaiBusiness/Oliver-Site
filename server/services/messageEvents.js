/* =========================================================================
   Tempo (quase) real do chat: GET /api/events (Server-Sent Events).

   O hub guarda as conexões abertas EM MEMÓRIA, por processo. Quando alguém
   cria ou lê uma mensagem, `publish` entrega o evento só às conexões do DONO
   da conversa (o cliente da solicitação): ninguém recebe evento de conversa
   alheia, porque o destinatário é escolhido aqui, no servidor, e não pelo
   navegador.

   O evento NUNCA leva texto de mensagem: só ids (`requestId`, `id`). O
   navegador busca o conteúdo pela API, que confere a autorização de novo.

   LIMITAÇÃO (várias instâncias): o hub vive na memória do processo. Com mais
   de uma instância (ou função serverless) o evento só chega a quem está
   conectado NA MESMA instância que gravou a mensagem. O front cobre a falta
   com o polling de segurança (30 s ou 2 min com o stream ligado). Para
   escalar para fora de um processo, trocar `publish` por Redis pub/sub ou
   LISTEN/NOTIFY do Postgres, sem mudar o resto.

   Fora de escopo, por decisão: "digitando…" e presença online.
   ========================================================================= */

import { SECURITY } from '../config.js';
import { tooManyRequests } from '../http/errors.js';

export const EVENT_HEARTBEAT_MS = 25_000;
export const EVENTS_MAX_PER_USER = 3;
export const EVENTS_MAX_GLOBAL = 500;
/* Se o navegador não consome (rede travada), a fila de escrita cresce: acima
   disto a conexão é fechada em vez de acumular memória. */
const MAX_PENDING_BYTES = 64 * 1024;

export const EVENT_STREAM_HEADERS = Object.freeze({
  'Content-Type': 'text/event-stream; charset=utf-8',
  /* Sem buffering em nenhum intermediário: nginx lê X-Accel-Buffering;
     `no-transform` impede proxy de comprimir/segurar o fluxo. */
  'Cache-Control': 'no-cache, no-transform',
  'X-Accel-Buffering': 'no',
  Connection: 'keep-alive',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
});

const frame = (event, data) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/**
 * `isSessionAlive(sessionId)`: chamada a cada batida; se a sessão venceu (ou
 * saiu), a conexão é encerrada. Sem ela, só o logout explícito encerra.
 */
export function createMessageEvents({
  heartbeatMs = EVENT_HEARTBEAT_MS,
  maxPerUser = EVENTS_MAX_PER_USER,
  maxGlobal = EVENTS_MAX_GLOBAL,
  isSessionAlive = null,
} = {}) {
  /** @type {Map<number, Set<object>>} userId → conexões */
  const byUser = new Map();
  let total = 0;
  let timer = null;

  function drop(conn, { end = true } = {}) {
    if (conn.closed) return;
    conn.closed = true;
    const set = byUser.get(conn.userId);
    if (set) {
      set.delete(conn);
      if (!set.size) byUser.delete(conn.userId);
    }
    total -= 1;
    if (end) {
      try {
        conn.sink.end();
      } catch {
        /* conexão já caiu */
      }
    }
    if (total === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function send(conn, text) {
    if (conn.closed) return;
    try {
      const ok = conn.sink.write(text);
      /* write() devolveu false: o buffer do socket está cheio. */
      if (ok === false && (conn.sink.pendingBytes?.() ?? 0) > MAX_PENDING_BYTES) drop(conn);
    } catch {
      drop(conn, { end: false });
    }
  }

  async function beat() {
    const conns = [...byUser.values()].flatMap((set) => [...set]);
    const verdicts = new Map(); // uma consulta por sessão, não por conexão
    for (const conn of conns) {
      if (conn.closed) continue;
      if (isSessionAlive) {
        if (!verdicts.has(conn.sessionId)) {
          verdicts.set(
            conn.sessionId,
            Promise.resolve(isSessionAlive(conn.sessionId)).catch(() => true)
          );
        }
        if (!(await verdicts.get(conn.sessionId))) {
          drop(conn);
          continue;
        }
      }
      send(conn, ': ping\n\n');
    }
  }

  function ensureTimer() {
    if (timer) return;
    timer = setInterval(() => {
      beat().catch(() => {});
    }, heartbeatMs);
    timer.unref?.();
  }

  function assertCanOpen(userId) {
    if (total >= maxGlobal) {
      throw tooManyRequests('O servidor está com muitas conexões ao vivo. Tente novamente em instantes.');
    }
    if ((byUser.get(userId)?.size ?? 0) >= maxPerUser) {
      throw tooManyRequests('Você já tem conexões ao vivo demais abertas. Feche outras abas e tente de novo.');
    }
  }

  return {
    /** Lança 429 se `open` seria recusado (chamado ANTES de responder 200). */
    assertCanOpen,

    /**
     * Registra uma conexão já autenticada. Lança 429 acima dos limites.
     * Devolve a função que a remove (chamar quando o socket fechar).
     */
    open({ userId, sessionId }, sink) {
      assertCanOpen(userId);

      const conn = { userId, sessionId, sink, closed: false };
      if (!byUser.has(userId)) byUser.set(userId, new Set());
      byUser.get(userId).add(conn);
      total += 1;
      ensureTimer();

      /* `retry`: o navegador espera 5 s antes de reconectar sozinho. */
      send(conn, `retry: 5000\n${frame('ready', {})}`);
      return () => drop(conn, { end: false });
    },

    /** Entrega um evento às conexões do dono. Devolve quantas receberam. */
    publish(ownerId, event, data) {
      const set = byUser.get(ownerId);
      if (!set) return 0;
      const text = frame(event, data);
      let n = 0;
      for (const conn of [...set]) {
        send(conn, text);
        if (!conn.closed) n += 1;
      }
      return n;
    },

    /** Logout / sessão apagada: encerra as conexões desta sessão. */
    closeSession(sessionId) {
      for (const set of byUser.values()) {
        for (const conn of [...set]) if (conn.sessionId === sessionId) drop(conn);
      }
    },

    /** Encerra tudo (parada do servidor, testes). */
    closeAll() {
      for (const set of [...byUser.values()]) for (const conn of [...set]) drop(conn);
    },

    stats: () => ({ total, users: byUser.size }),
    /** Só para teste: roda uma batida agora. */
    _beat: beat,
  };
}

/** Sessão ainda vale? Vencimento absoluto + inatividade, SEM renovar o last_seen. */
export function sessionAliveChecker(ctx, now = () => Date.now()) {
  return async (sessionId) => {
    const s = await ctx.sessions.findValidWithUser(sessionId, now());
    if (!s) return false;
    const limit = SECURITY.SESSION_IDLE_MS[s.role] ?? SECURITY.SESSION_IDLE_MS.CLIENT;
    return now() - Number(s.last_seen_at ?? s.created_at) <= limit;
  };
}

/**
 * Ponto único de gancho das mensagens: quem cria/lê mensagem chama estes dois
 * métodos (messages.js e panelConversations.js). Tudo é "dispare e esqueça":
 * erro aqui nunca chega a quem gravou a mensagem, e o e-mail roda em segundo
 * plano (sem await).
 */
export function createMessageHooks({ events, notify = null, logError = (t) => console.error(t) } = {}) {
  return {
    messageCreated({ requestId, messageId, ownerId, fromTeam }) {
      try {
        events?.publish(ownerId, 'message', { requestId: Number(requestId), id: Number(messageId) });
        if (fromTeam && notify) {
          notify.notifyTeamMessage({ requestId, messageId, ownerId }).catch(() => {});
        }
      } catch (error) {
        logError(`[messageEvents] gancho falhou: ${error?.message}`);
      }
    },

    /** `by`: 'client' (o dono leu) ou 'team' (a equipe leu as mensagens dele). */
    messagesRead({ requestId, ownerId, by }) {
      try {
        events?.publish(ownerId, 'read', { requestId: Number(requestId), by });
      } catch (error) {
        logError(`[messageEvents] gancho falhou: ${error?.message}`);
      }
    },
  };
}

export const NO_HOOKS = Object.freeze({ messageCreated() {}, messagesRead() {} });
