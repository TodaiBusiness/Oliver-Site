/* Aplica o tema escolhido antes de a página pintar, para não piscar o tema
   errado. Arquivo separado (e não <script> inline) porque a CSP do site só
   aceita script de arquivo próprio. A lógica completa está em src/app/theme.js;
   as chaves do localStorage precisam ser as mesmas de lá.
   A chave antiga ('oliver-theme', do tempo da marca Oliver) é passada para a
   nova uma única vez, para quem já tinha escolhido um tema não o perder. */
(function () {
  try {
    var KEY = 'todai-theme';
    var LEGACY_KEY = 'oliver-theme';
    var choice = localStorage.getItem(KEY);
    if (choice === null) {
      var legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy === 'light' || legacy === 'dark') {
        localStorage.setItem(KEY, legacy);
        choice = legacy;
      }
      localStorage.removeItem(LEGACY_KEY);
    }
    if (choice === 'light' || choice === 'dark') {
      document.documentElement.setAttribute('data-theme', choice);
    }
  } catch (e) {
    /* Sem armazenamento (aba anônima, bloqueio): segue o tema do sistema. */
  }
})();
