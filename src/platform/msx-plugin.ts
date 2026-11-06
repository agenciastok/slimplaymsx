interface MsxVideoPlugin {
  setupPlayer(player: object): void;
  init(): void;
  stopLoading?: () => void;
}

interface MsxPluginTools {
  onReady(callback: () => void): void;
}

const remoteKeys: Record<string, string> = {
  'key:up': 'ArrowUp',
  'key:down': 'ArrowDown',
  'key:left': 'ArrowLeft',
  'key:right': 'ArrowRight',
  'key:enter': 'Enter',
  'key:ok': 'Enter',
  'key:back': 'Escape',
  'remote:up': 'ArrowUp',
  'remote:down': 'ArrowDown',
  'remote:left': 'ArrowLeft',
  'remote:right': 'ArrowRight',
  'remote:enter': 'Enter',
  'remote:ok': 'Enter',
  'remote:back': 'Escape',
};

export function startMsxPlugin(): void {
  const root = window as Window & { TVXPluginTools?: MsxPluginTools; TVXVideoPlugin?: MsxVideoPlugin };
  const tools = root.TVXPluginTools;
  const plugin = root.TVXVideoPlugin;
  if (!tools || !plugin) return;
  document.documentElement.classList.add('is-msx');
  tools.onReady(() => {
    plugin.setupPlayer(player(plugin));
    plugin.init();
  });
}

function player(plugin: MsxVideoPlugin) {
  return {
    init() {},
    ready() {
      plugin.stopLoading?.();
    },
    play() {
      void currentVideo()?.play();
    },
    pause() {
      currentVideo()?.pause();
    },
    stop() {
      const video = currentVideo();
      if (!video) return;
      video.pause();
      video.removeAttribute('src');
      video.load();
    },
    getPosition() {
      return currentVideo()?.currentTime || 0;
    },
    getDuration() {
      const duration = currentVideo()?.duration;
      return typeof duration === 'number' && Number.isFinite(duration) ? duration : 0;
    },
    getSpeed() {
      return currentVideo()?.playbackRate || 1;
    },
    getUpdateData() {
      return {
        position: this.getPosition(),
        duration: this.getDuration(),
        speed: this.getSpeed(),
      };
    },
    handleEvent(data: { event?: string; keyCode?: number }) {
      const key = (data.event && remoteKeys[data.event]) || keyFromCode(data.keyCode);
      if (!key) return;
      window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    },
  };
}

function currentVideo(): HTMLVideoElement | null {
  return document.querySelector('video');
}

function keyFromCode(code: number | undefined): string | null {
  if (code === 38) return 'ArrowUp';
  if (code === 40) return 'ArrowDown';
  if (code === 37) return 'ArrowLeft';
  if (code === 39) return 'ArrowRight';
  if (code === 13) return 'Enter';
  if (code === 8 || code === 27 || code === 10009) return 'Escape';
  return null;
}
