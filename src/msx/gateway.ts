import { AppConfig } from '../core/config';
import { deviceKeyFromId } from '../core/device-key';
import { jMap, jString } from '../core/json';
import { licenseFromPayload } from '../core/license';
import { formatAsMacAddress } from '../core/mac-address';
import type { MediaEntry, MediaKind } from '../models/media';
import {
  openedAsXtream,
  playlistFromApi,
  playlistLoaded,
  playlistsFromPayload,
  type PlaylistCredentials,
} from '../models/playlist';
import { CatalogException, loadCategories, loadSeriesDetail, loadStreams } from '../services/xtream';

const pageSize = AppConfig.pageSize;
const cacheMs = 10 * 60 * 1000;

interface CachedList {
  at: number;
  list: PlaylistCredentials;
}

interface CachedItems {
  at: number;
  items: MediaEntry[];
}

const lists = new Map<string, CachedList>();
const catalogs = new Map<string, CachedItems>();

export interface MsxResult {
  status: number;
  body: unknown;
}

export async function handleMsx(input: {
  method: string;
  path: string;
  search: URLSearchParams;
  body: unknown;
  base: string;
}): Promise<MsxResult> {
  const path = input.path.replace(/\/+$/, '') || '/';
  try {
    if (path === '/msx/start.json') return ok(startObject(input.base));
    if (path === '/msx/launch.json') return ok(launchObject(input.base));
    if (path === '/msx/menu') return ok(await menu(input.base, input.search.get('mac')));
    if (path === '/msx/enter' && input.method === 'POST') return ok(await enterCode(input.base, input.body));
    if (path === '/msx/categories') return ok(await categories(input.base, input.search));
    if (path === '/msx/items') return ok(await items(input.base, input.search));
    if (path === '/msx/series') return ok(await series(input.search));
    if (path === '/msx/diag-ping') return ok({ ok: true, test: 'D', stage: 'api' });
    if (path === '/msx/diag-api') {
      return ok({
        type: 'list',
        headline: 'TESTE D OK',
        template: { type: 'control', layout: '0,0,12,1' },
        items: [{ label: 'A API respondeu sem dados do aparelho' }],
      });
    }
    return { status: 404, body: { error: 'Endereço não encontrado' } };
  } catch (error) {
    return ok(messagePage(msxFailure(error)));
  }
}

function startObject(base: string) {
  return {
    name: 'SLIM PLAY',
    version: AppConfig.version,
    parameter: 'content:{PREFIX}{SERVER}/msx/launch.json',
    launcher: {
      image: `${base}/msx/icon.png`,
      color: '#0F0F12',
    },
  };
}

function launchObject(base: string) {
  const app = `${base}/msx/app/?v=1.0.12`;
  return {
    type: 'pages',
    headline: 'SLIM PLAY',
    background: `${base}/msx/backdrop.jpg`,
    ready: { action: `video:plugin:${app}` },
    pages: [
      {
        items: [
          {
            layout: '0,0,12,6',
            color: '#0F0F12',
            image: `${base}/msx/icon.png`,
            imageFiller: 'center',
            titleFooter: `SLIM PLAY ${AppConfig.version}`,
            action: `video:plugin:${app}`,
          },
        ],
      },
    ],
  };
}

async function menu(base: string, rawMac: string | null) {
  const mac = rawMac ? formatAsMacAddress(rawMac) : null;
  if (!mac) {
    return {
      headline: 'SLIM PLAY',
      menu: [{ label: 'Entrar', data: enterPage(base) }],
    };
  }
  try {
    await deviceList(mac);
  } catch (error) {
    return {
      headline: 'SLIM PLAY',
      menu: [{ label: 'Entrar', data: messagePage(msxFailure(error)) }],
    };
  }
  const query = `mac=${encodeURIComponent(mac)}`;
  return {
    headline: 'SLIM PLAY',
    menu: [
      { icon: 'live-tv', label: 'TV ao vivo', data: `${base}/msx/categories?${query}&kind=live` },
      { icon: 'movie', label: 'Filmes', data: `${base}/msx/categories?${query}&kind=movie` },
      { icon: 'tv', label: 'Séries', data: `${base}/msx/categories?${query}&kind=series` },
      { icon: 'settings', label: 'Trocar aparelho', data: enterPage(base) },
    ],
  };
}

function enterPage(base: string) {
  return {
    type: 'pages',
    headline: 'Aparelho',
    items: [
      {
        layout: '0,0,8,1',
        label: 'Informe o MAC da TV',
        action: `execute:code:${base}/msx/enter`,
        data: {
          headline: 'MAC do aparelho',
          placeholder: 'AA:BB:CC:DD:EE:FF',
          extension: 'O mesmo MAC da tela de ativação do SlimPlay',
        },
      },
    ],
  };
}

async function enterCode(base: string, body: unknown) {
  const map = jMap(body);
  const mac = formatAsMacAddress(jString(map?.code));
  if (!mac) {
    return responseAction('warn:Informe o MAC no formato AA:BB:CC:DD:EE:FF');
  }
  try {
    await deviceList(mac);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : 'Aparelho não encontrado';
    return responseAction(`warn:${message}`);
  }
  return responseAction(`menu:${base}/msx/menu?mac=${encodeURIComponent(mac)}`);
}

async function categories(base: string, search: URLSearchParams) {
  const mac = requiredMac(search);
  const kind = requiredKind(search);
  const list = await deviceList(mac);
  const folders = await loadCategories(list, kind);
  const query = `mac=${encodeURIComponent(mac)}&kind=${kind}`;
  return {
    type: 'list',
    headline: kindTitle(kind),
    template: { type: 'control', layout: '0,0,12,1', icon: kindIcon(kind) },
    items: [
      { label: 'Todos', action: `content:${base}/msx/items?${query}` },
      ...folders.map((folder) => ({
        label: folder.name,
        action: `content:${base}/msx/items?${query}&category=${encodeURIComponent(folder.id)}`,
      })),
    ],
  };
}

async function items(base: string, search: URLSearchParams) {
  const mac = requiredMac(search);
  const kind = requiredKind(search);
  const list = await deviceList(mac);
  const category = search.get('category');
  const offset = clampOffset(search.get('offset'));
  const catalog = await catalogItems(mac, list, kind, category);
  const slice = catalog.slice(offset, offset + pageSize);
  const query = `mac=${encodeURIComponent(mac)}&kind=${kind}${category ? `&category=${encodeURIComponent(category)}` : ''}`;
  const cards: { label: string; action?: string; title?: string; image?: string; playerLabel?: string; extensionLabel?: string }[] = slice.map((entry) =>
    itemCard(base, mac, entry),
  );
  if (offset + pageSize < catalog.length) {
    cards.push({
      label: 'Mais',
      action: `content:${base}/msx/items?${query}&offset=${offset + pageSize}`,
    });
  }
  return {
    type: 'pages',
    headline: kindTitle(kind),
    template: {
      type: kind === 'live' ? 'control' : 'separate',
      layout: kind === 'live' ? '0,0,12,1' : '0,0,2,4',
      color: 'msx-glass',
    },
    items: cards.length > 0 ? cards : [{ label: 'Nenhum título nesta pasta.' }],
  };
}

async function series(search: URLSearchParams) {
  const mac = requiredMac(search);
  const id = search.get('id')?.trim() ?? '';
  if (!id) return messagePage('Série indisponível');
  const list = await deviceList(mac);
  const detail = await loadSeriesDetail(list, {
    id: `series:${id}`,
    sourceId: id,
    name: 'Série',
    kind: 'series',
    posterUrl: null,
    categoryId: null,
    mediaUrl: null,
    plot: null,
    year: null,
    genre: null,
  });
  const episodes = detail.seasons.flatMap((season) =>
    season.episodes.map((episode) => ({
      label: episodeLabel(episode),
      playerLabel: `${detail.series.name} ${episodeLabel(episode)}`,
      image: imageOf(episode.posterUrl),
      action: episode.mediaUrl ? `video:${episode.mediaUrl}` : undefined,
    })),
  );
  return {
    type: 'pages',
    headline: detail.series.name,
    important: true,
    template: { type: 'control', layout: '0,0,12,1' },
    items: episodes.length > 0 ? episodes : [{ label: 'Nenhum episódio nesta série.' }],
  };
}

function itemCard(base: string, mac: string, entry: MediaEntry) {
  if (entry.kind === 'series') {
    return {
      label: entry.name,
      title: entry.name,
      image: imageOf(entry.posterUrl),
      action: `content:${base}/msx/series?mac=${encodeURIComponent(mac)}&id=${encodeURIComponent(entry.sourceId)}`,
    };
  }
  return {
    label: entry.name,
    title: entry.name,
    playerLabel: entry.name,
    image: imageOf(entry.posterUrl),
    extensionLabel: entry.kind === 'live' ? 'AO VIVO' : undefined,
    action: entry.mediaUrl ? `video:${entry.mediaUrl}` : undefined,
  };
}

function episodeLabel(entry: MediaEntry): string {
  if (entry.seasonNumber == null && entry.episodeNumber == null) return entry.name;
  return `S${entry.seasonNumber ?? 0} E${entry.episodeNumber ?? 0}  ${entry.name}`;
}

async function catalogItems(
  mac: string,
  list: PlaylistCredentials,
  kind: MediaKind,
  category: string | null,
): Promise<MediaEntry[]> {
  const key = `${mac}|${kind}|${category ?? ''}`;
  const cached = catalogs.get(key);
  if (cached && Date.now() - cached.at < cacheMs) return cached.items;
  const items = await loadStreams(list, kind, category);
  catalogs.set(key, { at: Date.now(), items });
  return items;
}

async function deviceList(mac: string): Promise<PlaylistCredentials> {
  const cached = lists.get(mac);
  if (cached && Date.now() - cached.at < cacheMs) return cached.list;
  const payload = await ping(mac);
  const license = licenseFromPayload(payload);
  if (license?.kind === 'expired' || payload.blocked === true) {
    throw new Error('A licença deste aparelho expirou');
  }
  const saved = playlistsFromPayload(payload).find((item) => playlistLoaded(item)) ?? null;
  const direct = openedAsXtream(playlistFromApi(payload));
  const list = saved ?? (playlistLoaded(direct) ? direct : null);
  if (!list) throw new Error('Nenhuma lista neste aparelho. Ative o MAC no SlimPlay.');
  lists.set(mac, { at: Date.now(), list });
  return list;
}

async function ping(mac: string) {
  let response: Response;
  try {
    response = await fetch(`${AppConfig.defaultApiBase}${AppConfig.pingPath}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ mac, device_key: deviceKeyFromId(mac) }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    throw new Error('Não foi possível falar com o painel');
  }
  const text = await response.text();
  if (response.status < 200 || response.status >= 300) throw new Error(panelMessage(text));
  const payload = jMap(text ? JSON.parse(text) : null);
  if (!payload || payload.success === false || payload.ok === false) throw new Error(panelMessage(text));
  return payload;
}

function panelMessage(body: string): string {
  try {
    const message = jString(jMap(JSON.parse(body))?.message);
    if (message) return message;
  } catch {
    // The panel sometimes answers with plain text.
  }
  return 'Aparelho não encontrado';
}

function requiredMac(search: URLSearchParams): string {
  const mac = formatAsMacAddress(search.get('mac'));
  if (!mac) throw new Error('Informe o MAC do aparelho');
  return mac;
}

function requiredKind(search: URLSearchParams): MediaKind {
  const kind = search.get('kind');
  if (kind === 'live' || kind === 'movie' || kind === 'series') return kind;
  throw new Error('Tipo inválido');
}

function clampOffset(value: string | null): number {
  const offset = Number.parseInt(value ?? '0', 10);
  if (!Number.isFinite(offset) || offset < 0) return 0;
  return offset;
}

function kindTitle(kind: MediaKind): string {
  if (kind === 'live') return 'TV ao vivo';
  if (kind === 'movie') return 'Filmes';
  return 'Séries';
}

function kindIcon(kind: MediaKind): string {
  if (kind === 'live') return 'msx-white:live-tv';
  if (kind === 'movie') return 'msx-white:movie';
  return 'msx-white:tv';
}

function imageOf(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return undefined;
}

function messagePage(message: string) {
  return {
    type: 'pages',
    headline: 'SLIM PLAY',
    items: [{ label: message }],
  };
}

function responseAction(action: string) {
  return { response: { status: 200, data: { action } } };
}

function ok(body: unknown): MsxResult {
  return { status: 200, body };
}

export function msxFailure(error: unknown): string {
  if (error instanceof CatalogException) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'Não foi possível carregar';
}
