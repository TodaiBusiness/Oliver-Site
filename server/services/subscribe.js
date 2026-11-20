/* =========================================================================
   Assinatura do TODAI no cartão, pelo site.
   -------------------------------------------------------------------------
   O visitante informa empresa, dia de vencimento e cartão; este servidor valida
   de novo e repassa à API de licenciamento (que fala com o Asaas) com a
   credencial de serviço. O navegador nunca fala com a API.

   DADOS DE CARTÃO: passam por aqui só em memória, a caminho da API. Nunca são
   gravados, registrados em log, auditados nem devolvidos (nem em mensagem de
   erro). Todo `console.*` deste arquivo é escrito sem o corpo da requisição.
   ========================================================================= */

import { isIP } from 'node:net';
import { config, LIMITS, DEFAULT_TIMEOUT_MS } from '../config.js';
import { AppError, badRequest, tooManyRequests } from '../http/errors.js';
import { createValidator } from '../http/validation.js';
import { createRateLimiter } from '../http/rateLimit.js';
import { safeFieldErrors } from '../http/fieldErrors.js';
import { isValidTaxId, onlyDigits } from '../../shared/taxId.js';
import { PLAN } from '../../shared/plan.js';
import {
  BILLING_DAYS, cardBrand, cardNumberProblem, ccvProblem, expiryProblem, postalCodeProblem,
} from '../../shared/billing.js';

const FIELDS = [
  'companyName', 'contactName', 'taxId', 'email', 'phone', 'devices', 'billingDay', 'acceptTerms',
  'card', 'holder', 'number', 'holderName', 'expiryMonth', 'expiryYear', 'ccv', 'postalCode', 'addressNumber',
  'card.number', 'card.holderName', 'card.expiryMonth', 'card.expiryYear', 'card.ccv',
  'holder.postalCode', 'holder.addressNumber',
];

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const UNAVAILABLE =
  'A assinatura online está indisponível agora. Fale com a gente pelo WhatsApp e resolvemos por lá.';
const DECLINED =
  'O cartão foi recusado. Confira os dados ou tente com outro cartão.';
const NEUTRAL_409 =
  'Não foi possível concluir a assinatura com estes dados. Se este CPF ou CNPJ já tiver cadastro, enviamos o link da área Minha licença para o e-mail do cadastro.';

const validTimeout = (value) =>
  Number.isFinite(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;

const str = (value) => (typeof value === 'string' ? value : '');
const obj = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export function subscribeService({ fetchImpl = fetch, licensing = config.licensing } = {}) {
  const limiter = createRateLimiter({ max: RATE_LIMIT_MAX, windowMs: RATE_LIMIT_WINDOW_MS });
  const configured = Boolean(licensing.baseUrl && licensing.serviceKey);

  async function create(input, { clientKey = 'desconhecido' } = {}) {
    const payload = validate(input);
    enforceRateLimit(clientKey);

    if (!configured) throw new AppError(503, 'ASSINATURA_INDISPONIVEL', UNAVAILABLE);

    if (isIP(clientKey)) payload.remoteIp = clientKey;
    return send(payload);
  }

  function enforceRateLimit(clientKey) {
    if (!limiter.hit(clientKey)) {
      throw tooManyRequests(
        'Você já tentou assinar várias vezes agora há pouco. Aguarde alguns minutos ou fale com a gente pelo WhatsApp.'
      );
    }
  }

  function validate(input) {
    const card = obj(input.card);
    const holder = obj(input.holder);
    const validator = createValidator();

    validator.text('companyName', input.companyName, { min: 2, max: LIMITS.COMPANY_MAX, label: 'o nome da empresa' });
    validator.text('contactName', input.contactName, { min: 2, max: LIMITS.NAME_MAX, label: 'seu nome' });
    if (!isValidTaxId(input.taxId)) validator.fail('taxId', 'Confira o CPF ou o CNPJ.');
    validator.email('email', input.email);
    validator.text('phone', input.phone, { min: 8, max: LIMITS.PHONE_MAX, label: 'o telefone' });

    const devices = Number(input.devices);
    if (!Number.isInteger(devices) || devices < 1 || devices > PLAN.maxDevices) {
      validator.fail('devices', `Escolha de 1 a ${PLAN.maxDevices} computadores.`);
    }
    const billingDay = Number(input.billingDay);
    if (!BILLING_DAYS.includes(billingDay)) {
      validator.fail('billingDay', 'Escolha o dia 15, 20 ou 30 para o vencimento.');
    }
    if (input.acceptTerms !== true) validator.fail('acceptTerms', 'Aceite os termos de uso para continuar.');

    /* Mensagens de cartão são fixas: nunca ecoam o que foi digitado. */
    const number = onlyDigits(str(card.number));
    const problem = cardNumberProblem(number);
    if (problem) validator.fail('card.number', problem);

    validator.text('card.holderName', card.holderName, { min: 2, max: 60, label: 'o nome impresso no cartão' });

    const expiryMonth = str(card.expiryMonth).padStart(2, '0');
    const expiryYear = str(card.expiryYear);
    const expiry = expiryProblem(expiryMonth, expiryYear);
    if (expiry) validator.fail('card.expiryMonth', expiry);

    const ccv = str(card.ccv);
    const ccvIssue = ccvProblem(ccv, cardBrand(number));
    if (ccvIssue) validator.fail('card.ccv', ccvIssue);

    const postalCode = onlyDigits(str(holder.postalCode));
    const cepIssue = postalCodeProblem(postalCode);
    if (cepIssue) validator.fail('holder.postalCode', cepIssue);

    const addressNumber = str(holder.addressNumber).trim();
    if (!addressNumber || addressNumber.length > 10) {
      validator.fail('holder.addressNumber', 'Informe o número do endereço (ou S/N).');
    }
    validator.assert();

    return {
      companyName: input.companyName.trim(),
      contactName: input.contactName.trim(),
      taxId: onlyDigits(input.taxId),
      email: input.email.trim(),
      phone: input.phone.trim(),
      devices,
      billingDay,
      card: { holderName: card.holderName.trim(), number, expiryMonth, expiryYear, ccv },
      holder: { postalCode, addressNumber },
    };
  }

  async function send(payload) {
    const url = new URL(
      'api/v1/site/subscription',
      licensing.baseUrl.endsWith('/') ? licensing.baseUrl : `${licensing.baseUrl}/`
    );
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), validTimeout(licensing.timeoutMs));

    let response;
    try {
      response = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Service-Key': licensing.serviceKey },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (cause) {
      /* Só o tipo do erro: a mensagem de uma falha de rede não deve ser confiada. */
      console.error('[assinatura] falha ao chamar a API de licenciamento:', cause?.name ?? 'erro');
      throw new AppError(503, 'ASSINATURA_INDISPONIVEL', UNAVAILABLE);
    } finally {
      clearTimeout(timeout);
    }

    return readResponse(response, payload.card);
  }

  async function readResponse(response, card) {
    const text = await response.text();
    let body = {};
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = {};
      }
    }
    if (body === null || typeof body !== 'object') body = {};

    if (response.ok) return safeResult(body);

    if (response.status === 400) {
      throw badRequest('Confira os campos destacados.', scrub(safeFieldErrors(body.errors, FIELDS), card));
    }
    if (response.status === 402) throw new AppError(402, 'CARTAO_RECUSADO', DECLINED);
    if (response.status === 409) throw new AppError(409, 'CONFIRA_O_EMAIL', NEUTRAL_409);

    console.error(
      `[assinatura] API de licenciamento respondeu ${response.status}`,
      typeof body.correlationId === 'string' ? `correlationId=${body.correlationId.slice(0, 64)}` : ''
    );
    throw new AppError(503, 'ASSINATURA_INDISPONIVEL', UNAVAILABLE);
  }

  /** Só o que a tela precisa, conferido; qualquer outra coisa da API fica de fora. */
  function safeResult(body) {
    const ok =
      (body.status === 'active' || body.status === 'pending') &&
      typeof body.cardBrand === 'string' &&
      /^\d{4}$/.test(String(body.cardLast4)) &&
      BILLING_DAYS.includes(Number(body.billingDay)) &&
      /^\d{4}-\d{2}-\d{2}$/.test(String(body.nextDueDate)) &&
      Number.isFinite(Number(body.amount));
    if (!ok) {
      console.error('[assinatura] a API respondeu sem os dados esperados');
      throw new AppError(503, 'ASSINATURA_INDISPONIVEL', UNAVAILABLE);
    }
    return {
      status: body.status,
      cardBrand: body.cardBrand.slice(0, 20),
      cardLast4: String(body.cardLast4),
      billingDay: Number(body.billingDay),
      nextDueDate: body.nextDueDate,
      amount: Number(body.amount),
    };
  }

  /** Descarta mensagem da API que traga o número do cartão (ou algo parecido com um). */
  function scrub(errors, card) {
    if (!errors) return null;
    const clean = {};
    for (const [key, value] of Object.entries(errors)) {
      const messages = (Array.isArray(value) ? value : [value]).filter(
        (m) => !m.includes(card.number) && !/\d{12,}/.test(m)
      );
      if (messages.length) clean[key] = Array.isArray(value) ? messages : messages[0];
    }
    return Object.keys(clean).length ? clean : null;
  }

  return { create };
}
