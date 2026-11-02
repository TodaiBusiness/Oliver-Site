# Imagem do site TODAI (React + servidor Node). Usada pelo
# docker-compose da VPS (Panel-Desktop/deploy/hostinger). Em duas etapas:
# a primeira compila o React com o Vite, a segunda só leva o que roda.

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Valores PÚBLICOS: o Vite os grava no JavaScript que vai para o navegador.
# Por isso entram na hora do build e mudá-los exige reconstruir a imagem.
ARG VITE_SITE_URL="https://todai.com.br"
ARG VITE_COMPANY_EMAIL=""
ARG VITE_INSTALLER_URL=""
ENV VITE_SITE_URL=$VITE_SITE_URL \
    VITE_COMPANY_EMAIL=$VITE_COMPANY_EMAIL \
    VITE_INSTALLER_URL=$VITE_INSTALLER_URL
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production

# Só as dependências de execução (o Vite e afins ficam na etapa de build).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY server.js ./
COPY server ./server
COPY shared ./shared
COPY scripts ./scripts

# O usuário "node" já existe na imagem; o site não precisa de root.
USER node
EXPOSE 8080

# A rota /api/health responde 200 quando o processo está de pé.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
