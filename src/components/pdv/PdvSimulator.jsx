import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { PRODUCTS } from '../../data/pdv.js';
import { addItem, brl, cartTotal, change, changeQty, parseCents } from './pdvLogic.js';
import useCountUp from './useCountUp.js';

const METHODS = [
  { id: 'dinheiro', label: 'Dinheiro', key: 'F1' },
  { id: 'pix', label: 'Pix', key: 'F2' },
  { id: 'cartao', label: 'Cartão', key: 'F3' },
  { id: 'dividir', label: 'Dividir', key: 'F6' },
];

function Check({ reduce }) {
  return (
    <svg className="pdv-check" viewBox="0 0 52 52" aria-hidden="true">
      <motion.circle
        cx="26" cy="26" r="23" fill="none" stroke="currentColor" strokeWidth="3"
        initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: reduce ? 0 : 0.5, ease: 'easeOut' }}
      />
      <motion.path
        d="M15 27l8 8 14-16" fill="none" stroke="currentColor" strokeWidth="3.5"
        strokeLinecap="round" strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }}
        transition={{ duration: reduce ? 0 : 0.4, delay: reduce ? 0 : 0.4, ease: 'easeOut' }}
      />
    </svg>
  );
}

/** Caixa de demonstração que funciona de verdade: adiciona, soma, abre o pagamento e fecha a venda. */
export default function PdvSimulator() {
  const reduce = useReducedMotion();
  const uid = useId();
  const rootRef = useRef(null);
  const finishBtnRef = useRef(null);
  const receivedRef = useRef(null);

  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState('dinheiro');
  const [received, setReceived] = useState('');
  const [done, setDone] = useState(false);
  const [sales, setSales] = useState({ count: 0, total: 0 });
  const [announce, setAnnounce] = useState('');

  const total = cartTotal(items);
  const shownTotal = useCountUp(total, reduce);
  const shownDay = useCountUp(sales.total, reduce);

  const receivedCents = parseCents(received);
  const troco = change(total, receivedCents);
  // Dividir: valor em dinheiro; o restante vai no cartão.
  const splitCash = Math.min(receivedCents, total);

  let canConfirm = total > 0;
  let reason = '';
  if (method === 'dinheiro' && !troco.ok) {
    canConfirm = false;
    reason = receivedCents ? `Faltam ${brl(troco.falta)}` : 'Informe o valor recebido';
  } else if (method === 'dividir' && (splitCash <= 0 || splitCash >= total)) {
    canConfirm = false;
    reason = 'Informe a parte em dinheiro, menor que o total';
  }

  const closeModal = useCallback(() => {
    setOpen(false);
    setDone(false);
    finishBtnRef.current?.focus();
  }, []);

  const openModal = useCallback(() => {
    if (total <= 0) return;
    setMethod('dinheiro');
    setReceived('');
    setDone(false);
    setOpen(true);
  }, [total]);

  const confirm = useCallback(() => {
    if (!canConfirm || done) return;
    setDone(true);
    setAnnounce(`Venda de ${brl(total)} confirmada. Venda rápida número 000 aberta vazia.`);
  }, [canConfirm, done, total]);

  /* Depois do check, a venda entra no caixa e a comanda recomeça vazia. */
  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(() => {
      setSales((s) => ({ count: s.count + 1, total: s.total + total }));
      setItems([]);
      setOpen(false);
      setDone(false);
      finishBtnRef.current?.focus();
    }, reduce ? 900 : 1500);
    return () => clearTimeout(t);
    // total só muda antes de confirmar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  useEffect(() => {
    if (open && !done) receivedRef.current?.focus();
  }, [open, method, done]);

  /* Atalhos valem só com o foco dentro do caixa (não brigam com F12 do navegador no resto da página). */
  const onKeyDown = (e) => {
    const k = e.key;
    if (!open) {
      if (k === 'F12') {
        e.preventDefault();
        openModal();
      }
      return;
    }
    if (k === 'Escape') {
      e.preventDefault();
      closeModal();
    } else if (k === 'F1') { e.preventDefault(); setMethod('dinheiro'); }
    else if (k === 'F2') { e.preventDefault(); setMethod('pix'); }
    else if (k === 'F3') { e.preventDefault(); setMethod('cartao'); }
    else if (k === 'F6') { e.preventDefault(); setMethod('dividir'); }
    else if (k === 'F4' || k === 'Enter') { e.preventDefault(); confirm(); }
  };

  const spring = reduce ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 };

  return (
    <div className="pdv-sim" ref={rootRef} onKeyDown={onKeyDown}>
      <div className="pdv-sim__top">
        <div className="pdv-sim__stat">
          <span className="pdv-sim__stat-label">Vendas no caixa</span>
          <strong>{sales.count}</strong>
        </div>
        <div className="pdv-sim__stat">
          <span className="pdv-sim__stat-label">Total do caixa</span>
          <strong>{brl(shownDay)}</strong>
        </div>
      </div>

      <div className="pdv-sim__body">
        <div className="pdv-sim__grid" role="group" aria-label="Produtos">
          {PRODUCTS.map((p) => (
            <motion.button
              key={p.id}
              type="button"
              className="pdv-prod"
              whileTap={reduce ? undefined : { scale: 0.96 }}
              onClick={() => setItems((c) => addItem(c, p))}
              aria-label={`Adicionar ${p.name}, ${brl(p.price)}`}
            >
              <span className="pdv-prod__name">{p.name}</span>
              <span className="pdv-prod__price">{brl(p.price)}</span>
            </motion.button>
          ))}
        </div>

        <div className="pdv-cart">
          <div className="pdv-cart__head">
            <span className="pdv-cart__title">Venda rápida #000</span>
            <span className="pdv-cart__badge">Aberta</span>
          </div>

          <ul className="pdv-cart__list" aria-label="Itens da venda">
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((i) => (
                <motion.li
                  key={i.id}
                  layout={!reduce}
                  className="pdv-line"
                  initial={reduce ? false : { opacity: 0, x: 24, scale: 0.96 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24, scale: 0.96 }}
                  transition={spring}
                >
                  <span className="pdv-line__name">{i.name}</span>
                  <span className="pdv-qty">
                    <button type="button" onClick={() => setItems((c) => changeQty(c, i.id, -1))} aria-label={`Diminuir ${i.name}`}>−</button>
                    <span aria-label={`${i.qty} unidades`}>{i.qty}</span>
                    <button type="button" onClick={() => setItems((c) => changeQty(c, i.id, 1))} aria-label={`Aumentar ${i.name}`}>+</button>
                  </span>
                  <span className="pdv-line__sum">{brl(i.price * i.qty)}</span>
                </motion.li>
              ))}
            </AnimatePresence>
            {items.length === 0 ? (
              <li className="pdv-cart__empty">Toque num produto para lançar.</li>
            ) : null}
          </ul>

          <div className="pdv-cart__foot">
            <div className="pdv-total">
              <span>Total geral</span>
              <strong aria-hidden="true">{brl(shownTotal)}</strong>
              <span className="sr-only" role="status" aria-live="polite">
                {total ? `Total ${brl(total)}` : 'Comanda vazia'}
              </span>
            </div>
            <button
              type="button"
              ref={finishBtnRef}
              className="btn btn--primary btn--block"
              onClick={openModal}
              disabled={total <= 0}
            >
              Finalizar venda <kbd className="pdv-kbd">F12</kbd>
            </button>
          </div>
        </div>
      </div>

      <p className="pdv-sim__hint">Clique no caixa e use F12 para finalizar, F1 a F3 para escolher a forma e Esc para fechar.</p>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      <AnimatePresence>
        {open ? (
          <motion.div
            className="pdv-modal-wrap"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
            onMouseDown={(e) => { if (e.target === e.currentTarget && !done) closeModal(); }}
          >
            <motion.div
              className="pdv-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={`${uid}-t`}
              initial={reduce ? false : { opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.98 }}
              transition={spring}
            >
              {done ? (
                <div className="pdv-done">
                  <Check reduce={reduce} />
                  <p className="pdv-done__title">Venda confirmada</p>
                  <p className="pdv-done__text">{brl(total)} no caixa. A venda rápida #000 abre vazia para o próximo cliente.</p>
                </div>
              ) : (
                <>
                  <div className="pdv-modal__head">
                    <h3 id={`${uid}-t`}>Finalizar venda</h3>
                    <button type="button" className="pdv-x" onClick={closeModal} aria-label="Fechar (Esc)">×</button>
                  </div>
                  <div className="pdv-modal__total">
                    <span>Total a pagar</span>
                    <strong>{brl(total)}</strong>
                  </div>
                  <p className="pdv-modal__q" id={`${uid}-q`}>Como o cliente vai pagar?</p>
                  <div className="pdv-methods" role="radiogroup" aria-labelledby={`${uid}-q`}>
                    {METHODS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={method === m.id}
                        className={`pdv-method${method === m.id ? ' is-on' : ''}`}
                        onClick={() => setMethod(m.id)}
                      >
                        {method === m.id ? (
                          <motion.span layoutId={`${uid}-sel`} className="pdv-method__bg" transition={spring} />
                        ) : null}
                        <span className="pdv-method__label">{m.label}</span>
                        <kbd className="pdv-kbd">{m.key}</kbd>
                      </button>
                    ))}
                  </div>

                  {method === 'dinheiro' || method === 'dividir' ? (
                    <div className="pdv-recv">
                      <label htmlFor={`${uid}-v`}>
                        {method === 'dividir' ? 'Parte em dinheiro' : 'Valor recebido'}
                      </label>
                      <input
                        id={`${uid}-v`}
                        ref={receivedRef}
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder="0,00"
                        value={received}
                        onChange={(e) => setReceived(e.target.value)}
                      />
                      <p className="pdv-recv__result" role="status" aria-live="polite">
                        {method === 'dinheiro' ? (
                          receivedCents === 0 ? (
                            'Digite quanto o cliente entregou.'
                          ) : troco.ok ? (
                            <>Troco <strong className="is-ok">{brl(troco.troco)}</strong></>
                          ) : (
                            <>Falta <strong className="is-bad">{brl(troco.falta)}</strong></>
                          )
                        ) : splitCash > 0 && splitCash < total ? (
                          <>Restante no cartão <strong className="is-ok">{brl(total - splitCash)}</strong></>
                        ) : (
                          'O restante vai no cartão.'
                        )}
                      </p>
                    </div>
                  ) : (
                    <p className="pdv-recv__result">
                      {method === 'pix' ? 'O caixa confirma o recebimento do Pix.' : 'Passe o cartão na maquininha.'}
                    </p>
                  )}

                  <button type="button" className="btn btn--primary btn--lg btn--block" onClick={confirm} disabled={!canConfirm}>
                    Confirmar pagamento <kbd className="pdv-kbd">F4</kbd>
                  </button>
                  <p className="pdv-modal__reason" aria-live="polite">{reason}</p>
                </>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
