import { Link } from 'react-router-dom';
import SiteShell from '../components/SiteShell.jsx';
import { EMAIL, LEGAL_NAME } from '../data/company.js';
import { PLAN } from '../../shared/plan.js';

/**
 * Política de privacidade (LGPD) do site e do Oliver Inventory.
 * Lista só o que o sistema coleta de verdade. Se um dado novo passar a ser
 * coletado, esta página muda na mesma tarefa. Versão aprovada pelo dono em
 * 19/10/2026, sem revisão jurídica (decisão dele).
 */
export default function Privacy() {
  return (
    <SiteShell>
      <article className="legal">
        <span className="eyebrow">
          <span className="eyebrow__dot" aria-hidden="true" />
          Documento
        </span>
        <h1 className="legal__title">Política de privacidade</h1>
        <p className="legal__updated">Versão de 27/10/2026</p>

        <p>
          Esta página explica quais dados pessoais a {LEGAL_NAME} coleta no
          site e no {PLAN.name}, para que servem e quais são os seus direitos,
          conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018).
        </p>

        <h2>1. Que dados coletamos</h2>
        <ul>
          <li>
            <strong>Na compra:</strong> nome da empresa, seu nome, CPF ou CNPJ,
            e-mail e telefone.
          </li>
          <li>
            <strong>No uso do sistema:</strong> o nome do computador e um
            identificador gerado na instalação, a versão do programa, as datas
            em que a licença foi conferida e o endereço IP dessa conferência.
          </li>
          <li>
            <strong>Pedido de orçamento e conta no site:</strong> o que você
            digita nos formulários e as mensagens trocadas.
          </li>
          <li>
            <strong>Visitas ao site:</strong> contamos quantas pessoas abrem
            cada página, só em números somados por dia: país e cidade
            aproximados, o site de onde você veio, a campanha do link (quando
            houver), o tipo de aparelho (celular, tablet ou computador) e a
            página aberta. Não guardamos o seu endereço IP, não usamos cookie
            nem identificador seu para isso e não identificamos você. Quem
            ativa o sinal "Do Not Track" ou "Global Privacy Control" no
            navegador não é contado.
          </li>
          <li>
            <strong>Pagamento:</strong> quem processa é o Mercado Pago. Não
            recebemos nem guardamos número de cartão; recebemos a confirmação
            do pagamento e o estado da assinatura.
          </li>
        </ul>

        <h2>2. Para que usamos</h2>
        <ul>
          <li>Criar o seu cadastro, cobrar e liberar a licença (execução do contrato).</li>
          <li>Enviar o código de ativação, avisos de cobrança e suporte.</li>
          <li>Proteger o serviço contra fraude e uso indevido da licença (legítimo interesse).</li>
          <li>Cumprir obrigações legais e fiscais.</li>
        </ul>

        <h2>3. Com quem compartilhamos</h2>
        <p>
          Apenas com quem é necessário para o serviço funcionar: o Mercado Pago
          (pagamentos) e os provedores de hospedagem e de e-mail que usamos.
          Não vendemos dados pessoais.
        </p>

        <h2>4. Os dados dos clientes da sua loja</h2>
        <p>
          Os dados dos seus clientes e das suas vendas que você registra no
          sistema pertencem à sua empresa, que é quem decide como usá-los. Nós
          os guardamos e protegemos em nome dela, apenas para o sistema
          funcionar e para dar suporte quando você pedir.
        </p>

        <h2>5. Cookies</h2>
        <p>
          O site usa apenas o cookie de sessão necessário para manter você
          conectado na área do cliente. Ele não é usado para propaganda nem
          para rastrear sua navegação em outros sites. A contagem de visitas
          não usa cookie.
        </p>

        <h2>6. Por quanto tempo guardamos</h2>
        <p>
          Enquanto o contrato estiver ativo e depois dele pelo tempo necessário
          para cumprir obrigações legais e para a defesa em eventual disputa.
          Passado esse prazo, os dados são apagados ou anonimizados. Os números
          somados de visitas são mantidos por até 400 dias.
        </p>

        <h2>7. Segurança</h2>
        <p>
          As conexões ao site, à API e ao banco das lojas usam criptografia. Cada
          loja tem um banco e um acesso próprios, e as credenciais de acesso ao
          banco ficam guardadas cifradas.
        </p>

        <h2>8. Seus direitos</h2>
        <p>
          Você pode pedir confirmação de que tratamos seus dados, acesso,
          correção, anonimização ou eliminação do que não for necessário,
          portabilidade, informação sobre com quem compartilhamos e a revogação
          de consentimento, quando for essa a base. Basta escrever para{' '}
          <a href={`mailto:${EMAIL}`}>{EMAIL}</a>; respondemos em prazo
          razoável. Você também pode reclamar à Autoridade Nacional de Proteção
          de Dados.
        </p>

        <h2>9. Mudanças</h2>
        <p>
          Quando esta política mudar, a data no topo é atualizada. Veja também
          os <Link to="/termos">Termos de uso</Link>.
        </p>
      </article>
    </SiteShell>
  );
}
