/* =========================================================================
   Núcleo do tempo real do cliente (sem React, para testar com objetos falsos).

   Uma única conexão EventSource por aba, compartilhada por quem escuta
   (conversa, contador do menu, aviso de mensagem nova): o servidor aceita só 3
   conexões por usuário, e várias abas já gastam as vagas.

   Estados: 'conectando' · 'conectado' · 'reconectando' · 'polling' (sem
   EventSource ou o servidor não oferece o stream: quem escuta continua no
   polling de sempre) · 'pausado' (aba oculta: a conexão é fechada).

   O stream só avisa QUE algo mudou ({requestId,id}); o conteúdo vem sempre
   pela API autenticada.
   ========================================================================= */

export const STREAM_URL = '/api/events';
/* Depois de tantas falhas seguidas, desiste do stream por um tempo e deixa o
   polling trabalhar (ex.: 429 por excesso de abas, 501 no Netlify, proxy que segura). */
export const FALHAS_ATE_POLLING = 6;
export const RETENTAR_POLLING_MS = 60_000;

/** Espera exponencial com teto de 30 s e um pouco de aleatoriedade. */
export function proximoAtraso(tentativa, random = Math.random) {
  const base = Math.min(30_000, 1000 * 2 ** Math.max(0, tentativa));
  return Math.round(base * (0.75 + random() * 0.5));
}

/** Intervalo do polling de segurança: espaçado quando o stream está de pé. */
export function intervaloDePolling(status, { rapido = 30_000, lento = 120_000 } = {}) {
  return status === 'conectado' ? lento : rapido;
}

export function createEventStream({
  EventSourceImpl = typeof EventSource === 'undefined' ? null : EventSource,
  doc = typeof document === 'undefined' ? null : document,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
  random = Math.random,
  url = STREAM_URL,
} = {}) {
  const ouvintes = new Set();
  let status = EventSourceImpl ? 'conectando' : 'polling';
  let fonte = null;
  let timer = null;
  let falhas = 0;
  let jaConectou = false;

  const oculta = () => Boolean(doc && doc.visibilityState === 'hidden');

  const mudarStatus = (novo) => {
    if (novo === status) return;
    status = novo;
    ouvintes.forEach((o) => o.onStatus?.(status));
  };

  const emitir = (tipo, dados) => ouvintes.forEach((o) => o[tipo]?.(dados));

  const fechar = () => {
    clearTimer(timer);
    timer = null;
    if (fonte) {
      fonte.close();
      fonte = null;
    }
  };

  const json = (event) => {
    try {
      const dados = JSON.parse(event.data);
      return dados && typeof dados === 'object' ? dados : null;
    } catch {
      return null;
    }
  };

  function conectar() {
    if (!EventSourceImpl || fonte || !ouvintes.size || oculta()) return;
    mudarStatus(jaConectou || falhas ? 'reconectando' : 'conectando');

    const es = new EventSourceImpl(url);
    fonte = es;

    es.addEventListener('ready', () => {
      falhas = 0;
      mudarStatus('conectado');
      /* Reconexão: pode ter ficado evento para trás; quem escuta recarrega. */
      if (jaConectou) emitir('onResync');
      jaConectou = true;
    });
    es.addEventListener('message', (e) => {
      const d = json(e);
      if (d) emitir('onMessage', d);
    });
    es.addEventListener('read', (e) => {
      const d = json(e);
      if (d) emitir('onRead', d);
    });
    es.onerror = () => {
      /* Controlamos a reconexão (o nativo não dá espaçamento nem desiste). */
      if (fonte !== es) return;
      fechar();
      falhas += 1;
      if (falhas >= FALHAS_ATE_POLLING) {
        mudarStatus('polling');
        timer = setTimer(() => {
          timer = null;
          falhas = FALHAS_ATE_POLLING - 2; // poucas tentativas antes de desistir de novo
          conectar();
        }, RETENTAR_POLLING_MS);
      } else {
        mudarStatus('reconectando');
        timer = setTimer(() => {
          timer = null;
          conectar();
        }, proximoAtraso(falhas - 1, random));
      }
    };
  }

  /* Aba oculta: fecha (poupa a vaga e a bateria); ao voltar, reconecta já. */
  const aoMudarVisibilidade = () => {
    if (oculta()) {
      fechar();
      mudarStatus('pausado');
    } else if (ouvintes.size && EventSourceImpl && !fonte) {
      clearTimer(timer);
      timer = null;
      falhas = 0;
      conectar();
      emitir('onResync'); // o que aconteceu enquanto estava oculta
    }
  };
  doc?.addEventListener?.('visibilitychange', aoMudarVisibilidade);

  return {
    get status() {
      return status;
    },
    /** `ouvinte`: { onMessage, onRead, onResync, onStatus }. Devolve o cancelamento. */
    subscribe(ouvinte) {
      ouvintes.add(ouvinte);
      ouvinte.onStatus?.(status);
      conectar();
      return () => {
        ouvintes.delete(ouvinte);
        if (!ouvintes.size) {
          fechar();
          falhas = 0;
          jaConectou = false;
          if (EventSourceImpl) status = 'conectando';
        }
      };
    },
    /** Só para teste. */
    _destroy() {
      fechar();
      doc?.removeEventListener?.('visibilitychange', aoMudarVisibilidade);
    },
  };
}

/** Junta rajadas de eventos numa só chamada (vários eventos seguidos = 1 recarga). */
export function debounce(fn, ms = 250, { setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let t = null;
  const chamada = (...args) => {
    clearTimer(t);
    t = setTimer(() => {
      t = null;
      fn(...args);
    }, ms);
  };
  chamada.cancel = () => {
    clearTimer(t);
    t = null;
  };
  return chamada;
}
