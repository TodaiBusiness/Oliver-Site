/* Itens de endurecimento do front e dos arquivos de deploy. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeCheckoutUrl } from '../src/utils/checkoutUrl.js';
import { readAccessHash, shouldDiscardToken } from '../src/utils/accessToken.js';

const ler = (arquivo) => readFileSync(new URL(`../${arquivo}`, import.meta.url), 'utf8');

/* ---- 7. safeCheckoutUrl ---- */

test('safeCheckoutUrl só aceita https do Mercado Pago e subdomínios', () => {
  assert.ok(safeCheckoutUrl('https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=1'));
  assert.ok(safeCheckoutUrl('https://mercadopago.com/x'));
  assert.ok(safeCheckoutUrl('https://sandbox.mercadopago.com.br/x'));
  assert.equal(safeCheckoutUrl('https://evil.com/mercadopago.com.br'), null);
  assert.equal(safeCheckoutUrl('https://mercadopago.com.br.evil.com/'), null);
  assert.equal(safeCheckoutUrl('https://evilmercadopago.com.br/'), null);
  assert.equal(safeCheckoutUrl('http://www.mercadopago.com.br/'), null);
  assert.equal(safeCheckoutUrl('javascript:alert(1)'), null);
  assert.equal(safeCheckoutUrl('https://user@evil.com@mercadopago.com.br.evil.com/'), null);
  assert.equal(safeCheckoutUrl(undefined), null);
});

/* ---- 8. hash do token ---- */

test('readAccessHash não lança com percent-encoding inválido', () => {
  assert.equal(readAccessHash('#acesso=%E0%A4%A'), null);
  assert.equal(readAccessHash('#acesso=%'), null);
});

test('readAccessHash lê e decodifica o token', () => {
  assert.equal(readAccessHash('#acesso=v1.4.5.abc%2Bdef'), 'v1.4.5.abc+def');
  assert.equal(readAccessHash(''), null);
  assert.equal(readAccessHash('#outra=1'), null);
});

test('só descarta o token guardado em 401/403, não em erro de rede ou 503', () => {
  assert.equal(shouldDiscardToken({ status: 401 }), true);
  assert.equal(shouldDiscardToken({ status: 403 }), true);
  assert.equal(shouldDiscardToken({ status: 503 }), false);
  assert.equal(shouldDiscardToken({ status: 0 }), false);
  assert.equal(shouldDiscardToken(new Error('rede')), false);
});

/* ---- 2. render.yaml ---- */

test('render.yaml declara SITE_PUBLIC_URL com sync: false', () => {
  assert.match(ler('render.yaml'), /- key: SITE_PUBLIC_URL\s*\n\s*sync: false/);
});

/* ---- 9. comentário do SESSION_SECRET ---- */

test('render.yaml não diz mais que SESSION_SECRET assina sessões', () => {
  assert.doesNotMatch(ler('render.yaml'), /Assina os identificadores de sessão/);
});

/* ---- 10. Dockerfile ---- */

test('Dockerfile usa o domínio oficial como padrão e a porta 8080', () => {
  const docker = ler('Dockerfile');
  assert.match(docker, /ARG VITE_SITE_URL="https:\/\/todai.com.br"/);
  assert.match(docker, /process\.env\.PORT\|\|8080/);
  assert.match(docker, /EXPOSE 8080/);
});
