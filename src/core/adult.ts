import { foldAscii } from './text';
import type { CategoryFolder, MediaEntry, MediaKind } from '../models/media';

const adultWords = new Set([
  'adult',
  'adulto',
  'adultos',
  'xxx',
  'porn',
  'porno',
  'pornografia',
  'erotic',
  'erotico',
  'eroticos',
  'sexo',
  'sexy',
  'playboy',
  'onlyfans',
  'hentai',
]);

const adultFolders = new Map<MediaKind, Set<string>>();

export function isAdultTitle(raw: string | null | undefined): boolean {
  if (!raw || !raw.trim()) return false;
  const text = foldAscii(raw).toLowerCase();
  if (text.includes('+18') || text.includes('18+')) return true;
  for (const word of text.split(/[^a-z0-9]+/)) {
    if (!word) continue;
    if (adultWords.has(word) || word.startsWith('adult')) return true;
  }
  return false;
}

export function rememberAdultFolders(kind: MediaKind, folders: CategoryFolder[]): void {
  adultFolders.set(kind, new Set(folders.filter((folder) => isAdultTitle(folder.name)).map((folder) => folder.id)));
}

export function requiresAdultPin(
  kind: MediaKind,
  entry?: MediaEntry | null,
  folderId?: string | null,
): boolean {
  const lookup: MediaKind = kind === 'episode' ? 'series' : kind;
  if (isAdultTitle(entry?.name) || isAdultTitle(entry?.categoryName)) return true;
  const ids = adultFolders.get(lookup);
  const categoryId = entry?.categoryId;
  if (categoryId && ids?.has(categoryId)) return true;
  return Boolean(folderId && ids?.has(folderId));
}
