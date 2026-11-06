import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { msxPlugin } from './msx-plugin';

function copyTizenPackage(): Plugin {
  return {
    name: 'copy-tizen-package',
    apply: 'build',
    closeBundle() {
      const config = resolve('tizen/config.xml');
      const icon = resolve('tizen/icon.png');
      if (!existsSync(config) || !existsSync(icon)) return;
      copyFileSync(config, resolve('dist/config.xml'));
      copyFileSync(icon, resolve('dist/icon.png'));
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), msxPlugin(), copyTizenPackage()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/panel-api': {
        target: 'https://slimplaypanel.vercel.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/panel-api/, '/api'),
      },
    },
  },
});
