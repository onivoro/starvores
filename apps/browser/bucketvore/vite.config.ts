import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

export default defineConfig({
  root: __dirname,
  cacheDir: '../../../node_modules/.vite/apps/browser/bucketvore',
  server: {
    port: 4147,
    host: 'localhost',
    proxy: {
      '/api': 'http://localhost:3007',
    },
  },
  plugins: [react(), nxViteTsPaths()],
  build: {
    outDir: '../../../dist/apps/browser/bucketvore',
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});
