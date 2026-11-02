# Loja do TODAI no site

O site deixou de ser só portfólio: a home vende o sistema e existem páginas para
comprar, receber e entender o produto. Este documento descreve o que existe, de
onde vem cada informação e o que ainda falta.

## Páginas

| Rota | Arquivo | O que faz |
| --- | --- | --- |
| `/` | `src/pages/Home.jsx` | Início do produto (`Hero`), o sistema (`Product`), preço (`Pricing`) e, abaixo, os serviços sob medida |
| `/comprar` | `src/pages/Buy.jsx` | Formulário de compra; manda os dados ao servidor e leva o cliente ao Mercado Pago |
| `/obrigado` | `src/pages/ThankYou.jsx` | Para onde o Mercado Pago devolve o cliente; só explica o que vem a seguir |
| `/baixar` | `src/pages/Download.jsx` | Download e instruções de instalação |
| `/termos` | `src/pages/Terms.jsx` | Termos de uso |
| `/privacidade` | `src/pages/Privacy.jsx` | Política de privacidade (LGPD) |
| `/minha-licenca` | `src/pages/MyLicense.jsx` | Área do cliente comprador: licença, vencimento e computadores |

As páginas internas usam `src/components/SiteShell.jsx` (cabeçalho e rodapé simples);
a home mantém o cabeçalho próprio com as âncoras de seção.

## Fluxo da compra

1. `/comprar` valida no navegador (CPF/CNPJ pelo mesmo `shared/taxId.js` do servidor)
   e envia `POST /api/checkout` com `companyName`, `contactName`, `taxId`, `email`,
   `phone`, `devices` e `acceptTerms`.
2. O servidor (`server/services/checkout.js`) valida de novo, limita a 5 pedidos
   por 10 minutos e chama a API de licenciamento. Resposta: `{ checkoutUrl }`.
3. A página só segue para `checkoutUrl` se for `https:`. Erros 400 viram mensagem
   por campo; 409 (documento que já é cliente: mensagem neutra, e a API manda o link da Minha licença ao e-mail do cadastro), 429 e 503 viram um aviso no topo.
4. Pago o plano, o Mercado Pago devolve o cliente em `/obrigado`. **Quem libera a
   licença e manda o e-mail é a API** (webhook + entrega automática), nunca o site.

## Minha licença (área do comprador)

Não há senha nem conta do site para o comprador. O fluxo:

1. O cliente informa CPF/CNPJ e e-mail em `/minha-licenca`; o site chama
   `POST /api/account/access-link` (limite de 5 pedidos em 10 minutos por visitante).
2. O servidor repassa à API (`/api/v1/site/account/access-link`). Se documento e
   e-mail baterem com um cliente ativo, a API manda ao e-mail cadastrado um link
   `https://SEUDOMINIO/minha-licenca#acesso=<token>` que vale 30 minutos. A
   resposta é sempre a mesma, para não revelar quem é cliente.
3. Aberto o link, a página tira o token da barra de endereço, guarda-o só na aba
   (`sessionStorage`) e chama `POST /api/account/summary`, que a API responde com
   empresa, situação da licença, pago até, computadores ativados e mensalidade.
4. Token vencido ou adulterado: a página volta ao formulário pedindo um link novo.

Por que link por e-mail e não a conta do site: o cadastro do site não confere o
e-mail, então qualquer pessoa poderia criar uma conta com o e-mail de um cliente e
ver a licença dele. Receber o e-mail é a prova de identidade.

Testes: `tests/server/account.test.js` (site) e `CustomerAccessTests` (API).
Conferido no navegador com uma API falsa: formulário, link com token, resumo,
token saindo da barra de endereço, temas claro e escuro e 375 px. Falta a prova com
a API real, o PostgreSQL e o envio de e-mail (ver `PENDENCIAS.md` do painel, P-016).

## De onde vêm os dados

- **Preço e limites:** `shared/plan.js` (`PLAN`). O valor cobrado é o que a API
  calcula; o do site é só estimativa na tela.
- **Textos do produto:** `src/data/product.js`. Só pode citar o que o sistema faz
  hoje (ver `Sistema-Gerenciamento-Estoque/docs/FUNCIONALIDADES.md`). NFC-e fica de
  fora até ser provada em produção.
- **Link do instalador:** variável `VITE_INSTALLER_URL`, lida no build. Em branco, a
  página `/baixar` diz que o link chega por e-mail.
- **Contato e marca:** `src/data/company.js`.

## Visual e temas

O site tem tema escuro e tema claro. Sem escolha do visitante, segue o tema do
sistema (Windows/celular); o botão de tema (sol, lua ou monitor) no cabeçalho de
todas as páginas e no painel alterna sistema → claro → escuro e guarda a escolha
no navegador (`oliver-theme`).

Como funciona:

- `src/styles/tokens.css` define todas as cores. O bloco `:root` é o escuro; o
  claro redefine os mesmos nomes em `@media (prefers-color-scheme: light)` (sem
  escolha) e em `:root[data-theme="light"]` (escolha explícita).
- Camadas translúcidas usam `rgba(var(--ink), alfa)`: a "tinta" é branca no escuro
  e quase preta no claro. Sombras usam `--shadow-rgb` e `--shadow-k`.
- `public/theme-init.js` aplica a escolha antes da primeira pintura (arquivo
  separado porque a CSP não aceita script inline); `src/app/theme.js` e
  `src/components/ThemeToggle.jsx` cuidam das trocas.
- Regra para CSS novo: nenhuma cor solta. Use os tokens; se faltar um, crie-o nos
  dois temas.

Conferido no navegador em 1280 px e 375 px, nos dois temas.

## Textos legais

`/termos` e `/privacidade` descrevem só o que o sistema e o contrato fazem hoje.
O dono aprovou os textos em 19/10/2026 sem revisão jurídica. A razão social sai de
`LEGAL_NAME` em `src/data/company.js` (hoje igual ao nome da empresa); CNPJ e
endereço entram no mesmo arquivo e na seção 1 dos termos quando existirem.
Qualquer dado novo coletado pelo site ou pelo sistema exige atualizar a política
de privacidade na mesma tarefa.
