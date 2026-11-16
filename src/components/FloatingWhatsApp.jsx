import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { WHATSAPP_MESSAGES } from '../data/company.js';
import { createWhatsAppLink, whatsappLinkProps } from '../utils/contact.js';
import { EVENTS, track } from '../utils/analytics.js';
import { FLOATING_WA_OFFSET } from '../config/constants.js';

/**
 * Botão flutuante de WhatsApp. Aparece depois que a pessoa rola um pouco e
 * sai da frente enquanto ela desce a página: quem está lendo não tem o texto
 * coberto, e quem sobe (procurando contato) vê o botão de volta.
 */
export default function FloatingWhatsApp() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const goingDown = y > lastY + 4;
      const goingUp = y < lastY - 4;
      if (y <= FLOATING_WA_OFFSET || goingDown) setVisible(false);
      else if (goingUp) setVisible(true);
      if (goingDown || goingUp) lastY = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <a
      className={`floating-wa${visible ? ' is-visible' : ''}`}
      href={createWhatsAppLink(WHATSAPP_MESSAGES.floating)}
      onClick={() => track(EVENTS.WHATSAPP_CLICKED, { origin: 'flutuante' })}
      aria-label="Falar no WhatsApp"
      tabIndex={visible ? 0 : -1}
      aria-hidden={visible ? undefined : 'true'}
      {...whatsappLinkProps}
    >
      <Icon name="whatsapp" size={24} />
    </a>
  );
}
