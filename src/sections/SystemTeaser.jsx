import { Link } from 'react-router-dom';
import { PLAN } from '../../shared/plan.js';
import { PRODUCT } from '../data/product.js';
import { EVENTS, track } from '../utils/analytics.js';

const reais = (value) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);

/** Chamada para o produto pronto, com o preço que já existe no plano. */
export default function SystemTeaser() {
  return (
    <section className="section section--stack" aria-labelledby="teaser-title">
      <div className="container teaser">
        <figure className="tour__frame teaser__shot">
          {['escuro', 'claro'].map((theme) => (
            <img
              key={theme}
              className={`tour__shot shot-${theme}`}
              src={`/sistema/estoque-${theme}.webp`}
              alt="Tela Estoque e Riscos do TODAI, com o valor por categoria e a tabela de produtos."
              width="1366"
              height="768"
              loading="lazy"
              decoding="async"
            />
          ))}
        </figure>

        <div>
          <h2 className="section-head__title" id="teaser-title">
            Tem loja? O {PRODUCT.name} já está pronto.
          </h2>
          <p className="prose">
            {PRODUCT.tagline} Roda no {PRODUCT.platform}. Você compra pelo site, instala e começa a vender no mesmo
            dia.
          </p>
          <p className="teaser__price">
            Instalação de <strong>{reais(PLAN.installPrice)}</strong> e mensalidade a partir de{' '}
            <strong>{reais(PLAN.basePrice)}</strong>.
          </p>
          <div className="page-hero__actions">
            <Link
              className="btn btn--primary"
              to="/comprar"
              onClick={() => track(EVENTS.HERO_CTA_CLICK, { cta: 'comprar' })}
            >
              Comprar o {PRODUCT.name}
            </Link>
            <Link className="btn btn--ghost" to="/sistema">
              Ver as telas
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
