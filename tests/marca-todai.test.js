/* Troca da marca Oliver para TODAI: o que já estava salvo com o nome antigo
   não pode se perder (tema escolhido no navegador e banco SQLite local). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

import { readTheme, THEME_KEY, LEGACY_THEME_KEY } from '../src/app/theme.js';
import {
  sqliteFilePadrao,
  SQLITE_FILE_PADRAO,
  SQLITE_FILE_LEGADO,
} from '../server/config.js';

function memoria(inicial = {}) {
  const store = new Map(Object.entries(inicial));
  return {
    store,
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

/* ------------------------------------------------ tema (src/app/theme.js) */

test('tema: a chave nova vale e a antiga é ignorada', () => {
  const s = memoria({ [THEME_KEY]: 'light', [LEGACY_THEME_KEY]: 'dark' });
  assert.equal(readTheme(s), 'light');
});

test('tema: a escolha antiga passa para a chave nova uma única vez', () => {
  const s = memoria({ [LEGACY_THEME_KEY]: 'dark' });
  assert.equal(readTheme(s), 'dark');
  assert.equal(s.getItem(THEME_KEY), 'dark');
  assert.equal(s.getItem(LEGACY_THEME_KEY), null);
});

test('tema: valor antigo inválido não é copiado', () => {
  const s = memoria({ [LEGACY_THEME_KEY]: 'roxo' });
  assert.equal(readTheme(s), 'system');
  assert.equal(s.getItem(THEME_KEY), null);
});

test('tema: sem nada salvo segue o sistema', () => {
  assert.equal(readTheme(memoria()), 'system');
});

test('tema: armazenamento bloqueado segue o sistema', () => {
  const quebrado = { getItem() { throw new Error('bloqueado'); } };
  assert.equal(readTheme(quebrado), 'system');
});

/* ------------------------------------- tema (public/theme-init.js, antes da pintura) */

function rodarThemeInit(inicial) {
  const storage = memoria(inicial);
  const attrs = {};
  const documentElement = { setAttribute: (k, v) => { attrs[k] = v; } };
  const codigo = readFileSync(new URL('../public/theme-init.js', import.meta.url), 'utf8');
  runInNewContext(codigo, { localStorage: storage, document: { documentElement } });
  return { storage, attrs };
}

test('theme-init: migra a escolha antiga e aplica antes da pintura', () => {
  const { storage, attrs } = rodarThemeInit({ 'oliver-theme': 'light' });
  assert.equal(attrs['data-theme'], 'light');
  assert.equal(storage.getItem('todai-theme'), 'light');
  assert.equal(storage.getItem('oliver-theme'), null);
});

test('theme-init: usa a mesma chave de src/app/theme.js', () => {
  const { attrs } = rodarThemeInit({ [THEME_KEY]: 'dark' });
  assert.equal(attrs['data-theme'], 'dark');
});

test('theme-init: sem escolha não marca o tema e apaga lixo antigo', () => {
  const { storage, attrs } = rodarThemeInit({ 'oliver-theme': 'roxo' });
  assert.equal(attrs['data-theme'], undefined);
  assert.equal(storage.getItem('oliver-theme'), null);
});

/* ------------------------------------------------ banco SQLite local */

test('sqlite: sem arquivo nenhum, usa o nome novo', () => {
  assert.equal(sqliteFilePadrao(() => false), SQLITE_FILE_PADRAO);
  assert.equal(SQLITE_FILE_PADRAO, 'server/data/todai.db');
});

test('sqlite: só o banco antigo existe, continua usando ele', () => {
  const existe = (p) => p === SQLITE_FILE_LEGADO;
  assert.equal(sqliteFilePadrao(existe), SQLITE_FILE_LEGADO);
});

test('sqlite: os dois existem, vence o nome novo', () => {
  assert.equal(sqliteFilePadrao(() => true), SQLITE_FILE_PADRAO);
});
