import { tr } from '../l10n/app-text';
import { formatDate, fromIso, parseExpiry, toIso } from './format';
import { jBool, jIntOrNull, jString, type JsonMap } from './json';
import type { PlaylistCredentials } from '../models/playlist';

const trialMs = 7 * 24 * 60 * 60 * 1000;

export type AppLicenseKind = 'trial' | 'partner' | 'activated' | 'active' | 'expired';

export interface DeviceAccessFacts {
  isActivated: boolean | null;
  expiresAt: string | null;
  createdAt: string | null;
}

export interface AppLicense {
  kind: AppLicenseKind;
  daysRemaining: number | null;
  validUntil: string | null;
}

export function factsFromPayload(json: JsonMap): DeviceAccessFacts | null {
  const hasFacts = 'is_activated' in json || 'created_at' in json || 'expires_at' in json;
  if (!hasFacts) return null;
  return {
    isActivated: jBool(json.is_activated),
    expiresAt: toIso(parseExpiry(json.expires_at)),
    createdAt: toIso(parseExpiry(json.created_at)),
  };
}

export function licenseFromPayload(json: JsonMap): AppLicense | null {
  const hasFacts = 'is_activated' in json || 'created_at' in json || 'dns_id' in json;
  if (!hasFacts) return null;
  return evaluateAppLicense({
    isActivated: jBool(json.is_activated),
    expiresAt: toIso(parseExpiry(json.expires_at)),
    createdAt: toIso(parseExpiry(json.created_at)),
    dnsId: jIntOrNull(json.dns_id),
    dnsStatus: jBool(json.dns_status),
    dnsExpiresAt: toIso(parseExpiry(json.dns_expires_at)),
    partnerCode: jString(json.partner_code),
  });
}

export function resolveAppLicense(
  facts: DeviceAccessFacts,
  list: PlaylistCredentials | null,
): AppLicense {
  if (list && list.playlistType === 'partner') return codeLoginLicense(list);
  if (list?.partnerDns) {
    const code = list.code.trim();
    return evaluateAppLicense({
      isActivated: facts.isActivated,
      expiresAt: facts.expiresAt,
      createdAt: facts.createdAt,
      dnsId: 0,
      dnsStatus: list.dnsStatus ?? true,
      dnsExpiresAt: list.dnsExpiresAt,
      partnerCode: code || 'parceiro',
    });
  }
  return evaluateAppLicense({
    isActivated: facts.isActivated,
    expiresAt: facts.expiresAt,
    createdAt: facts.createdAt,
    dnsId: null,
    dnsStatus: null,
    dnsExpiresAt: null,
    partnerCode: null,
  });
}

export function evaluateAppLicense(input: {
  isActivated: boolean | null;
  expiresAt: string | null;
  createdAt: string | null;
  dnsId: number | null;
  dnsStatus: boolean | null;
  dnsExpiresAt: string | null;
  partnerCode: string | null;
  now?: Date;
}): AppLicense {
  const clock = input.now ?? new Date();
  if (input.dnsId != null) {
    const dnsExpires = fromIso(input.dnsExpiresAt);
    const dnsExpired = dnsExpires != null && clock.getTime() > dnsExpires.getTime();
    if (input.dnsStatus !== true || dnsExpired) return expiredLicense();
    if ((input.partnerCode ?? '').trim()) return { kind: 'partner', daysRemaining: null, validUntil: null };
  }

  const expiresAt = fromIso(input.expiresAt);
  if (input.isActivated === true && expiresAt && clock.getTime() <= expiresAt.getTime()) {
    return { kind: 'activated', daysRemaining: null, validUntil: expiresAt.toISOString() };
  }

  const createdAt = fromIso(input.createdAt);
  if (createdAt && clock.getTime() - createdAt.getTime() <= trialMs) {
    return {
      kind: 'trial',
      daysRemaining: trialDaysRemaining(createdAt, clock),
      validUntil: null,
    };
  }
  return expiredLicense();
}

export function licenseBlocks(license: AppLicense | null): boolean {
  return license?.kind === 'expired';
}

export function licenseLabel(license: AppLicense | null, language = 'pt'): string {
  if (!license) return '—';
  switch (license.kind) {
    case 'trial':
      return tr(language, 'Teste Grátis ({days} dias restantes)').replace(
        '{days}',
        String(license.daysRemaining ?? 0),
      );
    case 'partner':
      return tr(language, 'Licença Parceiro');
    case 'active':
      return tr(language, 'Ativo');
    case 'activated':
      return tr(language, 'Válido até {date}').replace('{date}', formatLicenseDate(license.validUntil));
    case 'expired':
      return tr(language, 'Expirada');
  }
}

function codeLoginLicense(list: PlaylistCredentials): AppLicense {
  const clock = new Date();
  const dnsExpires = fromIso(list.dnsExpiresAt);
  const dnsExpired = dnsExpires != null && clock.getTime() > dnsExpires.getTime();
  if (list.dnsStatus === false || dnsExpired) return expiredLicense();
  return { kind: 'active', daysRemaining: null, validUntil: null };
}

function trialDaysRemaining(createdAt: Date, now: Date): number {
  const left = createdAt.getTime() + trialMs - now.getTime();
  if (left <= 0) return 0;
  const day = 24 * 60 * 60 * 1000;
  const whole = Math.floor(left / day);
  if (left === whole * day) return whole;
  return whole + 1;
}

function expiredLicense(): AppLicense {
  return { kind: 'expired', daysRemaining: null, validUntil: null };
}

function formatLicenseDate(value: string | null): string {
  return formatDate(fromIso(value));
}
