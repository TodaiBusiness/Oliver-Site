/* Tempo real do chat no navegador: núcleo do stream (reconexão, fallback,
   pausa com a aba oculta) e regras de apresentação, sem React. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FALHAS_ATE_POLLING,
  RETENTAR_POLLING_MS,
  createEventStream,
  debounce,
  intervaloDePolling,
  proximoAtraso,
} from '../src/hooks/eventStreamCore.js';
import {
  AGRUPAR_ATE_MS,
  autorDaEquipe,
  deveAgrupar,
  pertoDoFim,
  rotuloDeConexao,
} from '../src/components/chat/autor.js';

/* ---- doubles ---- */
class FakeES {
  static instances = [];
  constructor(url) {
    this.url = url;
    this.closed = false;
    this.listeners = {};
    FakeES.instances.push(this);
  }
  addEventListener(tipo, fn) {
    (this.listeners[tipo] ??= []).push(fn);
  }
  close() {
    this.closed = true;
  }
  emit(tipo, dados) {
    (this.listeners[tipo] ?? []).forEach((fn) => fn({ data: typeof dados === 'string' ? dados : JSON.stringify(dados ?? {}) }));
  }
  fail() {
    this.onerror?.();
  }
}

function ambiente() {
  FakeES.instances = [];
  const timers = [];
  const doc = {
    visibilityState: 'visible',
    handlers: [],
    addEventListener(_, fn) {
      this.handlers.push(fn);
    },
    removeEventListener() {},
    mudar(estado) {
      this.visibilityState = estado;
      this.handlers.forEach((fn) => fn());
    },
  };
  const stream = createEventStream({
    EventSourceImpl: FakeES,
    doc,
    setTimer: (fn, ms) => {
      const t = { fn, ms, ativo: true };
      timers.push(t);
      return t;
    },
    clearTimer: (t) => t && (t.ativo = false),
    random: () => 0.5, // fator 1
  });
  const ultimo = () => FakeES.instances[FakeES.instances.length - 1];
  const dispararTimer = () => {
    const t = [...timers].reverse().find((x) => x.ativo);
    t.ativo = false;
    t.fn();
    return t;
  };
  return { stream, doc, timers, ultimo, dispararTimer };
}

test('backoff exponencial com teto de 30 s e fator aleatório', () => {
  assert.equal(proximoAtraso(0, () => 0.5), 1000);
  assert.equal(proximoAtraso(1, () => 0.5), 2000);
  assert.equal(proximoAtraso(3, () => 0.5), 8000);
  assert.equal(proximoAtraso(10, () => 0.5), 30000);
  assert.ok(proximoAtraso(2, () => 0) >= 3000 && proximoAtraso(2, () => 0.999) <= 5000);
});

test('polling de reserva: espaçado só com o stream conectado', () => {
  assert.equal(intervaloDePolling('conectado'), 120_000);
  for (const s of ['reconectando', 'polling', 'pausado', 'conectando']) {
    assert.equal(intervaloDePolling(s), 30_000);
  }
});

test('stream: conecta, entrega message/read e ignora JSON inválido', () => {
  const { stream, ultimo } = ambiente();
  const visto = { m: [], r: [], s: [] };
  stream.subscribe({
    onMessage: (d) => visto.m.push(d),
    onRead: (d) => visto.r.push(d),
    onStatus: (s) => visto.s.push(s),
  });
  const es = ultimo();
  assert.equal(es.url, '/api/events');
  es.emit('ready');
  es.emit('message', { requestId: 7, id: 9 });
  es.emit('message', 'não é json');
  es.emit('read', { requestId: 7, by: 'team' });
  assert.deepEqual(visto.m, [{ requestId: 7, id: 9 }]);
  assert.deepEqual(visto.r, [{ requestId: 7, by: 'team' }]);
  assert.equal(stream.status, 'conectado');
  assert.deepEqual(visto.s, ['conectando', 'conectado']);
});

test('stream: uma conexão para vários ouvintes; fecha quando o último sai', () => {
  const { stream } = ambiente();
  const a = stream.subscribe({});
  const b = stream.subscribe({});
  assert.equal(FakeES.instances.length, 1);
  a();
  assert.equal(FakeES.instances[0].closed, false);
  b();
  assert.equal(FakeES.instances[0].closed, true);
});

test('stream: erro → reconecta com backoff e pede recarga (onResync) ao voltar', () => {
  const { stream, ultimo, dispararTimer } = ambiente();
  let resync = 0;
  stream.subscribe({ onResync: () => (resync += 1) });
  ultimo().emit('ready');
  assert.equal(resync, 0); // primeira conexão não ressincroniza

  ultimo().fail();
  assert.equal(stream.status, 'reconectando');
  assert.equal(FakeES.instances[0].closed, true);
  const t = dispararTimer();
  assert.equal(t.ms, 1000);
  assert.equal(FakeES.instances.length, 2);
  ultimo().emit('ready');
  assert.equal(stream.status, 'conectado');
  assert.equal(resync, 1);
});

test('stream: falhas seguidas viram polling e há nova tentativa depois de 60 s', () => {
  const { stream, ultimo, dispararTimer } = ambiente();
  stream.subscribe({});
  for (let i = 0; i < FALHAS_ATE_POLLING - 1; i += 1) {
    ultimo().fail();
    assert.equal(stream.status, 'reconectando');
    dispararTimer();
  }
  ultimo().fail();
  assert.equal(stream.status, 'polling');
  const t = dispararTimer();
  assert.equal(t.ms, RETENTAR_POLLING_MS);
  assert.equal(stream.status, 'reconectando');
  assert.ok(ultimo() && !ultimo().closed);
});

test('stream: sem EventSource o estado é polling e nada quebra', () => {
  const stream = createEventStream({ EventSourceImpl: null, doc: null });
  const estados = [];
  const sair = stream.subscribe({ onStatus: (s) => estados.push(s) });
  assert.deepEqual(estados, ['polling']);
  sair();
});

test('stream: aba oculta fecha a conexão; ao voltar reconecta e ressincroniza', () => {
  const { stream, doc, ultimo } = ambiente();
  let resync = 0;
  stream.subscribe({ onResync: () => (resync += 1) });
  ultimo().emit('ready');

  doc.mudar('hidden');
  assert.equal(FakeES.instances[0].closed, true);
  assert.equal(stream.status, 'pausado');

  doc.mudar('visible');
  assert.equal(FakeES.instances.length, 2);
  assert.equal(resync, 1);
  ultimo().emit('ready');
  assert.equal(stream.status, 'conectado');
});

test('debounce junta rajadas em uma chamada', () => {
  const fila = [];
  let pendente = null;
  const d = debounce((x) => fila.push(x), 250, {
    setTimer: (fn) => {
      pendente = fn;
      return 1;
    },
    clearTimer: () => {
      pendente = null;
    },
  });
  d(1);
  d(2);
  d(3);
  pendente();
  assert.deepEqual(fila, [3]);
});

test('apresentação: agrupa só mesmo autor dentro de 5 min; admins do Panel não se misturam', () => {
  const base = { author_id: 1, author_external_name: null, created_at: 1_000_000 };
  assert.equal(deveAgrupar(undefined, base), false);
  assert.equal(deveAgrupar(base, { ...base, created_at: base.created_at + AGRUPAR_ATE_MS }), true);
  assert.equal(deveAgrupar(base, { ...base, created_at: base.created_at + AGRUPAR_ATE_MS + 1 }), false);
  assert.equal(deveAgrupar(base, { ...base, author_id: 2 }), false);
  const k = { ...base, author_id: 9, author_external_name: 'Kaique' };
  assert.equal(deveAgrupar(k, { ...k, author_external_name: 'Marina' }), false);
  assert.equal(deveAgrupar(k, { ...k, created_at: k.created_at + 1000 }), true);
});

test('apresentação: nome da equipe', () => {
  assert.equal(autorDaEquipe({ author_external_name: 'Kaique' }).nome, 'Kaique · TODAI');
  assert.equal(autorDaEquipe({ author_name: 'TODAI Atendimento' }).nome, 'Equipe TODAI');
  const admin = autorDaEquipe({ author_name: 'Júlia' });
  assert.equal(admin.nome, 'Júlia');
  assert.equal(admin.etiqueta, true);
  /* Nome com HTML segue como texto: o React escapa; aqui só confirmamos que não é "interpretado". */
  assert.equal(autorDaEquipe({ author_external_name: '<img onerror=x>' }).nome, '<img onerror=x> · TODAI');
});

test('apresentação: perto do fim e rótulos de conexão', () => {
  assert.equal(pertoDoFim({ scrollHeight: 1000, scrollTop: 600, clientHeight: 300 }), false);
  assert.equal(pertoDoFim({ scrollHeight: 1000, scrollTop: 650, clientHeight: 300 }), true);
  assert.equal(pertoDoFim(null), true);
  assert.equal(rotuloDeConexao('conectado'), 'Ao vivo');
  assert.equal(rotuloDeConexao('reconectando'), 'Reconectando…');
  assert.equal(rotuloDeConexao('polling'), 'Atualiza a cada 30 s');
});
