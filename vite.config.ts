import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import legacy from '@vitejs/plugin-legacy';
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

const webOsPolyfill = [
  '(function(){',
  'function appendPolyfill(){for(var i=0;i<arguments.length;i++){var node=arguments[i];if(node==null)continue;this.appendChild(typeof node==="string"?document.createTextNode(node):node);}}',
  'if(typeof Element!=="undefined"&&!Element.prototype.append)Element.prototype.append=appendPolyfill;',
  'if(typeof DocumentFragment!=="undefined"&&!DocumentFragment.prototype.append)DocumentFragment.prototype.append=appendPolyfill;',
  'if(typeof Element!=="undefined"&&!Element.prototype.replaceChildren)Element.prototype.replaceChildren=function(){while(this.firstChild)this.removeChild(this.firstChild);appendPolyfill.apply(this,arguments);};',
  'if(typeof Node!=="undefined"&&!Node.prototype.getRootNode)Node.prototype.getRootNode=function(){var node=this;while(node.parentNode)node=node.parentNode;return node;};',
  'if(typeof Element!=="undefined"&&!Element.prototype.remove)Element.prototype.remove=function(){if(this.parentNode)this.parentNode.removeChild(this);};',
  'if(typeof Promise!=="undefined"&&!Promise.prototype.finally)Promise.prototype.finally=function(callback){var chain=function(){return Promise.resolve(callback());};return this.then(function(value){return chain().then(function(){return value;});},function(reason){return chain().then(function(){throw reason;});});};',
  '})();',
].join('');

function msxAppShell(): Plugin {
  return {
    name: 'msx-app-shell',
    apply: 'build',
    transformIndexHtml(html) {
      if (!hostedOnVercel) return html;
      return html
        .replace(/\s*<script src="\$WEBAPIS\/webapis\/webapis\.js"><\/script>/, '')
        .replace(
          '<div id="root"></div>',
          `<script>${webOsPolyfill}</script>\n    <div id="root"></div>\n    <script src="https://msx.benzac.de/js/tvx-plugin.min.js"></script>`,
        );
    },
  };
}

export default defineConfig({
  base: hostedOnVercel ? '/msx/app/' : './',
  define: {
    'import.meta.env.VITE_MSX': JSON.stringify(hostedOnVercel ? 'true' : 'false'),
  },
  plugins: [
    react(),
    msxPlugin(),
    msxAppShell(),
    copyTizenPackage(),
    ...(hostedOnVercel
      ? [
          legacy({
            targets: ['chrome >= 38'],
            modernTargets: ['chrome >= 64'],
            modernPolyfills: true,
            additionalLegacyPolyfills: ['whatwg-fetch'],
          }),
        ]
      : []),
  ],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    cssTarget: hostedOnVercel ? 'chrome53' : undefined,
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
