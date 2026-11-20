import { Link } from 'react-router-dom';
import Field from '../panel/Field.jsx';
import AnimatedPrice from './AnimatedPrice.jsx';
import { PLAN, formatBRL, monthlyPrice } from '../../../shared/plan.js';
import { formatTaxId } from '../../../shared/taxId.js';

export default function StepCompany({ values, errors, set, setValues }) {
  const total = monthlyPrice(values.devices);
  const field = (name) => ({
    name,
    value: values[name],
    onChange: (event) => set(name, event.target.value),
    error: errors[name],
  });

  return (
    <div className="sub-form">
      <Field id="sub-empresa" label="Nome da empresa" autoComplete="organization" maxLength={120} required {...field('companyName')} />
      <div className="sub-form__row">
        <Field id="sub-nome" label="Seu nome" autoComplete="name" maxLength={120} required {...field('contactName')} />
        <Field
          id="sub-documento"
          label="CPF ou CNPJ"
          inputMode="numeric"
          autoComplete="off"
          maxLength={18}
          required
          {...field('taxId')}
          onBlur={() => setValues((c) => ({ ...c, taxId: formatTaxId(c.taxId) }))}
        />
      </div>
      <div className="sub-form__row">
        <Field
          id="sub-email"
          label="E-mail"
          type="email"
          autoComplete="email"
          maxLength={190}
          hint="Para onde enviamos o código de ativação."
          required
          {...field('email')}
        />
        <Field id="sub-telefone" label="Telefone com DDD" type="tel" autoComplete="tel" maxLength={30} required {...field('phone')} />
      </div>

      <div className="sub-devices">
        <Field
          id="sub-computadores"
          label="Computadores (caixas) com o sistema"
          error={errors.devices}
          hint={`O primeiro está incluído. Cada computador a mais custa ${formatBRL(PLAN.extraDevicePrice)} por mês.`}
        >
          <select
            id="sub-computadores"
            className="field__control"
            name="devices"
            value={values.devices}
            onChange={(event) => set('devices', Number(event.target.value))}
          >
            {Array.from({ length: PLAN.maxDevices }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n} {n === 1 ? 'computador' : 'computadores'}
              </option>
            ))}
          </select>
        </Field>
        <p className="sub-devices__price" aria-live="polite">
          <AnimatedPrice value={total} className="sub-devices__value" />
          <span>por mês</span>
        </p>
      </div>

      <div>
        <label className={`check${errors.acceptTerms ? ' check--error' : ''}`}>
          <input
            type="checkbox"
            checked={values.acceptTerms}
            onChange={(event) => set('acceptTerms', event.target.checked)}
            aria-invalid={errors.acceptTerms ? 'true' : undefined}
          />
          <span>
            Li e aceito os <Link to="/termos" target="_blank">Termos de uso</Link> e a{' '}
            <Link to="/privacidade" target="_blank">Política de privacidade</Link>.
          </span>
        </label>
        {errors.acceptTerms ? <p className="field__error">{errors.acceptTerms}</p> : null}
      </div>
    </div>
  );
}
