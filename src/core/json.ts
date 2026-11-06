export type JsonMap = Record<string, unknown>;

export function jString(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (text === '' || text === 'null') return null;
  return text;
}

export function jInt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function jIntOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function jBool(value: unknown): boolean | null {
  if (value == null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value).trim().toLowerCase();
  if (text === 'true') return true;
  if (text === 'false') return false;
  return null;
}

export function jMap(value: unknown): JsonMap | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as JsonMap;
  }
  return null;
}
