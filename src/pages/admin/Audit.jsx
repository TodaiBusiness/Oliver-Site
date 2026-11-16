import { useMemo, useState } from 'react';
import PanelIcon from '../../components/panel/PanelIcon.jsx';
import PageHead from '../../components/panel/PageHead.jsx';
import DataState from '../../components/panel/DataState.jsx';
import LoadMore from '../../components/panel/LoadMore.jsx';
import { statusLabel } from '../../components/panel/StatusBadge.jsx';
import { formatarDataHora, plural, tempoRelativo } from '../../components/panel/format.js';
import { usePaged } from '../../hooks/useApi.js';
import { api, withQuery } from '../../api/client.js';

/* Mesmos códigos gravados pelo servidor (server/config.js → AUDIT_ACTIONS). */
const ACOES = {
  LOGIN: { label: 'Entrou', tom: 'neutral' },
  LOGIN_FALHOU: { label: 'Login recusado', tom: 'danger' },
  LOGOUT: { label: 'Saiu', tom: 'neutral' },
  USUARIO_CRIADO: { label: 'Conta criada', tom: 'accent' },
  PROJETO_CRIADO: { label: 'Projeto criado', tom: 'accent' },
  PROJETO_EDITADO: { label: 'Projeto editado', tom: 'neutral' },
  PROJETO_EXCLUIDO: { label: 'Projeto excluído', tom: 'danger' },
  PROJETO_VINCULADO: { label: 'Projeto vinculado', tom: 'accent' },
  PROJETO_DESVINCULADO: { label: 'Projeto desvinculado', tom: 'neutral' },
  SOLICITACAO_CRIADA: { label: 'Solicitação aberta', tom: 'accent' },
  SOLICITACAO_STATUS_ALTERADO: { label: 'Status alterado', tom: 'neutral' },
  MENSAGEM_ENVIADA: { label: 'Mensagem enviada', tom: 'neutral' },
};

const TAMANHO = 30;

const CHAVES = { title: 'título', requestId: 'solicitação', de: 'de', para: 'para', cliente: 'cliente', projeto: 'projeto', email: 'e-mail' };
const RECURSOS = { auth: 'Sessão', project: 'Projeto', request: 'Solicitação', message: 'Mensagem', user: 'Usuário', client_project: 'Vínculo', authz: 'Permissão' };
const valorLegivel = (chave, valor) => (chave === 'de' || chave === 'para' ? statusLabel(valor) : valor);

const rotulo = (acao) => ACOES[acao]?.label ?? acao;

/** `details` vem como texto JSON; devolve pares legíveis, sem quebrar se vier lixo. */
function detalhes(bruto) {
  if (!bruto) return [];
  try {
    const obj = JSON.parse(bruto);
    if (obj && typeof obj === 'object') {
      return Object.entries(obj).map(([chave, valor]) => [
        CHAVES[chave] ?? chave,
        valorLegivel(chave, typeof valor === 'object' ? JSON.stringify(valor) : String(valor)),
      ]);
    }
    return [['', String(obj)]];
  } catch {
    return [['', String(bruto)]];
  }
}

export default function AdminAudit() {
  const [acao, setAcao] = useState('');
  const [busca, setBusca] = useState('');

  const lista = usePaged(
    async (page, limit) => (await api.get(withQuery('/admin/audit', { limit, page }))).logs,
    [],
    TAMANHO
  );

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return lista.items.filter((log) => {
      if (acao && log.action !== acao) return false;
      if (!termo) return true;
      const texto = [log.user_name, rotulo(log.action), log.resource_type, log.resource_id, log.details]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return texto.includes(termo);
    });
  }, [lista.items, acao, busca]);

  const filtrando = Boolean(acao || busca);

  return (
    <>
      <PageHead
        title="Auditoria"
        subtitle="Quem fez o quê e quando: logins, projetos, solicitações e mensagens. Senhas e tokens nunca são gravados."
      />

      <div className="toolbar">
        <div className="toolbar__field">
          <label className="field__label" htmlFor="filtro-acao">
            Ação
          </label>
          <select
            id="filtro-acao"
            className="field__control field__control--sm"
            value={acao}
            onChange={(event) => setAcao(event.target.value)}
          >
            <option value="">Todas as ações</option>
            {Object.entries(ACOES).map(([codigo, info]) => (
              <option key={codigo} value={codigo}>
                {info.label}
              </option>
            ))}
          </select>
        </div>

        <div className="toolbar__field toolbar__field--grow">
          <label className="field__label" htmlFor="filtro-busca">
            Buscar nos registros carregados
          </label>
          <div className="search__field">
            <PanelIcon name="search" size={16} />
            <input
              id="filtro-busca"
              type="search"
              className="field__control field__control--sm"
              placeholder="Pessoa, recurso ou detalhe"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
            />
          </div>
        </div>

        {filtrando ? (
          <button
            type="button"
            className="btn btn--soft btn--sm toolbar__clear"
            onClick={() => {
              setAcao('');
              setBusca('');
            }}
          >
            Limpar
          </button>
        ) : null}
      </div>

      {filtrando && !lista.loading && !lista.error ? (
        <p className="search__result" role="status">
          {plural(visiveis.length, 'registro', 'registros')} entre os {lista.items.length} carregados
        </p>
      ) : null}

      <DataState
        loading={lista.loading}
        error={lista.error}
        onRetry={lista.reload}
        skeleton="table"
        skeletonCount={6}
        errorTitle="Não foi possível carregar a auditoria."
        empty={visiveis.length === 0}
        emptyProps={{
          icon: 'clock',
          title: filtrando ? 'Nenhum registro com esse filtro.' : 'Nenhum registro ainda.',
          text: filtrando
            ? lista.hasMore
              ? 'Carregue mais registros ou limpe o filtro.'
              : 'Tente outra ação ou outro termo.'
            : 'As ações no sistema passam a aparecer aqui.',
        }}
      >
        <div className="table-wrap">
          <table className="table table--audit">
            <caption className="sr-only">Registros de auditoria, do mais recente ao mais antigo</caption>
            <thead>
              <tr>
                <th scope="col">Quando</th>
                <th scope="col">Quem</th>
                <th scope="col">Ação</th>
                <th scope="col">Recurso</th>
                <th scope="col">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((log) => {
                const info = ACOES[log.action];
                const pares = detalhes(log.details);
                return (
                  <tr key={log.id}>
                    <td data-label="Quando">
                      <time className="table__stack" dateTime={new Date(Number(log.created_at)).toISOString()}>
                        <span>{formatarDataHora(log.created_at)}</span>
                        <span className="table__muted">{tempoRelativo(log.created_at)}</span>
                      </time>
                    </td>
                    <td data-label="Quem">{log.user_name ?? <span className="table__muted">Visitante</span>}</td>
                    <td data-label="Ação">
                      <span className={`tag-action tag-action--${info?.tom ?? 'neutral'}`}>{rotulo(log.action)}</span>
                    </td>
                    <td data-label="Recurso">
                      {log.resource_type ? (
                        <span className="table__stack">
                          <span>{RECURSOS[log.resource_type] ?? log.resource_type}</span>
                          {log.resource_id ? <span className="table__muted">#{log.resource_id}</span> : null}
                        </span>
                      ) : (
                        <span className="table__muted">—</span>
                      )}
                    </td>
                    <td data-label="Detalhes">
                      {pares.length ? (
                        <dl className="kv">
                          {pares.map(([chave, valor]) => (
                            <div key={chave + valor}>
                              {chave ? <dt>{chave}</dt> : null}
                              <dd>{valor}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <span className="table__muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <LoadMore
          hasMore={lista.hasMore}
          loading={lista.loadingMore}
          error={lista.moreError}
          onClick={lista.loadMore}
          shown={lista.items.length}
        />
      </DataState>
    </>
  );
}
