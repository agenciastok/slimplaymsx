import type { MediaEntry } from '../models/media';
import type { SeriesDetail } from '../models/series';
import type { PlaylistCredentials } from '../models/playlist';
import { seriesDetailFromPayload } from '../services/xtream';

const flower = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
const feature =
  'https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.480p.vp9.webm';
const still = 'https://upload.wikimedia.org/wikipedia/commons/4/41/Sunflower_from_Silesia2.jpg';

/** Development-only series used to exercise the detail screen without a playlist. */
export function sampleSeriesDetail(): SeriesDetail {
  const seed: MediaEntry = {
    id: 'series:sample',
    sourceId: 'sample',
    name: 'Série de amostra',
    kind: 'series',
    posterUrl: still,
    categoryId: null,
    mediaUrl: null,
    plot: null,
    year: '1990',
    genre: null,
  };
  const credentials: PlaylistCredentials = {
    dnsUrl: 'https://example.test',
    username: 'amostra',
    password: 'amostra',
    name: 'Amostra',
    code: '',
    playlistType: 'xtream',
    m3uUrl: '',
    listId: 0,
    partnerDns: false,
    dnsStatus: null,
    dnsExpiresAt: null,
    expiration: null,
    status: null,
  };
  const detail = seriesDetailFromPayload(credentials, seed, {
    info: {
      name: 'Série de amostra (1990)',
      plot: 'Uma temporada curta para conferir temporadas, episódios e a reprodução em sequência.',
      year: '1990',
      cover: still,
      youtube_trailer: flower,
    },
    episodes: {
      '1': [episode('101', 1, 'Série de amostra - S01E01 - Capítulo de abertura da temporada'), episode('102', 2, 'Série de amostra - S01E02 - O capítulo que continua a história')],
      '2': [episode('201', 1, 'Série de amostra - S02E01 - Outra temporada')],
    },
  });
  const first = detail.seasons[0]?.episodes ?? [];
  if (first[0]) first[0].mediaUrl = flower;
  if (first[1]) first[1].mediaUrl = feature;
  const second = detail.seasons[1]?.episodes[0];
  if (second) second.mediaUrl = flower;
  return detail;
}

function episode(id: string, number: number, title: string) {
  return {
    id,
    title,
    episode_num: number,
    container_extension: 'mp4',
    info: { movie_image: still },
  };
}
