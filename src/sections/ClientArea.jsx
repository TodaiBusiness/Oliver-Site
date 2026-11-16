import { Link } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { useAuth } from '../app/AuthContext.jsx';

const FEATURES = [
  {
    icon: 'dashboard',
    title: 'Acompanhar o projeto',
    text: 'Status e andamento do que está sendo desenvolvido.',
  },
  {
    icon: 'layers',
    title: 'Abrir solicitações',
    text: 'Pedir um novo projeto ou ajuste sem depender de e-mail.',
  },
  {
    icon: 'chat',
    title: 'Conversar por aqui',
    text: 'Mensagens ligadas ao projeto, em um lugar só.',
  },
];

/**
 * Porta de entrada da área do cliente.
 * Quem já tem sessão vai direto para o painel; quem não tem vê entrar/criar
 * conta. Antes esta seção dizia "em breve" e mandava para o WhatsApp — o
 * acesso já existe, então o texto e os botões acompanham a realidade.
 */
export default function ClientArea() {
  const { user, isAdmin } = useAuth();

  return (
    <section className="section" id="clientes" aria-labelledby="clientes-title">
      <div className="container">
        <div className="clientarea">
          <div className="clientarea__content">

            <h2 className="clientarea__title" id="clientes-title">
              Acompanhe cada etapa e fale com a gente num lugar só.
            </h2>

            <p className="clientarea__text">
              Uma área exclusiva onde você acompanha o andamento do seu projeto,
              abre solicitações e conversa diretamente sobre o desenvolvimento.
            </p>

            <div className="clientarea__actions">
              {user ? (
                <Link className="btn btn--primary" to={isAdmin ? '/admin' : '/cliente'}>
                  <Icon name="dashboard" size={17} />
                  {isAdmin ? 'Abrir painel admin' : 'Abrir meu painel'}
                </Link>
              ) : (
                <>
                  <Link className="btn btn--primary" to="/login">
                    Entrar
                  </Link>
                  <Link className="btn btn--ghost" to="/area-do-cliente">
                    Como funciona
                  </Link>
                </>
              )}
            </div>
          </div>

          <ul className="clientarea__features">
            {FEATURES.map((feature) => (
              <li key={feature.title} className="clientarea__feature">
                <div>
                  <h3 className="clientarea__feature-title">{feature.title}</h3>
                  <p className="clientarea__feature-text">{feature.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
