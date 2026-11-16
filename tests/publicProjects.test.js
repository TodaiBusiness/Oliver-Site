/* P-003: a home mostra os projetos do admin e cai no arquivo estático quando a
   API não tem nenhum. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLACEHOLDER_IMAGE, fromApi, pickProjects } from '../src/utils/publicProjects.js';

const FALLBACK = [
  { id: 'erp', title: 'Sistema', featured: true, technologies: [] },
  { id: 'site', title: 'Site', technologies: [] },
];

test('projeto da API vira o formato da home, com status legível e imagem de reserva', () => {
  const project = fromApi({
    id: 7,
    title: ' PDV da Gigi ',
    status: 'EM_DESENVOLVIMENTO',
    technologies: ['C#'],
    image: null,
    isMockup: 1,
    description: 'Descrição',
  });

  assert.equal(project.id, 'api-7');
  assert.equal(project.title, 'PDV da Gigi');
  assert.equal(project.status, 'Em desenvolvimento');
  assert.equal(project.image, PLACEHOLDER_IMAGE);
  assert.equal(project.solution, 'Descrição');
  assert.deepEqual(project.technologies, ['C#']);
  assert.equal(project.isMockup, true);
  assert.deepEqual(project.gallery, []);
});

test('com projetos na API, o destaque vem dela', () => {
  const picked = pickProjects(
    [
      { id: 1, title: 'Comum', featured: false },
      { id: 2, title: 'Destaque', featured: true },
    ],
    FALLBACK
  );

  assert.equal(picked.fromApi, true);
  assert.equal(picked.featured.title, 'Destaque');
  assert.deepEqual(picked.others.map((p) => p.title), ['Comum']);
});

test('sem projetos públicos, lista inválida ou só itens sem título, usa a reserva', () => {
  for (const api of [[], null, undefined, 'erro', [{ id: 3, title: '' }]]) {
    const picked = pickProjects(api, FALLBACK);
    assert.equal(picked.fromApi, false);
    assert.equal(picked.featured.id, 'erp');
    assert.deepEqual(picked.others.map((p) => p.id), ['site']);
  }
});

test('os projetos do arquivo estático usam só status que existem no admin', async () => {
  const { projects } = await import('../src/data/projects.js');
  const validos = ['RASCUNHO', 'EM_DESENVOLVIMENTO', 'ENTREGUE'].map((status) => fromApi({ id: 'x', title: 'x', status }).status);
  for (const projeto of projects) assert.ok(validos.includes(projeto.status), `${projeto.id}: "${projeto.status}"`);
});
