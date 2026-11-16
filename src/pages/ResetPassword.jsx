import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import Field from '../components/panel/Field.jsx';
import { api } from '../api/client.js';

/** Lê o token do FRAGMENTO (#token=...) e o tira da barra de endereço na hora. */
function takeToken() {
  const match = /(?:^#|&)token=([\w-]+)/.exec(window.location.hash);
  if (match) {
    window.history.replaceState(null, '', window.location.pathname);
    return match[1];
  }
  return null;
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [token, setToken] = useState(null);
  const [form, setForm] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  /* Efeito (e não inicializador de estado): em StrictMode o inicializador roda
     duas vezes e o segundo já não encontraria o fragmento. */
  useEffect(() => {
    const found = takeToken();
    if (found) setToken(found);
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setErrors({});

    if (form.password !== form.confirm) {
      setErrors({ confirm: 'As senhas não são iguais.' });
      return;
    }

    setSending(true);
    try {
      await api.post('/auth/reset', { token, password: form.password });
      setDone(true);
    } catch (problem) {
      setErrors(problem.details ?? {});
      setError(problem.details ? null : problem.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="auth">
      <div className="auth__panel">
        <Link className="auth__brand" to="/">
          <Logo size={30} />
        </Link>

        <h1 className="auth__title">Criar nova senha</h1>

        {done ? (
          <>
            <div className="alert alert--success" role="status">
              <Icon name="check" size={16} />
              Senha alterada. Por segurança, todos os aparelhos foram desconectados.
            </div>
            <button type="button" className="btn btn--primary btn--block" onClick={() => navigate('/login', { replace: true })}>
              Entrar
            </button>
          </>
        ) : !token ? (
          <>
            <div className="alert alert--error" role="alert">
              <Icon name="close" size={16} />
              Este link é inválido ou já foi usado.
            </div>
            <Link className="btn btn--primary btn--block" to="/esqueci-senha">
              Pedir um novo link
            </Link>
          </>
        ) : (
          <>
            <p className="auth__text">Escolha uma senha nova para a sua conta.</p>

            {error ? (
              <div className="alert alert--error" role="alert">
                <Icon name="close" size={16} />
                {error}
              </div>
            ) : null}

            <form className="auth__form" onSubmit={submit} noValidate>
              <Field
                id="password"
                label="Nova senha"
                type="password"
                autoComplete="new-password"
                hint="Ao menos 10 caracteres, misturando letras e números."
                value={form.password}
                onChange={(event) => setForm((c) => ({ ...c, password: event.target.value }))}
                error={errors.password}
                required
              />
              <Field
                id="confirm"
                label="Repita a nova senha"
                type="password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={(event) => setForm((c) => ({ ...c, confirm: event.target.value }))}
                error={errors.confirm}
                required
              />
              <button type="submit" className="btn btn--primary btn--block" disabled={sending}>
                {sending ? 'Salvando…' : 'Salvar nova senha'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
