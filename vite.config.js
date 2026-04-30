import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main:         resolve(__dirname, 'index.html'),
        medical:      resolve(__dirname, 'medical.html'),
        parametres:   resolve(__dirname, 'parametres.html'),
        demarches:    resolve(__dirname, 'demarches.html'),
        surveillance: resolve(__dirname, 'surveillance.html'),
        rappels:      resolve(__dirname, 'rappels.html'),
      },
    },
  },
  server: {
    port: 8080,
    open: true,
  },
});
