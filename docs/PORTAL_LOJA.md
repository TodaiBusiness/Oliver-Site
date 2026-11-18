# Portal de pedidos da loja (site)

Lado SITE do portal `/l/:slug` (contrato PDV, API e site: Parte 3). A API da loja guarda catálogo, pedidos, aprovação e fiado; o site guarda só **identidade e senha** dos clientes da loja e faz de BFF.

## Visão geral

- SPA: `src/pages/portal/*`, carregada à parte (`PortalApp`, lazy) dentro de `PortalLayout`, FORA do `SiteLayout`. Rotas: `/l/:slug`, `entrar`, `cadastro`, `esqueci-senha`, `redefinir-senha`, `catalogo`, `carrinho`, `pedidos`, `pedidos/:id`, `fiado`, `conta`.
- BFF: `/api/portal/:slug/...` (`server/services/portal.js`, rotas em `server/app.js`).
- Cliente HTTP da API: `server/services/portalApi.js` (itens 9 a 16 do contrato). Usa `LICENSING_API_BASE_URL` + `SITE_SERVICE_API_KEY` (mesmo par do checkout), `fetch` injetável, tempo máximo e erros genéricos.
- Callback API -> site: `POST /api/service/portal/eventos` (só com `X-Service-Key`), envia e-mail ao dono da conta.

## BFF

| Método e rota | Auth | Nota |
|---|---|---|
| GET `/vitrine` | pública | nome, cores, avisos, horários, `fiadoAtivo`; nunca preço |
| GET `/logo`, `/produtos/:id/imagem` | pública | bytes só se forem imagem de verdade (PNG/JPEG/GIF/WebP até 200 KB); `nosniff`; imagens servidas pelo site por causa da CSP |
| POST `/register` | pública | sempre 202 (e-mail repetido é indistinguível; a pessoa recebe aviso por e-mail) |
| POST `/login` `/logout` `/forgot` `/reset` | pública/sessão | erro único "E-mail ou senha incorretos."; `forgot` sempre 202 |
| GET `/me` | sessão | dados da conta + `{estado,tabela}` vindos da API |
| GET `/catalogo` | sessão | UM preço (`preco` = `precoAplicado`); lista branca de campos |
| POST/GET `/pedidos`, GET `/pedidos/:id`, POST `/pedidos/:id/cancelar` | sessão | `contaId` SEMPRE o da sessão |
| GET `/fiado` | sessão | 404 se a loja não usa fiado |

## Segurança

- **Isolamento**: tabelas `portal_accounts`, `portal_sessions`, `portal_resets` (todas com `store_slug`; e-mail único por loja). Nunca usa `users`/`oi_session`: conta do portal não entra em `/cliente` nem `/admin` e vice-versa.
- **Sessão**: cookie `oi_portal_<slug>`, HttpOnly, SameSite=Lax, `Path=/api/portal/<slug>`, Secure em produção. No banco fica o SHA-256 do token; a consulta confere o `store_slug` da sessão E da conta. Limite absoluto de 30 dias e 7 dias de inatividade (`PORTAL` em `server/config.js`). A faxina apaga as vencidas.
- **Senha**: scrypt (`security/password.js`) e a mesma regra de força do site. Login de e-mail inexistente gasta o mesmo scrypt.
- **Limites** (em memória, por instância): login por IP (20/10 min) e por loja+e-mail+IP (5/15 min); cadastro (5/10 min e 15/h por IP); recuperação (5/10 min por IP, 3/h por e-mail); redefinição (10/10 min); leitura (600/min); pedidos (20/h por conta).
- **CSRF**: escrita exige `X-Portal-Request: 1` (navegador de outro site não consegue enviar sem CORS, que não existe), recusa `Sec-Fetch-Site: cross-site` e, com origens configuradas, a conferência de `Origin` já existente.
- **Preço**: sem sessão não há catálogo; a vitrine não leva valor. Qualquer outro preço que a API mande é descartado. O servidor nunca confia em preço/total do navegador (a API recalcula).
- **Recuperação de senha**: token de 32 bytes, SHA-256 no banco, 30 min, uso único, preso à loja, no fragmento da URL (`#token=`); redefinir derruba as sessões.
- **LGPD**: aceite no cadastro (`consent_at`), política de privacidade atualizada, cookie de sessão como armazenamento essencial. `/l/*` não entra na contagem de visitas.
- **Logo**: só `data:image/...` ou caminho da própria API (nunca URL externa: SSRF).

## E-mails

`mailer.send` aceita `html`, `fromName` (nome da loja, endereço continua o de `MAIL_FROM`) e `replyTo`. Textos em `services/portalMail.js` (tudo que vem de fora é escapado). O callback repete-seguro: mesmo evento em 10 min não duplica e provedor fora responde 503 para a API tentar de novo. Reply-to sai se a vitrine trouxer `emailContato` (ou `email`).

## Tema da loja

`shared/portalTheme.js` transforma `cores{primaria,secundaria,fundo}` em propriedades `--p-*` no `<html>` (via CSSOM, compatível com a CSP). Todo par de texto passa 4,5:1 (3:1 para borda de campo e foco); cor inválida ou fundo de tom médio cai para a cor segura. Teste: `tests/portal-theme.test.js`.

## Verificado contra a API real (18/11/2026)

Fluxo ponta a ponta com a API real e um PDV simulado: cadastro, aprovação como atacado (preço muda), pedido, aceite, recusa, cancelamento, fiado, e-mail por callback e isolamento entre duas lojas. Corrigido: `entrega.endereco` do pedido vai à API como UMA linha de texto (a API recusa objeto com 400); o detalhe do pedido mostra o endereço em texto.

## Suposições sobre a API (confirmar com a parte da API)

- Vitrine pode trazer `prazoCancelarMin`, `emailContato`; `horarios` é texto, lista ou mapa (com `faixas` opcional).
- Catálogo: `{produtos:[{produtoId,nome,categoria,unidade,descricao,precoAplicado,disponivel,multiplo,caixaQtd,imagemHash}]}`; a foto só é pedida se houver `imagemHash` (ou `temImagem:true`).
- Pedido: `podeCancelar`/`cancelavelAte` opcionais; `itens[].precoUnitario`, `entrega.taxa`.
- Erros: ProblemDetails com `code`; `portal_inactive` (404) e `addon_not_active` (403) viram "loja indisponível". Códigos de recusa conhecidos têm texto próprio (`min_order`, `item_unavailable`, `invalid_multiple`, `outside_hours`, `cancel_window_closed`...); os demais 400/409/422 repassam `detail` só se for curto.

## Testar sem a API real

`node scripts/mock-portal-api.mjs` sobe a API falsa (porta 8799, lojas `loja-demo`, `so-retirada`, `cor-ruim`, `loja-inativa`). Site local:

```
LICENSING_API_BASE_URL=http://localhost:8799 \
SITE_SERVICE_API_KEY=chave-do-mock-do-portal-0123456789abcdef npm run dev:api
```

Os testes (`tests/server/portal.test.js`) usam o mesmo mock por `fetch` falso. Controles de bancada: `POST /__mock/pedidos/:id/estado`, `POST /__mock/contas/:id/decisao`.

## Banco

`npm run db:migrate` cria as três tabelas (SQLite e Postgres; `schema.*.sql` e `reset.*.sql`).
