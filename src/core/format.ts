export function parseExpiry(raw: unknown): Date | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (text === '' || text === '0' || text === 'null') return null;
  const unix = Number(text);
  if (Number.isInteger(unix) && String(unix) === text) {
    const millis = unix > 100000000000 ? unix : unix * 1000;
    return new Date(millis);
  }
  const normalized = text.includes(' ') && !text.includes('T') ? text.replace(' ', 'T') : text;
  const parsed = Date.parse(normalized);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
}

export function formatDate(date: Date | null): string {
  if (!date) return '—';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

export function formatDottedDate(date: Date | null): string {
  if (!date) return '—';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${date.getFullYear()}`;
}

export function toIso(date: Date | null): string | null {
  return date ? date.toISOString() : null;
}

export function parseEpgTime(raw: unknown): Date | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  const unix = Number(text);
  if (Number.isInteger(unix) && unix > 1000000000) {
    const millis = unix > 100000000000 ? unix : unix * 1000;
    return new Date(millis);
  }
  const normalized = text.includes(' ') && !text.includes('T') ? text.replace(' ', 'T') : text;
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

export function parseDuration(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.round(raw);
  const text = String(raw).trim();
  if (text === '' || text === 'null') return null;
  if (text.includes(':')) {
    const parts = text.split(':').map((part) => Number.parseInt(part, 10));
    if (parts.length === 3 && parts.every((part) => Number.isInteger(part))) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    if (parts.length === 2 && parts.every((part) => Number.isInteger(part))) {
      return parts[0] * 60 + parts[1];
    }
  }
  const parsed = Number.parseInt(text.split('.')[0] ?? '', 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}min`;
  if (minutes > 0) return `${minutes}min`;
  return `${seconds}s`;
}

export function formatClock(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) return `${hours}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

export function fromIso(value: string | null): Date | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}
