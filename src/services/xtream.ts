import { AppConfig } from '../core/config';
import { jInt, jString, type JsonMap } from '../core/json';
import { parseDuration, parseEpgTime, parseExpiry } from '../core/format';
import { decodeMaybeBase64 } from '../core/text';
import type { CategoryFolder, MediaEntry, MediaKind } from '../models/media';
import type { SeriesDetail } from '../models/series';
import { isDirectPlaylist, loadsReadyM3u, normalizeDns, usesM3uCatalog, type PlaylistCredentials } from '../models/playlist';
import { CatalogException } from './catalog-error';
import { catalogEntries, loadDirectCatalog } from './m3u';

export { CatalogException };

export interface AccountSnapshot {
  authorized: boolean;
  expiration: string | null;
  createdAt: string | null;
  status: string | null;
}

export async function loadAccount(
  credentials: PlaylistCredentials,
  signal?: AbortSignal,
): Promise<AccountSnapshot> {
  const decoded = await getJson(credentials, {}, signal);
  const map = asMap(decoded) ?? {};
  const info = asMap(map.user_info) ?? {};
  const auth = info.auth;
  const authorized = auth == null || auth === 1 || auth === '1' || auth === true;
  return {
    authorized,
    expiration: parseExpiry(info.exp_date)?.toISOString() ?? null,
    createdAt: parseExpiry(info.created_at)?.toISOString() ?? null,
    status: jString(info.status),
  };
}

export async function loadCategories(
  credentials: PlaylistCredentials,
  kind: MediaKind,
  signal?: AbortSignal,
): Promise<CategoryFolder[]> {
  if (usesM3uCatalog(credentials)) {
    if (kind !== 'live' && kind !== 'movie' && kind !== 'series') throw new CatalogException('Tipo inválido');
    const catalog = await loadDirectCatalog(credentials, signal);
    return catalog.categories[kind];
  }
  const decoded = await getJson(credentials, { action: categoryAction(kind) }, signal);
  if (!Array.isArray(decoded)) throw new CatalogException('Resposta inválida do servidor');
  const folders: CategoryFolder[] = [];
  for (const item of decoded) {
    const map = asMap(item);
    const id = jString(map?.category_id);
    if (!map || !id) continue;
    folders.push({ id, name: jString(map.category_name) ?? 'Sem nome' });
  }
  return folders;
}

export async function loadStreams(
  credentials: PlaylistCredentials,
  kind: MediaKind,
  categoryId: string | null,
  signal?: AbortSignal,
): Promise<MediaEntry[]> {
  if (usesM3uCatalog(credentials)) {
    const catalog = await loadDirectCatalog(credentials, signal);
    return catalogEntries(catalog, kind, categoryId);
  }
  const query: Record<string, string> = { action: streamAction(kind) };
  if (categoryId) query.category_id = categoryId;
  const decoded = await getJson(credentials, query, signal);
  if (asMap(decoded)?.user_info && !Array.isArray(decoded)) {
    throw new CatalogException(AppConfig.invalidAccess);
  }
  if (!Array.isArray(decoded)) throw new CatalogException('Resposta inválida do servidor');
  const entries: MediaEntry[] = [];
  for (const item of decoded) {
    const map = asMap(item);
    if (!map) continue;
    const entry = mapCatalogEntry(credentials, kind, map);
    if (entry) entries.push(entry);
  }
  return entries;
}

export interface EpgProgram {
  title: string;
  description: string;
  start: Date;
  end: Date;
}

export function programIsCurrent(program: EpgProgram, now = new Date()): boolean {
  return now >= program.start && now < program.end;
}

export async function loadEpg(
  credentials: PlaylistCredentials,
  sourceId: string,
  signal?: AbortSignal,
): Promise<EpgProgram[]> {
  if (isDirectPlaylist(credentials) || loadsReadyM3u(credentials)) return [];
  const decoded = await getJson(
    credentials,
    { action: 'get_short_epg', stream_id: sourceId, limit: '12' },
    signal,
  );
  const listings = asMap(decoded)?.epg_listings;
  if (!Array.isArray(listings)) return [];
  const programs: EpgProgram[] = [];
  for (const raw of listings) {
    const item = asMap(raw);
    if (!item) continue;
    const start = parseEpgTime(item.start_timestamp ?? item.start);
    const end = parseEpgTime(item.stop_timestamp ?? item.end);
    if (!start || !end) continue;
    programs.push({
      title: decodeMaybeBase64(jString(item.title) ?? 'Sem título'),
      description: decodeMaybeBase64(jString(item.description) ?? ''),
      start,
      end,
    });
  }
  programs.sort((left, right) => left.start.getTime() - right.start.getTime());
  return programs;
}

export async function loadMovieDetail(
  credentials: PlaylistCredentials,
  seed: MediaEntry,
  signal?: AbortSignal,
): Promise<MediaEntry> {
  if (isDirectPlaylist(credentials) || loadsReadyM3u(credentials)) return seed;
  const decoded = await getJson(credentials, { action: 'get_vod_info', vod_id: seed.sourceId }, signal);
  return movieFromPayload(credentials, seed, decoded);
}

export function movieFromPayload(
  credentials: PlaylistCredentials,
  seed: MediaEntry,
  decoded: unknown,
): MediaEntry {
  const map = asMap(decoded) ?? {};
  const info = asMap(map.info) ?? {};
  const movieData = asMap(map.movie_data) ?? {};
  const extension = jString(movieData.container_extension) ?? seed.containerExtension ?? 'mp4';
  return {
    ...seed,
    plot: jString(info.plot) ?? jString(info.description) ?? seed.plot,
    genre: jString(info.genre) ?? seed.genre,
    year: yearOf(info) ?? seed.year,
    durationSeconds: parseDuration(info.duration_secs ?? info.duration) ?? seed.durationSeconds ?? null,
    backdropUrl: backdropOf(info) ?? seed.backdropUrl ?? seed.posterUrl,
    posterUrl: jString(info.movie_image) ?? jString(info.cover_big) ?? seed.posterUrl,
    containerExtension: extension,
    trailerUrl: trailerUrl(info.youtube_trailer) ?? seed.trailerUrl,
    mediaUrl: mediaUrl(credentials, 'movie', seed.sourceId, extension),
  };
}

export async function loadSeriesDetail(
  credentials: PlaylistCredentials,
  seed: MediaEntry,
  signal?: AbortSignal,
): Promise<SeriesDetail> {
  if (isDirectPlaylist(credentials) || loadsReadyM3u(credentials)) {
    if (!seed.mediaUrl) throw new CatalogException('Série indisponível');
    return singleEpisode(seed);
  }
  try {
    const decoded = await getJson(
      credentials,
      { action: 'get_series_info', series_id: seed.sourceId },
      signal,
    );
    return seriesDetailFromPayload(credentials, seed, decoded);
  } catch (error) {
    if (isAbort(error)) throw error;
    if (seed.mediaUrl) return singleEpisode(seed);
    throw error;
  }
}

export function seriesDetailFromPayload(
  credentials: PlaylistCredentials,
  seed: MediaEntry,
  decoded: unknown,
): SeriesDetail {
  const map = asMap(decoded);
  if (!map) throw new CatalogException('Série indisponível');
  const info = asMap(map.info) ?? {};
  const series: MediaEntry = {
    ...seed,
    name: jString(info.name) ?? seed.name,
    plot: jString(info.plot) ?? seed.plot,
    genre: jString(info.genre) ?? seed.genre,
    year: yearOf(info) ?? seed.year,
    posterUrl: jString(info.cover) ?? seed.posterUrl,
    backdropUrl: backdropOf(info) ?? seed.backdropUrl ?? seed.posterUrl,
    trailerUrl: trailerUrl(info.youtube_trailer) ?? seed.trailerUrl,
  };
  const seasons = seasonsFrom(credentials, series, map.episodes);
  if (seasons.length === 0 && seed.mediaUrl) return singleEpisode(seed);
  return { series, seasons };
}

function mapCatalogEntry(
  credentials: PlaylistCredentials,
  kind: MediaKind,
  object: JsonMap,
): MediaEntry | null {
  if (kind === 'live' || kind === 'movie') {
    const id = jString(object.stream_id);
    if (!id) return null;
    const extension = jString(object.container_extension) ?? (kind === 'live' ? 'ts' : 'mp4');
    return {
      id: `${kind}:${id}`,
      sourceId: id,
      name: jString(object.name) ?? (kind === 'live' ? 'Canal' : 'Filme'),
      kind,
      posterUrl:
        jString(object.stream_icon) ?? jString(object.cover) ?? jString(object.movie_image),
      categoryId: jString(object.category_id),
      mediaUrl: mediaUrl(credentials, kind, id, extension),
      plot: jString(object.plot),
      year: jString(object.year),
      genre: jString(object.genre),
    };
  }
  if (kind === 'series') {
    const id = jString(object.series_id);
    if (!id) return null;
    return {
      id: `series:${id}`,
      sourceId: id,
      name: jString(object.name) ?? 'Série',
      kind,
      posterUrl: jString(object.cover) ?? jString(object.stream_icon) ?? jString(object.movie_image),
      backdropUrl: backdropOf(object),
      categoryId: jString(object.category_id),
      mediaUrl: null,
      plot: jString(object.plot),
      year: yearOf(object),
      genre: jString(object.genre),
      trailerUrl: trailerUrl(object.youtube_trailer),
      seriesId: id,
    };
  }
  return null;
}

function mediaUrl(
  credentials: PlaylistCredentials,
  kind: 'live' | 'movie',
  id: string,
  extension: string,
): string {
  const root = normalizeDns(credentials.dnsUrl);
  const user = encodeURIComponent(credentials.username);
  const pass = encodeURIComponent(credentials.password);
  const folder = kind === 'live' ? 'live' : 'movie';
  return `${root}/${folder}/${user}/${pass}/${id}.${extension}`;
}

function categoryAction(kind: MediaKind): string {
  if (kind === 'live') return 'get_live_categories';
  if (kind === 'movie') return 'get_vod_categories';
  if (kind === 'series') return 'get_series_categories';
  throw new CatalogException('Tipo inválido');
}

function streamAction(kind: MediaKind): string {
  if (kind === 'live') return 'get_live_streams';
  if (kind === 'movie') return 'get_vod_streams';
  if (kind === 'series') return 'get_series';
  throw new CatalogException('Tipo inválido');
}

async function getJson(
  credentials: PlaylistCredentials,
  query: Record<string, string>,
  signal?: AbortSignal,
): Promise<unknown> {
  const root = normalizeDns(credentials.dnsUrl);
  const url = new URL(`${root}/player_api.php`);
  url.searchParams.set('username', credentials.username);
  url.searchParams.set('password', credentials.password);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: signal ?? AbortSignal.timeout(25000),
    });
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new CatalogException('Falha ao falar com o servidor');
  }
  if (response.status < 200 || response.status >= 300) {
    throw new CatalogException('Falha ao falar com o servidor');
  }
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CatalogException('Resposta inválida do servidor');
  }
}

function seasonsFrom(
  credentials: PlaylistCredentials,
  series: MediaEntry,
  episodes: unknown,
): SeriesDetail['seasons'] {
  if (!episodes || typeof episodes !== 'object' || Array.isArray(episodes)) return [];
  const seasons: SeriesDetail['seasons'] = [];
  for (const [key, rawList] of Object.entries(episodes)) {
    if (!Array.isArray(rawList)) continue;
    const seasonNumber = Number.parseInt(key, 10);
    const number = Number.isNaN(seasonNumber) ? 0 : seasonNumber;
    const items: MediaEntry[] = [];
    for (const raw of rawList) {
      const episode = mapEpisode(credentials, raw, series, number);
      if (episode) items.push(episode);
    }
    items.sort((left, right) => (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0));
    if (items.length > 0) seasons.push({ number, episodes: items });
  }
  seasons.sort((left, right) => left.number - right.number);
  return seasons;
}

function mapEpisode(
  credentials: PlaylistCredentials,
  raw: unknown,
  series: MediaEntry,
  seasonNumber: number,
): MediaEntry | null {
  const episode = asMap(raw);
  const id = jString(episode?.id);
  if (!episode || !id) return null;
  const info = asMap(episode.info) ?? {};
  const extension = jString(episode.container_extension) ?? 'mkv';
  const number = jInt(episode.episode_num);
  return {
    id: `episode:${id}`,
    sourceId: id,
    name: jString(episode.title) ?? `Episódio ${number}`,
    kind: 'episode',
    posterUrl: episodeStill(episode, info) ?? series.posterUrl,
    categoryId: series.categoryId,
    mediaUrl: seriesUrl(credentials, id, extension),
    plot: jString(info.plot),
    year: null,
    genre: null,
    durationSeconds: parseDuration(info.duration_secs ?? info.duration),
    seasonNumber,
    episodeNumber: number,
    seriesId: series.sourceId,
    seriesName: series.name,
    seriesPosterUrl: series.posterUrl,
    categoryName: series.categoryName,
    containerExtension: extension,
    addedAt: jInt(episode.added),
  };
}

function episodeStill(episode: JsonMap, info: JsonMap): string | null {
  for (const raw of [
    info.movie_image,
    info.cover_big,
    info.still_path,
    episode.stream_icon,
    episode.cover,
    info.cover,
  ]) {
    const value = jString(raw);
    if (value) return value;
  }
  return null;
}

function singleEpisode(seed: MediaEntry): SeriesDetail {
  const episode: MediaEntry = {
    ...seed,
    kind: 'episode',
    seriesName: seed.seriesName ?? seed.name,
    seasonNumber: seed.seasonNumber ?? 1,
    episodeNumber: seed.episodeNumber ?? 1,
  };
  return {
    series: seed,
    seasons: [{ number: episode.seasonNumber ?? 1, episodes: [episode] }],
  };
}

function seriesUrl(credentials: PlaylistCredentials, id: string, extension: string): string {
  const root = normalizeDns(credentials.dnsUrl);
  const user = encodeURIComponent(credentials.username);
  const pass = encodeURIComponent(credentials.password);
  return `${root}/series/${user}/${pass}/${id}.${extension}`;
}

function trailerUrl(raw: unknown): string | null {
  const value = jString(raw);
  if (!value) return null;
  if (value.startsWith('http://') || value.startsWith('https://')) return value;
  return `https://www.youtube.com/watch?v=${value}`;
}

function backdropOf(info: JsonMap): string | null {
  const path = info.backdrop_path;
  if (Array.isArray(path) && path.length > 0) return jString(path[0]);
  return jString(path) ?? jString(info.cover);
}

function yearOf(object: JsonMap): string | null {
  const release = jString(object.releaseDate) ?? jString(object.releasedate) ?? jString(object.year);
  if (!release) return null;
  return release.match(/\d{4}/)?.[0] ?? release;
}

function asMap(value: unknown): JsonMap | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as JsonMap;
  return null;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
