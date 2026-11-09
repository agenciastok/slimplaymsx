interface MsxVideoPlugin {
  setupPlayer(player: object): void;
  init(): void;
  stopLoading?: () => void;
  startPlayback?: () => void;
  hidePlayer?: () => void;
  setupTrigger?: (key: string, action: string) => void;
  requestFullscreen?: (element?: Element) => boolean;
  requestData?: (id: string, callback: (data: { info?: { platform?: string } } | null) => void) => void;
  executeAction?: (action: string, data?: object) => void;
}

let msxPlatform = '';
let externalPlayback = false;

interface MsxPluginTools {
  onReady(callback: () => void): void;
}

export function isStandalonePage(): boolean {
  return /\/msx\/standalone(?:\/|$)/.test(location.pathname);
}

export function startMsxPlugin(): void {
  if (isStandalonePage()) {
    const root = document.documentElement;
    root.classList.add('is-standalone');
    if (webOsTv() || legacyMsxBrowser()) root.classList.add('is-legacy-tv');
    return;
  }
  const root = window as Window & { TVXPluginTools?: MsxPluginTools; TVXVideoPlugin?: MsxVideoPlugin };
  const tools = root.TVXPluginTools;
  const plugin = root.TVXVideoPlugin;
  if (!tools || !plugin) return;
  document.documentElement.classList.add('is-msx');
  if (webOsTv() || legacyMsxBrowser()) document.documentElement.classList.add('is-legacy-tv');
  tools.onReady(() => {
    plugin.setupPlayer(player(plugin));
    plugin.init();
    holdFocus(plugin);
    plugin.requestData?.('info', (data) => {
      msxPlatform = String(data?.info?.platform ?? '');
    });
  });
}

function player(plugin: MsxVideoPlugin) {
  return {
    init() {},
    ready() {
      plugin.stopLoading?.();
      plugin.hidePlayer?.();
      plugin.setupTrigger?.('back', '[]');
      fillScreen();
      window.setTimeout(() => plugin.hidePlayer?.(), 400);
      focusWindow();
    },
    play() {},
    pause() {},
    stop() {},
    setPosition() {},
    setVolume() {},
    setMuted() {},
    setSpeed() {},
    getPosition() {
      return 0;
    },
    getDuration() {
      return 0;
    },
    getVolume() {
      return 100;
    },
    isMuted() {
      return false;
    },
    getSpeed() {
      return 1;
    },
    getUpdateData() {
      return { position: 0, duration: 0, speed: 1 };
    },
  };
}

function holdFocus(plugin: MsxVideoPlugin): void {
  focusWindow();
  window.setInterval(() => {
    if (!externalPlayback) focusWindow();
  }, 1000);
  let blurred = false;
  const settle = () => {
    if (externalPlayback) return;
    focusWindow();
    plugin.hidePlayer?.();
    fillScreen();
  };
  window.addEventListener('focus', () => {
    if (!blurred) return;
    blurred = false;
    externalPlayback = false;
    settle();
  });
  window.addEventListener('blur', () => {
    blurred = true;
    window.setTimeout(settle, 50);
  });
}

export function exitStandalone(): void {
  const stamp = location.href;
  try {
    history.back();
  } catch {
    // This document was opened without a previous page.
  }
  window.setTimeout(() => {
    if (location.href !== stamp) return;
    try {
      window.close();
    } catch {
      // webOS keeps a link page open when the window cannot close itself.
    }
    if (location.href === stamp) {
      window.dispatchEvent(new CustomEvent('slimplay:exit-stuck'));
    }
  }, 400);
}

export function handoffMsxPlayback(url: string, force = false): boolean {
  if (document.documentElement.classList.contains('is-standalone')) return false;
  if (!document.documentElement.classList.contains('is-msx')) return false;
  const mixed = location.protocol === 'https:' && /^http:/i.test(url);
  const native = webOsTv() || legacyMsxBrowser();
  if (!native && !(force && mixed)) return false;
  const plugin = (window as Window & { TVXVideoPlugin?: MsxVideoPlugin }).TVXVideoPlugin;
  if (!plugin?.executeAction) return false;
  externalPlayback = true;
  rememberMsxReturn();
  const action = native
    ? `video:${url}`
    : `video:plugin:http://msx.benzac.de/plugins/${/\.m3u8($|\?)/i.test(url) ? 'hls' : 'html5'}.html?url=${encodeURIComponent(url)}`;
  const appReturn = `video:plugin:${location.href.split('#')[0]}`;
  plugin.executeAction(action, {
    properties: {
      'trigger:back': appReturn,
      'trigger:complete': appReturn,
    },
  });
  return true;
}

export function legacyMsxBrowser(): boolean {
  const match = /Chrome\/(\d+)/.exec(navigator.userAgent);
  return match != null && Number(match[1]) < 64;
}

function webOsTv(): boolean {
  return (
    /Web0S|webOS|NetCast|WebAppManager|LG Browser/i.test(navigator.userAgent) ||
    /lg|netcast|webos/i.test(msxPlatform)
  );
}

const returnKey = 'slimplay-msx-return';

function rememberMsxReturn(): void {
  const route = document.documentElement.dataset.msxReturn ?? '';
  if (route !== 'live' && route !== 'movies' && route !== 'series' && route !== 'lists' && route !== 'settings') {
    return;
  }
  try {
    sessionStorage.setItem(returnKey, JSON.stringify({ route, at: Date.now() }));
  } catch {
    // The TV browser can block storage. Back still closes the player.
  }
}

export function takeMsxReturn(): 'live' | 'movies' | 'series' | 'lists' | 'settings' | null {
  try {
    const raw = sessionStorage.getItem(returnKey);
    sessionStorage.removeItem(returnKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { route?: string; at?: number };
    if (!parsed.route || !parsed.at || Date.now() - parsed.at > 45000) return null;
    if (
      parsed.route === 'live' ||
      parsed.route === 'movies' ||
      parsed.route === 'series' ||
      parsed.route === 'lists' ||
      parsed.route === 'settings'
    ) {
      return parsed.route;
    }
  } catch {
    // Ignore a stored value this browser cannot read.
  }
  return null;
}

function fillScreen(): void {
  const root = document.documentElement;
  root.style.margin = '0';
  root.style.width = '100%';
  root.style.height = '100%';
}

function focusWindow(): void {
  try {
    if (!document.hasFocus()) window.focus();
  } catch {
    // The TV browser can refuse focus while Media Station X owns the screen.
  }
}
