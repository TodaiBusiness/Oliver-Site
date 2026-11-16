import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import Header from '../sections/Header.jsx';
import Footer from '../sections/Footer.jsx';
import Reveal from '../components/Reveal.jsx';
import { useAuth } from '../app/AuthContext.jsx';

/* O que dá para fazer. Uma frase por item — nada de parágrafo. */
const RECURSOS = [
  {
    icon: 'dashboard',
    titulo: 'Ver o andamento',
    texto: 'O status do seu projeto, sem precisar perguntar.',
  },
  {
    icon: 'layers',
    titulo: 'Pedir um projeto',
    texto: 'Descreve o que precisa e acompanha a resposta.',
  },
  {
    icon: 'chat',
    titulo: 'Conversar',
    texto: 'Tudo sobre o projeto num lugar só, sem perder no e-mail.',
  },
];

/* Três passos reais — por isso numerados. */
const PASSOS = [
  { n: '1', texto: 'Crie sua conta em menos de um minuto.' },
  { n: '2', texto: 'Descreva o que precisa desenvolver.' },
  { n: '3', texto: 'Acompanhe e converse por aqui.' },
];

/** Página curta explicando a área do cliente. */
export default function ClientAreaInfo() {
  const { user, isAdmin } = useAuth();

  return (
    <>
      <Header />

      <main id="conteudo" className="info">
        <section className="section info__hero">
          <div className="container">
            <Reveal>

              <h1 className="info__title">
                Acompanhe seu projeto sem precisar cobrar ninguém.
              </h1>

              <p className="info__text">
                Uma área sua, com o andamento do projeto, suas solicitações e a
                conversa com a gente. Grátis para quem é cliente.
              </p>

              <div className="info__actions">
                {user ? (
                  <Link className="btn btn--primary btn--lg" to={isAdmin ? '/admin' : '/cliente'}>
                    <Icon name="dashboard" size={18} />
                    Abrir meu painel
                  </Link>
                ) : (
                  <>
                    <Link className="btn btn--primary btn--lg" to="/cadastro">
                      Criar minha conta
                      <Icon name="arrowRight" size={18} className="btn__icon" />
                    </Link>
                    <Link className="btn btn--ghost btn--lg" to="/login">
                      Já tenho conta
                    </Link>
                  </>
                )}
              </div>
            </Reveal>
          </div>
        </section>

        <section className="section section--tight">
          <div className="container">
            <ul className="info__grid">
              {RECURSOS.map((item, i) => (
                <Reveal as="li" key={item.titulo} delay={i * 70} className="info__card">
                  <span className="info__icon">
                    <Icon name={item.icon} size={20} />
                  </span>
                  <h2 className="info__card-title">{item.titulo}</h2>
                  <p className="info__card-text">{item.texto}</p>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        <section className="section section--tight">
          <div className="container">
            <Reveal className="info__steps">
              <h2 className="info__steps-title">Como começa</h2>
              <ol className="info__steps-list">
                {PASSOS.map((passo) => (
                  <li key={passo.n}>
                    <span className="info__step-n">{passo.n}</span>
                    {passo.texto}
                  </li>
                ))}
              </ol>

              {!user ? (
                <Link className="btn btn--primary" to="/cadastro">
                  Criar conta agora
                  <Icon name="arrowRight" size={17} className="btn__icon" />
                </Link>
              ) : null}
            </Reveal>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}
