/* Testes do funil: montagem da mensagem e validação do que vem da sessão
   (conteúdo que o usuário consegue editar no navegador). */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/* sessionStorage não existe no Node — stub simples para os testes. */
const store = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { buildFunnelMessage, loadFunnelState, FUNNEL_STEPS } = await import(
  '../src/data/funnel.js'
);
const { FUNNEL_STORAGE_KEY } = await import('../src/config/constants.js');

beforeEach(() => store.clear());

const seed = (value) => store.set(FUNNEL_STORAGE_KEY, JSON.stringify(value));

/* ------------------------------------------------ montagem da mensagem */

test('monta a mensagem com necessidade e estágio', () => {
  const msg = buildFunnelMessage({ need: 'sistema-erp', stage: 'zero' });

  assert.equal(
    msg,
    'Olá! Vim pelo site da TODAI.\n' +
      'Estou interessado em desenvolver um Sistema / ERP.\n' +
      'Atualmente estou na fase de criação do projeto.\n' +
      'Gostaria de conversar sobre como podemos desenvolver essa solução.'
  );
});

test('não repete a frase quando estágio e necessidade dizem o mesmo', () => {
  const msg = buildFunnelMessage({ need: 'automacao', stage: 'automatizar' });
  const linhas = msg.split('\n');

  assert.equal(linhas.length, 3, 'a frase redundante deve ser omitida');
  assert.ok(msg.includes('Preciso desenvolver uma automação'));
  assert.ok(!msg.includes('Preciso automatizar um processo da operação.'));
});

test('funciona mesmo sem nenhuma escolha', () => {
  const msg = buildFunnelMessage({});
  assert.ok(msg.startsWith('Olá! Vim pelo site da TODAI.'));
  assert.ok(msg.includes('Gostaria de conversar'));
});

/* --------------------------------------- validação do que vem da sessão */

test('restaura um estado válido', () => {
  seed({ need: 'site', stage: 'ideia', step: 2 });
  assert.deepEqual(loadFunnelState(), { need: 'site', stage: 'ideia', step: 2 });
});

test('descarta necessidade e estágio que não existem na lista', () => {
  seed({ need: '<script>alert(1)</script>', stage: 'inventado', step: 1 });

  const state = loadFunnelState();
  assert.equal(state.need, null);
  assert.equal(state.stage, null);
});

test('prende a etapa dentro do intervalo válido', () => {
  const ultima = FUNNEL_STEPS.length - 1;

  seed({ need: 'site', stage: 'ideia', step: 999 });
  assert.equal(loadFunnelState().step, ultima, 'não pode passar da última');

  seed({ need: 'site', stage: 'ideia', step: -10 });
  assert.equal(loadFunnelState().step, 0, 'não pode ser negativa');

  seed({ need: 'site', stage: 'ideia', step: 'texto' });
  assert.equal(loadFunnelState().step, 0, 'valor não numérico vira 0');
});

test('não quebra com JSON corrompido', () => {
  store.set(FUNNEL_STORAGE_KEY, '{ isso não é json');
  assert.equal(loadFunnelState(), null);
});

test('devolve null quando não há nada salvo', () => {
  assert.equal(loadFunnelState(), null);
});
