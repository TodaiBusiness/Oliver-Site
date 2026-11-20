/* Assinatura no cartão: vencimento, Luhn, bandeira, validade e máscaras. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BILLING_DAYS, nextDueDate, isShortMonthDue, luhn, cardBrand, formatCardNumber, cardNumberProblem,
  parseExpiry, formatExpiry, expiryProblem, ccvProblem, postalCodeProblem, formatPostalCode, cardLast4,
} from '../shared/billing.js';

test('dias de vencimento permitidos', () => {
  assert.deepEqual([...BILLING_DAYS], [15, 20, 30]);
});

test('próximo vencimento: sempre depois de hoje', () => {
  assert.equal(nextDueDate(20, '2026-11-10'), '2026-11-20');
  assert.equal(nextDueDate(20, '2026-11-20'), '2026-12-20', 'hoje não conta: já cobramos na hora');
  assert.equal(nextDueDate(30, '2027-02-28'), '2027-03-30');
  assert.equal(nextDueDate(30, '2026-11-30'), '2026-12-30');
  assert.equal(nextDueDate(15, '2026-11-19'), '2026-12-15');
  assert.equal(nextDueDate(15, '2026-12-19'), '2027-01-15', 'vira o ano');
  assert.equal(nextDueDate(20, new Date(2026, 10, 19)), '2026-11-20', 'aceita Date');
});

test('dia 30 em mês curto cai no último dia', () => {
  assert.equal(nextDueDate(30, '2027-02-10'), '2027-02-28');
  assert.equal(nextDueDate(30, '2028-02-10'), '2028-02-29', 'ano bissexto');
  assert.equal(nextDueDate(30, '2026-04-10'), '2026-04-30');
  assert.equal(nextDueDate(30, '2027-01-31'), '2027-02-28', 'passou o 30 de janeiro');
  assert.equal(nextDueDate(30, '2026-12-31'), '2027-01-30');
  assert.equal(isShortMonthDue(30, '2027-02-28'), true);
  assert.equal(isShortMonthDue(30, '2026-11-30'), false);
});

test('Luhn', () => {
  assert.equal(luhn('4111 1111 1111 1111'), true);
  assert.equal(luhn('4111111111111112'), false);
  assert.equal(luhn('5555555555554444'), true);
  assert.equal(luhn('378282246310005'), true);
  assert.equal(luhn(''), false);
});

test('bandeira por prefixo', () => {
  assert.equal(cardBrand('4111111111111111'), 'visa');
  assert.equal(cardBrand('5555555555554444'), 'master');
  assert.equal(cardBrand('2223000048400011'), 'master');
  assert.equal(cardBrand('378282246310005'), 'amex');
  assert.equal(cardBrand('6362970000457013'), 'elo');
  assert.equal(cardBrand('5067000000000000'), 'elo');
  assert.equal(cardBrand('4011780000000000'), 'elo', 'elo vence visa');
  assert.equal(cardBrand('6062825624254001'), 'hipercard');
  assert.equal(cardBrand('9999'), null);
  assert.equal(cardBrand(''), null);
});

test('máscara do número e últimos dígitos', () => {
  assert.equal(formatCardNumber('4111111111111111'), '4111 1111 1111 1111');
  assert.equal(formatCardNumber('41111'), '4111 1');
  assert.equal(formatCardNumber('378282246310005'), '3782 822463 10005');
  assert.equal(cardLast4('4111 1111 1111 1234'), '1234');
});

test('problema do número do cartão', () => {
  assert.equal(cardNumberProblem('4111 1111 1111 1111'), null);
  assert.equal(cardNumberProblem('378282246310005'), null);
  assert.ok(cardNumberProblem(''));
  assert.ok(cardNumberProblem('4111 1111 1111 11'));
  assert.ok(cardNumberProblem('4111 1111 1111 1112'));
});

test('validade: futura, mês válido, fim do mês vale', () => {
  const hoje = '2026-11-19';
  assert.equal(expiryProblem('11', '2026', hoje), null, 'vale até o fim do mês');
  assert.equal(expiryProblem('12', '2026', hoje), null);
  assert.ok(expiryProblem('10', '2026', hoje));
  assert.ok(expiryProblem('13', '2030', hoje));
  assert.ok(expiryProblem('00', '2030', hoje));
  assert.ok(expiryProblem('12', '2099', hoje));
  assert.ok(expiryProblem('1', '2030', hoje));
  assert.deepEqual(parseExpiry('12/30'), { month: '12', year: '2030' });
  assert.deepEqual(parseExpiry('1230'), { month: '12', year: '2030' });
  assert.deepEqual(parseExpiry('12/2030'), { month: '12', year: '2030' });
  assert.equal(parseExpiry('12/3'), null);
  assert.equal(formatExpiry('1230'), '12/30');
  assert.equal(formatExpiry('1'), '1');
});

test('código de segurança e CEP', () => {
  assert.equal(ccvProblem('123'), null);
  assert.equal(ccvProblem('1234'), null);
  assert.ok(ccvProblem('12'));
  assert.ok(ccvProblem('12a'));
  assert.ok(ccvProblem('123', 'amex'));
  assert.equal(ccvProblem('1234', 'amex'), null);
  assert.ok(ccvProblem('1234', 'visa'));
  assert.equal(postalCodeProblem('12345-678'), null);
  assert.ok(postalCodeProblem('1234'));
  assert.equal(formatPostalCode('12345678'), '12345-678');
});
