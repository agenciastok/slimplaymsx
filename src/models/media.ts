export type MediaKind = 'live' | 'movie' | 'series' | 'episode';

export interface CategoryFolder {
  id: string;
  name: string;
  pinned?: boolean;
}

export interface MediaEntry {
  id: string;
  sourceId: string;
  name: string;
  kind: MediaKind;
  posterUrl: string | null;
  categoryId: string | null;
  mediaUrl: string | null;
  plot: string | null;
  year: string | null;
  genre: string | null;
  backdropUrl?: string | null;
  categoryName?: string | null;
  durationSeconds?: number | null;
  addedAt?: number;
  containerExtension?: string | null;
  trailerUrl?: string | null;
  seasonNumber?: number | null;
  episodeNumber?: number | null;
  seriesId?: string | null;
  seriesName?: string | null;
  seriesPosterUrl?: string | null;
  resumePosition?: number;
  resumeDuration?: number;
}

export function episodeLabel(entry: MediaEntry): string {
  if (entry.seasonNumber == null && entry.episodeNumber == null) return entry.name;
  return `S${entry.seasonNumber ?? 0} E${entry.episodeNumber ?? 0}`;
}

export const CategoryIds = {
  all: '__all__',
  favorites: '__favorites__',
  recent: '__recent__',
  continueWatching: '__continue__',
  search: '__search__',
} as const;
