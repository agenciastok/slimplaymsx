import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppConfig } from '../core/config';
import { licenseBlocks, licenseLabel, resolveAppLicense, type AppLicense, type DeviceAccessFacts } from '../core/license';
import {
  activateDevice,
  ApiException,
  deleteDeviceList,
  fetchLicense,
  updateDevicePin,
} from '../services/api';
import { ensureIdentity } from '../platform/device-identity';
import {
  copyPlaylist,
  playlistLoaded,
  samePlaylist,
  type PlaylistCredentials,
} from '../models/playlist';
import { getLocalStore, languageOf, pinOf, type DeviceIdentity } from '../storage/local-store';

interface SessionValue {
  ready: boolean;
  identity: DeviceIdentity;
  blockedMac: string | null;
  licenseLabel: string;
  session: PlaylistCredentials | null;
  playlists: PlaylistCredentials[];
  webPage: string;
  language: string;
  toast: string | null;
  showToast: (message: string) => void;
  refreshMacLists: () => Promise<string | null>;
  evaluate: (keepLoadedList?: boolean) => Promise<string | null>;
  addPlaylist: (code: string, username: string, password: string) => Promise<void>;
  removePlaylist: (index: number) => Promise<void>;
  selectPlaylist: (index: number) => void;
  applyList: (list: PlaylistCredentials | null) => void;
  updatePin: (pin: string) => Promise<void>;
  currentPin: () => string;
  setLanguage: (code: string) => void;
  clearLibrary: (part: 'all' | 'favorites' | 'history') => void;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const store = getLocalStore();
  const [identity] = useState(() => ensureIdentity(store));
  const [session, setSession] = useState<PlaylistCredentials | null>(() => store.readCredentials());
  const [playlists, setPlaylists] = useState<PlaylistCredentials[]>(() => store.readPlaylists());
  const [blockedMac, setBlockedMac] = useState<string | null>(null);
  const [license, setLicense] = useState<AppLicense | null>(null);
  const [ready, setReady] = useState(false);
  const [language, setLanguageState] = useState(() => languageOf(store));
  const [toast, setToast] = useState<string | null>(null);
  const factsRef = useRef<DeviceAccessFacts | null>(null);
  const sessionRef = useRef(session);
  const playlistsRef = useRef(playlists);
  const blockedRef = useRef<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  sessionRef.current = session;
  playlistsRef.current = playlists;

  function adopt(next: PlaylistCredentials | null) {
    sessionRef.current = next;
    setSession(next);
  }

  function replacePlaylists(next: PlaylistCredentials[]) {
    playlistsRef.current = next;
    setPlaylists(next);
  }

  function setBlocked(mac: string | null) {
    blockedRef.current = mac;
    setBlockedMac(mac);
  }

  function applyLicense(list: PlaylistCredentials | null, mac: string, keepLoadedList = false) {
    const facts = factsRef.current;
    if (!facts) return;
    const access = resolveAppLicense(facts, list);
    setLicense(access);
    if (!licenseBlocks(access)) {
      setBlocked(null);
      return;
    }
    if (!keepLoadedList) adopt(null);
    setBlocked(mac);
  }

  async function syncServerLists(remote: PlaylistCredentials[], replaceLocal: boolean) {
    if (remote.length === 0 && !replaceLocal) {
      return sessionRef.current ?? store.readCredentials();
    }
    const local = store.readPlaylists();
    const merged = [...remote];
    if (!replaceLocal) {
      for (const item of local) {
        if (!remote.some((server) => samePlaylist(server, item))) merged.push(item);
      }
    }
    if (merged.length === 0) {
      store.savePlaylists([], null);
      replacePlaylists([]);
      adopt(null);
      return null;
    }
    const previous = sessionRef.current;
    const current = store.readCredentials();
    let nextActive: PlaylistCredentials | null = previous ?? current;
    if (nextActive) {
      const looking = nextActive;
      nextActive = merged.find((item) => samePlaylist(item, looking)) ?? (replaceLocal ? merged[0] ?? null : looking);
    } else {
      nextActive = merged[0] ?? null;
    }
    if (!nextActive) return null;
    store.savePlaylists(merged, nextActive);
    replacePlaylists(merged);
    adopt(nextActive);
    return nextActive;
  }

  async function evaluate(keepLoadedList = false): Promise<string | null> {
    const current = store.readCredentials();
    try {
      const result = await fetchLicense(store, identity.id, identity.deviceKey);
      if (result.facts) factsRef.current = result.facts;
      const active = await syncServerLists(result.titles, false);
      applyLicense(active, identity.id, keepLoadedList);
      if (blockedRef.current != null) return blockedRef.current;
      if (current && playlistLoaded(current)) return null;
      if (!result.credentials || !playlistLoaded(result.credentials)) return null;
      store.saveCredentials(result.credentials);
      adopt(result.credentials);
      return null;
    } catch {
      return blockedRef.current;
    }
  }

  async function refreshMacLists(): Promise<string | null> {
    const result = await fetchLicense(store, identity.id, identity.deviceKey);
    if (result.facts) factsRef.current = result.facts;
    const active = await syncServerLists(result.titles, true);
    applyLicense(active, identity.id);
    return blockedRef.current;
  }

  async function addPlaylist(code: string, username: string, password: string) {
    const activated = await activateDevice(store, {
      mac: identity.id,
      code,
      username,
      password,
    });
    const named = copyPlaylist(activated, {
      code: code.trim(),
      playlistType: activated.playlistType ? activated.playlistType : 'partner',
    });
    const next = [...playlistsRef.current];
    const existing = named.code ? next.findIndex((item) => item.code === named.code) : -1;
    if (existing >= 0) next[existing] = named;
    else next.push(named);
    store.savePlaylists(next, named);
    replacePlaylists(next);
    adopt(named);
  }

  async function removePlaylist(index: number) {
    const current = playlistsRef.current;
    if (index < 0 || index >= current.length) return;
    const removed = current[index];
    await deleteDeviceList(store, identity.id, removed);
    const next = current.filter((_, itemIndex) => itemIndex !== index);
    const active = sessionRef.current;
    const wasActive = samePlaylist(active, removed);
    const replacement = wasActive ? (next[0] ?? null) : active;
    store.savePlaylists(next, replacement);
    replacePlaylists(next);
    adopt(replacement);
    applyLicense(replacement, identity.id);
  }

  function selectPlaylist(index: number) {
    const item = playlistsRef.current[index];
    if (!item || samePlaylist(sessionRef.current, item)) return;
    store.saveCredentials(item);
    adopt(item);
    applyLicense(item, identity.id);
  }

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current != null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 5000);
  }

  useEffect(() => {
    let cancelled = false;
    void evaluate().finally(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
    // The gate runs once, when the shell mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language === 'pt' ? 'pt-BR' : language;
  }, [language]);

  const value: SessionValue = {
    ready,
    identity,
    blockedMac,
    licenseLabel: licenseLabel(license, language),
    session,
    playlists,
    webPage: store.readPreference('web_page').trim() || AppConfig.defaultWebPage,
    language,
    toast,
    showToast,
    refreshMacLists,
    evaluate,
    addPlaylist,
    removePlaylist,
    selectPlaylist,
    applyList: (list) => applyLicense(list, identity.id),
    updatePin: (pin) => updateDevicePin(store, identity.id, pin),
    currentPin: () => pinOf(store),
    setLanguage: (code) => {
      store.writePreference('language', code);
      setLanguageState(code);
    },
    clearLibrary: (part) => store.clearLibrary(part),
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('Sessão indisponível');
  return value;
}

export { ApiException };
