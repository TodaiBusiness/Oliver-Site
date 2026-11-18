# Portal de pedidos da loja (site)

Lado SITE do portal `/l/:slug` (contrato PDV, API e site: Parte 3). A API da loja guarda catálogo, pedidos, aprovação e fiado; o site guarda só **identidade e senha** dos clientes da loja e faz de BFF.

## Visão geral

- SPA: `src/pages/portal/*`, carregada à parte (`PortalApp`, lazy) dentro de `PortalLayout`, FORA do `SiteLayout`. Rotas: `/l/:slug`, `entrar`, `cadastro`, `esqueci-senha`, `redefinir-senha`, `catalogo`, `carrinho`, `pedidos`, `pedidos/:id`, `fiado`, `conta`.
- BFF: `/api/portal/:slug/...` (`server/services/portal.js`, rotas em `server/app.js`).
- Cliente HTTP da API: `server/services/portalApi.js` (itens 9 a 16 do contrato). Usa `LICENSING_API_BASE_URL` + `SITE_SERVICE_API_KEY` (mesmo par do checkout), `fetch` injetável, tempo máximo e erros genéricos.
- Callback API -> site: `POST /api/service/portal/eventos` (só com `X-Service-Key`), envia e-mail ao dono da conta (tipos `pedido`, `conta` e `agendamento`).

## BFF

| Método e rota | Auth | Nota |
|---|---|---|
| GET `/vitrine` | pública | nome, cores, avisos, horários, `fiadoAtivo`; nunca preço |
| GET `/logo`, `/produtos/:id/imagem` | pública | bytes só se forem imagem de verdade (PNG/JPEG/GIF/WebP até 200 KB); `nosniff`; imagens servidas pelo site por causa da CSP. A logo leva `ETag` (hash do conteúdo) e `Cache-Control: public, max-age=300`; `If-None-Match` igual dá 304 |
| GET `/vitrine` | pública | nome, cores, avisos, horários, `abertoAgora`, `proximaAbertura`, `prazoCancelarMin`, `fiadoAtivo`; nunca preço (`emailContato` fica no servidor) |
| GET `/logo`, `/produtos/:id/imagem` | pública | bytes só se forem imagem de verdade (PNG/JPEG/GIF/WebP até 200 KB); `nosniff`; imagens servidas pelo site por causa da CSP |
| POST `/register` | pública | sempre 202 (e-mail repetido é indistinguível; a pessoa recebe aviso por e-mail) |
| POST `/login` `/logout` `/forgot` `/reset` | pública/sessão | erro único "E-mail ou senha incorretos."; `forgot` sempre 202 |
| GET `/me` | sessão | dados da conta + `{estado,tabela}` vindos da API |
| GET `/catalogo` | sessão | UM preço (`preco` = `precoAplicado`); lista branca de campos |
| POST/GET `/pedidos`, GET `/pedidos/:id`, POST `/pedidos/:id/cancelar` | sessão | `contaId` SEMPRE o da sessão |
| GET `/fiado` | sessão | 404 se a loja não usa fiado |

## Loja aberta ou fechada

A API calcula (`abertoAgora` booleano; `proximaAbertura` `yyyy-MM-ddTHH:mm` em hora de Brasília ou `null`); o site só mostra. Lista branca no BFF: `abertoAgora` que não for booleano vira `null` (sem selo) e `proximaAbertura` fora do formato vira `null`.

- Selo no cabeçalho (`StoreStatus`, `statusDaLoja` em `format.js`): **Aberto agora** (verde-escuro com ícone de check, texto branco 7,1:1, independente das cores da loja) ou **Fechado agora · abre amanhã às 08:00** (neutro, ícone de relógio, cores do tema; nunca em tom de erro). "Hoje / amanhã / dia da semana / dd/MM" comparam com o dia de hoje em Brasília (`aberturaEmTexto`). Sem `proximaAbertura`, só "Fechado agora".
- Carrinho: com a loja aberta a pedidos e fechada agora, aviso "A loja está fechada agora; seu pedido fica na fila e a loja confirma quando abrir." O site **não bloqueia** o envio. Atenção: a API de hoje ainda recusa pedido fora do horário (409 `store_closed`, "A loja não está aceitando pedidos agora."); o aviso só é verdadeiro quando a API deixar de recusar.
- Cancelar (`podeCancelarPedido`): `prazoCancelarMin` 0 esconde o botão (com texto "Esta loja não permite cancelar pelo portal"); fora isso vale `podeCancelar` da API, `cancelavelAte` ou a conta do prazo, e só em `recebido`.
- O selo reflete o momento do carregamento da página, não é atualizado sozinho.

## Segurança

- **Isolamento**: tabelas `portal_accounts`, `portal_sessions`, `portal_resets` (todas com `store_slug`; e-mail único por loja). Nunca usa `users`/`oi_session`: conta do portal não entra em `/cliente` nem `/admin` e vice-versa.
- **Sessão**: cookie `oi_portal_<slug>`, HttpOnly, SameSite=Lax, `Path=/api/portal/<slug>`, Secure em produção. No banco fica o SHA-256 do token; a consulta confere o `store_slug` da sessão E da conta. Limite absoluto de 30 dias e 7 dias de inatividade (`PORTAL` em `server/config.js`). A faxina apaga as vencidas.
- **Senha**: scrypt (`security/password.js`) e a mesma regra de força do site. Login de e-mail inexistente gasta o mesmo scrypt.
- **Limites** (em memória, por instância): login por IP (20/10 min) e por loja+e-mail+IP (5/15 min); cadastro (5/10 min e 15/h por IP); recuperação (5/10 min por IP, 3/h por e-mail); redefinição (10/10 min); leitura (600/min); pedidos (20/h por conta).
- **CSRF**: escrita exige `X-Portal-Request: 1` (navegador de outro site não consegue enviar sem CORS, que não existe), recusa `Sec-Fetch-Site: cross-site` e, com origens configuradas, a conferência de `Origin` já existente.
- **Preço**: sem sessão não há catálogo; a vitrine não leva valor. Qualquer outro preço que a API mande é descartado. O servidor nunca confia em preço/total do navegador (a API recalcula).
- **Recuperação de senha**: token de 32 bytes, SHA-256 no banco, 30 min, uso único, preso à loja, no fragmento da URL (`#token=`); redefinir derruba as sessões.
- **LGPD**: aceite no cadastro (`consent_at`), política de privacidade atualizada, cookie de sessão como armazenamento essencial. `/l/*` não entra na contagem de visitas.
- **Logo**: só `data:image/...` ou caminho da própria API (nunca URL externa: SSRF). A logo que o lojista escolhe no PDV chega assim: a API põe `logoUrl: /api/v1/site/portal/{slug}/logo` na vitrine, o BFF busca esse caminho com a chave de serviço, confere os bytes (`detectarTipoReal`: SVG, HTML e arquivo acima de 200 KB viram 404) e a serve em `/api/portal/:slug/logo`; a vitrine do site sempre aponta para o caminho do BFF. Teste: `tests/server/portal.test.js` (logo enviada pelo PDV).

## E-mails

`mailer.send` aceita `html`, `fromName` (nome da loja, endereço continua o de `MAIL_FROM`) e `replyTo`. Textos em `services/portalMail.js` (tudo que vem de fora é escapado). O callback repete-seguro: mesmo evento em 10 min não duplica e provedor fora responde 503 para a API tentar de novo. Reply-to sai se a vitrine trouxer `emailContato` (ou `email`).

## Tema da loja

`shared/portalTheme.js` transforma `cores{primaria,secundaria,fundo}` em propriedades `--p-*` no `<html>` (via CSSOM, compatível com a CSP). Todo par de texto passa 4,5:1 (3:1 para borda de campo e foco); cor inválida ou fundo de tom médio cai para a cor segura. Teste: `tests/portal-theme.test.js`.

## Verificado contra a API real (18/11/2026)

Fluxo ponta a ponta com a API real e um PDV simulado: cadastro, aprovação como atacado (preço muda), pedido, aceite, recusa, cancelamento, fiado, e-mail por callback e isolamento entre duas lojas. Corrigido: `entrega.endereco` do pedido vai à API como UMA linha de texto (a API recusa objeto com 400); o detalhe do pedido mostra o endereço em texto.

## Suposições sobre a API (confirmar com a parte da API)

- Vitrine traz `abertoAgora`, `proximaAbertura`, `prazoCancelarMin` (confirmados na API); `emailContato` ainda não existe lá (o site já o aceita se vier); `horarios` é texto, lista ou mapa (com `faixas` opcional).
- Catálogo: `{produtos:[{produtoId,nome,categoria,unidade,descricao,precoAplicado,disponivel,multiplo,caixaQtd,imagemHash}]}`; a foto só é pedida se houver `imagemHash` (ou `temImagem:true`).
- Pedido: `podeCancelar`/`cancelavelAte` opcionais; `itens[].precoUnitario`, `entrega.taxa`.
- Erros: ProblemDetails com `code`; `portal_inactive` (404) e `addon_not_active` (403) viram "loja indisponível". Códigos de recusa conhecidos têm texto próprio (`min_order`, `item_unavailable`, `invalid_multiple`, `outside_hours`, `cancel_window_closed`...); os demais 400/409/422 repassam `detail` só se for curto.

## Verificado com a logo do PDV (18/11/2026)

API real (PostgreSQL) + site real + `scripts/simular-pdv-logo.mjs`, que faz o que o PDV faz (ativa um computador, liga o adicional, configura o portal, publica o catálogo e envia a logo com `PUT /pdv/portal/logo`; `--remover` chama o `DELETE`). A vitrine `/l/loja-logo` mostra a logo no cabeçalho (fotos em `docs/evidencias/portal-logo-390.png` e `portal-logo-1280.png`); depois do `DELETE` a vitrine volta sem `logoUrl` e `/api/portal/:slug/logo` dá 404. Variáveis do script: ver o cabeçalho dele.

## Agendamento (Parte 5, lado do site)

Contrato: `CONTRATO_AGENDA_PORTAL.md`. O PDV publica regras e ocupação; a API calcula horários livres e SEGURA o horário (`solicitado`) até a loja confirmar. O site só autentica, valida e repassa.

- **Aba "Agendar"**: só aparece com `temAgenda: true` na vitrine (B1/vitrine). Loja que tem agenda e não recebe pedidos (`aceitaPedidos` falso) vira "só agenda": o menu esconde Catálogo/Carrinho/Pedidos, e a entrada mostra "Agendar horário". `/agenda` 404 vira `AGENDA_INATIVA` ("Esta loja não recebe agendamentos pelo portal").
- **Cliente HTTP** (`portalApi.js`): `agenda`, `horarios`, `criarAgendamento`, `agendamentos`, `agendamento`, `cancelarAgendamento`, `remarcarAgendamento` (B1 a B4), todos com lista branca. Serviços chegam só com `id, nome, categoria, duracao, preco, exigePorte, porte{P,M,G:{duracao,preco}}` (o preço da loja, nunca custo, comissão ou outra tabela); profissionais só com `id, nome, cor, servicos[ids]` (jornada, folgas e ocupação ficam na API). Recusas de escrita e de horários (`slot_taken`, `too_soon`, `too_far`, `cancel_window_closed`, `porte_required`...) têm texto próprio em PT-BR; outros erros viram "portal indisponível".
- **BFF** (sessão da conta; `contaId` SEMPRE o da sessão, `?contaId=` ou `contaId` no corpo do navegador são ignorados):

| Método e rota | Nota |
|---|---|
| GET `/agenda` | preset, rótulos, serviços ativos, profissionais, regras |
| GET `/agenda/horarios?servicos=a,b&profissionalId=id\|qualquer&data=YYYY-MM-DD[&porte=P\|M\|G]` | valida tudo antes de chamar a API; só esses 4 parâmetros passam |
| POST `/agendamentos` | `servicos[]` (1 a 10 ids), `profissionalId\|null`, `inicio`, `pet{nome,especie,raca,porte}`, `porte`, `observacao` (500), `idempotencyKey`; escrita exige `X-Portal-Request`; 20/h por conta |
| GET `/agendamentos`, GET `/agendamentos/:id` | só da conta; id de outra conta/loja dá 404 |
| POST `/agendamentos/:id/cancelar`, `/remarcar {novoInicio, profissionalId?}` | a API confere o prazo (`prazoCancelarMin`) e o horário novo; remarcar volta a `solicitado` |

- **SPA**: `/l/:slug/agendar` (passos: serviço(s), profissional ou "qualquer", dia e horário, pet só no preset Pet shop, revisar e enviar), `/l/:slug/agendamentos` e `/agendamentos/:id` (status, cancelar, remarcar). Horários em botões por período (manhã, tarde, noite), em hora de Brasília. Serviço com porte pede o porte ANTES dos horários (a duração muda com ele); preset Pet shop sem serviço por porte pede o porte no passo do pet. Horário ocupado (409 `SLOT_TAKEN`) volta ao passo dos horários, recarrega a lista e avisa. Fora do horário da loja: "a loja confirma quando abrir". Sem pagamento online. Rótulos: Barbearia = Barbeiro, Pet shop = Tosador, demais = Profissional (o que a loja publicar em `rotulos.profissional` vence). Cancelar e remarcar aparecem só enquanto `podeCancelar` (se a API mandar) ou o prazo da loja permitir.
- **E-mail (B5)**: callback `tipo: 'agendamento'` com `{slug, agendamentoId, contaId, estado, motivo?, inicio}`. Manda e-mail em `solicitado`, `confirmado`, `recusado`, `cancelado_cliente`, `cancelado_loja` e `remarcado` (`concluido` e `nao_compareceu` respondem `sent:false, reason:'sem_aviso'`). Texto com nome da loja, serviço, profissional (do detalhe, se a API responder) e horário "em horário de Brasília"; HTML escapado. Não repete o mesmo estado + horário em 10 min (remarcar para outro horário avisa de novo).
- **Suposições** (confirmar com a API): vitrine traz `temAgenda`; `rotulos` é um mapa com `profissional`/`profissionais`/`qualquer`/`agendar` (todos opcionais); horários vêm como ISO com ou sem fuso (sem fuso = Brasília); `motivoVazio` aceito: `sem_expediente`, `sem_profissional`, `antecedencia`, `muito_longe`, `folga` (qualquer outro vira "todos os horários estão ocupados"); detalhe do agendamento pode trazer `podeCancelar`.
- **Testes**: `tests/server/portal-agenda.test.js` (BFF, isolamento por conta e por loja, validação, cliente HTTP com `fetch` falso, e-mail) e `tests/portal-agenda-format.test.js` (hora de Brasília, rótulos, prazo). Capturas: `docs/evidencias/agenda-*-390.png` e `-1280.png` (fluxo completo no mock: horários, revisar, detalhe, lista, remarcar, conflito 409, porte do pet).

## Testar sem a API real

`node scripts/mock-portal-api.mjs` sobe a API falsa (porta 8799, lojas `loja-demo`, `so-retirada`, `cor-ruim`, `loja-fechada` (fechada agora, abre amanhã às 08:00, prazo de cancelar 0), `barbearia-demo` (agenda preset Barbearia, só agenda), `petshop-demo` (agenda preset Pet shop, serviços por porte, fechada agora), `loja-inativa`). Site local:

```
LICENSING_API_BASE_URL=http://localhost:8799 \
SITE_SERVICE_API_KEY=chave-do-mock-do-portal-0123456789abcdef npm run dev:api
```

Os testes (`tests/server/portal.test.js`) usam o mesmo mock por `fetch` falso. Controles de bancada: `POST /__mock/pedidos/:id/estado`, `POST /__mock/contas/:id/decisao`, `POST /__mock/agendamentos/:id/estado {estado,motivo}` (a loja confirma, recusa, conclui) e `POST /__mock/agenda/ocupacao {slug,profissionalId,inicio,fim}` (o PDV ocupa um horário). O mock calcula horários com jornada, folga, antecedência e conflito (B1 a B4).

## Banco

`npm run db:migrate` cria as três tabelas (SQLite e Postgres; `schema.*.sql` e `reset.*.sql`).

## Integração real da Parte 5 (API + site + PDV rodando juntos)

Fluxo conferido com a API real (PostgreSQL, esquema 23), este site e um console que usa as classes reais do PDV (`PublicacaoAgendaMontador`, `PortalAgendaRegras`, `PortalCliente`,
`AgendaDisponibilidade`): vitrine com `temAgenda` e rótulos por preset; horários livres iguais aos do PDV em 15 cenários (jornada com pausa, folga, ocupação do PDV, porte, serviços
encadeados, "qualquer profissional"); pedido que segura o horário e 409 `slot_taken` com recarga da lista; confirmar, recusar e remarcar pela loja (e-mail do tipo agendamento);
cancelar e remarcar pelo cliente dentro e fora do prazo; confirmação automática; loja "fechada" aceitando pedido; isolamento entre lojas; agenda retirada (`DELETE`) = 404 `portal_agenda_inactive`.
Divergências corrigidas neste repositório: o BFF lia a agenda no formato do contrato antigo (`duracao`, `porte{}`, `slotMin`, minutos) e agora lê a da API (`duracaoMin`, `portes[]`,
`passoMin`, `antecedenciaMinHoras`, `servicoId`, `confirmacaoAutomatica`), completando o porte sem valor próprio com o valor-base; o horário escolhido leva `duracaoMin` e `total` da API (exceção
do profissional) para o resumo; `remarcado` também pode ser cancelado e remarcado pelo cliente. Capturas: `docs/evidencias/integracao-agenda-*`.
Limite conhecido: ao remarcar, os horários do próprio agendamento aparecem ocupados na lista (a API aceita remarcar sobre si mesmo, mas B2 não exclui o pedido).
