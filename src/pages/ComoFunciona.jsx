import PageHero from '../components/PageHero.jsx';
import HowItWorksDemo from '../components/HowItWorksDemo.jsx';
import ClientArea from '../sections/ClientArea.jsx';
import FinalCta from '../sections/FinalCta.jsx';
import { HOW_STEPS } from '../data/process.js';

/** Como funciona: a demonstração animada e, abaixo, o que cada lado faz em cada etapa. */
export default function ComoFunciona() {
  return (
    <>
      <PageHero
        title="Do primeiro contato ao projeto no ar."
        lead="Você sabe em que etapa está o tempo todo. Veja o caminho em cinco cenas e, mais abaixo, o que cada lado faz."
      />

      <section className="section" aria-label="Demonstração animada">
        <div className="container">
          <HowItWorksDemo />
        </div>
      </section>

      <section className="section section--stack" aria-labelledby="etapas-title">
        <div className="container">
          <h2 className="section-head__title" id="etapas-title">
            O que acontece em cada etapa
          </h2>
          <ol className="steps-table">
            {HOW_STEPS.map((step) => (
              <li className="steps-table__row" key={step.title}>
                <h3 className="steps-table__title">{step.title}</h3>
                <p>
                  <span className="steps-table__who">Você</span>
                  {step.you}
                </p>
                <p>
                  <span className="steps-table__who">Nós</span>
                  {step.us}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <ClientArea />
      <FinalCta origin="como-funciona" />
    </>
  );
}
