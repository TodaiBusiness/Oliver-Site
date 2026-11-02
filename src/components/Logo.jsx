import { COMPANY_NAME } from '../data/company.js';

/**
 * Marca da TODAI: monograma "OI" — o anel do O com uma abertura no
 * topo, e a haste do I no centro.
 *
 * Desenhado em vetor (não é imagem), então fica nítido em qualquer tamanho e
 * herda a cor de quem o contém. Para trocar para dourado, mude `--brand-mark`
 * em `tokens.css`; a forma continua a mesma.
 */
export function LogoMark({ size = 34, className = '' }) {
  return (
    <svg
      className={`logo__mark ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.4"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* Anel com abertura no topo (arco de ~346°) */}
      <path d="M22 5.13 A15 15 0 1 1 18 5.13" />
      {/* Haste central do "I" */}
      <path d="M20 12.4 V27.6" />
    </svg>
  );
}

/** Marca + nome, usada no header, no rodapé e nos painéis. */
export default function Logo({ size = 34, className = '' }) {
  return (
    <span className={`logo ${className}`.trim()}>
      <LogoMark size={size} />
      <span className="logo__text">{COMPANY_NAME}</span>
    </span>
  );
}
