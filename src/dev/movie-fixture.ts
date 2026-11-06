import type { MediaEntry } from '../models/media';
import type { PlaylistCredentials } from '../models/playlist';
import { movieFromPayload } from '../services/xtream';

const flower = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

/** Development-only movie used to exercise the detail screen without a playlist. */
export function sampleMovie(): MediaEntry {
  const seed: MediaEntry = {
    id: 'movie:sample',
    sourceId: 'sample',
    name: 'Filme de amostra',
    kind: 'movie',
    posterUrl: null,
    categoryId: null,
    mediaUrl: null,
    plot: null,
    year: null,
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
  const detail = movieFromPayload(credentials, seed, {
    info: {
      name: 'Filme de amostra',
      plot: 'Uma ficha curta para conferir ano, duração, gênero e o botão de assistir.',
      year: '1998',
      genre: 'Aventura',
      duration_secs: 6120,
    },
    movie_data: { container_extension: 'mp4' },
  });
  return { ...detail, name: 'Filme de amostra', mediaUrl: flower };
}
