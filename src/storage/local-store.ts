import type { JsonMap } from '../core/json';
import { playlistFromJson, playlistLoaded, type PlaylistCredentials } from '../models/playlist';

export interface DeviceIdentity {
  id: string;
  deviceKey: string;
  isHardwareMac: boolean;
  createdAt: string;
}

const deviceBox = 'device';
const credentialsBox = 'credentials';
const libraryBox = 'library';
const preferencesBox = 'preferences';

export class LocalStore {
  private readonly memory = new Map<string, string>();
  private readonly persistent: Storage | null;

  constructor() {
    this.persistent = probeLocalStorage();
  }

  read(box: string, key: string): string | null {
    const slot = storageKey(box, key);
    if (!this.persistent) return this.memory.get(slot) ?? null;
    return this.persistent.getItem(slot);
  }

  write(box: string, key: string, value: string | null): void {
    const slot = storageKey(box, key);
    if (!this.persistent) {
      if (value == null) this.memory.delete(slot);
      else this.memory.set(slot, value);
      return;
    }
    if (value == null) this.persistent.removeItem(slot);
    else this.persistent.setItem(slot, value);
  }

  readIdentity(): DeviceIdentity | null {
    const raw = this.read(deviceBox, 'identity');
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<DeviceIdentity>;
      if (!parsed.id) return null;
      return {
        id: String(parsed.id),
        deviceKey: String(parsed.deviceKey ?? ''),
        isHardwareMac: parsed.isHardwareMac === true,
        createdAt: String(parsed.createdAt ?? new Date(0).toISOString()),
      };
    } catch {
      return null;
    }
  }

  saveIdentity(identity: DeviceIdentity): void {
    this.write(deviceBox, 'identity', JSON.stringify(identity));
  }

  readCredentials(): PlaylistCredentials | null {
    const map = decodeMap(this.read(credentialsBox, 'active'));
    if (!map) return null;
    const credentials = playlistFromJson(map);
    return playlistLoaded(credentials) ? credentials : null;
  }

  saveCredentials(credentials: PlaylistCredentials | null): void {
    this.write(credentialsBox, 'active', credentials ? JSON.stringify(credentials) : null);
  }

  readPlaylists(): PlaylistCredentials[] {
    const raw = this.read(credentialsBox, 'playlists');
    if (raw != null) return readList(raw).filter((item) => playlistLoaded(item));
    const active = this.readCredentials();
    return active ? [active] : [];
  }

  savePlaylists(items: PlaylistCredentials[], active: PlaylistCredentials | null): void {
    this.write(credentialsBox, 'playlists', JSON.stringify(items));
    this.saveCredentials(active);
  }

  readPreference(key: string, fallback = ''): string {
    return this.read(preferencesBox, key) ?? fallback;
  }

  writePreference(key: string, value: string): void {
    this.write(preferencesBox, key, value);
  }

  clearLibrary(part: 'all' | 'favorites' | 'history' = 'all'): void {
    const prefix = storageKey(libraryBox, '');
    const slots = this.slots().filter((slot) => {
      if (!slot.startsWith(prefix)) return false;
      if (part === 'all') return true;
      if (part === 'favorites') return slot.includes('favorites');
      return slot.includes('recent') || slot.includes('progress');
    });
    for (const slot of slots) this.deleteSlot(slot);
  }

  private slots(): string[] {
    if (!this.persistent) return [...this.memory.keys()];
    const keys: string[] = [];
    for (let index = 0; index < this.persistent.length; index += 1) {
      const key = this.persistent.key(index);
      if (key) keys.push(key);
    }
    return keys;
  }

  private deleteSlot(slot: string): void {
    if (!this.persistent) {
      this.memory.delete(slot);
      return;
    }
    this.persistent.removeItem(slot);
  }
}

export function pinOf(store: LocalStore): string {
  const value = store.readPreference('parental_pin').trim();
  return /^\d{4}$/.test(value) ? value : '0000';
}

export function languageOf(store: LocalStore): string {
  const value = store.readPreference('language').trim();
  return value || 'pt';
}

function storageKey(box: string, key: string): string {
  return `slimplay.${box}.${key}`;
}

function decodeMap(raw: string | null): JsonMap | null {
  if (!raw) return null;
  try {
    const decoded: unknown = JSON.parse(raw);
    if (decoded && typeof decoded === 'object' && !Array.isArray(decoded)) {
      return decoded as JsonMap;
    }
  } catch {
    return null;
  }
  return null;
}

function readList(raw: string): PlaylistCredentials[] {
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!Array.isArray(decoded)) return [];
    const items: PlaylistCredentials[] = [];
    for (const item of decoded) {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        items.push(playlistFromJson(item as JsonMap));
      }
    }
    return items;
  } catch {
    return [];
  }
}

let sharedStore: LocalStore | null = null;

export function getLocalStore(): LocalStore {
  if (!sharedStore) sharedStore = new LocalStore();
  return sharedStore;
}

function probeLocalStorage(): Storage | null {
  try {
    const probe = '__slimplay_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}
