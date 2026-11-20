import { Link } from 'react-router-dom';
import { PLAN } from '../../shared/plan.js';
import PageHero from '../components/PageHero.jsx';
import Product from '../sections/Product.jsx';
import Pricing from '../sections/Pricing.jsx';
import { PRODUCT } from '../data/product.js';
import { EVENTS, track } from '../utils/analytics.js';

/** O produto TODAI: tour de telas, módulos e como começar, depois o preço. */
export default function Sistema() {
  return (
    <>
      <PageHero
        title={`${PRODUCT.name}: estoque, caixa e vendas da sua loja num só sistema.`}
        lead={`Roda no ${PRODUCT.platform}. Você compra pelo site, instala no computador da loja e começa a vender no mesmo dia.`}
      >
        <Link
          className="btn btn--primary btn--lg"
          to="/comprar"
          onClick={() => track(EVENTS.HERO_CTA_CLICK, { cta: 'comprar' })}
        >
          Comprar o {PLAN.name}
        </Link>
        <Link className="btn btn--ghost btn--lg" to="/sistema/pdv">
          Testar o PDV
        </Link>
        <Link className="btn btn--ghost btn--lg" to="/precos">
          Ver preços
        </Link>
      </PageHero>
      <Product />
      <Pricing />
    </>
  );
}
