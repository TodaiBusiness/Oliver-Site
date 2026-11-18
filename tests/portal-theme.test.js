/* Tema do portal: contraste AA garantido para qualquer cor que a loja escolha. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAFE, buildPortalTheme, contrast, ensureContrast, isHex, luminance, themePairs } from '../shared/portalTheme.js';

test('contraste: valores de referência da WCAG', () => {
  assert.equal(Math.round(contrast('#000000', '#ffffff')), 21);
  assert.equal(contrast('#777777', '#777777'), 1);
  assert.ok(Math.abs(contrast('#767676', '#ffffff') - 4.54) < 0.02, 'cinza #767676 é o limite AA no branco');
  assert.equal(luminance('#ffffff'), 1);
});

test('ensureContrast ajusta a cor da marca até passar e não mexe na que já passa', () => {
  assert.equal(ensureContrast('#1d4ed8', '#ffffff'), '#1d4ed8');
  const ajustada = ensureContrast('#ffe066', '#fffde7');
  assert.ok(contrast(ajustada, '#fffde7') >= 4.5);
  const noEscuro = ensureContrast('#111111', '#000000');
  assert.ok(contrast(noEscuro, '#000000') >= 4.5);
});

test('tema da loja com cor ruim (amarelo claro sobre creme) cai para texto escuro legível', () => {
  const t = buildPortalTheme({ primaria: '#ffe066', secundaria: '#fff3b0', fundo: '#fffde7' });
  assert.equal(t.adjusted, true);
  assert.ok(contrast(t.vars['--p-accent-text'], '#fffde7') >= 4.5);
  assert.ok(contrast(t.vars['--p-on-accent'], '#ffe066') >= 4.5, 'botão amarelo leva texto escuro');
  for (const [fg, bg, min] of themePairs(t.vars)) assert.ok(contrast(fg, bg) >= min, `${fg} sobre ${bg}`);
});

test('cor inválida, ausente ou maliciosa vira a cor segura', () => {
  for (const cores of [undefined, {}, { primaria: 'red', fundo: 'url(x)', secundaria: '#12' }, { primaria: '#ggg000' }, { primaria: 'expression(alert(1))' }]) {
    const t = buildPortalTheme(cores);
    assert.equal(t.vars['--p-accent'], SAFE.primaria);
    assert.equal(t.vars['--p-bg'], SAFE.fundo);
    for (const value of Object.values(t.vars)) assert.ok(isHex(value), `valor fora do formato: ${value}`);
    for (const [fg, bg, min] of themePairs(t.vars)) assert.ok(contrast(fg, bg) >= min);
  }
  assert.equal(buildPortalTheme({ primaria: 'red' }).usedFallback, true);
  assert.equal(buildPortalTheme({ primaria: '#0f766e', fundo: '#f8fafc', secundaria: '#fde68a' }).usedFallback, false);
});

test('fundo escuro: texto claro e todos os pares passam', () => {
  const t = buildPortalTheme({ primaria: '#7c3aed', secundaria: '#312e81', fundo: '#0b1020' });
  assert.equal(t.dark, true);
  for (const [fg, bg, min] of themePairs(t.vars)) assert.ok(contrast(fg, bg) >= min, `${fg} sobre ${bg} (${contrast(fg, bg).toFixed(2)})`);
});

test('varredura: 3000 combinações aleatórias sempre cumprem os pares prometidos', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const cor = () => `#${[0, 0, 0].map(() => Math.floor(rnd() * 256).toString(16).padStart(2, '0')).join('')}`;
  for (let i = 0; i < 3000; i++) {
    const t = buildPortalTheme({ primaria: cor(), secundaria: cor(), fundo: cor() });
    for (const [fg, bg, min] of themePairs(t.vars)) {
      assert.ok(contrast(fg, bg) >= min - 0.001, `${JSON.stringify(t.vars)} :: ${fg} sobre ${bg} = ${contrast(fg, bg).toFixed(2)}`);
    }
  }
});
