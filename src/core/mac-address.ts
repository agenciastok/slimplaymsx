const hexOnly = /[^0-9A-Fa-f]/g;

/** Classic `XX:XX:XX:XX:XX:XX` form. Mirrors `lib/core/mac_address.dart`. */
export function formatAsMacAddress(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const hex = raw.replace(hexOnly, '').toUpperCase();
  if (hex.length < 12) return null;
  const body = hex.slice(0, 12);
  if (body === '000000000000' || body === '020000000000') return null;
  const pairs: string[] = [];
  for (let index = 0; index < 12; index += 2) {
    pairs.push(body.slice(index, index + 2));
  }
  return pairs.join(':');
}

export function matchesDeviceMac(value: string, mac: string): boolean {
  const left = value.replace(hexOnly, '').toUpperCase();
  const right = mac.replace(hexOnly, '').toUpperCase();
  if (left.length < 12 || right.length < 12) return false;
  return left.slice(0, 12) === right.slice(0, 12);
}

export function normalizeHardwareMac(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const hex = raw.replace(hexOnly, '').toUpperCase();
  if (hex.length !== 12) return null;
  return formatAsMacAddress(hex);
}
