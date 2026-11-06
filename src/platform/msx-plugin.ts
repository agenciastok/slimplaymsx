interface MsxVideoPlugin {
  setupPlayer(player: object): void;
  init(): void;
  stopLoading?: () => void;
  startPlayback?: () => void;
  hidePlayer?: () => void;
}

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
  });
}

function player(plugin: MsxVideoPlugin) {
  return {
    init() {},
    ready() {
      plugin.stopLoading?.();
      plugin.startPlayback?.();
      plugin.hidePlayer?.();
      window.setTimeout(() => plugin.hidePlayer?.(), 700);
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

function focusWindow(): void {
  try {
    if (!document.hasFocus()) window.focus();
  } catch {
    // The TV browser can refuse focus while Media Station X owns the screen.
  }
}
