/* Visitas do site: coleta agregada, relatório e proteção da rota. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDb } from '../../server/db/index.js';
import { createApp } from '../../server/app.js';
import {
  analyticsService,
  deviceFromUserAgent,
  parseDays,
  pathFrom,
  referrerFrom,
} from '../../server/services/analytics.js';
import { createWindowCounter } from '../../server/http/rateLimit.js';
import { request } from './helpers.js';

const KEY = 'k'.repeat(40);
const ORIGIN = 'https://oliver.exemplo';
const UA_PC = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36';
const UA_CEL = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari/604.1';
const T0 = Date.parse('2026-10-27T15:00:00Z');

async function setup({ readKey = KEY, allowedOrigins = [], clock = { now: T0 } } = {}) {
  const db = await createTestDb();
  await db.init();
  const analytics = analyticsService(db, { readKey, allowedOrigins, now: () => clock.now });
  const app = createApp(db, { allowedOrigins, analytics });
  return { app, db, analytics, clock, close: () => db.close() };
}

const visita = (app, { path = '/', entry = true, ua = UA_PC, ip = '1.1.1.1', extra = {}, headers = {} } = {}) =>
  request(app, 'POST', '/api/analytics/collect', {
    body: { path, entry, ...extra },
    headers: { 'user-agent': ua, 'x-forwarded-for': ip, ...headers },
  });

const relatorio = (app, { key = KEY, days } = {}) =>
  request(app, 'GET', '/api/analytics/report', {
    query: days === undefined ? {} : { days: String(days) },
    headers: key === null ? {} : { 'X-Analytics-Key': key },
  });

/* ---- coleta e agregação ---- */

test('corpo grande demais na coleta é recusado com 413; o normal passa', async () => {
  const { app, close } = await setup();
  try {
    const grande = await visita(app, { extra: { referrer: 'x'.repeat(5000) } });
    assert.equal(grande.status, 413);
    const normal = await visita(app);
    assert.equal(normal.status, 202);
  } finally {
    await close();
  }
});

test('uma visita vira contadores agregados por recorte', async () => {
  const { app, close } = await setup();
  try {
    const res = await visita(app, {
      path: '/comprar?x=1',
      extra: { referrer: 'https://www.instagram.com/p/abc', utmCampaign: 'lancamento' },
      headers: { 'CF-IPCountry': 'BR', 'CF-IPCity': 'S%C3%A3o%20Paulo' },
    });
    assert.equal(res.status, 202);

    const r = (await relatorio(app, { days: 7 })).body;
    assert.deepEqual(r.totals, { visits: 1, visitors: 1, sessions: 1 });
    assert.deepEqual(r.rankings.country, [{ label: 'BR', visits: 1, visitors: 1 }]);
    assert.equal(r.rankings.city[0].label, 'São Paulo');
    assert.equal(r.rankings.referrer[0].label, 'instagram.com');
    assert.equal(r.rankings.campaign[0].label, 'lancamento');
    assert.equal(r.rankings.device[0].label, 'computador');
    assert.equal(r.rankings.path[0].label, '/comprar');
  } finally {
    close();
  }
});

test('sem cabeçalho de CDN o país e a cidade ficam Desconhecido', async () => {
  const { app, close } = await setup();
  try {
    await visita(app);
    const r = (await relatorio(app, { days: 7 })).body;
    assert.equal(r.rankings.country[0].label, 'Desconhecido');
    assert.equal(r.rankings.city[0].label, 'Desconhecido');
  } finally {
    close();
  }
});

test('mesmo visitante no dia: visitas somam, visitantes não; navegação interna não é nova sessão', async () => {
  const { app, close } = await setup();
  try {
    await visita(app, { path: '/', entry: true });
    await visita(app, { path: '/comprar', entry: false });
    await visita(app, { path: '/', entry: true, ip: '2.2.2.2', ua: UA_CEL });

    const r = (await relatorio(app, { days: 1 })).body;
    assert.deepEqual(r.totals, { visits: 3, visitors: 2, sessions: 2 });
    assert.deepEqual(r.rankings.device.map((d) => [d.label, d.visits]), [['computador', 2], ['celular', 1]]);
    /* origem só na entrada: 2 entradas, não 3. */
    assert.equal(r.rankings.referrer[0].visits, 2);
  } finally {
    close();
  }
});

test('o relatório não guarda IP nem identificador no banco', async () => {
  const { app, db, close } = await setup();
  try {
    await visita(app, { ip: '203.0.113.77' });
    const linhas = JSON.stringify(await db.query('SELECT * FROM site_visit_stats'));
    assert.ok(!linhas.includes('203.0.113.77'));
    assert.ok(!/[0-9a-f]{32}/.test(linhas), 'nenhum hash gravado');
  } finally {
    close();
  }
});

test('bot, DNT e Sec-GPC não são contados', async () => {
  const { app, close } = await setup();
  try {
    await visita(app, { ua: 'Googlebot/2.1 (+http://www.google.com/bot.html)' });
    await visita(app, { ua: '' });
    await visita(app, { headers: { DNT: '1' } });
    await visita(app, { headers: { 'Sec-GPC': '1' } });
    assert.equal((await relatorio(app, { days: 7 })).body.totals.visits, 0);
  } finally {
    close();
  }
});

test('referrer do próprio site é Direto; caminho estranho vira /outros; campos são limitados', async () => {
  assert.equal(referrerFrom('https://www.oliver.exemplo/x', ['oliver.exemplo']), 'Direto');
  assert.equal(referrerFrom('', []), 'Direto');
  assert.equal(referrerFrom('lixo', []), 'Direto');
  assert.equal(pathFrom('/Comprar/?a=1#b'), '/comprar');
  assert.equal(pathFrom('/<script>'), '/outros');
  assert.equal(pathFrom(`/${'a'.repeat(300)}`).length, 80);
  assert.equal(deviceFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0)'), 'tablet');
  assert.equal(deviceFromUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)'), 'tablet');
  assert.equal(deviceFromUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari'), 'celular');
});

test('rótulos em excesso caem em Outros (memória e banco não crescem sem limite)', async () => {
  const { app, close } = await setup();
  try {
    for (let i = 0; i < 305; i += 1) {
      await visita(app, { entry: true, extra: { utmCampaign: `c${i}` }, ip: `10.0.${Math.floor(i / 200)}.${i % 200}` });
    }
    const campanhas = (await relatorio(app, { days: 1 })).body.rankings.campaign;
    assert.ok(campanhas.some((c) => c.label === 'Outros'));
  } finally {
    close();
  }
});

test('retenção: registros além de 400 dias são apagados', async () => {
  const { app, db, clock, close } = await setup();
  try {
    await visita(app);
    await db.execute("UPDATE site_visit_stats SET stat_day = '2020-01-01'");
    clock.now = T0 + 24 * 60 * 60 * 1000; // outro dia dispara a limpeza
    await visita(app);
    const antigos = await db.query("SELECT 1 FROM site_visit_stats WHERE stat_day = '2020-01-01'");
    assert.equal(antigos.length, 0);
  } finally {
    close();
  }
});

/* ---- proteções da coleta ---- */

test('coleta recusa origem diferente e a ausência de Origin quando há origens configuradas', async () => {
  const { app, close } = await setup({ allowedOrigins: [ORIGIN] });
  try {
    assert.equal((await visita(app, { headers: { Origin: 'https://outro.site' } })).status, 403);
    assert.equal((await visita(app)).status, 403);
    assert.equal((await visita(app, { headers: { Origin: ORIGIN } })).status, 202);
  } finally {
    close();
  }
});

test('coleta tem rate limit por IP (30 por minuto; o 31º dá 429)', async () => {
  const { app, close } = await setup();
  try {
    for (let i = 0; i < 30; i += 1) {
      assert.equal((await visita(app, { ip: '9.9.9.9' })).status, 202, `pedido ${i + 1}`);
    }
    assert.equal((await visita(app, { ip: '9.9.9.9' })).status, 429);
    assert.equal((await visita(app, { ip: '8.8.8.8' })).status, 202);
  } finally {
    close();
  }
});

test('contador de janela fixa: teto por chave, reinício ao fim da janela e teto de chaves', () => {
  const clock = { t: 0 };
  const c = createWindowCounter({ max: 3, windowMs: 1000, now: () => clock.t });
  assert.deepEqual([c.hit('a'), c.hit('a'), c.hit('a'), c.hit('a')], [true, true, true, false]);
  assert.equal(c.hit('b'), true);
  clock.t = 1000;
  assert.equal(c.hit('a'), true);
  const pequeno = createWindowCounter({ max: 1, windowMs: 1000, maxKeys: 2, now: () => clock.t });
  pequeno.hit('x');
  pequeno.hit('y');
  pequeno.hit('z');
  assert.equal(pequeno.size(), 2);
});

test('uma coleta grava numa única instrução (lote), com origem e campanha', async () => {
  const { app, db, close } = await setup();
  try {
    await visita(app, { ip: '2.2.2.2' }); // cria a tabela e faz a limpeza do dia
    const original = db.execute.bind(db);
    const escritas = [];
    db.execute = (sql, params) => {
      if (/INSERT INTO site_visit_stats/i.test(sql)) escritas.push(params.length);
      return original(sql, params);
    };
    const res = await visita(app, {
      entry: true,
      ip: '3.3.3.3',
      extra: { utmCampaign: 'black', referrer: 'https://google.com/' },
    });
    assert.equal(res.status, 202);
    assert.deepEqual(escritas, [7 * 5]); // 7 linhas x 5 parâmetros, 1 instrução
    const r = (await relatorio(app, { days: 1 })).body;
    assert.equal(r.rankings.campaign[0].label, 'black');
    assert.equal(r.rankings.referrer.find((x) => x.label === 'google.com').visits, 1);
  } finally {
    close();
  }
});

test('o mesmo IP com user agents forjados só soma 5 visitantes por dia', async () => {
  const { app, close } = await setup();
  try {
    for (let i = 0; i < 12; i += 1) {
      await visita(app, { ip: '4.4.4.4', ua: `Mozilla/5.0 Forjado/${i}` });
    }
    const r = (await relatorio(app, { days: 1 })).body;
    assert.equal(r.totals.visits, 12);
    assert.equal(r.totals.visitors, 5);
    /* um navegador já admitido continua sendo a mesma pessoa. */
    await visita(app, { ip: '4.4.4.4', ua: 'Mozilla/5.0 Forjado/0' });
    assert.equal((await relatorio(app, { days: 1 })).body.totals.visitors, 5);
  } finally {
    close();
  }
});

test('o mesmo IP só gera 30 sessões/origens por dia; o excesso vira página vista comum', async () => {
  const { analytics, app, close } = await setup();
  try {
    /* direto no serviço: o teto por minuto da rota não atrapalha o teste do teto diário. */
    for (let i = 0; i < 40; i += 1) {
      await analytics.collect({
        headers: { 'user-agent': UA_PC, 'x-forwarded-for': '5.5.5.5' },
        body: { path: '/', entry: true, referrer: 'https://google.com/' },
      });
    }
    const r = (await relatorio(app, { days: 1 })).body;
    assert.equal(r.totals.visits, 40);
    assert.equal(r.totals.sessions, 30);
    assert.equal(r.rankings.referrer[0].visits, 30);
  } finally {
    close();
  }
});

test('o relatório mantém o contrato (window, totals, daily e rankings)', async () => {
  const { app, close } = await setup();
  try {
    await visita(app);
    const r = (await relatorio(app, { days: 3 })).body;
    assert.deepEqual(Object.keys(r), ['window', 'totals', 'daily', 'rankings']);
    assert.deepEqual(Object.keys(r.window), ['days', 'since', 'until']);
    assert.deepEqual(Object.keys(r.totals), ['visits', 'visitors', 'sessions']);
    assert.deepEqual(Object.keys(r.daily[0]), ['date', 'visits', 'visitors']);
    assert.deepEqual(Object.keys(r.rankings), ['country', 'city', 'referrer', 'campaign', 'device', 'path']);
    assert.equal(r.daily.length, 3);
  } finally {
    close();
  }
});

test('falha ao gravar não derruba a coleta', async () => {
  const { app, db, close } = await setup();
  try {
    await visita(app);
    await db.execute('DROP TABLE site_visit_stats');
    const original = console.error;
    console.error = () => {};
    try {
      /* a tabela é recriada sozinha só na primeira vez; aqui o cache de "pronta" já existe. */
      assert.equal((await visita(app)).status, 202);
    } finally {
      console.error = original;
    }
  } finally {
    close();
  }
});

/* ---- autenticação do relatório ---- */

test('relatório: sem ANALYTICS_READ_KEY responde 503; chave curta também', async () => {
  for (const readKey of [null, '', 'curta']) {
    const { app, close } = await setup({ readKey });
    try {
      assert.equal((await relatorio(app, { key: 'curta' })).status, 503);
      assert.equal((await relatorio(app, { key: null })).status, 503);
    } finally {
      close();
    }
  }
});

test('relatório: sem chave 401, chave errada 401, chave certa 200', async () => {
  const { app, close } = await setup();
  try {
    assert.equal((await relatorio(app, { key: null })).status, 401);
    assert.equal((await relatorio(app, { key: 'x'.repeat(40) })).status, 401);
    assert.equal((await relatorio(app, { key: KEY.slice(0, -1) })).status, 401);
    assert.equal((await relatorio(app, { key: KEY })).status, 200);
  } finally {
    close();
  }
});

/* ---- formato e limites ---- */

test('relatório: formato window/totals/daily/rankings e série completa de dias', async () => {
  const { app, clock, close } = await setup();
  try {
    await visita(app);
    const r = (await relatorio(app, { days: 7 })).body;

    assert.deepEqual(Object.keys(r), ['window', 'totals', 'daily', 'rankings']);
    assert.equal(r.window.days, 7);
    assert.equal(r.window.until, clock.now);
    assert.equal(r.window.since, Date.parse('2026-10-21T03:00:00Z'));
    assert.deepEqual(Object.keys(r.totals), ['visits', 'visitors', 'sessions']);
    assert.equal(r.daily.length, 7);
    assert.deepEqual(r.daily[6], { date: '2026-10-27', visits: 1, visitors: 1 });
    assert.deepEqual(r.daily[0], { date: '2026-10-21', visits: 0, visitors: 0 });
    assert.deepEqual(Object.keys(r.rankings), ['country', 'city', 'referrer', 'campaign', 'device', 'path']);
    assert.deepEqual(Object.keys(r.rankings.path[0]), ['label', 'visits', 'visitors']);
  } finally {
    close();
  }
});

test('relatório: days padrão 30 e limites 1..400', async () => {
  const { app, close } = await setup();
  try {
    assert.equal((await relatorio(app)).body.window.days, 30);
    assert.equal((await relatorio(app, { days: 1 })).status, 200);
    assert.equal((await relatorio(app, { days: 400 })).body.daily.length, 400);
    for (const days of [0, 401, -3, 'abc', '1.5', '7 OR 1=1']) {
      assert.equal((await relatorio(app, { days })).status, 400, `days=${days}`);
    }
    assert.equal(parseDays(undefined), 30);
    assert.equal(parseDays('15'), 15);
    assert.equal(parseDays('0'), null);
  } finally {
    close();
  }
});

test('o período filtra: visitas de dias fora da janela não entram', async () => {
  const { app, clock, close } = await setup();
  try {
    await visita(app);
    clock.now = T0 + 10 * 24 * 60 * 60 * 1000;
    await visita(app, { ip: '4.4.4.4' });
    assert.equal((await relatorio(app, { days: 3 })).body.totals.visits, 1);
    assert.equal((await relatorio(app, { days: 30 })).body.totals.visits, 2);
  } finally {
    close();
  }
});
