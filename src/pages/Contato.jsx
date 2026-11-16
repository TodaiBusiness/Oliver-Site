import PageHero from '../components/PageHero.jsx';
import Contact from '../sections/Contact.jsx';

export default function Contato() {
  return (
    <>
      <PageHero
        title="Vamos conversar sobre o seu projeto."
        lead="Responda duas perguntas rápidas e o WhatsApp abre com o contexto pronto, ou escolha o canal que preferir."
      />
      <Contact showTitle={false} />
    </>
  );
}
