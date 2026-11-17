/* Cookie de consentimento: leitura segura e formato. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONSENT_VERSION, parseConsent, readConsent, serializeConsent } from '../src/utils/consent.js';

test('serializeConsent produz o formato do contrato, sem dado pessoal', () => {
  const json = JSON.parse(serializeConsent({ analytics: true }, 123));
  assert.deepEqual(json, { v: CONSENT_VERSION, necessary: true, analytics: true, ts: 123 });
  assert.equal(JSON.parse(serializeConsent({ analytics: 'sim' }, 1)).analytics, false);
});

test('parseConsent: JSON inválido, versão antiga ou tipo errado = sem consentimento', () => {
  for (const raw of [null, '', 'x', '[]', 'null', '{"v":0,"analytics":true}', '{"v":1,"analytics":"true"}', '{"v":1}']) {
    assert.equal(parseConsent(raw), null, String(raw));
  }
  const ok = parseConsent('{"v":1,"necessary":false,"analytics":true,"ts":5}');
  assert.deepEqual(ok, { v: 1, necessary: true, analytics: true, ts: 5 });
});

test('readConsent acha o cookie entre outros e decodifica', () => {
  const value = encodeURIComponent(serializeConsent({ analytics: false }, 9));
  const result = readConsent(`a=1; todai_consent=${value}; b=2`);
  assert.equal(result.analytics, false);
  assert.equal(readConsent('a=1'), null);
  assert.equal(readConsent('todai_consent=%E0%A4%A'), null);
});
