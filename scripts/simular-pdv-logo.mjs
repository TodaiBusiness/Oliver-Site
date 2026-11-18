/* Simula o PDV contra a API REAL (PostgreSQL) para ver a logo na vitrine do portal.

   Faz o que o PDV faz: ativa um computador (código de ativação do painel), liga o adicional pedidos_site, configura o portal, publica um catálogo
   e ENVIA A LOGO (PUT /pdv/portal/logo). Com `--remover`, tira a logo (DELETE). Não faz parte do site: é só ferramenta de ensaio.

   Variáveis: API_URL (padrão http://localhost:5250), ADMIN_EMAIL, ADMIN_PASSWORD, PSQL_CENTRAL (comando psql que abre o banco central, para ligar o
   adicional), SLUG (padrão loja-logo), LOGO (arquivo de imagem; sem ele gera um PNG de 256x256), ESTADO (arquivo onde guardar a instalação).
   Uso: node scripts/simular-pdv-logo.mjs [--remover] */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';

const API = (process.env.API_URL ?? 'http://localhost:5250').replace(/\/$/, '') + '/api/v1';
const SLUG = process.env.SLUG ?? 'loja-logo';
const ESTADO = process.env.ESTADO ?? '/tmp/simular-pdv-logo.json';

/** PNG RGBA de um quadrado arredondado com um círculo claro (sem biblioteca). */
function gerarLogo(lado = 256) {
  const crc = (() => {
    const t = new Uint32Array(256).map((_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c >>> 0;
    });
    return (b) => {
      let c = 0xffffffff;
      for (const x of b) c = t[(c ^ x) & 255] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    };
  })();
  const chunk = (tipo, dados) => {
    const t = Buffer.from(tipo);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(dados.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(Buffer.concat([t, dados])));
    return Buffer.concat([len, t, dados, sum]);
  };
  const raw = Buffer.alloc((lado * 4 + 1) * lado);
  const r = lado * 0.18;
  for (let y = 0; y < lado; y++) {
    raw[y * (lado * 4 + 1)] = 0;
    for (let x = 0; x < lado; x++) {
      const o = y * (lado * 4 + 1) + 1 + x * 4;
      const dx = Math.max(r - x, 0, x - (lado - 1 - r));
      const dy = Math.max(r - y, 0, y - (lado - 1 - r));
      const dentro = dx * dx + dy * dy <= r * r;
      const circ = Math.hypot(x - lado / 2, y - lado / 2) < lado * 0.32;
      const anel = Math.hypot(x - lado / 2, y - lado / 2) < lado * 0.2;
      const [R, G, B] = anel ? [183, 61, 106] : circ ? [255, 240, 245] : [183, 61, 106];
      raw.set([R, G, B, dentro ? 255 : 0], o);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

async function chamar(metodo, caminho, { corpo, token, admin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (admin) {
    headers.Authorization = `Bearer ${admin}`;
    if (metodo !== 'GET') headers['Idempotency-Key'] = randomUUID();
  }
  if (token) {
    headers['X-Installation-Id'] = token.installationId;
    headers['X-Device-Token'] = token.deviceToken;
  }
  const r = await fetch(API + caminho, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const texto = await r.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    /* corpo não-JSON */
  }
  return { status: r.status, json, texto };
}

async function instalar() {
  if (existsSync(ESTADO)) return JSON.parse(readFileSync(ESTADO, 'utf8'));
  const login = await chamar('POST', '/admin/auth/login', {
    corpo: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD },
  });
  const admin = login.json?.accessToken;
  if (!admin) throw new Error(`login do painel falhou: ${login.status}`);
  const taxId = Array.from({ length: 11 }, () => Math.floor(Math.random() * 10)).join('');
  const cliente = await chamar('POST', '/admin/customers', {
    admin,
    corpo: { tradeName: 'Ice Delícia (ensaio)', taxId, billingEmail: 'loja@example.test', phone: '1999990000', contactName: 'Contato', address: null },
  });
  const id = cliente.json.id;
  await chamar('POST', `/admin/customers/${id}/licenses/manual`, {
    admin,
    corpo: { allowedDevices: 2, validDays: 30, monthlyAmount: 110, billingDay: 10, gracePeriodDays: 5, deactivateAfterGraceDays: 30 },
  });
  /* A ativação entrega a configuração do banco da loja: qualquer endereço serve para o ensaio (o PDV de verdade a usa no servidor da loja). */
  const banco = await chamar('PUT', `/admin/customers/${id}/store-database-config`, {
    admin,
    corpo: { host: 'db.exemplo.test', port: 5432, schema: 'loja_ensaio', username: 'app_ensaio', password: 'senha-bem-longa-123', engine: 'PostgreSQL' },
  });
  if (banco.status >= 300) throw new Error(`banco da loja: ${banco.status} ${banco.texto}`);
  const gerado = await chamar('POST', `/admin/customers/${id}/activation-codes`, { admin, corpo: {} });
  const codigo = gerado.json?.code;
  if (!codigo) throw new Error(`código de ativação: ${gerado.status} ${gerado.texto}`);
  const installationId = randomUUID();
  const ativacao = await chamar('POST', '/activations', {
    corpo: { code: codigo, installationId, windowsName: 'PC-ENSAIO', suggestedDisplayName: 'Caixa', appVersion: '1.9.1' },
  });
  if (ativacao.status !== 200) throw new Error(`ativação falhou: ${ativacao.status} ${ativacao.texto}`);
  const estado = { clienteId: id, installationId, deviceToken: ativacao.json.deviceToken };
  execFileSync(
    'sh',
    ['-c', `${process.env.PSQL_CENTRAL} -c "INSERT INTO adicionais_loja (cliente_id, tipo, ativo, preco_mensal) VALUES (${id}, 'pedidos_site', true, 49)"`],
    { stdio: 'inherit' }
  );
  writeFileSync(ESTADO, JSON.stringify(estado));
  return estado;
}

const token = await instalar();
const ok = (r, esperado, rotulo) => {
  console.log(`${r.status === esperado ? 'ok  ' : 'ERRO'} ${rotulo}: ${r.status}${r.status === esperado ? '' : ' ' + r.texto.slice(0, 200)}`);
  if (r.status !== esperado) process.exitCode = 1;
};

ok(
  await chamar('PUT', '/pdv/portal/config', {
    token,
    corpo: {
      slug: SLUG, nomePublico: 'Ice Delícia', ativo: true, aceitaPedidos: true, retirada: true, entrega: true, taxaEntrega: 5, pedidoMinimo: 0,
      cores: { primaria: '#B83D6A', secundaria: '#7A2447', fundo: '#FFF8FA' }, mensagemAviso: 'Pedidos até as 17h saem no mesmo dia.', prazoCancelarMin: 10,
    },
  }),
  200,
  'configuração'
);
ok(
  await chamar('PUT', '/pdv/portal/catalogo', {
    token,
    corpo: {
      produtos: [
        { produtoId: '1', nome: 'Açaí 500 ml', categoria: 'Açaí', unidade: 'UN', descricao: 'Açaí batido com granola.', precoVarejo: 18, precoAtacado: 15, precoRevenda: 12, disponivel: true },
        { produtoId: '2', nome: 'Picolé de morango', categoria: 'Picolés', unidade: 'UN', descricao: 'Picolé cremoso.', precoVarejo: 6.5, disponivel: true },
      ],
    },
  }),
  200,
  'catálogo'
);

if (process.argv.includes('--remover')) {
  ok(await chamar('DELETE', '/pdv/portal/logo', { token }), 204, 'remover logo');
} else {
  const bytes = process.env.LOGO ? readFileSync(process.env.LOGO) : gerarLogo();
  const mime = bytes[0] === 0xff ? 'image/jpeg' : bytes[8] === 0x57 ? 'image/webp' : 'image/png';
  ok(await chamar('PUT', '/pdv/portal/logo', { token, corpo: { mime, base64: bytes.toString('base64'), hash: 'ensaio' } }), 204, `enviar logo (${bytes.length} bytes)`);
}
console.log(`vitrine: /l/${SLUG}`);
