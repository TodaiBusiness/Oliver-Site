import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import PanelIcon from '../../components/panel/PanelIcon.jsx';
import PageHead from '../../components/panel/PageHead.jsx';
import DataState from '../../components/panel/DataState.jsx';
import LoadMore from '../../components/panel/LoadMore.jsx';
import Drawer from '../../components/panel/Drawer.jsx';
import ChipInput from '../../components/panel/ChipInput.jsx';
import Field, { FormErrors } from '../../components/panel/Field.jsx';
import StatusBadge, { statusLabel } from '../../components/panel/StatusBadge.jsx';
import ConfirmDialog from '../../components/panel/ConfirmDialog.jsx';
import { useToast } from '../../components/panel/Toast.jsx';
import { usePaged } from '../../hooks/useApi.js';
import { api, withQuery } from '../../api/client.js';

const STATUS = ['RASCUNHO', 'EM_DESENVOLVIMENTO', 'ENTREGUE'];
const TAMANHO = 20;

const VAZIO = {
  title: '',
  tagline: '',
  category: '',
  problem: '',
  solution: '',
  features: [],
  technologies: [],
  image: '',
  link: '',
  status: 'RASCUNHO',
  featured: false,
  isMockup: true,
  isPublic: true,
};

const lista_ = (valor) => (Array.isArray(valor) ? valor : []);

export default function AdminProjects() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const projetos = usePaged(
    async (page, limit) => (await api.get(withQuery('/admin/projects', { limit, page }))).projects,
    [],
    TAMANHO
  );

  const [filtro, setFiltro] = useState('');
  const [busca, setBusca] = useState('');

  const [form, setForm] = useState(VAZIO);
  const [editandoId, setEditandoId] = useState(null);
  const [aberto, setAberto] = useState(false);
  const [errors, setErrors] = useState({});
  const [erro, setErro] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [paraExcluir, setParaExcluir] = useState(null);

  const update = (campo) => (event) => {
    const valor = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((atual) => ({ ...atual, [campo]: valor }));
  };

  const novo = () => {
    setForm(VAZIO);
    setEditandoId(null);
    setErrors({});
    setErro(null);
    setAberto(true);
  };

  /* Atalho do dashboard: /admin/projetos?novo=1 já abre o formulário. */
  useEffect(() => {
    if (params.get('novo')) {
      novo();
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const editar = (projeto) => {
    setForm({
      title: projeto.title ?? '',
      tagline: projeto.tagline ?? '',
      category: projeto.category ?? '',
      problem: projeto.problem ?? '',
      solution: projeto.solution ?? '',
      features: lista_(projeto.features),
      technologies: lista_(projeto.technologies),
      image: projeto.image ?? '',
      link: projeto.link ?? '',
      status: projeto.status ?? 'RASCUNHO',
      featured: Boolean(projeto.featured),
      isMockup: Boolean(projeto.isMockup),
      isPublic: Boolean(projeto.isPublic),
    });
    setEditandoId(projeto.id);
    setErrors({});
    setErro(null);
    setAberto(true);
  };

  const salvar = async (event) => {
    event.preventDefault();
    setErrors({});
    setErro(null);
    setSalvando(true);

    try {
      if (editandoId) {
        await api.put(`/admin/projects/${editandoId}`, form);
      } else {
        await api.post('/admin/projects', form);
      }
      setAberto(false);
      toast.success(editandoId ? 'Projeto atualizado.' : 'Projeto criado.');
      projetos.reload();
    } catch (problema) {
      setErrors(problema.details ?? {});
      setErro(problema.details ? null : problema.message);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    const alvo = paraExcluir;
    setParaExcluir(null);
    try {
      await api.delete(`/admin/projects/${alvo.id}`);
      toast.success(`“${alvo.title}” foi excluído.`);
      projetos.reload();
    } catch (problema) {
      toast.error(`Não foi possível excluir. ${problema.message}`);
    }
  };

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return projetos.items.filter(
      (p) =>
        (!filtro || p.status === filtro) &&
        (!termo || [p.title, p.category].some((c) => c?.toLowerCase().includes(termo)))
    );
  }, [projetos.items, filtro, busca]);

  const filtrando = Boolean(filtro || busca);
  const limpar = () => {
    setFiltro('');
    setBusca('');
  };

  return (
    <>
      <PageHead
        title="Projetos"
        subtitle="O que estiver publicado aparece no site, sem precisar mexer no código."
        actions={
          <button type="button" className="btn btn--primary btn--sm" onClick={novo}>
            <PanelIcon name="plus" size={16} />
            Novo projeto
          </button>
        }
      />

      <div className="toolbar">
        <div className="filters" role="group" aria-label="Filtrar por status">
          <button
            type="button"
            className={`chip${filtro === '' ? ' is-active' : ''}`}
            aria-pressed={filtro === ''}
            onClick={() => setFiltro('')}
          >
            Todos
          </button>
          {STATUS.map((status) => (
            <button
              key={status}
              type="button"
              className={`chip${filtro === status ? ' is-active' : ''}`}
              aria-pressed={filtro === status}
              onClick={() => setFiltro(status)}
            >
              {statusLabel(status)}
            </button>
          ))}
        </div>

        <div className="search__field toolbar__search">
          <PanelIcon name="search" size={16} />
          <label className="sr-only" htmlFor="busca-proj">
            Filtrar projetos por título ou categoria
          </label>
          <input
            id="busca-proj"
            type="search"
            className="field__control"
            placeholder="Filtrar por título ou categoria"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />
        </div>
      </div>

      <DataState
        loading={projetos.loading}
        error={projetos.error}
        onRetry={projetos.reload}
        skeleton="table"
        errorTitle="Não foi possível carregar os projetos."
        empty={visiveis.length === 0}
        emptyProps={{
          icon: 'layers',
          title: filtrando ? 'Nenhum projeto com esse filtro.' : 'Nenhum projeto cadastrado.',
          text: filtrando ? 'Ajuste o status ou o termo da busca.' : 'Crie o primeiro para ele aparecer no site.',
          action: filtrando ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={limpar}>
              Limpar filtros
            </button>
          ) : (
            <button type="button" className="btn btn--primary btn--sm" onClick={novo}>
              Novo projeto
            </button>
          ),
        }}
      >
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Projetos cadastrados</caption>
            <thead>
              <tr>
                <th scope="col">Projeto</th>
                <th scope="col">Status</th>
                <th scope="col">No site</th>
                <th scope="col">Ações</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((projeto) => (
                <tr key={projeto.id}>
                  <td data-label="Projeto">
                    <span className="table__stack">
                      <strong>{projeto.title}</strong>
                      <span className="table__muted">
                        {projeto.category ?? 'sem categoria'}
                        {projeto.featured ? ' · destaque' : ''}
                      </span>
                    </span>
                  </td>
                  <td data-label="Status">
                    <StatusBadge status={projeto.status} />
                  </td>
                  <td data-label="No site">
                    {projeto.isPublic ? (
                      <span className="table__yes">
                        <Icon name="check" size={14} /> Publicado
                      </span>
                    ) : (
                      <span className="table__muted">Oculto</span>
                    )}
                  </td>
                  <td data-label="Ações">
                    <div className="table__actions">
                      <button
                        type="button"
                        className="btn btn--soft btn--xs"
                        onClick={() => editar(projeto)}
                        aria-label={`Editar ${projeto.title}`}
                      >
                        <PanelIcon name="edit" size={14} />
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger-soft btn--xs"
                        onClick={() => setParaExcluir(projeto)}
                        aria-label={`Excluir ${projeto.title}`}
                      >
                        <PanelIcon name="trash" size={14} />
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <LoadMore
          hasMore={projetos.hasMore}
          loading={projetos.loadingMore}
          error={projetos.moreError}
          onClick={projetos.loadMore}
          shown={projetos.items.length}
        />
      </DataState>

      <Drawer
        open={aberto}
        onClose={() => setAberto(false)}
        title={editandoId ? 'Editar projeto' : 'Novo projeto'}
        description="Publicado, ele aparece no site e no painel dos clientes vinculados."
        titleId="projeto-drawer"
        footer={
          <>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setAberto(false)}>
              Cancelar
            </button>
            <button type="submit" form="form-projeto" className="btn btn--primary btn--sm" disabled={salvando}>
              {salvando ? 'Salvando…' : editandoId ? 'Salvar alterações' : 'Criar projeto'}
            </button>
          </>
        }
      >
        <form id="form-projeto" className="drawer-form" onSubmit={salvar} noValidate>
          <FormErrors errors={errors} message={erro} />

          <Field id="title" label="Título" value={form.title} onChange={update('title')} error={errors.title} required />

          <div className="form-card__row">
            <Field
              id="category"
              label="Categoria"
              value={form.category}
              onChange={update('category')}
              error={errors.category}
              hint="Ex.: Sistema Desktop, Web, Automação"
            />
            <Field id="status" label="Status" error={errors.status}>
              <select id="status" className="field__control" value={form.status} onChange={update('status')}>
                {STATUS.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field
            id="tagline"
            label="Resumo"
            value={form.tagline}
            onChange={update('tagline')}
            error={errors.tagline}
            hint="Uma linha que aparece no card do site."
          />

          <Field id="problem" label="Problema" as="textarea" rows={3} value={form.problem} onChange={update('problem')} error={errors.problem} />
          <Field id="solution" label="Solução" as="textarea" rows={3} value={form.solution} onChange={update('solution')} error={errors.solution} />

          <ChipInput
            id="features"
            label="Funcionalidades"
            value={form.features}
            onChange={(valor) => setForm((atual) => ({ ...atual, features: valor }))}
            placeholder="Digite e tecle Enter"
            hint="Uma por vez: Estoque, PDV, Comandas."
          />
          <ChipInput
            id="technologies"
            label="Tecnologias"
            value={form.technologies}
            onChange={(valor) => setForm((atual) => ({ ...atual, technologies: valor }))}
            placeholder="Digite e tecle Enter"
            hint="Ex.: C#, PostgreSQL."
          />

          <div className="form-card__row">
            <Field
              id="image"
              label="Imagem"
              value={form.image}
              onChange={update('image')}
              error={errors.image}
              hint="Caminho em /public, ex.: /projects/erp.svg"
            />
            <Field
              id="link"
              label="Link do projeto"
              value={form.link}
              onChange={update('link')}
              error={errors.link}
              hint="Só http:// ou https://."
            />
          </div>

          <fieldset className="switches">
            <legend className="field__label">Exibição</legend>
            <label className="switch">
              <input type="checkbox" checked={form.isPublic} onChange={update('isPublic')} />
              <span>Publicado no site</span>
            </label>
            <label className="switch">
              <input type="checkbox" checked={form.featured} onChange={update('featured')} />
              <span>Projeto em destaque</span>
            </label>
            <label className="switch">
              <input type="checkbox" checked={form.isMockup} onChange={update('isMockup')} />
              <span>A imagem é mockup ilustrativo</span>
            </label>
          </fieldset>
        </form>
      </Drawer>

      <ConfirmDialog
        open={Boolean(paraExcluir)}
        title="Excluir projeto?"
        message={
          paraExcluir
            ? `“${paraExcluir.title}” será removido do site e do painel. Esta ação não pode ser desfeita.`
            : ''
        }
        confirmLabel="Excluir"
        onConfirm={excluir}
        onCancel={() => setParaExcluir(null)}
      />
    </>
  );
}
