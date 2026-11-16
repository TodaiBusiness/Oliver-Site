/* Resumo legível de um user agent ("Chrome em Windows"), para a lista de
   sessões. Heurística simples e deliberadamente curta: é só para a pessoa
   reconhecer o aparelho, nunca para decidir nada. */

const BROWSERS = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS/, 'Firefox'],
  [/Chrome\/|CriOS/, 'Chrome'],
  [/Safari\//, 'Safari'],
];

const SYSTEMS = [
  [/Windows/, 'Windows'],
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/Linux|X11/, 'Linux'],
];

export function describeUserAgent(userAgent) {
  if (typeof userAgent !== 'string' || !userAgent) return 'Aparelho desconhecido';
  const browser = BROWSERS.find(([re]) => re.test(userAgent))?.[1];
  const system = SYSTEMS.find(([re]) => re.test(userAgent))?.[1];
  if (browser && system) return `${browser} em ${system}`;
  return browser ?? system ?? 'Aparelho desconhecido';
}

/** Corta o user agent antes de gravar (cabeçalho é controlado por quem pede). */
export const clipUserAgent = (value) =>
  typeof value === 'string' ? value.replace(/[\r\n]/g, ' ').slice(0, 200) : null;
