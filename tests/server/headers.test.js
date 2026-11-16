/* Cabeçalhos de segurança: fonte única, netlify.toml sem divergência e código
   do front compatível com CSP sem 'unsafe-inline' em style-src. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CSP, SECURITY_HEADERS } from '../../server/http/securityHeaders.js';

const raiz = join(import.meta.dirname, '..', '..');

test('os cabeçalhos exigidos existem', () => {
  for (const nome of [
    'Content-Security-Policy',
    'Strict-Transport-Security',
    'Referrer-Policy',
    'Permissions-Policy',
    'Cross-Origin-Opener-Policy',
    'Cross-Origin-Resource-Policy',
    'X-Content-Type-Options',
    'X-Frame-Options',
  ]) {
    assert.ok(SECURITY_HEADERS[nome], nome);
  }
  assert.ok(!CSP.includes("'unsafe-inline'"));
  assert.ok(!CSP.includes("'unsafe-eval'"));
  assert.match(CSP, /frame-ancestors 'none'/);
  assert.match(SECURITY_HEADERS['Strict-Transport-Security'], /max-age=\d{8,}/);
});

test('netlify.toml repete exatamente os valores do servidor', () => {
  const toml = readFileSync(join(raiz, 'netlify.toml'), 'utf8');
  for (const [nome, valor] of Object.entries(SECURITY_HEADERS)) {
    assert.ok(toml.includes(`${nome} = "${valor}"`), `netlify.toml diverge em ${nome}`);
  }
});

function arquivos(dir, acc = []) {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) arquivos(caminho, acc);
    else if (/\.(jsx?|html)$/.test(nome)) acc.push(caminho);
  }
  return acc;
}

test("o front não depende de style inline do HTML (CSP style-src 'self')", () => {
  const proibidos = [
    [/<style[\s>]/i, '<style>'],
    [/\sstyle\s*=\s*["']/i, 'atributo style="..." em HTML/JSX literal'],
    [/dangerouslySetInnerHTML/, 'dangerouslySetInnerHTML'],
    [/setAttribute\(\s*['"]style['"]/, "setAttribute('style')"],
    [/\.cssText\s*=/, 'cssText'],
    [/insertAdjacentHTML|\.innerHTML\s*=/, 'HTML dinâmico'],
  ];
  const achados = [];
  for (const arquivo of [...arquivos(join(raiz, 'src')), join(raiz, 'index.html')]) {
    const texto = readFileSync(arquivo, 'utf8');
    for (const [re, nome] of proibidos) if (re.test(texto)) achados.push(`${arquivo.replace(raiz, '')}: ${nome}`);
  }
  assert.deepEqual(achados, []);
});
