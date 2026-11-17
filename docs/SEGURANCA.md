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

### Segundo fator (TOTP) para ADMIN

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

## Visitas do site

Detalhes em `docs/VISITANTES.md`. Em resumo: `POST /api/analytics/collect` confere `Origin` e user agent, mas isso **só
trava navegadores** (outro site no navegador); `curl` e scripts forjam os dois cabeçalhos, então a coleta é aberta na prática
e os números são **estimativa sujeita a forja**, não auditoria. A defesa real é custo: teto de 30 pedidos por minuto e de
1500 por dia por IP (429), no máximo 5 visitantes novos e 30 sessões por IP por dia, uma única escrita no banco por coleta,
bots/`DNT`/`Sec-GPC` ignorados, e nunca IP nem cookie guardados. Quem usa muitos IPs ainda consegue inflar. `GET /api/analytics/report` exige `X-Analytics-Key` igual a `ANALYTICS_READ_KEY`
(mínimo de 32 caracteres, comparação em tempo constante); sem a variável a rota responde 503 e nunca fica aberta.
