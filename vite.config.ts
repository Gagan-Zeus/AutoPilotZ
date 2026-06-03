import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

function manifestPlugin(): Plugin {
  return {
    name: 'autopilotx-manifest',
    closeBundle() {
      const distManifestPath = resolve(__dirname, 'dist/manifest.json');
      const manifest = JSON.parse(
        readFileSync(resolve(__dirname, 'manifest.json'), 'utf-8'),
      ) as Record<string, unknown>;

      manifest.background = {
        service_worker: 'background/service-worker.js',
        type: 'module',
      };
      manifest.content_scripts = [];
      delete manifest.host_permissions;
      if (process.env.AUTOPILOTX_E2E === 'true') {
        manifest.host_permissions = ['http://127.0.0.1:4300/*'];
      }

      mkdirSync(dirname(distManifestPath), { recursive: true });
      writeFileSync(distManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      copyFileSync(
        resolve(__dirname, 'manifest.json'),
        resolve(__dirname, 'dist/manifest.source.json'),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), manifestPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup.html'),
        options: resolve(__dirname, 'options.html'),
        'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        'content/content-script': resolve(__dirname, 'src/content/content-script.ts'),
      },
      output: {
        entryFileNames: (chunk) => `${chunk.name}.js`,
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
