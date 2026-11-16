import { stack } from '../data/stack.js';

/** Tecnologias e o papel de cada uma, sem barra de percentual inventada. */
export default function Stack() {
  return (
    <section className="section section--stack" aria-labelledby="stack-title">
      <div className="container">
        <div className="section-head section-head--row">
          <h2 className="section-head__title" id="stack-title">
            Escrevemos em C#, Python e JavaScript, sobre PostgreSQL.
          </h2>
        </div>

        <ul className="stack">
          {stack.map((item) => (
            <li key={item.id} className="stack__item">
              <span className="stack__label">{item.label}</span>
              <span className="stack__role">{item.role}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
