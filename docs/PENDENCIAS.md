# Pendências do Oliver-Site

Registro único de tudo o que ficou para depois neste projeto. Uma pendência resolvida não é apagada: ela vai para
`Resolvidas`, com a data e o que foi feito. Os identificadores nunca são reaproveitados.

## Abertas

- **P-001** · 2026-10-19 · **O site não vende o produto.** A home é um portfólio de agência. Faltam:
  - preço e planos;
  - checkout;
  - download do instalador;
  - área do cliente com licença.

  O usuário decidiu:
  - produto em primeiro lugar e serviços depois;
  - compra automática pelo Mercado Pago;
  - hospedagem numa VPS da Hostinger.

  O plano completo está no `PLANO_LANCAMENTO.html` (em `Documentos\Claude-HTML\Panel-Desktop`), nas fases F3, F4 e F5.

  **Andamento (19/10/2026):** o servidor tem o checkout e a interface existe: início do produto, preço, `/comprar`,
  `/obrigado`, `/baixar`, `/termos` e `/privacidade` (ver `docs/LOJA_E_COMPRA.md`). A área do comprador também existe
  (`/minha-licenca`, P-009). Falta a prova da compra de ponta a ponta com o Mercado Pago (P-005 e `docs/COMPRA_AUTOMATICA.md`).

## Resolvidas

- **P-011** · aberta em 2026-10-27 · resolvida em 2026-10-27 · O site não registrava visitas nem entregava o relatório
  que o Panel Desktop espera (atende à P-074 do painel) → o servidor conta cada página aberta de forma agregada (país,
  cidade, origem, campanha, aparelho, página; sem IP, sem cookie) na tabela `site_visit_stats` e responde
  `GET /api/analytics/report?days=N` com `X-Analytics-Key` = `ANALYTICS_READ_KEY`, no formato do painel (`window`,
  `totals`, `daily`, `rankings`). `/privacidade` atualizada. Verificado com testes automáticos (`tests/server/analytics.test.js`),
  `npm run build` e requisições reais ao servidor local (ver `docs/VISITANTES.md`). Falta só ligar no painel:
  `ANALYTICS_READ_KEY` no site e `SiteAnalytics__BaseUrl`/`SiteAnalytics__ReadKey` na API (Hostinger).

- **P-010** · aberta em 2026-10-21 · resolvida em 2026-10-21 · Achados baixos da varredura no site → `RouteSeo`
  atualiza `canonical` e `og:url` na navegação interna e o caminho não diferencia maiúsculas (`/Comprar` mostra o
  título de `/comprar`); `server/http/origins.js` tira a barra final de `ALLOWED_ORIGINS` no `server.js` e na função
  do Netlify; o limite por processo do `rateLimit.js` ficou documentado em `SEGURANCA.md` (com um processo só na VPS
  basta). Teste `tests/seo-rota.test.js`; suíte 195 de 195 e build.
- **P-005** · aberta em 2026-10-19 · resolvida em 2026-10-21 · Formulário de orçamento nunca provado de ponta a ponta →
  provado com o servidor do site local e a API local: o formulário da home enviou o pedido, o site respondeu `201`, o
  pedido ficou no banco central (`solicitacoes_orcamento`, id 11, origem `Site`) e apareceu na tela Orçamentos do painel
  real (roteiro `--real` da `.visual-validation` do painel, que achou "#11 Teste P-005 Site (Site)" na lista).
- **P-002** · aberta em 2026-10-19 · resolvida em 2026-10-21 · A fonte Inter nunca carregava → o dono autorizou baixar a
  Inter (OFL); entrou pelo pacote `@fontsource-variable/inter` 5.3.0 (versão exata), importado em `src/main.jsx`, e o
  `--font-sans` passou a começar por `"Inter Variable"`. O build gera os `.woff2` em `dist/assets`, servidos pelo próprio
  site como `font/woff2`, então o CSP `font-src 'self'` não precisou mudar. Conferido no navegador com o servidor local:
  `document.fonts` mostra "Inter Variable 100 900" carregada e o `body` usa a Inter.
- **P-008** · aberta em 2026-10-19 · resolvida em 2026-10-21 · Mesmo título em todas as páginas → título e descrição por
  rota em `shared/seo.js` (aprovado pelo dono), aplicados no navegador por `src/app/RouteSeo.jsx` e no HTML enviado pelo
  `server.js`; conta, painel e 404 com `noindex`; o `index.html` passou a vender o Oliver Inventory. Conferido: 5 testes
  em `tests/seo.test.js`, `curl` de `/comprar` devolve o título e o canonical da rota, e no navegador a navegação interna
  de `/termos` para `/comprar` troca título, descrição e canonical. Suíte do site: 162 de 162.
- **P-004** · aberta em 2026-10-19 · resolvida em 2026-10-20 · README e `scripts/dev-api.mjs` desatualizados → README
  com as rotas da loja, o produto como conteúdo principal, o portfólio vindo do admin e o aviso do destino na VPS; a nota
  de que a integração "não está no GitHub" saiu; o script não fala mais da Netlify Function.
- **P-003** · aberta em 2026-10-19 · resolvida em 2026-10-20 · A home ignorava os projetos do admin → a seção
  `Projects` lê `GET /api/projects` e usa `src/data/projects.js` só como reserva (carregando, API fora ou nenhum projeto
  público). Conversão em `src/utils/publicProjects.js` com 3 testes. Conferido no navegador: sem projeto público aparecem
  os 3 do arquivo; com um projeto público criado no banco de desenvolvimento, ele vira o destaque.
- **P-006** · aberta em 2026-10-19 · resolvida em 2026-10-19 · Termos e privacidade sem revisão jurídica e sem dados
  da empresa → o dono decidiu não usar advogado por enquanto e aprovou os textos. A razão social vem de `LEGAL_NAME`
  em `src/data/company.js` (hoje igual ao nome da empresa, até o dono informar a razão social); CNPJ e endereço
  ainda não existem e entram no mesmo arquivo quando existirem. Comentários de "revisão pendente" removidos.
- **P-007** · aberta em 2026-10-19 · resolvida em 2026-10-19 · O site citava MySQL → mockup da home, tecnologias,
  projeto em destaque e dica do admin passaram a dizer PostgreSQL (`grep MySQL src` vazio; build ok).
- **P-009** · aberta em 2026-10-19 · resolvida em 2026-10-19 · Faltava a área do cliente comprador → página
  `/minha-licenca` com link de acesso por e-mail (30 min) e resumo da licença, rotas `/api/account/*` no site e
  `/api/v1/site/account/*` na API. Testes: 7 no site, 15 na API (token adulterado, vencido, de outra chave). Conferida
  no navegador com API falsa. A prova com API, banco e e-mail reais fica no P-016 do painel.
