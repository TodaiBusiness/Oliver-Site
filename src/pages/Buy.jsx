import { useState } from 'react';
import { Link } from 'react-router-dom';
import SiteShell from '../components/SiteShell.jsx';
import Field from '../components/panel/Field.jsx';
import Icon from '../components/Icon.jsx';
import { api, ApiError } from '../api/client.js';
import { PLAN, formatBRL, monthlyPrice } from '../../shared/plan.js';
import { isValidTaxId, formatTaxId } from '../../shared/taxId.js';
import { createWhatsAppLink, whatsappLinkProps } from '../utils/contact.js';
import { WHATSAPP_MESSAGES } from '../data/company.js';
import { PRODUCT } from '../data/product.js';
import { safeCheckoutUrl } from '../utils/checkoutUrl.js';

const VAZIO = {
  companyName: '',
  contactName: '',
  taxId: '',
  email: '',
  phone: '',
  devices: 1,
  acceptTerms: false,
};

/** O servidor nomeia os campos como o formulário; comparar em minúsculas evita perder um erro por causa da inicial. */
function normalizeErrors(details) {
  if (!details || typeof details !== 'object') return {};
  const normalized = {};
  for (const [key, value] of Object.entries(details)) {
    normalized[key.toLowerCase()] = Array.isArray(value) ? value[0] : value;
  }
  return normalized;
}

export default function Buy() {
  const [values, setValues] = useState(VAZIO);
  const [errors, setErrors] = useState({});
  const [problem, setProblem] = useState(null);
  const [sending, setSending] = useState(false);

  const devices = Number(values.devices);
  const extra = Math.max(0, devices - PLAN.includedDevices);
  const total = monthlyPrice(devices);

  const update = (field) => (event) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [field]: value }));
  };

  const errorFor = (field) => errors[field.toLowerCase()];

  function checkLocally() {
    const found = {};
    if (values.companyName.trim().length < 2) found.companyname = 'Informe o nome da empresa.';
    if (values.contactName.trim().length < 2) found.contactname = 'Informe o seu nome.';
    if (!isValidTaxId(values.taxId)) found.taxid = 'Confira o CPF ou o CNPJ.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) {
      found.email = 'Confira o e-mail: é para onde enviamos o código.';
    }
    if (values.phone.replace(/\D/g, '').length < 8) found.phone = 'Informe um telefone com DDD.';
    if (!values.acceptTerms) found.acceptterms = 'Aceite os termos para continuar.';
    return found;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (sending) return;

    const local = checkLocally();
    setProblem(null);
    if (Object.keys(local).length > 0) {
      setErrors(local);
      return;
    }

    setSending(true);
    /* Redirecionando: o botão fica desabilitado até a página trocar, senão dá
       para clicar de novo e criar um segundo pedido. */
    let redirecting = false;
    setErrors({});

    try {
      const result = await api.post('/checkout', {
        companyName: values.companyName,
        contactName: values.contactName,
        taxId: values.taxId,
        email: values.email,
        phone: values.phone,
        devices,
        acceptTerms: true,
      });

      const target = safeCheckoutUrl(result.checkoutUrl);
      if (!target) {
        setProblem('Não conseguimos abrir o pagamento agora. Tente de novo ou fale com a gente pelo WhatsApp.');
        return;
      }
      /* Sai do site de propósito: o pagamento acontece no Mercado Pago. */
      redirecting = true;
      window.location.assign(target);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 400 && failure.details) {
        setErrors(normalizeErrors(failure.details));
        setProblem(null);
      } else {
        setProblem(
          failure instanceof ApiError
            ? failure.message
            : 'Não foi possível iniciar a compra agora. Tente de novo em instantes.'
        );
      }
    } finally {
      if (!redirecting) setSending(false);
    }
  }

  return (
    <SiteShell>
      <div className="buy">
        <div>
          <h1 className="buy__title">Comece a usar o {PRODUCT.name} hoje.</h1>
          <p className="buy__lead">
            Preencha os dados da empresa e pague pelo Mercado Pago. Assim que o
            pagamento for confirmado, enviamos por e-mail o código de ativação
            e o link do instalador.
          </p>

          <form className="form-card buy__form" onSubmit={handleSubmit} noValidate>
            {problem ? (
              <div className="alert alert--error" role="alert">
                <Icon name="close" size={16} />
                {problem}
              </div>
            ) : null}

            <Field
              id="compra-empresa"
              label="Nome da empresa"
              name="companyName"
              value={values.companyName}
              onChange={update('companyName')}
              error={errorFor('companyName')}
              autoComplete="organization"
              maxLength={120}
              required
            />

            <div className="form-card__row">
              <Field
                id="compra-nome"
                label="Seu nome"
                name="contactName"
                value={values.contactName}
                onChange={update('contactName')}
                error={errorFor('contactName')}
                autoComplete="name"
                maxLength={120}
                required
              />
              <Field
                id="compra-documento"
                label="CPF ou CNPJ"
                name="taxId"
                inputMode="numeric"
                value={values.taxId}
                onChange={update('taxId')}
                onBlur={() =>
                  setValues((current) => ({ ...current, taxId: formatTaxId(current.taxId) }))
                }
                error={errorFor('taxId')}
                autoComplete="off"
                maxLength={18}
                required
              />
            </div>

            <div className="form-card__row">
              <Field
                id="compra-email"
                label="E-mail"
                type="email"
                name="email"
                value={values.email}
                onChange={update('email')}
                error={errorFor('email')}
                hint="O código de ativação será enviado para este endereço."
                autoComplete="email"
                maxLength={190}
                required
              />
              <Field
                id="compra-telefone"
                label="Telefone com DDD"
                type="tel"
                name="phone"
                value={values.phone}
                onChange={update('phone')}
                error={errorFor('phone')}
                autoComplete="tel"
                maxLength={30}
                required
              />
            </div>

            <Field
              id="compra-computadores"
              label="Computadores (caixas) com o sistema"
              error={errorFor('devices')}
              hint={`O primeiro está incluído. Cada computador a mais custa ${formatBRL(PLAN.extraDevicePrice)} por mês.`}
            >
              <select
                id="compra-computadores"
                className="field__control"
                name="devices"
                value={values.devices}
                onChange={update('devices')}
                aria-describedby="compra-computadores-dica"
              >
                {Array.from({ length: PLAN.maxDevices }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>
                    {count} {count === 1 ? 'computador' : 'computadores'}
                  </option>
                ))}
              </select>
            </Field>

            <div>
              <label className={`check${errorFor('acceptTerms') ? ' check--error' : ''}`}>
                <input
                  type="checkbox"
                  checked={values.acceptTerms}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, acceptTerms: event.target.checked }))
                  }
                />
                <span>
                  Li e aceito os{' '}
                  <Link to="/termos" target="_blank">Termos de uso</Link> e a{' '}
                  <Link to="/privacidade" target="_blank">Política de privacidade</Link>.
                </span>
              </label>
              {errorFor('acceptTerms') ? (
                <p className="field__error" role="alert">{errorFor('acceptTerms')}</p>
              ) : null}
            </div>

            <button type="submit" className="btn btn--primary btn--lg" disabled={sending}>
              {sending ? 'Abrindo o pagamento…' : 'Ir para o pagamento'}
              {sending ? null : <Icon name="arrowRight" size={17} />}
            </button>
          </form>
        </div>

        <aside className="buy__summary" aria-label="Resumo do pedido">
          <p className="buy__plan">{PLAN.name}</p>
          <p className="buy__price">
            <strong>{formatBRL(total)}</strong>
            <span>por mês</span>
          </p>
          <ul className="buy__breakdown">
            <li>
              <span>Plano base (1 computador)</span>
              <strong>{formatBRL(PLAN.basePrice)}</strong>
            </li>
            <li>
              <span>
                {extra} {extra === 1 ? 'computador extra' : 'computadores extras'}
              </span>
              <strong>{formatBRL(extra * PLAN.extraDevicePrice)}</strong>
            </li>
          </ul>
          <p className="buy__legal">
            Cobrança mensal recorrente no cartão, pelo Mercado Pago. Prefere
            pagar de outro jeito?{' '}
            <a
              href={createWhatsAppLink(WHATSAPP_MESSAGES.contact)}
              {...whatsappLinkProps}
            >
              Fale com a gente
            </a>
            . O valor final é calculado pelo servidor na hora da cobrança.
          </p>
        </aside>
      </div>
    </SiteShell>
  );
}
