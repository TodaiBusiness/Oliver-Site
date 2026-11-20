/* Assinatura no cartão: validação, o que vai à API de licenciamento, o que
   volta ao navegador e, principalmente, que dados de cartão não vazam. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../../server/db/index.js';
import { createApp } from '../../server/app.js';
import { subscribeService } from '../../server/services/subscribe.js';
import { request } from './helpers.js';

const LICENSING = { baseUrl: 'https://licenciamento.exemplo', serviceKey: 'chave-de-servico-de-teste', timeoutMs: 5000 };
const NUMERO = '4111111111111111';
const CCV = '737';
const ANO = String(new Date().getFullYear() + 2);

const PEDIDO = {
  companyName: 'Sorveteria Gigi',
  contactName: 'Joana Prado',
  taxId: '11.222.333/0001-81',
  email: 'joana@sorveteria.com',
  phone: '(12) 98888-7777',
  devices: 2,
  billingDay: 20,
  acceptTerms: true,
  card: { holderName: 'JOANA PRADO', number: '4111 1111 1111 1111', expiryMonth: '12', expiryYear: ANO, ccv: CCV },
  holder: { postalCode: '12220-000', addressNumber: '100' },
};

const OK = { status: 'active', cardBrand: 'VISA', cardLast4: '1111', billingDay: 20, nextDueDate: '2026-12-20', amount: 150 };

async function setup({ status = 200, body = OK, fail = null, licensing = LICENSING } = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (fail) throw fail;
    return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
  };
  const db = await createTestDb();
  await db.init();
  const app = createApp(db, { subscribe: subscribeService({ fetchImpl, licensing }) });
  return { app, db, calls, close: () => db.close() };
}

const post = (app, body, headers) => request(app, 'POST', '/api/subscribe', { body, headers });
const comCartao = (override) => ({ ...PEDIDO, card: { ...PEDIDO.card, ...override } });

/** Captura tudo que o servidor escreve no console durante `fn`. */
async function capturandoConsole(fn) {
  const saved = {};
  const linhas = [];
  for (const nivel of ['log', 'info', 'warn', 'error', 'debug']) {
    saved[nivel] = console[nivel];
    console[nivel] = (...args) => linhas.push(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : String(a))).join(' '));
  }
  try {
    await fn();
  } finally {
    Object.assign(console, saved);
  }
  return linhas.join('\n');
}

test('encaminha a assinatura com o cartão só em dígitos e devolve apenas o resumo', async () => {
  const { app, calls, close } = await setup();
  try {
    const response = await post(app, PEDIDO, { 'x-forwarded-for': '203.0.113.5' });
    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body).sort(), ['amount', 'billingDay', 'cardBrand', 'cardLast4', 'nextDueDate', 'status']);

    const [call] = calls;
    assert.equal(call.url, 'https://licenciamento.exemplo/api/v1/site/subscription');
    assert.equal(call.options.headers['X-Service-Key'], LICENSING.serviceKey);
    const sent = JSON.parse(call.options.body);
    assert.equal(sent.taxId, '11222333000181');
    assert.equal(sent.billingDay, 20);
    assert.equal(sent.card.number, NUMERO);
    assert.equal(sent.card.ccv, CCV);
    assert.equal(sent.holder.postalCode, '12220000');
    assert.equal(sent.remoteIp, '203.0.113.5', 'repassa o IP do visitante');
    assert.equal('acceptTerms' in sent, false);
  } finally {
    await close();
  }
});

test('repassa chargedToday e firstChargeAmount quando válidos e ignora os inválidos', async () => {
  const bom = await setup({ body: { ...OK, chargedToday: true, firstChargeAmount: 150 } });
  const ruim = await setup({ body: { ...OK, chargedToday: 'sim', firstChargeAmount: 'x' } });
  try {
    const a = await post(bom.app, PEDIDO);
    assert.equal(a.body.chargedToday, true);
    assert.equal(a.body.firstChargeAmount, 150);
    const b = await post(ruim.app, PEDIDO);
    assert.equal('chargedToday' in b.body, false);
    assert.equal('firstChargeAmount' in b.body, false);
  } finally {
    await bom.close();
    await ruim.close();
  }
});

test('a resposta ao navegador nunca traz cartão nem credencial, mesmo se a API mandar a mais', async () => {
  const { app, close } = await setup({ body: { ...OK, cardNumber: NUMERO, ccv: CCV, token: 'tok_secreto', customerId: 'cus_1' } });
  try {
    const response = await post(app, PEDIDO);
    const texto = JSON.stringify(response);
    for (const segredo of [NUMERO, CCV, 'tok_secreto', 'cus_1', LICENSING.serviceKey]) {
      assert.equal(texto.includes(segredo), false, segredo);
    }
  } finally {
    await close();
  }
});

test('valida tudo de novo: Luhn, validade, ccv, CEP, dia e campos da empresa', async () => {
  const { app, calls, close } = await setup();
  try {
    const casos = [
      [comCartao({ number: '4111 1111 1111 1112' }), 'card.number'],
      [comCartao({ number: '' }), 'card.number'],
      [comCartao({ expiryYear: '2020' }), 'card.expiryMonth'],
      [comCartao({ expiryMonth: '13' }), 'card.expiryMonth'],
      [comCartao({ ccv: '12' }), 'card.ccv'],
      [comCartao({ ccv: '12a' }), 'card.ccv'],
      [comCartao({ holderName: '' }), 'card.holderName'],
      [{ ...PEDIDO, holder: { postalCode: '123', addressNumber: '1' } }, 'holder.postalCode'],
      [{ ...PEDIDO, holder: { postalCode: '12220000', addressNumber: '' } }, 'holder.addressNumber'],
      [{ ...PEDIDO, billingDay: 10 }, 'billingDay'],
      [{ ...PEDIDO, billingDay: undefined }, 'billingDay'],
      [{ ...PEDIDO, card: 'texto' }, 'card.number'],
      [{ ...PEDIDO, taxId: '1234' }, 'taxId'],
      [{ ...PEDIDO, devices: 21 }, 'devices'],
      [{ ...PEDIDO, acceptTerms: false }, 'acceptTerms'],
    ];
    for (const [pedido, campo] of casos) {
      const response = await post(app, pedido);
      assert.equal(response.status, 400, campo);
      assert.ok(response.body.details[campo], `deveria apontar ${campo}`);
      assert.equal(JSON.stringify(response.body).includes(NUMERO), false, 'erro não ecoa o cartão');
    }
    assert.equal(calls.length, 0);
  } finally {
    await close();
  }
});

test('billingDay e devices vindos como texto são aceitos', async () => {
  const { app, calls, close } = await setup();
  try {
    assert.equal((await post(app, { ...PEDIDO, billingDay: '30', devices: '3' })).status, 200);
    const sent = JSON.parse(calls[0].options.body);
    assert.equal(sent.billingDay, 30);
    assert.equal(sent.devices, 3);
  } finally {
    await close();
  }
});

test('limite estrito: 3 pedidos válidos por 10 minutos por visitante; inválido não conta', async () => {
  const { app, close } = await setup();
  try {
    for (let i = 0; i < 6; i += 1) {
      assert.equal((await post(app, { ...PEDIDO, billingDay: 1 }, { 'x-forwarded-for': '203.0.113.7' })).status, 400);
    }
    for (let i = 0; i < 3; i += 1) {
      assert.equal((await post(app, PEDIDO, { 'x-forwarded-for': '203.0.113.7' })).status, 200);
    }
    assert.equal((await post(app, PEDIDO, { 'x-forwarded-for': '203.0.113.7' })).status, 429);
    assert.equal((await post(app, PEDIDO, { 'x-forwarded-for': '198.51.100.9' })).status, 200);
  } finally {
    await close();
  }
});

test('402 vira CARTAO_RECUSADO, sem texto da API', async () => {
  const { app, close } = await setup({ status: 402, body: { code: 'CARTAO_RECUSADO', detail: `recusado ${NUMERO}` } });
  try {
    const response = await post(app, PEDIDO);
    assert.equal(response.status, 402);
    assert.equal(response.body.error, 'CARTAO_RECUSADO');
    assert.equal(JSON.stringify(response.body).includes(NUMERO), false);
  } finally {
    await close();
  }
});

test('409 recebe a mensagem neutra, sem dizer que é cliente', async () => {
  const { app, close } = await setup({ status: 409, body: {} });
  try {
    const response = await post(app, PEDIDO);
    assert.equal(response.status, 409);
    assert.equal(response.body.error, 'CONFIRA_O_EMAIL');
    assert.doesNotMatch(response.body.message, /já tem cadastro|já cadastrado/i);
  } finally {
    await close();
  }
});

test('400 da API repassa campos, mas descarta mensagem que traga o cartão', async () => {
  const { app, close } = await setup({
    status: 400,
    body: { errors: { Phone: ['Telefone curto.'], 'card.number': [`Cartão ${NUMERO} inválido`], inventado: ['x'] } },
  });
  try {
    const response = await post(app, PEDIDO);
    assert.equal(response.status, 400);
    assert.deepEqual(response.body.details, { Phone: ['Telefone curto.'] });
  } finally {
    await close();
  }
});

test('falhas da API, resposta incompleta e integração desligada viram indisponível', async () => {
  const casos = [
    await setup({ fail: new Error(`connect ECONNREFUSED ${NUMERO}`) }),
    await setup({ status: 500, body: { title: `Npgsql ${NUMERO}`, correlationId: 'abc' } }),
    await setup({ body: { status: 'active' } }),
    await setup({ body: { ...OK, billingDay: 7 } }),
    await setup({ licensing: { baseUrl: undefined, serviceKey: undefined, timeoutMs: 1000 } }),
  ];
  try {
    for (const { app, calls } of casos) {
      let response;
      const logs = await capturandoConsole(async () => {
        response = await post(app, PEDIDO);
      });
      assert.equal(response.status, 503);
      assert.equal(response.body.error, 'ASSINATURA_INDISPONIVEL');
      assert.equal(JSON.stringify(response.body).includes(NUMERO), false);
      assert.equal(logs.includes(NUMERO), false);
      assert.equal(logs.includes(CCV), false);
      void calls;
    }
  } finally {
    for (const c of casos) await c.close();
  }
});

test('nenhum log do servidor, auditoria ou analytics recebe o cartão', async () => {
  const sucesso = await setup();
  const recusado = await setup({ status: 402, body: {} });
  const invalido = await setup();
  const erro500 = await setup({ status: 500, body: { correlationId: 'x' } });
  try {
    const logs = await capturandoConsole(async () => {
      await post(sucesso.app, PEDIDO);
      await post(recusado.app, PEDIDO);
      await post(invalido.app, comCartao({ number: '4111111111111112' }));
      await post(erro500.app, PEDIDO);
    });
    for (const segredo of [NUMERO, '4111 1111 1111 1111', CCV, 'JOANA PRADO']) {
      assert.equal(logs.includes(segredo), false, `log contém ${segredo}`);
    }

    const auditoria = JSON.stringify(await sucesso.app.ctx.audit.list({ limit: 200, offset: 0 }));
    assert.equal(auditoria.includes(NUMERO), false);
    assert.equal(auditoria.includes(CCV), false);

    for (const tabela of ['site_visit_stats', 'audit_logs']) {
      const linhas = await sucesso.db.query(`SELECT * FROM ${tabela}`);
      assert.equal(JSON.stringify(linhas).includes(NUMERO), false, tabela);
    }
  } finally {
    for (const c of [sucesso, recusado, invalido, erro500]) await c.close();
  }
});
