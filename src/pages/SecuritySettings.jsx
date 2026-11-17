import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Field from '../components/panel/Field.jsx';
import { api } from '../api/client.js';
import { useAuth } from '../app/AuthContext.jsx';
import NotifyEmailToggle from '../components/NotifyEmailToggle.jsx';

/* =========================================================================
   Segurança da conta: trocar senha, verificação em duas etapas e sessões.
   Rota sugerida: /cliente/seguranca e /admin/seguranca, sem props. Quem
   decide o que aparece é o `useAuth()`; quem autoriza é o servidor.
   ========================================================================= */

const formatDateTime = (ms) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(Number(ms)));

function Notice({ kind = 'error', children }) {
  if (!children) return null;
  return (
    <div className={`alert alert--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon name={kind === 'error' ? 'close' : 'check'} size={16} />
      {children}
    </div>
  );
}

/* ------------------------------------------------------------ trocar senha */

function PasswordSection() {
  const EMPTY = { currentPassword: '', newPassword: '', confirm: '' };
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const [sending, setSending] = useState(false);

  const update = (field) => (event) => setForm((c) => ({ ...c, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setOk(null);
    setErrors({});

    if (form.newPassword !== form.confirm) {
      setErrors({ confirm: 'As senhas não são iguais.' });
      return;
    }

    setSending(true);
    try {
      const result = await api.post('/auth/password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setForm(EMPTY);
      setOk(
        result.revokedSessions
          ? `Senha alterada. ${result.revokedSessions} outro(s) aparelho(s) foram desconectados.`
          : 'Senha alterada.'
      );
    } catch (problem) {
      setErrors(problem.details ?? {});
      setError(problem.details ? null : problem.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="sec-card" aria-labelledby="sec-senha">
      <h2 className="sec-card__title" id="sec-senha">Trocar a senha</h2>
      <p className="sec-card__text">
        Ao trocar, todos os outros aparelhos conectados à sua conta são desconectados.
      </p>
      <Notice>{error}</Notice>
      <Notice kind="success">{ok}</Notice>
      <form className="sec-form" onSubmit={submit} noValidate>
        <Field
          id="sec-atual"
          label="Senha atual"
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={update('currentPassword')}
          error={errors.currentPassword}
          required
        />
        <Field
          id="sec-nova"
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          hint="Ao menos 10 caracteres, misturando letras e números."
          value={form.newPassword}
          onChange={update('newPassword')}
          error={errors.newPassword}
          required
        />
        <Field
          id="sec-confirma"
          label="Repita a nova senha"
          type="password"
          autoComplete="new-password"
          value={form.confirm}
          onChange={update('confirm')}
          error={errors.confirm}
          required
        />
        <div>
          <button type="submit" className="btn btn--primary" disabled={sending}>
            {sending ? 'Salvando…' : 'Trocar senha'}
          </button>
        </div>
      </form>
    </section>
  );
}

/* --------------------------------------------------------------------- 2FA */

function RecoveryCodes({ codes, onDone }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="sec-recovery">
      <Notice kind="success">Segundo fator ativado.</Notice>
      <h3 className="sec-card__subtitle">Guarde seus códigos de recuperação</h3>
      <p className="sec-card__text">
        Se perder o aparelho, cada código abaixo entra uma única vez no lugar do código do app. Eles
        <strong> não serão mostrados de novo</strong>. Guarde em um gerenciador de senhas ou impressos.
      </p>
      <ul className="sec-codes">
        {codes.map((code) => (
          <li key={code}><code>{code}</code></li>
        ))}
      </ul>
      <div className="sec-actions">
        <button type="button" className="btn btn--soft btn--sm" onClick={copy}>
          {copied ? 'Copiado' : 'Copiar códigos'}
        </button>
        <button type="button" className="btn btn--primary btn--sm" onClick={onDone}>
          Guardei os códigos
        </button>
      </div>
    </div>
  );
}

function TwoFactorSection() {
  const { refresh, isAdmin } = useAuth();
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState(null);

  /* idle → password (pede a senha) → scan (mostra a chave e pede o código) → codes */
  const [step, setStep] = useState('idle');
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(null);
  const [disabling, setDisabling] = useState(false);
  const [disable, setDisable] = useState({ password: '', code: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await api.get('/auth/2fa'));
      setLoadError(null);
    } catch (problem) {
      setLoadError(problem.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action) => {
    setError(null);
    setBusy(true);
    try {
      await action();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(false);
    }
  };

  const startSetup = (event) => {
    event.preventDefault();
    run(async () => {
      setSetup(await api.post('/auth/2fa/setup', { password }));
      setPassword('');
      setStep('scan');
    });
  };

  const confirm = (event) => {
    event.preventDefault();
    run(async () => {
      const result = await api.post('/auth/2fa/enable', { code });
      setCodes(result.recoveryCodes);
      setStep('codes');
      setSetup(null);
      setCode('');
      await refresh();
    });
  };

  const turnOff = (event) => {
    event.preventDefault();
    run(async () => {
      await api.post('/auth/2fa/disable', disable);
      setDisable({ password: '', code: '' });
      setDisabling(false);
      await load();
      await refresh();
    });
  };

  if (loadError) {
    return (
      <section className="sec-card">
        <h2 className="sec-card__title">Verificação em duas etapas</h2>
        <Notice>{loadError}</Notice>
      </section>
    );
  }
  if (!status) return <p className="panel-loading">Carregando…</p>;

  const groupedSecret = setup?.secret?.match(/.{1,4}/g)?.join(' ');

  return (
    <section className="sec-card" aria-labelledby="sec-2fa">
      <h2 className="sec-card__title" id="sec-2fa">
        Verificação em duas etapas
        <span className={`sec-badge${status.enabled ? ' sec-badge--on' : ''}`}>
          {status.enabled ? 'Ativa' : 'Desativada'}
        </span>
      </h2>

      {!status.available && !status.enabled ? (
        <Notice>
          O segundo fator está indisponível: falta configurar SESSION_SECRET no servidor.
        </Notice>
      ) : null}

      {step === 'codes' && codes ? (
        <RecoveryCodes
          codes={codes}
          onDone={() => {
            setCodes(null);
            setStep('idle');
            load();
          }}
        />
      ) : status.enabled ? (
        <>
          <p className="sec-card__text">
            O login pede, além da senha, um código do app autenticador. Códigos de recuperação
            restantes: <strong>{status.recoveryCodesRemaining}</strong>.
          </p>
          <Notice>{error}</Notice>
          {disabling ? (
            <form className="sec-form" onSubmit={turnOff} noValidate>
              <Field
                id="sec-off-senha"
                label="Senha"
                type="password"
                autoComplete="current-password"
                value={disable.password}
                onChange={(e) => setDisable((c) => ({ ...c, password: e.target.value }))}
                required
              />
              <Field
                id="sec-off-codigo"
                label="Código do app (ou de recuperação)"
                autoComplete="one-time-code"
                inputMode="numeric"
                value={disable.code}
                onChange={(e) => setDisable((c) => ({ ...c, code: e.target.value }))}
                required
              />
              <div className="sec-actions">
                <button type="submit" className="btn btn--danger btn--sm" disabled={busy}>
                  Desativar
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => setDisabling(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : (
            <div className="sec-actions">
              <button type="button" className="btn btn--soft btn--sm" onClick={() => setDisabling(true)}>
                Desativar o segundo fator
              </button>
            </div>
          )}
        </>
      ) : step === 'scan' && setup ? (
        <>
          <ol className="sec-steps">
            <li>
              Abra um app autenticador (Google Authenticator, Microsoft Authenticator, Authy, 1Password)
              e adicione uma conta pela <strong>chave de configuração</strong>:
              <code className="sec-secret" aria-label="Chave de configuração">{groupedSecret}</code>
              <span className="sec-hint">
                Tipo de chave: baseada em tempo. No celular, você também pode{' '}
                <a href={setup.otpauthUrl}>abrir direto no app autenticador</a>.
              </span>
            </li>
            <li>Digite abaixo o código de 6 dígitos que o app mostrar.</li>
          </ol>
          <Notice>{error}</Notice>
          <form className="sec-form" onSubmit={confirm} noValidate>
            <Field
              id="sec-codigo"
              label="Código do app"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="field__control sec-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
            />
            <div className="sec-actions">
              <button type="submit" className="btn btn--primary btn--sm" disabled={busy || code.length !== 6}>
                {busy ? 'Confirmando…' : 'Confirmar e ativar'}
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setStep('idle'); setSetup(null); setError(null); }}>
                Cancelar
              </button>
            </div>
          </form>
        </>
      ) : step === 'password' ? (
        <>
          <Notice>{error}</Notice>
          <form className="sec-form" onSubmit={startSetup} noValidate>
            <Field
              id="sec-2fa-senha"
              label="Confirme a sua senha"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="sec-actions">
              <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !password}>
                Continuar
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setStep('idle'); setError(null); }}>
                Cancelar
              </button>
            </div>
          </form>
        </>
      ) : (
        <>
          <p className="sec-card__text">
            {isAdmin
              ? 'Proteja o painel administrativo: além da senha, o login passa a pedir um código gerado no seu celular. Recomendado para toda conta de administrador.'
              : 'É opcional. Com a verificação ativa, o login pede um código do app autenticador no seu celular, além da senha. Se perder o celular, os códigos de recuperação garantem o acesso.'}
          </p>
          <div className="sec-actions">
            <button type="button" className="btn btn--primary btn--sm" disabled={!status.available} onClick={() => setStep('password')}>
              Ativar verificação em duas etapas
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/* ----------------------------------------------------------------- sessões */

function SessionsSection() {
  const { logoutEverywhere } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setSessions((await api.get('/auth/sessions')).sessions);
      setError(null);
    } catch (problem) {
      setError(problem.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const revoke = async (id) => {
    try {
      await api.delete(`/auth/sessions/${id}`);
      await load();
    } catch (problem) {
      setError(problem.message);
    }
  };

  const revokeAll = async () => {
    await logoutEverywhere();
    navigate('/login', { replace: true });
  };

  return (
    <section className="sec-card" aria-labelledby="sec-sessoes">
      <h2 className="sec-card__title" id="sec-sessoes">Aparelhos conectados</h2>
      <p className="sec-card__text">
        Se não reconhecer algum acesso, desconecte-o e troque a sua senha.
      </p>
      <Notice>{error}</Notice>
      {sessions ? (
        <ul className="sec-sessions">
          {sessions.map((s) => (
            <li key={s.id} className="sec-session">
              <div>
                <strong>{s.device}</strong>
                {s.current ? <span className="sec-badge sec-badge--on">Este aparelho</span> : null}
                <div className="sec-hint">
                  {s.ip ? `${s.ip} · ` : ''}entrou em {formatDateTime(s.createdAt)} · último uso{' '}
                  {formatDateTime(s.lastSeenAt)}
                </div>
              </div>
              {s.current ? null : (
                <button type="button" className="btn btn--soft btn--xs" onClick={() => revoke(s.id)}>
                  Desconectar
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel-loading">Carregando…</p>
      )}
      <div className="sec-actions">
        <button type="button" className="btn btn--danger-soft btn--sm" onClick={revokeAll}>
          Sair de todos os dispositivos
        </button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ página */

export default function SecuritySettings() {
  const { isAdmin } = useAuth();

  return (
    <div className="sec">
      <header className="page-head">
        <div>
          <h1 className="page-title">Segurança</h1>
          <p className="page-subtitle">Senha, verificação em duas etapas, avisos por e-mail e aparelhos conectados.</p>
        </div>
      </header>

      <PasswordSection />
      <TwoFactorSection />
      {isAdmin ? null : (
        <section className="sec-card">
          <NotifyEmailToggle />
        </section>
      )}
      <SessionsSection />
    </div>
  );
}
