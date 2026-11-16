import { processSteps } from '../data/process.js';

export default function Process() {
  return (
    <section className="section" aria-labelledby="processo-title">
      <div className="container">
        <div className="section-head section-head--row">
          <h2 className="section-head__title" id="processo-title">
            Como trabalhamos.
          </h2>
        </div>

        <ol className="process">
          {processSteps.map((step) => (
            <li key={step.number} className="step">
              <span className="step__number">{step.number}</span>
              <h3 className="step__title">{step.title}</h3>
              <p className="step__text">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
