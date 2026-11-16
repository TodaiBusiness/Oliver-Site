import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { SCENES, SCENE_MS } from '../data/demo.js';

const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

/** Preferência do sistema por menos movimento, acompanhando mudanças. */
function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(REDUCED_QUERY).matches
  );

  useEffect(() => {
    const media = window.matchMedia(REDUCED_QUERY);
    const onChange = () => setReduced(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/* ---------------------------------------------------------------------------
   As cinco cenas são HTML/CSS puro. Os atrasos de cada elemento vêm de
   `--d` (em segundos) e as animações só rodam dentro da cena ativa.
   --------------------------------------------------------------------------- */

const Bubble = ({ side, d, children }) => (
  <p className={`demo-bubble demo-bubble--${side}`} style={{ '--d': `${d}s` }}>
    {children}
  </p>
);

function SceneIdea() {
  return (
    <div className="demo-scene demo-scene--idea">
      <div className="demo-chat">
        <Bubble side="in" d={0.3}>
          Oi! Quero um sistema para controlar os pedidos da loja.
        </Bubble>
        <p className="demo-typing" style={{ '--d': '1.5s' }} aria-hidden="true">
          <i />
          <i />
          <i />
        </p>
        <Bubble side="out" d={2.3}>
          Ótimo. Como os pedidos chegam hoje?
        </Bubble>
        <Bubble side="in" d={3.4}>
          Por mensagem e caderno. Vira bagunça.
        </Bubble>
      </div>
      <div className="demo-channels" style={{ '--d': '0.9s' }}>
        <span>Formulário do site</span>
        <span>WhatsApp</span>
      </div>
    </div>
  );
}

const PROPOSAL_ROWS = ['Escopo definido', 'Etapas e ordem de entrega', 'Prazo combinado', 'Orçamento aprovado'];

function SceneProposal() {
  return (
    <div className="demo-scene demo-scene--proposal">
      <div className="demo-doc">
        <p className="demo-doc__title">Proposta</p>
        <ul>
          {PROPOSAL_ROWS.map((row, index) => (
            <li key={row} style={{ '--d': `${0.5 + index * 0.85}s` }}>
              <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
                <circle cx="10" cy="10" r="8.5" className="demo-check__ring" />
                <path d="m6 10.4 2.7 2.7L14 7.5" className="demo-check__tick" />
              </svg>
              <span>{row}</span>
            </li>
          ))}
        </ul>
        <p className="demo-doc__stamp" style={{ '--d': '4.1s' }}>
          Enviada para você
        </p>
      </div>
    </div>
  );
}

const STAGES = [
  { label: 'Layout', w: 100 },
  { label: 'Telas principais', w: 100 },
  { label: 'Integrações', w: 64 },
  { label: 'Relatórios', w: 18 },
];

function SceneStages() {
  return (
    <div className="demo-scene demo-scene--stages">
      <div className="demo-client">
        <div className="demo-client__bar">
          <span>Área do cliente</span>
          <span className="demo-client__badge" style={{ '--d': '3.2s' }}>
            1 mensagem nova
          </span>
        </div>
        <ul className="demo-client__list">
          {STAGES.map((stage, index) => (
            <li key={stage.label}>
              <span className="demo-client__name">{stage.label}</span>
              <span className="demo-client__track">
                <span
                  className="demo-client__fill"
                  style={{ '--w': `${stage.w}%`, '--d': `${0.3 + index * 0.65}s` }}
                />
              </span>
            </li>
          ))}
        </ul>
        <p className="demo-client__msg" style={{ '--d': '3.4s' }}>
          Etapa 2 entregue. Pode testar e nos dizer o que ajustar.
        </p>
      </div>
    </div>
  );
}

const TESTS = ['Fluxo de venda', 'Cadastros', 'Celular e computador', 'Permissões de acesso'];

function SceneTests() {
  return (
    <div className="demo-scene demo-scene--tests">
      <ul className="demo-tests">
        {TESTS.map((test, index) => (
          <li key={test} style={{ '--d': `${0.3 + index * 1}s` }}>
            <span className="demo-tests__state" aria-hidden="true">
              <span className="demo-tests__spin" />
              <svg viewBox="0 0 20 20" width="18" height="18">
                <path d="m5 10.4 3.3 3.3L15 6.6" />
              </svg>
            </span>
            <span>{test}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SceneLive() {
  return (
    <div className="demo-scene demo-scene--live">
      <div className="demo-window">
        <div className="demo-window__bar">
          <i />
          <i />
          <i />
          <span className="demo-window__live" style={{ '--d': '1.4s' }}>
            <b aria-hidden="true" />
            No ar
          </span>
        </div>
        {['escuro', 'claro'].map((theme) => (
          <img
            key={theme}
            className={`shot-${theme}`}
            src={`/sistema/comandas-${theme}.webp`}
            alt=""
            width="1366"
            height="768"
            loading="lazy"
            decoding="async"
          />
        ))}
      </div>
    </div>
  );
}

const SCENE_VIEWS = [SceneIdea, SceneProposal, SceneStages, SceneTests, SceneLive];

/**
 * "Vídeo" de como funciona: uma cena animada em loop feita de HTML e CSS, sem
 * arquivo de vídeo. A cena ativa avança quando a animação da sua barra de
 * progresso termina (onAnimationEnd), então pausar é só pausar o CSS.
 * Com "reduzir movimento" nada toca sozinho: as cenas viram quadros estáticos
 * e a pessoa navega pelos botões.
 */
export default function HowItWorksDemo({ className = '' }) {
  const reduced = useReducedMotion();
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [inView, setInView] = useState(false);
  const [round, setRound] = useState(0); // recomeça a cena atual do zero
  const rootRef = useRef(null);

  /* Só anda enquanto o bloco está na tela (não gasta CPU fora de vista). */
  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), {
      threshold: 0.35,
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const running = playing && inView && !reduced;

  const goTo = useCallback((index) => {
    setScene(index);
    setRound((value) => value + 1);
  }, []);

  const next = useCallback(() => goTo((scene + 1) % SCENES.length), [goTo, scene]);
  const prev = useCallback(
    () => goTo((scene - 1 + SCENES.length) % SCENES.length),
    [goTo, scene]
  );

  const restart = () => {
    setPlaying(true);
    goTo(0);
  };

  const Scene = SCENE_VIEWS[scene];
  const current = SCENES[scene];

  return (
    <div
      ref={rootRef}
      className={`demo${running || reduced ? '' : ' is-paused'}${className ? ` ${className}` : ''}`}
      style={{ '--scene-ms': `${SCENE_MS}ms` }}
      role="group"
      aria-roledescription="demonstração animada"
      aria-label="Como funciona, em cinco cenas"
    >
      <div className="demo__stage" aria-hidden="true">
        <div className="demo__scene" key={`${scene}-${round}`}>
          <Scene />
        </div>
      </div>

      <div className="demo__side">
        <ol className="demo__steps">
          {SCENES.map((item, index) => {
            const active = index === scene;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`demo__step${active ? ' is-active' : ''}${index < scene ? ' is-done' : ''}`}
                  aria-current={active ? 'step' : undefined}
                  onClick={() => goTo(index)}
                >
                  <span className="demo__step-title">{item.title}</span>
                  <span className="demo__step-text">{item.text}</span>
                  {active && !reduced ? (
                    <span className="demo__fill" key={round} onAnimationEnd={next} />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>

        <p className="demo__caption">
          <strong>{current.title}.</strong> {current.text}
        </p>

        <div className="demo__controls">
          {reduced ? (
            <>
              <button type="button" className="demo__btn" onClick={prev}>
                <Icon name="arrowRight" size={16} className="demo__flip" />
                Cena anterior
              </button>
              <button type="button" className="demo__btn" onClick={next}>
                Próxima cena
                <Icon name="arrowRight" size={16} />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="demo__btn demo__btn--main"
                onClick={() => setPlaying((value) => !value)}
                aria-label={playing ? 'Pausar a demonstração' : 'Reproduzir a demonstração'}
              >
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor">
                  {playing ? (
                    <path d="M3.5 2h3v12h-3zM9.5 2h3v12h-3z" />
                  ) : (
                    <path d="M4 2.2v11.6a.5.5 0 0 0 .76.43l9.3-5.8a.5.5 0 0 0 0-.86L4.76 1.77A.5.5 0 0 0 4 2.2Z" />
                  )}
                </svg>
                {playing ? 'Pausar' : 'Reproduzir'}
              </button>
              <button type="button" className="demo__btn" onClick={restart}>
                <Icon name="refresh" size={15} />
                Reiniciar
              </button>
            </>
          )}
          <p className="demo__count" aria-live={running ? 'off' : 'polite'}>
            <span className="sr-only">Cena atual: {current.title}. </span>
            {scene + 1} de {SCENES.length}
          </p>
        </div>
      </div>
    </div>
  );
}
