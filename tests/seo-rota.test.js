/* P-010: SEO sem diferenciar maiúsculas, head da navegação interna, origens permitidas e limpeza do limitador. */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seoFor, applySeo, seoHeadFor } from '../shared/seo.js';
import { statusDaSpa } from '../server/http/static.js';
import { parseAllowedOrigins } from '../server/http/origins.js';
import { createRateLimiter } from '../server/http/rateLimit.js';

test('seoFor e o status da SPA tratam o caminho sem diferenciar maiúsculas (igual ao roteador)', () => {
  assert.equal(seoFor('/Comprar').title, seoFor('/comprar').title);
  assert.equal(seoFor('/COMPRAR/').notFound, undefined);
  assert.equal(seoFor('/Admin/Projetos').noindex, true);
  assert.equal(seoFor('/Admin/Projetos').notFound, undefined);
  assert.equal(statusDaSpa('/Comprar'), 200);
  assert.equal(statusDaSpa('/Termos/'), 200);
  assert.equal(statusDaSpa('/NaoExiste'), 404);
});

test('applySeo usa o caminho em minúsculas no canonical e no og:url', () => {
  const html = '<link rel="canonical" href="https://x.com/" /><meta property="og:url" content="https://x.com/" />';
  const out = applySeo(html, '/Comprar/');
  assert.match(out, /href="https:\/\/x\.com\/comprar"/);
  assert.match(out, /content="https:\/\/x\.com\/comprar"/);
});

test('seoHeadFor devolve título, descrição, robots e URL (canonical e og:url) da rota', () => {
  const head = seoHeadFor('/Comprar/', 'https://x.com');
  assert.equal(head.title, seoFor('/comprar').title);
  assert.equal(head.url, 'https://x.com/comprar');
  assert.equal(head.robots, 'index, follow');
  assert.equal(seoHeadFor('/', 'https://x.com').url, 'https://x.com/');
  assert.equal(seoHeadFor('/login', 'https://x.com').robots, 'noindex');
});

test('ALLOWED_ORIGINS: tira barra final, espaços e duplicatas; produção sem origem falha fechado', () => {
  assert.deepEqual(parseAllowedOrigins({ ALLOWED_ORIGINS: ' https://a.com/ , https://a.com,https://b.com// ' }), ['https://a.com', 'https://b.com']);
  assert.deepEqual(parseAllowedOrigins({ ALLOWED_ORIGINS: 'https://a.com', RENDER_EXTERNAL_URL: 'https://r.onrender.com/' }), ['https://a.com', 'https://r.onrender.com']);
  assert.deepEqual(parseAllowedOrigins({}), []);
  assert.deepEqual(parseAllowedOrigins({ NODE_ENV: 'production' }, { exigir: true }), ['https://todai.com.br', 'https://www.todai.com.br']);
  assert.deepEqual(parseAllowedOrigins({ NODE_ENV: 'production', RENDER_EXTERNAL_URL: 'https://r.onrender.com' }), ['https://r.onrender.com']);
});

test('limitador: janelas vencidas são varridas e o teto de chaves vale', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const limiter = createRateLimiter({ max: 2, windowMs: 100, maxKeys: 3 });
  for (const chave of ['a', 'b', 'c']) limiter.hit(chave);
  assert.equal(limiter.size(), 3);
  limiter.hit('d'); // teto: descarta a mais antiga
  assert.equal(limiter.size(), 3);
  t.mock.timers.tick(500); // todas as janelas vencem
  limiter.hit('e');
  assert.equal(limiter.size(), 1, 'chaves vencidas precisam sair da memória');
  assert.equal(limiter.hit('e'), true);
  assert.equal(limiter.hit('e'), false);
});
