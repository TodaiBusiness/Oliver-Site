import { useCallback, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import { useConsent } from '../hooks/useConsent.js';
import { useDialog } from '../hooks/useDialog.js';
import {
  acceptAll,
  acceptNecessaryOnly,
  closeConsentPreferences,
  openConsentPreferences,
  saveConsent,
} from '../utils/consent.js';

/**
 * Faixa de consentimento de cookies e painel de preferências.
 * A faixa fica no topo da página, fora do caminho do conteúdo, enquanto não há escolha válida (primeiro acesso ou política
 * nova) e não prende o foco nem cobre o site: a pessoa pode ignorá-la e
 * navegar, e nada de estatística é enviado até ela decidir. As três ações
 * têm o mesmo peso. O painel abre também pelo link do rodapé.
 */
export default function CookieConsent() {
  const { consent, panelOpen } = useConsent();
  return (
    <>
      {!consent && <Banner />}
      {panelOpen && <Preferences initialAnalytics={consent?.analytics === true} />}
    </>
  );
}

function Banner() {
  const titleId = useId();

  return (
    <section className="consent" aria-labelledby={titleId}>
     <div className="container consent__inner">
      <div className="consent__copy">
      <h2 className="consent__title" id={titleId}>
        Você decide sobre os cookies
      </h2>
      <p className="consent__text">
        Usamos cookies necessários para o site funcionar. Com a sua permissão, também contamos
        as visitas, sem identificar você. Veja os detalhes na{' '}
        <Link to="/privacidade">política de privacidade</Link>.
      </p>
      </div>
      <div className="consent__actions" role="group" aria-label="Escolha sobre cookies">
        <button type="button" className="consent__action" onClick={acceptAll}>
          Aceitar tudo
        </button>
        <button type="button" className="consent__action" onClick={acceptNecessaryOnly}>
          Só o necessário
        </button>
        <button type="button" className="consent__action" onClick={openConsentPreferences}>
          Escolher
        </button>
      </div>
     </div>
    </section>
  );
}

const NECESSARY = [
  {
    name: 'oi_session',
    what: 'Mantém você conectado na área do cliente. Só existe depois do login.',
    life: 'Cookie. Até 8 horas, e some antes se você ficar parado ou sair.',
  },
  {
    name: 'todai_consent',
    what: 'Guarda esta escolha, para não perguntar de novo a cada visita.',
    life: 'Cookie. 12 meses.',
  },
  {
    name: 'todai-theme',
    what: 'Lembra se você prefere o tema claro ou o escuro.',
    life: 'Armazenamento local. Fica até você apagar os dados do site.',
  },
  {
    name: 'todai:funil',
    what: 'Guarda as respostas do assistente de orçamento enquanto você preenche.',
    life: 'Armazenamento da aba. Some ao fechar a aba.',
  },
  {
    name: 'todai-acesso',
    what: 'Mantém aberto o resumo da sua licença depois de entrar pelo link do e-mail.',
    life: 'Armazenamento da aba. Some ao fechar a aba.',
  },
];

function Preferences({ initialAnalytics }) {
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const titleId = useId();
  const descId = useId();
  const onClose = useCallback(() => closeConsentPreferences(), []);
  const { dialogRef, initialFocusRef } = useDialog(true, onClose);

  return (
    <div
      className="consent-modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="consent-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        ref={dialogRef}
      >
        <header className="consent-panel__head">
          <h2 id={titleId} tabIndex={-1} ref={initialFocusRef}>
            Preferências de cookies
          </h2>
          <button type="button" className="consent-panel__close" onClick={onClose} aria-label="Fechar sem salvar">
            <Icon name="close" size={18} />
          </button>
        </header>

        <div className="consent-panel__body">
          <p id={descId} className="consent-panel__intro">
            Escolha o que o site pode guardar no seu navegador. Você pode mudar quando quiser, pelo
            link &quot;Preferências de cookies&quot; no rodapé.
          </p>

          <section className="consent-group" aria-labelledby={`${titleId}-nec`}>
            <div className="consent-group__top">
              <h3 id={`${titleId}-nec`}>Necessários</h3>
              <span className="consent-group__fixed">Sempre ativos</span>
            </div>
            <p className="consent-group__text">
              Sem eles o site não funciona direito, por isso não dá para desligá-los. Não servem
              para propaganda nem para acompanhar você em outros sites.
            </p>
            <ul className="consent-list">
              {NECESSARY.map((item) => (
                <li key={item.name}>
                  <code>{item.name}</code>
                  <span>{item.what}</span>
                  <span className="consent-list__life">{item.life}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="consent-group" aria-labelledby={`${titleId}-stats`}>
            <div className="consent-group__top">
              <h3 id={`${titleId}-stats`}>Estatísticas</h3>
              <label className="consent-switch">
                <input
                  type="checkbox"
                  role="switch"
                  checked={analytics}
                  onChange={(event) => setAnalytics(event.target.checked)}
                  aria-labelledby={`${titleId}-stats`}
                />
                <span className="consent-switch__track" aria-hidden="true" />
                <span className="consent-switch__state">{analytics ? 'Ativas' : 'Desativadas'}</span>
              </label>
            </div>
            <p className="consent-group__text">
              Contamos quantas pessoas abrem cada página, em números somados por dia: país e cidade
              aproximados, de onde você veio, tipo de aparelho e a página. Não guardamos seu IP, não
              gravamos cookie nem identificador seu para isso e não identificamos você. Se o seu
              navegador envia &quot;Do Not Track&quot; ou &quot;Global Privacy Control&quot;, não
              contamos, mesmo com esta opção ativa.
            </p>
          </section>
        </div>

        <footer className="consent-panel__foot">
          <button type="button" className="btn btn--primary" onClick={() => saveConsent({ analytics })}>
            Salvar escolha
          </button>
          <button type="button" className="btn btn--soft" onClick={onClose}>
            Cancelar
          </button>
        </footer>
      </div>
    </div>
  );
}
