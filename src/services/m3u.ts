import { timeoutSignal } from '../core/timeout-signal';
import { slug } from '../core/text';
import type { CategoryFolder, MediaEntry, MediaKind } from '../models/media';
import { directM3uUrl, type PlaylistCredentials } from '../models/playlist';
import { CatalogException } from './catalog-error';

type CatalogKind = 'live' | 'movie' | 'series';

export interface DirectCatalog {
  categories: Record<CatalogKind, CategoryFolder[]>;
  entries: Record<CatalogKind, MediaEntry[]>;
}

const cache = new Map<string, DirectCatalog>();
const pending = new Map<string, Promise<DirectCatalog>>();

export async function loadDirectCatalog(
  credentials: PlaylistCredentials,
  signal?: AbortSignal,
): Promise<DirectCatalog> {
  const url = directM3uUrl(credentials);
  if (!/^https?:\/\//i.test(url)) throw new CatalogException('Falha ao baixar o conteúdo');
  const cached = cache.get(url);
  if (cached) return cached;
  let task = pending.get(url);
  if (!task) {
    task = fetchCatalog(url).finally(() => pending.delete(url));
    pending.set(url, task);
  }
  if (!signal) return task;
  return abortable(task, signal);
}

export function catalogEntries(catalog: DirectCatalog, kind: MediaKind, categoryId: string | null): MediaEntry[] {
  if (kind !== 'live' && kind !== 'movie' && kind !== 'series') return [];
  const entries = catalog.entries[kind];
  if (!categoryId) return entries;
  return entries.filter((item) => item.categoryId === categoryId);
}

export function parseM3uCatalog(text: string): DirectCatalog {
  const names: Record<CatalogKind, Map<string, string>> = {
    live: new Map(),
    movie: new Map(),
    series: new Map(),
  };
  const entries: Record<CatalogKind, MediaEntry[]> = { live: [], movie: [], series: [] };
  let name: string | null = null;
  let logo: string | null = null;
  let group: string | null = null;
  let ordinal = 0;
  for (const raw of text.split(/\r\n|\n|\r/)) {
    let line = raw.trim();
    if (line.startsWith('\uFEFF')) line = line.slice(1).trim();
    if (!line) continue;
    if (line.toUpperCase().startsWith('#EXTINF')) {
      const meta = parseExtInf(line);
      name = meta.name;
      logo = meta.logo;
      group = meta.group;
      continue;
    }
    if (line.startsWith('#')) continue;
    if (!line.startsWith('http://') && !line.startsWith('https://')) continue;
    ordinal += 1;
    const kind = kindFromPlaylistUrl(line, group);
    const categoryName = group ?? 'Outros';
    const categoryId = slug(categoryName);
    names[kind].set(categoryId, categoryName);
    entries[kind].push({
      id: `${kind}:src:${ordinal}`,
      sourceId: String(ordinal),
      name: name?.trim() ? name : 'Sem nome',
      kind,
      posterUrl: logo,
      categoryId,
      categoryName,
      mediaUrl: line,
      plot: null,
      year: null,
      genre: null,
      addedAt: ordinal,
    });
    name = null;
    logo = null;
    group = null;
  }
  return {
    categories: {
      live: foldersOf(names.live),
      movie: foldersOf(names.movie),
      series: foldersOf(names.series),
    },
    entries,
  };
}

async function fetchCatalog(url: string): Promise<DirectCatalog> {
  let response: Response;
  try {
    const signal = timeoutSignal(90000);
    response = await fetch(url, {
      headers: { Accept: '*/*' },
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new CatalogException('Falha ao baixar o conteúdo');
  }
  if (response.status < 200 || response.status >= 300) {
    throw new CatalogException('Falha ao baixar o conteúdo');
  }
  const text = await response.text();
  if (!text.includes('#EXTM3U') && !text.includes('#EXTINF')) {
    throw new CatalogException('Falha ao baixar o conteúdo');
  }
  const catalog = parseM3uCatalog(text);
  cache.set(url, catalog);
  return catalog;
}

function abortable<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('The operation was aborted.', 'AbortError'));
  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
    signal.addEventListener('abort', abort, { once: true });
    task.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}

function parseExtInf(line: string): { name: string; logo: string | null; group: string | null } {
  const comma = line.indexOf(',');
  const name = comma >= 0 ? line.slice(comma + 1).trim() : 'Sem nome';
  return {
    name: name || 'Sem nome',
    logo: attr(line, 'tvg-logo'),
    group: attr(line, 'group-title'),
  };
}

function attr(line: string, key: string): string | null {
  const match = new RegExp(`${key}="([^"]*)"`).exec(line);
  const value = match?.[1]?.trim();
  return value ? value : null;
}

function kindFromPlaylistUrl(url: string, group: string | null): CatalogKind {
  const lower = url.toLowerCase();
  const folder = (group ?? '').toLowerCase();
  if (lower.includes('/series/') || folder.includes('serie')) return 'series';
  if (lower.includes('/movie/') || lower.includes('/vod/') || folder.includes('filme') || folder.includes('movie')) {
    return 'movie';
  }
  return 'live';
}

function foldersOf(names: Map<string, string>): CategoryFolder[] {
  return [...names.entries()].map(([id, name]) => ({ id, name }));
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
