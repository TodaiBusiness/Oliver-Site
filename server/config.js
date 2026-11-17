/* =========================================================================
   Configuração do servidor — checklist "Manutenção: configurações
   centralizadas". Nenhum outro arquivo lê `process.env` diretamente.

   ⚠️ Nada aqui tem prefixo VITE_: estes valores NUNCA podem ir para o
   navegador. Ver `.env.example`.
   ========================================================================= */

import { existsSync } from 'node:fs';

/** Papéis de usuário (checklist: "enums" no lugar de string solta). */
export const ROLES = Object.freeze({
  CLIENT: 'CLIENT',
  ADMIN: 'ADMIN',
});

/* Usuário de sistema que assina, no banco do site, as mensagens enviadas pelo
   Panel. Existe só para satisfazer a chave estrangeira de messages.author_id:
   não tem senha utilizável (hash inválido), nunca autentica e não é cliente.
   O nome de quem respondeu fica em messages.author_external_name. */
export const SYSTEM_USER = Object.freeze({
  NAME: 'TODAI Atendimento',
  EMAIL: 'atendimento@sistema.todai.invalid',
});

/** Hash gravado no usuário de sistema: não é scrypt, então nenhuma senha confere. */
export const LOGIN_DISABLED_HASH = '!login-desativado';

/** Estados possíveis de uma solicitação. */
export const REQUEST_STATUS = Object.freeze({
  NEW: 'NOVO',
  REVIEW: 'EM_ANALISE',
  QUOTE: 'ORCAMENTO',
  IN_PROGRESS: 'EM_DESENVOLVIMENTO',
  DONE: 'CONCLUIDO',
  CANCELLED: 'CANCELADO',
});

export const REQUEST_STATUS_VALUES = Object.freeze(
  Object.values(REQUEST_STATUS)
);

/** Estados de um projeto exibido no site. */
export const PROJECT_STATUS = Object.freeze({
  DRAFT: 'RASCUNHO',
  IN_PROGRESS: 'EM_DESENVOLVIMENTO',
  DELIVERED: 'ENTREGUE',
});

export const PROJECT_STATUS_VALUES = Object.freeze(
  Object.values(PROJECT_STATUS)
);

const readEnv = (key, fallback = undefined) => {
  const value = process.env[key];
  return value === undefined || value === '' ? fallback : value;
};

/** Número positivo vindo do ambiente; o que não for vira o padrão. */
/** Valor com espaços/quebras de linha das pontas removidos (a API do Panel também faz trim). */
const readTrimmed = (key) => readEnv(key)?.trim() || undefined;

const readPositive = (key, fallback) => {
  const value = Number(readEnv(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
};

/** Ações registradas em audit_logs. */
export const AUDIT_ACTIONS = Object.freeze({
  LOGIN: 'LOGIN',
  LOGIN_FAILED: 'LOGIN_FALHOU',
  LOGOUT: 'LOGOUT',
  USER_REGISTERED: 'USUARIO_CRIADO',
  PROJECT_CREATED: 'PROJETO_CRIADO',
  PROJECT_UPDATED: 'PROJETO_EDITADO',
  PROJECT_DELETED: 'PROJETO_EXCLUIDO',
  REQUEST_CREATED: 'SOLICITACAO_CRIADA',
  REQUEST_STATUS_CHANGED: 'SOLICITACAO_STATUS_ALTERADO',
  MESSAGE_SENT: 'MENSAGEM_ENVIADA',
  PROJECT_LINKED: 'PROJETO_VINCULADO',
  PROJECT_UNLINKED: 'PROJETO_DESVINCULADO',
  ACCESS_DENIED: 'ACESSO_NEGADO',
  LOGIN_2FA_FAILED: 'LOGIN_2FA_FALHOU',
  RECOVERY_CODE_USED: 'CODIGO_RECUPERACAO_USADO',
  TWO_FACTOR_ENABLED: 'DOIS_FATORES_ATIVADO',
  TWO_FACTOR_DISABLED: 'DOIS_FATORES_DESATIVADO',
  RECOVERY_CODES_REGENERATED: 'CODIGOS_RECUPERACAO_GERADOS',
  PASSWORD_CHANGED: 'SENHA_ALTERADA',
  PASSWORD_CHANGE_FAILED: 'SENHA_ALTERACAO_FALHOU',
  SESSION_REVOKED: 'SESSAO_ENCERRADA',
  SESSIONS_REVOKED_ALL: 'SESSOES_ENCERRADAS',
  PASSWORD_RESET_REQUESTED: 'SENHA_RECUPERACAO_PEDIDA',
  PASSWORD_RESET: 'SENHA_REDEFINIDA',
  SERVICE_MESSAGE_SENT: 'MENSAGEM_PANEL_ENVIADA',
});

/* ------------------------------------------------------------ segurança */

export const SECURITY = Object.freeze({
  /** Duração da sessão. */
  SESSION_TTL_MS: 1000 * 60 * 60 * 8, // 8 horas
  SESSION_COOKIE: 'oi_session',

  /** Tamanho em bytes do identificador de sessão sorteado. */
  SESSION_ID_BYTES: 32,

  /** Parâmetros do scrypt (custo de CPU/memória do hash de senha). */
  SCRYPT: Object.freeze({
    N: 2 ** 15, // custo
    r: 8,
    p: 1,
    keyLength: 64,
    saltBytes: 16,
    maxmem: 96 * 1024 * 1024,
  }),

  /* Expiração por inatividade (além do limite absoluto acima). Cada pedido
     autenticado renova o relógio; ficar parado além disto derruba a sessão.
     Ajustável por SESSION_IDLE_MINUTES_CLIENT / SESSION_IDLE_MINUTES_ADMIN. */
  SESSION_IDLE_MS: Object.freeze({
    CLIENT: readPositive('SESSION_IDLE_MINUTES_CLIENT', 30) * 60 * 1000,
    ADMIN: readPositive('SESSION_IDLE_MINUTES_ADMIN', 15) * 60 * 1000,
  }),
  /** Renovar o `last_seen_at` no máximo uma vez por este intervalo (poupa escrita). */
  SESSION_TOUCH_MS: 60 * 1000,

  /* Bloqueio por tentativas de login: por (e-mail + IP), não pela conta inteira
     (senão qualquer um negaria o login de terceiros). Depois de
     LOGIN_MAX_ATTEMPTS falhas na janela, cada nova falha dobra a espera
     (30 s, 1 min, 2 min... até a própria janela). */
  LOGIN_MAX_ATTEMPTS: 5,
  LOGIN_WINDOW_MS: 1000 * 60 * 15, // 15 minutos
  LOGIN_LOCK_BASE_MS: 1000 * 30,

  /* Segundo fator (TOTP, RFC 6238) para ADMIN. */
  TWO_FACTOR: Object.freeze({
    ISSUER: 'TODAI',
    CHALLENGE_TTL_MS: 1000 * 60 * 5, // tempo para digitar o código depois da senha
    CHALLENGE_MAX_ATTEMPTS: 5, // erros por desafio antes de exigir a senha de novo
    WINDOW: 1, // aceita o passo anterior e o seguinte (±30 s de relógio)
    RECOVERY_CODES: 10,
  }),

  /** Recuperação de senha por e-mail. */
  PASSWORD_RESET_TTL_MS: 1000 * 60 * 30, // 30 minutos

  /** Retenção da trilha de auditoria (0 desliga a purga). */
  AUDIT_RETENTION_DAYS: readPositive('AUDIT_RETENTION_DAYS', 365),

  /** Corpo máximo das rotas de autenticação (o global é para upload de imagem). */
  AUTH_MAX_BODY_BYTES: 8 * 1024,

  /** Regras de senha. */
  PASSWORD_MIN_LENGTH: 10,
  PASSWORD_MAX_LENGTH: 200,
});

/* ------------------------------------------------------------- limites */

export const LIMITS = Object.freeze({
  NAME_MAX: 120,
  COMPANY_MAX: 120,
  EMAIL_MAX: 190,
  PHONE_MAX: 30,
  TITLE_MAX: 160,
  DESCRIPTION_MAX: 4000,
  MESSAGE_MAX: 4000,
  SERVICE_ADMIN_NAME_MAX: 80,
  /* 32 KB: o cliente C# escapa não-ASCII (\uXXXX), então 4000 caracteres acentuados
     ou emoji passam fácil de 8 KB. */
  SERVICE_MAX_BODY_BYTES: 32 * 1024,
  /* Só o POST de mensagem com chave de serviço VÁLIDA: 3 MB de imagem em base64
     (~4 MB) + JSON + escapes. */
  SERVICE_IMAGE_MAX_BODY_BYTES: 4800 * 1024,
  URL_MAX: 500,
  PAGE_SIZE: 20,
  PAGE_SIZE_MAX: 100,

  /* Upload de imagem no chat. 3 MB cobre logo e print de tela com folga;
     acima disso o payload em base64 começa a pesar na função serverless. */
  UPLOAD_MAX_BYTES: 3 * 1024 * 1024,
  ATTACHMENT_NAME_MAX: 80,

  /* Cotas por usuário logado (cliente). O admin não entra nelas. Janelas
     móveis, contadas no banco: valem para todas as instâncias. */
  MESSAGES_PER_HOUR: 60,
  ATTACHMENTS_PER_DAY: 30,
  ATTACHMENT_BYTES_PER_DAY: 30 * 1024 * 1024,
  REQUESTS_PER_DAY: 10,
});

/* --------------------------------------------------------- ambiente */

/** Tempo máximo padrão das chamadas à API de licenciamento (o Render hiberna). */
export const DEFAULT_TIMEOUT_MS = 90000;

/** Texto de ambiente -> milissegundos; o que não for número positivo vira o padrão. */
export function parseTimeoutMs(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/** Banco SQLite padrão do desenvolvimento. */
export const SQLITE_FILE_PADRAO = 'server/data/todai.db';
/** Nome usado antes da troca de marca para TODAI. */
export const SQLITE_FILE_LEGADO = 'server/data/oliver.db';

/* Sem SQLITE_FILE, usa o todai.db. Quem já tinha um banco local do tempo da
   marca Oliver continua com ele: se só o oliver.db existe, ele é usado (nada é
   renomeado sozinho, para não mexer num arquivo que outro processo pode ter
   aberto). Para passar a usar o nome novo, renomeie o arquivo com o servidor parado. */
export function sqliteFilePadrao(existe = existsSync) {
  if (!existe(SQLITE_FILE_PADRAO) && existe(SQLITE_FILE_LEGADO)) return SQLITE_FILE_LEGADO;
  return SQLITE_FILE_PADRAO;
}

export const config = Object.freeze({
  /** 'postgres' em produção (Neon), 'sqlite' para desenvolvimento e testes. */
  driver: readEnv('DATABASE_DRIVER', 'sqlite'),

  sqliteFile: readEnv('SQLITE_FILE') || sqliteFilePadrao(),

  postgres: Object.freeze({
    /** URI completa do Neon (a "pooled connection string"). */
    url: readEnv('DATABASE_URL'),

    /* TLS é obrigatório em qualquer banco hospedado. `DATABASE_SSL=disable`
       existe só para um Postgres rodando na própria máquina. */
    ssl: readEnv('DATABASE_SSL', 'require') !== 'disable',
  }),

  /* Chave-mestra do que o servidor precisa cifrar/assinar em repouso: o segredo
     TOTP do 2FA e o hash dos códigos de recuperação. A sessão em si NÃO depende
     dela (é um token aleatório cujo hash fica no banco). Em produção, sem ela o
     2FA fica indisponível (e o boot avisa); em desenvolvimento cai numa chave
     fixa, só para o fluxo funcionar. Trocar o valor invalida os segredos 2FA já
     cadastrados (ver docs/SEGURANCA.md). */
  sessionSecret: readEnv('SESSION_SECRET'),
  isProduction: readEnv('NODE_ENV') === 'production',

  admin: Object.freeze({
    email: readEnv('ADMIN_EMAIL'),
    password: readEnv('ADMIN_INITIAL_PASSWORD'),
  }),

  /* E-mail transacional (recuperação de senha). Com RESEND_API_KEY + MAIL_FROM
     envia pela API HTTP do Resend; sem eles, em desenvolvimento só registra o
     link no console, e em produção o pedido de recuperação responde 503. */
  mail: Object.freeze({
    resendApiKey: readEnv('RESEND_API_KEY'),
    from: readEnv('MAIL_FROM'),
  }),

  /* Endereço público do site, com https. A compra o usa para dizer ao
     Mercado Pago para onde levar o cliente depois de pagar (/obrigado). */
  site: Object.freeze({
    publicUrl: readEnv('SITE_PUBLIC_URL'),
  }),

  /* Chave que a API de licenciamento manda em `X-Analytics-Key` para ler o
     relatório de visitas. Sem ela (ou com menos de 32 caracteres) a rota de
     relatório fica desligada. Nunca chega ao navegador. */
  analytics: Object.freeze({
    readKey: readEnv('ANALYTICS_READ_KEY'),
  }),

  /* Administração dentro do site. Desligada por padrão: os administradores são os
     do Panel (que responde as conversas por /api/service). Com `true` o /admin
     do site volta a funcionar como antes (reserva/rollback). */
  siteAdminEnabled: ['true', '1'].includes(String(readEnv('SITE_ADMIN_ENABLED', '')).toLowerCase()),

  /* Chave dos endpoints de serviço (/api/service/*), usados pela API do Panel.
     É a mesma string de SITE_SERVICE_API_KEY na API de licenciamento. Sem ela, ou
     com menos de 32 caracteres, esses endpoints respondem 503. Nunca chega ao
     navegador. */
  service: Object.freeze({
    apiKey: readTrimmed('SITE_SERVICE_API_KEY'),
    /* Pedidos por minuto por IP. Todos os admins chegam pelo IP da API do Panel. */
    ratePerMin: readPositive('SERVICE_RATE_LIMIT_PER_MIN', 1200),
  }),

  /* API de licenças TODAI — a API central. Os orçamentos pedidos aqui não ficam no
     banco do site: são gravados lá, onde o Panel Desktop os lê. A chave é de
     serviço (não é sessão de administrador) e nunca chega ao navegador: quem
     chama é este servidor. */
  licensing: Object.freeze({
    baseUrl: readEnv('LICENSING_API_BASE_URL'),
    serviceKey: readTrimmed('SITE_SERVICE_API_KEY'),

    /* O plano gratuito do Render hiberna: o primeiro pedido depois da
       inatividade acorda o serviço e demora. Abaixo disso, um orçamento
       legítimo viraria erro só porque a API estava dormindo. */
    timeoutMs: parseTimeoutMs(readEnv('LICENSING_API_TIMEOUT_MS')),
  }),
});

/**
 * Falha cedo e com mensagem clara quando falta configuração em produção —
 * melhor do que quebrar numa query no meio de um request.
 *
 * `cfg` e `env` são injetáveis só para os testes (o `config` real é congelado
 * na hora do import).
 */
export function assertProductionConfig(cfg = config, env = process.env) {
  const missing = [];

  /* Produção em SQLite grava num arquivo local: some a cada deploy em
     serverless/Render e não aguenta duas instâncias. Quem de fato roda numa VPS
     com volume pode assumir isso de propósito com ALLOW_SQLITE_IN_PRODUCTION=true. */
  if (
    cfg.isProduction &&
    cfg.driver !== 'postgres' &&
    String(env.ALLOW_SQLITE_IN_PRODUCTION ?? '').toLowerCase() !== 'true'
  ) {
    missing.push('DATABASE_DRIVER=postgres');
  }

  if (cfg.driver === 'postgres' && !cfg.postgres.url) {
    missing.push('DATABASE_URL');
  }

  /* As duas andam juntas: uma sozinha significa integração pela metade, e o
     formulário de orçamento falharia só em produção, na frente do visitante. */
  if (cfg.licensing.baseUrl && !cfg.licensing.serviceKey) {
    missing.push('SITE_SERVICE_API_KEY');
  }
  if (cfg.licensing.serviceKey && !cfg.licensing.baseUrl) {
    missing.push('LICENSING_API_BASE_URL');
  }

  if (missing.length) {
    throw new Error(
      `Configuração ausente: ${missing.join(', ')}. ` +
        'Defina essas variáveis de ambiente (ver .env.example).'
    );
  }

  /* Não derruba o boot (o site funciona sem 2FA), mas avisa em voz alta. */
  if (cfg.isProduction && !(cfg.sessionSecret && cfg.sessionSecret.length >= 32)) {
    console.warn(
      '[config] SESSION_SECRET ausente ou com menos de 32 caracteres: o 2FA do administrador ' +
        'fica indisponível. Gere um com: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }
}
