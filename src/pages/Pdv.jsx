import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import PageHero from '../components/PageHero.jsx';
import ThemedVideo from '../components/ThemedVideo.jsx';
import PdvSimulator from '../components/pdv/PdvSimulator.jsx';
import CommandPalette from '../components/pdv/CommandPalette.jsx';
import CashClose from '../components/pdv/CashClose.jsx';
import StockRisk from '../components/pdv/StockRisk.jsx';
import { PDV_PARTS } from '../data/pdv.js';

const DEMOS = {
  caixa: CashClose,
  estoque: StockRisk,
  atalhos: CommandPalette,
};

/** Captura real que aparece suavemente ao entrar na tela (única animação de entrada da página). */
function Shot({ id, alt, reduce }) {
  return (
    <motion.figure
      className="pdv-shot"
      initial={reduce ? false : { opacity: 0, y: 28, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: reduce ? 0 : 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <ThemedVideo base={`/sistema/${id}`} alt={alt} />
    </motion.figure>
  );
}

/** Marca no índice a parte que está na tela. */
function useActivePart(ids) {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const visible = new Map();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => visible.set(e.target.id, e.isIntersecting ? e.intersectionRatio : 0));
        const best = ids.filter((id) => visible.get(id) > 0).sort((a, b) => visible.get(b) - visible.get(a))[0];
        if (best) setActive(best);
      },
      { rootMargin: '-25% 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] }
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [ids]);
  return active;
}

const IDS = PDV_PARTS.map((p) => p.id);

export default function Pdv() {
  const reduce = useReducedMotion();
  const active = useActivePart(IDS);

  return (
    <>
      <PageHero
        title="O PDV do TODAI, tela a tela."
        lead="Aperte nos produtos, finalize a venda e confira o troco. É o caixa de verdade, em tamanho de demonstração. Mais abaixo, cada parte do sistema explicada."
        aside={<PdvSimulator />}
      >
        <Link className="btn btn--primary btn--lg" to="/assinar">
          Assinar o TODAI
        </Link>
        <Link className="btn btn--ghost btn--lg" to="/precos">
          Ver preços
        </Link>
      </PageHero>

      <div className="container pdv-layout">
        <nav className="pdv-index" aria-label="Partes do PDV">
          <ul>
            {PDV_PARTS.map((p) => (
              <li key={p.id}>
                <a href={`#${p.id}`} className={active === p.id ? 'is-on' : undefined} aria-current={active === p.id ? 'true' : undefined}>
                  {p.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="pdv-parts">
          {PDV_PARTS.map((p, i) => {
            const Demo = DEMOS[p.id];
            return (
              <section key={p.id} id={p.id} className={`pdv-part${i % 2 ? ' pdv-part--flip' : ''}`} aria-labelledby={`${p.id}-t`}>
                <div className="pdv-part__text">
                  <h2 className="section-head__title" id={`${p.id}-t`}>{p.title}</h2>
                  <p className="pdv-part__lead">{p.lead}</p>
                  <ul className="pdv-facts">
                    {p.facts.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                  {p.id === 'finalizar' ? (
                    <p className="pdv-part__try">
                      <a href="#top-demo" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); }}>
                        Experimentar de novo no simulador, lá no topo
                      </a>
                    </p>
                  ) : null}
                </div>
                <div className="pdv-part__visual">
                  {Demo ? <Demo /> : null}
                  {p.shot ? <Shot id={p.shot} alt={`Tela ${p.title} do sistema TODAI`} reduce={reduce} /> : null}
                  {p.shot2 ? <Shot id={p.shot2} alt="Tela de relatórios do sistema TODAI" reduce={reduce} /> : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <section className="section pdv-cta" aria-labelledby="pdv-cta-t">
        <div className="container">
          <h2 className="section-head__title" id="pdv-cta-t">Pronto para vender com ele?</h2>
          <p className="section-head__text">Escolha o plano e comece. Se preferir, veja os valores primeiro.</p>
          <div className="page-hero__actions">
            <Link className="btn btn--primary btn--lg" to="/assinar">Assinar o TODAI</Link>
            <Link className="btn btn--ghost btn--lg" to="/precos">Ver preços</Link>
          </div>
        </div>
      </section>
    </>
  );
}
