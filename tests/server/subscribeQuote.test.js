/* Cotação da assinatura: valor da API, estimativa quando a API falha, validação, cache e limite. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../../server/db/index.js';
import { createApp } from '../../server/app.js';
import { subscribeQuoteService } from '../../server/services/subscribeQuote.js';
import { request } from './helpers.js';

const LICENSING = { baseUrl: 'https://licenciamento.exemplo', serviceKey: 'chave-de-teste', timeoutMs: 5000 };
const API = { amount: 150, firstChargeAmount: 150, firstChargeDate: '2026-11-20', nextDueDate: '2026-12-20', billingDay: 20 };
const HOJE = new Date(2026, 10, 20);

async function setup({ status = 200, body = API, fail = null, licensing = LICENSING } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (fail) throw fail;
    return { ok: status >= 200 && status < 300, status, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) };
  };
  const db = await createTestDb();
  await db.init();
  const app = createApp(db, { subscribeQuote: subscribeQuoteService({ fetchImpl, licensing, now: () => HOJE }) });
  return { app, calls, close: () => db.close() };
}

const get = (app, query, headers) => request(app, 'GET', '/api/subscribe/quote', { query, headers });

test('cotação da API: repassa valores e chama com a chave de serviço', async () => {
  const { app, calls, close } = await setup();
  try {
    const r = await get(app, { devices: '2', billingDay: '20' });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { estimated: false, ...API });
    const [call] = calls;
    assert.equal(call.url, 'https://licenciamento.exemplo/api/v1/site/subscription/quote?devices=2&billingDay=20');
    assert.equal(call.options.headers['X-Service-Key'], LICENSING.serviceKey);
    assert.equal(JSON.stringify(r).includes(LICENSING.serviceKey), false);
  } finally {
    await close();
  }
});

test('API fora, com erro, resposta estranha ou desligada: estimativa local, nunca erro', async () => {
  const casos = [
    await setup({ fail: new Error('ECONNREFUSED') }),
    await setup({ status: 500, body: {} }),
    await setup({ body: 'não é json' }),
    await setup({ body: { amount: 'x' } }),
    await setup({ body: { ...API, billingDay: 7 } }),
    await setup({ licensing: { baseUrl: undefined, serviceKey: undefined, timeoutMs: 1000 } }),
  ];
  try {
    for (const { app } of casos) {
      const r = await get(app, { devices: '2', billingDay: '20' });
      assert.equal(r.status, 200);
      assert.deepEqual(r.body, {
        estimated: true, amount: 150, firstChargeAmount: 150,
        firstChargeDate: '2026-11-20', nextDueDate: '2026-12-20', billingDay: 20,
      });
    }
  } finally {
    for (const c of casos) await c.close();
  }
});

test('valida computadores e dia sem chamar a API', async () => {
  const { app, calls, close } = await setup();
  try {
    for (const q of [
      { devices: '0', billingDay: '20' }, { devices: '21', billingDay: '20' }, { devices: '1.5', billingDay: '20' },
      { devices: 'x', billingDay: '20' }, { billingDay: '20' }, { devices: '2', billingDay: '10' }, { devices: '2' },
    ]) {
      const r = await get(app, q);
      assert.equal(r.status, 400, JSON.stringify(q));
      assert.ok(r.body.details.devices || r.body.details.billingDay);
    }
    assert.equal(calls.length, 0);
  } finally {
    await close();
  }
});

test('cache de 30 s por computadores e dia', async () => {
  const { app, calls, close } = await setup();
  try {
    await get(app, { devices: '2', billingDay: '20' });
    await get(app, { devices: '2', billingDay: '20' });
    assert.equal(calls.length, 1);
    await get(app, { devices: '3', billingDay: '20' });
    await get(app, { devices: '2', billingDay: '15' });
    assert.equal(calls.length, 3);
  } finally {
    await close();
  }
});

test('limite folgado por visitante: 60 por minuto, depois 429', async () => {
  const { app, close } = await setup();
  try {
    const h = { 'x-forwarded-for': '203.0.113.9' };
    for (let i = 0; i < 60; i += 1) {
      assert.equal((await get(app, { devices: '1', billingDay: '15' }, h)).status, 200);
    }
    assert.equal((await get(app, { devices: '1', billingDay: '15' }, h)).status, 429);
    assert.equal((await get(app, { devices: '1', billingDay: '15' }, { 'x-forwarded-for': '198.51.100.1' })).status, 200);
  } finally {
    await close();
  }
});
