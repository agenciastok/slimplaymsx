import type { MediaEntry } from '../models/media';

const feature =
  'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.480p.vp9.webm';
const flower = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

/** Development-only channels used to exercise zap without a playlist. */
export function sampleChannels(): MediaEntry[] {
  return [
    channel('1', 'Canal Um', feature),
    channel('2', 'Canal Dois', feature),
    channel('3', 'Canal Três', flower),
  ];
}

function channel(id: string, name: string, mediaUrl: string): MediaEntry {
  return {
    id: `live:${id}`,
    sourceId: id,
    name,
    kind: 'live',
    posterUrl: null,
    categoryId: null,
    mediaUrl,
    plot: null,
    year: null,
    genre: null,
  };
}
