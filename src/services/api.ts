import { AppConfig } from '../core/config';
import { factsFromPayload, licenseFromPayload, type AppLicense, type DeviceAccessFacts } from '../core/license';
import { jMap, jString, type JsonMap } from '../core/json';
import { matchesDeviceMac } from '../core/mac-address';
import {
  playlistFromApi,
  playlistLoaded,
  playlistsFromPayload,
  type PlaylistCredentials,
} from '../models/playlist';
import { LocalStore } from '../storage/local-store';

export class ApiException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiException';
  }
}

export interface DeviceLicense {
  blocked: boolean;
  credentials: PlaylistCredentials | null;
  access: AppLicense | null;
  titles: PlaylistCredentials[];
  facts: DeviceAccessFacts | null;
}

export function panelBase(store: LocalStore): string {
  const custom = store.readPreference('api_base').trim();
  const raw = custom || AppConfig.defaultApiBase;
  const trimmed = raw.endsWith('/') ? raw.slice(0, -1) : raw;
  if (import.meta.env.DEV && trimmed === AppConfig.defaultApiBase) return '/panel-api';
  return trimmed;
}

export async function fetchLicense(
  store: LocalStore,
  mac: string,
  deviceKey = '',
): Promise<DeviceLicense> {
  const body: JsonMap = { mac };
  if (/^\d{6}$/.test(deviceKey.trim())) body.device_key = deviceKey.trim();
  const payload = await postJson(store, AppConfig.pingPath, body);
  rememberPin(store, payload);
  const facts = factsFromPayload(payload);
  const access = licenseFromPayload(payload);
  const titles = playlistsFromPayload(payload);
  const blocked = access != null ? access.kind === 'expired' : payload.blocked === true;
  if (blocked) {
    return {
      blocked: true,
      credentials: null,
      access: access ?? { kind: 'expired', daysRemaining: null, validUntil: null },
      titles,
      facts,
    };
  }
  const credentials = playlistFromApi(payload);
  if (!usableCredentials(credentials, mac)) {
    return { blocked: false, credentials: null, access, titles, facts };
  }
  return { blocked: false, credentials, access, titles, facts };
}

export async function activateDevice(
  store: LocalStore,
  input: { mac: string; code: string; username?: string; password?: string },
): Promise<PlaylistCredentials> {
  const body: JsonMap = { mac: input.mac, code: input.code };
  const user = input.username?.trim() ?? '';
  const pass = input.password?.trim() ?? '';
  if (user) body.username = user;
  if (pass) body.password = pass;
  const payload = await postJson(store, AppConfig.activatePath, body);
  const credentials = playlistFromApi(payload);
  if (!usableCredentials(credentials, input.mac)) {
    throw new ApiException(AppConfig.invalidAccess);
  }
  return credentials;
}

export async function deleteDeviceList(
  store: LocalStore,
  mac: string,
  list: PlaylistCredentials,
): Promise<void> {
  const body: JsonMap = {
    mac,
    username: list.username,
    dns_url: list.dnsUrl,
    m3u_url: list.m3uUrl,
  };
  if (list.listId > 0) body.list_id = list.listId;
  await postJson(store, AppConfig.deleteListPath, body);
}

export async function updateDevicePin(store: LocalStore, mac: string, pin: string): Promise<void> {
  await postJson(store, AppConfig.pinPath, { mac, pin });
  store.writePreference('parental_pin', pin);
}

function rememberPin(store: LocalStore, payload: JsonMap): void {
  const pin = jString(payload.parental_pin);
  if (!pin || !/^\d{4,8}$/.test(pin)) return;
  store.writePreference('parental_pin', pin);
}

function usableCredentials(credentials: PlaylistCredentials, mac: string): boolean {
  if (!playlistLoaded(credentials)) return false;
  if (matchesDeviceMac(credentials.username, mac)) return false;
  if (matchesDeviceMac(credentials.password, mac)) return false;
  return true;
}

async function postJson(store: LocalStore, path: string, body: JsonMap): Promise<JsonMap> {
  let response: Response;
  try {
    response = await fetch(`${panelBase(store)}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
  } catch (error) {
    if (error instanceof ApiException) throw error;
    throw new ApiException(AppConfig.invalidAccess);
  }

  const text = await response.text();
  if (response.status < 200 || response.status >= 300) {
    throw new ApiException(messageFrom(text));
  }
  try {
    const decoded: unknown = text ? JSON.parse(text) : null;
    const map = jMap(decoded);
    if (!map) throw new ApiException(AppConfig.invalidAccess);
    if (map.success === false || map.ok === false) throw new ApiException(messageFrom(text));
    return map;
  } catch (error) {
    if (error instanceof ApiException) throw error;
    throw new ApiException(AppConfig.invalidAccess);
  }
}

function messageFrom(body: string): string {
  try {
    const message = jString(jMap(JSON.parse(body))?.message);
    if (message) return message;
  } catch {
    // The panel sometimes answers with an empty or plain-text error.
  }
  return AppConfig.invalidAccess;
}
