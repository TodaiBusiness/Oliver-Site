import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SiteShell from '../components/SiteShell.jsx';
import Field from '../components/panel/Field.jsx';
import Icon from '../components/Icon.jsx';
import { api, ApiError } from '../api/client.js';
import { formatBRL } from '../../shared/plan.js';
import { formatTaxId, isValidTaxId } from '../../shared/taxId.js';
import { createWhatsAppLink, whatsappLinkProps } from '../utils/contact.js';
import { WHATSAPP_MESSAGES } from '../data/company.js';
import { readAccessHash, shouldDiscardToken } from '../utils/accessToken.js';

/* =========================================================================
   Minha licença — área do cliente comprador.
   Sem senha: o cliente pede um link por e-mail e o link traz um token depois
   do "#" (o navegador não o envia ao servidor nem o grava em log). A página
   tira o token da barra de endereço assim que o lê e o guarda só nesta aba.
   ========================================================================= */

const TOKEN_KEY = 'oliver-acesso';

const STATES = {
  Active: { label: 'Em dia', tone: 'ok', text: 'O sistema está liberado para vender.' },
  GracePeriod: {
    label: 'Pagamento pendente',
    tone: 'warn',
    text: 'O sistema continua funcionando por alguns dias. Regularize para não entrar em somente leitura.',
  },
  ReadOnly: {
    label: 'Somente leitura',
    tone: 'warn',
    text: 'Você consegue consultar os dados, mas não registrar vendas. Regularize o pagamento para liberar.',
  },
  Cancelled: { label: 'Cancelada', tone: 'off', text: 'A assinatura foi cancelada. Fale com a gente para reativar.' },
  Revoked: { label: 'Bloqueada', tone: 'off', text: 'A licença foi bloqueada. Fale com a gente pelo WhatsApp.' },
  None: { label: 'Sem licença', tone: 'off', text: 'Ainda não há licença ativa para este cadastro.' },
};

const BILLING = {
  card: 'Cartão, cobrança mensal automática pelo Mercado Pago',
  manual: 'Pagamento combinado diretamente com a TODAI',
  none: 'Sem assinatura',
};

function readStoredToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* Sem armazenamento: o resumo vale até recarregar a página. */
  }
}

/** Lê o token do "#acesso=..." e limpa a barra de endereço. */
function takeTokenFromHash() {
  if (!/acesso=/.test(window.location.hash)) return null;
  /* Limpa a barra mesmo se o token for ilegível; token inválido = sem token. */
  const token = readAccessHash(window.location.hash);
  window.history.replaceState(null, '', window.location.pathname);
  return token;
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return 'ainda não conferiu';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value)
  );
}

export default function MyLicense() {
  const [token, setToken] = useState(() => takeTokenFromHash() ?? readStoredToken());
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [notice, setNotice] = useState(null);

  /* Link aberto com a página já carregada (mesma aba): o navegador só troca o "#". */
  useEffect(() => {
    function onHashChange() {
      const fromHash = takeTokenFromHash();
      if (fromHash) {
        /* Outro link: o resumo da licença anterior não vale mais. */
        setSummary(null);
        setNotice(null);
        setToken(fromHash);
      }
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    setLoading(true);
    api
      .post('/account/summary', { token })
      .then((result) => {
        if (!active) return;
        storeToken(token);
        setSummary(result);
      })
      .catch((failure) => {
        if (!active) return;
        setSummary(null);
        if (shouldDiscardToken(failure)) {
          storeToken(null);
          setToken(null);
          setNotice('Este link venceu ou não é válido. Peça um novo abaixo.');
          return;
        }
        /* Rede, 503, timeout: o token pode estar ótimo. Mantém guardado e
           deixa tentar de novo (recarregar a página). */
        setNotice('Não conseguimos abrir a sua licença agora. Recarregue a página para tentar de novo.');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  function leave() {
    storeToken(null);
    setToken(null);
    setSummary(null);
  }

  return (
    <SiteShell>
      {loading ? (
        <div className="store-card" role="status">
          <p className="store-card__text">Abrindo a sua licença…</p>
        </div>
      ) : summary ? (
        <Summary data={summary} onLeave={leave} />
      ) : (
        <RequestLink notice={notice} />
      )}
    </SiteShell>
  );
}

function RequestLink({ notice }) {
  const [values, setValues] = useState({ taxId: '', email: '' });
  const [errors, setErrors] = useState({});
  const [problem, setProblem] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (sending) return;
    const found = {};
    if (!isValidTaxId(values.taxId)) found.taxId = 'Confira o CPF ou o CNPJ.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) found.email = 'Confira o e-mail.';
    setErrors(found);
    setProblem(null);
    if (Object.keys(found).length) return;

    setSending(true);
    try {
      await api.post('/account/access-link', values);
      setSent(true);
    } catch (failure) {
      setProblem(failure instanceof ApiError ? failure.message : 'Não foi possível enviar agora.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="store-card">
      <span className="eyebrow">
        <span className="eyebrow__dot" aria-hidden="true" />
        Minha licença
      </span>
      <h1 className="store-card__title">Veja a sua licença e os computadores ativados.</h1>
      <p className="store-card__text">
        Informe o CPF ou CNPJ e o e-mail usados na compra. Mandamos um link de
        acesso para o e-mail cadastrado; ele vale 30 minutos e não precisa de senha.
      </p>

      {notice ? (
        <div className="alert alert--error" role="alert" style={{ marginTop: '1.25rem' }}>
          <Icon name="close" size={16} />
          {notice}
        </div>
      ) : null}

      {sent ? (
        <div className="alert alert--success" role="status" style={{ marginTop: '1.25rem' }}>
          <Icon name="check" size={16} />
          Se os dados baterem com um cadastro, o link chega em instantes. Confira
          também o spam.
        </div>
      ) : (
        <form className="buy__form account-form" onSubmit={handleSubmit} noValidate>
          {problem ? (
            <div className="alert alert--error" role="alert">
              <Icon name="close" size={16} />
              {problem}
            </div>
          ) : null}
          <Field
            id="conta-documento"
            label="CPF ou CNPJ"
            inputMode="numeric"
            value={values.taxId}
            onChange={(event) => setValues((v) => ({ ...v, taxId: event.target.value }))}
            onBlur={() => setValues((v) => ({ ...v, taxId: formatTaxId(v.taxId) }))}
            error={errors.taxId}
            maxLength={18}
            autoComplete="off"
          />
          <Field
            id="conta-email"
            label="E-mail da compra"
            type="email"
            value={values.email}
            onChange={(event) => setValues((v) => ({ ...v, email: event.target.value }))}
            error={errors.email}
            autoComplete="email"
            maxLength={190}
          />
          <button type="submit" className="btn btn--primary" disabled={sending}>
            {sending ? 'Enviando…' : 'Receber link de acesso'}
          </button>
        </form>
      )}

      <p className="store-note">
        Ainda não é cliente? <Link to="/comprar">Veja como comprar</Link>.
      </p>
    </div>
  );
}

function Summary({ data, onLeave }) {
  const state = STATES[data.licenseState] ?? STATES.None;
  const devices = Array.isArray(data.devices) ? data.devices : [];

  return (
    <div className="account">
      <header className="account__head">
        <div>
          <span className="eyebrow">
            <span className="eyebrow__dot" aria-hidden="true" />
            Minha licença
          </span>
          <h1 className="store-card__title">{data.companyName}</h1>
          <p className="store-card__text">Olá, {data.contactFirstName}.</p>
        </div>
        <button type="button" className="btn btn--soft btn--sm" onClick={onLeave}>
          Sair
        </button>
      </header>

      <section className={`account__status account__status--${state.tone}`} aria-label="Situação da licença">
        <p className="account__label">Situação</p>
        <p className="account__value">{state.label}</p>
        <p className="account__hint">{state.text}</p>
      </section>

      <div className="account__grid">
        <section className="account__box" aria-label="Pagamento">
          <p className="account__label">Pago até</p>
          <p className="account__value">{formatDate(data.paidUntil)}</p>
          {data.licenseState === 'GracePeriod' && data.graceUntil ? (
            <p className="account__hint">Tolerância até {formatDate(data.graceUntil)}.</p>
          ) : null}
          <p className="account__hint">
            {data.monthlyAmount != null ? `${formatBRL(data.monthlyAmount)} por mês · ` : ''}
            {BILLING[data.billingMethod] ?? BILLING.none}
          </p>
        </section>

        <section className="account__box" aria-label="Computadores">
          <p className="account__label">Computadores</p>
          <p className="account__value">
            {data.activeDevices} de {data.allowedDevices}
          </p>
          <p className="account__hint">ativados no seu plano</p>
        </section>
      </div>

      <section className="account__box" aria-labelledby="conta-computadores">
        <h2 className="account__subtitle" id="conta-computadores">
          Computadores ativados
        </h2>
        {devices.length ? (
          <ul className="account__devices">
            {devices.map((device, index) => (
              <li key={`${device.name}-${index}`}>
                <span className="account__device-name">
                  <Icon name="monitor" size={16} />
                  {device.name}
                </span>
                <span className="account__hint">Última conferência: {formatDateTime(device.lastCheckAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="account__hint">Nenhum computador ativado ainda.</p>
        )}
      </section>

      <div className="store-card__actions">
        {data.installerUrl ? (
          <a className="btn btn--primary" href={data.installerUrl} rel="noopener">
            <Icon name="arrowDown" size={17} />
            Baixar o instalador
          </a>
        ) : null}
        <a
          className="btn btn--ghost"
          href={createWhatsAppLink(
            `Olá! Sou cliente (${data.companyName}) e preciso de ajuda com a minha licença.`
          )}
          {...whatsappLinkProps}
        >
          <Icon name="whatsapp" size={17} />
          Novo código, mais computadores ou cancelamento
        </a>
      </div>
      <p className="store-note">
        Precisa de outra coisa? <a href={createWhatsAppLink(WHATSAPP_MESSAGES.contact)} {...whatsappLinkProps}>Fale com a gente</a>.
      </p>
    </div>
  );
}
