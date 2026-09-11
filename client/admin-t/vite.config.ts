import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(__dirname, '..');

export default defineConfig({
  root: __dirname,
  base: '/admin-t/',
  plugins: [react()],
  resolve: {
    alias: {
      // Keep imports under src/ resolving like the main app.
    },
  },
  build: {
    outDir: path.join(clientRoot, 'dist/admin-t'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.join(__dirname, 'index.html'),
    },
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
