import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { portalApi, PORTAL_SESSION_EXPIRED } from '../../api/portal.js';
import { OBS_ITEM_MAX, readCart, writeCart } from './cartStorage.js';
import { snapQty } from './format.js';

/* =========================================================================
   Estado do portal de UMA loja: vitrine, sessão, catálogo e carrinho.
   Conveniência de interface — quem autoriza e calcula é o servidor. O catálogo
   (com preço) só vive em memória enquanto há sessão: sair o apaga.
   ========================================================================= */

const PortalContext = createContext(null);

export function usePortal() {
  const value = useContext(PortalContext);
  if (!value) throw new Error('usePortal fora do PortalProvider');
  return value;
}

export function PortalProvider({ slug, children }) {
  const api = useMemo(() => portalApi(slug), [slug]);

  const [loja, setLoja] = useState({ status: 'loading', data: null });
  const [session, setSession] = useState({ status: 'loading', account: null, conta: null });
  const [catalog, setCatalog] = useState({ status: 'idle', data: null, error: null });
  const [cart, setCart] = useState(() => readCart(slug));
  const [flash, setFlash] = useState(null);
  const catalogRequest = useRef(null);
  /* Sobe a cada saída da conta: catálogo que chega depois de sair (de outra conta, outra tabela de preço) é descartado. */
  const geracao = useRef(0);

  /* Vitrine (pública). 404 = loja inexistente ou inativa: mesma tela. */
  const loadLoja = useCallback(async () => {
    try {
      const data = await api.vitrine();
      setLoja({ status: 'ready', data });
    } catch (error) {
      setLoja({ status: error.status === 404 ? 'inactive' : 'error', data: null });
    }
  }, [api]);

  const refreshSession = useCallback(async () => {
    try {
      const { account, conta } = await api.me();
      setSession({ status: 'in', account, conta });
      return true;
    } catch (error) {
      if (error.status === 401) setSession({ status: 'out', account: null, conta: null });
      else setSession((current) => (current.status === 'loading' ? { status: 'out', account: null, conta: null } : current));
      return false;
    }
  }, [api]);

  useEffect(() => {
    loadLoja();
    refreshSession();
  }, [loadLoja, refreshSession]);

  /* Sessão caiu no meio do uso: volta ao estado "fora" com um aviso. */
  useEffect(() => {
    const onExpired = (event) => {
      if (event.detail?.slug !== slug) return;
      geracao.current += 1;
      catalogRequest.current = null;
      setSession({ status: 'out', account: null, conta: null });
      setCatalog({ status: 'idle', data: null, error: null });
      setFlash('Sua sessão terminou. Entre de novo para continuar.');
    };
    window.addEventListener(PORTAL_SESSION_EXPIRED, onExpired);
    return () => window.removeEventListener(PORTAL_SESSION_EXPIRED, onExpired);
  }, [slug]);

  /* ----------------------------------------------------------- catálogo */
  const loadCatalog = useCallback(
    async ({ force = false } = {}) => {
      if (catalogRequest.current) return catalogRequest.current;
      if (!force && catalog.status === 'ready') return catalog.data;
      setCatalog((c) => ({ ...c, status: c.data ? 'ready' : 'loading', error: null }));
      const minha = geracao.current;
      const request = api
        .catalogo()
        .then((data) => {
          if (minha !== geracao.current) return null;
          setCatalog({ status: 'ready', data, error: null });
          return data;
        })
        .catch((error) => {
          if (minha !== geracao.current) return null;
          setCatalog((c) => ({ status: 'error', data: c.data, error }));
          return null;
        })
        .finally(() => {
          if (catalogRequest.current === request) catalogRequest.current = null;
        });
      catalogRequest.current = request;
      return request;
    },
    [api, catalog.status, catalog.data]
  );

  /* ----------------------------------------------------------- carrinho */
  useEffect(() => {
    writeCart(slug, cart);
  }, [slug, cart]);

  const productOf = useCallback((id) => catalog.data?.produtos.find((p) => p.id === id) ?? null, [catalog.data]);

  const setQty = useCallback((id, quantity, multiplo = 1) => {
    setCart((items) => {
      const old = items.find((i) => i.id === id);
      const rest = items.filter((i) => i.id !== id);
      const snapped = snapQty(quantity, multiplo);
      return snapped > 0 ? [...rest, { ...old, id, qty: Math.min(snapped, 99999) }].sort(byOrder(items)) : rest;
    });
  }, []);

  const addItem = useCallback((id, amount = 1, multiplo = 1) => {
    setCart((items) => {
      const old = items.find((i) => i.id === id);
      const next = snapQty((old?.qty ?? 0) + amount, multiplo);
      const rest = items.filter((i) => i.id !== id);
      return next > 0 ? [...rest, { ...old, id, qty: Math.min(next, 99999) }].sort(byOrder(items)) : rest;
    });
  }, []);

  /** Observação de um item ("sem cebola"); vazio apaga. */
  const setNote = useCallback((id, obs) => {
    const text = (obs ?? '').slice(0, OBS_ITEM_MAX);
    setCart((items) =>
      items.map((i) => {
        if (i.id !== id) return i;
        const { obs: _old, ...rest } = i;
        return text.trim() ? { ...rest, obs: text } : rest;
      })
    );
  }, []);

  const removeItem = useCallback((id) => setCart((items) => items.filter((i) => i.id !== id)), []);
  const clearCart = useCallback(() => setCart([]), []);
  const replaceCart = useCallback((items) => setCart(items.slice(0, 100)), []);

  /* ------------------------------------------------------ entrar e sair */
  const signIn = useCallback(
    async (credentials) => {
      await api.login(credentials);
      setFlash(null);
      await refreshSession();
    },
    [api, refreshSession]
  );

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* mesmo sem rede, esta tela esquece a sessão */
    }
    geracao.current += 1;
    catalogRequest.current = null;
    setSession({ status: 'out', account: null, conta: null });
    setCatalog({ status: 'idle', data: null, error: null });
    setCart([]);
  }, [api]);

  const value = useMemo(
    () => ({
      slug,
      api,
      loja,
      session,
      signedIn: session.status === 'in',
      catalog,
      loadCatalog,
      productOf,
      cart,
      cartCount: cart.length,
      setQty,
      addItem,
      setNote,
      removeItem,
      clearCart,
      replaceCart,
      signIn,
      signOut,
      refreshSession,
      reloadLoja: loadLoja,
      flash,
      clearFlash: () => setFlash(null),
      path: (sub = '') => `/l/${slug}${sub ? `/${sub}` : ''}`,
    }),
    [slug, api, loja, session, catalog, loadCatalog, productOf, cart, setQty, addItem, setNote, removeItem, clearCart, replaceCart, signIn, signOut, refreshSession, loadLoja, flash]
  );

  return <PortalContext.Provider value={value}>{children}</PortalContext.Provider>;
}

/** Mantém a ordem em que os itens entraram no carrinho. */
function byOrder(previous) {
  const order = new Map(previous.map((item, index) => [item.id, index]));
  return (a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9);
}
