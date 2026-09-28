import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { handleApiRequest } from './server/api.js';

function localApi() {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.method === 'GET' && request.url === '/development-log') request.url = '/development-log.html';
        if (!handleApiRequest(request, response)) next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.method === 'GET' && request.url === '/development-log') request.url = '/development-log.html';
        if (!handleApiRequest(request, response)) next();
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), localApi()],
  build: { rollupOptions: { input: {
    main: fileURLToPath(new URL('./index.html', import.meta.url)),
    developmentLog: fileURLToPath(new URL('./development-log.html', import.meta.url)),
    debug: fileURLToPath(new URL('./debug.html', import.meta.url)),
  } } },
  server: { host: '127.0.0.1', port: 8765, strictPort: true },
  preview: { host: '127.0.0.1', port: 8765, strictPort: true },
});
