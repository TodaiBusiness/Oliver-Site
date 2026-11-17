import { Link } from 'react-router-dom';
import { openConsentPreferences } from '../utils/consent.js';
import SiteShell from '../components/SiteShell.jsx';
import { EMAIL, LEGAL_NAME } from '../data/company.js';
import { PLAN } from '../../shared/plan.js';

/**
 * Política de privacidade do site e do TODAI.
 * Lista só o que o sistema coleta de verdade (confira com server/config.js e
 * src/utils/consent.js). Se um dado ou cookie novo passar a existir, esta
 * página muda na mesma tarefa, e a versão do consentimento (CONSENT_VERSION)
 * sobe para a faixa perguntar de novo. Texto ainda sem revisão jurídica.
 */
const STORAGE_ITEMS = [
  {
    name: 'oi_session',
    where: 'Cookie',
    purpose: 'Mantém você conectado na área do cliente. Só existe depois do login.',
    life: 'Até 8 horas; expira antes se a conta ficar parada (30 minutos para clientes) ou se você sair.',
    category: 'Necessário',
  },
  {
    name: 'todai_consent',
    where: 'Cookie',
    purpose: 'Guarda a sua escolha sobre cookies. Não contém dado pessoal.',
    life: '12 meses.',
    category: 'Necessário',
  },
  {
    name: 'todai-theme',
    where: 'Armazenamento local do navegador',
    purpose: 'Lembra o tema claro ou escuro que você escolheu.',
    life: 'Até você apagar os dados do site no navegador.',
    category: 'Necessário',
  },
  {
    name: 'todai:funil',
    where: 'Armazenamento da aba (sessionStorage)',
    purpose: 'Guarda as respostas do assistente de orçamento enquanto você preenche.',
    life: 'Até fechar a aba.',
    category: 'Necessário',
  },
  {
    name: 'todai-acesso',
    where: 'Armazenamento da aba (sessionStorage)',
    purpose: 'Mantém aberto o resumo da sua licença depois de entrar pelo link enviado por e-mail.',
    life: 'Até fechar a aba.',
    category: 'Necessário',
  },
];

export default function Privacy() {
  return (
    <SiteShell>
      <article className="legal">
        <h1 className="legal__title">Política de privacidade</h1>
        <p className="legal__updated">Versão de 17/11/2026</p>
        <p className="legal__note">
          Texto a ser revisado por profissional jurídico. Ele descreve o que o site e o sistema
          fazem hoje.
        </p>

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
            <strong>Pagamento:</strong> quem processa é o Mercado Pago. Não
            recebemos nem guardamos número de cartão; recebemos a confirmação
            do pagamento e o estado da assinatura.
          </li>
        </ul>

        <h3>Estatísticas de visita</h3>
        <p>
          Só contamos com a sua permissão (veja a seção 5). Contamos quantas
          pessoas abrem cada página, só em números somados por dia: país e
          cidade aproximados, o site de onde você veio, a campanha do link
          (quando houver), o tipo de aparelho (celular, tablet ou computador)
          e a página aberta. Nessa contagem não guardamos o seu endereço IP,
          não usamos cookie nem identificador seu e não identificamos você.
          Quem ativa o sinal &quot;Do Not Track&quot; ou &quot;Global Privacy
          Control&quot; no navegador não é contado, mesmo tendo aceitado. Os
          números somados são mantidos por até 400 dias.
        </p>

        <h3>Dados de segurança de quem tem conta</h3>
        <p>
          Quem entra na área do cliente tem o endereço IP e o navegador (user
          agent) guardados, só para proteger a conta. Isso é separado das
          estatísticas de visita e não depende da escolha de cookies.
        </p>
        <ul>
          <li>
            <strong>Sessões ativas</strong> (IP e navegador): enquanto a sessão
            vale, no máximo 8 horas, ou menos se a conta ficar parada (30
            minutos para clientes). Depois disso são apagados.
          </li>
          <li>
            <strong>Tentativas de login</strong> (e-mail digitado e IP):
            guardadas por 15 minutos, para barrar tentativas em excesso.
          </li>
          <li>
            <strong>Registro de ações da conta</strong> (por exemplo entrar,
            trocar a senha, ativar a verificação em duas etapas; com IP e
            navegador): 365 dias, depois apagados. Nunca guardam senha nem o
            conteúdo das mensagens.
          </li>
        </ul>
        <p>
          O prazo de guarda dos demais dados (cadastro, pedidos de orçamento,
          mensagens e dados de compra) ainda está a definir.
        </p>

        <h2>2. Para que usamos</h2>
        <ul>
          <li>Criar o seu cadastro, cobrar e liberar a licença.</li>
          <li>Enviar o código de ativação, avisos de cobrança e suporte.</li>
          <li>Proteger o serviço contra fraude e uso indevido da licença.</li>
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

        <h2>5. Cookies e armazenamento no navegador</h2>
        <p>
          Na primeira visita, uma faixa pergunta se você aceita as estatísticas.
          Recusar é tão fácil quanto aceitar, e o site funciona igual. Nada
          aqui serve para propaganda nem para acompanhar você em outros sites.
        </p>
        <div className="legal__table-wrap">
          <table className="legal__table">
            <caption className="sr-only">Cookies e itens gravados no navegador</caption>
            <thead>
              <tr>
                <th scope="col">Nome</th>
                <th scope="col">Onde fica</th>
                <th scope="col">Para que serve</th>
                <th scope="col">Duração</th>
                <th scope="col">Categoria</th>
              </tr>
            </thead>
            <tbody>
              {STORAGE_ITEMS.map((item) => (
                <tr key={item.name}>
                  <th scope="row" data-label="Nome">
                    <code>{item.name}</code>
                  </th>
                  <td data-label="Onde fica">{item.where}</td>
                  <td data-label="Para que serve">{item.purpose}</td>
                  <td data-label="Duração">{item.life}</td>
                  <td data-label="Categoria">{item.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          <strong>Estatísticas:</strong> a contagem de visitas descrita na seção
          1 não grava nenhum cookie nem item no navegador. Ela só roda se você
          aceitar, e o site confere a sua escolha (no cookie{' '}
          <code>todai_consent</code>) antes de gravar qualquer número.
        </p>
        <p>
          <strong>Como mudar a escolha:</strong> use o botão abaixo ou o link
          &quot;Preferências de cookies&quot; no rodapé de qualquer página. Ao
          desligar as estatísticas, o site para de contar na hora. Se esta
          política mudar de forma que afete os cookies, a faixa volta a
          perguntar.
        </p>
        <p>
          <button type="button" className="btn btn--ghost btn--sm" onClick={openConsentPreferences}>
            Preferências de cookies
          </button>
        </p>

        <h2>6. Por quanto tempo guardamos</h2>
        <ul>
          <li>Números somados de visitas: até 400 dias.</li>
          <li>Sessões, tentativas de login e registro de ações da conta: os prazos da seção 1.</li>
          <li>
            Cadastro, pedidos de orçamento, mensagens e dados de compra: prazo
            a definir. Até a definição, tratamos esses dados só para o que está
            descrito nesta página.
          </li>
        </ul>

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
