import { useState } from 'react';
import Icon from './Icon.jsx';
import Field from './panel/Field.jsx';
import { api, ApiError } from '../api/client.js';
import { EVENTS, track } from '../utils/analytics.js';

/**
 * Pedido de orçamento formal. Diferente do funil ao lado, que só abre o
 * WhatsApp com a mensagem pronta: aqui o pedido é registrado de verdade e
 * aparece no painel da TODAI, com histórico e resposta.
 *
 * Não exige conta — quem pede orçamento ainda não é cliente.
 */

const VAZIO = {
  requesterName: '',
  requesterEmail: '',
  requesterPhone: '',
  company: '',
  subject: '',
  description: '',
};

/**
 * O servidor devolve os campos como os nomeia (`requesterName`); um 400 vindo
 * da API central usa a convenção dela (`RequesterName`). Comparar em minúsculas
 * evita que o erro deixe de aparecer só por causa da inicial.
 */
function normalizeErrors(details) {
  if (!details || typeof details !== 'object') return {};

  const normalized = {};
  for (const [key, value] of Object.entries(details)) {
    normalized[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  }
  return normalized;
}

export default function QuoteForm() {
  const [values, setValues] = useState(VAZIO);
  const [errors, setErrors] = useState({});
  const [problem, setProblem] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const update = (field) => (event) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [field]: value }));
  };

  const errorFor = (field) => errors[field.toLowerCase()];

  async function handleSubmit(event) {
    event.preventDefault();
    if (sending) return;

    setSending(true);
    setErrors({});
    setProblem(null);

    try {
      await api.post('/quote-requests', values);
      track(EVENTS.QUOTE_REQUEST_SENT);
      setSent(true);
      setValues(VAZIO);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 400) {
        setErrors(normalizeErrors(failure.details));
        /* Sem detalhe por campo o formulário não destacaria nada e pareceria
           que o botão não funcionou. */
        if (!failure.details) setProblem(failure.message);
      } else {
        setProblem(
          failure instanceof ApiError
            ? failure.message
            : 'Não foi possível enviar agora. Tente de novo em instantes.'
        );
      }
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="form-card">
        <div className="alert alert--success" role="status">
          <Icon name="check" size={16} />
          Pedido recebido. Entramos em contato pelo e-mail informado.
        </div>

        <button
          type="button"
          className="btn btn--soft btn--xs"
          onClick={() => setSent(false)}
        >
          <Icon name="refresh" size={14} />
          Enviar outro pedido
        </button>
      </div>
    );
  }

  return (
    <form className="form-card" onSubmit={handleSubmit} noValidate>
      {problem ? (
        <div className="alert alert--error" role="alert">
          <Icon name="close" size={16} />
          {problem}
        </div>
      ) : null}

      <div className="form-card__row">
        <Field
          id="orcamento-nome"
          label="Seu nome"
          name="requesterName"
          value={values.requesterName}
          onChange={update('requesterName')}
          error={errorFor('requesterName')}
          autoComplete="name"
          maxLength={120}
          required
        />

        <Field
          id="orcamento-email"
          label="E-mail"
          type="email"
          name="requesterEmail"
          value={values.requesterEmail}
          onChange={update('requesterEmail')}
          error={errorFor('requesterEmail')}
          autoComplete="email"
          maxLength={190}
          required
        />
      </div>

      <div className="form-card__row">
        <Field
          id="orcamento-telefone"
          label="Telefone (opcional)"
          name="requesterPhone"
          value={values.requesterPhone}
          onChange={update('requesterPhone')}
          error={errorFor('requesterPhone')}
          autoComplete="tel"
          maxLength={30}
        />

        <Field
          id="orcamento-empresa"
          label="Empresa (opcional)"
          name="company"
          value={values.company}
          onChange={update('company')}
          error={errorFor('company')}
          autoComplete="organization"
          maxLength={120}
        />
      </div>

      <Field
        id="orcamento-assunto"
        label="Assunto"
        name="subject"
        value={values.subject}
        onChange={update('subject')}
        error={errorFor('subject')}
        placeholder="Ex.: sistema de estoque para duas lojas"
        maxLength={200}
        required
      />

      <Field
        id="orcamento-descricao"
        label="O que você precisa"
        as="textarea"
        name="description"
        rows={5}
        value={values.description}
        onChange={update('description')}
        error={errorFor('description')}
        hint="Quanto mais detalhe, mais preciso o orçamento."
        maxLength={5000}
        required
      />

      <button type="submit" className="btn btn--primary" disabled={sending}>
        {sending ? 'Enviando…' : 'Pedir orçamento'}
      </button>
    </form>
  );
}
