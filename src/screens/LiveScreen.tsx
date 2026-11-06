import { useEffect, useRef, useState } from 'react';
import { rememberAdultFolders } from '../core/adult';
import { AppConfig } from '../core/config';
import { foldAscii } from '../core/text';
import { formatClock } from '../core/format';
import { useTr } from '../l10n/use-tr';
import { CategoryIds, type CategoryFolder, type MediaEntry } from '../models/media';
import { listScope } from '../models/playlist';
import { useNav } from '../nav/navigation';
import { AvPlayEngine } from '../player/avplay-engine';
import { Html5Engine } from '../player/html5-engine';
import type { PlaybackEngine, PlaybackHandlers } from '../player/types';
import { isAvPlayAvailable, isTizen } from '../platform/runtime';
import {
  CatalogException,
  loadCategories,
  loadEpg,
  loadStreams,
  programIsCurrent,
  type EpgProgram,
} from '../services/xtream';
import {
  favoritesOf,
  isFavorite,
  rememberRecent,
  recentChannels,
  toggleFavorite,
} from '../storage/library';
import { useSession } from '../state/session';
import { useAdultGate } from './AdultPinDialog';
import { Icon } from './icons';
import './live.css';

const pinned: CategoryFolder[] = [
  { id: CategoryIds.all, name: 'Todos', pinned: true },
  { id: CategoryIds.favorites, name: 'Favoritos', pinned: true },
  { id: CategoryIds.recent, name: 'Recentes', pinned: true },
  { id: CategoryIds.search, name: 'Busca', pinned: true },
];

export function LiveScreen({ fixture }: { fixture?: MediaEntry[] }) {
  const session = useSession();
  const nav = useNav();
  const text = useTr();
  const credentials = session.session;
  const scope = credentials ? listScope(credentials) : '';
  const avPlay = isAvPlayAvailable();
  const videoRef = useRef<HTMLVideoElement>(null);
  const surfaceRef = useRef<HTMLObjectElement>(null);
  const engineRef = useRef<PlaybackEngine | null>(null);
  const [folders, setFolders] = useState<CategoryFolder[]>(pinned);
  const [categoryId, setCategoryId] = useState<string>(CategoryIds.all);
  const [channels, setChannels] = useState<MediaEntry[]>([]);
  const [visible, setVisible] = useState<number>(AppConfig.pageSize);
  const [current, setCurrent] = useState<MediaEntry | null>(null);
  const [epg, setEpg] = useState<EpgProgram[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buffering, setBuffering] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [query, setQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [favoriteTick, setFavoriteTick] = useState(0);
  const hideTimer = useRef(0);
  const zapping = useRef(false);
  const asking = useRef(false);
  const allow = useAdultGate();
  const fullscreenRef = useRef(false);
  const channelsRef = useRef(channels);
  const visibleRef = useRef(visible);
  const currentRef = useRef(current);
  const categoryRef = useRef(categoryId);
  const scopeRef = useRef(scope);
  fullscreenRef.current = fullscreen;
  channelsRef.current = channels;
  visibleRef.current = visible;
  currentRef.current = current;
  categoryRef.current = categoryId;
  scopeRef.current = scope;
  const handlers = useRef<PlaybackHandlers>({
    onBuffering: setBuffering,
    onTime: () => undefined,
    onPlaying: () => setBuffering(false),
    onEnded: () => undefined,
    onError: (message) => {
      setBuffering(false);
      setError(message);
    },
  });

  useEffect(() => {
    if (fixture) return;
    if (!credentials) return;
    const controller = new AbortController();
    void loadCategories(credentials, 'live', controller.signal)
      .then((remote) => {
        if (controller.signal.aborted) return;
        rememberAdultFolders('live', remote);
        setFolders([...pinned, ...remote]);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFolders(pinned);
      });
    return () => controller.abort();
  }, [credentials, fixture]);

  useEffect(() => {
    const controller = new AbortController();
    const local = (items: MediaEntry[]) => {
      if (controller.signal.aborted) return;
      setChannels(items);
      setVisible(AppConfig.pageSize);
      setLoading(false);
      setError(null);
    };
    if (categoryId === CategoryIds.favorites) {
      local(favoritesOf(scope, 'live'));
      return () => controller.abort();
    }
    if (categoryId === CategoryIds.recent) {
      local(recentChannels(scope));
      return () => controller.abort();
    }
    if (categoryId === CategoryIds.search && !appliedQuery) {
      local([]);
      return () => controller.abort();
    }
    if (fixture && (categoryId === CategoryIds.all || categoryId === CategoryIds.search)) {
      const needle = foldAscii(appliedQuery);
      local(
        categoryId === CategoryIds.search
          ? fixture.filter((item) => foldAscii(item.name).includes(needle))
          : fixture,
      );
      return () => controller.abort();
    }
    if (!credentials) {
      setChannels([]);
      setVisible(AppConfig.pageSize);
      setLoading(false);
      setError('Adicione uma lista na tela Listas.');
      return () => controller.abort();
    }
    setLoading(true);
    setError(null);
    const remoteCategory =
      categoryId === CategoryIds.all || categoryId === CategoryIds.search ? null : categoryId;
    void loadStreams(credentials, 'live', remoteCategory, controller.signal)
      .then((entries) => {
        if (controller.signal.aborted) return;
        const needle = foldAscii(appliedQuery);
        setChannels(
          categoryId === CategoryIds.search
            ? entries.filter((item) => foldAscii(item.name).includes(needle))
            : entries,
        );
        setVisible(AppConfig.pageSize);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || isAbort(caught)) return;
        setChannels([]);
        setError(caught instanceof CatalogException ? caught.message : 'Falha ao falar com o servidor');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [appliedQuery, categoryId, credentials, fixture, scope]);

  useEffect(() => {
    if (!current || !credentials || fixture) {
      setEpg([]);
      return;
    }
    const controller = new AbortController();
    const channelId = current.id;
    void loadEpg(credentials, current.sourceId, controller.signal)
      .then((programs) => {
        if (!controller.signal.aborted && currentRef.current?.id === channelId) setEpg(programs);
      })
      .catch(() => {
        if (!controller.signal.aborted && currentRef.current?.id === channelId) setEpg([]);
      });
    return () => controller.abort();
  }, [credentials, current, fixture]);

  useEffect(() => {
    const root = document.documentElement;
    if (!current) {
      root.classList.remove('is-playing', 'is-live-preview');
      return;
    }
    if (fullscreen) {
      root.classList.remove('is-live-preview');
      root.classList.add('is-playing');
      return () => root.classList.remove('is-playing', 'is-live-preview');
    }
    root.classList.remove('is-playing');
    const cut = () => {
      const screen = document.querySelector('.live-screen');
      const frame = document.querySelector('.live-preview-frame');
      if (!(screen instanceof HTMLElement) || !(frame instanceof HTMLElement)) return;
      const bounds = screen.getBoundingClientRect();
      const rect = frame.getBoundingClientRect();
      const left = rect.left - bounds.left;
      const top = rect.top - bounds.top;
      const right = rect.right - bounds.left;
      const bottom = rect.bottom - bounds.top;
      screen.style.setProperty(
        '--live-cut',
        `polygon(evenodd, 0px 0px, ${bounds.width}px 0px, ${bounds.width}px ${bounds.height}px, 0px ${bounds.height}px, 0px 0px, ${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px, ${left}px ${top}px)`,
      );
    };
    cut();
    const frameId = window.requestAnimationFrame(cut);
    root.classList.add('is-live-preview');
    window.addEventListener('resize', cut);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', cut);
      root.classList.remove('is-live-preview', 'is-playing');
      document.querySelector<HTMLElement>('.live-screen')?.style.removeProperty('--live-cut');
    };
  }, [current, fullscreen]);

  useEffect(() => {
    const url = current?.mediaUrl;
    if (!url) return;
    const engine = avPlay
      ? surfaceRef.current
        ? new AvPlayEngine(surfaceRef.current, handlers, true)
        : null
      : videoRef.current
        ? new Html5Engine(videoRef.current, handlers, true)
        : null;
    if (!engine) return;
    engineRef.current = engine;
    void engine.open(url);
    return () => {
      engine.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [avPlay, current]);

  useEffect(() => {
    const fitTimer = window.setTimeout(() => window.dispatchEvent(new Event('resize')), 40);
    if (!fullscreen) return () => window.clearTimeout(fitTimer);
    const poke = () => {
      setChrome(true);
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setChrome(false), 4000);
    };
    poke();
    const focusTimer = window.setTimeout(() => {
      document.querySelector<HTMLElement>('.live-minimize')?.focus();
    }, 40);
    return () => {
      window.clearTimeout(focusTimer);
      window.clearTimeout(fitTimer);
      window.clearTimeout(hideTimer.current);
    };
  }, [fullscreen, current?.id]);

  useEffect(() => {
    if (!isTizen()) return;
    const device = window.tizen?.tvinputdevice;
    for (const key of ['ChannelUp', 'ChannelDown']) {
      try {
        device?.registerKey(key);
      } catch {
        // The set still arrives when the platform already exposes it.
      }
    }
  }, []);

  async function choose(channel: MediaEntry) {
    if (currentRef.current?.id === channel.id) {
      setFullscreen(true);
      return;
    }
    if (asking.current) return;
    asking.current = true;
    try {
      const allowed = await allow('live', channel, categoryRef.current);
      if (!allowed || currentRef.current?.id === channel.id) return;
    } finally {
      asking.current = false;
    }
    if (!channel.mediaUrl) {
      session.showToast('Conteúdo indisponível');
      return;
    }
    setCurrent(channel);
    setEpg([]);
    setError(null);
    setBuffering(true);
    if (scopeRef.current) {
      rememberRecent(scopeRef.current, channel);
      if (categoryRef.current === CategoryIds.recent) setChannels(recentChannels(scopeRef.current));
    }
  }

  async function step(delta: number) {
    if (zapping.current || asking.current || delta === 0) return;
    const all = channelsRef.current;
    if (all.length === 0) return;
    zapping.current = true;
    try {
      let count = visibleRef.current;
      let list = all.slice(0, count);
      const index = currentRef.current
        ? list.findIndex((item) => item.id === currentRef.current?.id)
        : -1;
      if (delta > 0 && index >= list.length - 2 && count < all.length) {
        count = Math.min(all.length, count + AppConfig.pageSize);
        setVisible(count);
        list = all.slice(0, count);
      }
      const place = currentRef.current ? list.findIndex((item) => item.id === currentRef.current?.id) : -1;
      const target = place < 0 ? (delta > 0 ? 0 : list.length - 1) : place + delta;
      const channel = list[target];
      if (!channel || channel.id === currentRef.current?.id) return;
      await choose(channel);
    } finally {
      zapping.current = false;
    }
  }

  const stepRef = useRef(step);
  stepRef.current = step;
  const popRef = useRef(nav.pop);
  popRef.current = nav.pop;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (document.querySelector('.dialog-layer')) return;
      const preview =
        document.activeElement instanceof HTMLElement &&
        document.activeElement.dataset.tvRole === 'live-preview';
      const up = event.key === 'ArrowUp' || event.key === 'ChannelUp' || event.keyCode === 427;
      const down = event.key === 'ArrowDown' || event.key === 'ChannelDown' || event.keyCode === 428;
      if ((fullscreenRef.current || preview) && (up || down)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        stepRef.current(up ? -1 : 1);
      }
    };
    const onBack = (event: Event) => {
      if (document.querySelector('.dialog-layer')) return;
      if (!fullscreenRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      setFullscreen(false);
    };
    const onMedia = (event: Event) => {
      if ((event as CustomEvent<string>).detail !== 'MediaStop') return;
      if (fullscreenRef.current) setFullscreen(false);
      else popRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('slimplay:back', onBack, true);
    window.addEventListener('slimplay:media', onMedia);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('slimplay:back', onBack, true);
      window.removeEventListener('slimplay:media', onMedia);
    };
  }, []);

  const shown = channels.slice(0, visible);
  const empty = loading
    ? 'Carregando...'
    : categoryId === CategoryIds.search && !appliedQuery
      ? 'Digite o nome do canal.'
      : categoryId === CategoryIds.recent
        ? 'Nenhum canal recente.'
        : (error ?? 'Nenhum canal nesta pasta.');

  return (
    <main className={fullscreen ? 'screen slim-bg live-screen is-full' : 'screen slim-bg live-screen'}>
      <header className="screen-header">
        <button
          type="button"
          className="icon-button"
          data-tv-focusable="true"
          onClick={nav.pop}
          aria-label="Voltar"
        >
          <Icon name="back" />
        </button>
        <h1>{text('TV ao vivo')}</h1>
      </header>
      <div className="live-columns" inert={fullscreen ? true : undefined}>
        <section className="live-column">
          <h2>Categorias</h2>
          <div className="live-scroll">
            {folders.map((folder, index) => (
              <button
                key={folder.id}
                type="button"
                className={folder.id === categoryId ? 'live-tile is-selected' : 'live-tile'}
                data-tv-focusable="true"
                data-tv-initial={index === 0 ? 'true' : undefined}
                onClick={() => {
                  setAppliedQuery(folder.id === CategoryIds.search ? query.trim() : '');
                  setCategoryId(folder.id);
                }}
              >
                {folder.name}
              </button>
            ))}
          </div>
        </section>
        <section className="live-column">
          <h2>Canais</h2>
          {categoryId === CategoryIds.search ? (
            <form
              className="live-search"
              onSubmit={(event) => {
                event.preventDefault();
                setAppliedQuery(query.trim());
              }}
            >
              <input
                value={query}
                placeholder="Buscar canal"
                data-tv-focusable="true"
                onChange={(event) => setQuery(event.target.value)}
              />
              <button type="submit" data-tv-focusable="true" aria-label="Buscar">
                <Icon name="search" />
              </button>
            </form>
          ) : null}
          <div className="live-scroll">
            {shown.length === 0 ? <p className="live-empty">{text(empty)}</p> : null}
            {shown.map((channel) => {
              const selected = channel.id === current?.id;
              const favorite = isFavorite(scope, channel.id);
              return (
                <div className="live-channel-row" key={channel.id}>
                  <button
                    type="button"
                    className={selected ? 'live-channel is-selected' : 'live-channel'}
                    data-tv-focusable="true"
                    data-channel-id={channel.id}
                    onClick={() => choose(channel)}
                  >
                    {channel.name}
                  </button>
                  <button
                    type="button"
                    className={favorite ? 'live-star is-on' : 'live-star'}
                    data-tv-focusable="true"
                    aria-label={favorite ? 'Nos favoritos' : 'Favorito'}
                    onClick={() => {
                      if (!scope) {
                        session.showToast(text('Adicione uma lista na tela Listas.'));
                        return;
                      }
                      toggleFavorite(scope, channel);
                      setFavoriteTick((value) => value + 1);
                      if (categoryId === CategoryIds.favorites) setChannels(favoritesOf(scope, 'live'));
                    }}
                  >
                    <Icon name={favorite ? 'star' : 'star-outline'} />
                  </button>
                </div>
              );
            })}
            {channels.length > shown.length ? (
              <button
                type="button"
                className="live-tile"
                data-tv-focusable="true"
                onClick={() => setVisible((count) => count + AppConfig.pageSize)}
              >
                Carregar mais
              </button>
            ) : null}
          </div>
        </section>
        <section className="live-column">
          <h2> </h2>
          <div className="live-preview-frame">
            {avPlay ? (
              <object ref={surfaceRef} className="live-preview-object" type="application/avplayer" />
            ) : (
              <video ref={videoRef} className="live-video" playsInline />
            )}
            {!current || fullscreen ? (
              <span className="live-preview-note">{current ? 'Em tela cheia' : 'Selecione um canal'}</span>
            ) : null}
            {buffering && current && !fullscreen ? <span className="live-buffer">Buffer...</span> : null}
            <button
              type="button"
              className="live-preview-hit"
              data-tv-focusable={current ? 'true' : undefined}
              data-tv-role="live-preview"
              disabled={!current}
              aria-label="Tela cheia"
              onClick={() => {
                if (current) setFullscreen(true);
              }}
            >
              {current && !fullscreen ? <Icon name="fullscreen" /> : null}
            </button>
          </div>
          <div className="live-scroll live-guide-scroll">
            <p className="live-guide">Guia de programação</p>
            {epg.length === 0 ? <p className="live-guide-empty">Sem grade para este canal.</p> : null}
            {epg.map((program) => (
              <article
                key={`${program.start.toISOString()}-${program.title}`}
                className={programIsCurrent(program) ? 'live-program is-current' : 'live-program'}
              >
                <strong>
                  {epgClock(program.start)} {program.title}
                </strong>
                {program.description ? <span>{program.description}</span> : null}
              </article>
            ))}
          </div>
        </section>
      </div>
      {fullscreen && buffering && current ? <span className="live-buffer live-buffer-full">Buffer...</span> : null}
      {fullscreen ? (
        <div className={chrome ? 'live-full-chrome' : 'live-full-chrome is-hidden'}>
          <button
            type="button"
            className="live-minimize"
            data-tv-focusable="true"
            data-tv-initial="true"
            onClick={() => setFullscreen(false)}
          >
            <Icon name="minimize" />
            {text('Minimizar')}
          </button>
          <h2 className="live-full-title">{current?.name}</h2>
        </div>
      ) : null}
      <span hidden>{favoriteTick}</span>
    </main>
  );
}

function epgClock(date: Date): string {
  return formatClock((date.getHours() * 3600 + date.getMinutes() * 60) * 1000);
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
