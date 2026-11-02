import { Link } from 'react-router-dom';
import SiteShell from '../components/SiteShell.jsx';
import { COMPANY_NAME, EMAIL, LEGAL_NAME, WHATSAPP_MESSAGES } from '../data/company.js';
import { createWhatsAppLink, whatsappDisplay, whatsappLinkProps } from '../utils/contact.js';
import { PLAN, formatBRL } from '../../shared/plan.js';

/**
 * Termos de uso do TODAI.
 * Só descreve o que o sistema e o contrato fazem hoje. Versão aprovada pelo dono
 * em 19/10/2026, sem revisão jurídica (decisão dele). Quando CNPJ e endereço
 * existirem, entram na seção 1 a partir de `src/data/company.js`.
 */
export default function Terms() {
  return (
    <SiteShell>
      <article className="legal">
        <span className="eyebrow">
          <span className="eyebrow__dot" aria-hidden="true" />
          Documento
        </span>
        <h1 className="legal__title">Termos de uso do {PLAN.name}</h1>
        <p className="legal__updated">Versão de 19/10/2026</p>

        <h2>1. Quem oferece o serviço</h2>
        <p>
          O {PLAN.name} é oferecido pela {LEGAL_NAME}. Quando estes termos
          dizem &ldquo;nós&rdquo;, falam da {LEGAL_NAME} ({COMPANY_NAME}); &ldquo;você&rdquo; é
          a pessoa ou a empresa que contrata. Nosso contato está no final desta
          página.
        </p>

        <h2>2. O que você contrata</h2>
        <p>
          Você contrata uma licença de uso, por assinatura mensal, do sistema
          de estoque e ponto de venda para Windows. O software continua sendo
          nosso: a assinatura dá o direito de usá-lo, não de copiá-lo,
          revendê-lo ou desmontá-lo.
        </p>

        <h2>3. Preço e computadores</h2>
        <ul>
          <li>
            Mensalidade de {formatBRL(PLAN.basePrice)} com {PLAN.includedDevices} computador incluído.
          </li>
          <li>{formatBRL(PLAN.extraDevicePrice)} por mês para cada computador adicional, até {PLAN.maxDevices}.</li>
          <li>Acima de {PLAN.maxDevices} computadores o valor é combinado diretamente.</li>
          <li>O valor cobrado é o calculado no momento da compra, mostrado antes do pagamento.</li>
        </ul>

        <h2>4. Pagamento</h2>
        <p>
          Comprando pelo site, a cobrança é recorrente, mensal, no cartão, e é
          processada pelo Mercado Pago. Nós não recebemos nem guardamos os
          dados do seu cartão. Também é possível combinar o pagamento
          diretamente conosco pelo WhatsApp; nesse caso registramos cada
          pagamento recebido e a licença vale pelo período pago.
        </p>

        <h2>5. Ativação e uso</h2>
        <p>
          Depois da confirmação do pagamento enviamos por e-mail um código de
          ativação e o link do instalador. O código tem prazo para ser usado,
          informado no e-mail, e vale para a sua empresa: não o compartilhe.
          Cada computador ativado ocupa uma das vagas contratadas. O sistema
          confere a licença pela internet a cada 12 horas e funciona por até 72
          horas sem conexão.
        </p>

        <h2>6. Se o pagamento não for confirmado</h2>
        <p>
          Quando uma cobrança não é paga, a licença passa por etapas: primeiro
          um período de tolerância, em que o sistema segue funcionando e avisa;
          depois o modo somente leitura, em que você consulta os dados mas não
          registra novas vendas; e, se a situação continuar, a licença é
          cancelada. Em qualquer etapa, regularizar o pagamento restabelece o
          uso.
        </p>

        <h2>7. Cancelamento</h2>
        <p>
          Você pode cancelar quando quiser, pedindo por e-mail ou WhatsApp, ou
          pelo próprio Mercado Pago no caso da cobrança recorrente. O
          cancelamento interrompe as próximas cobranças. Para compras feitas
          fora de loja física, quando a lei do consumidor se aplica ao seu
          caso, você também tem o direito de desistir em até 7 dias
          corridos da contratação, com devolução do valor pago.
        </p>

        <h2>8. Os dados da sua loja</h2>
        <p>
          As vendas, o estoque e os cadastros que você registra são seus. Eles
          ficam num banco de dados reservado à sua loja, em servidores que nós
          mantemos, e fazemos cópias de segurança periódicas. Usamos esses dados
          apenas para o sistema funcionar e para dar suporte quando você pedir.
          A forma como tratamos dados pessoais está na{' '}
          <Link to="/privacidade">Política de privacidade</Link>.
        </p>

        <h2>9. Obrigações fiscais e responsabilidade</h2>
        <p>
          O sistema é uma ferramenta. As obrigações fiscais e contábeis da sua
          empresa, incluindo conferir a emissão de documentos fiscais, são de
          responsabilidade da própria empresa. Trabalhamos para manter o
          serviço disponível, mas não garantimos funcionamento sem nenhuma
          interrupção, e não respondemos por perdas causadas por uso indevido,
          computador sem manutenção ou falta de internet além do limite
          descrito acima.
        </p>

        <h2>10. Mudanças nestes termos</h2>
        <p>
          Podemos atualizar estes termos. Mudanças que afetem preço ou direitos
          serão avisadas por e-mail com antecedência. A data da versão vigente
          está no topo desta página.
        </p>

        <h2>11. Contato</h2>
        <p>
          E-mail: <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. WhatsApp:{' '}
          <a href={createWhatsAppLink(WHATSAPP_MESSAGES.contact)} {...whatsappLinkProps}>
            {whatsappDisplay}
          </a>
          .
        </p>
      </article>
    </SiteShell>
  );
}
