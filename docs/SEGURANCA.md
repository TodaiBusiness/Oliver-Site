# Segurança do servidor do site

O que protege o servidor Node (`server.js`, `server/`) e por quê. Revisado em 21/10/2026, depois de uma varredura de
bugs que achou e corrigiu os itens marcados com a data, e de novo em 16/11/2026 (contas, sessões e 2FA: seção abaixo).

## Endereço do visitante e limites por pedido

- O endereço usado nos limites é o **último** item de `X-Forwarded-For`, que é o que o proxy de borda acrescentou; sem
  o cabeçalho, vale o IP da conexão (`server/http/clientAddress.js`). O primeiro item é o que o cliente mandou e podia
  ser forjado para escapar dos limites (corrigido em 21/10/2026). Na VPS o Caddy precisa ficar na frente do processo;
  se o Node for exposto direto, o cabeçalho volta a ser forjável.
- Limites em memória, por instância (`server/http/rateLimit.js`, com teto de 10.000 chaves):
  - formulário de orçamento, compra e link de acesso: por endereço, como antes;
  - link de acesso à área do comprador: também 5 por 10 minutos **por CPF/CNPJ**, para ninguém encher de e-mails a
    caixa de um cliente trocando de endereço;
  - login: 20 por 10 minutos por endereço; cadastro: 5 por 10 minutos e 15 por hora (o scrypt é caro de propósito e, sem teto,
    poucas requisições travavam o processo). O bloqueio depois de 5 senhas erradas agora é por (e-mail + IP), com espera crescente (seção abaixo).
  - os limites ficam num `Map` por processo: somem num reinício e não se somam entre instâncias. Com um processo só na
    VPS isso basta; numa função serverless (Netlify) cada instância fria teria o seu e o limite efetivo se multiplica.
    As janelas vencidas são varridas e o teto de chaves vale (teste `tests/seo-rota.test.js`, 21/10/2026).

## Contas, sessões e segundo fator (16/11/2026)

### Segundo fator (TOTP) para ADMIN e CLIENT

- RFC 6238 só com `node:crypto` (`server/security/totp.js`; testado com os vetores da RFC): SHA-1, 6 dígitos, 30 s, tolerância de ±1 passo.
- Ativar: `POST /api/auth/2fa/setup` (exige a **senha**) sorteia o segredo e o guarda pendente; `POST /api/auth/2fa/enable` confirma com um
  código do app e devolve **10 códigos de recuperação** (mostrados uma vez). Ativar derruba as outras sessões. Desativar e gerar códigos
  novos exigem senha **e** código. O painel mostra a chave para digitar e um link `otpauth://` (não há QR code, de propósito: sem
  biblioteca nova).
- Login em dois passos: `POST /api/auth/login` com senha certa de conta com 2FA **não cria sessão nem cookie**; devolve um `challenge`
  (32 bytes, só o hash no banco, 5 min, uso único, 5 erros e morre). `POST /api/auth/login/2fa` com `challenge` + código cria a sessão.
  Falhas dos dois passos dividem o mesmo bloqueio por (e-mail + IP).
- Anti-replay: o último passo aceito fica em `user_totp.last_step` e só avança por `UPDATE ... WHERE last_step < ?` (o banco decide a
  corrida). Código de recuperação: `UPDATE ... WHERE used_at IS NULL`, conferido por `affectedRows`; no banco só o HMAC.
- Em repouso: o segredo é cifrado com AES-256-GCM e o HMAC dos códigos usa chave própria, ambas derivadas por HKDF de `SESSION_SECRET`
  (`server/security/vault.js`). Em desenvolvimento, sem `SESSION_SECRET`, usa uma chave fixa **conhecida** (só para o fluxo funcionar).
  Em produção, sem `SESSION_SECRET` (32+ caracteres) o 2FA responde 503 e o boot avisa. **Trocar o `SESSION_SECRET` inutiliza os
  segredos 2FA já cadastrados e os códigos de recuperação** (a chave do HMAC também muda). Saída: `node scripts/admin-2fa-reset.mjs <e-mail>`
  (exige acesso ao banco; apaga segredo, códigos e sessões da conta).
- Admin **sem** 2FA continua entrando só com senha: ativar é opcional por enquanto (ver pendências).
- **Clientes (CLIENT)**: o 2FA vale também para o cliente, sempre **opcional** (`required: false` no status). Ele ativa em
  `/cliente/seguranca`; o login usa o mesmo passo do admin. A trava antiga era só o `requireAdmin` em `server/services/twoFactor.js`
  (e `isAdmin` na tela); o login em dois passos nunca olhou o papel. Agora só ADMIN e CLIENT passam, e conta com login desligado
  (usuário de sistema "TODAI Atendimento") é recusada com 403. Todas as proteções acima valem igual para o cliente.
- **Limitação (sem e-mail de reset de 2FA)**: quem perde o celular **e** os códigos de recuperação não consegue se recuperar sozinho;
  precisa falar com a equipe, que remove o 2FA direto no banco (`scripts/admin-2fa-reset.mjs <e-mail>`; reset pelo Panel fica para depois).
  Pendência registrada em `docs/PENDENCIAS.md` (P-020).

### Senha, sessões e inatividade

- `POST /api/auth/password`: exige a senha atual (falha conta no bloqueio), aplica a mesma regra de força do cadastro
  (`passwordProblem`), derruba **todas as outras** sessões e audita. `GET /api/auth/sessions` lista as sessões (id público = 16 primeiros
  caracteres do hash, aparelho resumido, IP, último uso), `DELETE /api/auth/sessions/:id` encerra uma, `POST /api/auth/sessions/revoke-all`
  ("sair de todos os dispositivos").
- Expiração por inatividade além das 8 h absolutas: **30 min** cliente e **15 min** admin (`SECURITY.SESSION_IDLE_MS`, ajustável por
  `SESSION_IDLE_MINUTES_CLIENT/ADMIN`). O relógio (`sessions.last_seen_at`) é renovado no máximo uma vez por minuto. O front volta ao login
  em qualquer 401 de chamada autenticada.

### Recuperação de senha por e-mail

- `POST /api/auth/forgot`: resposta **sempre igual** (202), com tempo mínimo fixo de 1,2 s, exista a conta ou não, e mesmo se o limite por
  e-mail (3/hora) estourar ou o provedor falhar. Limite por IP: 5 por 10 min (429). Se o servidor não tem provedor de e-mail em produção,
  responde 503 para **qualquer** e-mail (não vaza nada).
- Token de 32 bytes aleatórios, só o SHA-256 no banco, 30 min, uso único (decidido pelo banco); pedir outro invalida o anterior.
  `POST /api/auth/reset` valida a força da senha **antes** de gastar o token, troca a senha, derruba **todas** as sessões, apaga desafios
  de 2FA e zera o bloqueio de login. O 2FA do admin não é tocado: o próximo login ainda pede o segundo fator.
- O link é `SITE_PUBLIC_URL/redefinir-senha#token=...`: o token fica no **fragmento**, que o navegador nunca envia ao servidor, não vai
  em `Referer` e não chega ao analytics (o `PageTracker` só envia `pathname`); a página o remove da barra de endereço ao abrir.
- Envio (`server/services/mailer.js`): Resend por HTTP (`RESEND_API_KEY` + `MAIL_FROM`). Sem chave, em desenvolvimento, o e-mail só vai
  para o console; em produção nada é enviado nem registrado.

### Força bruta, cadastro e cotas

- Login: bloqueio por **(e-mail + IP)**, não pela conta (ninguém nega o login de terceiros). A partir da 5ª falha em 15 min, cada nova falha
  dobra a espera (30 s, 1 min, 2 min... até 15 min); `429` com `Retry-After`. Tentativas durante a espera não contam. Limite conhecido:
  quem troca de IP a cada tentativa escapa deste bloqueio; sobram o teto de 20 por IP/10 min e o 2FA (admin). Não há bloqueio global por
  e-mail porque ele reabriria a negação de login a terceiros.
- Cadastro: **mantive a mensagem 409** "Já existe uma conta com este e-mail" (mudar para resposta neutra quebraria o fluxo
  cadastrar-e-entrar sem e-mail de verificação) e fechei o resto: o scrypt roda antes da checagem (mesmo tempo nos dois casos), teto de 5 por
  10 min e 15 por hora por IP, e corrida entre dois cadastros iguais vira 409 (UNIQUE) em vez de 500. A enumeração continua possível, com
  custo; a correção de verdade é verificar o e-mail no cadastro.
- Cotas por usuário logado (cliente; admin fora), contadas no banco, valem entre instâncias: 60 mensagens/hora, 30 imagens e 30 MB de imagens/dia,
  10 solicitações/dia (`LIMITS`; `429`).
- Corpo máximo de `/api/auth/*`: 8 KB (o teto global de ~4,7 MB é para a imagem do chat).
- Faxina (`maintenance.js`): sessões vencidas/paradas, `login_attempts`, desafios e tokens de recuperação expirados e auditoria além da
  retenção; de hora em hora no `server.js` e, sem processo longo (serverless), no login (no máximo a cada 10 min por instância).

### CSRF, auditoria e cabeçalhos

- CSRF: com origens configuradas, todo POST/PUT/PATCH/DELETE precisa de `Origin` permitido; sem `Origin`, vale `Referer`; sem os dois,
  `Sec-Fetch-Site: same-origin|none`. Sem nenhum dos três: 403 (antes passava). `Origin: null` é recusado.
- Auditoria: grava **IP e user agent** (via `AsyncLocalStorage`, sem mexer em cada serviço); negação de papel é `ACESSO_NEGADO` (era
  `LOGIN_FALHOU`); o e-mail digitado num login falho **não** é gravado (só uma referência HMAC); novas ações: 2FA, troca/redefinição
  de senha, sessões. **Retenção: 365 dias** (`AUDIT_RETENTION_DAYS`; 0 desliga a purga). IP e user agent são dado pessoal: a política de
  privacidade deve citar a trilha de auditoria.
- `server/http/securityHeaders.js` é a fonte única; `netlify.toml` repete e `tests/server/headers.test.js` falha se divergirem.
  CSP **sem `'unsafe-inline'` em `style-src`** (era possível: o React aplica `style={{}}` via CSSOM, que a CSP não bloqueia; conferido em
  Chrome real nas páginas públicas e no login, sem violações; o teste de código-fonte barra `<style>`, `style="..."` e
  `dangerouslySetInnerHTML` em `src/`). HSTS, Referrer-Policy, Permissions-Policy, COOP, `X-Frame-Options`, `nosniff` e agora
  `Cross-Origin-Resource-Policy` (`same-site` nas páginas, `same-origin` na API). Toda resposta JSON da API sai com `Cache-Control: no-store`
  (a imagem do chat, `private, no-store`). Cookie de sessão: `HttpOnly`, `SameSite=Lax`, `Secure` com `NODE_ENV=production`.
- Produção exige `DATABASE_DRIVER=postgres` (`ALLOW_SQLITE_IN_PRODUCTION=true` é o aceite explícito para VPS com volume).
- Scripts: `npm run setup` não tem mais senha padrão (gera uma aleatória, mostrada uma vez, e não mexe na de admin existente);
  `setup` e `db:seed-admin` aplicam a mesma regra de força do cadastro.

### Pendente (e por quê)

Ver `docs/PENDENCIAS.md`, P-019: telas ainda sem rota no `App.jsx`; `netlify/functions/api.js` não repassa os cabeçalhos da API; 2FA ainda
opcional (obrigar só depois de todo admin ativar); sem QR code; SQL novo testado só em SQLite; limite por IP e por e-mail em memória (por
instância); sem verificação de e-mail no cadastro.

## Erros da API de licenciamento

Compra e orçamento não repassam ao navegador o texto que a API devolve: a mensagem geral é fixa e, dos erros por
campo, só passam as chaves dos campos do formulário com texto curto (`server/http/fieldErrors.js`).

## Pagamento

O botão de pagar só segue para endereço `https` do Mercado Pago (`mercadopago.com.br`, `mercadopago.com` e
subdomínios; `src/utils/checkoutUrl.js`).

## Respostas do servidor estático

- Arquivo com extensão que não existe (`/assets/velho.js`, `/favicon.ico`) responde **404** em texto, e rota que o site
  não conhece responde **404** com a página da SPA (antes tudo era 200).
- URL malformada (`/%E0%A4%A`) responde 400, não 500.
- Corpo acima do limite responde 413 e fecha a conexão; o corpo é lido em bytes e decodificado no fim.
- O título, a descrição e o endereço canônico de cada página são escapados; `$` no caminho não corrompe mais o HTML.

## Configuração

- `ALLOWED_ORIGINS` (lista separada por vírgula) e `RENDER_EXTERNAL_URL` formam as origens aceitas na conferência de
  `Origin` (defesa de CSRF). `server/http/origins.js` tira espaços, barra final e repetidos, e é usado pelo `server.js` e
  pela função do Netlify (antes a função não tirava a barra final, e `https://site.com/` nunca casava). Em produção, lista
  vazia derruba a subida nos dois caminhos.

- `SITE_PUBLIC_URL` é obrigatória para a compra (sem ela `/comprar` responde 503); está no `render.yaml`.
- `SESSION_SECRET` não derruba o boot, mas em produção é necessária para o 2FA (cifra o segredo TOTP; ver seção acima). As sessões
  continuam sendo tokens aleatórios com hash no banco: trocá-lo não derruba sessões (para isso, apague-as ou use "Sair de todos").
- A imagem Docker usa `https://todaibusiness.com` (domínio oficial; `todai.com.br` só como origem extra do redirecionamento antigo) como endereço do site (canônico e imagens de compartilhamento) e
  escuta na porta 8080, a mesma do healthcheck.

## Administração no Panel e endpoints de serviço (16/11/2026)

- **`SITE_ADMIN_ENABLED` (padrão `false`).** Desligada: login de ADMIN recusado (403 `ADMIN_DESATIVADO`, só depois de a senha
  conferir, então não enumera contas), sessões de ADMIN deixam de valer e são apagadas, `/api/admin/*` responde 410 antes de
  qualquer autenticação (`/api/analytics/report` por `ANALYTICS_READ_KEY` não muda) e o front mostra "A administração agora é
  no Panel" em `/admin/*` (o front lê `GET /api/config/public` → `{adminEnabled}`). Ligada: comportamento antigo. Nada foi apagado.
- **`/api/service/*`** (API do Panel → site, servidor a servidor). Credencial única: `X-Service-Key` = `SITE_SERVICE_API_KEY`
  (mín. 32 caracteres; sem ela, 503). Comparação por SHA-256 + `timingSafeEqual`. Qualquer caminho sob `/api/service/` passa
  pelo porteiro **antes** do roteamento (sem chave, nem a existência da rota aparece): 401 sem detalhe; cookie é ignorado
  (cliente ou admin do site com sessão válida não entra); requisição com `Origin` (navegador) é 403 mesmo com chave; limite de `SERVICE_RATE_LIMIT_PER_MIN`
  (padrão 1200) por IP e 20 falhas de chave/10 min por IP (429); corpo máx. 32 KB (o cliente C# escapa não-ASCII); a chave lida do ambiente passa por `trim`.
  O envio aceita `clientMessageId` opcional (idempotência: reenvio devolve a mesma mensagem, índice único parcial). Sem CSRF/Origin porque não há cookie. O e-mail do cliente só sai
  por aqui. A chave é a mesma string de `SITE_SERVICE_API_KEY` já usada para falar com a API de licenciamento (um segredo, três pontas).
- **Resposta do Panel**: gravada com `author_id` = usuário de sistema "TODAI Atendimento" (ADMIN, hash `!login-desativado`: nenhuma
  senha confere, não recebe recuperação de senha, sem sessão) e `author_external_id/name` (id do admin no Panel, `[A-Za-z0-9_-]{1,64}`;
  nome 1..80 sem controle nem `<`/`>`). O cliente só recebe `author_external_name`, exibido como "Nome · TODAI"; nunca o id externo
  nem o e-mail do usuário de sistema. Auditoria `MENSAGEM_PANEL_ENVIADA` (requisição e admin, sem o texto).
- "Lida" no Panel = `is_read` das mensagens de CLIENTE da solicitação (vale para todos os admins).
- **Imagem enviada pelo Panel** (`POST /api/service/conversations/:id/messages` com `attachment: {name, contentType, dataBase64}`;
  `body` passa a ser opcional se houver imagem, máx. 4000):
  - **Corpo grande só com chave válida.** O teto do corpo é 32 KB em todo `/api/service/*`; sobe para 4,8 MB (`SERVICE_IMAGE_MAX_BODY_BYTES`)
    apenas nesse POST. A chave (e a ausência de `Origin`) é conferida em `app.bodyPolicy` ANTES de ler o corpo (`server.js`,
    `scripts/dev-api.mjs`, função Netlify): sem chave, chave errada, serviço desligado ou com `Origin`, o corpo não é lido, a resposta
    é 401/503/403 (`Connection: close`) e o teto grande nunca vale. `/api/auth/*` e demais rotas mantêm seus tetos.
  - **O conteúdo manda.** Mesma validação do chat (`validarImagemBase64`): PNG/JPEG/GIF/WebP por magic bytes, ≤ 3 MB decodificado
    (413 se passar), base64 estrito. O `contentType` informado é ignorado; grava-se e devolve-se o tipo detectado (HTML/SVG com
    `image/png` é 400). Validação ANTES de gravar; se o anexo falhar depois, a mensagem é apagada (sem órfã).
  - **Nome limpo**: sem caminho, controles, formatação Unicode (bidi/zero-width), `< > : " | ? *`, máx. 120 (mantém a extensão);
    vazio vira `imagem.<ext>`. O `Content-Disposition` do download usa nome ASCII + `filename*` UTF-8 (nome com emoji não quebra o cabeçalho).
  - **Entrega**: download só pelo dono da conversa no site (`/api/attachments/:id`, 404 para outro cliente) e por `/api/service/attachments/:id`;
    `Content-Type` do tipo validado, `nosniff`, `Cache-Control: private, no-store`, `CORP: same-origin`.
  - **Idempotência**: `clientMessageId` vale com imagem (reenvio e corrida devolvem a mesma mensagem e o mesmo anexo, uma única linha em
    `attachments`; o índice único decide e quem perde espera o anexo do vencedor). Auditoria registra só que havia imagem, não o conteúdo.
  - **Risco residual**: sem transação (SQLite de dev e pool do Postgres não compartilham o modelo), mensagem e anexo são gravados em
    dois passos com compensação; um crash exatamente entre os dois deixaria uma mensagem de texto vazia (o reenvio com o mesmo
    `clientMessageId` devolveria essa mensagem sem imagem). Painel de admin do site sem cota de imagens: a cota diária do chat vale só para clientes.

- **Projetos do site pelo Panel** (`/api/service/projects`: GET lista e GET `:id`, POST, PUT, DELETE; `server/services/panelProjects.js`).
  - Mesmo porteiro dos demais `/api/service/*` (chave em tempo constante antes de rotear e de ler corpo, 503 sem chave, 403 com `Origin`, cookie ignorado,
    rate limit por IP e por falha de chave). Corpo máx. 32 KB (também conferido na rota: 413). Independe de `SITE_ADMIN_ENABLED`.
  - **Uma só regra de validação**: o service chama `projectsService.create/update` (os mesmos do antigo admin): título 1..160, tagline ≤255, textos ≤4000,
    categoria ≤80, imagem ≤500, status na lista, listas cortadas em 30 itens, `pick` dos campos editáveis (id, slug, datas, `clientCount` e qualquer extra no corpo são
    ignorados). PUT é objeto completo (campo omitido vira vazio/padrão). Erros: 400 `DADOS_INVALIDOS` com `details` por campo; slug repetido: 409; id não numérico: 400; inexistente: 404.
  - **Link**: só `http:`/`https:`; qualquer outro valor (`javascript:`, `data:`, texto) vira `null` SEM erro (comportamento antigo mantido; evita XSS armazenado
    no site público). `image` é só texto (URL), o servidor nunca a busca (sem SSRF); o front público a usa em `<img src>`.
  - **Ator**: `actorId` `[A-Za-z0-9_-]{1,64}`, `actorName` 1..80 sem controle/`<`/`>` (no corpo; no DELETE, na query). Inválido: 400 antes de qualquer escrita. A auditoria
    (`PROJETO_CRIADO/EDITADO/EXCLUIDO`) grava `userId` = usuário de sistema (mesma checagem de papel/hash do envio de mensagens) e `details` = `{ title, actorId, actorName }`, nunca a descrição.
    Nenhuma resposta traz o e-mail do usuário de sistema nem colunas internas.
  - **Exclusão**: `DELETE ... WHERE NOT EXISTS (client_projects)` num único comando (sem corrida com um vínculo novo). Com vínculo: 409 `{ error/code: "PROJETO_VINCULADO", message, clientCount }`
    e nada é apagado (o `ON DELETE CASCADE` do banco nunca é acionado por aqui). O Panel oferece "Ocultar do site" (`isPublic=false`).
  - Projeto `isPublic=false` (ou rascunho oculto) não sai em `/api/projects`; confirmado por teste. Rotas e front públicos não mudaram.

- **Contas do site, status e atividade pelo Panel** (`GET /api/service/clients`, `GET /api/service/clients/:id`, `POST /api/service/requests/:id/status`,
  `GET /api/service/audit`; `server/services/panelClients.js`). Mesmo porteiro dos demais `/api/service/*` (401/503/403, cookie ignorado, rate limit, corpo ≤ 32 KB),
  independente de `SITE_ADMIN_ENABLED`. Testes: `tests/server/serviceClients.test.js`.
  - **Contas**: só `role = CLIENT` (admin e usuário de sistema nunca aparecem; id deles dá 404). Colunas escolhidas uma a uma: nunca `password_hash`, sessões, tokens, 2FA.
    O e-mail do cliente sai aqui (contrato) e só aqui. Busca `q` (≤100 caracteres, sem controle) em nome/e-mail/empresa com `LIKE ... ESCAPE '!'` (`%`, `_` literais; valor sempre parâmetro).
    `limit` 1..100 (padrão 50), `page` 1..100000, valor inválido cai no padrão; ordem `created_at desc, id desc` (estável). Detalhe: até 200 solicitações com `unreadCount`
    (mensagens de CLIENTE não lidas) e os projetos vinculados (`id`, `title`, `status`). Id não numérico estrito: 400; inexistente: 404.
  - **Status**: reaproveita `requestsService.updateStatus` (mesma validação contra `REQUEST_STATUS_VALUES` e mesma auditoria `SOLICITACAO_STATUS_ALTERADO` do antigo admin; não há
    e-mail/efeito colateral nesse fluxo). `userId` = usuário de sistema, ator (`actorId`, `actorName`, validados como no envio de mensagens) em `details` ao lado de `de`/`para`.
    Inválido: 400 `DADOS_INVALIDOS` com `details` por campo, sem gravar nada; solicitação inexistente: 404.
  - **Auditoria (leitura)**: resposta montada campo a campo, nunca `details` cru nem `user_agent`. `actorName` = `details.actorName` (admins do Panel) ou nome do usuário do evento
    (null se não houver, ex.: login de e-mail inexistente). `summary` sai de uma **allowlist de chaves** (`title`, `projeto`, `projectId`, `projetoId`, `requestId`, `de`, `para`, `status`, `rota`,
    `papel`, `operacao`, `motivo`, `restantes`, `sessoesEncerradas`, `imagem`), só valores primitivos, sem controle/bidi, ≤80 caracteres cada e ≤240 no total. Ficam de fora `ref`
    (referência opaca do e-mail de login falho), `cliente` (e-mail), `adminId`, e qualquer chave nova até ser incluída de propósito. Filtro `action` exato (`[A-Za-z0-9_]{1,60}`, senão 400);
    `q` busca em ação, tipo/id do recurso, nome do usuário e **só o `actorName`** dentro de `details` (a busca não serve de oráculo para o resto do `details`). Ordem `id desc`.
  - **Risco residual**: o `ip` da auditoria é o do cliente HTTP daquele evento; nas ações do Panel é o IP da API do Panel, não o do admin (o admin está em `actorName`). A auditoria
    de envio de mensagem do Panel passou a gravar também `actorName` (sem o texto).

## Visitas do site

Detalhes em `docs/VISITANTES.md`. Em resumo: `POST /api/analytics/collect` confere `Origin` e user agent, mas isso **só
trava navegadores** (outro site no navegador); `curl` e scripts forjam os dois cabeçalhos, então a coleta é aberta na prática
e os números são **estimativa sujeita a forja**, não auditoria. A defesa real é custo: teto de 30 pedidos por minuto e de
1500 por dia por IP (429), no máximo 5 visitantes novos e 30 sessões por IP por dia, uma única escrita no banco por coleta,
bots/`DNT`/`Sec-GPC` ignorados, e nunca IP nem cookie guardados. Quem usa muitos IPs ainda consegue inflar. `GET /api/analytics/report` exige `X-Analytics-Key` igual a `ANALYTICS_READ_KEY`
(mínimo de 32 caracteres, comparação em tempo constante); sem a variável a rota responde 503 e nunca fica aberta.
