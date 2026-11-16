/* =========================================================================
   Validação e saneamento de entrada.
   -------------------------------------------------------------------------
   Duas regras que valem para TODA rota:

   1. Nada do corpo da requisição é usado direto. Cada rota declara os campos
      que aceita (`pick`), então enviar `role: "ADMIN"` ou `id: 1` junto do
      cadastro simplesmente não tem efeito — é assim que se barra o
      mass assignment.

   2. A validação do navegador é conveniência; esta aqui é a que vale.
   ========================================================================= */

import { LIMITS, SECURITY } from '../config.js';
import { badRequest } from './errors.js';

/** Mantém apenas as chaves permitidas — o resto é descartado silenciosamente. */
export function pick(source, allowedKeys) {
  const result = {};
  if (!source || typeof source !== 'object') return result;

  for (const key of allowedKeys) {
    if (Object.hasOwn(source, key)) result[key] = source[key];
  }
  return result;
}

/**
 * Regra de força da senha — uma só, usada pelo cadastro, pela troca de senha e
 * pelos scripts que criam o administrador. Devolve a mensagem ou `null`.
 */
export function passwordProblem(value) {
  if (typeof value !== 'string' || !value) return 'Informe a senha.';
  if (value.length < SECURITY.PASSWORD_MIN_LENGTH) {
    return `A senha precisa ter ao menos ${SECURITY.PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (value.length > SECURITY.PASSWORD_MAX_LENGTH) return 'Senha longa demais.';
  if (!/[a-zA-Z]/.test(value) || !/[0-9]/.test(value)) {
    return 'A senha precisa misturar letras e números.';
  }
  return null;
}

/** Acumula erros por campo para a resposta apontar o que corrigir. */
export function createValidator() {
  const errors = {};

  const api = {
    fail(field, message) {
      if (!errors[field]) errors[field] = message;
      return api;
    },

    /** Texto obrigatório, com limite de tamanho. */
    text(field, value, { min = 1, max = 255, label = field } = {}) {
      if (typeof value !== 'string' || !value.trim()) {
        return api.fail(field, `Informe ${label}.`);
      }
      const trimmed = value.trim();
      if (trimmed.length < min) {
        return api.fail(field, `${label} precisa ter ao menos ${min} caracteres.`);
      }
      if (trimmed.length > max) {
        return api.fail(field, `${label} pode ter no máximo ${max} caracteres.`);
      }
      return api;
    },

    /** Texto opcional: vazio vira null. */
    optionalText(field, value, { max = 255, label = field } = {}) {
      if (value === undefined || value === null || value === '') return api;
      if (typeof value !== 'string') return api.fail(field, `${label} inválido.`);
      if (value.trim().length > max) {
        return api.fail(field, `${label} pode ter no máximo ${max} caracteres.`);
      }
      return api;
    },

    email(field, value) {
      if (typeof value !== 'string' || !value.trim()) {
        return api.fail(field, 'Informe o e-mail.');
      }
      const email = value.trim();
      if (email.length > LIMITS.EMAIL_MAX) {
        return api.fail(field, 'E-mail longo demais.');
      }
      /* Checagem de formato deliberadamente simples: validar e-mail por
         regex complexa gera falso negativo. A prova real é o envio. */
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return api.fail(field, 'E-mail inválido.');
      }
      return api;
    },

    password(field, value) {
      const problem = passwordProblem(value);
      return problem ? api.fail(field, problem) : api;
    },

    oneOf(field, value, allowed, label = field) {
      if (!allowed.includes(value)) {
        return api.fail(field, `${label} inválido.`);
      }
      return api;
    },

    /** Id numérico positivo (rejeita "1 OR 1=1", "abc", negativos). */
    id(field, value, label = field) {
      const number = Number(value);
      if (!Number.isInteger(number) || number <= 0) {
        return api.fail(field, `${label} inválido.`);
      }
      return api;
    },

    get errors() {
      return errors;
    },

    get valid() {
      return Object.keys(errors).length === 0;
    },

    /** Lança 400 com o mapa de erros quando houver problema. */
    assert() {
      if (!api.valid) {
        throw badRequest('Confira os campos destacados.', errors);
      }
    },
  };

  return api;
}

/* --------------------------------------------------------- saneamento */

/** Normaliza e-mail para comparação e gravação (evita duplicata por caixa). */
export const normalizeEmail = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

/** Remove espaços das pontas; devolve null quando fica vazio. */
export const cleanText = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
};

/** Converte para inteiro positivo ou null. */
export const toId = (value) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
};

/** Paginação com teto — evita `?limit=1000000` derrubar o banco. */
export function parsePagination(query = {}) {
  const rawLimit = Number(query.limit);
  const rawPage = Number(query.page);

  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, LIMITS.PAGE_SIZE_MAX)
      : LIMITS.PAGE_SIZE;

  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;

  return { limit, offset: (page - 1) * limit, page };
}
