import { jInt, jIntOrNull, jString, jMap } from '../core/json';
import type { MediaEntry, MediaKind } from '../models/media';
import { getLocalStore } from './local-store';

export interface WatchProgress {
  contentId: string;
  sourceId: string;
  title: string;
  kind: MediaKind;
  positionSeconds: number;
  durationSeconds: number;
  mediaUrl: string;
  updatedAt: string;
  posterUrl: string | null;
  seriesId: string | null;
  seriesName: string | null;
  seriesPosterUrl: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  containerExtension: string | null;
  categoryId: string | null;
  categoryName: string | null;
}

export function isResumable(item: WatchProgress): boolean {
  return (
    item.positionSeconds > 5 &&
    item.durationSeconds > 0 &&
    item.positionSeconds < item.durationSeconds * 0.95
  );
}

export function isFavorite(scope: string, id: string): boolean {
  return readFavorites(scope).some((item) => item.id === id);
}

export function toggleFavorite(scope: string, entry: MediaEntry): boolean {
  if (!scope) return false;
  const current = readFavorites(scope);
  const index = current.findIndex((item) => item.id === entry.id);
  if (index >= 0) current.splice(index, 1);
  else current.unshift(entry);
  writeJson(`favorites:${scope}`, current);
  return index < 0;
}

export function favoritesOf(scope: string, kind: MediaKind): MediaEntry[] {
  return readFavorites(scope).filter((item) => item.kind === kind);
}

export function recentChannels(scope: string): MediaEntry[] {
  return readRecent(scope).filter((item) => item.kind === 'live');
}

export function rememberRecent(scope: string, entry: MediaEntry): void {
  if (!scope || entry.kind !== 'live' || !entry.id) return;
  const current = readRecent(scope).filter((item) => item.id !== entry.id);
  current.unshift(entry);
  writeJson(`recent:${scope}`, current.slice(0, 20));
}

export function latestForSeries(scope: string, seriesId: string): WatchProgress | null {
  let latest: WatchProgress | null = null;
  for (const item of readProgress(scope)) {
    if (item.seriesId !== seriesId || !isResumable(item)) continue;
    if (!latest || item.updatedAt > latest.updatedAt) latest = item;
  }
  return latest;
}

export function progressForEntry(scope: string, entry: MediaEntry): WatchProgress | null {
  if (!scope) return null;
  const progress = readProgress(scope);
  const direct = progress.find((item) => item.contentId === entry.id);
  if (direct) return direct;
  if (!entry.sourceId) return null;
  let match: WatchProgress | null = null;
  for (const item of progress) {
    if (item.sourceId !== entry.sourceId || item.kind !== entry.kind) continue;
    if (!match || item.updatedAt > match.updatedAt) match = item;
  }
  return match;
}

export function saveProgress(scope: string, progress: WatchProgress): void {
  if (!scope || !isResumable(progress)) return;
  const current = readProgress(scope);
  const index = current.findIndex((item) => item.contentId === progress.contentId);
  if (index >= 0) current[index] = progress;
  else current.push(progress);
  current.sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1));
  writeJson(`progress:${scope}`, current.slice(0, 200));
}

export function continueWatching(scope: string, kind: MediaKind): MediaEntry[] {
  if (!scope) return [];
  const progress = readProgress(scope).filter(isResumable);
  if (kind !== 'series') {
    return progress.filter((item) => item.kind === kind).map(progressToEntry);
  }
  const latest = new Map<string, WatchProgress>();
  for (const item of progress) {
    if (item.kind !== 'episode') continue;
    const key = item.seriesId ? `series:${item.seriesId}` : `episode:${item.contentId}`;
    const current = latest.get(key);
    if (!current || item.updatedAt > current.updatedAt) latest.set(key, item);
  }
  return [...latest.values()]
    .sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : -1))
    .map(progressToEntry);
}

export function removeProgress(scope: string, contentId: string): void {
  if (!scope) return;
  writeJson(
    `progress:${scope}`,
    readProgress(scope).filter((item) => item.contentId !== contentId),
  );
}

export function clearFavoritesKind(scope: string, kind: MediaKind): void {
  if (!scope) return;
  writeJson(
    `favorites:${scope}`,
    readFavorites(scope).filter((item) => item.kind !== kind),
  );
}

export function clearWatchedKind(scope: string, series: boolean): void {
  if (!scope) return;
  writeJson(
    `progress:${scope}`,
    readProgress(scope).filter((item) =>
      series ? item.kind !== 'episode' && item.kind !== 'series' : item.kind !== 'movie',
    ),
  );
}

export function clearScopeLibrary(scope: string): void {
  if (!scope) return;
  writeJson(`favorites:${scope}`, []);
  writeJson(`recent:${scope}`, []);
  writeJson(`progress:${scope}`, []);
}

export function progressFromEntry(
  entry: MediaEntry,
  positionSeconds: number,
  durationSeconds: number,
): WatchProgress | null {
  if (!entry.mediaUrl || entry.kind === 'live') return null;
  return {
    contentId: entry.id,
    sourceId: entry.sourceId,
    title: entry.name,
    kind: entry.kind,
    positionSeconds,
    durationSeconds,
    mediaUrl: entry.mediaUrl,
    updatedAt: new Date().toISOString(),
    posterUrl: entry.posterUrl,
    seriesId: entry.seriesId ?? null,
    seriesName: entry.seriesName ?? null,
    seriesPosterUrl: entry.seriesPosterUrl ?? null,
    seasonNumber: entry.seasonNumber ?? null,
    episodeNumber: entry.episodeNumber ?? null,
    containerExtension: entry.containerExtension ?? null,
    categoryId: entry.categoryId,
    categoryName: entry.categoryName ?? null,
  };
}

function progressToEntry(item: WatchProgress): MediaEntry {
  return {
    id: item.contentId,
    sourceId: item.sourceId,
    name: item.title,
    kind: item.kind,
    posterUrl: item.seriesPosterUrl || item.posterUrl,
    categoryId: item.categoryId,
    mediaUrl: item.mediaUrl,
    plot: null,
    year: null,
    genre: null,
    durationSeconds: item.durationSeconds,
    containerExtension: item.containerExtension,
    categoryName: item.categoryName,
    seasonNumber: item.seasonNumber,
    episodeNumber: item.episodeNumber,
    seriesId: item.seriesId,
    seriesName: item.seriesName,
    seriesPosterUrl: item.seriesPosterUrl,
    resumePosition: item.positionSeconds,
    resumeDuration: item.durationSeconds,
  };
}

function readRecent(scope: string): MediaEntry[] {
  if (!scope) return [];
  return readJson(`recent:${scope}`)
    .map(entryFromJson)
    .filter((item): item is MediaEntry => item != null);
}

function readFavorites(scope: string): MediaEntry[] {
  if (!scope) return [];
  return readJson(`favorites:${scope}`)
    .map(entryFromJson)
    .filter((item): item is MediaEntry => item != null);
}

function readProgress(scope: string): WatchProgress[] {
  if (!scope) return [];
  return readJson(`progress:${scope}`)
    .map(progressFromJson)
    .filter((item): item is WatchProgress => item != null);
}

function readJson(key: string): unknown[] {
  const raw = getLocalStore().read('library', key);
  if (!raw) return [];
  try {
    const decoded: unknown = JSON.parse(raw);
    return Array.isArray(decoded) ? decoded : [];
  } catch {
    return [];
  }
}

function writeJson(key: string, value: unknown): void {
  getLocalStore().write('library', key, JSON.stringify(value));
}

function entryFromJson(value: unknown): MediaEntry | null {
  const map = jMap(value);
  const id = jString(map?.id);
  const kind = mediaKind(map?.kind);
  if (!map || !id || !kind) return null;
  return {
    id,
    sourceId: jString(map.sourceId) ?? '',
    name: jString(map.name) ?? 'Sem nome',
    kind,
    posterUrl: jString(map.posterUrl),
    categoryId: jString(map.categoryId),
    mediaUrl: jString(map.mediaUrl),
    plot: jString(map.plot),
    year: jString(map.year),
    genre: jString(map.genre),
    backdropUrl: jString(map.backdropUrl),
    categoryName: jString(map.categoryName),
    durationSeconds: map.durationSeconds == null ? null : jInt(map.durationSeconds),
    addedAt: jInt(map.addedAt),
    containerExtension: jString(map.containerExtension),
    trailerUrl: jString(map.trailerUrl),
    seasonNumber: map.seasonNumber == null ? null : jInt(map.seasonNumber),
    episodeNumber: map.episodeNumber == null ? null : jInt(map.episodeNumber),
    seriesId: jString(map.seriesId),
    seriesName: jString(map.seriesName),
    seriesPosterUrl: jString(map.seriesPosterUrl),
    resumePosition: jInt(map.resumePosition),
    resumeDuration: jInt(map.resumeDuration),
  };
}

function progressFromJson(value: unknown): WatchProgress | null {
  const map = jMap(value);
  const contentId = jString(map?.contentId);
  const kind = mediaKind(map?.kind);
  const mediaUrl = jString(map?.mediaUrl);
  if (!map || !contentId || !kind || !mediaUrl) return null;
  return {
    contentId,
    sourceId: jString(map.sourceId) ?? '',
    title: jString(map.title) ?? 'Sem nome',
    kind,
    positionSeconds: jInt(map.positionSeconds),
    durationSeconds: jInt(map.durationSeconds),
    mediaUrl,
    updatedAt: jString(map.updatedAt) ?? '',
    posterUrl: jString(map.posterUrl),
    seriesId: jString(map.seriesId),
    seriesName: jString(map.seriesName),
    seriesPosterUrl: jString(map.seriesPosterUrl),
    seasonNumber: jIntOrNull(map.seasonNumber),
    episodeNumber: jIntOrNull(map.episodeNumber),
    containerExtension: jString(map.containerExtension),
    categoryId: jString(map.categoryId),
    categoryName: jString(map.categoryName),
  };
}

function mediaKind(value: unknown): MediaKind | null {
  const kind = jString(value);
  if (kind === 'live' || kind === 'movie' || kind === 'series' || kind === 'episode') return kind;
  return null;
}
