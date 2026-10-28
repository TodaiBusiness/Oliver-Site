# Visitantes do site

O site conta quem o abre e entrega o resultado ao Panel Desktop.

> **Os números são estimativa, não auditoria.** A coleta é aberta: `Origin` e user agent só barram navegadores e qualquer
> script (`curl`) os forja. Há tetos que encarecem a forja (abaixo), mas quem usa muitos IPs consegue inflar visitas,
> visitantes e sessões. Use o painel para tendência, não como prova. O caminho dos dados é:

```text
navegador -> POST /api/analytics/collect (site)
Panel Desktop -> API de licenciamento (GET /api/v1/admin/site-analytics) -> GET /api/analytics/report (site)
```

O contrato do relatório está em `Panel-Desktop/docs/VISITANTES_DO_SITE.md`.

## O que é registrado

Cada página aberta (inclusive a navegação dentro do site, que não recarrega) soma 1 em contadores **por dia**, na tabela
`site_visit_stats` (`stat_day`, `dim`, `label`, `visits`, `visitors`, `sessions`):

| Recorte (`dim`) | De onde vem | Quando conta |
| --- | --- | --- |
| `country` | `CF-IPCountry`, `CloudFront-Viewer-Country` ou `X-Vercel-IP-Country`; senão "Desconhecido" | toda página |
| `city` | `CF-IPCity`, `CloudFront-Viewer-City` ou `X-Vercel-IP-City`; senão "Desconhecido" | toda página |
| `device` | user agent: `celular`, `tablet` ou `computador` | toda página |
| `path` | caminho da página, sem query, minúsculo, até 80 caracteres | toda página |
| `referrer` | domínio do `document.referrer` ("Direto" se vazio ou do próprio site) | só a primeira página da visita |
| `campaign` | `utm_campaign`, ou `utm_source` se não houver | só a primeira página, e só se houver |
| `total` | linha geral do dia (base de `daily` e `totals`) | toda página |

"Primeira página da visita" é a carga completa do site (`entry: true`); navegar dentro dele não gera nova origem nem nova
sessão. Por isso, nos rankings de origem e campanha, `visits` significa visitas (entradas), e nos demais, páginas vistas.

**Não existe:** IP guardado, cookie, `localStorage`, identificador de pessoa ou chamada a serviço externo com o IP.
Áreas logadas (`/admin`, `/cliente`) não são medidas. Quem manda `DNT: 1` ou `Sec-GPC: 1` não é contado (o navegador
também nem envia). Bots conhecidos (e requisições sem user agent) são ignorados.

### Visitante único por dia

`visitors` usa um hash de IP + user agent com sal sorteado a cada dia, mantido **só em memória** e nunca gravado. Ao virar
o dia o sal muda, então o hash não liga dois dias. Consequências: reiniciar o servidor no meio do dia pode contar a mesma
pessoa de novo; e `visitors` de um período é a **soma dos únicos de cada dia** (sem identificador entre dias, não há como
saber se é a mesma pessoa). Atrás de CDN, o IP usado é o último item de `X-Forwarded-For` (ver `SEGURANCA.md`).

### País e cidade

Só aparecem se o proxy/CDN à frente do site mandar os cabeçalhos acima (Cloudflare: país vem por padrão; cidade exige
ativar "Add visitor location headers"). Sem eles, "Desconhecido". Esses cabeçalhos só são confiáveis se o Node só
receber tráfego pelo proxy (na VPS, porta fechada para fora, só o Caddy/CDN).

### Limites

- Dia contado no horário de Brasília (UTC-3).
- Retenção de **400 dias**; registros mais antigos são apagados na primeira coleta de cada dia.
- No máximo 300 rótulos distintos por recorte e por dia; o excesso soma em "Outros".
- Campos de entrada truncados (`path` 80, rótulos 60, domínio 80 caracteres).
- `utmCampaign` é texto livre de até 60 caracteres, vindo da URL de quem visita, e aparece como está no painel; vale o
  limite de 300 rótulos distintos por dia (o excesso soma em "Outros").
- O corpo da coleta tem teto próprio de **2 KB** (413 acima disso), bem abaixo do teto global do servidor, que é pensado
  para upload.
- **Uma escrita por coleta**: todas as linhas da coleta (até 7) vão num único `INSERT ... VALUES (...), (...) ON CONFLICT DO
  UPDATE`, atômico em SQLite e PostgreSQL (antes eram até 8 escritas em sequência), para não pesar no PostgreSQL
  compartilhado da VPS.
- **Teto contra forja, por IP e por dia (memória, sal do dia, nada gravado):** no máximo **5 visitantes novos** (user agents
  distintos do mesmo IP; do 6º em diante a visita conta, o visitante não) e **30 sessões** (`entry: true`; acima disso a página
  conta como vista comum, sem origem, campanha nem sessão). Em IP compartilhado (escritório, operadora) isso subconta um pouco,
  de propósito.

### Visitantes únicos e várias instâncias

O sal diário, o conjunto de visitantes já vistos no dia e o limitador de pedidos ficam **na memória de cada instância**.
No servidor Node único (VPS/Render) isso não importa. Em deploy com várias instâncias ou funções sem estado (Netlify
Functions), o mesmo visitante pode cair em instâncias diferentes e ser contado de novo, então **visitantes únicos saem
inflados** (visitas e páginas não), e o teto por IP vale por instância.

## Rotas

### `POST /api/analytics/collect`

Corpo: `{ path, entry, referrer?, utmCampaign?, utmSource? }`. Responde 202 sempre que passa nas proteções (também quando
ignora por bot/DNT, e quando a gravação falha — medir não derruba o site). Proteções: só aceita `Origin` presente em
`ALLOWED_ORIGINS` (403 caso contrário; não há cabeçalhos CORS, então outro site não consegue chamar do navegador); teto de
30 pedidos por minuto por IP e 1500 por dia por IP (429; contadores em memória, por instância); corpo acima de 2 KB (413).
O teto de 30 por minuto cobre uma página a cada 2 s sustentada, bem acima de quem navega de verdade; o de 1500 por dia limita
um script a esse valor por IP (antes ~172 mil por dia). `Origin` ausente/diferente barra só navegador: um script manda o
`Origin` certo e passa pelos tetos acima. O rastreador do front é `src/app/PageTracker.jsx`.

### `GET /api/analytics/report?days=N`

Cabeçalho `X-Analytics-Key` igual a `ANALYTICS_READ_KEY`, comparado em tempo constante.

| Situação | Resposta |
| --- | --- |
| `ANALYTICS_READ_KEY` ausente ou com menos de 32 caracteres | 503 (a rota nunca fica aberta) |
| Chave ausente ou errada | 401 |
| `days` fora de 1 a 400 ou não inteiro | 400 (sem `days`, vale 30) |
| Certo | 200 |

Resposta 200 (`window.since`/`until` em milissegundos; `daily` traz todos os dias do período, com zero onde não houve
visita; cada ranking traz até 20 linhas, da mais visitada para a menos):

```json
{
  "window": { "days": 30, "since": 1759000000000, "until": 1761600000000 },
  "totals": { "visits": 120, "visitors": 80, "sessions": 70 },
  "daily": [{ "date": "2026-10-27", "visits": 12, "visitors": 9 }],
  "rankings": {
    "country": [{ "label": "BR", "visits": 100, "visitors": 70 }],
    "city": [], "referrer": [], "campaign": [], "device": [], "path": []
  }
}
```

## Variável de ambiente

| Variável | Onde | O que faz |
| --- | --- | --- |
| `ANALYTICS_READ_KEY` | servidor do site (`.env`, Render, VPS) | Chave de leitura do relatório. Mín. 32 caracteres. Sem ela, relatório desligado e coleta ativa. Nunca com prefixo `VITE_`. |

A tabela `site_visit_stats` está nos schemas (`npm run db:migrate`) e também é criada sozinha na primeira coleta
(`CREATE TABLE IF NOT EXISTS`), então um deploy sem rodar a migração não quebra nada. Na VPS o banco é o mesmo que o site já usa.

## Ligar no painel

1. Gerar a chave: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
2. No site: `ANALYTICS_READ_KEY=<chave>`; reiniciar.
3. Na API de licenciamento (Hostinger, `.env` do deploy): `SITE_ANALYTICS_BASE_URL=<URL https pública do site>` e
   `SITE_ANALYTICS_READ_KEY=<mesma chave>` (viram `SiteAnalytics__BaseUrl` e `SiteAnalytics__ReadKey`).
4. Abrir a tela Visitantes no painel.

## Testes

`tests/server/analytics.test.js`: coleta, agregação, bots/DNT, origem, rate limit, autenticação da rota (sem variável,
sem chave, chave errada, chave certa), teto de corpo da coleta (413), teto por minuto e diário, lote numa instrução só, teto de visitantes/sessões por IP, contrato do relatório, formato do relatório e limites de `days`.

**Conferido contra PostgreSQL 17 (27/10/2026).** Banco descartável local (`DATABASE_DRIVER=postgres`, `DATABASE_SSL=disable`),
`npm run db:migrate` e o servidor real: quatro páginas e uma primeira página de visita com `referrer` e outro aparelho. O
`ON CONFLICT` acumulou os contadores na mesma linha (`/comprar` com 2 visitas), `total` ficou com 5 visitas, 2 visitantes e 1
sessão, e o relatório com a chave certa respondeu 200 no formato do painel.

**Conferido contra PostgreSQL 17 depois do lote (27/10/2026).** Cluster descartável em outra porta (`DATABASE_SSL=disable`),
`npm run db:migrate`, coletas direto pelo serviço: o `ON CONFLICT` acumulou na mesma linha, 8 user agents do mesmo IP somaram
5 visitantes e o relatório saiu com as chaves `window`/`totals`/`daily`/`rankings`.
