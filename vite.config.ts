import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { msxPlugin } from './msx-plugin';

const hostedOnVercel = process.env.VERCEL === '1';

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

function msxAppShell(): Plugin {
  return {
    name: 'msx-app-shell',
    apply: 'build',
    transformIndexHtml(html) {
      if (!hostedOnVercel) return html;
      return html.replace(
        '<div id="root"></div>',
        '<div id="root"></div>\n    <script src="https://msx.benzac.de/js/tvx-plugin.min.js"></script>',
      );
    },
  };
}

export default defineConfig({
  base: hostedOnVercel ? '/msx/app/' : './',
  define: {
    'import.meta.env.VITE_MSX': JSON.stringify(hostedOnVercel ? 'true' : 'false'),
  },
  plugins: [react(), msxPlugin(), msxAppShell(), copyTizenPackage()],
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
