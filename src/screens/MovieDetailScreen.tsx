import { useEffect, useState } from 'react';
import { formatDuration } from '../core/format';
import { useTr } from '../l10n/use-tr';
import type { MediaEntry } from '../models/media';
import { listScope } from '../models/playlist';
import { useNav } from '../nav/navigation';
import { loadMovieDetail } from '../services/xtream';
import { isFavorite, toggleFavorite } from '../storage/library';
import { useSession } from '../state/session';
import { Icon } from './icons';

export function MovieDetailScreen({ entry }: { entry: MediaEntry }) {
  const session = useSession();
  const text = useTr();
  const nav = useNav();
  const credentials = session.session;
  const scope = credentials ? listScope(credentials) : '';
  const [movie, setMovie] = useState(entry);
  const [favorite, setFavorite] = useState(() => isFavorite(scope, entry.id));

  useEffect(() => {
    if (!credentials) return;
    const controller = new AbortController();
    void loadMovieDetail(credentials, entry, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setMovie(next);
        setFavorite(isFavorite(scope, next.id));
      })
      .catch((caught: unknown) => {
        if (isAbort(caught)) return;
      });
    return () => controller.abort();
  }, [credentials, entry, scope]);

  const plot = movie.plot?.trim() ? movie.plot : 'Sinopse indisponível.';
  const meta = [movie.year?.trim() || null, formatDuration(movie.durationSeconds), movie.genre?.trim() || null]
    .filter((item): item is string => Boolean(item) && item !== '—')
    .join('  ·  ');

  function watch() {
    if (!movie.mediaUrl) {
      session.showToast('Conteúdo indisponível');
      return;
    }
    nav.openPlayer(movie);
  }

  function favoritePressed() {
    if (!scope) {
      session.showToast(text('Adicione uma lista na tela Listas.'));
      return;
    }
    setFavorite(toggleFavorite(scope, movie));
  }

  return (
    <main className="screen slim-bg series-screen movie-screen">
      <div className="series-shade">
        <header className="screen-header">
          <button
            type="button"
            className="icon-button surface-button"
            data-tv-focusable="true"
            onClick={nav.pop}
            aria-label="Voltar"
          >
            <Icon name="back" />
          </button>
          <h1>Filme</h1>
        </header>
        <div className="screen-body series-body">
          <h2 className="series-title">{movie.name}</h2>
          {meta ? <p className="movie-meta">{meta}</p> : null}
          <p className="series-plot">{plot}</p>
          <div className="chip-row">
            <button
              type="button"
              className="chip"
              data-tv-focusable="true"
              data-tv-initial="true"
              onClick={watch}
            >
              <Icon name="play" />
              Assistir
            </button>
            <button type="button" className="chip" data-tv-focusable="true" onClick={favoritePressed}>
              <Icon name={favorite ? 'star' : 'star-outline'} />
              {favorite ? 'Nos favoritos' : '+ Favoritos'}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
