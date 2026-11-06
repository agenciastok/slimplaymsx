import { mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';

const outfile = 'api/msx/[route].js';

await rm('api/msx/[route].ts', { force: true });
await mkdir('api/msx', { recursive: true });
await build({
  entryPoints: ['src/msx/http.ts'],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  legalComments: 'none',
});
