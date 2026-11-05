/* =========================================================================
   Orçamentos pedidos pelo site.
   -------------------------------------------------------------------------
   Estes pedidos NÃO ficam no banco do site: são encaminhados à API de licenças
   TODAI, que é onde o Panel Desktop lê as solicitações. O navegador nunca
   fala com ela — quem chama é este servidor, com uma credencial de serviço que
   não sai daqui.

   A validação acontece dos dois lados de propósito. A daqui devolve erro por
   campo sem gastar uma chamada de rede; a de lá é a que realmente vale, porque
   este servidor não é a única coisa capaz de chamar aquela API.
   ========================================================================= */

import { config, LIMITS } from '../config.js';
import { AppError, badRequest, tooManyRequests } from '../http/errors.js';
import { createValidator } from '../http/validation.js';
import { createRateLimiter } from '../http/rateLimit.js';
import { safeFieldErrors } from '../http/fieldErrors.js';

/** Limites do contrato da API central (QuoteRequestCreateRequest). */
const SUBJECT_MIN = 3;
const SUBJECT_MAX = 200;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 5000;

/* Teto por visitante. A API central também limita, mas por IP de quem chama —
   e quem chama é este servidor, então lá todos os visitantes contam como um só.
   Sem este limite, um único robô consumiria a cota de todo mundo.

   Em memória de propósito: não há tabela para isso e o serviço roda numa
   instância. Reiniciar zera a contagem, e com várias instâncias cada uma teria
   a sua — aceitável para conter spam de formulário, insuficiente para um
   ataque distribuído, que é problema da camada de rede. */
/* Campos do formulário: só erros com estas chaves voltam ao navegador. */
const FIELDS = [
  'requesterName',
  'requesterEmail',
  'requesterPhone',
  'company',
  'subject',
  'description',
];

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export function quoteRequestsService({
  fetchImpl = fetch,
  licensing = config.licensing,
} = {}) {
  /** IP do visitante -> pedidos aceitos dentro da janela (mapa com teto de chaves). */
  const limiter = createRateLimiter({ max: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS });

  const configured = Boolean(licensing.baseUrl && licensing.serviceKey);

  /**
   * Valida e encaminha. Devolve o que a API central gravou, para a tela poder
   * confirmar ao visitante que o pedido chegou.
   */
  async function create(input, { clientKey = 'desconhecido' } = {}) {
    const payload = validate(input);
    enforceRateLimit(clientKey);

    if (!configured) {
      /* Sem integração configurada o pedido se perderia em silêncio. Melhor
         dizer que o canal está fora do ar do que fingir que foi recebido. */
      throw new AppError(
        503,
        'ORCAMENTO_INDISPONIVEL',
        'O envio de orçamentos está temporariamente indisponível. ' +
          'Fale com a gente pelo WhatsApp.'
      );
    }

    const response = await send(payload);
    return response;
  }

  /**
   * Conta só o que passou pela validação: um formulário preenchido errado três
   * vezes é engano comum, e gastar a cota nisso puniria quem está tentando
   * pedir de verdade.
   */
  function enforceRateLimit(clientKey) {
    if (!limiter.hit(clientKey)) {
      throw tooManyRequests(
        'Você já enviou vários pedidos agora há pouco. Aguarde alguns minutos ' +
          'ou fale com a gente pelo WhatsApp.'
      );
    }
  }

  function validate(input) {
    const validator = createValidator();
    validator.text('requesterName', input.requesterName, {
      min: 2,
      max: LIMITS.NAME_MAX,
      label: 'seu nome',
    });
    validator.email('requesterEmail', input.requesterEmail);
    validator.optionalText('requesterPhone', input.requesterPhone, {
      max: LIMITS.PHONE_MAX,
      label: 'Telefone',
    });
    validator.optionalText('company', input.company, {
      max: LIMITS.COMPANY_MAX,
      label: 'Empresa',
    });
    validator.text('subject', input.subject, {
      min: SUBJECT_MIN,
      max: SUBJECT_MAX,
      label: 'o assunto',
    });
    validator.text('description', input.description, {
      min: DESCRIPTION_MIN,
      max: DESCRIPTION_MAX,
      label: 'a descrição',
    });
    validator.assert();

    /* Campo opcional vazio vira ausente, e não string vazia: o contrato da API
       central aceita nulo, mas "" gastaria o limite de tamanho à toa e gravaria
       um telefone em branco como se fosse informado. */
    const optional = (value) => {
      const trimmed = typeof value === 'string' ? value.trim() : '';
      return trimmed === '' ? undefined : trimmed;
    };

    return {
      requesterName: input.requesterName.trim(),
      requesterEmail: input.requesterEmail.trim(),
      requesterPhone: optional(input.requesterPhone),
      company: optional(input.company),
      subject: input.subject.trim(),
      description: input.description.trim(),
    };
  }

  async function send(payload) {
    const url = new URL(
      'api/v1/site/quote-requests',
      /* Sem a barra final o último segmento da base seria descartado pelo
         construtor de URL, e o pedido iria para o caminho errado. */
      licensing.baseUrl.endsWith('/')
        ? licensing.baseUrl
        : `${licensing.baseUrl}/`
    );

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      licensing.timeoutMs
    );

    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Key': licensing.serviceKey,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (cause) {
      /* Rede fora, DNS, TLS ou estouro do tempo. O visitante não tem culpa nem
         o que fazer com o detalhe técnico — mas sem este registro a falha some
         e não sobra nada para descobrir por que o orçamento não chegou. */
      console.error('[orcamentos] falha ao chamar a API de licenciamento:', cause);
      throw new AppError(
        503,
        'ORCAMENTO_INDISPONIVEL',
        'Não conseguimos registrar seu pedido agora. Tente de novo em alguns ' +
          'minutos ou fale com a gente pelo WhatsApp.'
      );
    } finally {
      clearTimeout(timeout);
    }

    return readResponse(response);
  }

  async function readResponse(response) {
    const text = await response.text();
    let body = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = {};
      }
    }

    if (response.ok) return body;

    /* 400 vindo de lá é problema do que o visitante digitou: repassar os campos
       deixa o formulário destacá-los. Qualquer outro status é problema nosso, e
       o detalhe interno não vai para o navegador. */
    if (response.status === 400) {
      throw badRequest('Confira os campos destacados.', safeFieldErrors(body.errors, FIELDS));
    }

    console.error(
      `[orcamentos] API de licenciamento respondeu ${response.status}`,
      body.correlationId ? `correlationId=${body.correlationId}` : ''
    );
    throw new AppError(
      503,
      'ORCAMENTO_INDISPONIVEL',
      'Não conseguimos registrar seu pedido agora. Tente de novo em alguns ' +
        'minutos ou fale com a gente pelo WhatsApp.'
    );
  }

  return { create };
}
