import { handleMsx } from '../../src/msx/gateway';

export const config = {
  api: { bodyParser: false },
};

interface NodeResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

export default async function handler(request: unknown, response: NodeResponse): Promise<Response | void> {
  try {
    if (methodOf(request) === 'OPTIONS') return send(response, 204, null);
    const url = requestUrl(request);
    const route = url.pathname.split('/').filter(Boolean).pop() ?? '';
    const host = header(request, 'x-forwarded-host') ?? header(request, 'host') ?? url.host;
    const proto = header(request, 'x-forwarded-proto') || 'https';
    const result = await handleMsx({
      method: methodOf(request),
      path: `/msx/${route}`,
      search: url.searchParams,
      body: methodOf(request) === 'POST' ? await readJson(request) : null,
      base: `${proto}://${host}`,
    });
    return send(response, result.status, result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Não foi possível carregar';
    return send(response, 500, { error: message });
  }
}

function methodOf(request: unknown): string {
  if (request && typeof request === 'object' && 'method' in request && typeof request.method === 'string') {
    return request.method;
  }
  return 'GET';
}

function requestUrl(request: unknown): URL {
  const raw = request && typeof request === 'object' && 'url' in request ? request.url : '/';
  const value = typeof raw === 'string' && raw ? raw : '/';
  if (value.startsWith('http://') || value.startsWith('https://')) return new URL(value);
  const host = header(request, 'x-forwarded-host') ?? header(request, 'host') ?? 'slimplay.site';
  return new URL(value, `https://${host}`);
}

function header(request: unknown, name: string): string | undefined {
  if (!request || typeof request !== 'object' || !('headers' in request)) return undefined;
  const headers = request.headers;
  if (!headers) return undefined;
  if (typeof headers === 'object' && headers && 'get' in headers && typeof headers.get === 'function') {
    const value = headers.get(name);
    return typeof value === 'string' ? value : undefined;
  }
  if (typeof headers === 'object' && headers && name in headers) {
    const value = (headers as Record<string, unknown>)[name];
    if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

async function readJson(request: unknown): Promise<unknown> {
  const text = (await readText(request)).trim();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { code: text };
  }
}

async function readText(request: unknown): Promise<string> {
  if (request && typeof request === 'object' && 'text' in request && typeof request.text === 'function') {
    return request.text();
  }
  const chunks: Uint8Array[] = [];
  if (request && typeof request === 'object' && Symbol.asyncIterator in request) {
    for await (const chunk of request as AsyncIterable<Uint8Array | string>) {
      chunks.push(typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk);
    }
  }
  const merged = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function send(response: NodeResponse, status: number, body: unknown): Response | void {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Content-Type': 'application/json; charset=utf-8',
  };
  if (response && typeof response.setHeader === 'function' && typeof response.end === 'function') {
    for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
    response.statusCode = status;
    response.end(status === 204 ? undefined : JSON.stringify(body));
    return;
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}
