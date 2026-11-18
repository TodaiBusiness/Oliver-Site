import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, SESSION_EXPIRED_EVENT } from '../api/client.js';

/* =========================================================================
   Estado de autenticação no navegador.

   Isto é conveniência de interface — NÃO é segurança. Quem autoriza é o
   servidor: mesmo que alguém force `user.role = 'ADMIN'` aqui pelo console,
   a API continua devolvendo 403.
   ========================================================================= */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  /* A administração do site pode estar desligada (ela agora é no Panel). Até o
     servidor responder, assume desligada: nenhum link de admin pisca na tela. */
  const [adminEnabled, setAdminEnabled] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/config/public')
      .then((config) => {
        if (!cancelled) setAdminEnabled(config?.adminEnabled === true);
      })
      .catch(() => {
        if (!cancelled) setAdminEnabled(false);
      })
      .finally(() => {
        if (!cancelled) setConfigLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* Ao abrir a página, pergunta ao servidor quem está logado (via cookie). */
  useEffect(() => {
    let cancelled = false;

    api
      .get('/auth/me')
      .then(({ user: current }) => {
        if (!cancelled) setUser(current);
      })
      .catch(() => {
        if (!cancelled) setUser(null); // 401 é o esperado para visitante
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /* Qualquer 401 numa chamada autenticada = sessão acabou: volta ao login. */
  useEffect(() => {
    const expired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, expired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expired);
  }, []);

  /**
   * Primeiro passo. Devolve o usuário, ou `{ twoFactorRequired: true, challenge }`
   * quando a conta tem segundo fator: aí falta `completeTwoFactor`.
   */
  const login = useCallback(async (email, password) => {
    const result = await api.post('/auth/login', { email, password });
    if (result.twoFactorRequired) return { twoFactorRequired: true, challenge: result.challenge, expiresAt: result.expiresAt };
    setUser(result.user);
    return result.user;
  }, []);

  const completeTwoFactor = useCallback(async (challenge, code) => {
    const { user: logged } = await api.post('/auth/login/2fa', { challenge, code });
    setUser(logged);
    return logged;
  }, []);

  /** Recarrega o usuário (ex.: depois de ativar o 2FA). */
  const refresh = useCallback(async () => {
    const { user: current } = await api.get('/auth/me');
    setUser(current);
    return current;
  }, []);

  /** "Sair de todos os dispositivos": a sessão atual também cai. */
  const logoutEverywhere = useCallback(async () => {
    try {
      await api.post('/auth/sessions/revoke-all');
    } finally {
      setUser(null);
    }
  }, []);

  /* O cadastro novo fica PENDENTE até a equipe autorizar: não há sessão, então
     NÃO entra na conta (nada de login aqui). Devolve `{ status, message }`. */
  const register = useCallback(async (data) => api.post('/auth/register', data), []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      /* Mesmo se a chamada falhar, o estado local é limpo. */
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      configLoading,
      adminEnabled,
      login,
      completeTwoFactor,
      refresh,
      register,
      logout,
      logoutEverywhere,
      /* Só vale como admin com a administração do site ligada. */
      isAdmin: adminEnabled && user?.role === 'ADMIN',
    }),
    [user, loading, configLoading, adminEnabled, login, completeTwoFactor, refresh, register, logout, logoutEverywhere]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth precisa estar dentro de <AuthProvider>.');
  return context;
}
