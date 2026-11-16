import { useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon.jsx';
import Field, { FormErrors } from '../../components/panel/Field.jsx';
import PageHead from '../../components/panel/PageHead.jsx';
import DataState from '../../components/panel/DataState.jsx';
import StatusBadge from '../../components/panel/StatusBadge.jsx';
import { useToast } from '../../components/panel/Toast.jsx';
import { tempoRelativo } from '../../components/panel/format.js';
import { useApi } from '../../hooks/useApi.js';
import { api } from '../../api/client.js';

/** Os mesmos tipos aceitos pelo servidor (validados lá também). */
const TIPOS = ['Sistema / ERP', 'Site', 'Aplicação Web', 'Automação', 'Integração', 'Banco de Dados', 'Outro'];

const VAZIO = { type: '', description: '', budget: '', deadline: '' };

export default function ClientRequests() {
  const toast = useToast();
  const { data, loading, error, reload } = useApi(() => api.get('/me/requests'));

  const [form, setForm] = useState(VAZIO);
  const [errors, setErrors] = useState({});
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);

  const update = (campo) => (event) => setForm((atual) => ({ ...atual, [campo]: event.target.value }));

  const enviar = async (event) => {
    event.preventDefault();
    setErro(null);
    setErrors({});
    setEnviando(true);

    try {
      await api.post('/me/requests', form);
      setForm(VAZIO);
      toast.success('Solicitação enviada. Vamos responder por aqui.');
      reload();
    } catch (problema) {
      setErrors(problema.details ?? {});
      setErro(problema.details ? null : problema.message);
    } finally {
      setEnviando(false);
    }
  };

  const lista = data?.requests ?? [];

  return (
    <>
      <PageHead
        title="Solicitações"
        subtitle="Conte o que precisa desenvolver. A conversa continua dentro de cada solicitação."
      />

      <div className="detail-grid detail-grid--form">
        <section className="block" aria-labelledby="nova">
          <h2 className="block__title" id="nova">
            Nova solicitação
          </h2>

          <form className="form-card" onSubmit={enviar} noValidate>
            <FormErrors errors={errors} message={erro} />

            <Field id="type" label="Tipo de projeto" error={errors.type}>
              <select id="type" className="field__control" value={form.type} onChange={update('type')} required>
                <option value="">Selecione…</option>
                {TIPOS.map((tipo) => (
                  <option key={tipo} value={tipo}>
                    {tipo}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              id="description"
              label="O que você precisa"
              as="textarea"
              rows={4}
              value={form.description}
              onChange={update('description')}
              error={errors.description}
              hint="Ao menos 10 caracteres. Quanto mais contexto, melhor a resposta."
              required
            />

            <div className="form-card__row">
              <Field
                id="budget"
                label="Orçamento estimado"
                value={form.budget}
                onChange={update('budget')}
                error={errors.budget}
                hint="Opcional"
              />
              <Field
                id="deadline"
                label="Prazo desejado"
                value={form.deadline}
                onChange={update('deadline')}
                error={errors.deadline}
                hint="Opcional"
              />
            </div>

            <button type="submit" className="btn btn--primary" disabled={enviando}>
              {enviando ? 'Enviando…' : 'Enviar solicitação'}
              <Icon name="arrowRight" size={16} className="btn__icon" />
            </button>
          </form>
        </section>

        <section className="block" aria-labelledby="suas">
          <h2 className="block__title" id="suas">
            Suas solicitações
          </h2>

          <DataState
            loading={loading}
            error={error}
            onRetry={reload}
            errorTitle="Não foi possível carregar suas solicitações."
            empty={lista.length === 0}
            emptyProps={{
              icon: 'chat',
              title: 'Nenhuma solicitação ainda.',
              text: 'Use o formulário para abrir a primeira.',
            }}
          >
            <ul className="rows">
              {lista.map((item) => (
                <li key={item.id}>
                  <Link className="row" to={`/cliente/solicitacoes/${item.id}`}>
                    <span className="row__main">
                      <span className="row__title">{item.type}</span>
                      <span className="row__text">{item.description}</span>
                      <span className="row__meta">{tempoRelativo(item.created_at)}</span>
                    </span>
                    <StatusBadge status={item.status} />
                    <Icon name="arrowRight" size={16} className="row__arrow" />
                  </Link>
                </li>
              ))}
            </ul>
          </DataState>
        </section>
      </div>
    </>
  );
}
