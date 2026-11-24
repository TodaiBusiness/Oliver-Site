/* Quantidade digitada no portal (src/pages/portal/PortalCatalog.jsx → parseQtd). */
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('ponto é decimal em produto por fração e milhar em produto inteiro; vírgula é sempre decimal', async () => {
  const { parseQtd } = await import('../src/pages/portal/format.js');
  assert.equal(parseQtd('1.5', 0.1), 1.5);
  assert.equal(parseQtd('1,5', 0.1), 1.5);
  assert.equal(parseQtd('1.200', 1), 1200);
  assert.equal(parseQtd('1.234,5', 0.5), 1234.5);
  assert.equal(parseQtd('3', 1), 3);
});
