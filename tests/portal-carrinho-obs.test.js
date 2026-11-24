/* Observação por item do portal (src/pages/portal/cartStorage.js): a API só tem uma observação por pedido. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OBS_PEDIDO_MAX, juntarObservacao } from '../src/pages/portal/cartStorage.js';

test('junta as observações dos itens antes da observação geral', () => {
  const itens = [
    { nome: 'Açaí 500 ml', obs: ' sem granola ' },
    { nome: 'Pão francês', obs: '' },
    { nome: 'Coca-Cola lata', obs: 'bem gelada' },
  ];
  assert.equal(juntarObservacao(itens, ' Tocar a campainha '), '• Açaí 500 ml: sem granola\n• Coca-Cola lata: bem gelada\n\nTocar a campainha');
  assert.equal(juntarObservacao(itens, ''), '• Açaí 500 ml: sem granola\n• Coca-Cola lata: bem gelada');
});

test('sem observação de item, fica só a geral; nada vira texto vazio', () => {
  assert.equal(juntarObservacao([{ nome: 'X' }], ' oi '), 'oi');
  assert.equal(juntarObservacao([], ''), '');
  assert.equal(juntarObservacao([{ nome: 'X', obs: '   ' }], undefined), '');
});

test('nunca passa do limite da API', () => {
  const itens = Array.from({ length: 10 }, (_, i) => ({ nome: `Produto ${i}`, obs: 'x'.repeat(140) }));
  assert.equal(juntarObservacao(itens, 'geral').length, OBS_PEDIDO_MAX);
});

test('"Pedir de novo": mais recentes primeiro, sem repetir, só o que está à venda', async () => {
  const { produtosParaPedirDeNovo } = await import('../src/pages/portal/format.js');
  const produtos = [
    { id: 'a', disponivel: true },
    { id: 'b', disponivel: true },
    { id: 'c', disponivel: false },
    { id: 'd', disponivel: true },
  ];
  const pedidos = [
    { criadoEm: '2026-11-01T10:00:00Z', itens: [{ produtoId: 'd' }, { produtoId: 'a' }] },
    { criadoEm: '2026-11-20T10:00:00Z', itens: [{ produtoId: 'b' }, { produtoId: 'c' }, { produtoId: 'sumiu' }, { produtoId: 'a' }] },
  ];
  assert.deepEqual(produtosParaPedirDeNovo(pedidos, produtos).map((p) => p.id), ['b', 'a', 'd']);
  assert.deepEqual(produtosParaPedirDeNovo(pedidos, produtos, 2).map((p) => p.id), ['b', 'a']);
  assert.deepEqual(produtosParaPedirDeNovo(null, produtos), []);
  assert.deepEqual(produtosParaPedirDeNovo([{ itens: null }], produtos), []);
});
