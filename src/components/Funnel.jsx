import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import FunnelProgress from './funnel/FunnelProgress.jsx';
import FunnelOptions from './funnel/FunnelOptions.jsx';
import {
  FUNNEL_STEPS,
  NEEDS,
  STAGES,
  buildFunnelMessage,
  clearFunnelState,
  findNeed,
  findStage,
  loadFunnelState,
  saveFunnelState,
} from '../data/funnel.js';
import { createWhatsAppLink, whatsappLinkProps } from '../utils/contact.js';
import { EVENTS, track } from '../utils/analytics.js';

const LAST_STEP = FUNNEL_STEPS.length - 1;

/**
 * Funil de duas perguntas que termina abrindo o WhatsApp com a mensagem já
 * contextualizada. As escolhas ficam em sessionStorage.
 */
export default function Funnel() {
  /* Estado inicial vem direto da sessão (lazy init): restaurar em efeito
     criava corrida com o efeito que persiste. */
  const [saved] = useState(loadFunnelState);
  const [step, setStep] = useState(() => saved?.step ?? 0);
  const [need, setNeed] = useState(() => saved?.need ?? null);
  const [stage, setStage] = useState(() => saved?.stage ?? null);
  const [started, setStarted] = useState(() => Boolean(saved?.need));
  const panelRef = useRef(null);

  useEffect(() => {
    saveFunnelState({ need, stage, step });
  }, [need, stage, step]);

  const goToStep = useCallback((next) => {
    setStep(next);
    window.requestAnimationFrame(() => panelRef.current?.focus());
  }, []);

  const chooseNeed = (item) => {
    if (!started) {
      setStarted(true);
      track(EVENTS.FUNNEL_STARTED, { need: item.id });
    }
    setNeed(item.id);
    track(EVENTS.FUNNEL_STEP_COMPLETED, { step: 1, value: item.id });
    goToStep(1);
  };

  const chooseStage = (item) => {
    setStage(item.id);
    track(EVENTS.FUNNEL_STEP_COMPLETED, { step: 2, value: item.id });
    goToStep(2);
  };

  const restart = () => {
    clearFunnelState();
    setNeed(null);
    setStage(null);
    setStarted(false);
    goToStep(0);
  };

  /* Só libera uma etapa quando a anterior foi respondida. */
  const canReach = useCallback(
    (target) => {
      if (target <= 0) return true;
      if (target === 1) return Boolean(need);
      return Boolean(need && stage);
    },
    [need, stage]
  );

  const message = buildFunnelMessage({ need, stage });
  const needItem = findNeed(need);
  const stageItem = findStage(stage);

  return (
    <div className="funnel">
      <FunnelProgress
        steps={FUNNEL_STEPS}
        current={step}
        canReach={canReach}
        onGo={goToStep}
      />

      <div className="funnel__panel" ref={panelRef} tabIndex={-1} aria-live="polite">
        {step === 0 ? (
          <div className="funnel__step">
            <p className="funnel__question">O que você precisa desenvolver?</p>
            <FunnelOptions
              options={NEEDS}
              selected={need}
              onSelect={chooseNeed}
              layout="grid"
            />
          </div>
        ) : null}

        {step === 1 ? (
          <div className="funnel__step">
            <p className="funnel__question">Em que estágio está?</p>
            <FunnelOptions options={STAGES} selected={stage} onSelect={chooseStage} />

            <button type="button" className="btn btn--soft btn--xs funnel__back" onClick={() => goToStep(0)}>
              <Icon name="arrowRight" size={14} className="funnel__back-icon" />
              Voltar
            </button>
          </div>
        ) : null}

        {step === LAST_STEP ? (
          <div className="funnel__step funnel__step--done">
            <div className="funnel__summary">
              {needItem ? <span className="funnel__chip">{needItem.label}</span> : null}
              {stageItem ? <span className="funnel__chip">{stageItem.label}</span> : null}
            </div>

            <p className="funnel__preview-label">Sua mensagem:</p>
            <p className="funnel__preview">{message}</p>

            <div className="funnel__done-actions">
              <a
                className="btn btn--primary btn--block"
                href={createWhatsAppLink(message)}
                onClick={() =>
                  track(EVENTS.WHATSAPP_CLICKED, { origin: 'funil', need, stage })
                }
                {...whatsappLinkProps}
              >
                <Icon name="whatsapp" size={17} />
                Conversar com a TODAI
              </a>

              <button type="button" className="btn btn--soft btn--xs funnel__back" onClick={restart}>
                <Icon name="refresh" size={14} />
                Recomeçar
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
