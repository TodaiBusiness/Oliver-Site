/* =========================================================================
   API da loja FALSA, só para desenvolvimento e testes do portal (/l/:slug).
   -------------------------------------------------------------------------
   Implementa o lado da API do contrato do portal (itens 9 a 16: /api/v1/site/portal)
   em memória, com o mesmo formato de resposta. NÃO é a API real: não persiste nada
   e não confere licença. Serve a dois usos:

   · testes (`createMockBackend` + `mockFetch`): o servidor do site recebe um
     `fetch` que cai aqui, sem rede;
   · rodar o portal à mão: `node scripts/mock-portal-api.mjs` sobe a API falsa
     em http://localhost:8799. Para o site local falar com ela:
         LICENSING_API_BASE_URL=http://localhost:8799 SITE_SERVICE_API_KEY=<a mesma chave> npm run dev:api
     (a chave padrão do mock é a do exemplo abaixo; MOCK_PORTAL_KEY troca).

   Controles de bancada (fora do contrato), sob /__mock:
     POST /__mock/pedidos/:id/estado {estado}      muda o estado do pedido
     POST /__mock/contas/:id/decisao {estado,tabela}  aprova ou bloqueia a conta
   Lojas prontas: `loja-demo` (fiado ligado, atacado), `so-retirada` (sem entrega,
   sem fiado), `loja-inativa` (404 portal_inactive) e `cor-ruim` (cores com
   contraste insuficiente, para testar o recálculo).
   ========================================================================= */

import { createServer } from 'node:http';
import { deflateSync } from 'node:zlib';
import { randomUUID } from 'node:crypto';

export const MOCK_SERVICE_KEY = 'chave-do-mock-do-portal-0123456789abcdef';

/* ---------------------------------------------------------------- PNG */
const CRC = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
})();

/** PNG de verdade (RGB), com faixas diagonais suaves da cor dada. */
export function makePng(size, [r, g, b]) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const k = ((x + y) >> 3) % 2 ? 1 : 0.88;
      const o = y * (size * 3 + 1) + 1 + x * 3;
      raw[o] = Math.round(r * k);
      raw[o + 1] = Math.round(g * k);
      raw[o + 2] = Math.round(b * k);
    }
  }
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(CRC(body));
    return Buffer.concat([len, body, crc]);
  };
  const head = Buffer.alloc(13);
  head.writeUInt32BE(size, 0);
  head.writeUInt32BE(size, 4);
  head[8] = 8;
  head[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------- dados */
const PRODUTOS = [
  ['p-cerveja', 'Cerveja lata 350 ml', 'Bebidas', 'un', 'Gelada ou natural, lata 350 ml.', 4.5, 3.8, 3.4, true, 12, 12, [230, 160, 40]],
  ['p-refri', 'Refrigerante cola 2 L', 'Bebidas', 'un', null, 9.9, 8.5, 7.9, true, 1, 6, [200, 50, 50]],
  ['p-agua', 'Água mineral sem gás 500 ml', 'Bebidas', 'un', null, 2.5, 1.9, 1.6, true, 1, 12, [90, 160, 220]],
  ['p-suco', 'Suco de uva integral 1 L', 'Bebidas', 'un', 'Sem açúcar adicionado.', 12.9, 10.9, 9.9, false, 1, 6, [120, 60, 150]],
  ['p-arroz', 'Arroz branco tipo 1 5 kg', 'Mercearia', 'pct', 'Grãos selecionados.', 32.9, 28.9, 26.5, true, 1, 6, [220, 210, 180]],
  ['p-feijao', 'Feijão carioca 1 kg', 'Mercearia', 'pct', null, 8.9, 7.6, 7.1, true, 1, 20, [150, 100, 70]],
  ['p-cafe', 'Café torrado e moído 500 g', 'Mercearia', 'pct', 'Torra média, embalagem a vácuo.', 18.5, 15.9, 14.9, true, 1, 10, [90, 60, 40]],
  ['p-macarrao', 'Macarrão espaguete 500 g', 'Mercearia', 'pct', null, 5.2, 4.3, 3.9, true, 1, 20, [230, 200, 110]],
  ['p-detergente', 'Detergente neutro 500 ml', 'Limpeza', 'un', null, 2.99, 2.4, 2.1, true, 1, 24, [120, 200, 160]],
  ['p-sabao', 'Sabão em pó 1,6 kg', 'Limpeza', 'un', null, 21.9, 18.9, 17.5, true, 1, 8, [80, 130, 210]],
  ['p-banana', 'Banana prata', 'Hortifruti', 'kg', 'Vendida por quilo.', 7.9, 6.5, 5.9, true, 0.5, null, [240, 215, 80]],
  ['p-tomate', 'Tomate italiano', 'Hortifruti', 'kg', null, 9.5, 8.2, 7.4, true, 0.5, null, [210, 70, 50]],
  ['p-ovos', 'Ovos brancos bandeja 30', 'Hortifruti', 'bandeja', null, 24.9, 21.5, 19.9, true, 1, 12, [235, 225, 205]],
  ['p-leite', 'Leite integral 1 L', 'Laticínios', 'un', null, 5.4, 4.7, 4.4, true, 1, 12, [220, 230, 240]],
].map(([id, nome, categoria, unidade, descricao, v, a, rv, disponivel, multiplo, caixaQtd, cor]) => ({
  id, nome, categoria, unidade, descricao, v, a, rv, disponivel, multiplo, caixaQtd, cor,
}));

const BASE_LOJA = {
  aceitaPedidos: true,
  retirada: true,
  entrega: true,
  taxaEntrega: 6,
  pedidoMinimo: 40,
  mensagemAviso: 'Pedidos feitos até as 16h saem no mesmo dia.',
  horarios: ['Seg a sex: 8h às 19h', 'Sábado: 8h às 14h'],
  prazoCancelarMin: 10,
  fiadoAtivo: false,
  catalogoAtualizadoEm: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
};

export function createMockBackend({ serviceKey = MOCK_SERVICE_KEY, leaky = false, now = () => Date.now() } = {}) {
  const lojas = {
    'loja-demo': {
      ...BASE_LOJA,
      nomePublico: 'Mercadinho Boa Praça',
      cores: { primaria: '#0f766e', secundaria: '#fde68a', fundo: '#f8fafc' },
      fiadoAtivo: true,
      emailContato: 'contato@boapraca.exemplo',
      logo: makePng(96, [15, 118, 110]),
    },
    'so-retirada': {
      ...BASE_LOJA,
      nomePublico: 'Empório do Zé',
      cores: { primaria: '#9a3412', secundaria: '#fed7aa', fundo: '#fffbeb' },
      entrega: false,
      taxaEntrega: 0,
      pedidoMinimo: 0,
    },
    'cor-ruim': {
      ...BASE_LOJA,
      nomePublico: 'Doces da Lu',
      cores: { primaria: '#ffe066', secundaria: '#fff3b0', fundo: '#fffde7' },
      logo: null,
    },
    'loja-inativa': { inativa: true },
  };
  const contas = new Map(); // `${slug}|${contaId}` -> conta
  const pedidos = new Map(); // id -> pedido
  const idem = new Map(); // `${slug}|${key}` -> pedido
  let seq = 1000;

  const calls = [];
  const json = (status, body) => ({ status, json: body });
  const problem = (status, code, detail) => json(status, { status, code, detail, title: code });
  const priceOf = (p, tabela) => (tabela === 'revenda' ? p.rv : tabela === 'atacado' ? p.a : p.v);
  const round2 = (n) => Math.round(n * 100) / 100;

  function pedidoView(p) {
    const cancelavel = p.estado === 'recebido' && now() - p.criadoMs <= lojas[p.slug].prazoCancelarMin * 60000;
    return {
      id: p.id,
      referencia: p.referencia,
      estado: p.estado,
      criadoEm: new Date(p.criadoMs).toISOString(),
      atualizadoEm: new Date(p.atualizadoMs).toISOString(),
      itens: p.itens,
      total: p.total,
      entrega: p.entrega,
      pagamento: p.pagamento,
      observacao: p.observacao,
      motivoRecusa: p.motivoRecusa ?? null,
      podeCancelar: cancelavel,
    };
  }

  function handle({ method, path, query = {}, body = {}, headers = {} }) {
    calls.push({ method, path, query, body });

    if (path.startsWith('/__mock/')) return bench(method, path, body);

    const m = /^\/api\/v1\/site\/portal\/([^/]+)(?:\/(.*))?$/.exec(path);
    if (!m) return problem(404, 'not_found');
    if (serviceKey && headers['x-service-key'] !== serviceKey) return problem(401, 'unauthorized');
    const [, slug, rest = ''] = m;
    const loja = lojas[slug];
    if (!loja || loja.inativa) return problem(404, 'portal_inactive');
    const parts = rest ? rest.split('/') : [];

    /* 9. vitrine */
    if (method === 'GET' && parts.length === 0) {
      return json(200, {
        nomePublico: loja.nomePublico,
        cores: loja.cores,
        logoUrl: loja.logo ? `/api/v1/site/portal/${slug}/logo` : null,
        aceitaPedidos: loja.aceitaPedidos,
        retirada: loja.retirada,
        entrega: loja.entrega,
        taxaEntrega: loja.taxaEntrega,
        pedidoMinimo: loja.pedidoMinimo,
        mensagemAviso: loja.mensagemAviso,
        horarios: loja.horarios,
        prazoCancelarMin: loja.prazoCancelarMin,
        catalogoAtualizadoEm: loja.catalogoAtualizadoEm,
        fiadoAtivo: loja.fiadoAtivo,
        emailContato: loja.emailContato,
      });
    }
    if (method === 'GET' && parts[0] === 'logo' && loja.logo) return { status: 200, binary: loja.logo, contentType: 'image/png' };

    /* 10 e 11. contas */
    if (parts[0] === 'contas') {
      if (method === 'POST' && parts.length === 1) {
        if (!body.contaId || !body.nome || !body.email) return problem(400, 'invalid_account', 'Dados da conta incompletos.');
        contas.set(`${slug}|${body.contaId}`, { ...body, estado: 'pendente', tabela: 'varejo' });
        return json(202, { estado: 'pendente' });
      }
      if (method === 'GET' && parts.length === 2) {
        const c = contas.get(`${slug}|${parts[1]}`);
        return c ? json(200, { estado: c.estado, tabela: c.tabela }) : problem(404, 'account_not_found');
      }
    }

    /* 12. catálogo (um único preço) */
    if (method === 'GET' && parts[0] === 'catalogo') {
      const c = contas.get(`${slug}|${query.contaId}`);
      if (!c) return problem(404, 'account_not_found');
      const ativa = c.estado === 'ativa';
      const tabela = ativa ? c.tabela : 'varejo';
      return json(200, {
        versao: '7',
        atualizadoEm: loja.catalogoAtualizadoEm,
        produtos: PRODUTOS.map((p) => ({
          produtoId: p.id,
          nome: p.nome,
          categoria: p.categoria,
          unidade: p.unidade,
          descricao: p.descricao,
          precoAplicado: priceOf(p, tabela),
          disponivel: p.disponivel,
          multiplo: p.multiplo,
          caixaQtd: p.caixaQtd,
          imagemHash: `h-${p.id}`,
          /* "Vazamento" proposital (só com leaky): o site precisa descartar. */
          ...(leaky ? { precoVarejo: p.v, precoAtacado: p.a, precoRevenda: p.rv } : {}),
        })),
      });
    }

    /* 13. imagem */
    if (method === 'GET' && parts[0] === 'produtos' && parts[2] === 'imagem') {
      const p = PRODUTOS.find((x) => x.id === parts[1]);
      return p ? { status: 200, binary: makePng(96, p.cor), contentType: 'image/png' } : problem(404, 'not_found');
    }

    /* 14 e 15. pedidos */
    if (parts[0] === 'pedidos') {
      if (method === 'POST' && parts.length === 1) return criarPedido(slug, loja, body);
      if (method === 'GET' && parts.length === 1) {
        const lista = [...pedidos.values()].filter((p) => p.slug === slug && p.contaId === query.contaId);
        return json(200, { pedidos: lista.sort((a, b) => b.criadoMs - a.criadoMs).map(pedidoView) });
      }
      const p = pedidos.get(parts[1]);
      if (!p || p.slug !== slug || p.contaId !== query.contaId) return problem(404, 'order_not_found');
      if (method === 'GET' && parts.length === 2) return json(200, pedidoView(p));
      if (method === 'POST' && parts[2] === 'cancelar') {
        if (p.estado !== 'recebido') return problem(409, 'invalid_state', 'Estado inválido.');
        if (now() - p.criadoMs > loja.prazoCancelarMin * 60000) return problem(409, 'cancel_window_closed', 'Prazo vencido.');
        p.estado = 'cancelado';
        p.atualizadoMs = now();
        return json(200, { estado: 'cancelado' });
      }
    }

    /* 16. fiado */
    if (method === 'GET' && parts[0] === 'fiado') {
      if (!loja.fiadoAtivo) return problem(404, 'not_found');
      if (!contas.has(`${slug}|${query.contaId}`)) return problem(404, 'account_not_found');
      const dia = (d) => new Date(now() + d * 86400000).toISOString().slice(0, 10);
      return json(200, {
        saldo: 186.4,
        vencido: 42.9,
        proximoVencimento: dia(6),
        atualizadoEm: new Date(now() - 2 * 3600000).toISOString(),
        extrato: [
          { data: dia(-3), descricao: 'Compra 10231', valor: 143.5, tipo: 'compra', vencimento: dia(6) },
          { data: dia(-12), descricao: 'Compra 10198', valor: 42.9, tipo: 'compra', vencimento: dia(-2) },
          { data: dia(-20), descricao: 'Pagamento recebido', valor: -80, tipo: 'pagamento' },
        ],
      });
    }
    return problem(404, 'not_found');
  }

  function criarPedido(slug, loja, body) {
    const c = contas.get(`${slug}|${body.contaId}`);
    if (!c) return problem(404, 'account_not_found');
    if (c.estado === 'bloqueada') return problem(409, 'account_blocked', 'Conta bloqueada.');
    const previo = idem.get(`${slug}|${body.idempotencyKey}`);
    if (previo) return json(200, { pedidoId: previo.id, referencia: previo.referencia, estado: previo.estado, total: previo.total });
    if (!loja.aceitaPedidos) return problem(409, 'orders_disabled', 'A loja não aceita pedidos.');
    const tabela = c.estado === 'ativa' ? c.tabela : 'varejo';
    const itens = [];
    for (const it of body.itens ?? []) {
      const p = PRODUTOS.find((x) => x.id === it.produtoId);
      if (!p || !p.disponivel) return problem(409, 'item_unavailable', `${p?.nome ?? 'Produto'} indisponível.`);
      const resto = Math.abs(it.quantidade / p.multiplo - Math.round(it.quantidade / p.multiplo));
      if (it.quantidade <= 0 || resto > 1e-6) return problem(400, 'invalid_multiple', 'Múltiplo inválido.');
      itens.push({ produtoId: p.id, nome: p.nome, quantidade: it.quantidade, unidade: p.unidade, precoUnitario: priceOf(p, tabela), tabela });
    }
    if (!itens.length) return problem(400, 'empty_order', 'Pedido vazio.');
    const subtotal = itens.reduce((s, i) => s + i.precoUnitario * i.quantidade, 0);
    if (subtotal < loja.pedidoMinimo) return problem(409, 'min_order', 'Abaixo do mínimo.');
    if (body.entrega?.tipo === 'entrega' && !loja.entrega) return problem(409, 'delivery_unavailable');
    if (body.entrega?.tipo === 'retirada' && !loja.retirada) return problem(409, 'pickup_unavailable');
    const taxa = body.entrega?.tipo === 'entrega' ? loja.taxaEntrega : 0;
    const pedido = {
      id: randomUUID(),
      slug,
      contaId: body.contaId,
      referencia: `#${++seq}`,
      estado: 'recebido',
      criadoMs: now(),
      atualizadoMs: now(),
      itens,
      total: round2(subtotal + taxa),
      entrega: { ...body.entrega, taxa },
      pagamento: body.pagamento,
      observacao: body.observacao ?? '',
      idempotencyKey: body.idempotencyKey,
    };
    pedidos.set(pedido.id, pedido);
    idem.set(`${slug}|${body.idempotencyKey}`, pedido);
    return json(201, { pedidoId: pedido.id, referencia: pedido.referencia, estado: 'recebido', total: pedido.total });
  }

  function bench(method, path, body) {
    const estado = /^\/__mock\/pedidos\/([^/]+)\/estado$/.exec(path);
    if (method === 'POST' && estado) {
      const p = pedidos.get(estado[1]);
      if (!p) return problem(404, 'not_found');
      p.estado = body.estado;
      p.motivoRecusa = body.motivo ?? null;
      p.atualizadoMs = now();
      return json(200, { ok: true });
    }
    const decisao = /^\/__mock\/contas\/([^/]+)\/decisao$/.exec(path);
    if (method === 'POST' && decisao) {
      const c = [...contas.entries()].find(([k]) => k.endsWith(`|${decisao[1]}`));
      if (!c) return problem(404, 'not_found');
      c[1].estado = body.estado;
      c[1].tabela = body.tabela ?? c[1].tabela;
      return json(200, { ok: true });
    }
    return problem(404, 'not_found');
  }

  return { handle, calls, state: { lojas, contas, pedidos }, PRODUTOS };
}

/** `fetch` falso que responde com a API falsa (para os testes e para o servidor local sem rede). */
export function mockFetch(backend) {
  return async (url, options = {}) => {
    const u = new URL(String(url));
    const headers = Object.fromEntries(Object.entries(options.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    const result = backend.handle({
      method: options.method ?? 'GET',
      path: u.pathname,
      query: Object.fromEntries(u.searchParams),
      body: options.body ? JSON.parse(options.body) : {},
      headers,
    });
    if (result.binary) return new Response(result.binary, { status: result.status, headers: { 'content-type': result.contentType } });
    return new Response(JSON.stringify(result.json ?? {}), { status: result.status, headers: { 'content-type': 'application/json' } });
  };
}

/* ------------------------------------------------- servidor (uso manual) */
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.MOCK_PORTAL_PORT ?? 8799);
  const key = process.env.MOCK_PORTAL_KEY ?? MOCK_SERVICE_KEY;
  const backend = createMockBackend({ serviceKey: key });
  createServer((request, response) => {
    const chunks = [];
    request.on('data', (c) => chunks.push(c));
    request.on('end', () => {
      const url = new URL(request.url, `http://localhost:${port}`);
      let body = {};
      try {
        body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
      } catch {
        body = {};
      }
      const result = backend.handle({
        method: request.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body,
        headers: request.headers,
      });
      if (result.binary) {
        response.writeHead(result.status, { 'Content-Type': result.contentType });
        response.end(result.binary);
        return;
      }
      response.writeHead(result.status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(result.json ?? {}));
    });
  }).listen(port, () => {
    console.log(`[mock-portal] API falsa em http://localhost:${port} (chave: ${key})`);
    console.log('[mock-portal] lojas: loja-demo, so-retirada, cor-ruim, loja-inativa');
  });
}
