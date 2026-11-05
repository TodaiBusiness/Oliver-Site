import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const API_PORT = process.env.API_PORT ?? 8788;

/* Endereço público do site, usado em canonical e Open Graph. Fica aqui, e não
   escrito à mão no index.html, porque ele muda: primeiro é o .onrender.com,
   depois virou o domínio próprio. O padrão é o domínio de produção, então um deploy sem VITE_SITE_URL ainda gera meta tags válidas
   em vez de uma URL de exemplo — que o Google indexaria como canonical. */
const SITE_URL = (process.env.VITE_SITE_URL || 'https://todai.com.br')
  .trim()
  .replace(/\/+$/, '');

/** Troca `__SITE_URL__` no index.html pelo endereço real, no momento do build. */
const siteUrl = () => ({
  name: 'todai-site-url',
  transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', SITE_URL),
});

export default defineConfig({
  plugins: [react(), siteUrl()],
  server: {
    /* Em desenvolvimento, /api vai para o servidor local (scripts/dev-api.mjs).
       Em produção quem responde é o próprio server.js, na mesma origem — o
       front não muda. */
    proxy: {
      '/api': {
        target: `http://localhost:${API_PORT}`,
        changeOrigin: false,
      },
    },
  },
  build: {
    target: 'es2020',
    cssTarget: 'chrome100',
  },
});
