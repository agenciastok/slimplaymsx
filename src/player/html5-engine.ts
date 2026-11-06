import type { HandlerRef, PlaybackEngine } from './types';

/** Browser stand-in for AVPlay. MPEG-TS and HLS.js stay out of the Samsung package. */
const browserEngines = import.meta.env.DEV || import.meta.env.VITE_MSX === 'true';
export class Html5Engine implements PlaybackEngine {
  private disposed = false;
  private hls: { destroy: () => void } | null = null;
  private mpegts: { unload(): void; detachMediaElement(): void; destroy(): void } | null = null;
  private positionMs = 0;
  private durationMs = 0;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly handlers: HandlerRef,
    private readonly live: boolean,
  ) {
    this.onTime = this.onTime.bind(this);
    this.onPlay = this.onPlay.bind(this);
    this.onPause = this.onPause.bind(this);
    this.onWaiting = this.onWaiting.bind(this);
    this.onPlaying = this.onPlaying.bind(this);
    this.onEnded = this.onEnded.bind(this);
    this.onMediaError = this.onMediaError.bind(this);
    video.addEventListener('timeupdate', this.onTime);
    video.addEventListener('seeked', this.onTime);
    video.addEventListener('durationchange', this.onTime);
    video.addEventListener('play', this.onPlay);
    video.addEventListener('pause', this.onPause);
    video.addEventListener('waiting', this.onWaiting);
    video.addEventListener('playing', this.onPlaying);
    video.addEventListener('ended', this.onEnded);
    video.addEventListener('error', this.onMediaError);
  }

  async open(url: string): Promise<void> {
    if (browserEngines && this.live && /\.ts($|\?)/i.test(url)) {
      const { attachTransportStream } = await import('./html5-mpegts');
      await attachTransportStream(this.video, url, {
        disposed: () => this.disposed,
        hold: (player) => {
          this.mpegts = player;
        },
        fail: (message) => this.emitError(message),
        start: () => this.start(),
      });
      return;
    }
    if (this.live && /\.ts($|\?)/i.test(url)) {
      this.emitError('Este formato reproduz na TV Samsung.');
      return;
    }
    const hls = /\.m3u8($|\?)/i.test(url);
    if (hls && this.video.canPlayType('application/vnd.apple.mpegurl')) {
      this.video.src = url;
    } else if (hls && browserEngines) {
      const { default: Hls } = await import('hls.js');
      if (this.disposed) return;
      if (!Hls.isSupported()) {
        this.emitError('HLS indisponível neste navegador');
        return;
      }
      const player = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 8,
        maxLiveSyncPlaybackRate: 1,
        maxBufferLength: this.live ? 12 : 30,
        backBufferLength: 0,
      });
      this.hls = player;
      player.attachMedia(this.video);
      player.loadSource(url);
      player.once(Hls.Events.MANIFEST_PARSED, () => {
        void this.start();
      });
      player.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) this.emitError('Não foi possível reproduzir');
      });
      return;
    } else if (hls) {
      this.emitError('HLS de teste precisa do navegador de desenvolvimento.');
      return;
    } else if (/\.(mp4|m4v|webm|ogg)($|\?)/i.test(url)) {
      this.video.src = url;
    } else {
      this.emitError('Este formato reproduz na TV Samsung.');
      return;
    }
    if (this.disposed) return;
    await this.start();
  }

  private async start(): Promise<void> {
    if (this.disposed) return;
    try {
      await this.video.play();
    } catch {
      this.video.muted = true;
      try {
        await this.video.play();
      } catch {
        this.handlers.current.onPlaying(false);
      }
    }
  }

  play(): void {
    if (this.disposed) return;
    this.video.muted = false;
    void this.video.play().catch(() => this.emitError('Não foi possível reproduzir'));
  }

  pause(): void {
    if (this.disposed || this.live) return;
    this.video.pause();
  }

  toggle(): void {
    if (this.video.paused) this.play();
    else this.pause();
  }

  seekBy(deltaMs: number): void {
    this.seekTo(this.positionMs + deltaMs);
  }

  seekTo(positionMs: number): void {
    if (this.disposed || this.live) return;
    const ceiling = this.durationMs > 0 ? this.durationMs : Number.POSITIVE_INFINITY;
    const next = Math.min(ceiling, Math.max(0, positionMs));
    this.positionMs = next;
    this.video.currentTime = next / 1000;
    this.handlers.current.onTime(this.positionMs, this.durationMs);
  }

  destroy(): void {
    this.disposed = true;
    this.video.removeEventListener('timeupdate', this.onTime);
    this.video.removeEventListener('seeked', this.onTime);
    this.video.removeEventListener('durationchange', this.onTime);
    this.video.removeEventListener('play', this.onPlay);
    this.video.removeEventListener('pause', this.onPause);
    this.video.removeEventListener('waiting', this.onWaiting);
    this.video.removeEventListener('playing', this.onPlaying);
    this.video.removeEventListener('ended', this.onEnded);
    this.video.removeEventListener('error', this.onMediaError);
    this.hls?.destroy();
    this.hls = null;
    const stream = this.mpegts;
    this.mpegts = null;
    if (stream) {
      try {
        stream.unload();
        stream.detachMediaElement();
        stream.destroy();
      } catch {
        // The stream was already released.
      }
    }
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
  }

  private onTime(): void {
    this.positionMs = Number.isFinite(this.video.currentTime) ? this.video.currentTime * 1000 : 0;
    this.durationMs = Number.isFinite(this.video.duration) ? this.video.duration * 1000 : 0;
    if (!this.disposed) this.handlers.current.onTime(this.positionMs, this.durationMs);
  }

  private onPlay(): void {
    if (!this.disposed) this.handlers.current.onPlaying(true);
  }

  private onPause(): void {
    if (!this.disposed) this.handlers.current.onPlaying(false);
  }

  private onWaiting(): void {
    if (!this.disposed) this.handlers.current.onBuffering(true);
  }

  private onPlaying(): void {
    if (!this.disposed) {
      this.handlers.current.onBuffering(false);
      this.handlers.current.onPlaying(true);
    }
  }

  private onEnded(): void {
    if (this.disposed) return;
    this.handlers.current.onPlaying(false);
    if (this.live) this.emitError('A transmissão foi interrompida.');
    else this.handlers.current.onEnded();
  }

  private onMediaError(): void {
    this.emitError('Não foi possível reproduzir');
  }

  private emitError(message: string): void {
    if (!this.disposed) this.handlers.current.onError(message);
  }
}
