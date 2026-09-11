/// <reference types="vitest/config" />
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Build identity — client compares `bm-build` on the running shell vs the
 * no-store index.html the server serves (reload only on real deploy).
 */
const BM_BUILD_ID = String(process.env.BM_BUILD_ID || Date.now());

function bmBuildIdPlugin(): Plugin {
  return {
    name: 'bm-build-id',
    transformIndexHtml(html) {
      const meta = `<meta name="bm-build" content="${BM_BUILD_ID}" />`;
      return html.replace('<head>', `<head>\n    ${meta}`);
    },
  };
}

const game2048EngineEntry =
  [
    path.resolve(__dirname, 'src/features/games/lib/game2048Engine.ts'),
    path.resolve(__dirname, '../dist/server/services/game2048Engine.js'),
    path.resolve(__dirname, '../server/services/game2048Engine.ts'),
  ].find((p) => fs.existsSync(p)) ?? path.resolve(__dirname, 'src/features/games/lib/game2048Engine.ts');

const blockminerOrigin =
  String(process.env.VITE_BLOCKMINER_ORIGIN || '').trim() ||
  (process.env.NODE_ENV === 'production' ? 'https://blockminer.space' : 'http://localhost:5173');

export default defineConfig({
  plugins: [react(), bmBuildIdPlugin()],
  resolve: {
    alias: {
      '@game2048/engine': game2048EngineEntry,
      '@': path.resolve(__dirname, 'src'),
    },
  },
  define: {
    'process.env.APP_URL': JSON.stringify(blockminerOrigin),
  },
  // Content hashes (Vite default) — never stamp filenames with inv2plusN.
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          const nm = id.replace(/\\/g, '/');
          if (nm.includes('/socket.io-client/') || nm.includes('/engine.io-client/')) {
            return 'vendor-socket';
          }
          if (nm.includes('/i18next/') || nm.includes('/react-i18next/')) {
            return 'vendor-i18n';
          }
          if (
            /\/node_modules\/(react|react-dom|scheduler)\//.test(nm) ||
            nm.includes('/node_modules/react-router/') ||
            nm.includes('/node_modules/react-router-dom/')
          ) {
            return 'vendor-react';
          }
          if (
            nm.includes('/node_modules/axios/') ||
            nm.includes('/node_modules/zustand/') ||
            nm.includes('/node_modules/sonner/')
          ) {
            return 'vendor-app';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
  },
});
