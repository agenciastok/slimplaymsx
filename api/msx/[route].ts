import { handleMsx } from '../../src/msx/gateway';

export const config = {
  api: { bodyParser: false },
};

interface NodeRequest {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
  on(event: 'data', listener: (chunk: Buffer) => void): void;
  on(event: 'end', listener: () => void): void;
  on(event: 'error', listener: (error: Error) => void): void;
}

interface NodeResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

export default async function handler(request: NodeRequest, response: NodeResponse): Promise<void> {
  cors(response);
  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.end();
    return;
  }
  const route = first(request.query.route);
  const host = first(request.headers['x-forwarded-host']) ?? first(request.headers.host) ?? '';
  const proto = first(request.headers['x-forwarded-proto']) || 'https';
  const base = `${proto}://${host}`;
  const current = new URL(request.url ?? '/', base || 'https://slimplay.local');
  const result = await handleMsx({
    method: request.method ?? 'GET',
    path: `/msx/${route}`,
    search: current.searchParams,
    body: request.method === 'POST' ? await readJson(request) : null,
    base,
  });
  response.statusCode = result.status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(result.body));
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readJson(request: NodeRequest): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk) => chunks.push(chunk));
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

function cors(response: NodeResponse): void {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}
