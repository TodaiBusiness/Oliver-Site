/* Lógica das demonstrações do PDV: totais, troco, busca sem acento, caixa e estoque. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCents, cartTotal, addItem, changeQty, change, normalize, searchScreens,
  highlightParts, shares, cashDifference, stockAfterSales,
} from '../src/components/pdv/pdvLogic.js';
import { SCREENS } from '../src/data/pdv.js';

test('parseCents lê vírgula, ponto e símbolo', () => {
  assert.equal(parseCents('12,50'), 1250);
  assert.equal(parseCents('R$ 1.234,56'), 123456);
  assert.equal(parseCents('abc'), 0);
  assert.equal(parseCents(''), 0);
});

test('comanda soma itens iguais e remove ao zerar', () => {
  const p = { id: 'a', name: 'Café', price: 550 };
  let c = addItem([], p);
  c = addItem(c, p);
  assert.equal(c.length, 1);
  assert.equal(cartTotal(c), 1100);
  c = changeQty(c, 'a', -2);
  assert.deepEqual(c, []);
});

test('troco e falta', () => {
  assert.deepEqual(change(1000, 1500), { troco: 500, falta: 0, ok: true });
  assert.deepEqual(change(1000, 400), { troco: 0, falta: 600, ok: false });
  assert.equal(change(0, 0).ok, false);
});

test('busca ignora acento e caixa e acha por iniciais', () => {
  assert.equal(normalize('  Configurações '), 'configuracoes');
  const nomes = (q) => searchScreens(SCREENS, q).map((s) => s.name);
  assert.ok(nomes('configuracoes').includes('Configurações'));
  assert.equal(nomes('cp')[0], 'Contas a pagar');
  assert.equal(searchScreens(SCREENS, '').length, SCREENS.length);
  assert.deepEqual(nomes('zzzz'), []);
});

test('destaque do termo', () => {
  assert.deepEqual(highlightParts('Contas a pagar', 'CONT'), [
    { text: 'Cont', hit: true },
    { text: 'as a pagar', hit: false },
  ]);
  assert.deepEqual(highlightParts('Configurações', 'acoes'), [
    { text: 'Configur', hit: false },
    { text: 'ações', hit: true },
  ]);
});

test('participação soma 100', () => {
  const r = shares([{ value: 1 }, { value: 1 }, { value: 1 }]);
  assert.equal(r.reduce((s, x) => s + x.pct, 0), 100);
  assert.equal(shares([{ value: 0 }])[0].pct, 0);
});

test('conferência do caixa', () => {
  assert.equal(cashDifference(10000, 10500).status, 'sobra');
  assert.equal(cashDifference(10000, 9000).diff, -1000);
  assert.equal(cashDifference(10000, 10000).status, 'exato');
});

test('estoque crítico sugere reposição', () => {
  const p = { stock: 20, min: 8 };
  assert.deepEqual(stockAfterSales(p, 5), { atual: 15, critico: false, repor: 0, vendido: 5 });
  assert.deepEqual(stockAfterSales(p, 14), { atual: 6, critico: true, repor: 10, vendido: 14 });
  assert.equal(stockAfterSales(p, 99).atual, 0);
});
