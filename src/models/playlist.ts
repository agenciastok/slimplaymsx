import { parseExpiry, toIso } from '../core/format';
import { jInt, jString, type JsonMap } from '../core/json';

export interface PlaylistCredentials {
  dnsUrl: string;
  username: string;
  password: string;
  name: string;
  code: string;
  playlistType: string;
  m3uUrl: string;
  listId: number;
  partnerDns: boolean;
  dnsStatus: boolean | null;
  dnsExpiresAt: string | null;
  expiration: string | null;
  status: string | null;
}

export function isDirectPlaylist(list: PlaylistCredentials): boolean {
  return list.playlistType === 'url';
}

const reviewListCode = '780435';
const reviewListUser = 'reviewtest';
const reviewListPassword = 'testpassword976';

/** Código de revisão das lojas. A DNS já é a M3U completa. */
export function loadsReadyM3u(list: PlaylistCredentials): boolean {
  return (
    list.code.trim() === reviewListCode &&
    list.username.trim() === reviewListUser &&
    list.password.trim() === reviewListPassword
  );
}

export function usesM3uCatalog(list: PlaylistCredentials): boolean {
  return isDirectPlaylist(list) || loadsReadyM3u(list);
}

/** Arquivo M3U quando a lista não abre pelo player Xtream. */
export function directM3uUrl(list: PlaylistCredentials): string {
  if (loadsReadyM3u(list)) return list.m3uUrl.trim() || list.dnsUrl.trim();
  return list.m3uUrl.trim();
}

/** Isola favoritos e retomada desta lista. */
export function listScope(list: PlaylistCredentials): string {
  if (isDirectPlaylist(list)) return `url|${list.m3uUrl}`;
  if (list.playlistType === 'xtream') return `xtream|${list.username}|${list.dnsUrl}`;
  const id = list.code.trim() || list.username;
  return `${id}|${list.username}|${list.dnsUrl}`;
}

export function playlistLoaded(list: PlaylistCredentials | null | undefined): boolean {
  if (!list) return false;
  if (isDirectPlaylist(list)) return list.m3uUrl.trim().length > 0;
  return list.dnsUrl.length > 0 && list.username.length > 0 && list.password.length > 0;
}

export function listName(list: PlaylistCredentials): string {
  const value = list.name.trim();
  if (value) return value;
  const partner = list.code.trim();
  return partner || list.username;
}

export function copyPlaylist(
  list: PlaylistCredentials,
  patch: Partial<PlaylistCredentials> & { clearExpiration?: boolean },
): PlaylistCredentials {
  const { clearExpiration, ...rest } = patch;
  return {
    ...list,
    ...rest,
    expiration: clearExpiration ? null : rest.expiration ?? list.expiration,
  };
}

export function playlistFromJson(json: JsonMap): PlaylistCredentials {
  return openedAsXtream({
    dnsUrl: normalizeDns(jString(json.dnsUrl) ?? ''),
    username: jString(json.username) ?? '',
    password: jString(json.password) ?? '',
    name: jString(json.name) ?? '',
    code: jString(json.code) ?? '',
    playlistType: jString(json.playlistType) ?? '',
    m3uUrl: jString(json.m3uUrl) ?? '',
    listId: jInt(json.listId),
    partnerDns: json.partnerDns === true,
    dnsStatus: json.dnsStatus === true ? true : json.dnsStatus === false ? false : null,
    dnsExpiresAt: toIso(parseExpiry(json.dnsExpiresAt)),
    expiration: toIso(parseExpiry(json.expiration)),
    status: jString(json.status),
  });
}

export function playlistFromApi(json: JsonMap): PlaylistCredentials {
  const nested = jMapSafe(json.data);
  const source = nested ?? json;
  return {
    dnsUrl: normalizeDns(
      jString(source.dns_url) ?? jString(source.dns) ?? jString(source.server_url) ?? '',
    ),
    username: jString(source.username) ?? jString(source.user) ?? '',
    password: jString(source.password) ?? jString(source.pass) ?? '',
    name: jString(source.playlist_name) ?? '',
    code: jString(source.partner_code) ?? '',
    playlistType: '',
    m3uUrl: '',
    listId: 0,
    partnerDns: false,
    dnsStatus: null,
    dnsExpiresAt: null,
    expiration: toIso(parseExpiry(source.exp_date ?? source.expiration ?? source.expiry)),
    status: jString(source.status),
  };
}

export function playlistFromServer(json: JsonMap): PlaylistCredentials {
  const type = (jString(json.playlist_type) ?? '').toLowerCase();
  const dnsId = json.dns_id;
  const partner = dnsId != null && String(dnsId).trim() !== '';
  const m3u = jString(json.m3u_url) ?? '';
  const name = jString(json.playlist_name) ?? '';
  const code = jString(json.partner_code) ?? '';
  const username = jString(json.username) ?? '';
  const password = jString(json.password) ?? '';
  const listId = jInt(json.id);
  if (partner) {
    return withServerLicense(
      {
        dnsUrl: normalizeDns(jString(json.dns_url) ?? ''),
        username,
        password,
        name,
        code,
        playlistType: 'partner',
        m3uUrl: '',
        listId,
        partnerDns: false,
        dnsStatus: null,
        dnsExpiresAt: null,
        expiration: null,
        status: null,
      },
      json,
    );
  }
  if (type === 'url') {
    return withServerLicense(
      openedAsXtream({
        dnsUrl: m3u,
        username,
        password,
        name,
        code,
        playlistType: 'url',
        m3uUrl: m3u,
        listId,
        partnerDns: false,
        dnsStatus: null,
        dnsExpiresAt: null,
        expiration: null,
        status: null,
      }),
      json,
    );
  }
  if (type === 'xtream') {
    return withServerLicense(
      {
        dnsUrl: portalBase(m3u),
        username,
        password,
        name,
        code,
        playlistType: 'xtream',
        m3uUrl: m3u,
        listId,
        partnerDns: false,
        dnsStatus: null,
        dnsExpiresAt: null,
        expiration: null,
        status: null,
      },
      json,
    );
  }
  return emptyPlaylist();
}

export function playlistsFromPayload(payload: JsonMap): PlaylistCredentials[] {
  const raw = payload.lists;
  if (!Array.isArray(raw)) return [];
  const items: PlaylistCredentials[] = [];
  for (const item of raw) {
    const map = jMapSafe(item);
    if (!map) continue;
    const list = playlistFromServer(map);
    if (playlistLoaded(list)) items.push(list);
  }
  return items;
}

export function openedAsXtream(list: PlaylistCredentials): PlaylistCredentials {
  if (!isDirectPlaylist(list)) return list;
  const source = list.m3uUrl.trim() || list.dnsUrl;
  let uri: URL;
  try {
    uri = new URL(source);
  } catch {
    return list;
  }
  if (!uri.host) return list;
  const user = (uri.searchParams.get('username') ?? uri.searchParams.get('user') ?? list.username).trim();
  const pass = (uri.searchParams.get('password') ?? uri.searchParams.get('pass') ?? list.password).trim();
  if (!user || !pass) return list;
  return {
    ...list,
    dnsUrl: portalBase(source),
    username: user,
    password: pass,
    playlistType: 'xtream',
  };
}

export function samePlaylist(
  active: PlaylistCredentials | null,
  item: PlaylistCredentials,
): boolean {
  if (!active) return false;
  if (active.m3uUrl && active.m3uUrl === item.m3uUrl) return true;
  if (isDirectPlaylist(active) || isDirectPlaylist(item)) return false;
  return active.username === item.username && active.dnsUrl === item.dnsUrl;
}

export function normalizeDns(raw: string): string {
  let value = raw.trim();
  if (value.endsWith('/')) value = value.slice(0, -1);
  value = value.replace(/\/player_api\.php$/, '');
  value = value.replace(/\/get\.php$/, '');
  return value;
}

export function portalBase(raw: string): string {
  try {
    const uri = new URL(raw.trim());
    if (!uri.host) return normalizeDns(raw);
    const port = uri.port ? `:${uri.port}` : '';
    return normalizeDns(`${uri.protocol}//${uri.hostname}${port}`);
  } catch {
    return normalizeDns(raw);
  }
}

function withServerLicense(list: PlaylistCredentials, json: JsonMap): PlaylistCredentials {
  const status = json.dns_status;
  return {
    ...list,
    partnerDns: json.partner_dns === true,
    dnsStatus: status === true ? true : status === false ? false : null,
    dnsExpiresAt: toIso(parseExpiry(json.dns_expires_at)),
  };
}

function emptyPlaylist(): PlaylistCredentials {
  return {
    dnsUrl: '',
    username: '',
    password: '',
    name: '',
    code: '',
    playlistType: '',
    m3uUrl: '',
    listId: 0,
    partnerDns: false,
    dnsStatus: null,
    dnsExpiresAt: null,
    expiration: null,
    status: null,
  };
}

function jMapSafe(value: unknown): JsonMap | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonMap;
  return null;
}
