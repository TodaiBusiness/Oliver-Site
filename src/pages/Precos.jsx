import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import PageHero from '../components/PageHero.jsx';
import Pricing from '../sections/Pricing.jsx';
import FinalCta from '../sections/FinalCta.jsx';
import Faq from '../components/Faq.jsx';
import { SERVICES } from '../data/services.js';

const FAQ = [
  {
    q: 'Por que landing page, site e sistema não têm preço na tela?',
    a: 'Porque o valor depende do que você precisa: quantidade de telas, textos, integrações e regras. Preferimos entender o projeto e mandar uma proposta por escrito a chutar um número.',
  },
  {
    q: 'A proposta tem custo?',
    a: 'Não. Você conta a ideia, recebe a proposta e só segue se aprovar.',
  },
  {
    q: 'O TODAI também é sob orçamento?',
    a: 'O sistema tem preço fixo de instalação e mensalidade a partir de um valor. O total da mensalidade muda conforme os computadores da loja, e dá para ver na hora da compra.',
  },
];

/** Preços: o TODAI tem valor público; os serviços são sob orçamento. */
export default function Precos() {
  return (
    <>
      <PageHero
        title="Preço claro onde dá, orçamento onde precisa."
        lead="O sistema TODAI tem valor de tabela. Landing pages, sites e sistemas sob medida variam com o projeto, então saem em proposta."
      />

      <Pricing />

      <section className="section" aria-labelledby="orcamento-title">
        <div className="container">
          <div className="section-head section-head--row">
            <h2 className="section-head__title" id="orcamento-title">
              Serviços sob orçamento
            </h2>
            <p className="section-head__text">
              O que mais pesa no valor de cada um:
            </p>
          </div>

          <ul className="quote-list">
            {SERVICES.map((service) => (
              <li className="quote-list__item" key={service.slug}>
                <div>
                  <h3 className="quote-list__name">{service.plural}</h3>
                  <p className="quote-list__tag">Sob orçamento</p>
                </div>
                <ul className="ticks">
                  {service.pricingFactors.map((factor) => (
                    <li key={factor}>
                      <Icon name="check" size={16} />
                      {factor}
                    </li>
                  ))}
                </ul>
                <Link className="inline-link" to={service.to}>
                  Ver {service.plural.toLowerCase()}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section section--stack" aria-labelledby="preco-faq">
        <div className="container split">
          <h2 className="section-head__title" id="preco-faq">
            Dúvidas sobre preço
          </h2>
          <Faq items={FAQ} />
        </div>
      </section>

      <FinalCta origin="precos" title="Quer saber quanto custa o seu projeto?" text="Conte o que precisa e enviamos a proposta." />
    </>
  );
}
