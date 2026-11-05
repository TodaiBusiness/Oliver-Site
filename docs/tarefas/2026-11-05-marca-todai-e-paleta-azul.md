# Marca TODAI por dentro e paleta azul (site)

Data: 2026-11-05. Branch: `claude/renomear-todai` (criada de `origin/main` em `dc5c317`). Commit local; sem push nem merge.

## Skills e comandos invocados

`/aura-retomar-execucao:aura` (no pedido anterior da mesma sessão, que fixou a ordem site → painel → PDV).

## O que foi pedido

1. Trocar Oliver, OliverImports e OliverImportsBusiness por Todai no sistema inteiro, inclusive nomes técnicos.
2. Fazer isso com migração, sem perder o que já está salvo.
3. Mudar as cores: no lugar do verde, tudo em azul (bebê, normal e escuro), preto e branco.
4. Começar pelo site; depois o painel (Panel-Desktop) e o PDV, cada um numa branch nova.

## Objetivo

O site sem a marca Oliver no código, nas imagens e na documentação, com a paleta azul nos dois temas e sem perder o tema
escolhido pelo visitante, o banco local de desenvolvimento nem a imagem que a VPS baixa.

## Restrições

- Não quebrar a VPS que está sendo montada pelo guia da Hostinger, que ainda usa `oliver-site`.
- Não mexer em serviços externos: Render, Neon e o nome do repositório no GitHub.
- Sem commit, merge ou push sem pedido do dono.

## Checklist

- [x] Nomes trocados, com migração (ver P-016 em `docs/PENDENCIAS.md`).
- [x] Paleta azul em tokens, CSS, SVGs, favicon, `theme-color` e `og-image.png`.
- [x] Testes novos para as migrações (`tests/marca-todai.test.js`).
- [x] `npm test` 228/228 e `npm run build`.
- [x] Conferência no navegador com `node server.js`, nos dois temas.
- [x] Documentação: `docs/LOJA_E_COMPRA.md` (paleta), `README.md`, `docs/PENDENCIAS.md` (P-016 resolvida, P-017 e P-018 abertas).
- [x] Commit na branch `claude/renomear-todai` (pedido do dono em 05/11); sem push.

## Estado

Feito e verificado no site. A seguir vêm o Panel-Desktop e o PDV, que partem de `origin/master`: os clones locais estão
222 e 590 commits atrás. O `.env` local (não versionado) ainda tem `VITE_COMPANY_EMAIL` com o e-mail antigo. A imagem
publicada pelo fluxo usa a variável do GitHub (`vendas@todai.com.br`).
