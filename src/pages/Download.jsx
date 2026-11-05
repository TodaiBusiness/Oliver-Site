import { Link } from 'react-router-dom';
import SiteShell from '../components/SiteShell.jsx';
import Icon from '../components/Icon.jsx';
import { createWhatsAppLink, whatsappLinkProps } from '../utils/contact.js';
import { WHATSAPP_MESSAGES } from '../data/company.js';
import { INSTALLER_URL, PRODUCT } from '../data/product.js';

/**
 * Download do instalador. O endereço vem do build (`VITE_INSTALLER_URL`): sem
 * ele a página não inventa um link, só explica como receber o instalador.
 * Instalar não dá acesso a nada sozinho; quem libera é o código de ativação.
 */
export default function Download() {
  return (
    <SiteShell>
      <div className="store-card">
        <span className="eyebrow">
          <span className="eyebrow__dot" aria-hidden="true" />
          Download
        </span>
        <h1 className="store-card__title">Baixe o {PRODUCT.name} para Windows.</h1>
        <p className="store-card__text">
          Requer {PRODUCT.platform}. Para usar, você precisa do código de
          ativação que enviamos por e-mail depois da compra.
        </p>

        <div className="store-card__actions">
          {INSTALLER_URL ? (
            <a className="btn btn--primary btn--lg" href={INSTALLER_URL} rel="noopener">
              <Icon name="arrowDown" size={17} />
              Baixar o instalador
            </a>
          ) : (
            <p className="store-note" role="status">
              O link do instalador é enviado por e-mail junto com o código de
              ativação, depois da compra.
            </p>
          )}
          <Link className="btn btn--ghost" to="/comprar">
            Ainda não comprei
          </Link>
        </div>

        <ol className="steps" aria-label="Como instalar">
          <li className="steps__item">
            <p className="steps__title">Execute o instalador</p>
            <p className="steps__text">
              Abra o arquivo baixado e siga as telas até concluir.
            </p>
          </li>
          <li className="steps__item">
            <p className="steps__title">Digite o código de ativação</p>
            <p className="steps__text">
              Na primeira abertura o sistema pede o código recebido por e-mail.
            </p>
          </li>
          <li className="steps__item">
            <p className="steps__title">Comece a vender</p>
            <p className="steps__text">
              Cadastre os produtos, abra o caixa e lance a primeira venda.
            </p>
          </li>
        </ol>

        <p className="store-note">
          <strong>O Windows mostrou um aviso de &ldquo;editor desconhecido&rdquo;?</strong>{' '}
          Isso acontece com instaladores que ainda não têm assinatura digital
          reconhecida. Clique em &ldquo;Mais informações&rdquo; e depois em
          &ldquo;Executar assim mesmo&rdquo; se o arquivo veio do nosso link.
        </p>

        <p className="store-note">
          Precisa de ajuda para instalar?{' '}
          <a
            href={createWhatsAppLink(WHATSAPP_MESSAGES.contact)}
            {...whatsappLinkProps}
            style={{ color: 'var(--accent-400)' }}
          >
            Fale com a gente pelo WhatsApp
          </a>
          .
        </p>
      </div>
    </SiteShell>
  );
}
