/**
 * Captura com duas versões, escura e clara. O CSS mostra a que combina com o
 * tema do visitante (ver .shot-escuro e .shot-claro em sistema.css).
 *
 * `base` pode ser o caminho sem tema e sem extensão ('/sistema/painel'), que
 * carrega painel-escuro.webp e painel-claro.webp, ou um arquivo único
 * ('/projects/erp.svg'), como os projetos cadastrados no admin.
 */
const HAS_EXTENSION = /\.[a-z0-9]{3,4}$/i;

export default function ThemedShot({ base, alt, width = 1366, height = 768, ...rest }) {
  const common = { alt, width, height, loading: 'lazy', decoding: 'async', ...rest };

  if (HAS_EXTENSION.test(base)) {
    return <img src={base} {...common} />;
  }

  return ['escuro', 'claro'].map((theme) => (
    <img key={theme} className={`shot-${theme}`} src={`${base}-${theme}.webp`} {...common} />
  ));
}
