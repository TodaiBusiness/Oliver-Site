import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { SERVICES } from '../data/services.js';

/** Os três serviços como um índice: uma linha por serviço, a linha toda é o link. */
export default function ServicesIndex({ showAll = true }) {
  return (
    <section className="section" aria-labelledby="servicos-title">
      <div className="container">
        <div className="section-head section-head--row">
          <h2 className="section-head__title" id="servicos-title">
            Sob medida, em três tamanhos.
          </h2>
          {showAll ? (
            <p className="section-head__text">
              Não sabe qual escolher? <Link className="inline-link" to="/servicos">Compare os três</Link>.
            </p>
          ) : null}
        </div>

        <ul className="svc-index">
          {SERVICES.map((service) => (
            <li key={service.slug}>
              <Link className="svc-index__row" to={service.to}>
                <span className="svc-index__name">{service.plural}</span>
                <span className="svc-index__text">{service.summary}</span>
                <span className="svc-index__go">
                  Ver detalhes
                  <Icon name="arrowRight" size={16} className="svc-index__arrow" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
