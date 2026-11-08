import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import logo from '../assets/logo.png';
import { ActivationScreen } from '../screens/ActivationScreen';
import { CatalogScreen } from '../screens/CatalogScreen';
import { HomeScreen } from '../screens/HomeScreen';
import { ListsScreen } from '../screens/ListsScreen';
import { MovieDetailScreen } from '../screens/MovieDetailScreen';
import { PlayerScreen } from '../screens/PlayerScreen';
import { SeriesDetailScreen } from '../screens/SeriesDetailScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { sampleChannels } from '../dev/live-fixture';
import { sampleMovie } from '../dev/movie-fixture';
import { sampleSeriesDetail } from '../dev/series-fixture';
import { LiveScreen } from '../screens/LiveScreen';
import type { MediaEntry } from '../models/media';
import type { SeriesDetail } from '../models/series';
import { takeMsxReturn } from '../platform/msx-plugin';
import { useSession } from '../state/session';

export type RouteName = 'home' | 'activation' | 'lists' | 'live' | 'movies' | 'series' | 'settings' | 'player';

export type AppRoute =
  | { name: Exclude<RouteName, 'player' | 'live'> }
  | { name: 'live'; fixture?: MediaEntry[] }
  | { name: 'player'; entry: MediaEntry; queue?: MediaEntry[]; autoNext?: boolean }
  | { name: 'seriesDetail'; entry: MediaEntry; fixture?: SeriesDetail }
  | { name: 'movieDetail'; entry: MediaEntry };

type DialogRenderer = (close: () => void) => ReactNode;

interface PlayerOptions {
  queue?: MediaEntry[];
  autoNext?: boolean;
}

interface NavValue {
  push: (name: Exclude<RouteName, 'player'>) => void;
  openPlayer: (entry: MediaEntry, options?: PlayerOptions) => void;
  openSeries: (entry: MediaEntry) => void;
  openMovie: (entry: MediaEntry) => void;
  pop: () => void;
  openDialog: (render: DialogRenderer) => void;
  closeDialog: () => void;
}

const NavContext = createContext<NavValue | null>(null);

export function useNav(): NavValue {
  const value = useContext(NavContext);
  if (!value) throw new Error('Navegação indisponível');
  return value;
}

export function Navigation() {
  const session = useSession();
  const [stack, setStack] = useState<AppRoute[]>([{ name: 'home' }]);
  const [dialog, setDialog] = useState<DialogRenderer | null>(null);
  const [dialogToken, setDialogToken] = useState(0);

  const dialogRef = useRef<DialogRenderer | null>(null);
  dialogRef.current = dialog;

  const openedSample = useRef(false);

  useEffect(() => {
    if (!session.ready) return;
    const base: AppRoute[] = session.blockedMac ? [{ name: 'activation' }] : [{ name: 'home' }];
    const returned = session.blockedMac ? null : takeMsxReturn();
    if (returned) {
      setStack([...base, { name: returned }]);
      setDialog(null);
      return;
    }
    const params = import.meta.env.DEV ? new URLSearchParams(location.search) : null;
    const serie = params?.get('serie');
    const filme = params?.get('filme');
    const tv = params?.get('tv');
    const sample = params?.get('play');
    if (import.meta.env.DEV && tv && !openedSample.current) {
      openedSample.current = true;
      setStack([...base, { name: 'live', fixture: sampleChannels() }]);
      setDialog(null);
      return;
    }
    if (import.meta.env.DEV && filme && !openedSample.current) {
      openedSample.current = true;
      setStack([...base, { name: 'movieDetail', entry: sampleMovie() }]);
      setDialog(null);
      return;
    }
    if (import.meta.env.DEV && serie && !openedSample.current) {
      openedSample.current = true;
      const fixture = sampleSeriesDetail();
      setStack([...base, { name: 'seriesDetail', entry: fixture.series, fixture }]);
      setDialog(null);
      return;
    }
    if (import.meta.env.DEV && sample && !openedSample.current) {
      openedSample.current = true;
      setStack([...base, { name: 'player', entry: sampleEntry(sample) }]);
      setDialog(null);
      return;
    }
    if (!serie && !filme && !tv && !sample) {
      setStack(base);
      setDialog(null);
    }
  }, [session.ready, session.blockedMac]);

  useEffect(() => {
    const onBack = (event: Event) => {
      if (event.defaultPrevented) return;
      if (dialogRef.current) {
        setDialog(null);
        return;
      }
      setStack((routes) => (routes.length > 1 ? routes.slice(0, -1) : routes));
    };
    window.addEventListener('slimplay:back', onBack);
    return () => window.removeEventListener('slimplay:back', onBack);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const scope = dialog ? document.querySelector('.dialog-layer') : document;
      scope?.querySelector<HTMLElement>('[data-tv-initial="true"]')?.focus();
    }, 30);
    return () => window.clearTimeout(timer);
  }, [stack, dialogToken, session.ready, session.blockedMac, dialog]);

  function push(name: Exclude<RouteName, 'player'>) {
    setDialog(null);
    setStack((routes) => [...routes, name === 'live' ? { name: 'live' } : { name }]);
  }

  function openPlayer(entry: MediaEntry, options?: PlayerOptions) {
    if (!entry.mediaUrl) return;
    setDialog(null);
    setStack((routes) => [
      ...routes,
      { name: 'player', entry, queue: options?.queue, autoNext: options?.autoNext },
    ]);
  }

  function openSeries(entry: MediaEntry) {
    setDialog(null);
    setStack((routes) => [...routes, { name: 'seriesDetail', entry }]);
  }

  function openMovie(entry: MediaEntry) {
    setDialog(null);
    setStack((routes) => [...routes, { name: 'movieDetail', entry }]);
  }

  function pop() {
    setStack((routes) => (routes.length > 1 ? routes.slice(0, -1) : routes));
  }

  function openDialog(render: DialogRenderer) {
    setDialog(() => render);
    setDialogToken((value) => value + 1);
  }

  const route = stack[stack.length - 1] ?? { name: 'home' as const };
  const nav: NavValue = {
    push,
    openPlayer,
    openSeries,
    openMovie,
    pop,
    openDialog,
    closeDialog: () => setDialog(null),
  };

  return (
    <NavContext.Provider value={nav}>
      <div className="app-frame">
        <div className="screen-host" inert={dialog ? true : undefined}>
          {!session.ready ? (
            <main className="home slim-bg">
              <div className="home-stage">
                <img className="home-logo" src={logo} alt="SLIM PLAY" />
              </div>
            </main>
          ) : (
            <Screen route={route} />
          )}
        </div>
        {dialog ? <div className="dialog-layer">{dialog(() => setDialog(null))}</div> : null}
        {session.toast ? <div className="toast">{session.toast}</div> : null}
      </div>
    </NavContext.Provider>
  );
}

function Screen({ route }: { route: AppRoute }) {
  switch (route.name) {
    case 'activation':
      return <ActivationScreen />;
    case 'lists':
      return <ListsScreen />;
    case 'live':
      return <LiveScreen fixture={route.fixture} />;
    case 'movies':
      return <CatalogScreen kind="movie" title="Filmes" />;
    case 'series':
      return <CatalogScreen kind="series" title="Séries" />;
    case 'seriesDetail':
      return <SeriesDetailScreen key={route.entry.id} entry={route.entry} fixture={route.fixture} />;
    case 'movieDetail':
      return <MovieDetailScreen key={route.entry.id} entry={route.entry} />;
    case 'settings':
      return <SettingsScreen />;
    case 'player':
      return (
        <PlayerScreen
          key={route.entry.id}
          entry={route.entry}
          queue={route.queue}
          autoNext={route.autoNext}
        />
      );
    default:
      return <HomeScreen />;
  }
}

function sampleEntry(url: string): MediaEntry {
  const live = /\.m3u8($|\?)/i.test(url);
  return {
    id: 'dev-sample',
    sourceId: 'dev-sample',
    name: 'Amostra',
    kind: live ? 'live' : 'movie',
    posterUrl: null,
    categoryId: null,
    mediaUrl: url,
    plot: null,
    year: null,
    genre: null,
  };
}
