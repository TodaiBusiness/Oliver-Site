# Segurança do servidor do site

O que protege o servidor Node (`server.js`, `server/`) e por quê. Revisado em 21/10/2026, depois de uma varredura de
bugs que achou e corrigiu os itens marcados com a data.

## Endereço do visitante e limites por pedido

- O endereço usado nos limites é o **último** item de `X-Forwarded-For`, que é o que o proxy de borda acrescentou; sem
  o cabeçalho, vale o IP da conexão (`server/http/clientAddress.js`). O primeiro item é o que o cliente mandou e podia
  ser forjado para escapar dos limites (corrigido em 21/10/2026). Na VPS o Caddy precisa ficar na frente do processo;
  se o Node for exposto direto, o cabeçalho volta a ser forjável.
- Limites em memória, por instância (`server/http/rateLimit.js`, com teto de 10.000 chaves):
  - formulário de orçamento, compra e link de acesso: por endereço, como antes;
  - link de acesso à área do comprador: também 5 por 10 minutos **por CPF/CNPJ**, para ninguém encher de e-mails a
    caixa de um cliente trocando de endereço;
  - login: 20 por 10 minutos por endereço; cadastro: 10 por 10 minutos (o scrypt é caro de propósito e, sem teto,
    poucas requisições travavam o processo). O bloqueio de 15 minutos por e-mail depois de 5 senhas erradas continua.
  - os limites ficam num `Map` por processo: somem num reinício e não se somam entre instâncias. Com um processo só na
    VPS isso basta; numa função serverless (Netlify) cada instância fria teria o seu e o limite efetivo se multiplica.
    As janelas vencidas são varridas e o teto de chaves vale (teste `tests/seo-rota.test.js`, 21/10/2026).

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
- `SESSION_SECRET` não é exigida: as sessões são tokens aleatórios com hash no banco, e o segredo não assina nada.
  Trocá-lo não derruba sessões; para isso, apague as sessões no banco.
- A imagem Docker usa `https://oliverimports.com.br` como endereço do site (canônico e imagens de compartilhamento) e
  escuta na porta 8080, a mesma do healthcheck.

## Visitas do site

Detalhes em `docs/VISITANTES.md`. Em resumo: `POST /api/analytics/collect` aceita só a origem do próprio site (sem
`Origin` autorizado, 403), tem teto de 120 pedidos por minuto por IP, ignora bots e quem manda `DNT`/`Sec-GPC`, e
nunca guarda IP nem cookie. `GET /api/analytics/report` exige `X-Analytics-Key` igual a `ANALYTICS_READ_KEY`
(mínimo de 32 caracteres, comparação em tempo constante); sem a variável a rota responde 503 e nunca fica aberta.
