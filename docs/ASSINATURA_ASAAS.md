# Assinatura no cartão (Asaas)

Rota do site: `/assinar`. Endpoint: `POST /api/subscribe`. O Asaas fica na API de licenças; o site só chama essa API com `X-Service-Key`.

## Fluxo

1. Empresa e computadores (preço mensal de `shared/plan.js`).
2. Dia do vencimento: 15, 20 ou 30 (`shared/billing.js`). A primeira mensalidade é cobrada na hora; o dia vale para os ciclos seguintes (`nextDueDate` é sempre depois de hoje). Em meses curtos cobra no último dia do mês.
3. Cartão e CEP/número do endereço de cobrança.
4. Sucesso: final do cartão, valor cobrado hoje, dia, próximo vencimento, links para `/baixar` e `/minha-licenca`.

O navegador valida (Luhn, validade, CVV, CEP), e `server/services/subscribe.js` valida tudo de novo, inclusive `billingDay`.

## Contrato com a API de licenças

`POST {LICENSING_API_BASE_URL}/api/v1/site/subscription`, header `X-Service-Key`, JSON:
`companyName, contactName, taxId (dígitos), email, phone, devices, billingDay, card{holderName, number, expiryMonth 'MM', expiryYear 'YYYY', ccv}, holder{postalCode, addressNumber}, remoteIp`.

- 200: `{status 'active'|'pending', cardBrand, cardLast4, billingDay, nextDueDate (próximo ciclo), amount, chargedToday?, firstChargeAmount?}`. O navegador recebe só isso, conferido (os dois últimos são opcionais e só passam no tipo certo). `pending` é só fallback.
- 400: `{errors:{campo:[msgs]}}` (repassado só para campos conhecidos; mensagem com número de cartão é descartada).
- 402: `CARTAO_RECUSADO`. 409: mensagem neutra (`CONFIRA_O_EMAIL`). Outros e timeout: 503 `ASSINATURA_INDISPONIVEL`.
- Limite: 3 pedidos válidos por 10 minutos por visitante (429). Pedido inválido não conta.

## Segurança

- Dados de cartão passam só em memória, a caminho da API. Não são gravados, não vão para log, auditoria nem analytics, e nunca voltam na resposta (nem em erro). Os testes em `tests/server/subscribe.test.js` conferem isso.
- Corpo limitado a 8 KB nessa rota. O IP do visitante segue em `remoteIp` (último item de `X-Forwarded-For`).
- A tela não guarda o cartão em storage; o estado é limpo após o sucesso e ao sair da página.

## Variáveis

Mesmas do checkout: `LICENSING_API_BASE_URL`, `SITE_SERVICE_API_KEY` e `LICENSING_API_TIMEOUT_MS`. Sem elas o endpoint responde 503.

## Vídeos do PDV (fora do git)

Os clipes de `/sistema/pdv` ficam em `public/sistema/video/` (ignorado pelo git). Gere com `npm run videos` (precisa de `ffmpeg`). O `Dockerfile` instala o ffmpeg e os gera numa camada própria, antes de `COPY . .`; se falhar, o build segue e a página usa as imagens (`ThemedVideo` cai na captura quando o vídeo não carrega). O `render.yaml` (build nativo, sem ffmpeg) não gera os vídeos: o site mostra as imagens.

## Cotação antes de confirmar

`GET /api/subscribe/quote?devices=N&billingDay=15|20|30` (`server/services/subscribeQuote.js`) consulta `GET {LICENSING_API_BASE_URL}/api/v1/site/subscription/quote` (mesmos parâmetros, `X-Service-Key`) e devolve `{estimated, amount, firstChargeAmount, firstChargeDate, nextDueDate, billingDay}`.

- Valida computadores (1 a 20) e dia; 60 consultas por minuto por visitante; timeout de 4 s; cache de 30 s por (computadores, dia).
- API fora, lenta, desligada ou com resposta inválida: responde 200 com a estimativa local (`estimated: true`, `shared/plan.js` + `shared/billing.js`), em cache por 10 s. Nunca devolve erro por causa da API.
- A tela (`useQuote`, com debounce de 350 ms) mostra "Cobrado hoje" e o próximo vencimento da cotação, com "valor estimado" quando `estimated` for true; enquanto consulta, os números esmaecem sem mudar o layout.
