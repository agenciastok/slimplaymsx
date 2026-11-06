export function isTizen(): boolean {
  return typeof window.tizen !== 'undefined';
}

export function isAvPlayAvailable(): boolean {
  return typeof window.webapis?.avplay?.open === 'function';
}

export function readPlatformMac(): string | null {
  try {
    const mac = window.webapis?.network?.getMac?.();
    return mac && mac.trim() ? mac : null;
  } catch {
    return null;
  }
}

export function exitApplication(): void {
  try {
    window.tizen?.application?.getCurrentApplication().exit();
  } catch {
    // The browser preview has no Tizen application object.
  }
}

export function readPlatformDuid(): string | null {
  try {
    const duid = window.webapis?.productinfo?.getDuid?.();
    return duid && duid.trim() ? duid : null;
  } catch {
    return null;
  }
}
