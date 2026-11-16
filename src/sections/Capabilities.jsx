import { capabilities } from '../data/capabilities.js';

/** "O que desenvolvemos": uma linha por frente, com o detalhe sempre visível. */
export default function Capabilities() {
  return (
    <section className="section" id="solucoes" aria-labelledby="solucoes-title">
      <div className="container">
        <div className="section-head section-head--row">
          <h2 className="section-head__title" id="solucoes-title">
            Programamos sistemas, sites, automações e bancos de dados.
          </h2>
        </div>

        <ul className="caps">
          {capabilities.map((cap) => (
            <li key={cap.id} className="cap">
              <h3 className="cap__title">{cap.title}</h3>
              <div>
                <p className="cap__items">{cap.items.join(', ')}</p>
                <p className="cap__detail">{cap.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
