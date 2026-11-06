import { useEffect, useState } from 'react';
import { useTr } from '../l10n/use-tr';
import { episodeLabel, type MediaEntry } from '../models/media';
import { flattenEpisodes, type SeriesDetail } from '../models/series';
import { listScope } from '../models/playlist';
import { useNav } from '../nav/navigation';
import { CatalogException, loadSeriesDetail } from '../services/xtream';
import { isFavorite, latestForSeries, toggleFavorite } from '../storage/library';
import { useSession } from '../state/session';
import { Icon } from './icons';

export function SeriesDetailScreen({
  entry,
  fixture,
}: {
  entry: MediaEntry;
  fixture?: SeriesDetail;
}) {
  const session = useSession();
  const text = useTr();
  const nav = useNav();
  const credentials = session.session;
  const scope = credentials ? listScope(credentials) : '';
  const [detail, setDetail] = useState<SeriesDetail | null>(fixture ?? null);
  const [seasonIndex, setSeasonIndex] = useState(0);
  const [loading, setLoading] = useState(!fixture);
  const [error, setError] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(() => isFavorite(scope, (fixture?.series ?? entry).id));

  useEffect(() => {
    if (fixture) return;
    if (!credentials) {
      setLoading(false);
      setError('Adicione uma lista na tela Listas.');
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void loadSeriesDetail(credentials, entry, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        setDetail(next);
        setSeasonIndex(0);
        setFavorite(isFavorite(scope, next.series.id));
        setLoading(false);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || isAbort(caught)) return;
        setDetail(null);
        setError(caught instanceof CatalogException ? caught.message : 'Série indisponível');
        setLoading(false);
      });
    return () => controller.abort();
  }, [credentials, entry, fixture, scope]);

  const series = detail?.series ?? entry;
  const seasons = detail?.seasons ?? [];
  const safeIndex = seasons.length === 0 ? 0 : Math.min(seasonIndex, seasons.length - 1);
  const episodes = seasons[safeIndex]?.episodes ?? [];
  const plot = series.plot?.trim() ? series.plot : 'Sinopse indisponível.';

  function play(episode?: MediaEntry) {
    const current = detail;
    if (!current) return;
    const queue = flattenEpisodes(current);
    if (queue.length === 0) {
      session.showToast('Nenhum episódio disponível');
      return;
    }
    const resume = latestForSeries(scope, current.series.sourceId);
    const target =
      episode ?? queue.find((item) => item.id === resume?.contentId) ?? queue[0];
    if (!target?.mediaUrl) {
      session.showToast('Conteúdo indisponível');
      return;
    }
    nav.openPlayer(target, { queue, autoNext: true });
  }

  function trailer() {
    const url = detail?.series.trailerUrl ?? entry.trailerUrl;
    if (!url) {
      session.showToast('Trailer indisponível');
      return;
    }
    const lower = url.toLowerCase();
    const direct = ['.m3u8', '.ts', '.mp4', '.mkv', '.webm'].some((type) => lower.includes(type));
    if (direct) {
      nav.openPlayer({
        ...entry,
        id: `${entry.id}:trailer`,
        name: 'Trailer',
        mediaUrl: url,
        kind: 'movie',
      });
      return;
    }
    const opened = window.open(url, '_blank', 'noopener');
    if (!opened) session.showToast('Trailer indisponível');
  }

  function favoritePressed() {
    if (!scope) {
      session.showToast(text('Adicione uma lista na tela Listas.'));
      return;
    }
    setFavorite(toggleFavorite(scope, series));
  }

  return (
    <main className="screen slim-bg series-screen">
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
          <h1>Série</h1>
        </header>
        <div className="screen-body series-body">
          <h2 className="series-title">{series.name}</h2>
          <p className="series-plot">{plot}</p>
          <div className="chip-row">
            <button
              type="button"
              className="chip"
              data-tv-focusable="true"
              data-tv-initial="true"
              onClick={() => play()}
            >
              <Icon name="play" />
              Jogar
            </button>
            <button type="button" className="chip" data-tv-focusable="true" onClick={trailer}>
              <Icon name="trailer" />
              Reproduzir Trailer
            </button>
            <button type="button" className="chip" data-tv-focusable="true" onClick={favoritePressed}>
              <Icon name={favorite ? 'star' : 'star-outline'} />
              {favorite ? 'Nos favoritos' : '+ Favoritos'}
            </button>
          </div>
          {loading ? <p className="catalog-status">Carregando episódios...</p> : null}
          {error ? <p className="catalog-status">{text(error)}</p> : null}
          {!loading && !error ? (
            <>
              <div className="season-row">
                {seasons.map((season, index) => (
                  <button
                    key={season.number}
                    type="button"
                    className={index === safeIndex ? 'season-chip is-selected' : 'season-chip'}
                    data-tv-focusable="true"
                    data-tv-row="seasons"
                    data-tv-index={index}
                    onClick={() => setSeasonIndex(index)}
                  >
                    Season {season.number}
                  </button>
                ))}
              </div>
              <div className="episode-row" key={`season-${safeIndex}`}>
                {episodes.map((episode, index) => {
                  const still = episode.posterUrl || series.posterUrl;
                  return (
                    <button
                      key={episode.id}
                      type="button"
                      className="episode-card"
                      data-tv-focusable="true"
                      data-tv-row="episodes"
                      data-tv-index={index}
                      onClick={() => play(episode)}
                    >
                      <Still url={still} />
                      <span className="episode-label">{episodeLabel(episode)}</span>
                      <span className="episode-name">{episode.name}</span>
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function Still({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <span className="episode-still episode-fallback" />;
  return <img className="episode-still" src={url} alt="" onError={() => setFailed(true)} />;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
