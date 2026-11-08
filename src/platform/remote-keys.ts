import { isTizen } from './runtime';
import { moveFocus, type FocusDirection } from './spatial-focus';

const mediaKeys = [
  'MediaPlay',
  'MediaPause',
  'MediaPlayPause',
  'MediaStop',
  'MediaFastForward',
  'MediaRewind',
] as const;

const mediaCodes: Record<number, (typeof mediaKeys)[number]> = {
  415: 'MediaPlay',
  19: 'MediaPause',
  10252: 'MediaPlayPause',
  413: 'MediaStop',
  417: 'MediaFastForward',
  412: 'MediaRewind',
};

let installed = false;

export function installRemoteKeys(): void {
  if (installed) return;
  installed = true;
  registerMediaKeys();
  window.addEventListener('keydown', onKeyDown);
}

function registerMediaKeys(): void {
  if (!isTizen()) return;
  const device = window.tizen?.tvinputdevice;
  if (!device) return;
  for (const key of mediaKeys) {
    try {
      device.registerKey(key);
    } catch {
      // A model may not expose every media key. The ones that register still arrive.
    }
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (isBack(event)) {
    event.preventDefault();
    document.dispatchEvent(new CustomEvent('slimplay:back', { bubbles: true, cancelable: true }));
    return;
  }

  const media = mediaCodes[event.keyCode];
  if (media) {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('slimplay:media', { detail: media }));
    return;
  }

  const direction = arrowDirection(event);
  if (direction) {
    event.preventDefault();
    moveFocus(direction);
    return;
  }

  if (isEnter(event)) {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.dataset.tvFocusable === 'true') {
      event.preventDefault();
      active.click();
    }
  }
}

function arrowDirection(event: KeyboardEvent): FocusDirection | null {
  switch (event.key) {
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    default:
      break;
  }
  switch (event.keyCode) {
    case 37:
      return 'left';
    case 38:
      return 'up';
    case 39:
      return 'right';
    case 40:
      return 'down';
    default:
      return null;
  }
}

function isEnter(event: KeyboardEvent): boolean {
  return event.key === 'Enter' || event.keyCode === 13;
}

function isBack(event: KeyboardEvent): boolean {
  return (
    event.keyCode === 461 ||
    event.keyCode === 10009 ||
    event.key === 'Escape' ||
    event.key === 'Back' ||
    event.key === 'XF86Back' ||
    event.key === 'BrowserBack' ||
    event.key === 'GoBack'
  );
}
