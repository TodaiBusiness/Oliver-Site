# Oliver Imports — Site

Site da **Oliver Imports**: vende o **Oliver Inventory** (estoque, caixa e PDV
para Windows) e, abaixo, apresenta os serviços sob medida. Feito em **React + Vite**, sem dependências pesadas: animações em
CSS, ícones em SVG inline, nenhuma biblioteca de UI.

---

## Comandos

```bash
npm install          # instalar dependências (só na primeira vez)
npm run db:migrate   # criar as tabelas (só na primeira vez)
npm run dev          # sobe API + site → http://localhost:5173
npm test             # rodar os testes
npm run build        # gerar build de produção na pasta dist/
npm run preview      # servir o build gerado → http://localhost:4173
```

`npm run dev` sobe **duas** coisas ao mesmo tempo: a API local (porta 8788) e
o site (porta 5173). O Vite encaminha `/api` para a API — em produção quem
responde é o próprio `server.js`, na mesma origem, e o front não muda.

### Rotas do site

| Rota | O que é |
|---|---|
| `/` | Site público: o produto, o preço e os serviços sob medida |
| `/comprar` · `/obrigado` | Compra pelo Mercado Pago e retorno depois de pagar |
| `/baixar` | Download do instalador |
| `/minha-licenca` | Área do comprador (link de acesso por e-mail) |
| `/termos` · `/privacidade` | Textos legais |
| `/login` · `/cadastro` | Entrar / criar conta (projetos sob medida) |
| `/cliente` | Painel do cliente (projetos, solicitações, mensagens) |
| `/admin` | Painel administrativo (só para `role = ADMIN`) |

### Primeiro acesso ao admin

```powershell
$env:ADMIN_EMAIL="Oliverimports"
$env:ADMIN_INITIAL_PASSWORD="sua-senha-forte"
npm run db:seed-admin
```

Depois entre em `/login` com esse identificador. Para **zerar o banco local**
e começar do zero: apague `server/data/oliver.db` e rode `npm run db:migrate`
e `npm run db:seed-admin` de novo.

Para zerar **sem apagar o arquivo** — ou para zerar o Postgres do Neon, onde
não existe arquivo para apagar — os scripts `server/db/reset.sqlite.sql` e
`server/db/reset.postgres.sql` derrubam as 9 tabelas com `DROP TABLE`, na
ordem que respeita as chaves estrangeiras. Cole o arquivo inteiro no cliente
SQL (o console do Neon, para o Postgres) e rode `npm run db:migrate` (e
`npm run db:seed-admin`, se quiser) depois, para recriar tudo vazio.

---

## ⚙️ Onde estão os meus dados

### `src/data/company.js` — o arquivo principal

```js
export const WHATSAPP_NUMBER = '5512988232512';   // ← seu WhatsApp
export const COMPANY_NAME = 'Oliver Imports';     // ← nome da empresa
```

- **WhatsApp** — formato internacional, só números (`55` + DDD + número).
  Aparece em 8 lugares do site, mas é lido só daqui.
- **Nome** — header, footer, copyright e todas as mensagens automáticas.
- **E-mail** — pode vir de variável de ambiente. Crie um `.env` na raiz:

  ```
  VITE_COMPANY_EMAIL=contato@seudominio.com.br
  ```

  Sem isso, cai no endereço antigo (`olivertech0ficial12@gmail.com`).

### Ainda falta preencher

| Onde | O quê |
|---|---|
| `.env` | `VITE_COMPANY_EMAIL` com o e-mail oficial da Oliver Imports |
| `.env` / Render | `VITE_SITE_URL` com o endereço público (canonical e Open Graph) |
| `src/data/projects.js` | Prints reais dos sistemas e o campo `link` de cada projeto |

Os títulos e descrições por rota ficam em `shared/seo.js`: o componente `src/app/RouteSeo.jsx` troca o `<head>` quando
a rota muda, e o `server.js` aplica o mesmo texto no `index.html` antes de enviar. Conta, painel e página inexistente
recebem `noindex`. O caminho é comparado como o React Router compara (sem barra final e sem diferenciar maiúsculas:
`/Comprar` é `/comprar`), e na navegação interna o `canonical` e o `og:url` acompanham a rota (`seoHeadFor`).

O `index.html` **não** tem URL escrita à mão: o marcador `__SITE_URL__` é
trocado no build pelo valor de `VITE_SITE_URL` (ver `vite.config.js`). Ligou um
domínio próprio? Muda a variável no Render e refaz o deploy — nenhum arquivo
precisa ser editado.

---

## 🖼️ Trocar os mockups pelas telas reais

Hoje as artes dos projetos são **mockups ilustrativos** e o site diz isso
abertamente (etiqueta sobre a imagem), para não passar um sistema fictício
como se fosse um produto entregue.

Para colocar os prints reais:

1. Salve a imagem em `public/projects/` (ex.: `erp-dashboard.png`).
2. Em `src/data/projects.js`, aponte `image` para ela.
3. Mude **`isMockup: false`** → a etiqueta some sozinha.
4. Opcional: liste mais prints em `gallery: []` para aparecerem no detalhe.

---

## Estrutura

```
src/
├── components/   Peças reutilizáveis (Icon, Logo, Reveal, AppMockup,
│                 ProjectModal, Funnel, FloatingWhatsApp)
├── sections/     Blocos da página (Header, Hero, Projects, Capabilities,
│                 Process, Stack, ClientArea, Contact, Footer)
├── data/         Conteúdo editável
├── hooks/        Scroll, seção ativa e efeitos de cursor
├── utils/        WhatsApp/e-mail e camada de eventos
├── styles/       tokens → base → components → sections → overlays
├── App.jsx
└── main.jsx
public/           favicon, og-image e as artes dos projetos
scripts/          gerador da imagem de compartilhamento
```

O CSS segue uma ordem proposital: `tokens.css` (variáveis) → `base.css`
(reset) → `components.css` (botões, seções, reveal) → `sections.css` (blocos
da página) → `overlays.css` (modal, funil, botão flutuante). Cores,
espaçamentos, raios e transições saem todos de `tokens.css`.

**Para deixar a página mais compacta ou mais espaçada**, mexa em um lugar só:

```css
--section-y:    clamp(3.25rem, 5.5vw, 5rem);   /* respiro padrão */
--section-y-lg: clamp(4rem, 7vw, 6.5rem);      /* projetos e contato */
--head-gap:     clamp(1.75rem, 3vw, 2.5rem);   /* título → conteúdo */
```

---

## Editando o conteúdo

| Arquivo | O que controla |
|---|---|
| `src/data/company.js` | Nome, e-mail, WhatsApp, mensagens, menu |
| `src/data/product.js` e `shared/plan.js` | O produto à venda, o que ele faz e o preço |
| `shared/seo.js` | Título e descrição de cada rota (o navegador troca ao navegar; o `server.js` já entrega o HTML com os da rota pedida, para buscadores) |
| `/admin/projetos` | Portfólio exibido na home (destaque = `featured`); sem nenhum projeto público, a home usa `src/data/projects.js` |
| `src/data/capabilities.js` | "O que desenvolvemos" |
| `src/data/process.js` | "Como trabalhamos" |
| `src/data/stack.js` | Tecnologias |
| `src/data/funnel.js` | Opções do funil e montagem da mensagem |

---

## Como funciona o funil

`Necessidade → Estágio → Conversa` — duas perguntas, dentro da seção de
Contato. Cada opção carrega a frase que entra na mensagem;
`buildFunnelMessage()` monta o texto e o visitante vê a **prévia exata** antes
de clicar. As escolhas ficam em `sessionStorage` (um F5 não perde o
progresso). Nada é enviado a servidor nenhum.

---

## Analytics

**Visitas:** o próprio servidor conta, de forma agregada e sem IP nem cookie, quem
abre o site (país, cidade, origem, campanha, aparelho e página) e entrega o
relatório ao Panel Desktop em `GET /api/analytics/report`. Ver
[`docs/VISITANTES.md`](docs/VISITANTES.md).

**Eventos de interação:** nenhuma ferramenta de terceiros instalada.
`src/utils/analytics.js` dispara os eventos (`whatsapp_clicked`,
`funnel_started`, `funnel_step_completed`, `hero_cta_click`,
`project_viewed`, `solution_selected`) para `window.dataLayer`. Basta colar a
tag do GTM/GA4 no `index.html` para começarem a ser coletados.

---

## Imagem de compartilhamento

`public/og-image.png` (1200×630) é gerada por script, sem dependências:

```bash
node scripts/generate-og.mjs
```

---

## 🚀 Publicar no Render + Neon — passo a passo

> **Destino de produção planejado: VPS da Hostinger**, junto com a API de
> licenças, num `docker compose` (`Panel-Desktop/deploy/hostinger/`). O passo a
> passo para iniciante está em `Panel-Desktop/docs/HOSPEDAGEM_HOSTINGER.md` e o
> funcionamento da loja em `docs/LOJA_E_COMPRA.md`. O roteiro do Render abaixo
> continua valendo enquanto a migração não acontece.

> Com back-end, **não dá mais para arrastar a pasta `dist`**: o site precisa do
> servidor Node e do banco. Tem que ser por repositório.

### 1. Criar o banco no Neon

O Render não hospeda banco (o Postgres dele é pago depois de 30 dias). O banco
fica no **Neon**, o mesmo provedor já usado pela API de licenciamento.

No projeto que você já tem no Neon, abra **Databases → New Database**, escolha o
branch `production` e dê o nome `oliver_site`. Um projeto do Neon comporta
vários databases: o site e o licenciamento ficam separados — nenhum enxerga as
tabelas do outro — mas dividem o mesmo endpoint e a mesma cota.

Depois, em **Connect**, selecione o database `oliver_site`, marque **Pooled
connection** e copie a URI. Ela é a `DATABASE_URL` e tem esta cara:

```
postgresql://neondb_owner:SENHA@ep-xxxx-pooler.sa-east-1.aws.neon.tech/oliver_site?sslmode=require
```

> A versão *pooled* (com `-pooler` no host) é a certa: o Render pode subir mais
> de uma instância, e o pooler do Neon evita estourar o limite de conexões.

### 2. Subir o código para o GitHub

```bash
git init
git add .
git commit -m "Site Oliver Imports"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/SEU-REPO.git
git push -u origin main
```

O `.gitignore` já protege `.env`, `node_modules`, `dist` e o banco local.
**Confira antes de enviar** que nenhuma senha foi junto — no PowerShell:

```powershell
git ls-files | Select-String "\.env$|\.db$"   # não deve retornar nada
```

### 3. Criar o serviço no Render

*New → Blueprint* apontando para o repositório: o `render.yaml` já traz tudo
pronto. Fazendo à mão (*New → Web Service*), os campos são estes:

| Campo | Valor |
|---|---|
| Runtime | Node |
| Build command | `npm ci --include=dev && npm run build` |
| Start command | `npm start` |
| Health check path | `/api/health` |

> O `--include=dev` **não é opcional**. Com `NODE_ENV=production` no ambiente —
> e ele precisa estar lá, é o que liga o `Secure` no cookie — o `npm ci` pula
> as devDependencies. O Vite é uma delas: sem a flag, o build falha com
> `vite: not found` antes de gerar a pasta `dist/`.

### 4. Cadastrar as variáveis de ambiente

Em *Environment → Environment Variables*:

| Variável | Valor |
|---|---|
| `DATABASE_DRIVER` | `postgres` |
| `DATABASE_URL` | a URI *pooled* copiada do Neon |
| `SESSION_SECRET` | opcional e reservado: hoje nada o usa (veja abaixo) |
| `NODE_ENV` | `production` (liga o `Secure` no cookie) |
| `NODE_VERSION` | `22` |
| `VITE_COMPANY_EMAIL` | seu e-mail de contato |
| `VITE_SITE_URL` | endereço público, sem barra final (opcional no início) |
| `ALLOWED_ORIGINS` | opcional — veja abaixo |
| `LICENSING_API_BASE_URL` | endereço da API Oliver Licensing |
| `SITE_SERVICE_API_KEY` | credencial de serviço — a mesma dos dois lados |
| `SITE_PUBLIC_URL` | URL pública com https, sem barra final — sem ela a compra responde 503 |

Gerar o `SESSION_SECRET` (opcional; a sessão não depende dele):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

⚠️ **Nunca** coloque `DATABASE_URL`, `SESSION_SECRET` ou
`ADMIN_INITIAL_PASSWORD` com prefixo `VITE_` — isso os jogaria dentro do
JavaScript do navegador, à vista de qualquer visitante.

**Sobre `ALLOWED_ORIGINS`** (as origens que podem gravar dados — defesa de
CSRF): no primeiro deploy você ainda não sabe a URL, e por isso o servidor cai
sozinho no `RENDER_EXTERNAL_URL`, que o Render injeta com o endereço
`.onrender.com`. Preencher só passa a ser necessário ao ligar um domínio
próprio — e aí liste **apex e www**, separados por vírgula e sem barra final,
porque para o navegador são origens diferentes. Fora do Render, com
`NODE_ENV=production` e nada configurado, o servidor se recusa a subir: vazio
significaria nenhuma conferência de origem, e isso não pode passar despercebido.

**Sobre `VITE_SITE_URL`**: é lida no *build*, não no start. Depois de trocar o
valor (ou de ligar o domínio), dispare um *Manual Deploy → Clear build cache &
deploy* para as meta tags saírem com o endereço novo.

### 5. Criar as tabelas e o administrador

O schema **não** é aplicado no start do servidor, de propósito: assim um erro de
DDL aparece na hora, e não como um serviço que morre antes de abrir a porta.
Rode **da sua máquina**, apontando para o Neon:

```powershell
$env:DATABASE_DRIVER="postgres"
$env:DATABASE_URL="postgresql://...-pooler.../oliver_site?sslmode=require"
npm run db:migrate

$env:ADMIN_EMAIL="Oliverimports"
$env:ADMIN_INITIAL_PASSWORD="uma-senha-forte-sua"
npm run db:seed-admin
```

Alternativa sem terminal: colar o conteúdo de `server/db/schema.postgres.sql`
no **SQL Editor** do Neon. É tudo `IF NOT EXISTS` — rodar de novo não apaga
nada. O administrador, porém, precisa do script: a senha vira hash antes de
tocar no banco e nunca é gravada em texto puro.

### 6. Conferir no ar

- `https://oliver-imports-site.onrender.com/api/health` → deve responder `{"ok":true}`
- `/login` → entrar com o admin
- Criar um projeto em `/admin/projetos` e ver se ele aparece na home

> No plano gratuito o serviço hiberna após 15 minutos sem acesso. O primeiro
> acesso depois disso demora cerca de 50 segundos — não é falha de configuração.

### 7. Ajustes finais

Copie o endereço que o Render mostrou e coloque em `VITE_SITE_URL`. Um novo
deploy carimba canonical e Open Graph com ele. Se depois vier um domínio
próprio, o roteiro é o mesmo — mais `ALLOWED_ORIGINS` com apex e www.

---

## E a Vercel?

**Este projeto não roda inteiro na Vercel do jeito que está**, e é melhor saber
disso antes de importar do que depois de ver o `/login` responder 404.

O motivo é a forma do projeto, não uma limitação da Vercel: `server.js` é um
processo Node **de vida longa** (`createServer().listen()`) que serve o site e
a API na mesma origem. A Vercel não mantém processo ligado — ela publica
arquivos estáticos e funções serverless, e nunca executa `npm start`. Nada em
`server.js` está escrito como função serverless, não existe pasta `api/` no
formato que ela procura, e não existe `vercel.json`.

Importando o repositório com as opções padrão, o que sobe é **só a metade
estática**:

| Campo da tela de import | Valor |
|---|---|
| Root Directory | `./` (a raiz — `package.json`, `index.html` e `vite.config.js` estão lá) |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

Com isso a home aparece bonita e **tudo que depende de `/api/*` quebra**:
login, cadastro, painel do cliente, painel administrativo e o formulário de
orçamento. As variáveis de banco e de sessão ficariam cadastradas sem ninguém
para lê-las — não existe processo Node no ar. E o `SQLITE_FILE` não teria como
funcionar de qualquer forma: o disco da Vercel é somente leitura fora de
`/tmp`, e cada invocação começa do zero.

Há dois caminhos honestos:

**Continuar no Render (recomendado).** É para onde o `render.yaml` deste
repositório aponta, com o roteiro completo logo acima. Um serviço só, mesma
origem, cookie `SameSite=Lax` funcionando, `npm start` de verdade. Nada a
reescrever.

**Ir para a Vercel.** Aí é trabalho de código, não de configuração: criar
`api/index.js` exportando um handler `(req, res)` que chame `app.handle(...)`
de `server/app.js`, um `vercel.json` mandando `/api/(.*)` para essa função e o
resto para o `dist/`, e trocar o driver para `postgres` — `sqlite` deixa de ser
opção. O `RENDER_EXTERNAL_URL` também some, então `ALLOWED_ORIGINS` passa a ser
obrigatória com a URL da Vercel dentro.

Dois modelos prontos ficam na raiz, os dois cobertos pelo `.gitignore`:
`.env` para rodar na sua máquina e `.env.deploy` para importar no painel do
serviço.

---

## Segurança

Esta seção cobre o **front**; as defesas do back-end estão em
"Segurança implementada", mais abaixo.

- **Cabeçalhos HTTP** aplicados pelo `server.js` em toda resposta — página,
  arquivo estático e JSON da API: `Content-Security-Policy`,
  `X-Frame-Options: DENY` (bloqueia clickjacking), `X-Content-Type-Options`,
  `Referrer-Policy`, `Permissions-Policy`, HSTS e `Cross-Origin-Opener-Policy`.
  O `netlify.toml` da versão anterior segue no repositório, sem efeito nenhum
  no Render.
- **Links de dados validados** (`src/utils/url.js`): só `http`, `https` e
  `mailto` passam. Um `link` de projeto com `javascript:...` é descartado em
  vez de virar XSS — proteção que passa a valer de verdade quando os projetos
  vierem do painel admin.
- **Dados da sessão tratados como não confiáveis**: o funil só aceita valores
  que existam na lista oficial e prende a etapa no intervalo válido.
- **Sem `dangerouslySetInnerHTML`, `eval` ou `innerHTML`** em lugar nenhum.
- **Mensagens sempre com `encodeURIComponent`** nos links de WhatsApp/e-mail.
- **`ErrorBoundary`**: uma exceção mostra uma tela de recuperação em vez de
  deixar a página em branco.
- **`npm audit`: 0 vulnerabilidades** (o site tem só React e Vite).

⚠️ **Regra de ouro:** variáveis com prefixo `VITE_` vão para dentro do
JavaScript e são **públicas**. Credencial de banco, `SESSION_SECRET` e senha de
admin **nunca** podem levar esse prefixo — ficam só no ambiente do servidor,
lidas em `server/config.js`. Veja o `.env.example`.

---

## Acessibilidade e performance

- Todo texto acima de 4.5:1 de contraste (WCAG AA).
- Cards de projeto são `<button>` reais: funcionam por teclado; o modal prende
  o foco, fecha no Esc e devolve o foco ao card de origem.
- `prefers-reduced-motion` desliga parallax, efeito magnético, pulso do botão
  flutuante e animações de entrada.
- Efeitos de cursor só em ponteiro fino — no celular nem são registrados.
- Imagens com `loading="lazy"`, dimensões definidas e `alt` descritivo.
- Fonte Inter (licença OFL) servida pelo próprio site, pelo pacote `@fontsource-variable/inter`, importado em
  `src/main.jsx`. O build copia os arquivos `.woff2` para `dist/assets` e o navegador baixa só os alfabetos que a
  página usa. Nenhuma fonte vem de fora: o CSP continua com `font-src 'self'`.

---

## Back-end (API, banco e autenticação)

> **Estado atual:** API e telas prontas e testadas — login, cadastro, painel do
> cliente (projetos, solicitações, mensagens com anexo) e painel administrativo
> estão no ar em `src/pages/`. As rotas estão listadas em "Rotas do site".

### Arquitetura

```
Navegador  →  Node no Render (site + /api)  →  PostgreSQL no Neon
                                            └→  API Oliver Licensing (orçamentos)
```

**Pedidos de orçamento não ficam neste banco.** São encaminhados à API Oliver
Licensing, que é onde o Panel Desktop os lê e responde. O navegador nunca fala
com ela: quem chama é o `server.js`, com uma credencial de serviço que dá acesso
apenas a criar solicitação — não abre o painel. Sem `LICENSING_API_BASE_URL` e
`SITE_SERVICE_API_KEY` o formulário responde "indisponível" em vez de perder o
pedido em silêncio.

O navegador **nunca** fala com o banco. As credenciais existem apenas em
variáveis de ambiente do servidor.

O mesmo processo (`server.js`) entrega os arquivos de `dist/` e responde
`/api/*`. É de propósito: o cookie de sessão é `SameSite=Lax`, então site e API
precisam estar na **mesma origem**. Separá-los em domínios diferentes exigiria
`SameSite=None`, que é justamente o que enfraquece a defesa de CSRF.

### Dois bancos, o mesmo código

| Ambiente | Banco | Por quê |
|---|---|---|
| Produção | **PostgreSQL** (`pg`) no Neon | Banco gerenciado, com TLS e o mesmo provedor já usado pela API de licenciamento |
| Local / testes | **SQLite** (`node:sqlite`) | Embutido no Node — dá para rodar e testar tudo sem instalar servidor |

O SQL dos repositórios é **idêntico** nos dois: as diferenças ficam presas nos
arquivos `server/db/schema.*.sql`. Datas são gravadas em `BIGINT` (epoch), o
que evita divergência de tipo e fuso entre os bancos.

### Preparar o banco

```bash
# 1. Copie o modelo e preencha
cp .env.example .env

# 2. Crie as tabelas
npm run db:migrate                            # SQLite (local)
DATABASE_DRIVER=postgres npm run db:migrate   # Neon (precisa de DATABASE_URL)

# 3. Crie o administrador (credenciais vêm do ambiente, nunca do código)
ADMIN_EMAIL="seu-usuario" ADMIN_INITIAL_PASSWORD="sua-senha-forte" npm run db:seed-admin
```

No Windows (PowerShell):

```powershell
$env:ADMIN_EMAIL="seu-usuario"
$env:ADMIN_INITIAL_PASSWORD="sua-senha-forte"
npm run db:seed-admin
```

O identificador pode ser um nome de usuário (ex.: `Oliverimports`) — o script
avisa que não é e-mail, mas funciona. Para trocar a senha depois, basta rodar
o mesmo comando com outra `ADMIN_INITIAL_PASSWORD`.

### Tabelas

`users` · `projects` · `client_projects` · `project_requests` · `messages` ·
`sessions` · `login_attempts` · `audit_logs` · `attachments` · `site_visit_stats`
(contagens de visitas por dia)

Com chaves estrangeiras, `ON DELETE CASCADE`, `UNIQUE` em e-mail e slug,
`CHECK` no papel do usuário e índices nos campos realmente filtrados.

### Rotas

| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/projects` | público |
| POST | `/api/quote-requests` | público (sem conta) |
| POST | `/api/analytics/collect` | público (só a própria origem; conta a visita) |
| GET | `/api/analytics/report?days=N` | chave `X-Analytics-Key` (`ANALYTICS_READ_KEY`) |
| POST | `/api/auth/register` `/api/auth/login` | público |
| POST | `/api/auth/logout` · GET `/api/auth/me` | autenticado |
| GET | `/api/me/summary` `/api/me/projects` `/api/me/requests` | cliente |
| POST | `/api/me/requests` | cliente |
| GET/POST | `/api/requests/:id` · `/api/requests/:id/messages` | dono **ou** admin |
| GET | `/api/admin/summary` `/clients` `/requests` `/projects` `/audit` | admin |
| GET | `/api/admin/clients/:id` (ficha completa) | admin |
| POST | `/api/admin/clients/:id/projects` (vincular) | admin |
| DELETE | `/api/admin/clients/:id/projects/:projectId` | admin |
| POST/PUT/DELETE | `/api/admin/projects` | admin |
| PATCH | `/api/admin/requests/:id/status` | admin |

### Vincular projeto a cliente

Em **Admin → Clientes → abrir ficha**, escolha um projeto e clique em
*Vincular*. Ele passa a aparecer no painel daquele cliente. Desvincular pede
confirmação e **não exclui** o projeto — só desfaz o vínculo.

A operação é idempotente: vincular duas vezes não duplica nem dá erro (um
duplo clique não vira 500).

### Segurança implementada

- **Senha**: `scrypt` (memory-hard, nativo do Node), salt por usuário,
  comparação em tempo constante e re-hash automático se os parâmetros
  endurecerem. *Não usei Argon2id/bcrypt porque ambos exigem módulo nativo
  compilado, que costuma falhar em serverless. Trocar é mexer em um arquivo só:
  `server/security/password.js`.*
- **Sessão**: cookie `HttpOnly` + `SameSite=Lax` (+ `Secure` em produção). No
  banco fica só o **SHA-256** do token — se o banco vazar, os tokens não
  servem. Expira em 8h; logout invalida de fato.
- **SQL injection**: 100% de queries parametrizadas. Nenhuma concatenação de
  valor do usuário em SQL, em nenhum repositório.
- **Autorização**: verificada no servidor em toda rota. Esconder botão no
  front não protege nada.
- **IDOR**: a posse entra no `WHERE` da consulta. Recurso de outra pessoa
  devolve **404**, não 403 — 403 já confirmaria que existe.
- **Mass assignment**: cada rota declara os campos que aceita (`pick`).
  Mandar `role: "ADMIN"` no cadastro não tem efeito.
- **Força bruta**: 5 tentativas por e-mail a cada 15 min.
- **Enumeração de usuário**: resposta idêntica para e-mail inexistente e senha
  errada — e um hash falso é calculado para o tempo não denunciar.
- **CSRF**: `SameSite=Lax` + conferência de `Origin` nos métodos que alteram
  estado.
- **XSS armazenado**: link de projeto só aceita `http`/`https`.
- **Auditoria**: `audit_logs` grava login, logout, criação/edição/exclusão e
  troca de status. Nunca senha nem token.

---

## Testes

```bash
npm test              # tudo
npm run test:server   # só o back-end
```

**125 testes**, sem nenhuma dependência de teste — runner nativo do Node,
rodando contra um SQLite **em memória** com o schema real:

- **Front** (24): validação de URL, funil, links de contato, datas do chat.
- **Autenticação** (15): hash, salt, cookie, sessão vencida, token forjado,
  força bruta, enumeração de usuário.
- **Segurança** (17): SQL injection (login, busca e id na URL), acesso sem
  sessão às rotas protegidas, cliente tentando rotas de admin, escalada de
  papel, IDOR, mass assignment, XSS armazenado, payload inválido.
- **Clientes e conversas** (19): ficha do cliente, vínculo de projeto
  (idempotente), mensagens e permissões de leitura.
- **Uploads** (14): tipo real do arquivo, limite de tamanho, base64 inválido,
  IDOR no download, exclusão em cascata do anexo.
- **Orçamentos** (12): encaminhamento à API de licenciamento, montagem da URL,
  validação sem gastar chamada, mass assignment, limite por visitante, API
  central fora do ar e erro que não pode vazar para o navegador.
- **Visitas** (16): coleta agregada, bots e DNT, origem, rate limit, chave do relatório,
  formato e limite de `days`.
- **Fluxo** (4): jornada completa cadastro → solicitação → conversa → status,
  CRUD de projeto refletindo no site, slug duplicado, resumo do admin.
- **Banco e rotas** (20): tabelas, índices, `UNIQUE`, `CHECK`, FK, cascata,
  rollback de transação, tradução de SQL para PostgreSQL e normalização de
  caminho da API.

Os testes foram validados por **mutação**: desliguei a checagem de papel e a
proteção de IDOR de propósito e confirmei que os testes correspondentes
falham. Teste que não quebra quando a proteção some não está testando nada.
## Mapa do código (graphify)

`graphify update .` na raiz gera, em `graphify-out/`, o grafo de dependências do
código (`graph.json`), a visualização interativa (`graph.html`) e o resumo
`GRAPH_REPORT.md` com os pontos mais conectados. A extração é estrutural, sem IA
e sem chave de API. A pasta é local e fica fora do Git (`.gitignore`); rode de
novo depois de mudanças grandes. Arquivos `.sql` só entram com o pacote opcional
`graphifyy[sql]`.
