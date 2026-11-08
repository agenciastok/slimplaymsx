/** Same FNV-1a truncation as `lib/core/device_key.dart`, without BigInt. */
export function deviceKeyFromId(id: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < id.length; index += 1) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 0x01000193) >>> 0;
    hash &= 0x7fffffff;
  }
  const text = String(hash % 1000000);
  return text.length >= 6 ? text : `000000${text}`.slice(-6);
}
