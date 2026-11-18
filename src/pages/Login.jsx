import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import Field from '../components/panel/Field.jsx';
import { useAuth } from '../app/AuthContext.jsx';

/* Códigos de erro do servidor que significam "recomece pela senha". */
const RECOMECAR = new Set(['NAO_AUTENTICADO']);

/* Conta pendente ou recusada: o servidor responde 403 com estes códigos. */
const NOTICE_CODES = new Set(['CONTA_PENDENTE', 'CONTA_RECUSADA']);

export default function Login() {
  const { user, login, completeTwoFactor, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(false);
  const [sending, setSending] = useState(false);

  /* Passo 2 (só para contas com 2FA): desafio devolvido pelo servidor. */
  const [challenge, setChallenge] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const codeRef = useRef(null);

  /* Foco no campo do código sempre que o passo ou o modo muda. */
  useEffect(() => {
    if (challenge) codeRef.current?.focus();
  }, [challenge, useRecovery]);

  /* Contagem do desafio: ao zerar, volta para a senha com uma explicação. */
  useEffect(() => {
    if (!challenge || !expiresAt) return undefined;
    const tick = () => {
      const left = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        setChallenge(null);
        setCode('');
        setUseRecovery(false);
        setForm((current) => ({ ...current, password: '' }));
        setError('A verificação expirou. Entre com e-mail e senha novamente.');
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [challenge, expiresAt]);

  if (user) {
    return <Navigate to={isAdmin ? '/admin' : '/cliente'} replace />;
  }

  const update = (field) => (event) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));

  const goTo = (logged) => {
    const destino = location.state?.from ?? (logged.role === 'ADMIN' ? '/admin' : '/cliente');
    navigate(destino, { replace: true });
  };

  const backToPassword = (message = null) => {
    setChallenge(null);
    setExpiresAt(null);
    setCode('');
    setUseRecovery(false);
    setForm((current) => ({ ...current, password: '' }));
    setError(message);
  };

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setNotice(false);
    setSending(true);

    try {
      const result = await login(form.email, form.password);
      if (result.twoFactorRequired) {
        setChallenge(result.challenge);
        setExpiresAt(result.expiresAt ?? null);
        setCode('');
        return;
      }
      goTo(result);
    } catch (problem) {
      /* Conta sem autorização: aviso informativo, não erro de senha. */
      setNotice(NOTICE_CODES.has(problem.code));
      setError(problem.message);
    } finally {
      setSending(false);
    }
  };

  const verify = async (value = code) => {
    if (sending) return;
    setError(null);
    setSending(true);

    try {
      const logged = await completeTwoFactor(challenge, value);
      goTo(logged);
    } catch (problem) {
      if (RECOMECAR.has(problem.code) && /expirou/i.test(problem.message)) {
        backToPassword(problem.message);
      } else {
        setError(problem.message);
        setCode('');
        codeRef.current?.focus();
      }
    } finally {
      setSending(false);
    }
  };

  const submitCode = (event) => {
    event.preventDefault();
    verify();
  };

  /* Código do app: só dígitos, e envia sozinho ao completar 6. */
  const changeCode = (event) => {
    if (useRecovery) {
      setCode(event.target.value.toUpperCase().slice(0, 24));
      return;
    }
    const digits = event.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6) verify(digits);
  };

  const toggleRecovery = () => {
    setUseRecovery((current) => !current);
    setCode('');
    setError(null);
  };

  const codeReady = useRecovery ? code.replace(/[\s-]/g, '').length >= 12 : code.length === 6;

  return (
    <main className="auth">
      <div className="auth__panel">
        <Link className="auth__brand" to="/">
          <Logo size={30} />
        </Link>

        {challenge ? (
          <>
            <h1 className="auth__title">Verificação em duas etapas</h1>
            <p className="auth__text">
              {useRecovery
                ? 'Digite um dos seus códigos de recuperação. Cada código funciona uma única vez.'
                : 'Abra o app autenticador e digite o código de 6 dígitos da sua conta TODAI.'}
            </p>
          </>
        ) : (
          <>
            <h1 className="auth__title">Entrar na sua conta</h1>
            <p className="auth__text">
              Acompanhe seus projetos e converse sobre o desenvolvimento.
            </p>
          </>
        )}

        {error ? (
          <div className={`alert ${notice ? 'alert--info' : 'alert--error'}`} role="alert">
            <Icon name={notice ? 'mail' : 'close'} size={16} />
            {error}
          </div>
        ) : null}

        {challenge ? (
          <form className="auth__form" onSubmit={submitCode} noValidate>
            <Field
              id="code"
              label={useRecovery ? 'Código de recuperação' : 'Código do app'}
              ref={codeRef}
              type="text"
              inputMode={useRecovery ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck="false"
              maxLength={useRecovery ? 24 : 14}
              placeholder={useRecovery ? 'XXXX-XXXX-XXXX' : '000000'}
              className="field__control sec-code"
              value={code}
              onChange={changeCode}
              disabled={sending}
              required
            />
            {secondsLeft !== null ? (
              <p className="sec-hint" aria-live="off">
                Esta verificação vale por mais {Math.floor(secondsLeft / 60)}:
                {String(secondsLeft % 60).padStart(2, '0')}.
              </p>
            ) : null}

            <button
              type="submit"
              className="btn btn--primary btn--block"
              disabled={sending || !codeReady}
            >
              {sending ? 'Verificando…' : 'Verificar e entrar'}
            </button>

            <button type="button" className="sec-link" onClick={toggleRecovery}>
              {useRecovery ? 'Usar o código do app' : 'Perdi o acesso ao app: usar código de recuperação'}
            </button>
            <button type="button" className="sec-link" onClick={() => backToPassword()}>
              Voltar e entrar com outra conta
            </button>
          </form>
        ) : (
          <form className="auth__form" onSubmit={submit} noValidate>
            <Field
              id="email"
              label="E-mail"
              type="email"
              autoComplete="username"
              value={form.email}
              onChange={update('email')}
              required
            />

            <Field
              id="password"
              label="Senha"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={update('password')}
              required
            />

            <button
              type="submit"
              className="btn btn--primary btn--block"
              disabled={sending}
            >
              {sending ? 'Entrando…' : 'Entrar'}
            </button>

            <Link className="sec-link" to="/esqueci-senha">
              Esqueci a senha
            </Link>
          </form>
        )}

        <p className="auth__foot">
          Ainda não tem conta? <Link to="/cadastro">Criar conta</Link>
        </p>

        <Link className="auth__back" to="/">
          <Icon name="arrowRight" size={14} className="auth__back-icon" />
          Voltar ao site
        </Link>
      </div>
    </main>
  );
}
