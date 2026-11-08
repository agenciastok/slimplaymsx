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
  if (!webOsTv() && !(force && mixed)) return false;
  const plugin = (window as Window & { TVXVideoPlugin?: MsxVideoPlugin }).TVXVideoPlugin;
  if (!plugin?.executeAction) return false;
  const engine = /\.m3u8($|\?)/i.test(url) ? 'hls' : 'html5';
  const back = `video:plugin:${location.href.split('#')[0]}`;
  plugin.executeAction(`video:plugin:http://msx.benzac.de/plugins/${engine}.html?url=${encodeURIComponent(url)}`, {
    properties: {
      'trigger:back': back,
      'trigger:complete': back,
    },
  });
  return true;
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
