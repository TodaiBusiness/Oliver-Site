import { forwardRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { formatBRL } from '../../../shared/plan.js';
import { formatDueDate } from '../../../shared/billing.js';

const Success = forwardRef(function Success({ result }, headingRef) {
  const reduce = useReducedMotion();
  const draw = (delay) => ({
    initial: reduce ? false : { pathLength: 0, opacity: 0 },
    animate: { pathLength: 1, opacity: 1 },
    transition: reduce ? { duration: 0 } : { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
  });
  const pending = result.status === 'pending';

  return (
    <div className="sub-done">
      <svg className="sub-done__mark" viewBox="0 0 64 64" width="84" height="84" aria-hidden="true" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <motion.circle cx="32" cy="32" r="28" className="sub-done__circle" {...draw(0)} />
        <motion.path d="M20 33l8 8 16-17" className="sub-done__check" {...draw(0.45)} />
      </svg>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={reduce ? { duration: 0 } : { duration: 0.45, delay: 0.7 }}
      >
        <h2 className="sub-done__title" tabIndex={-1} ref={headingRef}>
          {pending ? 'Assinatura recebida.' : 'Assinatura ativa.'}
        </h2>
        <p className="sub-done__lead">
          {pending
            ? 'Estamos aguardando a confirmação do cartão. Assim que confirmar, enviamos o código de ativação por e-mail.'
            : result.chargedToday
              ? `Cobramos hoje a primeira mensalidade e depois todo dia ${result.billingDay}. O código de ativação e o link do instalador seguem para o seu e-mail.`
              : 'Tudo certo. O código de ativação e o link do instalador seguem para o seu e-mail.'}
        </p>

        <dl className="sub-done__list">
          <div><dt>Cartão</dt><dd>{result.cardBrand} ****{result.cardLast4}</dd></div>
          {result.chargedToday ? (
            <div><dt>Cobrado hoje</dt><dd>{formatBRL(result.firstChargeAmount ?? result.amount)}</dd></div>
          ) : null}
          <div><dt>Vencimento seguinte</dt><dd>todo dia {result.billingDay}</dd></div>
          <div><dt>Próximo vencimento</dt><dd>{formatDueDate(result.nextDueDate)}</dd></div>
          <div><dt>Valor mensal</dt><dd>{formatBRL(result.amount)}</dd></div>
        </dl>

        <p className="sub-done__note">Em meses curtos, cobramos no último dia do mês.</p>

        <div className="sub-done__actions">
          <Link className="btn btn--primary" to="/baixar">Baixar o instalador</Link>
          <Link className="btn btn--ghost" to="/minha-licenca">Minha licença</Link>
        </div>
      </motion.div>
    </div>
  );
});

export default Success;
