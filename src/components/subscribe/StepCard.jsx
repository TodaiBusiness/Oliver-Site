import { useState } from 'react';
import Field from '../panel/Field.jsx';
import CardPreview from './CardPreview.jsx';
import {
  BRAND_LABEL, cardBrand, cardNumberProblem, ccvProblem, expiryProblem, formatCardNumber,
  formatExpiry, formatPostalCode, parseExpiry, postalCodeProblem,
} from '../../../shared/billing.js';

/** Erro de cada campo do cartão, ou undefined. */
export function cardErrors(card) {
  const brand = cardBrand(card.number);
  const exp = parseExpiry(card.expiry);
  return {
    'card.number': cardNumberProblem(card.number) || undefined,
    'card.holderName': card.holderName.trim().length < 2 ? 'Informe o nome como está no cartão.' : undefined,
    'card.expiryMonth': (exp ? expiryProblem(exp.month, exp.year) : 'Informe a validade como MM/AA.') || undefined,
    'card.ccv': ccvProblem(card.ccv, brand) || undefined,
    'holder.postalCode': postalCodeProblem(card.postalCode) || undefined,
    'holder.addressNumber': !card.addressNumber.trim() ? 'Informe o número (ou S/N).' : undefined,
  };
}

export default function StepCard({ card, setCard, serverErrors, submitted }) {
  const [touched, setTouched] = useState({});
  const [flipped, setFlipped] = useState(false);
  const brand = cardBrand(card.number);
  const local = cardErrors(card);
  const err = (key) => serverErrors[key] || (touched[key] || submitted ? local[key] : undefined);
  const blur = (key) => () => setTouched((t) => ({ ...t, [key]: true }));

  return (
    <div className="sub-cardstep">
      <CardPreview number={card.number} name={card.holderName.toUpperCase()} expiry={card.expiry} ccv={card.ccv} brand={brand} flipped={flipped} />

      <div className="sub-form">
        <Field
          id="sub-cc-numero"
          label="Número do cartão"
          name="cardnumber"
          inputMode="numeric"
          autoComplete="cc-number"
          maxLength={23}
          value={formatCardNumber(card.number)}
          onChange={(e) => setCard('number', e.target.value.replace(/\D/g, '').slice(0, 19))}
          onBlur={blur('card.number')}
          error={err('card.number')}
          hint={brand ? `Bandeira: ${BRAND_LABEL[brand]}` : undefined}
          required
        />
        <Field
          id="sub-cc-nome"
          label="Nome impresso no cartão"
          name="ccname"
          autoComplete="cc-name"
          maxLength={60}
          value={card.holderName}
          onChange={(e) => setCard('holderName', e.target.value)}
          onBlur={blur('card.holderName')}
          error={err('card.holderName')}
          required
        />
        <div className="sub-form__row">
          <Field
            id="sub-cc-validade"
            label="Validade (MM/AA)"
            name="cc-exp"
            inputMode="numeric"
            autoComplete="cc-exp"
            placeholder="MM/AA"
            maxLength={5}
            value={card.expiry}
            onChange={(e) => setCard('expiry', formatExpiry(e.target.value))}
            onBlur={blur('card.expiryMonth')}
            error={err('card.expiryMonth')}
            required
          />
          <Field
            id="sub-cc-ccv"
            label="Código de segurança"
            name="cvc"
            inputMode="numeric"
            autoComplete="cc-csc"
            maxLength={4}
            value={card.ccv}
            onChange={(e) => setCard('ccv', e.target.value.replace(/\D/g, '').slice(0, 4))}
            onFocus={() => setFlipped(true)}
            onBlur={() => {
              setFlipped(false);
              blur('card.ccv')();
            }}
            error={err('card.ccv')}
            required
          />
        </div>
        <div className="sub-form__row">
          <Field
            id="sub-cep"
            label="CEP de cobrança"
            name="postal-code"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={9}
            value={formatPostalCode(card.postalCode)}
            onChange={(e) => setCard('postalCode', e.target.value.replace(/\D/g, '').slice(0, 8))}
            onBlur={blur('holder.postalCode')}
            error={err('holder.postalCode')}
            required
          />
          <Field
            id="sub-numero"
            label="Número do endereço"
            name="address-number"
            autoComplete="off"
            maxLength={10}
            value={card.addressNumber}
            onChange={(e) => setCard('addressNumber', e.target.value)}
            onBlur={blur('holder.addressNumber')}
            error={err('holder.addressNumber')}
            required
          />
        </div>
        <p className="sub-secure">Os dados do cartão vão direto para o processador do pagamento e não ficam guardados no site.</p>
      </div>
    </div>
  );
}
