# Deploy: PDV interativo e assinatura com cartão

## Ordem
1. **API (Panel-Desktop#28)**: compile (`dotnet build`, `dotnet test`), faça o deploy da API. A migração 24→25 roda no start (`Database/Migration_24_to_25.sql`).
2. Variáveis da API (sem segredos no Git): `Asaas__Enabled=true`, `Asaas__ApiKey`, `Asaas__WebhookToken`, `Asaas__BaseUrl` (sandbox: `https://api-sandbox.asaas.com/v3`; produção: `https://api.asaas.com/v3`).
3. No painel do Asaas, cadastre o webhook `https://<api>/api/v1/webhooks/asaas` com o mesmo token e os eventos de pagamento e assinatura.
4. **Site (Oliver-Site#13)**: nada novo de variável (usa `LICENSING_API_BASE_URL` e a chave de serviço que já existem). Merge na `main` publica a imagem (`publicar-imagem-site`), que já gera os vídeos do PDV no build.
5. Teste no sandbox: assinar em `/assinar` com cartão de teste do Asaas e conferir no Panel (provedor Asaas, cartão e dia).

## Sem Docker (pacote pronto)
`todai-site-assinatura.tar.gz`: `npm ci --omit=dev && node server.js` (Node 22, porta `PORT`, padrão 8080). As variáveis de ambiente são as do `.env.example`.

## Reverter
Mantenha `Asaas__Enabled=false` e `/assinar` responde "indisponível"; o checkout atual (`/comprar`) segue funcionando.
