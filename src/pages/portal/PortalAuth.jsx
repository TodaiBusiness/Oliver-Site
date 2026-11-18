import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { usePortal } from './PortalContext.jsx';
import { Field, Notice, PageTitle, describedBy } from './ui.jsx';

/* Telas de entrada do portal: entrar, criar conta, esqueci a senha e redefinir. */

function PasswordInput({ id, value, onChange, autoComplete, invalid, describedby }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="p-pass">
      <input
        id={id}
        className="p-input"
        type={shown ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        aria-invalid={invalid || undefined}
        aria-describedby={describedby}
        required
        autoCapitalize="none"
        spellCheck={false}
      />
      <button type="button" className="p-pass__toggle" onClick={() => setShown((s) => !s)} aria-pressed={shown}>
        {shown ? 'Ocultar' : 'Mostrar'}
      </button>
    </div>
  );
}

function useFormErrors() {
  const [error, setError] = useState(null);
  const [fields, setFields] = useState({});
  const summary = useRef(null);
  const fail = (e) => {
    setError(e?.message ?? 'Algo deu errado. Tente de novo.');
    setFields(e?.details && typeof e.details === 'object' ? e.details : {});
    setTimeout(() => summary.current?.focus(), 0);
  };
  const clear = () => {
    setError(null);
    setFields({});
  };
  return { error, fields, fail, clear, summary };
}

function ErrorSummary({ error, summary }) {
  if (!error) return null;
  return (
    <div className="p-notice p-notice--danger" role="alert" tabIndex={-1} ref={summary}>
      <div className="p-notice__body">{error}</div>
    </div>
  );
}

/* --------------------------------------------------------------- entrar */
export function PortalLogin() {
  const { signIn, signedIn, path, flash, clearFlash } = usePortal();
  const location = useLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: location.state?.email ?? '', password: '' });
  const [sending, setSending] = useState(false);
  const errors = useFormErrors();

  if (signedIn) return <Navigate to={location.state?.from ?? path('catalogo')} replace />;

  const submit = async (event) => {
    event.preventDefault();
    errors.clear();
    setSending(true);
    try {
      await signIn({ email: form.email.trim(), password: form.password });
      navigate(location.state?.from ?? path('catalogo'), { replace: true });
    } catch (e) {
      errors.fail(e);
      setForm((f) => ({ ...f, password: '' }));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-narrow">
      <PageTitle sub="Use o e-mail e a senha do seu cadastro nesta loja.">Entrar</PageTitle>
      {location.state?.registered ? (
        <Notice tone="ok" title="Cadastro recebido">
          Agora é só entrar. A loja analisa o cadastro e, enquanto isso, você já pode pedir com preços de varejo.
        </Notice>
      ) : null}
      {location.state?.reset ? (
        <Notice tone="ok" title="Senha alterada">
          Entre com a nova senha.
        </Notice>
      ) : null}
      {flash ? (
        <Notice tone="warn" title="Sessão encerrada">
          {flash}
        </Notice>
      ) : null}

      <form className="p-form" onSubmit={submit} noValidate={false} onChange={flash ? clearFlash : undefined}>
        <ErrorSummary error={errors.error} summary={errors.summary} />
        <Field id="p-email" label="E-mail">
          <input
            id="p-email"
            className="p-input"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            required
          />
        </Field>
        <Field id="p-senha" label="Senha">
          <PasswordInput id="p-senha" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" />
        </Field>
        <button className="p-btn p-btn--primary p-btn--lg p-btn--block" type="submit" disabled={sending}>
          {sending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>

      <p className="p-center-text">
        <Link className="p-link" to={path('esqueci-senha')}>
          Esqueci minha senha
        </Link>
      </p>
      <p className="p-center-text p-muted">
        Ainda não tem conta?{' '}
        <Link className="p-link" to={path('cadastro')}>
          Criar conta
        </Link>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- cadastro */
const VAZIO = {
  type: 'consumidor',
  name: '',
  email: '',
  phone: '',
  business: '',
  document: '',
  password: '',
  rua: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  cep: '',
  accept: false,
};

export function PortalRegister() {
  const { api, signedIn, path } = usePortal();
  const navigate = useNavigate();
  const [form, setForm] = useState(VAZIO);
  const [sending, setSending] = useState(false);
  const errors = useFormErrors();
  const revenda = form.type === 'revenda';

  if (signedIn) return <Navigate to={path('catalogo')} replace />;

  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  const err = (field) => errors.fields[field];
  const aria = (id, field, hint) => describedBy(id, { error: err(field), hint });

  const submit = async (event) => {
    event.preventDefault();
    errors.clear();
    setSending(true);
    try {
      await api.register({
        type: form.type,
        name: form.name,
        email: form.email.trim(),
        phone: form.phone,
        password: form.password,
        ...(revenda ? { business: form.business } : {}),
        ...(form.document.trim() ? { document: form.document } : {}),
        address: { rua: form.rua, numero: form.numero, complemento: form.complemento, bairro: form.bairro, cidade: form.cidade, uf: form.uf, cep: form.cep },
        acceptPrivacy: form.accept,
      });
      navigate(path('entrar'), { state: { registered: true, email: form.email.trim() }, replace: true });
    } catch (e) {
      errors.fail(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-narrow">
      <PageTitle sub="Leva um minuto. A loja pode aprovar o seu cadastro para liberar preços de atacado.">Criar conta</PageTitle>
      <form className="p-form" onSubmit={submit}>
        <ErrorSummary error={errors.error} summary={errors.summary} />

        <fieldset className="p-fieldset">
          <legend className="p-legend">Tipo de cadastro</legend>
          <label className="p-choice">
            <input type="radio" name="tipo" value="consumidor" checked={!revenda} onChange={set('type')} />
            <span>
              <strong>Sou cliente</strong>
              <small>Compro para uso próprio.</small>
            </span>
          </label>
          <label className="p-choice">
            <input type="radio" name="tipo" value="revenda" checked={revenda} onChange={set('type')} />
            <span>
              <strong>Tenho um estabelecimento</strong>
              <small>Compro para revender ou usar no meu negócio.</small>
            </span>
          </label>
        </fieldset>

        <Field id="p-nome" label="Seu nome" error={err('name')}>
          <input id="p-nome" className="p-input" value={form.name} onChange={set('name')} autoComplete="name" required maxLength={120} aria-invalid={!!err('name') || undefined} aria-describedby={aria('p-nome', 'name')} />
        </Field>
        {revenda ? (
          <Field id="p-estab" label="Nome do estabelecimento" error={err('business')}>
            <input id="p-estab" className="p-input" value={form.business} onChange={set('business')} autoComplete="organization" required maxLength={120} aria-invalid={!!err('business') || undefined} aria-describedby={aria('p-estab', 'business')} />
          </Field>
        ) : null}
        <Field id="p-tel" label="Telefone com DDD" error={err('phone')}>
          <input id="p-tel" className="p-input" type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" inputMode="tel" required maxLength={30} aria-invalid={!!err('phone') || undefined} aria-describedby={aria('p-tel', 'phone')} />
        </Field>
        <Field id="p-email" label="E-mail" error={err('email')}>
          <input id="p-email" className="p-input" type="email" value={form.email} onChange={set('email')} autoComplete="email" inputMode="email" autoCapitalize="none" required aria-invalid={!!err('email') || undefined} aria-describedby={aria('p-email', 'email')} />
        </Field>
        <Field id="p-doc" label="CPF ou CNPJ" optional error={err('document')} hint={revenda ? 'A loja pode pedir para liberar preços de atacado.' : undefined}>
          <input id="p-doc" className="p-input" value={form.document} onChange={set('document')} inputMode="numeric" autoComplete="off" maxLength={20} aria-invalid={!!err('document') || undefined} aria-describedby={aria('p-doc', 'document', revenda)} />
        </Field>
        <Field id="p-senha" label="Senha" error={err('password')} hint="Pelo menos 10 caracteres, com letras e números.">
          <PasswordInput id="p-senha" value={form.password} onChange={set('password')} autoComplete="new-password" invalid={!!err('password')} describedby={aria('p-senha', 'password', true)} />
        </Field>

        <fieldset className="p-fieldset">
          <legend className="p-legend">{revenda ? 'Endereço de entrega' : 'Endereço de entrega (opcional)'}</legend>
          <div className="p-grid2">
            <Field id="p-rua" label="Rua" error={err('endereco.rua')}>
              <input id="p-rua" className="p-input" value={form.rua} onChange={set('rua')} autoComplete="address-line1" required={revenda} maxLength={120} aria-invalid={!!err('endereco.rua') || undefined} aria-describedby={aria('p-rua', 'endereco.rua')} />
            </Field>
            <Field id="p-num" label="Número" error={err('endereco.numero')}>
              <input id="p-num" className="p-input" value={form.numero} onChange={set('numero')} required={revenda} maxLength={20} aria-invalid={!!err('endereco.numero') || undefined} aria-describedby={aria('p-num', 'endereco.numero')} />
            </Field>
          </div>
          <Field id="p-compl" label="Complemento" optional>
            <input id="p-compl" className="p-input" value={form.complemento} onChange={set('complemento')} autoComplete="address-line2" maxLength={80} />
          </Field>
          <div className="p-grid2">
            <Field id="p-bairro" label="Bairro" error={err('endereco.bairro')}>
              <input id="p-bairro" className="p-input" value={form.bairro} onChange={set('bairro')} required={revenda} maxLength={80} aria-invalid={!!err('endereco.bairro') || undefined} aria-describedby={aria('p-bairro', 'endereco.bairro')} />
            </Field>
            <Field id="p-cidade" label="Cidade" error={err('endereco.cidade')}>
              <input id="p-cidade" className="p-input" value={form.cidade} onChange={set('cidade')} autoComplete="address-level2" required={revenda} maxLength={80} aria-invalid={!!err('endereco.cidade') || undefined} aria-describedby={aria('p-cidade', 'endereco.cidade')} />
            </Field>
          </div>
          <div className="p-grid2">
            <Field id="p-uf" label="Estado (sigla)" error={err('endereco.uf')}>
              <input id="p-uf" className="p-input" value={form.uf} onChange={set('uf')} maxLength={2} autoCapitalize="characters" autoComplete="address-level1" aria-invalid={!!err('endereco.uf') || undefined} aria-describedby={aria('p-uf', 'endereco.uf')} />
            </Field>
            <Field id="p-cep" label="CEP" optional error={err('endereco.cep')}>
              <input id="p-cep" className="p-input" value={form.cep} onChange={set('cep')} inputMode="numeric" autoComplete="postal-code" maxLength={9} aria-invalid={!!err('endereco.cep') || undefined} aria-describedby={aria('p-cep', 'endereco.cep')} />
            </Field>
          </div>
        </fieldset>

        <div className={`p-field${err('acceptPrivacy') ? ' p-field--error' : ''}`}>
          <label className="p-check">
            <input type="checkbox" checked={form.accept} onChange={set('accept')} required aria-describedby={err('acceptPrivacy') ? 'p-aceite-error' : undefined} />
            <span>
              Li e aceito a{' '}
              <a className="p-link" href="/privacidade" target="_blank" rel="noopener noreferrer">
                política de privacidade
              </a>
              . Os meus dados serão usados para atender os meus pedidos nesta loja.
            </span>
          </label>
          {err('acceptPrivacy') ? (
            <p className="p-field__error" id="p-aceite-error">
              {err('acceptPrivacy')}
            </p>
          ) : null}
        </div>

        <button className="p-btn p-btn--primary p-btn--lg p-btn--block" type="submit" disabled={sending}>
          {sending ? 'Criando conta…' : 'Criar conta'}
        </button>
      </form>
      <p className="p-center-text p-muted">
        Já tem conta?{' '}
        <Link className="p-link" to={path('entrar')}>
          Entrar
        </Link>
      </p>
    </div>
  );
}

/* ------------------------------------------------------- esqueci a senha */
export function PortalForgot() {
  const { api, path } = usePortal();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const errors = useFormErrors();

  const submit = async (event) => {
    event.preventDefault();
    errors.clear();
    setSending(true);
    try {
      await api.forgot(email.trim());
      setDone(true);
    } catch (e) {
      errors.fail(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-narrow">
      <PageTitle sub="Informe o e-mail do cadastro e enviaremos um link para criar uma nova senha.">Esqueci minha senha</PageTitle>
      {done ? (
        <>
          <Notice tone="ok" title="Pedido enviado">
            Se existir uma conta com este e-mail, enviamos um link para criar uma nova senha. Ele vale por 30 minutos. Olhe também a caixa de spam.
          </Notice>
          <p className="p-center-text">
            <Link className="p-btn p-btn--ghost" to={path('entrar')}>
              Voltar para entrar
            </Link>
          </p>
        </>
      ) : (
        <form className="p-form" onSubmit={submit}>
          <ErrorSummary error={errors.error} summary={errors.summary} />
          <Field id="p-email" label="E-mail">
            <input id="p-email" className="p-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" inputMode="email" autoCapitalize="none" required />
          </Field>
          <button className="p-btn p-btn--primary p-btn--lg p-btn--block" type="submit" disabled={sending}>
            {sending ? 'Enviando…' : 'Enviar link'}
          </button>
          <p className="p-center-text">
            <Link className="p-link" to={path('entrar')}>
              Voltar para entrar
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}

/* -------------------------------------------------------------- redefinir */
export function PortalReset() {
  const { api, path } = usePortal();
  const navigate = useNavigate();
  const location = useLocation();
  /* O token vem no fragmento (#token=...): nunca vai na requisição de página nem no Referer. */
  const [token] = useState(() => new URLSearchParams(location.hash.replace(/^#/, '')).get('token') ?? '');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [sending, setSending] = useState(false);
  const errors = useFormErrors();

  useEffect(() => {
    if (location.hash) window.history.replaceState(null, '', location.pathname + location.search);
  }, [location.hash, location.pathname, location.search]);

  const submit = async (event) => {
    event.preventDefault();
    errors.clear();
    if (password !== again) {
      errors.fail({ message: 'As duas senhas precisam ser iguais.' });
      return;
    }
    setSending(true);
    try {
      await api.reset({ token, password });
      navigate(path('entrar'), { state: { reset: true }, replace: true });
    } catch (e) {
      errors.fail(e);
    } finally {
      setSending(false);
    }
  };

  if (!token) {
    return (
      <div className="p-narrow">
        <PageTitle>Link inválido</PageTitle>
        <Notice tone="warn">Este link está incompleto ou já foi usado. Peça um novo.</Notice>
        <p className="p-center-text">
          <Link className="p-btn p-btn--primary" to={path('esqueci-senha')}>
            Pedir novo link
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="p-narrow">
      <PageTitle sub="Escolha uma senha nova para a sua conta nesta loja.">Criar nova senha</PageTitle>
      <form className="p-form" onSubmit={submit}>
        <ErrorSummary error={errors.error} summary={errors.summary} />
        <Field id="p-nova" label="Nova senha" hint="Pelo menos 10 caracteres, com letras e números.">
          <PasswordInput id="p-nova" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" describedby="p-nova-hint" />
        </Field>
        <Field id="p-nova2" label="Repita a nova senha">
          <PasswordInput id="p-nova2" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" />
        </Field>
        <button className="p-btn p-btn--primary p-btn--lg p-btn--block" type="submit" disabled={sending}>
          {sending ? 'Salvando…' : 'Salvar nova senha'}
        </button>
      </form>
    </div>
  );
}

/** Páginas que exigem conta: sem sessão, vão para "entrar" e voltam depois. */
export function RequireLogin({ children }) {
  const { session, path } = usePortal();
  const location = useLocation();
  if (session.status === 'loading') return <div className="p-loading" role="status">Verificando a sua conta…</div>;
  if (session.status !== 'in') return <Navigate to={path('entrar')} replace state={{ from: location.pathname }} />;
  return children;
}
