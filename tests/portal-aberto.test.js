import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aberturaEmTexto, podeCancelarPedido, statusDaLoja } from '../src/pages/portal/format.js';

// 2026-11-18 (quarta) 15:00 UTC = 12:00 em Brasília.
const AGORA = Date.parse('2026-11-18T15:00:00Z');

test('aberturaEmTexto usa o dia de Brasília: hoje, amanhã, dia da semana, data', () => {
  assert.equal(aberturaEmTexto('2026-11-18T18:00', AGORA), 'hoje às 18:00');
  assert.equal(aberturaEmTexto('2026-11-19T08:00', AGORA), 'amanhã às 08:00');
  assert.equal(aberturaEmTexto('2026-11-23T08:00', AGORA), 'segunda às 08:00');
  assert.equal(aberturaEmTexto('2026-12-05T08:00', AGORA), '05/12 às 08:00');
  assert.equal(aberturaEmTexto('lixo', AGORA), null);
  assert.equal(aberturaEmTexto(null, AGORA), null);
  // 01:00 UTC de 19/11 ainda é 18/11 22:00 em Brasília: "amanhã" continua sendo 19/11.
  assert.equal(aberturaEmTexto('2026-11-19T08:00', Date.parse('2026-11-19T01:00:00Z')), 'amanhã às 08:00');
});

test('statusDaLoja: aberto, fechado (com ou sem próxima abertura) e desconhecido', () => {
  assert.deepEqual(statusDaLoja({ abertoAgora: true }, AGORA), { aberto: true, texto: 'Aberto agora' });
  assert.deepEqual(statusDaLoja({ abertoAgora: false, proximaAbertura: '2026-11-19T08:00' }, AGORA), {
    aberto: false,
    texto: 'Fechado agora · abre amanhã às 08:00',
  });
  assert.deepEqual(statusDaLoja({ abertoAgora: false, proximaAbertura: null }, AGORA), { aberto: false, texto: 'Fechado agora' });
  assert.equal(statusDaLoja({ abertoAgora: null }, AGORA), null);
  assert.equal(statusDaLoja({}, AGORA), null);
});

test('podeCancelarPedido: prazo 0 esconde; só em "recebido"; segue a API e o prazo', () => {
  const novo = { estado: 'recebido', criadoEm: new Date(AGORA - 5 * 60000).toISOString() };
  assert.equal(podeCancelarPedido(novo, 0, AGORA), false);
  assert.equal(podeCancelarPedido({ ...novo, podeCancelar: true }, 0, AGORA), false);
  assert.equal(podeCancelarPedido(novo, 10, AGORA), true);
  assert.equal(podeCancelarPedido(novo, 3, AGORA), false);
  assert.equal(podeCancelarPedido({ ...novo, podeCancelar: false }, 10, AGORA), false);
  assert.equal(podeCancelarPedido({ ...novo, estado: 'aceito' }, 10, AGORA), false);
  assert.equal(podeCancelarPedido({ ...novo, cancelavelAte: new Date(AGORA - 1).toISOString() }, 10, AGORA), false);
  assert.equal(podeCancelarPedido(null, 10, AGORA), false);
});
