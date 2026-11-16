/* P-008: título e descrição por rota, iguais no navegador e no HTML que o servidor entrega. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { applySeo, seoFor } from '../shared/seo.js';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replaceAll('__SITE_URL__', 'https://loja.exemplo');

const ROTAS_PUBLICAS = [
  '/', '/sistema', '/precos', '/servicos', '/servicos/landing-pages', '/servicos/sites', '/servicos/saas',
  '/projetos', '/como-funciona', '/contato', '/comprar', '/baixar', '/termos', '/privacidade',
];

test('cada rota pública tem título próprio e vende o produto', () => {
  const titles = ROTAS_PUBLICAS.map((path) => seoFor(path).title);
  assert.equal(new Set(titles).size, titles.length);
  assert.match(seoFor('/').title, /TODAI/);
  assert.match(seoFor('/sistema').description, /mensalidade a partir de R\$ 130/);
  assert.match(seoFor('/comprar').description, /mensalidade a partir de R\$ 130/);
  assert.equal(seoFor('/comprar/').title, seoFor('/comprar').title);
  for (const path of ROTAS_PUBLICAS) assert.equal(seoFor(path).noindex, false);
});

test('conta, painel e página inexistente ficam fora dos buscadores', () => {
  for (const path of ['/obrigado', '/minha-licenca', '/login', '/cliente/solicitacoes/3', '/admin/projetos', '/nao-existe']) {
    assert.equal(seoFor(path).noindex, true, path);
  }
  assert.match(seoFor('/admin/clientes/9').title, /^Painel/);
  assert.match(seoFor('/nao-existe').title, /não encontrada/);
});

test('o servidor entrega o index.html com título, descrição e canonical da rota', () => {
  const html = applySeo(indexHtml, '/comprar');
  const seo = seoFor('/comprar');
  assert.ok(html.includes(`<title>${seo.title}</title>`));
  assert.match(html, /<link rel="canonical" href="https:\/\/loja\.exemplo\/comprar" \/>/);
  assert.match(html, /property="og:url" content="https:\/\/loja\.exemplo\/comprar"/);
  assert.equal((html.match(new RegExp(seo.description.replace(/[$.()|]/g, '\\$&'), 'g')) ?? []).length, 3);
  assert.doesNotMatch(html, /noindex/);
});

test('home mantém a barra no canonical e rota privada ganha noindex', () => {
  assert.match(applySeo(indexHtml, '/'), /<link rel="canonical" href="https:\/\/loja\.exemplo\/" \/>/);
  assert.match(applySeo(indexHtml, '/minha-licenca'), /<meta name="robots" content="noindex" \/>/);
});

test('HTML sem as metas de redes sociais só troca o título', () => {
  const html = applySeo('<html><head><title>x</title></head></html>', '/termos');
  assert.ok(html.includes('<title>Termos de uso | TODAI</title>'));
});
