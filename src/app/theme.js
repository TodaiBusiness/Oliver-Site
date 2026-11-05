/* =========================================================================
   Tema claro / escuro.
   -------------------------------------------------------------------------
   Três estados: "system" (padrão, segue o Windows/celular), "light" e "dark".
   A escolha vira o atributo data-theme no <html>, que é o que o CSS lê
   (src/styles/tokens.css). Sem escolha não há atributo, e vale a media query
   prefers-color-scheme. public/theme-init.js aplica a escolha antes da
   primeira pintura; este módulo cuida das trocas depois disso.
   ========================================================================= */

export const THEME_KEY = 'todai-theme';
/** Chave do tempo da marca Oliver; lida só quando a nova ainda não existe. */
export const LEGACY_THEME_KEY = 'oliver-theme';
export const THEMES = ['system', 'light', 'dark'];

const isTheme = (value) => value === 'light' || value === 'dark';

export function readTheme(storage = globalThis.localStorage) {
  try {
    const value = storage.getItem(THEME_KEY);
    if (value !== null) return isTheme(value) ? value : 'system';
    /* public/theme-init.js já passa a chave antiga para a nova antes da
       primeira pintura; aqui é só a rede de segurança se ele não rodou. */
    const legacy = storage.getItem(LEGACY_THEME_KEY);
    if (!isTheme(legacy)) return 'system';
    storage.setItem(THEME_KEY, legacy);
    storage.removeItem(LEGACY_THEME_KEY);
    return legacy;
  } catch {
    return 'system';
  }
}

export function applyTheme(choice, root = document.documentElement) {
  if (choice === 'light' || choice === 'dark') {
    root.setAttribute('data-theme', choice);
  } else {
    root.removeAttribute('data-theme');
  }
}

export function saveTheme(choice) {
  try {
    /* A chave antiga sai junto: senão "Tema do sistema" voltaria a ler a
       escolha antiga na próxima visita. */
    localStorage.removeItem(LEGACY_THEME_KEY);
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    /* Sem armazenamento: a escolha vale só até recarregar a página. */
  }
}

/** Próximo estado do botão: sistema → claro → escuro → sistema. */
export function nextTheme(choice) {
  const index = THEMES.indexOf(choice);
  return THEMES[(index + 1) % THEMES.length];
}

export const THEME_LABELS = {
  system: 'Tema do sistema',
  light: 'Tema claro',
  dark: 'Tema escuro',
};
