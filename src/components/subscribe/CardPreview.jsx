import { motion, useReducedMotion } from 'motion/react';
import { BRAND_LABEL, formatCardNumber } from '../../../shared/billing.js';

/** Pré-visualização decorativa do cartão; vira ao digitar o código de segurança. */
export default function CardPreview({ number, name, expiry, ccv, brand, flipped }) {
  const reduce = useReducedMotion();
  const digits = formatCardNumber(number);
  const mask = brand === 'amex' ? '•••• •••••• •••••' : '•••• •••• •••• ••••';
  const shown = digits ? digits + mask.slice(digits.length) : mask;

  return (
    <div className="sub-card" aria-hidden="true">
      <motion.div
        className="sub-card__inner"
        initial={false}
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 160, damping: 20 }}
      >
        <div className="sub-card__face sub-card__front">
          <div className="sub-card__top">
            <span className="sub-card__chip" />
            <span className="sub-card__brand">{brand ? BRAND_LABEL[brand] : 'Cartão'}</span>
          </div>
          <p className="sub-card__number">{shown}</p>
          <div className="sub-card__bottom">
            <span className="sub-card__name">{name || 'Nome no cartão'}</span>
            <span className="sub-card__exp">{expiry || 'MM/AA'}</span>
          </div>
        </div>
        <div className="sub-card__face sub-card__back">
          <span className="sub-card__stripe" />
          <div className="sub-card__ccv">
            <span>CVV</span>
            <strong>{ccv ? ccv.replace(/./g, '•') : '•••'}</strong>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
