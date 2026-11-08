import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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

function msxChromium53Boot(): Plugin {
  return {
    name: 'msx-chromium53-boot',
    apply: 'build',
    enforce: 'post',
    closeBundle() {
      if (!hostedOnVercel) return;
      const htmlPath = resolve('dist/index.html');
      const html = readFileSync(htmlPath, 'utf8');
      const polyfill = /id="vite-legacy-polyfill"[^>]*src="([^"]+)"/.exec(html);
      const entry = /id="vite-legacy-entry"[^>]*data-src="([^"]+)"/.exec(html);
      if (!polyfill || !entry) throw new Error('Pacote legado ausente no HTML');
      const source = (url: string) =>
        readFileSync(resolve('dist', url.replace(/^\/msx\/app\//, '')), 'utf8').replace(
          /<\/script/gi,
          () => '<\\/script',
        );
      const checker =
        '<script>(function(){var root=document.getElementById("root");if(!root)return;var text=(root.textContent||"").replace(/^\\s+|\\s+$/g,"");if(text!=="SLIM PLAY")return;var line=document.createElement("div");line.style.cssText="font-size:28px;padding:24px;white-space:pre-wrap;";line.textContent=window.__slimplayBoot?"O pacote carregou, mas a tela nao abriu.":"O pacote antigo nao executou.";root.appendChild(line);})();</script>';
      writeFileSync(
        htmlPath,
        html.replace(
          '</body>',
          () =>
            `<script>${source(polyfill[1])}</script><script>${source(entry[1])}</script>${checker}</body>`,
        ),
      );
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!hostedOnVercel) return html;
        const polyfill = /id="vite-legacy-polyfill"[^>]*src="([^"]+)"/.exec(html);
        const entry = /id="vite-legacy-entry"[^>]*data-src="([^"]+)"/.exec(html);
        if (!polyfill || !entry) return html;
        const boot =
          '<style>html,body,#root{margin:0;width:100%;height:100%;background:#0f0f12;color:#fff;overflow:hidden;}</style>';
        return html
          .replace(
            'name="viewport" content="width=1920, height=1080"',
            'name="viewport" content="width=device-width, initial-scale=1"',
          )
          .replace(/<script nomodule\b/g, '<script type="text/plain"')
          .replace('<div id="root"></div>', '<div id="root" style="font-size:48px;padding:48px;">SLIM PLAY</div>')
          .replace('</body>', `${boot}</body>`);
      },
    },
  };
}

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
          msxChromium53Boot(),
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
