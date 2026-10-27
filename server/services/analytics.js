/* =========================================================================
   Visitas do site — registro AGREGADO e relatório para o Panel Desktop.

   O que NÃO existe aqui, de propósito: IP guardado, cookie de rastreio, id de
   pessoa, chamada a serviço externo com o IP. Cada visita vira só contadores
   por dia (tabela `site_visit_stats`): país, cidade, origem, campanha,
   aparelho e página.

   "Visitantes" do dia usam um hash de IP + navegador com sal sorteado a cada
   dia e mantido SÓ em memória (nunca vai ao banco). Ao virar o dia o sal é
   trocado, então o mesmo hash não liga dois dias. Reiniciar o processo zera a
   memória: no pior caso a pessoa é contada de novo naquele dia.

   País e cidade vêm de cabeçalhos que o proxy/CDN põe (Cloudflare, CloudFront,
   Vercel). Sem eles o valor é "Desconhecido".
   ========================================================================= */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { clientAddress } from '../http/clientAddress.js';

/** Contabilidade em horário de Brasília (UTC-3, sem horário de verão desde 2019). */
const OFFSET_MS = -3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const ANALYTICS_LIMITS = Object.freeze({
  RETENTION_DAYS: 400,
  DAYS_MIN: 1,
  DAYS_MAX: 400,
  DAYS_DEFAULT: 30,
  PATH_MAX: 80,
  LABEL_MAX: 60,
  HOST_MAX: 80,
  FIELD_RAW_MAX: 500,
  /** Rótulos distintos por recorte e por dia; o excesso cai em "Outros". */
  LABELS_PER_DAY: 300,
  /** Teto da memória de "já contei este visitante hoje". */
  SEEN_MAX: 200_000,
  RANKING_SIZE: 20,
  MIN_KEY_LENGTH: 32,
});

export const DIMENSIONS = ['country', 'city', 'referrer', 'campaign', 'device', 'path'];
const TOTAL = 'total';
const UNKNOWN = 'Desconhecido';

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS site_visit_stats (
  stat_day TEXT    NOT NULL,
  dim      TEXT    NOT NULL,
  label    TEXT    NOT NULL,
  visits   INTEGER NOT NULL DEFAULT 0,
  visitors INTEGER NOT NULL DEFAULT 0,
  sessions INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (stat_day, dim, label)
)`;

const BOT =
  /bot\b|bot[/ ;)_-]|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime|monitor|curl\/|wget|python-requests|node-fetch|axios|go-http|java\/|httpclient|libwww|scrapy|phantom/i;

/* ------------------------------------------------------------ utilidades */

export function dayKey(ms) {
  return new Date(ms + OFFSET_MS).toISOString().slice(0, 10);
}

/** Instante UTC (ms) em que o dia `aaaa-mm-dd` começa no horário de Brasília. */
function dayStartMs(key) {
  return Date.parse(`${key}T00:00:00Z`) - OFFSET_MS;
}

function clean(value, max) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function deviceFromUserAgent(ua) {
  if (/ipad|tablet|playbook|silk/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua))) {
    return 'tablet';
  }
  if (/mobi|iphone|ipod|android|windows phone/i.test(ua)) return 'celular';
  return 'computador';
}

export function isBot(ua) {
  return !ua || BOT.test(ua);
}

export function countryFrom(headers) {
  const raw = clean(
    headers['cf-ipcountry'] ??
      headers['cloudfront-viewer-country'] ??
      headers['x-vercel-ip-country'] ??
      '',
    4
  ).toUpperCase();
  /* XX = sem país (Cloudflare); T1 = rede Tor, que não casa com 2 letras. */
  return /^[A-Z]{2}$/.test(raw) && raw !== 'XX' ? raw : UNKNOWN;
}

export function cityFrom(headers) {
  const raw =
    headers['cf-ipcity'] ?? headers['cloudfront-viewer-city'] ?? headers['x-vercel-ip-city'];
  return clean(safeDecode(String(raw ?? '')), ANALYTICS_LIMITS.LABEL_MAX) || UNKNOWN;
}

export function pathFrom(value) {
  let path = String(value ?? '').split(/[?#]/)[0].toLowerCase();
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.replace(/\/{2,}/g, '/');
  if (path.length > 1) path = path.replace(/\/$/, '');
  if (!/^\/[a-z0-9\-_./]*$/.test(path)) return '/outros';
  return path.slice(0, ANALYTICS_LIMITS.PATH_MAX);
}

/** Domínio de origem do visitante; vazio ou do próprio site é acesso direto. */
export function referrerFrom(value, ownHosts = []) {
  const raw = clean(value, ANALYTICS_LIMITS.FIELD_RAW_MAX);
  if (!raw) return 'Direto';
  let host;
  try {
    host = new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return 'Direto';
  }
  if (!host || ownHosts.includes(host)) return 'Direto';
  return host.slice(0, ANALYTICS_LIMITS.HOST_MAX);
}

function hostOf(origin) {
  try {
    return new URL(origin).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Valida `?days=`: ausente = padrão; fora de 1..400 ou não inteiro = null. */
export function parseDays(value) {
  if (value === undefined || value === '') return ANALYTICS_LIMITS.DAYS_DEFAULT;
  if (!/^\d{1,4}$/.test(String(value))) return null;
  const days = Number(value);
  return days >= ANALYTICS_LIMITS.DAYS_MIN && days <= ANALYTICS_LIMITS.DAYS_MAX ? days : null;
}

/* --------------------------------------------------------------- serviço */

export function analyticsService(
  db,
  { readKey = undefined, now = () => Date.now(), allowedOrigins = [] } = {}
) {
  const ownHosts = allowedOrigins.map(hostOf).filter(Boolean);
  const enabled = typeof readKey === 'string' && readKey.length >= ANALYTICS_LIMITS.MIN_KEY_LENGTH;

  let tableReady = null;
  const ensureTable = () =>
    (tableReady ??= db.execute(CREATE_TABLE).catch((error) => {
      tableReady = null;
      throw error;
    }));

  /* Estado do dia corrente, só em memória. */
  let currentDay = null;
  let salt = null;
  let seen = new Set();
  let labelsByDim = new Map();
  let lastPurgeDay = null;

  function rollDay(day) {
    if (day === currentDay) return;
    currentDay = day;
    salt = randomBytes(16);
    seen = new Set();
    labelsByDim = new Map();
  }

  function visitorHash(headers, remoteAddress) {
    return createHash('sha256')
      .update(salt)
      .update(clientAddress(headers, remoteAddress))
      .update('|')
      .update(String(headers['user-agent'] ?? ''))
      .digest('hex');
  }

  /** Limita a variedade de rótulos por recorte e por dia. */
  function capLabel(dim, label) {
    const known = labelsByDim.get(dim) ?? new Set();
    labelsByDim.set(dim, known);
    if (known.has(label)) return label;
    if (known.size >= ANALYTICS_LIMITS.LABELS_PER_DAY) return 'Outros';
    known.add(label);
    return label;
  }

  async function purgeOld(day, ms) {
    if (lastPurgeDay === day) return;
    lastPurgeDay = day;
    const limit = dayKey(ms - ANALYTICS_LIMITS.RETENTION_DAYS * DAY_MS);
    await db.execute('DELETE FROM site_visit_stats WHERE stat_day < ?', [limit]);
  }

  /** A chave de leitura confere? Comparação em tempo constante (via digest). */
  function authorize(provided) {
    if (!enabled || typeof provided !== 'string') return false;
    const a = createHash('sha256').update(provided).digest();
    const b = createHash('sha256').update(readKey).digest();
    return timingSafeEqual(a, b);
  }

  /**
   * Registra UMA visualização de página. `entry` marca a primeira página de uma
   * visita (carga completa): só ela traz origem e campanha e conta como sessão;
   * navegar dentro do site não vira nova origem.
   */
  async function collect({ headers, remoteAddress, body }) {
    if (headers.dnt === '1' || headers['sec-gpc'] === '1') return { recorded: false, reason: 'dnt' };
    const ua = String(headers['user-agent'] ?? '');
    if (isBot(ua)) return { recorded: false, reason: 'bot' };

    await ensureTable();
    const ms = now();
    const day = dayKey(ms);
    rollDay(day);
    await purgeOld(day, ms);

    const entry = body?.entry === true;
    const hash = visitorHash(headers, remoteAddress);

    const rows = [
      [TOTAL, ''],
      ['country', countryFrom(headers)],
      ['city', cityFrom(headers)],
      ['device', deviceFromUserAgent(ua)],
      ['path', pathFrom(clean(body?.path, ANALYTICS_LIMITS.FIELD_RAW_MAX))],
    ];
    if (entry) {
      rows.push(['referrer', referrerFrom(body?.referrer, ownHosts)]);
      const campaign = clean(body?.utmCampaign || body?.utmSource, ANALYTICS_LIMITS.LABEL_MAX);
      if (campaign) rows.push(['campaign', campaign]);
    }

    for (const [dim, raw] of rows) {
      const label = dim === TOTAL ? '' : capLabel(dim, raw);
      const key = `${hash}|${dim}|${label}`;
      const newVisitor = !seen.has(key);
      if (newVisitor) {
        if (seen.size >= ANALYTICS_LIMITS.SEEN_MAX) seen = new Set();
        seen.add(key);
      }
      await db.execute(
        `INSERT INTO site_visit_stats (stat_day, dim, label, visits, visitors, sessions)
         VALUES (?, ?, ?, 1, ?, ?)
         ON CONFLICT (stat_day, dim, label) DO UPDATE SET
           visits = site_visit_stats.visits + 1,
           visitors = site_visit_stats.visitors + excluded.visitors,
           sessions = site_visit_stats.sessions + excluded.sessions`,
        [day, dim, label, newVisitor ? 1 : 0, entry ? 1 : 0]
      );
    }
    return { recorded: true };
  }

  /**
   * Relatório no formato que o Panel Desktop consome (docs/VISITANTES.md).
   * `visitors` do período é a soma dos visitantes únicos de cada dia: sem
   * identificador entre dias, não há como saber se é a mesma pessoa.
   */
  async function report(days) {
    await ensureTable();
    const ms = now();
    const today = dayKey(ms);
    const firstDay = dayKey(ms - (days - 1) * DAY_MS);

    const dailyRows = await db.query(
      `SELECT stat_day, visits, visitors, sessions FROM site_visit_stats
       WHERE dim = ? AND stat_day >= ? AND stat_day <= ? ORDER BY stat_day`,
      [TOTAL, firstDay, today]
    );
    const byDay = new Map(dailyRows.map((row) => [row.stat_day, row]));

    const daily = [];
    const totals = { visits: 0, visitors: 0, sessions: 0 };
    for (let index = days - 1; index >= 0; index -= 1) {
      const date = dayKey(ms - index * DAY_MS);
      const row = byDay.get(date);
      const point = { date, visits: Number(row?.visits ?? 0), visitors: Number(row?.visitors ?? 0) };
      totals.visits += point.visits;
      totals.visitors += point.visitors;
      totals.sessions += Number(row?.sessions ?? 0);
      daily.push(point);
    }

    const rankings = {};
    for (const dim of DIMENSIONS) {
      const rows = await db.query(
        `SELECT label, SUM(visits) AS visits, SUM(visitors) AS visitors FROM site_visit_stats
         WHERE dim = ? AND stat_day >= ? AND stat_day <= ?
         GROUP BY label ORDER BY SUM(visits) DESC, label LIMIT ?`,
        [dim, firstDay, today, ANALYTICS_LIMITS.RANKING_SIZE]
      );
      rankings[dim] = rows.map((row) => ({
        label: row.label,
        visits: Number(row.visits),
        visitors: Number(row.visitors),
      }));
    }

    return {
      window: { days, since: dayStartMs(firstDay), until: ms },
      totals,
      daily,
      rankings,
    };
  }

  return { collect, report, authorize, enabled };
}
