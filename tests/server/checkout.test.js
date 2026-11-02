/* Compra pelo site: validação, o que é enviado à API de licenciamento, o que
   é escondido do navegador e o comportamento quando a API central falha.

   Como nos testes de orçamento, o `fetch` é trocado por uma função de teste: o
   que se verifica é o que ESTE servidor faz. A API central tem os próprios testes. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../../server/db/index.js';
import { createApp } from '../../server/app.js';
import { checkoutService } from '../../server/services/checkout.js';
import { request } from './helpers.js';

const LICENSING = {
  baseUrl: 'https://licenciamento.exemplo',
  serviceKey: 'chave-de-servico-de-teste',
  timeoutMs: 5000,
};
const SITE = 'https://todai.com.br';

const PEDIDO = {
  companyName: 'Sorveteria Gigi',
  contactName: 'Joana Prado',
  taxId: '11.222.333/0001-81',
  email: 'joana@sorveteria.com',
  phone: '(12) 98888-7777',
  devices: 2,
  acceptTerms: true,
};

async function createAppWithLicensing({
  status = 200,
  body = { checkoutUrl: 'https://www.mercadopago.com.br/subscriptions/checkout?x=1', resumed: false },
  fail = null,
  licensing = LICENSING,
  publicUrl = SITE,
} = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), options });
    if (fail) throw fail;
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => JSON.stringify(body),
    };
  };

  const db = await createTestDb();
  await db.init();
  const app = createApp(db, {
    checkout: checkoutService({ fetchImpl, licensing, publicUrl }),
  });
  return { app, calls, close: () => db.close() };
}

const post = (app, body, headers) =>
  request(app, 'POST', '/api/checkout', { body, headers });

test('encaminha a compra e devolve só o link de pagamento', async () => {
  const { app, calls, close } = await createAppWithLicensing();
  try {
    const response = await post(app, PEDIDO);

    assert.equal(response.status, 200);
    assert.deepEqual(Object.keys(response.body).sort(), ['checkoutUrl', 'resumed']);
    assert.match(response.body.checkoutUrl, /^https:\/\/www\.mercadopago/);
    assert.equal(calls.length, 1);

    const [call] = calls;
    assert.equal(call.url, 'https://licenciamento.exemplo/api/v1/site/checkout');
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.headers['X-Service-Key'], LICENSING.serviceKey);

    const sent = JSON.parse(call.options.body);
    assert.equal(sent.taxId, '11222333000181', 'só os dígitos do documento');
    assert.equal(sent.backUrl, `${SITE}/obrigado`);
    assert.equal(sent.devices, 2);
    assert.equal('acceptTerms' in sent, false, 'o aceite é do site, não da API');
  } finally {
    await close();
  }
});

test('a credencial de serviço nunca chega ao navegador', async () => {
  const { app, close } = await createAppWithLicensing();
  try {
    const response = await post(app, PEDIDO);
    assert.equal(JSON.stringify(response).includes(LICENSING.serviceKey), false);
  } finally {
    await close();
  }
});

test('campos extras (preço, plano, cliente) são ignorados', async () => {
  const { app, calls, close } = await createAppWithLicensing();
  try {
    await post(app, { ...PEDIDO, price: 1, plan: 'gratis', customerId: 9, backUrl: 'https://golpe.exemplo' });
    const sent = JSON.parse(calls[0].options.body);
    assert.equal('price' in sent, false);
    assert.equal('plan' in sent, false);
    assert.equal('customerId' in sent, false);
    assert.equal(sent.backUrl, `${SITE}/obrigado`, 'o retorno é sempre o do site');
  } finally {
    await close();
  }
});

test('documento inválido é recusado sem chamar a API', async () => {
  const { app, calls, close } = await createAppWithLicensing();
  try {
    for (const taxId of ['111.111.111-11', '11.222.333/0001-82', '1234', '']) {
      const response = await post(app, { ...PEDIDO, taxId });
      assert.equal(response.status, 400, `taxId ${JSON.stringify(taxId)}`);
      assert.ok(response.body.details.taxId);
    }
    assert.equal(calls.length, 0);
  } finally {
    await close();
  }
});

test('CPF também é aceito', async () => {
  const { app, close } = await createAppWithLicensing();
  try {
    const response = await post(app, { ...PEDIDO, taxId: '529.982.247-25' });
    assert.equal(response.status, 200);
  } finally {
    await close();
  }
});

test('exige aceite dos termos, e-mail válido e quantidade de computadores razoável', async () => {
  const { app, calls, close } = await createAppWithLicensing();
  try {
    const casos = [
      [{ acceptTerms: false }, 'acceptTerms'],
      [{ acceptTerms: undefined }, 'acceptTerms'],
      [{ email: 'sem-arroba' }, 'email'],
      [{ devices: 0 }, 'devices'],
      [{ devices: 21 }, 'devices'],
      [{ devices: 1.5 }, 'devices'],
      [{ devices: 'muitos' }, 'devices'],
      [{ companyName: '' }, 'companyName'],
      [{ contactName: 'A' }, 'contactName'],
      [{ phone: '123' }, 'phone'],
    ];
    for (const [override, field] of casos) {
      const response = await post(app, { ...PEDIDO, ...override });
      assert.equal(response.status, 400, field);
      assert.ok(response.body.details[field], `deveria apontar ${field}`);
    }
    assert.equal(calls.length, 0);
  } finally {
    await close();
  }
});

test('número de computadores vindo como texto do formulário é aceito', async () => {
  const { app, calls, close } = await createAppWithLicensing();
  try {
    const response = await post(app, { ...PEDIDO, devices: '3' });
    assert.equal(response.status, 200);
    assert.equal(JSON.parse(calls[0].options.body).devices, 3);
  } finally {
    await close();
  }
});

test('o visitante é barrado depois de cinco pedidos válidos seguidos', async () => {
  const { app, close } = await createAppWithLicensing();
  try {
    for (let i = 0; i < 5; i += 1) {
      assert.equal((await post(app, PEDIDO, { 'x-forwarded-for': '203.0.113.5' })).status, 200);
    }
    const sexto = await post(app, PEDIDO, { 'x-forwarded-for': '203.0.113.5' });
    assert.equal(sexto.status, 429);
    // Outro visitante não é afetado.
    assert.equal((await post(app, PEDIDO, { 'x-forwarded-for': '198.51.100.9' })).status, 200);
  } finally {
    await close();
  }
});

test('pedido inválido não gasta a cota do visitante', async () => {
  const { app, close } = await createAppWithLicensing();
  try {
    for (let i = 0; i < 8; i += 1) {
      assert.equal((await post(app, { ...PEDIDO, taxId: '1' }, { 'x-forwarded-for': '203.0.113.7' })).status, 400);
    }
    assert.equal((await post(app, PEDIDO, { 'x-forwarded-for': '203.0.113.7' })).status, 200);
  } finally {
    await close();
  }
});

test('sem a integração configurada, avisa em vez de levar o cliente a pagar sem volta', async () => {
  const semApi = await createAppWithLicensing({ licensing: { baseUrl: undefined, serviceKey: undefined, timeoutMs: 1000 } });
  const semSite = await createAppWithLicensing({ publicUrl: '' });
  const semHttps = await createAppWithLicensing({ publicUrl: 'http://todai.com.br' });
  try {
    for (const { app, calls } of [semApi, semSite, semHttps]) {
      const response = await post(app, PEDIDO);
      assert.equal(response.status, 503);
      assert.equal(response.body.error, 'COMPRA_INDISPONIVEL');
      assert.equal(calls.length, 0);
    }
  } finally {
    await semApi.close();
    await semSite.close();
    await semHttps.close();
  }
});

test('API central fora do ar vira 503 sem vazar o motivo', async () => {
  const { app, close } = await createAppWithLicensing({
    fail: new Error('connect ECONNREFUSED 10.0.0.5:443 senha=segredo'),
  });
  const original = console.error;
  console.error = () => {};
  try {
    const response = await post(app, PEDIDO);
    assert.equal(response.status, 503);
    assert.equal(JSON.stringify(response.body).includes('10.0.0.5'), false);
    assert.equal(JSON.stringify(response.body).includes('segredo'), false);
  } finally {
    console.error = original;
    await close();
  }
});

test('erro 500 da API central não vira 500 aqui nem expõe o motivo', async () => {
  const { app, close } = await createAppWithLicensing({
    status: 500,
    body: { title: 'NpgsqlException: relation "clientes" does not exist', correlationId: 'abc' },
  });
  const original = console.error;
  console.error = () => {};
  try {
    const response = await post(app, PEDIDO);
    assert.equal(response.status, 503);
    assert.equal(JSON.stringify(response.body).includes('Npgsql'), false);
  } finally {
    console.error = original;
    await close();
  }
});

test('documento que já é cliente (409) recebe mensagem neutra, sem dizer que é cliente', async () => {
  const { app, close } = await createAppWithLicensing({
    status: 409,
    body: { detail: 'qualquer texto da API' },
  });
  try {
    const response = await post(app, PEDIDO);
    assert.equal(response.status, 409);
    assert.equal(response.body.error, 'CONFIRA_O_EMAIL');
    assert.doesNotMatch(response.body.message, /já tem cadastro|já cadastrado/i);
    assert.match(response.body.message, /e-mail do cadastro/);
  } finally {
    await close();
  }
});

test('400 da API central repassa os campos para o formulário destacar', async () => {
  const { app, close } = await createAppWithLicensing({
    status: 400,
    body: { detail: 'Revise os campos informados.', errors: { Phone: ['Telefone curto.'] } },
  });
  try {
    const response = await post(app, PEDIDO);
    assert.equal(response.status, 400);
    assert.deepEqual(response.body.details, { Phone: ['Telefone curto.'] });
  } finally {
    await close();
  }
});

test('resposta de sucesso sem link vira indisponível, e não link vazio', async () => {
  const { app, close } = await createAppWithLicensing({ body: { resumed: false } });
  const original = console.error;
  console.error = () => {};
  try {
    const response = await post(app, PEDIDO);
    assert.equal(response.status, 503);
  } finally {
    console.error = original;
    await close();
  }
});

test('quem volta ao pagamento recebe o mesmo link (resumed)', async () => {
  const { app, close } = await createAppWithLicensing({
    body: { checkoutUrl: 'https://www.mercadopago.com.br/subscriptions/checkout?x=1', resumed: true },
  });
  try {
    const response = await post(app, PEDIDO);
    assert.equal(response.body.resumed, true);
  } finally {
    await close();
  }
});
