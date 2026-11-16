import PageHero from '../components/PageHero.jsx';
import Projects from '../sections/Projects.jsx';
import Stack from '../sections/Stack.jsx';
import FinalCta from '../sections/FinalCta.jsx';

export default function ProjetosPage() {
  return (
    <>
      <PageHero
        title="O que já construímos."
        lead="Sistemas em uso e projetos em desenvolvimento. Abra um projeto para ver o problema, a solução e as funcionalidades."
      />
      <Projects />
      <Stack />
      <FinalCta origin="projetos" />
    </>
  );
}
