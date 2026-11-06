const accents: Record<string, string> = {
  á: 'a',
  à: 'a',
  â: 'a',
  ã: 'a',
  ä: 'a',
  é: 'e',
  è: 'e',
  ê: 'e',
  ë: 'e',
  í: 'i',
  ì: 'i',
  î: 'i',
  ï: 'i',
  ó: 'o',
  ò: 'o',
  ô: 'o',
  õ: 'o',
  ö: 'o',
  ú: 'u',
  ù: 'u',
  û: 'u',
  ü: 'u',
  ç: 'c',
  ñ: 'n',
};

export function foldAscii(value: string): string {
  let folded = '';
  for (const char of value.toLowerCase()) folded += accents[char] ?? char;
  return folded;
}

export function slug(raw: string): string {
  const folded = foldAscii(raw)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return folded || 'outros';
}

export function isActivationCode(value: string): boolean {
  return /^\d{6}$/.test(value);
}

export function decodeMaybeBase64(input: string): string {
  const compact = input.trim();
  if (!compact) return compact;
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact) || compact.length % 4 !== 0) return input;
  try {
    const binary = atob(compact);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    if (!decoded || decoded.includes('\uFFFD')) return input;
    return decoded;
  } catch {
    return input;
  }
}
