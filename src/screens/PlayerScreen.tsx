import { useEffect, useRef, useState } from 'react';
import { formatClock } from '../core/format';
import { useTr } from '../l10n/use-tr';
import { episodeLabel, type MediaEntry } from '../models/media';
import { listScope } from '../models/playlist';
import { flattenEpisodes } from '../models/series';
import { useNav } from '../nav/navigation';
import { AvPlayEngine } from '../player/avplay-engine';
import { handoffMsxPlayback } from '../platform/msx-plugin';
import { Html5Engine } from '../player/html5-engine';
import type { PlaybackEngine, PlaybackHandlers } from '../player/types';
import { isAvPlayAvailable } from '../platform/runtime';
import { loadSeriesDetail } from '../services/xtream';
import { progressForEntry, progressFromEntry, removeProgress, saveProgress } from '../storage/library';
import { useSession } from '../state/session';
import { Icon } from './icons';
import './player.css';

const seekStep = 20000;

export function PlayerScreen({
  entry,
  queue,
  autoNext = false,
}: {
  entry: MediaEntry;
  queue?: MediaEntry[];
  autoNext?: boolean;
}) {
  const nav = useNav();
  const session = useSession();
  const text = useTr();
  const [expanded, setExpanded] = useState<MediaEntry[] | null>(null);
  const items = expanded ?? (queue && queue.length > 0 ? queue : [entry]);
  const [index, setIndex] = useState(() => queueIndex(items, entry));
  const current = items[index] ?? entry;
  const live = current.kind === 'live';
  const avPlay = isAvPlayAvailable();
  const videoRef = useRef<HTMLVideoElement>(null);
  const surfaceRef = useRef<HTMLObjectElement>(null);
  const engineRef = useRef<PlaybackEngine | null>(null);
  const handlers = useRef<PlaybackHandlers>({
    onBuffering: () => undefined,
    onTime: () => undefined,
    onPlaying: () => undefined,
    onEnded: () => undefined,
    onError: () => undefined,
  });
  const [buffering, setBuffering] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [chrome, setChrome] = useState(true);
  const hideTimer = useRef(0);
  const sessionRef = useRef(session.session);
  const currentRef = useRef(current);
  const indexRef = useRef(index);
  const autoRef = useRef(autoNext);
  const itemsRef = useRef(items);
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  const lastSaved = useRef(0);
  const endedRef = useRef(false);
  const holdingRef = useRef(false);
  const resumeAllowed = useRef(true);
  const userSeeked = useRef(false);
  const sought = useRef(false);
  const resumeTarget = useRef(0);
  const rememberRef = useRef<() => void>(() => undefined);
  sessionRef.current = session.session;
  currentRef.current = current;
  indexRef.current = index;
  autoRef.current = autoNext;
  itemsRef.current = items;

  handlers.current = {
    onBuffering: setBuffering,
    onTime: (nextPosition, nextDuration) => {
      positionRef.current = nextPosition;
      durationRef.current = nextDuration;
      setPosition(nextPosition);
      setDuration(nextDuration);
      if (holdingRef.current) {
        const target = resumeTarget.current;
        if (sought.current && target > 0 && Math.abs(nextPosition - target) <= 15000) {
          holdingRef.current = false;
        }
        return;
      }
      const seconds = Math.floor(nextPosition / 1000);
      if (seconds > 5 && seconds - lastSaved.current >= 5) {
        lastSaved.current = seconds;
        rememberRef.current();
      }
    },
    onPlaying: setPlaying,
    onEnded: () => {
      endedRef.current = true;
      const playingEntry = currentRef.current;
      const scope = sessionRef.current ? listScope(sessionRef.current) : '';
      if (playingEntry.kind !== 'live') removeProgress(scope, playingEntry.id);
      resumeAllowed.current = false;
      const next = autoRef.current ? itemsRef.current[indexRef.current + 1] : undefined;
      if (!next?.mediaUrl) {
        setChrome(true);
        return;
      }
      setIndex(indexRef.current + 1);
    },
    onError: (message) => {
      setError(message);
      setBuffering(false);
      setChrome(true);
    },
  };

  useEffect(() => {
    document.documentElement.classList.add('is-playing');
    return () => document.documentElement.classList.remove('is-playing');
  }, []);

  useEffect(() => {
    if ((queue && queue.length > 0) || !autoNext || !entry.seriesId) return;
    const credentials = sessionRef.current;
    if (!credentials) return;
    const controller = new AbortController();
    const seed: MediaEntry = {
      ...entry,
      id: `series:${entry.seriesId}`,
      sourceId: entry.seriesId,
      kind: 'series',
      name: entry.seriesName || entry.name,
    };
    void loadSeriesDetail(credentials, seed, controller.signal)
      .then((detail) => {
        const flat = flattenEpisodes(detail);
        if (controller.signal.aborted || flat.length <= 1) return;
        const playing = currentRef.current;
        let place = flat.findIndex((item) => item.id === playing.id);
        if (place < 0) {
          place = flat.findIndex((item) => item.sourceId !== '' && item.sourceId === playing.sourceId);
        }
        const nextIndex = place >= 0 ? place : 0;
        const next = flat.slice();
        next[nextIndex] = playing;
        setExpanded(next);
        setIndex(nextIndex);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [autoNext, entry, queue]);

  const playId = current.id;
  const playUrl = current.mediaUrl ?? '';

  useEffect(() => {
    const url = current.mediaUrl;
    const playingEntry = current;
    const allowResume = resumeAllowed.current;
    resumeAllowed.current = false;
    userSeeked.current = false;
    sought.current = false;
    lastSaved.current = 0;
    endedRef.current = false;
    positionRef.current = 0;
    durationRef.current = 0;
    setPosition(0);
    setDuration(0);
    setError(null);
    setBuffering(true);
    setPlaying(false);
    rememberRef.current = () => {
      if (endedRef.current || holdingRef.current) return;
      const progress = progressFromEntry(
        playingEntry,
        Math.floor(positionRef.current / 1000),
        Math.floor(durationRef.current / 1000),
      );
      const credentials = sessionRef.current;
      if (!progress || !credentials) return;
      saveProgress(listScope(credentials), progress);
    };
    const credentials = sessionRef.current;
    const scope = credentials ? listScope(credentials) : '';
    const saved = allowResume && scope ? progressForEntry(scope, playingEntry) : null;
    const resumeSeconds =
      !allowResume || playingEntry.kind === 'live'
        ? 0
        : saved && saved.positionSeconds > 5
          ? saved.positionSeconds
          : (playingEntry.resumePosition ?? 0);
    holdingRef.current = resumeSeconds > 5;
    resumeTarget.current = resumeSeconds > 5 ? resumeSeconds * 1000 : 0;
    const holdTimer = window.setTimeout(() => {
      holdingRef.current = false;
    }, 8000);
    if (!url) {
      window.clearTimeout(holdTimer);
      holdingRef.current = false;
      return;
    }
    if (!avPlay && handoffMsxPlayback(url)) {
      window.clearTimeout(holdTimer);
      holdingRef.current = false;
      setBuffering(false);
      return;
    }
    const engine = avPlay
      ? surfaceRef.current
        ? new AvPlayEngine(surfaceRef.current, handlers, live)
        : null
      : videoRef.current
        ? new Html5Engine(videoRef.current, handlers, live)
        : null;
    if (!engine) {
      window.clearTimeout(holdTimer);
      holdingRef.current = false;
      return;
    }
    engineRef.current = engine;
    void engine.open(url).then(() => {
      if (engineRef.current !== engine || userSeeked.current || resumeSeconds <= 5) {
        holdingRef.current = false;
        return;
      }
      const duration = durationRef.current;
      if (duration > 30000 && resumeSeconds * 1000 + 2000 >= duration) {
        holdingRef.current = false;
        return;
      }
      sought.current = true;
      engine.seekTo(resumeSeconds * 1000);
    });
    return () => {
      window.clearTimeout(holdTimer);
      rememberRef.current();
      engine.destroy();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, [avPlay, current, live, playId, playUrl]);

  function nudge(delta: number) {
    userSeeked.current = true;
    holdingRef.current = false;
    engineRef.current?.seekBy(delta);
  }

  const nudgeRef = useRef<(delta: number) => void>(() => undefined);
  nudgeRef.current = nudge;

  const chromeRef = useRef(chrome);
  chromeRef.current = chrome;
  const popRef = useRef(nav.pop);
  popRef.current = nav.pop;

  useEffect(() => {
    const poke = () => {
      setChrome(true);
      window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => setChrome(false), 4000);
    };
    const onMedia = (event: Event) => {
      const key = (event as CustomEvent<string>).detail;
      poke();
      if (key === 'MediaPlay') engineRef.current?.play();
      if (key === 'MediaPause') engineRef.current?.pause();
      if (key === 'MediaPlayPause') engineRef.current?.toggle();
      if (key === 'MediaRewind') nudge( -seekStep);
      if (key === 'MediaFastForward') nudge(seekStep);
      if (key === 'MediaStop') popRef.current();
    };
    const onKey = (event: KeyboardEvent) => {
      const slider =
        document.activeElement instanceof HTMLInputElement &&
        document.activeElement.classList.contains('player-seek');
      if (slider && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.keyCode === 37 || event.keyCode === 39)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        nudgeRef.current(event.key === 'ArrowLeft' || event.keyCode === 37 ? -seekStep : seekStep);
        poke();
        return;
      }
      if (event.key === 'Enter' && !chromeRef.current) engineRef.current?.toggle();
      poke();
    };
    poke();
    window.addEventListener('slimplay:media', onMedia);
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('slimplay:media', onMedia);
      window.removeEventListener('keydown', onKey, true);
      window.clearTimeout(hideTimer.current);
    };
  }, []);

  function seekToFraction(fraction: number) {
    if (durationRef.current <= 0) return;
    userSeeked.current = true;
    holdingRef.current = false;
    engineRef.current?.seekTo(Math.min(durationRef.current, Math.max(0, fraction * durationRef.current)));
  }

  const progress = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const episode = current.kind === 'episode';
  const hasPrevious = episode && index > 0;
  const hasNext = episode && index + 1 < items.length;
  const showUpNext = hasNext && duration > 0 && duration - position <= 60000 && !error;
  const title =
    episode && (current.seasonNumber != null || current.episodeNumber != null)
      ? `${episodeLabel(current)}  ${current.name}`
      : current.name;

  return (
    <main className="player-screen">
      {avPlay ? (
        <object ref={surfaceRef} className="av-object" type="application/avplayer" />
      ) : (
        <video ref={videoRef} className="html5-video" playsInline />
      )}
      {buffering && !error ? <p className="player-status">Carregando...</p> : null}
      {error ? <p className="player-status">{error}</p> : null}
      <div className={chrome ? 'player-dock' : 'player-dock is-hidden'} inert={chrome ? undefined : true}>
        <p className="player-title">{title}</p>
        {live ? null : (
          <div className="player-seek-wrap">
            <input
              className="player-seek"
              type="range"
              min={0}
              max={1000}
              step={1}
              value={duration > 0 ? Math.round((position / duration) * 1000) : 0}
              disabled={duration <= 0}
              data-tv-focusable="true"
              style={{ ['--progress' as string]: `${progress}%` }}
              aria-label="Posição"
              onChange={(event) => seekToFraction(Number(event.target.value) / 1000)}
            />
          </div>
        )}
        <div className="player-actions">
          <button type="button" className="player-action" data-tv-focusable="true" onClick={nav.pop}>
            <Icon name="minimize" />
            <span>{text('Minimizar')}</span>
          </button>
          {episode ? (
            <button
              type="button"
              className="player-action"
              data-tv-focusable="true"
              disabled={!hasPrevious}
              aria-label="Episódio anterior"
              onClick={() => setIndex(index - 1)}
            >
              <Icon name="skip-previous" />
            </button>
          ) : null}
          {live ? null : (
            <button type="button" className="player-action" data-tv-focusable="true" onClick={() => nudge(-seekStep)}>
              -20s
            </button>
          )}
          <button
            type="button"
            className="player-action"
            data-tv-focusable="true"
            data-tv-initial="true"
            onClick={() => engineRef.current?.toggle()}
            aria-label={playing ? 'Pausar' : 'Reproduzir'}
          >
            <Icon name={playing ? 'pause' : 'play'} />
          </button>
          {live ? null : (
            <button type="button" className="player-action" data-tv-focusable="true" onClick={() => nudge(seekStep)}>
              +20s
            </button>
          )}
          {episode ? (
            <button
              type="button"
              className="player-action"
              data-tv-focusable="true"
              disabled={!hasNext}
              aria-label="Próximo episódio"
              onClick={() => setIndex(index + 1)}
            >
              <Icon name="skip-next" />
            </button>
          ) : null}
          <span className="player-clock">{live ? text('AO VIVO') : `${formatClock(position)} / ${formatClock(duration)}`}</span>
        </div>
      </div>
      {showUpNext ? (
        <button type="button" className="player-up-next" data-tv-focusable="true" onClick={() => setIndex(index + 1)}>
          <span>{text('Próximo episódio')}</span>
          <Icon name="play" />
        </button>
      ) : null}
    </main>
  );
}

function queueIndex(items: MediaEntry[], entry: MediaEntry): number {
  const byId = items.findIndex((item) => item.id === entry.id);
  if (byId >= 0) return byId;
  const bySource = items.findIndex((item) => item.sourceId !== '' && item.sourceId === entry.sourceId);
  return bySource >= 0 ? bySource : 0;
}
