/* =========================================================================
   Cliente HTTP da API da loja (itens 9 a 16 do contrato do portal).
   -------------------------------------------------------------------------
   Mesmo modelo do checkout.js: `fetch` injetável (os testes usam um falso),
   `X-Service-Key`, tempo máximo e erro GENÉRICO para o navegador — a API
   central nunca vira canal de texto arbitrário para a tela. O navegador não
   fala com a API; quem fala é este servidor.

   Só o que o contrato prevê entra e sai: cada resposta passa por uma lista
   branca de campos. Em particular, o catálogo só carrega `precoAplicado`
   (a tabela da conta); qualquer outro preço que a API mandasse por engano
   (varejo, atacado, revenda) é descartado aqui.
   ========================================================================= */

import { config, DEFAULT_TIMEOUT_MS, PORTAL } from '../config.js';
import { AppError } from '../http/errors.js';
import { detectarTipoReal } from '../security/imageValidation.js';

const UNAVAILABLE = 'O portal da loja está indisponível agora. Tente novamente em instantes.';
const INACTIVE = 'Esta loja não está recebendo pedidos pelo portal agora.';

const validTimeout = (value) => (Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS);

const HEX = /^#[0-9a-fA-F]{6}$/;
const CODE = /^[a-z0-9_]{2,48}$/;

/* Mensagens próprias (PT-BR) para os motivos de recusa que a pessoa consegue
   resolver. O texto da API só é usado como último recurso (ver `businessMessage`). */
const BUSINESS_MESSAGES = {
  min_order: 'O pedido não atinge o valor mínimo da loja.',
  below_minimum: 'O pedido não atinge o valor mínimo da loja.',
  item_unavailable: 'Algum item do carrinho não está mais disponível. Confira o carrinho.',
  product_unavailable: 'Algum item do carrinho não está mais disponível. Confira o carrinho.',
  invalid_multiple: 'Algum item não respeita a quantidade múltipla de venda. Ajuste o carrinho.',
  outside_hours: 'A loja não atende no dia ou na faixa escolhidos. Escolha outro horário.',
  store_closed: 'A loja não está aceitando pedidos agora.',
  orders_disabled: 'A loja não está aceitando pedidos agora.',
  delivery_unavailable: 'A loja não faz entrega. Escolha retirada.',
  pickup_unavailable: 'A loja não faz retirada. Escolha entrega.',
  account_pending: 'Sua conta ainda aguarda a aprovação da loja.',
  account_blocked: 'Não foi possível concluir com esta conta. Fale com a loja.',
  cancel_window_closed: 'O prazo para cancelar este pedido já passou. Fale com a loja.',
  invalid_state: 'Este pedido não pode mais ser cancelado.',
  payment_unavailable: 'Esta forma de pagamento não está liberada para a sua conta.',
  /* Agenda (Parte 5) */
  slot_taken: 'Esse horário acabou de ser ocupado. Escolha outro horário.',
  too_soon: 'Esse horário está muito próximo. Escolha um horário mais adiante.',
  too_far: 'Esse horário está longe demais. Escolha uma data mais próxima.',
  inactive: 'Esta loja não está recebendo agendamentos agora.',
  invalid_service: 'Algum serviço escolhido não está mais disponível. Recarregue a página.',
  invalid_professional: 'Esse profissional não faz o serviço escolhido. Escolha outro.',
  invalid_slot: 'Esse horário não está livre. Escolha outro horário.',
  porte_required: 'Informe o porte do pet para ver os horários.',
  pet_required: 'Informe os dados do pet.',
};

const clip = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : null);
const num = (value) => (Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : null);
/** Posição no ranking de mais vendidos: inteiro de 1 a 10; qualquer outra coisa vira null. */
const posicao = (value) => (Number.isInteger(value) && value >= 1 && value <= 10 ? value : null);
const bool = (value) => value === true;
/* Próxima abertura da API: yyyy-MM-ddTHH:mm em hora de Brasília (sem fuso). */
const ISO_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/;

function cleanJsonish(value, maxBytes = 4096) {
  if (value === null || value === undefined) return null;
  try {
    const text = JSON.stringify(value);
    return text.length <= maxBytes ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

/** Texto da API que pode ir à tela: só uma linha curta, sem controle. */
function businessMessage(body) {
  const detail = typeof body?.detail === 'string' ? body.detail : typeof body?.message === 'string' ? body.message : '';
  const text = detail.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
  return text && text.length <= 240 ? text : null;
}

export function portalApiClient({
  fetchImpl = fetch,
  licensing = config.licensing,
  cacheMs = 15_000,
  now = () => Date.now(),
} = {}) {
  const configured = Boolean(licensing.baseUrl && licensing.serviceKey);
  const base = configured
    ? new URL(
        'api/v1/site/portal/',
        licensing.baseUrl.endsWith('/') ? licensing.baseUrl : `${licensing.baseUrl}/`
      )
    : null;
  const vitrineCache = new Map();

  const seg = (value) => encodeURIComponent(String(value));

  /** Chamada crua: devolve a Response (ou lança o erro genérico de rede). */
  async function call(method, path, { query, body, accept, absolute = false } = {}) {
    if (!configured) throw new AppError(503, 'PORTAL_INDISPONIVEL', UNAVAILABLE);
    /* `absolute`: caminho que a própria API informou (logo), relativo à raiz dela, sempre no mesmo host. */
    const url = absolute ? new URL(path, licensing.baseUrl) : new URL(path, base);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), validTimeout(licensing.timeoutMs));
    try {
      return await fetchImpl(url, {
        method,
        headers: {
          'X-Service-Key': licensing.serviceKey,
          Accept: accept ?? 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (cause) {
      console.error('[portal] falha ao chamar a API da loja:', cause?.name ?? cause?.message);
      throw new AppError(503, 'PORTAL_INDISPONIVEL', UNAVAILABLE);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function readJson(response) {
    const text = await response.text();
    if (!text) return {};
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  /** Resposta de erro da API → erro genérico (ou recusa de negócio com texto próprio). */
  function failure(response, body, { business = false } = {}) {
    const code = typeof body?.code === 'string' && CODE.test(body.code.toLowerCase()) ? body.code.toLowerCase() : null;
    if (
      (response.status === 404 && code === 'portal_inactive') ||
      (response.status === 403 && code === 'addon_not_active')
    ) {
      return new AppError(404, 'PORTAL_INATIVO', INACTIVE);
    }
    if (response.status === 404 && code === 'portal_agenda_inactive') {
      return new AppError(404, 'AGENDA_INATIVA', 'Esta loja não está recebendo agendamentos agora.');
    }
    if (response.status === 404) return new AppError(404, 'NAO_ENCONTRADO', 'Não encontrado.');
    if (business && [400, 409, 422].includes(response.status)) {
      const message =
        (code && BUSINESS_MESSAGES[code]) ?? businessMessage(body) ?? 'Não foi possível concluir. Confira os dados e tente de novo.';
      return new AppError(response.status === 409 ? 409 : 400, code ? code.toUpperCase() : 'PEDIDO_INVALIDO', message);
    }
    console.error(
      `[portal] API da loja respondeu ${response.status}`,
      code ?? '',
      body?.correlationId ? `correlationId=${body.correlationId}` : ''
    );
    return new AppError(503, 'PORTAL_INDISPONIVEL', UNAVAILABLE);
  }

  async function json(method, path, options = {}) {
    const response = await call(method, path, options);
    const body = await readJson(response);
    if (!response.ok) throw failure(response, body, { business: options.business });
    return body;
  }

  /* -------------------------------------------------- listas brancas */

  function pickVitrine(body) {
    const cores = body.cores && typeof body.cores === 'object' ? body.cores : {};
    const color = (value) => (typeof value === 'string' && HEX.test(value) ? value.toLowerCase() : null);
    return {
      nomePublico: clip(body.nomePublico, 80) ?? 'Loja',
      cores: { primaria: color(cores.primaria), secundaria: color(cores.secundaria), fundo: color(cores.fundo) },
      temLogo: typeof body.logoUrl === 'string' && body.logoUrl.length > 0,
      aceitaPedidos: bool(body.aceitaPedidos),
      abertoAgora: typeof body.abertoAgora === 'boolean' ? body.abertoAgora : null,
      proximaAbertura: typeof body.proximaAbertura === 'string' && ISO_LOCAL.test(body.proximaAbertura) ? body.proximaAbertura.slice(0, 16) : null,
      retirada: bool(body.retirada),
      entrega: bool(body.entrega),
      taxaEntrega: num(body.taxaEntrega) ?? 0,
      pedidoMinimo: num(body.pedidoMinimo) ?? 0,
      mensagemAviso: clip(body.mensagemAviso, 300),
      horarios: cleanJsonish(body.horarios),
      prazoCancelarMin: num(body.prazoCancelarMin),
      catalogoAtualizadoEm: clip(body.catalogoAtualizadoEm, 40),
      fiadoAtivo: bool(body.fiadoAtivo),
      temAgenda: bool(body.temAgenda),
      emailContato: clip(body.emailContato ?? body.email, 190),
    };
  }

  function pickProduto(item) {
    const id = item.produtoId ?? item.id;
    return {
      id: clip(String(id ?? ''), 64),
      nome: clip(item.nome, 160) ?? '',
      categoria: clip(item.categoria, 80),
      unidade: clip(item.unidade, 20) ?? 'un',
      descricao: clip(item.descricao, 400),
      preco: num(item.precoAplicado),
      disponivel: item.disponivel !== false,
      multiplo: Math.max(num(item.multiplo) ?? 1, 0.001),
      caixaQtd: num(item.caixaQtd),
      // Mais vendidos (PDV 2.4.16+): no caixa, e entre quem revende (a API só manda este para conta de atacado ou revenda).
      maisVendido: posicao(item.maisVendido),
      maisVendidoRevenda: posicao(item.maisVendidoRevenda),
      imagemHash: clip(item.imagemHash, 64) ?? (item.temImagem === true ? 'v1' : null),
    };
  }

  function pickPedido(p) {
    const itens = Array.isArray(p.itens) ? p.itens.slice(0, PORTAL.ITEMS_MAX) : [];
    return {
      id: clip(String(p.id ?? p.pedidoId ?? ''), 64),
      referencia: clip(p.referencia, 40),
      estado: clip(p.estado, 20),
      criadoEm: clip(p.criadoEm, 40),
      atualizadoEm: clip(p.atualizadoEm, 40),
      total: num(p.total),
      pagamento: clip(p.pagamento, 20),
      observacao: clip(p.observacao, 600),
      motivoRecusa: clip(p.motivoRecusa, 300),
      previsao: clip(p.previsao, 60),
      podeCancelar: typeof p.podeCancelar === 'boolean' ? p.podeCancelar : null,
      cancelavelAte: clip(p.cancelavelAte, 40),
      entrega: p.entrega && typeof p.entrega === 'object'
        ? {
            tipo: clip(p.entrega.tipo, 20),
            data: clip(p.entrega.data, 20),
            faixa: clip(p.entrega.faixa, 40),
            taxa: num(p.entrega.taxa),
            endereco: cleanJsonish(p.entrega.endereco, 1024),
          }
        : null,
      itens: itens.map((i) => ({
        produtoId: clip(String(i.produtoId ?? ''), 64),
        nome: clip(i.nome, 160) ?? '',
        quantidade: num(i.quantidade) ?? 0,
        unidade: clip(i.unidade, 20),
        precoUnitario: num(i.precoUnitario),
      })),
    };
  }

  function pickFiado(f) {
    const extrato = Array.isArray(f.extrato) ? f.extrato.slice(0, 50) : [];
    return {
      saldo: num(f.saldo) ?? 0,
      vencido: num(f.vencido) ?? 0,
      proximoVencimento: clip(f.proximoVencimento, 20),
      atualizadoEm: clip(f.atualizadoEm, 40),
      extrato: extrato.map((e) => ({
        data: clip(e?.data, 20),
        descricao: clip(e?.descricao ?? e?.historico, 160),
        valor: num(e?.valor),
        tipo: clip(e?.tipo, 20),
        vencimento: clip(e?.vencimento, 20),
      })),
    };
  }

  /* --------------------------------------------- agenda (Parte 5, B1 a B4) */

  const ESTADOS_AG = new Set(['solicitado', 'confirmado', 'recusado', 'cancelado_cliente', 'cancelado_loja', 'remarcado', 'concluido', 'nao_compareceu']);
  const PORTES = ['P', 'M', 'G'];
  const list = (value, max) => (Array.isArray(value) ? value.slice(0, max) : []);

  /* Preço de serviço é o da loja (uma tabela só); nada de custo, comissão ou campo extra.
     A API entrega `portes: [{porte, duracaoMin, preco}]`; o mapa `{P: {duracao, preco}}` (formato do mock) também vale. */
  function pickPorte(portes, mapa, base) {
    const out = {};
    if (Array.isArray(portes)) {
      for (const item of portes) {
        if (item && typeof item === 'object' && PORTES.includes(item.porte)) {
          out[item.porte] = { duracao: num(item.duracaoMin ?? item.duracao), preco: num(item.preco) };
        }
      }
    } else if (mapa && typeof mapa === 'object') {
      for (const key of PORTES) {
        const item = mapa[key];
        if (item && typeof item === 'object') out[key] = { duracao: num(item.duracao ?? item.duracaoMin), preco: num(item.preco) };
      }
    }
    if (!Object.keys(out).length) return null;
    /* Porte sem valor próprio vale o valor-base do serviço (a API manda nulo): a tela recebe sempre número nos três portes. */
    for (const key of PORTES) {
      out[key] = { duracao: out[key]?.duracao ?? base.duracao, preco: out[key]?.preco ?? base.preco };
    }
    return out;
  }

  /* As regras chegam como a API as guarda (`passoMin`, `antecedenciaMinHoras`, `confirmacaoAutomatica`); o site usa minutos. */
  function pickRegras(regras) {
    const horas = num(regras.antecedenciaMinHoras);
    return {
      slotMin: num(regras.passoMin ?? regras.slotMin),
      antecedenciaMinMin: horas !== null && horas !== undefined ? horas * 60 : num(regras.antecedenciaMinMin),
      antecedenciaMaxDias: num(regras.antecedenciaMaxDias),
      prazoCancelarMin: num(regras.prazoCancelarMin),
      confirmacaoAuto: bool(regras.confirmacaoAutomatica ?? regras.confirmacaoAuto),
    };
  }

  function pickAgenda(body) {
    const regras = body.regras && typeof body.regras === 'object' ? body.regras : {};
    const rotulos = body.rotulos && typeof body.rotulos === 'object' ? body.rotulos : {};
    return {
      preset: clip(body.preset, 30),
      rotulos: Object.fromEntries(
        Object.entries(rotulos)
          .filter(([key, value]) => /^[a-zA-Z]{2,24}$/.test(key) && typeof value === 'string')
          .slice(0, 12)
          .map(([key, value]) => [key, value.trim().slice(0, 40)])
      ),
      servicos: list(body.servicos, 200)
        .filter((s) => s && s.ativo !== false)
        .map((s) => ({
          id: clip(String(s.id ?? ''), 64),
          nome: clip(s.nome, 120) ?? '',
          categoria: clip(s.categoria, 60),
          duracao: num(s.duracaoMin ?? s.duracao),
          preco: num(s.preco),
          exigePorte: bool(s.exigePorte),
          porte: pickPorte(s.portes, s.porte, { duracao: num(s.duracaoMin ?? s.duracao), preco: num(s.preco) }),
        }))
        .filter((s) => s.id && s.nome),
      profissionais: list(body.profissionais, 100)
        .map((p) => ({
          id: clip(String(p?.id ?? ''), 64),
          nome: clip(p?.nome, 80) ?? '',
          cor: typeof p?.cor === 'string' && HEX.test(p.cor) ? p.cor.toLowerCase() : null,
          servicos: list(p?.servicos, 200)
            .map((s) => clip(String(typeof s === 'object' && s ? s.servicoId ?? s.id ?? '' : s ?? ''), 64))
            .filter(Boolean),
        }))
        .filter((p) => p.id && p.nome),
      regras: pickRegras(regras),
      temAgenda: true,
    };
  }

  function pickAgendamento(a) {
    const pet = a.pet && typeof a.pet === 'object' ? a.pet : null;
    return {
      id: clip(String(a.id ?? a.agendamentoId ?? ''), 64),
      referencia: clip(a.referencia, 40),
      estado: ESTADOS_AG.has(a.estado) ? a.estado : clip(a.estado, 24),
      criadoEm: clip(a.criadoEm, 40),
      servicos: list(a.servicos, 20).map((s) => ({
        servicoId: clip(String(s?.servicoId ?? ''), 64),
        nome: clip(s?.nome, 120) ?? '',
        duracao: num(s?.duracao),
        preco: num(s?.preco),
      })),
      profissionalId: clip(a.profissionalId == null ? '' : String(a.profissionalId), 64) || null,
      profissionalNome: clip(a.profissionalNome, 80),
      inicio: clip(a.inicio, 40),
      fim: clip(a.fim, 40),
      pet: pet
        ? { nome: clip(pet.nome, 60), especie: clip(pet.especie, 30), raca: clip(pet.raca, 60), porte: PORTES.includes(pet.porte) ? pet.porte : null }
        : null,
      observacao: clip(a.observacao, 600),
      total: num(a.total),
      motivo: clip(a.motivo, 300),
      podeCancelar: typeof a.podeCancelar === 'boolean' ? a.podeCancelar : null,
    };
  }

  /* ----------------------------------------------------------- API */
  return {
    configured,

    /** 9. Vitrine (com cache curto: o e-mail e a tela de entrada pedem muito). */
    async vitrine(slug, { fresh = false } = {}) {
      const hit = vitrineCache.get(slug);
      if (!fresh && hit && hit.until > now()) {
        if (hit.error) throw hit.error;
        return hit.value;
      }
      try {
        const body = await json('GET', seg(slug));
        const value = { ...pickVitrine(body), _logoUrl: typeof body.logoUrl === 'string' ? body.logoUrl : null };
        remember(slug, { value });
        return value;
      } catch (error) {
        if (error.code === 'PORTAL_INATIVO') remember(slug, { error });
        throw error;
      }
    },

    /** 10. Cria a conta (fica pendente na loja). */
    async criarConta(slug, conta) {
      await json('POST', `${seg(slug)}/contas`, { body: conta, business: true });
    },

    /** 11. Estado e tabela da conta. */
    async conta(slug, contaId) {
      const body = await json('GET', `${seg(slug)}/contas/${seg(contaId)}`);
      return { estado: clip(body.estado, 20), tabela: clip(body.tabela, 20) };
    },

    /** 12. Catálogo com UM preço (o da tabela da conta). */
    async catalogo(slug, contaId) {
      const body = await json('GET', `${seg(slug)}/catalogo`, { query: { contaId } });
      const lista = Array.isArray(body) ? body : Array.isArray(body.produtos) ? body.produtos : [];
      return {
        versao: clip(String(body.versao ?? ''), 40),
        atualizadoEm: clip(body.atualizadoEm ?? body.catalogoAtualizadoEm, 40),
        produtos: lista.slice(0, 5000).map(pickProduto).filter((p) => p.id && p.nome),
      };
    },

    /** 13. Foto do produto: só devolve bytes que são imagem de verdade. */
    async imagem(slug, produtoId) {
      const response = await call('GET', `${seg(slug)}/produtos/${seg(produtoId)}/imagem`, { accept: 'image/*,application/json' });
      if (!response.ok) {
        await response.arrayBuffer().catch(() => null);
        throw response.status === 404 || response.status === 403
          ? new AppError(404, 'NAO_ENCONTRADO', 'Não encontrado.')
          : new AppError(503, 'PORTAL_INDISPONIVEL', UNAVAILABLE);
      }
      let buffer;
      if (/json/i.test(response.headers.get('content-type') ?? '')) {
        const body = await readJson(response);
        buffer = typeof body.base64 === 'string' ? Buffer.from(body.base64, 'base64') : Buffer.alloc(0);
      } else {
        buffer = Buffer.from(await response.arrayBuffer());
      }
      const tipo = detectarTipoReal(buffer);
      if (!tipo || buffer.length === 0 || buffer.length > PORTAL.IMAGE_MAX_BYTES) {
        throw new AppError(404, 'NAO_ENCONTRADO', 'Não encontrado.');
      }
      return { buffer, mime: tipo.mime };
    },

    /** Logo da loja: só caminho da própria API (nunca URL externa: SSRF). */
    async logo(slug) {
      const vitrine = await this.vitrine(slug);
      const logo = vitrine._logoUrl;
      if (!logo) throw new AppError(404, 'NAO_ENCONTRADO', 'Não encontrado.');
      const data = /^data:image\/(?:png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(logo);
      let buffer;
      if (data) {
        buffer = Buffer.from(data[1], 'base64');
      } else if (/^\/[A-Za-z0-9_\-./]+$/.test(logo) && !logo.startsWith('//') && !logo.includes('..')) {
        const response = await call('GET', logo, { accept: 'image/*', absolute: true }).catch(() => null);
        if (!response?.ok) throw new AppError(404, 'NAO_ENCONTRADO', 'Não encontrado.');
        buffer = Buffer.from(await response.arrayBuffer());
      } else {
        throw new AppError(404, 'NAO_ENCONTRADO', 'Não encontrado.');
      }
      const tipo = detectarTipoReal(buffer);
      if (!tipo || buffer.length > PORTAL.IMAGE_MAX_BYTES) throw new AppError(404, 'NAO_ENCONTRADO', 'Não encontrado.');
      return { buffer, mime: tipo.mime };
    },

    /** 14. Cria o pedido (a API recalcula tudo). */
    async criarPedido(slug, pedido) {
      const body = await json('POST', `${seg(slug)}/pedidos`, { body: pedido, business: true });
      return {
        pedidoId: clip(String(body.pedidoId ?? body.id ?? ''), 64),
        referencia: clip(body.referencia, 40),
        estado: clip(body.estado, 20) ?? 'recebido',
        total: num(body.total),
      };
    },

    /** 15. Pedidos da conta. */
    async pedidos(slug, contaId) {
      const body = await json('GET', `${seg(slug)}/pedidos`, { query: { contaId } });
      const lista = Array.isArray(body) ? body : Array.isArray(body.pedidos) ? body.pedidos : [];
      return lista.slice(0, 200).map(pickPedido);
    },

    async pedido(slug, pedidoId, contaId) {
      return pickPedido(await json('GET', `${seg(slug)}/pedidos/${seg(pedidoId)}`, { query: { contaId } }));
    },

    async cancelar(slug, pedidoId, contaId) {
      const body = await json('POST', `${seg(slug)}/pedidos/${seg(pedidoId)}/cancelar`, {
        query: { contaId },
        body: {},
        business: true,
      });
      return { estado: clip(body.estado, 20) ?? 'cancelado' };
    },

    /** B1. Agenda publicada (serviços, profissionais, regras). 404 AGENDA_INATIVA se não publicada. */
    async agenda(slug) {
      return pickAgenda(await json('GET', `${seg(slug)}/agenda`));
    },

    /** B2. Horários livres (a API calcula; o site só repassa o que o navegador pediu, já validado). */
    async horarios(slug, { servicos, profissionalId, data, porte }) {
      const body = await json('GET', `${seg(slug)}/agenda/horarios`, {
        query: { servicos: servicos.join(','), profissionalId: profissionalId ?? 'qualquer', data, porte },
        business: true,
      });
      return {
        slots: list(body.slots, 400)
          .map((s) => ({
            inicio: clip(s?.inicio, 40),
            fim: clip(s?.fim, 40),
            profissionalId: clip(s?.profissionalId == null ? '' : String(s.profissionalId), 64),
            profissionalNome: clip(s?.profissionalNome, 80),
            /* Duração e total JÁ com o porte e as exceções do profissional (o que a API vai gravar). */
            duracaoMin: num(s?.duracaoMin),
            total: num(s?.total),
          }))
          .filter((s) => s.inicio && s.profissionalId),
        motivoVazio: clip(body.motivoVazio, 60),
      };
    },

    /** B3. Cria o agendamento (a API recalcula tudo e segura o horário). */
    async criarAgendamento(slug, agendamento) {
      const body = await json('POST', `${seg(slug)}/agendamentos`, { body: agendamento, business: true });
      return {
        id: clip(String(body.id ?? body.agendamentoId ?? ''), 64),
        referencia: clip(body.referencia, 40),
        estado: clip(body.estado, 24) ?? 'solicitado',
        inicio: clip(body.inicio, 40),
        fim: clip(body.fim, 40),
        total: num(body.total),
      };
    },

    /** B4. Agendamentos da conta, detalhe, cancelar e remarcar. */
    async agendamentos(slug, contaId) {
      const body = await json('GET', `${seg(slug)}/agendamentos`, { query: { contaId } });
      const lista = Array.isArray(body) ? body : Array.isArray(body.agendamentos) ? body.agendamentos : [];
      return lista.slice(0, 200).map(pickAgendamento);
    },

    async agendamento(slug, id, contaId) {
      return pickAgendamento(await json('GET', `${seg(slug)}/agendamentos/${seg(id)}`, { query: { contaId } }));
    },

    async cancelarAgendamento(slug, id, contaId) {
      const body = await json('POST', `${seg(slug)}/agendamentos/${seg(id)}/cancelar`, { query: { contaId }, body: {}, business: true });
      return { estado: clip(body.estado, 24) ?? 'cancelado_cliente' };
    },

    async remarcarAgendamento(slug, id, contaId, dados) {
      const body = await json('POST', `${seg(slug)}/agendamentos/${seg(id)}/remarcar`, { query: { contaId }, body: dados, business: true });
      return { estado: clip(body.estado, 24) ?? 'solicitado', inicio: clip(body.inicio, 40) };
    },

    /** 16. Fiado (só leitura). */
    async fiado(slug, contaId) {
      return pickFiado(await json('GET', `${seg(slug)}/fiado`, { query: { contaId } }));
    },
  };

  function remember(slug, entry) {
    if (vitrineCache.size >= 500) vitrineCache.delete(vitrineCache.keys().next().value);
    vitrineCache.set(slug, { ...entry, until: now() + cacheMs });
  }
}
