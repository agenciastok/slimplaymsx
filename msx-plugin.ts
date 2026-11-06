import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

export function msxPlugin(): Plugin {
  return {
    name: 'slimplay-msx',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const raw = request.url ?? '';
        if (!raw.startsWith('/msx')) {
          next();
          return;
        }
        void serve(server, request, response).catch((error: unknown) => {
          writeJson(response, 500, { error: error instanceof Error ? error.message : 'Falha' });
        });
      });
    },
  };
}

async function serve(
  server: { ssrLoadModule(url: string): Promise<unknown> },
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.method === 'OPTIONS') {
    cors(response);
    response.statusCode = 204;
    response.end();
    return;
  }
  const loaded = (await server.ssrLoadModule('/src/msx/gateway.ts')) as {
    handleMsx(input: {
      method: string;
      path: string;
      search: URLSearchParams;
      body: unknown;
      base: string;
    }): Promise<{ status: number; body: unknown }>;
  };
  const url = new URL(request.url ?? '/msx', 'http://127.0.0.1');
  const result = await loaded.handleMsx({
    method: request.method ?? 'GET',
    path: url.pathname,
    search: url.searchParams,
    body: request.method === 'POST' ? await readJson(request) : null,
    base: publicBase(request),
  });
  writeJson(response, result.status, result.body);
}

function publicBase(request: IncomingMessage): string {
  const host = request.headers.host ?? '127.0.0.1:5173';
  const forwarded = request.headers['x-forwarded-proto'];
  const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded) || 'http';
  return `${proto}://${host}`;
}

function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(text) as unknown);
      } catch {
        resolve({ code: text });
      }
    });
    request.on('error', reject);
  });
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  cors(response);
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

function cors(response: ServerResponse): void {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}
