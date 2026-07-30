import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Vite dev server proxies `/graphql` to the backend so the frontend can call
 * a same-origin path in both dev and prod (in prod, the Fastify server serves
 * both — see main.ts). This means `VITE_GRAPHQL_ENDPOINT` defaults to
 * `/graphql` in every environment.
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/graphql': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
