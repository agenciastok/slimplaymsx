import { useEffect, useRef, useState } from 'react';
import { rememberAdultFolders } from '../core/adult';
import { AppConfig } from '../core/config';
import { foldAscii } from '../core/text';
import { useTr } from '../l10n/use-tr';
import { CategoryIds, episodeLabel, type CategoryFolder, type MediaEntry, type MediaKind } from '../models/media';
import { listScope } from '../models/playlist';
import { useNav } from '../nav/navigation';
import { CatalogException, loadCategories, loadStreams } from '../services/xtream';
import { continueWatching, favoritesOf } from '../storage/library';
import { useSession } from '../state/session';
import { useAdultGate } from './AdultPinDialog';
import { Icon } from './icons';

export function CatalogScreen({ kind, title }: { kind: MediaKind; title: string }) {
  const session = useSession();
  const nav = useNav();
  const text = useTr();
  const credentials = session.session;
  const catalogKey = credentials ? `${credentials.dnsUrl}|${credentials.username}|${credentials.password}` : '';
  const [folders, setFolders] = useState<CategoryFolder[]>([]);
  const [categoryId, setCategoryId] = useState<string>(CategoryIds.all);
  const [items, setItems] = useState<MediaEntry[]>([]);
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState<number>(AppConfig.pageSize);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allow = useAdultGate();
  const opening = useRef(false);
  const gridRef = useRef<HTMLDivElement>(null);
  const totalRef = useRef(0);
  const paging = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const pinned = pinnedFolders(kind);
    setFolders(pinned);
    if (!credentials) return () => controller.abort();
    void loadCategories(credentials, kind, controller.signal)
      .then((remote) => {
        if (controller.signal.aborted) return;
        rememberAdultFolders(kind, remote);
        setFolders([...pinned, ...remote]);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || isAbort(caught)) return;
        setFolders(pinned);
        setError(caught instanceof Error ? caught.message : 'Falha ao falar com o servidor');
      });
    return () => controller.abort();
  }, [catalogKey, credentials, kind]);

  useEffect(() => {
    const scope = credentials ? listScope(credentials) : '';
    if (categoryId === CategoryIds.continueWatching || categoryId === CategoryIds.favorites) {
      setItems(
        categoryId === CategoryIds.favorites ? favoritesOf(scope, kind) : continueWatching(scope, kind),
      );
      setVisible(AppConfig.pageSize);
      setLoading(false);
      setError(null);
      return;
    }
    if (!credentials) {
      setItems([]);
      setVisible(AppConfig.pageSize);
      setLoading(false);
      setError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void loadStreams(
      credentials,
      kind,
      categoryId === CategoryIds.all ? null : categoryId,
      controller.signal,
    )
      .then((entries) => {
        if (controller.signal.aborted) return;
        setItems(entries);
        setVisible(AppConfig.pageSize);
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || isAbort(caught)) return;
        setItems([]);
        setError(caught instanceof CatalogException ? caught.message : 'Falha ao falar com o servidor');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [catalogKey, categoryId, credentials, kind]);

  const needle = foldAscii(query.trim());
  const filtered = needle
    ? items.filter((item) => foldAscii(`${item.seriesName ?? ''} ${item.name}`).includes(needle))
    : items;
  const shown = filtered.slice(0, visible);
  const empty = emptyMessage(categoryId, Boolean(credentials), needle);
  totalRef.current = filtered.length;

  useEffect(() => {
    const node = gridRef.current;
    if (node) node.scrollTop = 0;
  }, [categoryId, needle, kind]);

  useEffect(() => {
    paging.current = false;
  }, [visible]);

  function revealNextPage() {
    if (paging.current) return;
    setVisible((count) => {
      const total = totalRef.current;
      if (count >= total) return count;
      paging.current = true;
      return Math.min(total, count + AppConfig.pageSize);
    });
  }

  function onGridScroll(event: React.UIEvent<HTMLDivElement>) {
    const node = event.currentTarget;
    const row = Math.max(node.clientHeight / 2, 1);
    const remaining = node.scrollHeight - node.scrollTop - node.clientHeight;
    if (remaining <= row * 2) revealNextPage();
  }

  function onGridFocus(event: React.FocusEvent<HTMLDivElement>) {
    const card = (event.target as HTMLElement).closest('button.poster');
    if (!(card instanceof HTMLButtonElement)) return;
    const cards = event.currentTarget.querySelectorAll('button.poster');
    const index = Array.prototype.indexOf.call(cards, card);
    if (index >= 0 && index >= cards.length - 8) revealNextPage();
  }

  async function openItem(item: MediaEntry) {
    if (opening.current) return;
    opening.current = true;
    try {
      const allowed = await allow(item.kind === 'episode' ? 'episode' : kind, item, categoryId);
      if (!allowed) return;
      if (kind === 'series' && categoryId !== CategoryIds.continueWatching && item.kind !== 'episode') {
        nav.openSeries(item);
        return;
      }
      if (kind === 'movie' && categoryId !== CategoryIds.continueWatching) {
        nav.openMovie(item);
        return;
      }
      if (!item.mediaUrl) {
        session.showToast('Conteúdo indisponível');
        return;
      }
      nav.openPlayer(item, kind === 'series' ? { autoNext: true } : undefined);
    } finally {
      opening.current = false;
    }
  }

  return (
    <main className="screen slim-bg">
      <header className="screen-header">
        <button
          type="button"
          className="icon-button"
          data-tv-focusable="true"
          data-tv-initial="true"
          onClick={nav.pop}
          aria-label="Voltar"
        >
          <Icon name="back" />
        </button>
        <h1>{text(title)}</h1>
      </header>
      <div className="catalog">
        <div className="catalog-folders">
          <input
            className="catalog-search"
            value={query}
            placeholder={text('Buscar nesta pasta')}
            data-tv-focusable="true"
            onChange={(event) => {
              setQuery(event.target.value);
              setVisible(AppConfig.pageSize);
            }}
          />
          {folders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              className={folder.id === categoryId ? 'folder is-selected' : 'folder'}
              data-tv-focusable="true"
              onClick={() => setCategoryId(folder.id)}
            >
              {folder.name}
            </button>
          ))}
        </div>
        <div
          ref={gridRef}
          className="catalog-grid"
          onScroll={onGridScroll}
          onFocus={onGridFocus}
        >
          {error ? <p className="catalog-status">{error}</p> : null}
          {loading && shown.length === 0 ? <p className="catalog-status">Carregando...</p> : null}
          {!loading && !error && shown.length === 0 ? <p className="catalog-status">{text(empty)}</p> : null}
          {shown.map((item) => (
            <button
              key={item.id}
              type="button"
              className="poster"
              data-tv-focusable="true"
              onClick={() => void openItem(item)}
            >
              <Poster item={item} />
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}

function Poster({ item }: { item: MediaEntry }) {
  const [failed, setFailed] = useState(false);
  const seriesName = item.seriesName?.trim();
  const named = item.kind === 'episode' && Boolean(seriesName);
  const ratio =
    item.resumeDuration && item.resumeDuration > 0
      ? Math.min(1, Math.max(0, (item.resumePosition ?? 0) / item.resumeDuration))
      : 0;
  return (
    <span className="poster-card">
      {!item.posterUrl || failed ? (
        <span className="poster-fallback" />
      ) : (
        <img src={item.posterUrl} alt="" onError={() => setFailed(true)} />
      )}
      {ratio > 0 ? (
        <span className="poster-progress">
          <span style={{ width: `${ratio * 100}%` }} />
        </span>
      ) : null}
      <span className="poster-copy">
        <strong>{named ? seriesName : item.name}</strong>
        {named ? <small>{episodeLabel(item)}</small> : null}
      </span>
    </span>
  );
}

function pinnedFolders(kind: MediaKind): CategoryFolder[] {
  const folders: CategoryFolder[] = [{ id: CategoryIds.all, name: 'Todos', pinned: true }];
  if (kind === 'movie' || kind === 'series') {
    folders.push(
      { id: CategoryIds.continueWatching, name: 'Continue Assistindo', pinned: true },
      { id: CategoryIds.favorites, name: 'Favoritos', pinned: true },
    );
  }
  return folders;
}

function emptyMessage(categoryId: string, hasList: boolean, needle: string): string {
  if (categoryId === CategoryIds.favorites) return 'Nenhum favorito ainda.';
  if (categoryId === CategoryIds.continueWatching) return 'Nada para continuar.';
  if (!hasList) return 'Adicione uma lista na tela Listas.';
  if (needle) return 'Nenhum título encontrado.';
  return 'Nenhum título nesta pasta.';
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
