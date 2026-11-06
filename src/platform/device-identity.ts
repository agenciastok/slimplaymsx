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
    const formatted = formatAsMacAddress(crypto.randomUUID());
    if (formatted) return formatted;
  }
  return 'AA:BB:CC:DD:EE:01';
}
