/* =========================================================================
   Portal de pedidos da loja (/l/:slug): o BFF entre o navegador e a API.
   -------------------------------------------------------------------------
   · Contas e senhas ficam AQUI (tabelas portal_*), sempre presas à loja
     (`store_slug`). Nunca se reaproveita `users`/`oi_session`: conta do portal
     não entra em /cliente nem em /admin, e a sessão de uma loja não vale em outra.
   · Preço, pedido, aprovação e fiado ficam na API da loja. Este arquivo só
     autentica a pessoa e repassa, sempre com o `contaId` DA SESSÃO — nunca um
     id vindo do navegador (sem IDOR).
   · Quem não entrou não vê preço: o catálogo exige sessão e a vitrine pública
     não carrega nenhum valor de produto.
   · Entrar, cadastrar e recuperar senha respondem sem revelar se um e-mail
     tem conta (ver docs/PORTAL_LOJA.md).
   ========================================================================= */

import { randomBytes, randomUUID } from 'node:crypto';
import { LIMITS, PORTAL, config } from '../config.js';
import { AppError, badRequest, notFound, tooManyRequests, unauthorized } from '../http/errors.js';
import { parseCookies, portalCookieName } from '../http/cookies.js';
import { createRateLimiter } from '../http/rateLimit.js';
import { createValidator, normalizeEmail } from '../http/validation.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import { createSessionToken, hashToken } from '../security/tokens.js';
import { isValidTaxId, onlyDigits } from '../../shared/taxId.js';
import { cleanDisplayName } from './mailer.js';
import { eventMessage, agendamentoMessage, resetMessage, duplicateMessage } from './portalMail.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/;
const PRODUCT_ID = /^[A-Za-z0-9_.:-]{1,64}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{8,64}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
/* Início do atendimento como a API informou nos horários (com ou sem fuso). */
const START_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/;
const PORTES = ['P', 'M', 'G'];
const SERVICES_MAX = 10;

const EVENT_STATES = {
  pedido: ['recebido', 'aceito', 'em_preparo', 'pronto', 'entregue', 'recusado', 'cancelado'],
  conta: ['ativa', 'bloqueada', 'pendente'],
  agendamento: ['solicitado', 'confirmado', 'recusado', 'cancelado_cliente', 'cancelado_loja', 'remarcado', 'concluido', 'nao_compareceu'],
};

/* Estados do agendamento que viram e-mail (concluído e falta não geram aviso). */
const AGENDAMENTO_AVISA = new Set(['solicitado', 'confirmado', 'recusado', 'cancelado_cliente', 'cancelado_loja', 'remarcado']);

const GENERIC_LOGIN_ERROR = 'E-mail ou senha incorretos.';

/** Texto de endereço: uma linha, sem controle, com teto. */
const line = (value, max) =>
  typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max) : '';

export function portalService(
  ctx,
  {
    api,
    mailer,
    siteUrl = config.site.publicUrl,
    minDurationMs = 1200,
    now = () => Date.now(),
    limits = {},
  }
) {
  const baseUrl = (siteUrl || 'http://localhost:5173').replace(/\/+$/, '');
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const L = {
    loginIp: [20, 10 * MIN],
    loginAccount: [5, 15 * MIN],
    register: [5, 10 * MIN],
    registerHour: [15, HOUR],
    registerEmail: [2, HOUR],
    forgotIp: [5, 10 * MIN],
    forgotEmail: [3, HOUR],
    reset: [10, 10 * MIN],
    read: [600, MIN],
    write: [60, 10 * MIN],
    order: [20, HOUR],
    booking: [20, HOUR],
    ...limits,
  };
  const limiter = (key) => createRateLimiter({ max: L[key][0], windowMs: L[key][1] });
  const limiters = Object.fromEntries(Object.keys(L).map((key) => [key, limiter(key)]));
  const hit = (name, key, message) => {
    if (!limiters[name].hit(key)) {
      throw tooManyRequests(message ?? 'Muitas tentativas. Aguarde alguns minutos e tente novamente.');
    }
  };

  /* Hash de uma senha qualquer: login de e-mail inexistente gasta o mesmo scrypt. */
  let dummyHash = null;
  const getDummyHash = () => (dummyHash ??= hashPassword(randomBytes(12).toString('hex') + 'a1'));

  const seenEvents = new Map();

  /* -------------------------------------------------------------- helpers */

  function assertSlug(slug) {
    if (typeof slug !== 'string' || !PORTAL.SLUG_PATTERN.test(slug)) {
      throw new AppError(404, 'PORTAL_INATIVO', 'Esta loja não está disponível.');
    }
    return slug;
  }

  const publicAccount = (row) => ({
    nome: row.name,
    email: row.email,
    telefone: row.phone,
    estabelecimento: row.business_name ?? null,
    endereco: parseAddress(row.address),
  });

  function parseAddress(text) {
    try {
      const value = JSON.parse(text ?? '{}');
      return value && typeof value === 'object' ? value : {};
    } catch {
      return {};
    }
  }

  function cleanAddress(raw, validator, { required }) {
    const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const address = {
      cep: onlyDigits(String(input.cep ?? '')).slice(0, 8),
      rua: line(input.rua, 120),
      numero: line(input.numero, 20),
      complemento: line(input.complemento, 80),
      bairro: line(input.bairro, 80),
      cidade: line(input.cidade, 80),
      uf: line(input.uf, 2).toUpperCase(),
    };
    if (required) {
      for (const [field, label] of [['rua', 'a rua'], ['numero', 'o número'], ['bairro', 'o bairro'], ['cidade', 'a cidade']]) {
        if (!address[field]) validator.fail(`endereco.${field}`, `Informe ${label}.`);
      }
    }
    if (address.cep && address.cep.length !== 8) validator.fail('endereco.cep', 'O CEP precisa ter 8 números.');
    if (address.uf && !/^[A-Z]{2}$/.test(address.uf)) validator.fail('endereco.uf', 'Use a sigla do estado, como SP.');
    return address;
  }

  /** O endereço de entrega do pedido segue como UMA linha de texto (contrato da API: texto de até 400), no formato que o PDV lê. */
  function addressLine(a) {
    const street = [a.rua, a.numero].filter(Boolean).join(', ');
    const city = [a.cidade, a.uf].filter(Boolean).join('/');
    return [street, a.complemento, a.bairro, city, a.cep ? `CEP ${a.cep}` : ''].filter(Boolean).join(' - ');
  }

  /** Só navegador do próprio site escreve: cabeçalho próprio (cross-origin exigiria CORS, que não existe). */
  function assertWrite(headers) {
    if (headers['x-portal-request'] !== '1') throw new AppError(403, 'SEM_PERMISSAO', 'Requisição não permitida.');
    if (headers['sec-fetch-site'] === 'cross-site') throw new AppError(403, 'SEM_PERMISSAO', 'Requisição não permitida.');
  }

  /* ---------------------------------------------------------------- sessão */

  /** Conta logada NESTA loja, ou null. Cookie, banco e loja da URL precisam bater. */
  async function authenticate(slug, cookieHeader) {
    const token = parseCookies(cookieHeader)[portalCookieName(slug)];
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) return null;
    const id = hashToken(token);
    const row = await ctx.portal.findValidSession(id, slug, now());
    if (!row) return null;
    if (now() - row.last_seen_at > PORTAL.SESSION_IDLE_MS) {
      await ctx.portal.deleteSession(id);
      return null;
    }
    if (now() - row.last_seen_at > PORTAL.SESSION_TOUCH_MS) await ctx.portal.touchSession(id, now());
    return { ...row, id: row.account_id, sessionId: id };
  }

  async function requireAccount(slug, headers) {
    assertSlug(slug);
    const account = await authenticate(slug, headers.cookie);
    if (!account) throw unauthorized('Entre na sua conta para continuar.');
    return account;
  }

  async function openSession(slug, accountId, meta) {
    const token = createSessionToken();
    const expiresAt = now() + PORTAL.SESSION_TTL_MS;
    await ctx.portal.createSession({ id: hashToken(token), slug, accountId, expiresAt, ...meta });
    return { token, expiresAt };
  }

  /* -------------------------------------------------------------- cadastro */

  function validateRegistration(input) {
    const v = createValidator();
    v.text('name', input.name, { min: 2, max: LIMITS.NAME_MAX, label: 'seu nome' });
    v.email('email', input.email);
    const phoneDigits = onlyDigits(String(input.phone ?? ''));
    if (typeof input.phone !== 'string' || phoneDigits.length < 8 || phoneDigits.length > 15) {
      v.fail('phone', 'Informe o telefone com DDD.');
    }
    v.password('password', input.password);
    if (input.acceptPrivacy !== true) v.fail('acceptPrivacy', 'Aceite a política de privacidade para criar a conta.');

    const reseller = input.type === 'revenda';
    if (input.type !== undefined && !['consumidor', 'revenda'].includes(input.type)) v.fail('type', 'Tipo de cadastro inválido.');
    let business = null;
    if (reseller) {
      v.text('business', input.business, { min: 2, max: LIMITS.COMPANY_MAX, label: 'o nome do estabelecimento' });
      business = typeof input.business === 'string' ? line(input.business, LIMITS.COMPANY_MAX) : null;
    }
    let document = null;
    if (typeof input.document === 'string' && input.document.trim()) {
      if (!isValidTaxId(input.document)) v.fail('document', 'Confira o CPF ou o CNPJ.');
      else document = onlyDigits(input.document);
    }
    const address = cleanAddress(input.address, v, { required: reseller });
    v.assert();

    return {
      name: line(input.name, LIMITS.NAME_MAX),
      email: normalizeEmail(input.email),
      phone: line(input.phone, LIMITS.PHONE_MAX),
      password: input.password,
      business,
      document,
      address,
    };
  }

  async function register(slug, input, { ip, headers }) {
    assertSlug(slug);
    assertWrite(headers);
    hit('register', ip, 'Muitos cadastros deste endereço agora há pouco. Aguarde alguns minutos.');
    hit('registerHour', ip, 'Muitos cadastros deste endereço. Tente novamente mais tarde.');
    const data = validateRegistration(input);

    const started = Date.now();
    const passwordHash = await hashPassword(data.password);
    const existing = await ctx.portal.findByEmail(slug, data.email);

    if (existing) {
      /* Mesma resposta de um cadastro novo: quem já tem conta recebe o aviso por e-mail. */
      await notifyDuplicate(slug, existing);
    } else {
      const id = randomUUID();
      try {
        await ctx.portal.createAccount({
          id,
          slug,
          name: data.name,
          email: data.email,
          phone: data.phone,
          document: data.document,
          businessName: data.business,
          address: data.address,
          passwordHash,
          consentAt: now(),
        });
      } catch (error) {
        /* Corrida com outro cadastro do mesmo e-mail: a restrição UNIQUE decide. */
        if (!(await ctx.portal.findByEmail(slug, data.email))) throw error;
        await settle(started);
        return { ok: true };
      }
      try {
        await api.criarConta(slug, {
          contaId: id,
          nome: data.name,
          email: data.email,
          telefone: data.phone,
          ...(data.document ? { documento: data.document } : {}),
          ...(data.business ? { estabelecimento: data.business } : {}),
          endereco: data.address,
        });
      } catch (error) {
        /* A loja não recebeu a conta: não deixa conta órfã no site. */
        await ctx.portal.deleteAccount(slug, id);
        throw error;
      }
    }
    await settle(started);
    return { ok: true };
  }

  /** Piso de tempo: cadastro novo e e-mail repetido demoram o mesmo. */
  async function settle(started) {
    const rest = minDurationMs - (Date.now() - started);
    if (rest > 0) await sleep(rest);
  }

  async function storeName(slug) {
    try {
      return (await api.vitrine(slug)).nomePublico;
    } catch {
      return null;
    }
  }

  async function notifyDuplicate(slug, account) {
    if (!mailer.configured || !limiters.registerEmail.hit(`${slug}|${account.email}`)) return;
    try {
      const store = await storeName(slug);
      await mailer.send({
        to: account.email,
        fromName: store ? `${store} via TODAI` : undefined,
        ...duplicateMessage({ store, name: account.name, loginUrl: `${baseUrl}/l/${slug}/entrar`, resetUrl: `${baseUrl}/l/${slug}/esqueci-senha` }),
      });
    } catch (error) {
      console.error('[portal] aviso de cadastro repetido falhou:', error?.message);
    }
  }

  /* ----------------------------------------------------------------- login */

  async function login(slug, input, { ip, userAgent, headers }) {
    assertSlug(slug);
    assertWrite(headers);
    hit('loginIp', ip, 'Muitas tentativas de login deste endereço. Aguarde alguns minutos e tente novamente.');
    const email = normalizeEmail(input.email);
    const password = typeof input.password === 'string' ? input.password : '';
    if (!email || !password || email.length > LIMITS.EMAIL_MAX || password.length > 200) throw unauthorized(GENERIC_LOGIN_ERROR);
    hit('loginAccount', `${slug}|${email}|${ip}`, 'Muitas tentativas com este e-mail. Aguarde alguns minutos e tente novamente.');

    const account = await ctx.portal.findByEmail(slug, email);
    const ok = await verifyPassword(password, account ? account.password_hash : await getDummyHash());
    if (!account || !ok) throw unauthorized(GENERIC_LOGIN_ERROR);

    const session = await openSession(slug, account.id, { ip, userAgent });
    return { ...session, account: publicAccount(account) };
  }

  async function logout(slug, headers) {
    assertSlug(slug);
    assertWrite(headers);
    const token = parseCookies(headers.cookie)[portalCookieName(slug)];
    if (typeof token === 'string' && token.length <= 100) await ctx.portal.deleteSession(hashToken(token));
    return { ok: true };
  }

  /* ----------------------------------------------------------- recuperação */

  async function requestReset(slug, rawEmail, { ip, headers }) {
    assertSlug(slug);
    assertWrite(headers);
    hit('forgotIp', ip, 'Muitos pedidos deste endereço. Aguarde alguns minutos e tente novamente.');
    if (!mailer.configured) {
      throw new AppError(503, 'EMAIL_INDISPONIVEL', 'A recuperação de senha está indisponível. Fale com a loja.');
    }
    const started = Date.now();
    const email = normalizeEmail(rawEmail);
    const allowed = limiters.forgotEmail.hit(`${slug}|${email || 'vazio'}`);

    const work = async () => {
      if (!(allowed && email && email.length <= LIMITS.EMAIL_MAX)) return;
      try {
        const account = await ctx.portal.findByEmail(slug, email);
        if (!account) return;
        const token = randomBytes(32).toString('base64url');
        await ctx.portal.replaceReset({
          id: hashToken(token),
          slug,
          accountId: account.id,
          expiresAt: now() + PORTAL.RESET_TTL_MS,
        });
        const store = await storeName(slug);
        await mailer.send({
          to: account.email,
          fromName: store ? `${store} via TODAI` : undefined,
          ...resetMessage({ store, name: account.name, link: `${baseUrl}/l/${slug}/redefinir-senha#token=${token}` }),
        });
      } catch (error) {
        console.error('[portal] falha ao enviar a recuperação:', error?.message);
      }
    };

    /* Mesmo tempo com conta ou sem: o envio lento termina em segundo plano. */
    await Promise.race([work(), sleep(minDurationMs)]);
    await settle(started);
    return { ok: true };
  }

  async function resetPassword(slug, { token, password }, { ip, headers }) {
    assertSlug(slug);
    assertWrite(headers);
    hit('reset', ip, 'Muitas tentativas deste endereço. Aguarde alguns minutos e tente novamente.');
    const v = createValidator();
    v.password('password', password);
    v.assert();
    const invalid = () => badRequest('Este link é inválido ou já expirou. Peça um novo.');
    if (typeof token !== 'string' || token.length < 20 || token.length > 100) throw invalid();

    const id = hashToken(token);
    const row = await ctx.portal.findValidReset(id, slug, now());
    if (!row) throw invalid();
    const passwordHash = await hashPassword(password);
    if (!(await ctx.portal.consumeReset(id, slug, now()))) throw invalid();

    await ctx.portal.updatePasswordHash(slug, row.account_id, passwordHash);
    await ctx.portal.deleteSessionsForAccount(slug, row.account_id);
    await ctx.portal.deleteResetsForAccount(slug, row.account_id);
    return { ok: true };
  }

  /* --------------------------------------------------------------- vitrine */

  function publicVitrine(slug, v) {
    const { _logoUrl, emailContato, temLogo, ...rest } = v;
    return { ...rest, slug, logoUrl: temLogo ? `/api/portal/${slug}/logo` : null };
  }

  async function vitrine(slug, ip) {
    assertSlug(slug);
    hit('read', ip);
    return publicVitrine(slug, await api.vitrine(slug));
  }

  async function logo(slug, ip) {
    assertSlug(slug);
    hit('read', ip);
    return api.logo(slug);
  }

  async function productImage(slug, productId, ip) {
    assertSlug(slug);
    hit('read', ip);
    if (!PRODUCT_ID.test(productId)) throw notFound();
    return api.imagem(slug, productId);
  }

  /* ------------------------------------------------- conta, catálogo, pedido */

  async function me(slug, account) {
    hit('read', account.id);
    let conta = null;
    try {
      conta = await api.conta(slug, account.id);
    } catch (error) {
      if (error.code === 'PORTAL_INATIVO') throw error;
    }
    return { account: publicAccount(account), conta };
  }

  async function catalogo(slug, account) {
    hit('read', account.id);
    const result = await api.catalogo(slug, account.id);
    return {
      versao: result.versao,
      atualizadoEm: result.atualizadoEm,
      produtos: result.produtos.map(({ imagemHash, ...p }) => ({
        ...p,
        imagemUrl: imagemHash
          ? `/api/portal/${slug}/produtos/${encodeURIComponent(p.id)}/imagem?v=${encodeURIComponent(imagemHash)}`
          : null,
      })),
    };
  }

  const toIsoDay = (date) => date.toISOString().slice(0, 10);

  function validateOrder(input) {
    const v = createValidator();

    const items = new Map();
    if (!Array.isArray(input.itens) || input.itens.length === 0) v.fail('itens', 'Adicione ao menos um item ao carrinho.');
    else if (input.itens.length > PORTAL.ITEMS_MAX) v.fail('itens', `O pedido aceita até ${PORTAL.ITEMS_MAX} itens.`);
    else {
      for (const item of input.itens) {
        const productId = typeof item?.produtoId === 'string' ? item.produtoId : '';
        const quantity = Number(item?.quantidade);
        if (!PRODUCT_ID.test(productId) || !Number.isFinite(quantity) || quantity <= 0 || quantity > PORTAL.QUANTITY_MAX) {
          v.fail('itens', 'Há um item com quantidade inválida. Confira o carrinho.');
          break;
        }
        const rounded = Math.round(quantity * 1000) / 1000;
        items.set(productId, Math.round(((items.get(productId) ?? 0) + rounded) * 1000) / 1000);
      }
    }

    const delivery = input.entrega && typeof input.entrega === 'object' ? input.entrega : {};
    if (!['retirada', 'entrega'].includes(delivery.tipo)) v.fail('entrega.tipo', 'Escolha retirada ou entrega.');
    let address = null;
    if (delivery.tipo === 'entrega') address = cleanAddress(delivery.endereco, v, { required: true });

    let date = null;
    if (typeof delivery.data !== 'string' || !DATE.test(delivery.data) || Number.isNaN(Date.parse(delivery.data))) {
      v.fail('entrega.data', 'Escolha a data.');
    } else {
      /* Folga de um dia para fuso: quem decide o prazo de verdade é a loja. */
      const min = toIsoDay(new Date(now() - 24 * HOUR));
      const max = toIsoDay(new Date(now() + 60 * 24 * HOUR));
      if (delivery.data < min || delivery.data > max) v.fail('entrega.data', 'Escolha uma data a partir de hoje.');
      else date = delivery.data;
    }
    const band = line(delivery.faixa, 40);

    const payment = input.pagamento;
    if (!['na_entrega', 'na_retirada', 'fiado'].includes(payment)) v.fail('pagamento', 'Escolha a forma de pagamento.');
    else if (delivery.tipo === 'retirada' && payment === 'na_entrega') v.fail('pagamento', 'Na retirada, pague na retirada ou no fiado.');
    else if (delivery.tipo === 'entrega' && payment === 'na_retirada') v.fail('pagamento', 'Na entrega, pague na entrega ou no fiado.');

    const note = typeof input.observacao === 'string' ? line(input.observacao, PORTAL.NOTE_MAX) : '';
    if (typeof input.observacao === 'string' && input.observacao.length > PORTAL.NOTE_MAX) {
      v.fail('observacao', `A observação pode ter no máximo ${PORTAL.NOTE_MAX} caracteres.`);
    }
    if (typeof input.idempotencyKey !== 'string' || !IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
      v.fail('idempotencyKey', 'Pedido sem identificador. Recarregue a página.');
    }
    v.assert();

    return {
      itens: [...items].map(([produtoId, quantidade]) => ({ produtoId, quantidade })),
      entrega: { tipo: delivery.tipo, ...(address ? { endereco: addressLine(address) } : {}), data: date, ...(band ? { faixa: band } : {}) },
      pagamento: payment,
      observacao: note,
      idempotencyKey: input.idempotencyKey,
    };
  }

  async function createOrder(slug, account, input, { headers }) {
    assertWrite(headers);
    const order = validateOrder(input);
    hit('order', account.id, 'Você enviou muitos pedidos em pouco tempo. Aguarde antes de enviar outro.');
    /* `contaId` SEMPRE o da sessão: o corpo do navegador não escolhe de quem é o pedido. */
    return api.criarPedido(slug, { contaId: account.id, ...order });
  }

  function requireOrderId(id) {
    if (typeof id !== 'string' || !REQUEST_ID.test(id)) throw notFound('Pedido não encontrado.');
    return id;
  }

  async function listOrders(slug, account) {
    hit('read', account.id);
    return { pedidos: await api.pedidos(slug, account.id) };
  }

  async function getOrder(slug, account, id) {
    hit('read', account.id);
    return { pedido: await api.pedido(slug, requireOrderId(id), account.id) };
  }

  async function cancelOrder(slug, account, id, { headers }) {
    assertWrite(headers);
    hit('write', account.id);
    return api.cancelar(slug, requireOrderId(id), account.id);
  }

  async function fiado(slug, account) {
    hit('read', account.id);
    const loja = await api.vitrine(slug);
    /* Loja sem fiado: a aba não existe, nem para quem pedir o endereço na mão. */
    if (!loja.fiadoAtivo) throw notFound('Esta loja não usa fiado no portal.');
    return { fiado: await api.fiado(slug, account.id) };
  }

  /* ----------------------------------------------------------------- agenda */

  /** Lista de serviços: ids distintos, de 1 a SERVICES_MAX. Devolve `null` se inválida. */
  function parseServiceIds(value, { csv = false } = {}) {
    const raw = Array.isArray(value) ? value : csv && typeof value === 'string' ? value.split(',') : [];
    if (raw.length === 0 || raw.length > SERVICES_MAX) return null;
    const ids = [];
    for (const item of raw) {
      if (typeof item !== 'string' || !PRODUCT_ID.test(item)) return null;
      if (!ids.includes(item)) ids.push(item);
    }
    return ids;
  }

  const professionalOrNull = (value, v, field = 'profissionalId') => {
    if (value === undefined || value === null || value === '' || value === 'qualquer') return null;
    if (typeof value !== 'string' || !PRODUCT_ID.test(value)) {
      v.fail(field, 'Profissional inválido.');
      return null;
    }
    return value;
  };

  function validStart(value, v, field, label) {
    if (typeof value !== 'string' || !START_AT.test(value) || Number.isNaN(Date.parse(value.length === 16 ? `${value}:00Z` : value))) {
      v.fail(field, `Escolha ${label}.`);
      return null;
    }
    return value;
  }

  async function agenda(slug, account) {
    hit('read', account.id);
    return { agenda: await api.agenda(slug) };
  }

  async function horarios(slug, account, query) {
    hit('read', account.id);
    const v = createValidator();
    const servicos = parseServiceIds(query?.servicos, { csv: true });
    if (!servicos) v.fail('servicos', 'Escolha ao menos um serviço.');
    const profissionalId = professionalOrNull(query?.profissionalId, v);
    const data = typeof query?.data === 'string' && DATE.test(query.data) && !Number.isNaN(Date.parse(query.data)) ? query.data : null;
    if (!data) v.fail('data', 'Escolha a data.');
    let porte;
    if (query?.porte !== undefined && query.porte !== '') {
      if (PORTES.includes(query.porte)) porte = query.porte;
      else v.fail('porte', 'Escolha o porte do pet.');
    }
    v.assert();
    return api.horarios(slug, { servicos, profissionalId, data, porte });
  }

  function cleanPet(raw, v) {
    if (raw === undefined || raw === null) return null;
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      v.fail('pet', 'Dados do pet inválidos.');
      return null;
    }
    const pet = {
      nome: line(raw.nome, 60),
      especie: line(raw.especie, 30),
      raca: line(raw.raca, 60),
      porte: raw.porte,
    };
    if (!pet.nome) v.fail('pet.nome', 'Informe o nome do pet.');
    if (!pet.especie) v.fail('pet.especie', 'Informe a espécie do pet.');
    if (!PORTES.includes(pet.porte)) v.fail('pet.porte', 'Escolha o porte do pet.');
    return pet;
  }

  function validateBooking(input) {
    const v = createValidator();
    const servicos = parseServiceIds(input.servicos);
    if (!servicos) v.fail('servicos', 'Escolha ao menos um serviço.');
    const profissionalId = professionalOrNull(input.profissionalId, v);
    const inicio = validStart(input.inicio, v, 'inicio', 'o dia e o horário');
    const pet = cleanPet(input.pet, v);
    let porte = null;
    if (input.porte !== undefined && input.porte !== null && input.porte !== '') {
      if (PORTES.includes(input.porte)) porte = input.porte;
      else v.fail('porte', 'Escolha o porte do pet.');
    }
    if (pet && porte && pet.porte !== porte) v.fail('pet.porte', 'O porte do pet não confere.');
    const note = typeof input.observacao === 'string' ? line(input.observacao, PORTAL.NOTE_MAX) : '';
    if (typeof input.observacao === 'string' && input.observacao.length > PORTAL.NOTE_MAX) {
      v.fail('observacao', `A observação pode ter no máximo ${PORTAL.NOTE_MAX} caracteres.`);
    }
    if (typeof input.idempotencyKey !== 'string' || !IDEMPOTENCY_KEY.test(input.idempotencyKey)) {
      v.fail('idempotencyKey', 'Pedido sem identificador. Recarregue a página.');
    }
    v.assert();
    return {
      servicos,
      profissionalId,
      inicio,
      ...(pet ? { pet } : {}),
      ...(porte || pet ? { porte: porte ?? pet.porte } : {}),
      observacao: note,
      idempotencyKey: input.idempotencyKey,
    };
  }

  async function createBooking(slug, account, input, { headers }) {
    assertWrite(headers);
    const booking = validateBooking(input);
    hit('booking', account.id, 'Você enviou muitos agendamentos em pouco tempo. Aguarde antes de enviar outro.');
    /* `contaId` SEMPRE o da sessão. */
    return api.criarAgendamento(slug, { contaId: account.id, ...booking });
  }

  async function listBookings(slug, account) {
    hit('read', account.id);
    return { agendamentos: await api.agendamentos(slug, account.id) };
  }

  async function getBooking(slug, account, id) {
    hit('read', account.id);
    return { agendamento: await api.agendamento(slug, requireBookingId(id), account.id) };
  }

  function requireBookingId(id) {
    if (typeof id !== 'string' || !REQUEST_ID.test(id)) throw notFound('Agendamento não encontrado.');
    return id;
  }

  async function cancelBooking(slug, account, id, { headers }) {
    assertWrite(headers);
    hit('write', account.id);
    return api.cancelarAgendamento(slug, requireBookingId(id), account.id);
  }

  async function rescheduleBooking(slug, account, id, input, { headers }) {
    assertWrite(headers);
    const bookingId = requireBookingId(id);
    const v = createValidator();
    const novoInicio = validStart(input?.novoInicio, v, 'novoInicio', 'o novo dia e horário');
    const profissionalId = professionalOrNull(input?.profissionalId, v);
    v.assert();
    hit('booking', account.id, 'Você alterou agendamentos vezes demais. Aguarde antes de tentar de novo.');
    return api.remarcarAgendamento(slug, bookingId, account.id, {
      novoInicio,
      ...(profissionalId ? { profissionalId } : {}),
    });
  }

  /* ---------------------------------------------- callback da API → e-mail */

  async function handleEvent(input) {
    const v = createValidator();
    const slug = typeof input.slug === 'string' ? input.slug : '';
    if (!PORTAL.SLUG_PATTERN.test(slug)) v.fail('slug', 'slug inválido.');
    if (!['pedido', 'conta', 'agendamento'].includes(input.tipo)) v.fail('tipo', 'tipo inválido.');
    else if (!EVENT_STATES[input.tipo].includes(input.estado)) v.fail('estado', 'estado inválido.');
    if (typeof input.contaId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(input.contaId)) v.fail('contaId', 'contaId inválido.');
    if (input.pedidoId !== undefined && input.pedidoId !== null && !REQUEST_ID.test(String(input.pedidoId))) {
      v.fail('pedidoId', 'pedidoId inválido.');
    }
    if (input.tipo === 'agendamento') {
      if (typeof input.agendamentoId !== 'string' || !REQUEST_ID.test(input.agendamentoId)) v.fail('agendamentoId', 'agendamentoId inválido.');
      if (input.inicio !== undefined && input.inicio !== null && (typeof input.inicio !== 'string' || !START_AT.test(input.inicio))) {
        v.fail('inicio', 'inicio inválido.');
      }
    }
    v.assert();

    const motivo = typeof input.motivo === 'string' ? line(input.motivo, 300) : '';
    const account = await ctx.portal.findById(slug, input.contaId);
    /* Conta que não existe aqui: nada a avisar (e nada a retentar). */
    if (!account) return { sent: false, reason: 'conta_desconhecida' };

    if (input.tipo === 'agendamento' && !AGENDAMENTO_AVISA.has(input.estado)) return { sent: false, reason: 'sem_aviso' };

    /* O início entra na chave: remarcar duas vezes gera dois avisos (horários diferentes). */
    const key =
      input.tipo === 'agendamento'
        ? `${slug}|agendamento|${input.agendamentoId}|${input.estado}|${input.inicio ?? ''}`
        : `${slug}|${input.tipo}|${input.pedidoId ?? input.contaId}|${input.estado}`;
    const t = now();
    for (const [k, until] of seenEvents) if (until <= t) seenEvents.delete(k);
    if (seenEvents.has(key)) return { sent: false, reason: 'repetido' };
    if (!mailer.configured) return { sent: false, reason: 'email_indisponivel' };

    let vitrine = null;
    try {
      vitrine = await api.vitrine(slug);
    } catch {
      /* Sem nome da loja o aviso sai mesmo assim. */
    }
    let pedido = null;
    if (input.tipo === 'pedido' && input.pedidoId) {
      try {
        pedido = await api.pedido(slug, String(input.pedidoId), account.id);
      } catch {
        /* Sem detalhe do pedido o aviso sai só com o estado. */
      }
    }

    let agendamento = null;
    if (input.tipo === 'agendamento') {
      try {
        agendamento = await api.agendamento(slug, input.agendamentoId, account.id);
      } catch {
        /* Sem o detalhe, o aviso sai só com o estado e o horário do evento. */
      }
    }

    const store = vitrine?.nomePublico ?? null;
    const message = input.tipo === 'agendamento'
      ? agendamentoMessage({
          store,
          name: account.name,
          estado: input.estado,
          motivo,
          agendamento,
          inicio: input.inicio ?? agendamento?.inicio ?? null,
          url: `${baseUrl}/l/${slug}/agendamentos/${encodeURIComponent(input.agendamentoId)}`,
        })
      : eventMessage({
      store,
      name: account.name,
      tipo: input.tipo,
      estado: input.estado,
      motivo,
      pedido,
      url: input.tipo === 'pedido' && input.pedidoId
        ? `${baseUrl}/l/${slug}/pedidos/${encodeURIComponent(input.pedidoId)}`
        : `${baseUrl}/l/${slug}/catalogo`,
    });

    try {
      await mailer.send({
        to: account.email,
        fromName: store ? `${cleanDisplayName(store, 40)} via TODAI` : undefined,
        replyTo: vitrine?.emailContato ?? undefined,
        ...message,
      });
    } catch (error) {
      console.error('[portal] aviso por e-mail falhou:', error?.message);
      /* 503: a API pode tentar de novo. */
      throw new AppError(503, 'EMAIL_INDISPONIVEL', 'Não foi possível enviar o e-mail agora.');
    }
    seenEvents.set(key, t + PORTAL.EVENT_DEDUPE_MS);
    return { sent: true };
  }

  return {
    assertSlug,
    authenticate,
    requireAccount,
    register,
    login,
    logout,
    requestReset,
    resetPassword,
    vitrine,
    logo,
    productImage,
    me,
    catalogo,
    createOrder,
    listOrders,
    getOrder,
    cancelOrder,
    fiado,
    agenda,
    horarios,
    createBooking,
    listBookings,
    getBooking,
    cancelBooking,
    rescheduleBooking,
    handleEvent,
    get available() {
      return mailer.configured;
    },
  };
}
