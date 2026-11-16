/* CPF/CNPJ e preço do plano: as funções que o formulário e o servidor dividem. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTaxId, isValidTaxId, onlyDigits } from '../shared/taxId.js';
import { PLAN, formatBRL, monthlyPrice } from '../shared/plan.js';

test('CPF e CNPJ conferem os dígitos verificadores', () => {
  const validos = ['529.982.247-25', '52998224725', '11.222.333/0001-81', '11222333000181'];
  const invalidos = ['529.982.247-24', '11.222.333/0001-82', '111.111.111-11', '00000000000000', '1234', '', null, undefined];
  for (const documento of validos) assert.equal(isValidTaxId(documento), true, String(documento));
  for (const documento of invalidos) assert.equal(isValidTaxId(documento), false, String(documento));
});

test('onlyDigits tira tudo que não é número', () => {
  assert.equal(onlyDigits(' 11.222.333/0001-81 '), '11222333000181');
  assert.equal(onlyDigits(null), '');
});

test('a máscara acompanha a digitação de CPF e de CNPJ', () => {
  assert.equal(formatTaxId('52998224725'), '529.982.247-25');
  assert.equal(formatTaxId('5299'), '529.9');
  assert.equal(formatTaxId('11222333000181'), '11.222.333/0001-81');
  assert.equal(formatTaxId('112223330001'), '11.222.333/0001');
  assert.equal(formatTaxId('11.222.333/0001-81999'), '11.222.333/0001-81', 'corta no tamanho do CNPJ');
});

test('o preço estimado soma o computador incluído e os extras', () => {
  assert.equal(monthlyPrice(1), 130);
  assert.equal(monthlyPrice(2), 150);
  assert.equal(monthlyPrice(5), 210);
  assert.equal(monthlyPrice(PLAN.maxDevices), 130 + 19 * 20);
});

test('quantidade absurda não gera preço negativo nem NaN', () => {
  assert.equal(monthlyPrice(0), 130);
  assert.equal(monthlyPrice(-3), 130);
  assert.equal(monthlyPrice('x'), 130);
  assert.equal(monthlyPrice(2.9), 150, 'fração não conta computador');
});

test('o valor sai em reais, no formato brasileiro', () => {
  assert.match(formatBRL(550), /R\$\s?550,00/);
  assert.match(formatBRL(1234.5), /R\$\s?1\.234,50/);
});
