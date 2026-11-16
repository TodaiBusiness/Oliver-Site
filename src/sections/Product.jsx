import { useRef, useState } from 'react';
import { MORE_MODULES, OFFLINE_NOTE, PRODUCT, STEPS, TOUR } from '../data/product.js';

/** Tamanho das capturas em public/sistema (evita o salto de layout). */
const SHOT_W = 1366;
const SHOT_H = 768;

/** O sistema por dentro (telas reais), o que mais ele tem e como começar. */
export default function Product() {
  const [active, setActive] = useState(0);
  const tabRefs = useRef([]);
  const current = TOUR[active];

  /* Setas, Home e End movem a seleção, como em qualquer lista de abas. */
  const onKeyDown = (event) => {
    const last = TOUR.length - 1;
    const next = {
      ArrowRight: active === last ? 0 : active + 1,
      ArrowLeft: active === 0 ? last : active - 1,
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
    tabRefs.current[next]?.focus();
  };

  return (
    <section className="section" id="sistema" aria-labelledby="sistema-title">
      <div className="container">
        <div className="section-head tour__head">
          <h2 className="section-head__title" id="sistema-title">
            Veja o {PRODUCT.name} funcionando.
          </h2>
          <p className="section-head__text">
            Estas são telas reais do sistema, com dados de exemplo. {PRODUCT.tagline}
          </p>
        </div>

        <div className="tour">
          <div
            className="tour__tabs"
            role="tablist"
            aria-label="Telas do sistema"
            onKeyDown={onKeyDown}
          >
            {TOUR.map((item, index) => (
              <button
                key={item.id}
                ref={(node) => {
                  tabRefs.current[index] = node;
                }}
                type="button"
                role="tab"
                id={`tour-tab-${item.id}`}
                aria-selected={index === active}
                aria-controls="tour-panel"
                tabIndex={index === active ? 0 : -1}
                className="tour__tab"
                onClick={() => setActive(index)}
              >
                {item.tab}
              </button>
            ))}
          </div>

          <div
            className="tour__panel"
            role="tabpanel"
            id="tour-panel"
            aria-labelledby={`tour-tab-${current.id}`}
          >
            {/* A chave refaz o quadro a cada aba: é o que dispara a troca suave. */}
            <figure className="tour__frame" key={current.id}>
              {['escuro', 'claro'].map((theme) => (
                <img
                  key={theme}
                  className={`tour__shot shot-${theme}`}
                  src={`/sistema/${current.id}-${theme}.webp`}
                  alt={current.alt}
                  width={SHOT_W}
                  height={SHOT_H}
                  loading="lazy"
                  decoding="async"
                />
              ))}
            </figure>

            <div className="tour__facts">
              <h3 className="tour__title">{current.title}</h3>
              <ul className="tour__list">
                {current.facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="more" aria-labelledby="mais-title">
          <h3 className="more__title" id="mais-title">
            Também no sistema
          </h3>
          <p className="more__lead">
            Cada módulo aparece só quando você liga. Os opcionais começam desligados e
            se ligam em Configurações, Módulos.
          </p>
          <div className="more__groups">
            {MORE_MODULES.map((group) => (
              <section className="more__group" key={group.group}>
                <h4 className="more__group-title">{group.group}</h4>
                <ul>
                  {group.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>

        <div className="start">
          <h3 className="start__title">Como começar</h3>
          <ol className="start__steps">
            {STEPS.map((step) => (
              <li className="start__step" key={step.title}>
                <p className="start__step-title">{step.title}</p>
                <p className="start__step-text">{step.text}</p>
              </li>
            ))}
          </ol>
          <p className="start__note">{OFFLINE_NOTE}</p>
        </div>
      </div>
    </section>
  );
}
