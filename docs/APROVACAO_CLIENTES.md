# Aprovação de cliente novo (site, API e Panel)

Decisão do dono: quem se cadastra no site **não entra** até um administrador autorizar. O
admin recebe um e-mail de aviso e decide no Panel (Contas do site, aba "Clientes
pendentes": Autorizar ou Recusar).

## Estados

`users.status`: `PENDING`, `ACTIVE`, `REJECTED` (padrão `ACTIVE`; contas existentes, ADMIN e
o usuário de sistema ficam `ACTIVE`). Colunas novas: `decided_at`, `decided_by` (nome do admin),
`decision_note` (motivo opcional, até 300 caracteres, só para uso interno).
Postgres: `ADD COLUMN IF NOT EXISTS` em `schema.postgres.sql`; SQLite: `schema.sqlite.sql` e
`COLUNAS_NOVAS` em `server/db/sqlite.js`.

Transições: `PENDING -> ACTIVE`, `PENDING -> REJECTED`, `REJECTED -> ACTIVE`. Repetir a mesma
decisão responde 200 sem novo e-mail nem nova auditoria. `ACTIVE -> REJECTED` não existe (409).
A mudança é um `UPDATE ... WHERE status IN (...)` atômico: duas decisões simultâneas fazem
uma transição só.

## Fluxo no site

- `POST /api/auth/register`: cria `CLIENT` em `PENDING`, **sem sessão e sem cookie**, resposta
  `201 {status:'PENDING', message}`. E-mail já existente (inclusive recusado): 409 genérico.
- A tela `/cadastro` mostra "Recebemos seu cadastro. Avisaremos por e-mail quando for
  autorizado." O front não faz login depois do cadastro.
- `POST /api/auth/login`: só **depois** de a senha conferir, `PENDING` responde 403
  `CONTA_PENDENTE` ("Seu cadastro está aguardando autorização.") e `REJECTED` 403
  `CONTA_RECUSADA` (texto neutro, sem motivo). Sem sessão, sem 2FA e sem contar como falha de
  senha. Senha errada continua 401 genérico, igual a e-mail inexistente (não enumera contas).
- `resolveSession` rejeita (e apaga) a sessão de conta que não esteja `ACTIVE`; ao recusar,
  todas as sessões do cliente são apagadas.

## Aviso ao admin (melhor esforço)

Depois de gravar o cadastro, o site chama `POST {LICENSING_API_BASE_URL}/api/v1/site/client-registrations`
(`X-Service-Key: SITE_SERVICE_API_KEY`) com `{siteUserId, name, company, email, phone, requestedAt}`,
mesmo padrão de `checkout.js`, mas **sem esperar** e com timeout de 8 s. A API manda o e-mail ao
`Email__SupportEmail`. Falha (rede, timeout, 4xx/5xx) vira auditoria `CADASTRO_AVISO_ADMIN_FALHOU`
(só o motivo, sem e-mail) e o cadastro segue. Sem as duas variáveis configuradas, nada é chamado.
O cliente pendente continua visível no Panel mesmo sem o e-mail.

## Endpoints de serviço (`X-Service-Key`, só a API do Panel)

| Rota | O que faz |
| --- | --- |
| `GET /api/service/clients?status=active\|pending\|rejected\|all&q&limit&page` | Padrão `active`. Cada item traz `status`, `decidedAt`, `decidedBy`. |
| `GET /api/service/clients/pending-count` | `{pending:n}` (registrada antes de `/clients/:id`). |
| `GET /api/service/clients/:id` | Ficha, com `client.status` mesmo de pendente. |
| `POST /api/service/clients/:id/approve` | `{actorId, actorName, reason?}` -> `200 {client:{id,status,decidedAt}, emailSent}`. |
| `POST /api/service/clients/:id/reject` | Igual; só a partir de `PENDING`. |

404 se o id não for `CLIENT`; 400 em ator/motivo inválido; 409 se o estado mudou no meio.

## E-mails ao cliente

Enviados pelo mailer do site (Resend), dentro de try/catch: **nunca desfazem a decisão**.
`emailSent:false` quando o provedor falha ou, em produção, não está configurado.

- Autorizado: "Sua conta TODAI foi autorizada", com o link para `/login` e sem senha.
- Recusado: "Sobre seu cadastro na TODAI", texto neutro; o motivo **não** vai ao cliente.

## Auditoria

`CLIENTE_AUTORIZADO` e `CLIENTE_RECUSADO` (usuário de sistema como autor; `details` com
`actorName`, `de`, `para` e `motivo` opcional, todas chaves da allowlist de `SUMMARY_KEYS`)
aparecem em `/api/service/audit`. **Nunca** o e-mail do cliente.

## Privacidade

`src/pages/Privacy.jsx` informa que o cadastro fica aguardando autorização, que a equipe recebe
um aviso com os dados e que o e-mail de um cadastro recusado fica registrado.

## Testes e capturas

`tests/server/aprovacao.test.js`. `tests/server/helpers.js`: `createClient` autoriza a conta
depois do cadastro (mesma transição do Panel) e há `activateClient(app, email)` para os testes
que cadastram à mão. Capturas (390 e 1280 px): `docs/capturas/cadastro-recebido-*.png` e
`docs/capturas/login-conta-pendente-*.png`.
