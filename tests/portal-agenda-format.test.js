/* Auxiliares de agenda do portal (src/pages/portal/format.js): hora de Brasília, rótulos por preset, prazo. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  duracaoEmTexto,
  ehPetShop,
  partesBrasilia,
  periodoDoHorario,
  podeAlterarAgendamento,
  precoMinimoServico,
  quandoEmTexto,
  rotulosDaAgenda,
  servicoPorPorte,
  somaDias,
} from '../src/pages/portal/format.js';

test('partesBrasilia entende horário com fuso e sem fuso (Brasília)', () => {
  assert.deepEqual(
    { ...partesBrasilia('2026-11-20T09:30:00-03:00'), ms: 0 },
    { dia: '2026-11-20', hora: '09:30', ms: 0 }
  );
  assert.equal(partesBrasilia('2026-11-20T12:30:00Z').hora, '09:30');
  assert.equal(partesBrasilia('2026-11-20T09:30').hora, '09:30');
  assert.equal(partesBrasilia('2026-11-20T01:00:00Z').dia, '2026-11-19');
  assert.equal(partesBrasilia('lixo'), null);
  assert.equal(quandoEmTexto('2026-11-20T09:30:00-03:00'), 'sexta-feira, 20 de novembro às 09:30');
});

test('rótulos por preset, com o que a loja publicou vencendo o padrão', () => {
  assert.equal(rotulosDaAgenda({ preset: 'Barbearia' }).profissional, 'Barbeiro');
  assert.equal(rotulosDaAgenda({ preset: 'Barbearia' }).qualquer, 'Qualquer barbeiro');
  assert.equal(rotulosDaAgenda({ preset: 'Pet shop' }).profissional, 'Tosador');
  assert.equal(rotulosDaAgenda({ preset: 'Beleza' }).profissional, 'Profissional');
  assert.equal(rotulosDaAgenda({ preset: 'Outros' }).qualquer, 'Qualquer profissional');
  const custom = rotulosDaAgenda({ preset: 'Beleza', rotulos: { profissional: 'Esteticista' } });
  assert.equal(custom.profissional, 'Esteticista');
  assert.equal(custom.qualquer, 'Qualquer esteticista');
  assert.equal(ehPetShop({ preset: 'Pet shop' }), true);
  assert.equal(ehPetShop({ preset: 'Barbearia' }), false);
});

test('serviço por porte, preço inicial, duração e período do dia', () => {
  const banho = { duracao: 45, preco: 50, exigePorte: true, porte: { P: { duracao: 40, preco: 45 }, G: { duracao: 90, preco: 80 } } };
  assert.deepEqual(servicoPorPorte(banho, 'G'), { duracao: 90, preco: 80 });
  assert.deepEqual(servicoPorPorte(banho, undefined), { duracao: 45, preco: 50 });
  assert.equal(precoMinimoServico(banho), 45);
  assert.equal(precoMinimoServico({ preco: 30, exigePorte: false }), 30);
  assert.equal(duracaoEmTexto(45), '45 min');
  assert.equal(duracaoEmTexto(130), '2 h 10 min');
  assert.equal(duracaoEmTexto(120), '2 h');
  assert.equal(duracaoEmTexto(0), '');
  assert.deepEqual(['09:00', '12:00', '17:30', '18:00'].map(periodoDoHorario), ['Manhã', 'Tarde', 'Tarde', 'Noite']);
  assert.equal(somaDias('2026-11-30', 1), '2026-12-01');
});

test('podeAlterarAgendamento: estado, prazo da loja e o que a API disser', () => {
  const agora = Date.parse('2026-11-18T12:00:00-03:00');
  const ag = (extra) => ({ estado: 'confirmado', inicio: '2026-11-18T16:00:00-03:00', ...extra });
  assert.equal(podeAlterarAgendamento(ag(), 120, agora), true);
  assert.equal(podeAlterarAgendamento(ag(), 300, agora), false, 'faltam 4 h e o prazo é 5 h');
  assert.equal(podeAlterarAgendamento(ag({ estado: 'remarcado' }), 120, agora), true, 'a loja remarcou: o horário segue seguro e o cliente pode cancelar ou remarcar');
  assert.equal(podeAlterarAgendamento(ag({ estado: 'concluido' }), 0, agora), false);
  assert.equal(podeAlterarAgendamento(ag({ estado: 'recusado' }), 0, agora), false);
  assert.equal(podeAlterarAgendamento(ag({ podeCancelar: false }), 0, agora), false);
  assert.equal(podeAlterarAgendamento(ag({ podeCancelar: true }), 999, agora), true);
  assert.equal(podeAlterarAgendamento(ag({ inicio: 'lixo' }), 0, agora), false);
  assert.equal(podeAlterarAgendamento(null, 0, agora), false);
});
