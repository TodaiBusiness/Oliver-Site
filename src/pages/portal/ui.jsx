import { useEffect, useRef, useState } from 'react';
import { estadoInfo } from './format.js';

/* Peças pequenas e reutilizadas do portal. Sem estilo inline (CSP): só classes. */

const PATHS = {
  store: 'M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6',
  cart: 'M3 4h2l2.4 11h10.2L20 7H6.2M9 20.2a.8.8 0 100-1.6.8.8 0 000 1.6zm8 0a.8.8 0 100-1.6.8.8 0 000 1.6z',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6',
  wallet: 'M3 7h16a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V7zm0 0V6a2 2 0 012-2h11M17 14h2',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  truck: 'M2 6h11v10H2zM13 9h5l3 3v4h-8M6.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm10 0a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  bag: 'M5 8h14l-1 12H6L5 8zM9 8a3 3 0 016 0',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v5M12 8h.01',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
};

export function PIcon({ name, size = 20, className = '' }) {
  return (
    <svg
      className={`p-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name] ?? PATHS.info} />
    </svg>
  );
}

/** Aviso com papel certo: erro anuncia na hora (alert), o resto é informativo (status). */
export function Notice({ tone = 'info', title, children, icon, className = '' }) {
  const icons = { info: 'info', warn: 'alert', danger: 'alert', ok: 'check' };
  return (
    <div className={`p-notice p-notice--${tone} ${className}`.trim()} role={tone === 'danger' ? 'alert' : 'status'}>
      <PIcon name={icon ?? icons[tone]} />
      <div>
        {title ? <strong className="p-notice__title">{title}</strong> : null}
        <div className="p-notice__body">{children}</div>
      </div>
    </div>
  );
}

export function Spinner({ label = 'Carregando' }) {
  return (
    <div className="p-loading" role="status" aria-live="polite">
      <span className="p-spinner" aria-hidden="true" />
      <span>{label}…</span>
    </div>
  );
}

export function EmptyState({ icon = 'bag', title, children, action }) {
  return (
    <div className="p-empty">
      <PIcon name={icon} size={36} />
      <h2 className="p-empty__title">{title}</h2>
      {children ? <p className="p-empty__text">{children}</p> : null}
      {action}
    </div>
  );
}

export function StatusBadge({ estado }) {
  const info = estadoInfo(estado);
  return <span className={`p-badge p-badge--${info.tone}`}>{info.label}</span>;
}

/** Campo de formulário com rótulo, ajuda e erro ligados por aria. */
export function Field({ id, label, error, hint, children, optional = false }) {
  return (
    <div className={`p-field${error ? ' p-field--error' : ''}`}>
      <label className="p-field__label" htmlFor={id}>
        {label}
        {optional ? <span className="p-field__optional"> (opcional)</span> : null}
      </label>
      {children}
      {hint && !error ? (
        <p className="p-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="p-field__error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

export const describedBy = (id, { error, hint }) =>
  [error ? `${id}-error` : null, hint && !error ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined;

/** Título da página: recebe o foco ao trocar de tela (leitor de tela anuncia). */
export function PageTitle({ children, sub }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <header className="p-pagehead">
      <h1 className="p-h1" tabIndex={-1} ref={ref}>
        {children}
      </h1>
      {sub ? <p className="p-pagehead__sub">{sub}</p> : null}
    </header>
  );
}

/** Executa `fn` a cada `ms` enquanto a aba está visível; ao voltar à aba, atualiza na hora. */
export function usePolling(fn, ms, enabled = true) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;
    const tick = () => {
      if (document.visibilityState === 'visible') saved.current();
    };
    const start = () => {
      stop();
      timer = setInterval(tick, ms);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        tick();
        start();
      } else stop();
    };
    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [ms, enabled]);
}

/** Estado de uma chamada de leitura: carrega ao montar e permite recarregar. */
export function useLoad(load, deps) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const run = useRef(load);
  run.current = load;
  const reload = (silent = false) => {
    if (!silent) setState((s) => ({ ...s, status: s.data ? 'ready' : 'loading' }));
    return run
      .current()
      .then((data) => setState({ status: 'ready', data, error: null }))
      .catch((error) => setState((s) => ({ status: s.data && silent ? 'ready' : 'error', data: s.data, error })));
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return [state, reload];
}
