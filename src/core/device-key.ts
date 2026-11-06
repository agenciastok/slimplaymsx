/** Same FNV-1a truncation as `lib/core/device_key.dart`. */
export function deviceKeyFromId(id: string): string {
  let hash = 0x811c9dc5n;
  const prime = 0x01000193n;
  const mask = 0x7fffffffn;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= BigInt(id.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return (hash % 1000000n).toString().padStart(6, '0');
}
