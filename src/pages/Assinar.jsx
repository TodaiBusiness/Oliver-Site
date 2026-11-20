import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import SiteShell from '../components/SiteShell.jsx';
import Icon from '../components/Icon.jsx';
import Stepper from '../components/subscribe/Stepper.jsx';
import StepCompany from '../components/subscribe/StepCompany.jsx';
import StepDay from '../components/subscribe/StepDay.jsx';
import StepCard, { cardErrors } from '../components/subscribe/StepCard.jsx';
import Summary from '../components/subscribe/Summary.jsx';
import Success from '../components/subscribe/Success.jsx';
import { api, ApiError } from '../api/client.js';
import { monthlyPrice } from '../../shared/plan.js';
import { isValidTaxId, onlyDigits } from '../../shared/taxId.js';
import { parseExpiry } from '../../shared/billing.js';
import { PRODUCT } from '../data/product.js';

const EMPTY = {
  companyName: '', contactName: '', taxId: '', email: '', phone: '', devices: 1, acceptTerms: false, billingDay: null,
};
const EMPTY_CARD = { number: '', holderName: '', expiry: '', ccv: '', postalCode: '', addressNumber: '' };

const TITLES = ['Sobre a sua empresa', 'Dia do vencimento', 'Dados do cartão'];
const COMPANY_FIELDS = ['companyName', 'contactName', 'taxId', 'email', 'phone', 'devices', 'acceptTerms'];

/** A API pode nomear o campo do cartão sem o prefixo; unifica para o que a tela usa. */
const ALIASES = {
  number: 'card.number', holdername: 'card.holderName', expirymonth: 'card.expiryMonth',
  expiryyear: 'card.expiryMonth', ccv: 'card.ccv', postalcode: 'holder.postalCode', addressnumber: 'holder.addressNumber',
};
const CANON = Object.fromEntries(
  [...COMPANY_FIELDS, 'billingDay', 'card.number', 'card.holderName', 'card.expiryMonth', 'card.ccv', 'holder.postalCode', 'holder.addressNumber']
    .map((k) => [k.toLowerCase(), k])
);

function normalizeErrors(details) {
  const out = {};
  if (!details || typeof details !== 'object') return out;
  for (const [key, value] of Object.entries(details)) {
    const lower = key.toLowerCase();
    const name = CANON[lower] ?? ALIASES[lower];
    if (name) out[name] = Array.isArray(value) ? value[0] : value;
  }
  return out;
}

function companyProblems(v) {
  const found = {};
  if (v.companyName.trim().length < 2) found.companyName = 'Informe o nome da empresa.';
  if (v.contactName.trim().length < 2) found.contactName = 'Informe o seu nome.';
  if (!isValidTaxId(v.taxId)) found.taxId = 'Confira o CPF ou o CNPJ.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) found.email = 'Confira o e-mail: é para onde enviamos o código.';
  if (onlyDigits(v.phone).length < 8) found.phone = 'Informe um telefone com DDD.';
  if (!v.acceptTerms) found.acceptTerms = 'Aceite os termos para continuar.';
  return found;
}

export default function Assinar() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [values, setValues] = useState(EMPTY);
  const [card, setCardState] = useState(EMPTY_CARD);
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [problem, setProblem] = useState(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const headingRef = useRef(null);
  const alertRef = useRef(null);
  const first = useRef(true);

  const total = monthlyPrice(values.devices);

  /* Dado de cartão só vive em memória: sai junto com a página. */
  useEffect(() => () => setCardState(EMPTY_CARD), []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: false });
  }, [step, result]);

  useEffect(() => {
    if (problem) alertRef.current?.focus();
  }, [problem]);

  const set = (name, value) => {
    setValues((c) => ({ ...c, [name]: value }));
    setErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
  };
  const setCard = (name, value) => {
    setCardState((c) => ({ ...c, [name]: value }));
    setErrors((e) => {
      const key = { number: 'card.number', holderName: 'card.holderName', expiry: 'card.expiryMonth', ccv: 'card.ccv', postalCode: 'holder.postalCode', addressNumber: 'holder.addressNumber' }[name];
      return e[key] ? { ...e, [key]: undefined } : e;
    });
  };

  const go = (to) => {
    setDir(to > step ? 1 : -1);
    setProblem(null);
    setStep(to);
  };

  function next() {
    if (step === 0) {
      const found = companyProblems(values);
      setErrors(found);
      if (Object.keys(found).length) return;
    }
    if (step === 1) {
      if (!values.billingDay) {
        setErrors({ billingDay: 'Escolha o dia 15, 20 ou 30.' });
        return;
      }
      setErrors({});
    }
    go(step + 1);
  }

  async function submit(event) {
    event.preventDefault();
    if (sending) return;
    setProblem(null);
    setSubmitted(true);
    if (Object.values(cardErrors(card)).some(Boolean)) return;

    const exp = parseExpiry(card.expiry);
    setSending(true);
    try {
      const data = await api.post('/subscribe', {
        companyName: values.companyName,
        contactName: values.contactName,
        taxId: values.taxId,
        email: values.email,
        phone: values.phone,
        devices: values.devices,
        billingDay: values.billingDay,
        acceptTerms: true,
        card: { holderName: card.holderName, number: card.number, expiryMonth: exp.month, expiryYear: exp.year, ccv: card.ccv },
        holder: { postalCode: card.postalCode, addressNumber: card.addressNumber },
      });
      setCardState(EMPTY_CARD);
      setResult(data);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 400 && failure.details) {
        const found = normalizeErrors(failure.details);
        setErrors(found);
        if (COMPANY_FIELDS.some((k) => found[k])) go(0);
        else if (found.billingDay) go(1);
        else setProblem({ code: 'DADOS', message: 'Confira os campos destacados.' });
      } else if (failure instanceof ApiError && failure.status === 402) {
        setProblem({ code: 'CARTAO_RECUSADO', message: 'O cartão foi recusado. Confira os dados ou tente com outro cartão. Nenhuma cobrança foi feita.' });
      } else {
        setProblem({
          code: 'ERRO',
          message: failure instanceof ApiError ? failure.message : 'Não foi possível concluir agora. Tente de novo em instantes.',
        });
      }
    } finally {
      setSending(false);
    }
  }

  function useAnotherCard() {
    setCardState(EMPTY_CARD);
    setSubmitted(false);
    setErrors({});
    setProblem(null);
    setTimeout(() => document.getElementById('sub-cc-numero')?.focus(), 0);
  }

  const slide = {
    initial: reduce ? { opacity: 0 } : { opacity: 0, x: 28 * dir },
    animate: { opacity: 1, x: 0 },
    exit: reduce ? { opacity: 0 } : { opacity: 0, x: -28 * dir },
    transition: { duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] },
  };

  return (
    <SiteShell>
      <div className="sub">
        <header className="sub__head">
          <h1 className="sub__title">Assine o {PRODUCT.name}</h1>
          <p className="sub__lead">Cobramos a primeira mensalidade hoje e as seguintes no dia que você escolher.</p>
        </header>

        {result ? (
          <div className="sub__panel sub__panel--done">
            <Success result={result} ref={headingRef} />
          </div>
        ) : (
          <>
            <Stepper current={step} onGo={go} />
            <div className="sub__layout">
              <form className="sub__panel" onSubmit={step === 2 ? submit : (e) => { e.preventDefault(); next(); }} noValidate>
                <h2 className="sub__step-title" tabIndex={-1} ref={headingRef}>
                  <span className="sub__step-count">Etapa {step + 1} de 3</span> {TITLES[step]}
                </h2>

                {problem ? (
                  <div className="alert alert--error sub__alert" role="alert" tabIndex={-1} ref={alertRef}>
                    <Icon name="close" size={16} />
                    <div>
                      <p>{problem.message}</p>
                      {problem.code === 'CARTAO_RECUSADO' ? (
                        <button type="button" className="sub__link" onClick={useAnotherCard}>Usar outro cartão</button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                <div className="sub__stage">
                  <AnimatePresence mode="wait" initial={false} custom={dir}>
                    <motion.div key={step} {...slide}>
                      {step === 0 ? <StepCompany values={values} errors={errors} set={set} setValues={setValues} /> : null}
                      {step === 1 ? <StepDay billingDay={values.billingDay} total={total} error={errors.billingDay} onChange={(d) => { set('billingDay', d); }} /> : null}
                      {step === 2 ? <StepCard card={card} setCard={setCard} serverErrors={errors} submitted={submitted} /> : null}
                    </motion.div>
                  </AnimatePresence>
                </div>

                <div className="sub__actions">
                  {step > 0 ? (
                    <button type="button" className="btn btn--ghost" onClick={() => go(step - 1)} disabled={sending}>Voltar</button>
                  ) : <span />}
                  <button type="submit" className="btn btn--primary btn--lg" disabled={sending}>
                    {step < 2 ? 'Continuar' : sending ? 'Processando…' : 'Assinar'}
                    {step < 2 ? <Icon name="arrowRight" size={17} /> : null}
                  </button>
                </div>
              </form>

              <Summary total={total} devices={Number(values.devices)} billingDay={values.billingDay} number={card.number} />
            </div>
          </>
        )}
      </div>
    </SiteShell>
  );
}
