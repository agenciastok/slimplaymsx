import { deviceKeyFromId } from '../core/device-key';
import { formatAsMacAddress, normalizeHardwareMac } from '../core/mac-address';
import { LocalStore, type DeviceIdentity } from '../storage/local-store';
import { readPlatformDuid, readPlatformMac } from './runtime';

export function ensureIdentity(store = new LocalStore()): DeviceIdentity {
  const existing = store.readIdentity();
  if (existing && existing.id) {
    const formatted = formatAsMacAddress(existing.id);
    if (formatted) {
      const key = deviceKeyFromId(formatted);
      if (formatted === existing.id && existing.deviceKey === key) return existing;
      const updated: DeviceIdentity = {
        id: formatted,
        deviceKey: key,
        isHardwareMac:
          formatted === existing.id
            ? existing.isHardwareMac
            : normalizeHardwareMac(existing.id) != null,
        createdAt: existing.createdAt,
      };
      store.saveIdentity(updated);
      return updated;
    }
  }

  const hardwareMac = normalizeHardwareMac(readPlatformMac());
  const stableId = hardwareMac ?? formatAsMacAddress(readPlatformDuid());
  const id = stableId ?? fallbackMac();
  const identity: DeviceIdentity = {
    id,
    deviceKey: deviceKeyFromId(id),
    isHardwareMac: hardwareMac != null,
    createdAt: new Date().toISOString(),
  };
  store.saveIdentity(identity);
  return identity;
}

function fallbackMac(): string {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const formatted = formatAsMacAddress(randomId());
    if (formatted) return formatted;
  }
  return 'AA:BB:CC:DD:EE:01';
}

function randomId(): string {
  const cryptoApi = window.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') cryptoApi.getRandomValues(bytes);
  else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  }
  let hex = '';
  for (let index = 0; index < bytes.length; index += 1) {
    const value = bytes[index].toString(16);
    hex += value.length === 1 ? `0${value}` : value;
  }
  return hex;
}
