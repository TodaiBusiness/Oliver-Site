import { Link } from 'react-router-dom';
import Hero from '../sections/Hero.jsx';
import ServicesIndex from '../sections/ServicesIndex.jsx';
import SystemTeaser from '../sections/SystemTeaser.jsx';
import FinalCta from '../sections/FinalCta.jsx';
import HowItWorksDemo from '../components/HowItWorksDemo.jsx';

/** Início: proposta, como funciona, os três serviços, o sistema pronto e o convite. */
export default function Home() {
  return (
    <>
      <Hero />

      <section className="section" aria-labelledby="demo-title">
        <div className="container">
          <div className="section-head section-head--row">
            <h2 className="section-head__title" id="demo-title">
              Do primeiro contato ao projeto no ar.
            </h2>
            <p className="section-head__text">
              Cinco etapas, todas acompanhadas por você. <Link className="inline-link" to="/como-funciona">Ver em detalhe</Link>.
            </p>
          </div>
          <HowItWorksDemo />
        </div>
      </section>

      <ServicesIndex />
      <SystemTeaser />
      <FinalCta origin="home" />
    </>
  );
}
