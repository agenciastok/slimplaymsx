import type { MediaEntry } from './media';

export interface SeasonBucket {
  number: number;
  episodes: MediaEntry[];
}

export interface SeriesDetail {
  series: MediaEntry;
  seasons: SeasonBucket[];
}

export function flattenEpisodes(detail: SeriesDetail): MediaEntry[] {
  const seasons = [...detail.seasons].sort((left, right) => left.number - right.number);
  const flat: MediaEntry[] = [];
  for (const season of seasons) {
    const episodes = [...season.episodes].sort(
      (left, right) => (left.episodeNumber ?? 0) - (right.episodeNumber ?? 0),
    );
    flat.push(...episodes);
  }
  return flat;
}
