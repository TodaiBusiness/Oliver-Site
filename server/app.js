/* =========================================================================
   Aplicação HTTP: rotas, autenticação, autorização e tratamento de erro.

   Princípio central: NADA é autorizado no front-end. Toda rota protegida
   declara `auth: true` (exige sessão) e/ou `role: ADMIN`. Esconder um botão
   é cosmético — quem barra é este arquivo.
   ========================================================================= */

import { AUDIT_ACTIONS, LIMITS, ROLES, SECURITY, config } from './config.js';
import { createContext } from './context.js';
import { createRouter } from './http/router.js';
import {
  parseCookies,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from './http/cookies.js';
import {
  AppError,
  badRequest,
  forbidden,
  notFound,
  tooManyRequests,
  unauthorized,
} from './http/errors.js';
import { clientAddress } from './http/clientAddress.js';
import { createServiceAuth } from './http/serviceAuth.js';
import { createRateLimiter, createWindowCounter } from './http/rateLimit.js';
import { parsePagination, pick, toId } from './http/validation.js';
import { authService } from './services/auth.js';
import { projectsService } from './services/projects.js';
import { requestsService } from './services/requests.js';
import { clientsService } from './services/clients.js';
import { messagesService } from './services/messages.js';
import { attachmentsService } from './services/attachments.js';
import { panelProjectsService } from './services/panelProjects.js';
import { panelConversationsService, parseServiceId } from './services/panelConversations.js';
import { quoteRequestsService } from './services/quoteRequests.js';
import { checkoutService } from './services/checkout.js';
import { accountService } from './services/account.js';
import { analyticsService, parseDays } from './services/analytics.js';
import { accountSecurityService } from './services/accountSecurity.js';
import { twoFactorService } from './services/twoFactor.js';
import { passwordResetService } from './services/passwordReset.js';
import { maintenanceService } from './services/maintenance.js';
import { createMailer } from './services/mailer.js';
import { runWithRequest } from './http/requestContext.js';
import { clipUserAgent } from './http/userAgent.js';
import { normalizeEmail } from './http/validation.js';

/* Toda resposta JSON da API: nada de cache (há dado de sessão e de conta),
   sem adivinhação de tipo e sem uso por outra origem (CORP). O servidor
   estático acrescenta CSP/HSTS/etc. (server/http/securityHeaders.js). */
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/** Métodos que alteram estado — só eles precisam de checagem de origem. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/* Login e cadastro rodam scrypt (caro de propósito): sem teto por IP, poucas
   requisições bastam para travar o processo. O bloqueio por e-mail do login
   continua valendo; este é o teto por endereço. */
const AUTH_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_PER_IP = 20;
const REGISTER_MAX_PER_IP = 5;
const REGISTER_HOUR_MS = 60 * 60 * 1000;
const REGISTER_MAX_PER_IP_HOUR = 15;
/* Operações sensíveis de quem JÁ está logado (trocar senha, 2FA): por usuário. */
const SENSITIVE_MAX_PER_USER = 10;
/* Recuperação de senha: por IP e, mais apertado, por e-mail. */
const FORGOT_MAX_PER_IP = 5;
const FORGOT_MAX_PER_EMAIL = 3;
const FORGOT_EMAIL_WINDOW_MS = 60 * 60 * 1000;
const RESET_MAX_PER_IP = 10;

/* Coleta de visitas: uma por página aberta. 30 por minuto por IP cobre quem
   navega rápido (uma página a cada 2 s, sustentado); o teto diário de 1500 por
   IP limita um script a isso (antes, ~172 mil por dia). Origin e user agent são
   forjáveis fora do navegador: isto é custo, não prova. */
const COLLECT_WINDOW_MS = 60 * 1000;
const COLLECT_MAX_PER_IP = 30;
const COLLECT_DAY_MS = 24 * 60 * 60 * 1000;
const COLLECT_MAX_PER_IP_DAY = 1500;

/* Endpoints de serviço (Panel → site): poucas chamadas, mas vindas de um único
   IP (a API do Panel). Teto folgado para o uso normal (polling de 30 s) e um
   teto bem menor só para chave errada. */
const SERVICE_WINDOW_MS = 60 * 1000;
const SERVICE_FAIL_WINDOW_MS = 10 * 60 * 1000;
const SERVICE_FAIL_MAX_PER_IP = 20;

/* O corpo legítimo tem poucas dezenas de bytes (a coleta grava numa única
   instrução). Teto próprio, bem abaixo do global (pensado para upload). */
export const COLLECT_MAX_BODY_BYTES = 2048;

/* POST de resposta do Panel: o único endpoint de serviço que aceita imagem. */
const SERVICE_MESSAGE_PATH = /^\/api\/service\/conversations\/[^/]+\/messages$/;

/**
 * Teto de corpo por caminho; `null` = vale o teto global do servidor.
 * `serviceAuthorized`: a chave de serviço já foi conferida ANTES de ler o corpo;
 * só então o POST de mensagem ganha o teto maior (imagem em base64).
 */
export function bodyLimitFor(path, { serviceAuthorized = false } = {}) {
  if (path === '/api/analytics/collect') return COLLECT_MAX_BODY_BYTES;
  if (typeof path === 'string' && path.startsWith('/api/service/')) {
    return serviceAuthorized && SERVICE_MESSAGE_PATH.test(path)
      ? LIMITS.SERVICE_IMAGE_MAX_BODY_BYTES
      : LIMITS.SERVICE_MAX_BODY_BYTES;
  }
  /* Login, cadastro, 2FA, troca de senha: poucas dezenas de bytes. O teto
     global (feito para a imagem do chat) não faz sentido aqui. */
  if (typeof path === 'string' && path.startsWith('/api/auth/')) return SECURITY.AUTH_MAX_BODY_BYTES;
  return null;
}

/**
 * Defesa de CSRF: quem altera estado precisa provar que veio do próprio site.
 * `Origin` manda; sem ele, `Referer`; sem os dois, `Sec-Fetch-Site`. Navegador
 * nenhum faz POST cross-site sem ao menos um desses (e os que não mandam
 * `Origin` mandam os outros). Sem NENHUM dos três é script/cliente fora do
 * navegador, que não é o vetor de CSRF e é recusado de qualquer forma quando há
 * origens configuradas.
 */
export function isTrustedRequestOrigin(headers, allowedOrigins) {
  if (headers.origin !== undefined) return allowedOrigins.includes(headers.origin);
  if (headers.referer) {
    try {
      return allowedOrigins.includes(new URL(headers.referer).origin);
    } catch {
      return false;
    }
  }
  const site = headers['sec-fetch-site'];
  return site === 'same-origin' || site === 'none';
}

/**
 * `quoteRequests` entra por parâmetro para os testes poderem trocar o `fetch`
 * que fala com a API de licenciamento — sem isso, testar o formulário de
 * orçamento exigiria rede de verdade.
 */
export function createApp(
  db,
  {
    allowedOrigins = [],
    quoteRequests = quoteRequestsService(),
    checkout = checkoutService(),
    account = accountService(),
    mailer = createMailer(),
    forgotMinMs = 1200,
    vault,
    analytics = analyticsService(db, { readKey: config.analytics.readKey, allowedOrigins }),
    adminEnabled = config.siteAdminEnabled,
    serviceKey = config.service.apiKey,
    serviceRatePerMin = config.service.ratePerMin,
  } = {}
) {
  const ctx = createContext(db, vault ? { vault } : undefined);
  const auth = authService(ctx, { adminEnabled });
  const serviceAuth = createServiceAuth(serviceKey);
  const accountSecurity = accountSecurityService(ctx);
  const twoFactor = twoFactorService(ctx);
  const passwordReset = passwordResetService(ctx, { mailer, minDurationMs: forgotMinMs });
  const maintenance = maintenanceService(ctx);
  const projects = projectsService(ctx);
  const requests = requestsService(ctx);
  const attachments = attachmentsService(ctx, requests);
  const messages = messagesService(ctx, requests, attachments);
  const panelConversations = panelConversationsService(ctx);
  const panelProjects = panelProjectsService(ctx, projects);
  const clients = clientsService(ctx);

  const router = createRouter();
  const loginLimiter = createRateLimiter({ max: LOGIN_MAX_PER_IP, windowMs: AUTH_WINDOW_MS });
  const registerLimiter = createRateLimiter({
    max: REGISTER_MAX_PER_IP,
    windowMs: AUTH_WINDOW_MS,
  });

  const registerHourLimiter = createRateLimiter({
    max: REGISTER_MAX_PER_IP_HOUR,
    windowMs: REGISTER_HOUR_MS,
  });
  const twoFactorLimiter = createRateLimiter({ max: LOGIN_MAX_PER_IP, windowMs: AUTH_WINDOW_MS });
  const sensitiveLimiter = createRateLimiter({
    max: SENSITIVE_MAX_PER_USER,
    windowMs: AUTH_WINDOW_MS,
  });
  const forgotIpLimiter = createRateLimiter({ max: FORGOT_MAX_PER_IP, windowMs: AUTH_WINDOW_MS });
  const forgotEmailLimiter = createRateLimiter({
    max: FORGOT_MAX_PER_EMAIL,
    windowMs: FORGOT_EMAIL_WINDOW_MS,
  });
  const resetLimiter = createRateLimiter({ max: RESET_MAX_PER_IP, windowMs: AUTH_WINDOW_MS });

  const serviceLimiter = createRateLimiter({ max: serviceRatePerMin, windowMs: SERVICE_WINDOW_MS });
  const serviceFailLimiter = createRateLimiter({
    max: SERVICE_FAIL_MAX_PER_IP,
    windowMs: SERVICE_FAIL_WINDOW_MS,
  });
  const collectLimiter = createRateLimiter({ max: COLLECT_MAX_PER_IP, windowMs: COLLECT_WINDOW_MS });
  /* Janela diária por IP: só um contador em memória, sem lista de instantes. */
  const collectDaily = createWindowCounter({ max: COLLECT_MAX_PER_IP_DAY, windowMs: COLLECT_DAY_MS });

  const limitByIp = (limiter, headers, remoteAddress, message) => {
    if (!limiter.hit(clientAddress(headers, remoteAddress))) throw tooManyRequests(message);
  };

  /* ------------------------------------------------------------ público */

  router.get('/api/projects', async () => ({
    status: 200,
    body: { projects: await projects.listPublic() },
  }));

  router.get('/api/health', async () => ({ status: 200, body: { ok: true } }));

  /* Só o que o front precisa saber para montar a navegação. Nada sensível. */
  router.get('/api/config/public', async () => ({
    status: 200,
    body: { adminEnabled: adminEnabled === true },
  }));

  /* Visitas do site (agregado, sem IP nem cookie — docs/VISITANTES.md). Não há
     CORS: só a própria origem do site pode chamar; sem `Origin` válido a
     requisição é recusada. Bot, DNT e Sec-GPC respondem 202 sem registrar. */
  router.post('/api/analytics/collect', async ({ body, headers, remoteAddress }) => {
    if (allowedOrigins.length && !allowedOrigins.includes(headers.origin)) {
      throw forbidden('Origem não autorizada.');
    }
    const collectIp = clientAddress(headers, remoteAddress);
    if (!collectLimiter.hit(collectIp) || !collectDaily.hit(collectIp)) {
      throw tooManyRequests('Muitas requisições.');
    }
    if (Buffer.byteLength(JSON.stringify(body ?? {})) > COLLECT_MAX_BODY_BYTES) {
      throw new AppError(413, 'CORPO_GRANDE_DEMAIS', 'O corpo da requisição passa do tamanho permitido.');
    }
    const input = pick(body, ['path', 'referrer', 'entry', 'utmCampaign', 'utmSource']);
    try {
      await analytics.collect({ headers, remoteAddress, body: input });
    } catch (error) {
      /* Medir visita nunca pode derrubar o site. */
      console.error('[analytics] coleta falhou:', error?.message);
    }
    return { status: 202, body: { ok: true } };
  });

  /* Relatório para a API de licenciamento / Panel Desktop. Sem
     ANALYTICS_READ_KEY (ou curta demais) a rota responde 503 e nunca abre. */
  router.get('/api/analytics/report', async ({ query, headers }) => {
    if (!analytics.enabled) {
      throw new AppError(503, 'ANALYTICS_DESLIGADO', 'O relatório de visitas não está configurado.');
    }
    if (!analytics.authorize(headers['x-analytics-key'])) throw unauthorized('Chave inválida.');
    const days = parseDays(query.days);
    if (days === null) throw badRequest('O parâmetro days deve ser um inteiro de 1 a 400.');
    return { status: 200, body: await analytics.report(days) };
  });

  /* Orçamento pedido por visitante, sem conta. Não grava no banco daqui: vai
     para a API de licenças TODAI, onde o Panel Desktop lê. `pick` mantém a
     mesma regra das outras rotas — mandar `status` ou `customerId` junto não
     tem efeito, e quem chega pelo formulário não escolhe a situação do próprio
     pedido. */
  router.post('/api/quote-requests', async ({ body, headers, remoteAddress }) => {
    const input = pick(body, [
      'requesterName',
      'requesterEmail',
      'requesterPhone',
      'company',
      'subject',
      'description',
    ]);
    const created = await quoteRequests.create(input, {
      clientKey: clientAddress(headers, remoteAddress),
    });
    return { status: 201, body: { quoteRequest: created } };
  });

  /* Compra do sistema. Também sem conta: quem compra ainda não é cliente. O
     pedido vai para a API de licenciamento, que cria o cliente e o link de
     pagamento; a licença só sai depois do pagamento confirmado lá. `pick`
     limita o que entra: `price`, `plan` ou `customerId` no corpo não têm
     efeito, e o preço é calculado do outro lado. */
  router.post('/api/checkout', async ({ body, headers, remoteAddress }) => {
    const input = pick(body, [
      'companyName',
      'contactName',
      'taxId',
      'email',
      'phone',
      'devices',
      'acceptTerms',
    ]);
    const result = await checkout.create(input, {
      clientKey: clientAddress(headers, remoteAddress),
    });
    return { status: 200, body: result };
  });

  /* Área do cliente comprador: pedir o link de acesso por e-mail e, com o
     token do link, ler o resumo da licença. Sem sessão do site: a prova de
     identidade é ter recebido o e-mail. */
  router.post('/api/account/access-link', async ({ body, headers, remoteAddress }) => {
    const input = pick(body, ['taxId', 'email']);
    await account.requestLink(input, { clientKey: clientAddress(headers, remoteAddress) });
    return { status: 202, body: { sent: true } };
  });

  router.post('/api/account/summary', async ({ body }) => {
    const input = pick(body, ['token']);
    return { status: 200, body: await account.summary(input) };
  });

  /* --------------------------------------------------------- autenticação */

  router.post('/api/auth/register', async ({ body, headers, remoteAddress }) => {
    limitByIp(
      registerLimiter,
      headers,
      remoteAddress,
      'Muitos cadastros deste endereço agora há pouco. Aguarde alguns minutos.'
    );
    limitByIp(
      registerHourLimiter,
      headers,
      remoteAddress,
      'Muitos cadastros deste endereço. Tente novamente mais tarde.'
    );
    /* Só estes campos são lidos: enviar `role` junto não tem efeito. */
    const input = pick(body, ['name', 'company', 'email', 'phone', 'password']);
    const user = await auth.register(input);
    return { status: 201, body: { user } };
  });

  const requestMeta = (headers, remoteAddress) => ({
    ip: clientAddress(headers, remoteAddress),
    userAgent: clipUserAgent(headers['user-agent']),
  });

  router.post('/api/auth/login', async ({ body, headers, remoteAddress }) => {
    limitByIp(
      loginLimiter,
      headers,
      remoteAddress,
      'Muitas tentativas de login deste endereço. Aguarde alguns minutos e tente novamente.'
    );
    await maintenance.maybeRun();
    const input = pick(body, ['email', 'password']);
    const result = await auth.login(input, requestMeta(headers, remoteAddress));

    /* Conta com 2FA: ainda NÃO há sessão nem cookie, só o desafio. */
    if (result.twoFactorRequired) {
      return {
        status: 200,
        body: {
          twoFactorRequired: true,
          challenge: result.challenge,
          expiresAt: result.expiresAt,
        },
      };
    }

    return {
      status: 200,
      body: { user: result.user, expiresAt: result.expiresAt },
      cookies: [serializeSessionCookie(result.token, { maxAgeMs: SECURITY.SESSION_TTL_MS })],
    };
  });

  router.post('/api/auth/login/2fa', async ({ body, headers, remoteAddress }) => {
    limitByIp(
      twoFactorLimiter,
      headers,
      remoteAddress,
      'Muitas tentativas deste endereço. Aguarde alguns minutos e tente novamente.'
    );
    const input = pick(body, ['challenge', 'code']);
    const result = await auth.loginWithSecondFactor(input, requestMeta(headers, remoteAddress));

    return {
      status: 200,
      body: { user: result.user, expiresAt: result.expiresAt },
      cookies: [serializeSessionCookie(result.token, { maxAgeMs: SECURITY.SESSION_TTL_MS })],
    };
  });

  /* Recuperação de senha. A resposta é a MESMA para e-mail com conta, sem
     conta, e com limite por e-mail estourado; só o limite por IP (que não
     depende do e-mail) e a falta de provedor de e-mail respondem diferente. */
  router.post('/api/auth/forgot', async ({ body, headers, remoteAddress }) => {
    limitByIp(
      forgotIpLimiter,
      headers,
      remoteAddress,
      'Muitos pedidos deste endereço. Aguarde alguns minutos e tente novamente.'
    );
    if (!passwordReset.available) {
      throw new AppError(
        503,
        'EMAIL_INDISPONIVEL',
        'A recuperação de senha está indisponível no momento. Fale com o suporte.'
      );
    }
    const { email } = pick(body, ['email']);
    const normalized = normalizeEmail(email);
    await passwordReset.requestReset(email, {
      allowed: forgotEmailLimiter.hit(normalized || 'vazio'),
      ip: clientAddress(headers, remoteAddress),
    });
    return {
      status: 202,
      body: {
        ok: true,
        message: 'Se existir uma conta com este e-mail, enviaremos um link para redefinir a senha.',
      },
    };
  });

  router.post('/api/auth/reset', async ({ body, headers, remoteAddress }) => {
    limitByIp(
      resetLimiter,
      headers,
      remoteAddress,
      'Muitas tentativas deste endereço. Aguarde alguns minutos e tente novamente.'
    );
    const input = pick(body, ['token', 'password']);
    return {
      status: 200,
      body: await passwordReset.reset(input, { ip: clientAddress(headers, remoteAddress) }),
    };
  });

  router.post(
    '/api/auth/logout',
    async ({ token, user }) => {
      await auth.logout(token, user?.id);
      return { status: 200, body: { ok: true }, cookies: [serializeClearedSessionCookie()] };
    },
    { auth: true }
  );

  /* `sessionId` é uso interno (logout, auditoria) e não deve sair na resposta:
     identificador de sessão não é informação de perfil. */
  router.get(
    '/api/auth/me',
    async ({ user }) => {
      const { sessionId, ...publicUser } = user;
      return { status: 200, body: { user: publicUser } };
    },
    { auth: true }
  );

  /* ------------------------------------------- segurança da própria conta */

  const sensitive = (user) => {
    if (!sensitiveLimiter.hit(String(user.id))) {
      throw tooManyRequests('Muitas tentativas. Aguarde alguns minutos e tente novamente.');
    }
  };

  router.post(
    '/api/auth/password',
    async ({ user, body, headers, remoteAddress }) => {
      sensitive(user);
      const input = pick(body, ['currentPassword', 'newPassword']);
      return {
        status: 200,
        body: await accountSecurity.changePassword(user, input, {
          ip: clientAddress(headers, remoteAddress),
        }),
      };
    },
    { auth: true }
  );

  router.get(
    '/api/auth/sessions',
    async ({ user }) => ({ status: 200, body: { sessions: await accountSecurity.listSessions(user) } }),
    { auth: true }
  );

  router.post(
    '/api/auth/sessions/revoke-all',
    async ({ user }) => ({
      status: 200,
      body: await accountSecurity.revokeAll(user),
      cookies: [serializeClearedSessionCookie()],
    }),
    { auth: true }
  );

  router.delete(
    '/api/auth/sessions/:id',
    async ({ user, params }) => ({
      status: 200,
      body: await accountSecurity.revokeSession(user, params.id),
    }),
    { auth: true }
  );

  /* 2FA: só ADMIN (o serviço também confere). */
  router.get(
    '/api/auth/2fa',
    async ({ user }) => ({ status: 200, body: await twoFactor.status(user) }),
    { auth: true }
  );

  router.post(
    '/api/auth/2fa/setup',
    async ({ user, body, headers, remoteAddress }) => {
      sensitive(user);
      const input = pick(body, ['password']);
      return {
        status: 200,
        body: await twoFactor.setup(user, input, { ip: clientAddress(headers, remoteAddress) }),
      };
    },
    { auth: true }
  );

  router.post(
    '/api/auth/2fa/enable',
    async ({ user, body, headers, remoteAddress }) => {
      sensitive(user);
      const input = pick(body, ['code']);
      return {
        status: 200,
        body: await twoFactor.enable(user, input, { ip: clientAddress(headers, remoteAddress) }),
      };
    },
    { auth: true }
  );

  router.post(
    '/api/auth/2fa/disable',
    async ({ user, body, headers, remoteAddress }) => {
      sensitive(user);
      const input = pick(body, ['password', 'code']);
      return {
        status: 200,
        body: await twoFactor.disable(user, input, { ip: clientAddress(headers, remoteAddress) }),
      };
    },
    { auth: true }
  );

  router.post(
    '/api/auth/2fa/recovery-codes',
    async ({ user, body, headers, remoteAddress }) => {
      sensitive(user);
      const input = pick(body, ['password', 'code']);
      return {
        status: 200,
        body: await twoFactor.regenerateRecoveryCodes(user, input, {
          ip: clientAddress(headers, remoteAddress),
        }),
      };
    },
    { auth: true }
  );

  /* ------------------------------------------------------------ cliente */

  router.get(
    '/api/me/projects',
    async ({ user }) => ({ status: 200, body: { projects: await projects.listForUser(user.id) } }),
    { auth: true }
  );

  router.get(
    '/api/me/requests',
    async ({ user, query }) => ({
      status: 200,
      body: { requests: await requests.listMine(user, parsePagination(query)) },
    }),
    { auth: true }
  );

  router.post(
    '/api/me/requests',
    async ({ user, body }) => {
      const input = pick(body, ['type', 'description', 'budget', 'deadline']);
      return { status: 201, body: { request: await requests.create(user, input) } };
    },
    { auth: true }
  );

  router.get(
    '/api/me/summary',
    async ({ user }) => ({
      status: 200,
      body: {
        summary: {
          projects: (await projects.listForUser(user.id)).length,
          requests: (await requests.listMine(user, { limit: 100, offset: 0 })).length,
          unreadMessages: await ctx.messages.countUnreadForUser(user.id),
        },
      },
    }),
    { auth: true }
  );

  /* Caixa de mensagens — a mesma rota serve cliente e admin; o serviço
     decide o recorte pelo papel de quem está logado. */
  router.get(
    '/api/conversations',
    async ({ user, query }) => ({
      status: 200,
      body: {
        conversations: await messages.listConversations(user, parsePagination(query)),
      },
    }),
    { auth: true }
  );

  /* Só o número, para o indicador do menu não precisar baixar as conversas. */
  router.get(
    '/api/conversations/unread',
    async ({ user }) => ({
      status: 200,
      body: {
        unread: await ctx.messages.countUnreadForViewer({
          viewerId: user.id,
          isAdmin: user.role === ROLES.ADMIN,
        }),
      },
    }),
    { auth: true }
  );

  /* --------------------- solicitação: cliente dono OU admin (regra única) */

  router.get(
    '/api/requests/:id',
    async ({ user, params }) => {
      const id = requireId(params.id);
      return { status: 200, body: { request: await requests.getForViewer(user, id) } };
    },
    { auth: true }
  );

  router.get(
    '/api/requests/:id/messages',
    async ({ user, params, query }) => {
      const id = requireId(params.id);
      return {
        status: 200,
        body: {
          messages: await messages.listForRequest(user, id, parsePagination(query)),
        },
      };
    },
    { auth: true }
  );

  router.post(
    '/api/requests/:id/messages',
    async ({ user, params, body }) => {
      const id = requireId(params.id);
      const { body: text, image } = pick(body, ['body', 'image']);

      /* Só os campos previstos da imagem são lidos. */
      const imagem = image
        ? pick(image, ['dataBase64', 'filename'])
        : null;

      return {
        status: 201,
        body: { message: await messages.send(user, id, text, imagem) },
      };
    },
    { auth: true }
  );

  /* Download da imagem. Responde bytes, não JSON — e sempre com o tipo
     detectado no servidor, nunca com o que o navegador declarou no envio. */
  router.get(
    '/api/attachments/:id',
    async ({ user, params }) => {
      const id = requireId(params.id);
      const arquivo = await attachments.baixar(user, id);

      return {
        status: 200,
        raw: {
          buffer: arquivo.buffer,
          contentType: arquivo.mime,
          filename: arquivo.filename,
        },
      };
    },
    { auth: true }
  );

  /* -------------------------------------------------------------- admin */

  const adminOnly = { auth: true, role: ROLES.ADMIN };

  router.get(
    '/api/admin/summary',
    async () => ({
      status: 200,
      body: {
        summary: {
          clients: await ctx.users.countClients(),
          projects: await ctx.projects.countAll(),
          requests: await ctx.requests.countAll(),
          pendingRequests: await ctx.requests.countByStatus('NOVO'),
          messages: await ctx.messages.countAll(),
        },
      },
    }),
    adminOnly
  );

  router.get(
    '/api/admin/clients',
    async ({ query }) => ({
      status: 200,
      body: {
        clients: await ctx.users.list({
          search: typeof query.search === 'string' ? query.search.trim() : null,
          ...parsePagination(query),
        }),
      },
    }),
    adminOnly
  );

  /* ---- Ficha do cliente + vínculo com projetos ---- */

  router.get(
    '/api/admin/clients/:id',
    async ({ params, query }) => {
      const id = requireId(params.id);
      return { status: 200, body: await clients.getDetail(id, parsePagination(query)) };
    },
    adminOnly
  );

  router.post(
    '/api/admin/clients/:id/projects',
    async ({ user, params, body }) => {
      const clientId = requireId(params.id);
      const { projectId } = pick(body, ['projectId']);
      return {
        status: 200,
        body: await clients.linkProject(user, clientId, requireId(projectId)),
      };
    },
    adminOnly
  );

  router.delete(
    '/api/admin/clients/:id/projects/:projectId',
    async ({ user, params }) => {
      const clientId = requireId(params.id);
      const projectId = requireId(params.projectId);
      return { status: 200, body: await clients.unlinkProject(user, clientId, projectId) };
    },
    adminOnly
  );

  router.get(
    '/api/admin/requests',
    async ({ query }) => ({
      status: 200,
      body: {
        requests: await requests.listAll(
          parsePagination(query),
          typeof query.status === 'string' ? query.status : null
        ),
      },
    }),
    adminOnly
  );

  router.patch(
    '/api/admin/requests/:id/status',
    async ({ user, params, body }) => {
      const id = requireId(params.id);
      const { status } = pick(body, ['status']);
      return { status: 200, body: { request: await requests.updateStatus(user, id, status) } };
    },
    adminOnly
  );

  router.get(
    '/api/admin/projects',
    async ({ query }) => ({
      status: 200,
      body: { projects: await projects.listAll(parsePagination(query)) },
    }),
    adminOnly
  );

  router.post(
    '/api/admin/projects',
    async ({ user, body }) => ({
      status: 201,
      body: { project: await projects.create(user, body) },
    }),
    adminOnly
  );

  router.put(
    '/api/admin/projects/:id',
    async ({ user, params, body }) => {
      const id = requireId(params.id);
      return { status: 200, body: { project: await projects.update(user, id, body) } };
    },
    adminOnly
  );

  router.delete(
    '/api/admin/projects/:id',
    async ({ user, params }) => {
      const id = requireId(params.id);
      return { status: 200, body: await projects.remove(user, id) };
    },
    adminOnly
  );

  router.get(
    '/api/admin/audit',
    async ({ query }) => ({
      status: 200,
      body: { logs: await ctx.audit.list(parsePagination(query)) },
    }),
    adminOnly
  );

  /* ------------------------------------------------- serviço (API do Panel)

     Chamado de servidor para servidor com X-Service-Key; nunca por navegador de
     cliente (sem a chave, nada abre; cookie de sessão é ignorado). As rotas
     marcadas `service: true` passam por `guardService` no despacho. */

  const svc = { service: true };

  /* Id de solicitação/anexo no caminho: só dígitos. */
  const requireServiceId = (raw) => {
    const id = parseServiceId(raw);
    if (!id) throw badRequest('Identificador inválido.');
    return id;
  };

  router.get(
    '/api/service/conversations',
    async ({ query }) => ({
      status: 200,
      body: { conversations: await panelConversations.listConversations(query) },
    }),
    svc
  );

  /* Declarada antes de /:id (o roteador casa o primeiro que servir). */
  router.get(
    '/api/service/conversations/unread',
    async () => ({ status: 200, body: { count: await panelConversations.unreadCount() } }),
    svc
  );

  router.get(
    '/api/service/conversations/:id',
    async ({ params }) => ({
      status: 200,
      body: await panelConversations.getConversation(requireServiceId(params.id)),
    }),
    svc
  );

  router.post(
    '/api/service/conversations/:id/read',
    async ({ params }) => {
      await panelConversations.markRead(requireServiceId(params.id));
      return { status: 204 };
    },
    svc
  );

  router.post(
    '/api/service/conversations/:id/messages',
    async ({ params, body }) => {
      /* Sem imagem vale o teto pequeno; com imagem, o do POST autenticado. */
      const limite = body?.attachment ? LIMITS.SERVICE_IMAGE_MAX_BODY_BYTES : LIMITS.SERVICE_MAX_BODY_BYTES;
      if (Buffer.byteLength(JSON.stringify(body ?? {})) > limite) {
        throw new AppError(413, 'CORPO_GRANDE_DEMAIS', 'O corpo da requisição passa do tamanho permitido.');
      }
      const requestId = requireServiceId(params.id);
      /* Só estes campos são lidos: autor, papel ou data no corpo não têm efeito. */
      const input = pick(body, ['body', 'adminId', 'adminName', 'clientMessageId', 'attachment']);
      if (input.attachment && typeof input.attachment === 'object') {
        input.attachment = pick(input.attachment, ['name', 'contentType', 'dataBase64']);
      }
      return {
        status: 201,
        body: { message: await panelConversations.sendMessage(requestId, input) },
      };
    },
    svc
  );

  router.get(
    '/api/service/attachments/:id',
    async ({ params }) => {
      const arquivo = await panelConversations.downloadAttachment(requireServiceId(params.id));
      return {
        status: 200,
        raw: { buffer: arquivo.buffer, contentType: arquivo.mime, filename: arquivo.filename },
      };
    },
    svc
  );

  /* Projetos do site (tela "Site" do Panel). Corpo ≤ 32 KB (o porteiro já limita a
     leitura; aqui vale também para quem chama `handle` direto). */
  const serviceProjectBody = (body) => {
    if (Buffer.byteLength(JSON.stringify(body ?? {})) > LIMITS.SERVICE_MAX_BODY_BYTES) {
      throw new AppError(413, 'CORPO_GRANDE_DEMAIS', 'O corpo da requisição passa do tamanho permitido.');
    }
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  };

  router.get(
    '/api/service/projects',
    async ({ query }) => ({
      status: 200,
      body: { projects: await panelProjects.list(parsePagination(query)) },
    }),
    svc
  );

  router.get(
    '/api/service/projects/:id',
    async ({ params }) => ({
      status: 200,
      body: { project: await panelProjects.get(requireServiceId(params.id)) },
    }),
    svc
  );

  router.post(
    '/api/service/projects',
    async ({ body }) => ({
      status: 201,
      body: { project: await panelProjects.create(serviceProjectBody(body)) },
    }),
    svc
  );

  router.put(
    '/api/service/projects/:id',
    async ({ params, body }) => {
      const id = requireServiceId(params.id);
      return { status: 200, body: { project: await panelProjects.update(id, serviceProjectBody(body)) } };
    },
    svc
  );

  router.delete(
    '/api/service/projects/:id',
    async ({ params, query }) => {
      const result = await panelProjects.remove(requireServiceId(params.id), query);
      if (!result.linked) return { status: 204 };
      return {
        status: 409,
        body: {
          error: 'PROJETO_VINCULADO',
          code: 'PROJETO_VINCULADO',
          message: 'Este projeto está ligado a clientes. Oculte-o em vez de excluir.',
          clientCount: result.linked,
        },
      };
    },
    svc
  );

  /* ------------------------------------------------------------ execução */

  /**
   * `request`: { method, path, query, headers, body }
   * devolve   { status, headers, body }
   */
  async function handle(request) {
    const headers = normalizeHeaders(request.headers);

    /* IP e user agent da requisição ficam disponíveis para a auditoria. */
    return runWithRequest(
      {
        ip: clientAddress(headers, request.remoteAddress),
        userAgent: clipUserAgent(headers['user-agent']),
      },
      () => dispatch(request, headers)
    );
  }

  /**
   * Porteiro dos endpoints de serviço. Ordem: limite por IP, chave configurada
   * (503), pedido de navegador (403) e, por fim, a chave (401 sem detalhe).
   */
  function guardService(headers, remoteAddress) {
    const ip = clientAddress(headers, remoteAddress);
    if (!serviceLimiter.hit(ip)) throw tooManyRequests('Muitas requisições.');

    if (!serviceAuth.enabled) {
      throw new AppError(503, 'SERVICO_DESLIGADO', 'O serviço não está configurado.');
    }

    /* Navegador sempre manda Origin em POST e em fetch entre origens; a API do
       Panel não. Quem manda é página web, e página web não é cliente deste serviço. */
    if (headers.origin !== undefined) throw forbidden('Requisição não permitida.');

    if (!serviceAuth.authorize(headers['x-service-key'])) {
      if (!serviceFailLimiter.hit(ip)) throw tooManyRequests('Muitas requisições.');
      throw unauthorized('Não autorizado.');
    }
  }

  /**
   * Antes de ler o corpo (server.js/netlify): decide o teto de leitura.
   * Em /api/service/* a chave é conferida AQUI, sem ler nada; sem chave válida
   * devolve `reject: true` e o corpo nem é lido (quem chamar responde via
   * `handle` com corpo vazio, que devolve 401/503/403/429 pelo porteiro normal).
   * Não consome limite de taxa: quem consome é o `handle` da mesma requisição.
   */
  function bodyPolicy({ path, headers: rawHeaders = {} }) {
    const normalized = normalizeHeaders(rawHeaders);
    const limit = bodyLimitFor(path);
    if (!(path.startsWith('/api/service/') || path === '/api/service')) return { limit, reject: false };
    const ok =
      serviceAuth.enabled &&
      normalized.origin === undefined &&
      serviceAuth.authorize(normalized['x-service-key']);
    if (!ok) return { limit: 0, reject: true };
    return { limit: bodyLimitFor(path, { serviceAuthorized: true }), reject: false };
  }

  async function dispatch(request, headers) {
    try {
      const method = String(request.method ?? 'GET').toUpperCase();
      const path = String(request.path ?? '');

      /* Administração do site desligada: nada de /api/admin/*, nem para saber
         se a rota existe. (A leitura de analytics fica em /api/analytics/report,
         com a própria chave.) */
      if (!adminEnabled && (path === '/api/admin' || path.startsWith('/api/admin/'))) {
        throw new AppError(
          410,
          'ADMIN_DESATIVADO',
          'A administração agora é feita no Panel TODAI. Esta área do site foi desativada.'
        );
      }

      /* Qualquer caminho sob /api/service/ passa pelo porteiro ANTES do roteamento:
         sem a chave nem a existência da rota é revelada. */
      const isService = path.startsWith('/api/service/') || path === '/api/service';
      if (isService) guardService(headers, request.remoteAddress);

      const found = router.match(method, path);
      if (!found) throw notFound('Rota não encontrada.');
      if (found.methodMismatch) {
        throw new AppError(405, 'METODO_NAO_PERMITIDO', 'Método não permitido.');
      }

      const { route, params } = found;

      /* Serviço (já autenticado acima): nem cookie nem Origin entram na conta. */
      if (route.options.service) {
        const result = await route.handler({
          params,
          query: request.query ?? {},
          body: request.body ?? {},
          headers,
          remoteAddress: request.remoteAddress,
        });
        if (result.raw) return respondRaw(result.status ?? 200, result.raw);
        return respond(result.status ?? 200, result.body);
      }

      /* CSRF: requisição que altera estado precisa vir da própria origem
         (Origin, ou Referer, ou Sec-Fetch-Site). Combinado com SameSite=Lax,
         cobre o cenário clássico de CSRF. */
      if (
        MUTATING_METHODS.has(method) &&
        allowedOrigins.length &&
        !isTrustedRequestOrigin(headers, allowedOrigins)
      ) {
        throw forbidden('Origem não autorizada.');
      }

      const token = parseCookies(headers.cookie)[SECURITY.SESSION_COOKIE] ?? null;
      const user = route.options.auth ? await auth.resolveSession(token) : null;

      if (route.options.auth && !user) {
        throw unauthorized();
      }

      /* Autorização por papel — no servidor, sempre. */
      if (route.options.role && user.role !== route.options.role) {
        await ctx.audit.log({
          userId: user.id,
          action: AUDIT_ACTIONS.ACCESS_DENIED,
          resourceType: 'authz',
          details: { rota: path, papel: user.role },
        });
        throw forbidden();
      }

      const result = await route.handler({
        user,
        token,
        params,
        query: request.query ?? {},
        body: request.body ?? {},
        headers,
        remoteAddress: request.remoteAddress,
      });

      if (result.raw) return respondRaw(result.status ?? 200, result.raw);

      return respond(result.status ?? 200, result.body, result.cookies);
    } catch (error) {
      return toErrorResponse(error);
    }
  }

  return { handle, bodyPolicy, ctx, maintenance, services: { auth, projects, requests, messages } };
}

/* ------------------------------------------------------------- helpers */

function requireId(raw) {
  const id = toId(raw);
  if (!id) throw badRequest('Identificador inválido.');
  return id;
}

function normalizeHeaders(headers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

/**
 * Resposta com bytes (imagem).
 * `nosniff` impede o navegador de adivinhar outro tipo, e `inline` com nome
 * fixo evita download com nome manipulado. Cache privado: a imagem pertence
 * a uma conversa, não pode ficar em cache compartilhado.
 */
function respondRaw(status, { buffer, contentType, filename }) {
  return {
    status,
    isRaw: true,
    buffer,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(buffer.length),
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': contentDisposition(filename),
      'Cache-Control': 'private, no-store',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  };
}

/** Cabeçalho só aceita Latin-1: nome ASCII de reserva + `filename*` (UTF-8) para o resto. */
function contentDisposition(filename) {
  const ascii = String(filename).replace(/[^\x20-\x7e]|["\\;]/g, '_').slice(0, 120) || 'imagem';
  const utf8 = encodeURIComponent(String(filename)).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${ascii}"; filename*=UTF-8''${utf8}`;
}

function respond(status, body, cookies) {
  const headers = { ...JSON_HEADERS };
  if (cookies?.length) headers['Set-Cookie'] = cookies;
  return { status, headers, body };
}

/**
 * Converte exceção em resposta.
 * Erro previsto vira mensagem útil; erro inesperado é registrado no servidor
 * e devolve texto genérico — detalhe interno não vai para o cliente.
 */
function toErrorResponse(error) {
  if (error instanceof AppError) {
    const response = respond(error.status, {
      error: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
    });
    if (error.retryAfterSeconds) response.headers['Retry-After'] = String(error.retryAfterSeconds);
    return response;
  }

  console.error('[api] erro inesperado:', error?.message, error?.stack);

  return respond(500, {
    error: 'ERRO_INTERNO',
    message: 'Algo deu errado. Tente novamente em instantes.',
  });
}
