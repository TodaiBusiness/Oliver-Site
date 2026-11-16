import { useState } from 'react';
import { Link } from 'react-router-dom';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import Field from '../components/panel/Field.jsx';
import { api } from '../api/client.js';

/** Pede o link de redefinição. A resposta é a mesma exista ou não a conta. */
export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError(null);
    setSending(true);
    try {
      await api.post('/auth/forgot', { email });
      setDone(true);
    } catch (problem) {
      setError(problem.message);
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

        <h1 className="auth__title">Esqueci a senha</h1>

        {done ? (
          <>
            <div className="alert alert--success" role="status">
              <Icon name="check" size={16} />
              Se existir uma conta com este e-mail, enviamos um link para redefinir a senha. Ele vale
              por 30 minutos.
            </div>
            <p className="auth__text">
              Não chegou? Veja a caixa de spam e, se precisar, peça de novo daqui a alguns minutos.
            </p>
          </>
        ) : (
          <>
            <p className="auth__text">
              Informe o e-mail da sua conta. Enviaremos um link para você criar uma senha nova.
            </p>

            {error ? (
              <div className="alert alert--error" role="alert">
                <Icon name="close" size={16} />
                {error}
              </div>
            ) : null}

            <form className="auth__form" onSubmit={submit} noValidate>
              <Field
                id="email"
                label="E-mail"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
              <button type="submit" className="btn btn--primary btn--block" disabled={sending || !email.trim()}>
                {sending ? 'Enviando…' : 'Enviar link'}
              </button>
            </form>
          </>
        )}

        <p className="auth__foot">
          Lembrou? <Link to="/login">Entrar</Link>
        </p>
      </div>
    </main>
  );
}
