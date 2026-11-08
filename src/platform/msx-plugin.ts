interface MsxVideoPlugin {
  setupPlayer(player: object): void;
  init(): void;
  stopLoading?: () => void;
  startPlayback?: () => void;
  hidePlayer?: () => void;
  requestFullscreen?: (element?: Element) => boolean;
  requestData?: (id: string, callback: (data: { info?: { platform?: string } } | null) => void) => void;
  executeAction?: (action: string, data?: object) => void;
}

let msxPlatform = '';

interface MsxPluginTools {
  onReady(callback: () => void): void;
}

export function startMsxPlugin(): void {
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
      plugin.startPlayback?.();
      plugin.hidePlayer?.();
      fillScreen(plugin);
      window.setTimeout(() => {
        plugin.hidePlayer?.();
        fillScreen(plugin);
      }, 700);
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
  window.setInterval(focusWindow, 1000);
  window.addEventListener('blur', () => {
    window.setTimeout(() => {
      focusWindow();
      plugin.hidePlayer?.();
    }, 50);
  });
}

export function handoffMsxPlayback(url: string, force = false): boolean {
  if (!document.documentElement.classList.contains('is-msx')) return false;
  const mixed = location.protocol === 'https:' && /^http:/i.test(url);
  const native = webOsTv() || legacyMsxBrowser();
  if (!native && !(force && mixed)) return false;
  const plugin = (window as Window & { TVXVideoPlugin?: MsxVideoPlugin }).TVXVideoPlugin;
  if (!plugin?.executeAction) return false;
  const back = `video:plugin:${location.href.split('#')[0]}`;
  // The LG browser cannot play MPEG-TS inside the page, and an HTTP stream is blocked there.
  // The TV player can play it; Back returns to SlimPlay.
  const action = native
    ? `video:${url}`
    : `video:plugin:http://msx.benzac.de/plugins/${/\.m3u8($|\?)/i.test(url) ? 'hls' : 'html5'}.html?url=${encodeURIComponent(url)}`;
  plugin.executeAction(action, {
    properties: {
      'trigger:back': back,
      'trigger:complete': back,
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

function fillScreen(plugin: MsxVideoPlugin): void {
  try {
    plugin.requestFullscreen?.(document.documentElement);
  } catch {
    // Older webOS builds keep the plugin in the video frame when fullscreen is refused.
  }
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
