import { useEffect, useId, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { SCREENS } from '../../data/pdv.js';
import { highlightParts, searchScreens } from './pdvLogic.js';

/** Demonstração do Ctrl+K: paleta com busca sem acento, iniciais, setas e Enter. */
export default function CommandPalette() {
  const reduce = useReducedMotion();
  const uid = useId();
  const triggerRef = useRef(null);
  const inputRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [opened, setOpened] = useState(null);

  const results = searchScreens(SCREENS, query);
  const current = Math.min(active, Math.max(results.length - 1, 0));

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const show = () => {
    setQuery('');
    setActive(0);
    setOpen(true);
  };
  const choose = (s) => {
    if (!s) return;
    setOpened(s);
    close();
  };

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  /* Ctrl+K só nesta demonstração: vale com o foco dentro dela. */
  const rootRef = useRef(null);
  useEffect(() => {
    const el = rootRef.current;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        show();
      }
    };
    el?.addEventListener('keydown', onKey);
    return () => el?.removeEventListener('keydown', onKey);
  }, []);

  const onInputKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive(results.length ? (current + 1) % results.length : 0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive(results.length ? (current - 1 + results.length) % results.length : 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[current]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  useEffect(() => {
    document.getElementById(`${uid}-opt-${current}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [current, uid]);

  const spring = reduce ? { duration: 0 } : { type: 'spring', stiffness: 460, damping: 36 };

  return (
    <div className="pdv-demo pdv-pal" ref={rootRef}>
      <div className="pdv-pal__stage">
        <div className="pdv-pal__bar">
          <button type="button" ref={triggerRef} className="pdv-pal__trigger" onClick={show}>
            <span aria-hidden="true">⌕</span> Pesquisar no sistema <kbd className="pdv-kbd">Ctrl K</kbd>
          </button>
        </div>
        <div className="pdv-pal__screen" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={opened ? opened.name : 'vazio'}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.2 }}
            >
              {opened ? (
                <>
                  <p className="pdv-pal__group">{opened.group}</p>
                  <p className="pdv-pal__opened">{opened.name}</p>
                  <p className="pdv-demo__note">Em um clique, a tela abre pelo mesmo caminho da barra lateral.</p>
                </>
              ) : (
                <p className="pdv-demo__note">Aperte o botão acima, ou Ctrl+K com o foco aqui, e digite "cp".</p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <AnimatePresence>
          {open ? (
            <motion.div
              className="pdv-pal__wrap"
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.15 }}
              onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
            >
              <motion.div
                className="pdv-pal__box"
                role="dialog"
                aria-modal="true"
                aria-label="Pesquisar no sistema"
                initial={reduce ? false : { opacity: 0, y: -12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                transition={spring}
              >
                <input
                  ref={inputRef}
                  className="pdv-pal__input"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={`${uid}-list`}
                  aria-activedescendant={results.length ? `${uid}-opt-${current}` : undefined}
                  aria-label="Buscar telas"
                  placeholder="Buscar telas e ações"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                  onKeyDown={onInputKey}
                />
                <ul className="pdv-pal__list" role="listbox" id={`${uid}-list`}>
                  {results.map((s, i) => (
                    <li
                      key={s.name}
                      id={`${uid}-opt-${i}`}
                      role="option"
                      aria-selected={i === current}
                      className={`pdv-pal__item${i === current ? ' is-on' : ''}`}
                      onMouseMove={() => setActive(i)}
                      onClick={() => choose(s)}
                    >
                      {i === current ? (
                        <motion.span layoutId={`${uid}-hl`} className="pdv-pal__hl" transition={spring} />
                      ) : null}
                      <span className="pdv-pal__name">
                        {highlightParts(s.name, query).map((p, k) =>
                          p.hit ? <mark key={k}>{p.text}</mark> : <span key={k}>{p.text}</span>
                        )}
                      </span>
                      <span className="pdv-pal__grp">{s.group}</span>
                    </li>
                  ))}
                </ul>
                {results.length === 0 ? <p className="pdv-pal__none">Nenhuma tela com esse nome.</p> : null}
                <p className="pdv-pal__foot">Setas escolhem · Enter abre · Esc fecha</p>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
