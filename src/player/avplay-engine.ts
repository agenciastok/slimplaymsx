import type { HandlerRef, PlaybackEngine } from './types';

/**
 * Samsung AVPlay draws with the TV decoder.
 * Live playback uses that decoder as-is. The Android cache does not apply
 * here: PREBUFFER_MODE waits on a second file, and on a live stream it
 * steps some channels one frame at a time.
 */
export class AvPlayEngine implements PlaybackEngine {
  private disposed = false;
  private torn = false;
  private live: boolean;
  private positionMs = 0;
  private durationMs = 0;
  private playing = false;

  constructor(
    private readonly surface: HTMLElement,
    private readonly handlers: HandlerRef,
    live: boolean,
  ) {
    this.live = live;
    this.fit = this.fit.bind(this);
  }

  async open(url: string): Promise<void> {
    const av = window.webapis?.avplay;
    if (!av) {
      this.emitError('AVPlay indisponível');
      return;
    }
    try {
      av.open(url);
      this.fit();
      window.addEventListener('resize', this.fit);
      av.setListener({
        onbufferingstart: () => this.emitBuffering(true),
        onbufferingcomplete: () => this.emitBuffering(false),
        oncurrentplaytime: (current) => {
          this.positionMs = current;
          this.emitTime();
        },
        onstreamcompleted: () => {
          this.playing = false;
          this.handlers.current.onPlaying(false);
          if (this.live) this.emitError('A transmissão foi interrompida.');
          else this.handlers.current.onEnded();
        },
        onerror: (eventType) => this.emitError(eventType || 'Falha ao reproduzir'),
      });
      this.tune(av);
      av.prepareAsync(
        () => {
          if (this.disposed) {
            this.teardown();
            return;
          }
          try {
            av.setDisplayMethod('PLAYER_DISPLAY_MODE_LETTER_BOX');
          } catch {
            // Older models only honor the display rectangle.
          }
          this.fit();
          try {
            this.durationMs = this.live ? 0 : Math.max(0, av.getDuration());
          } catch {
            this.durationMs = 0;
          }
          av.play();
          this.playing = true;
          this.handlers.current.onPlaying(true);
          this.emitBuffering(false);
          this.emitTime();
        },
        (error) => this.emitError(errorText(error)),
      );
    } catch (error) {
      this.emitError(errorText(error));
    }
  }

  play(): void {
    this.call(() => {
      window.webapis?.avplay?.play();
      this.playing = true;
      this.handlers.current.onPlaying(true);
    });
  }

  pause(): void {
    if (this.live) return;
    this.call(() => {
      window.webapis?.avplay?.pause();
      this.playing = false;
      this.handlers.current.onPlaying(false);
    });
  }

  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  seekBy(deltaMs: number): void {
    this.seekTo(this.positionMs + deltaMs);
  }

  seekTo(positionMs: number): void {
    if (this.live) return;
    const ceiling = this.durationMs > 0 ? this.durationMs : Number.POSITIVE_INFINITY;
    const next = Math.min(ceiling, Math.max(0, positionMs));
    this.call(() => {
      window.webapis?.avplay?.seekTo(
        next,
        () => {
          this.positionMs = next;
          this.emitTime();
        },
        () => this.emitError('Não foi possível avançar'),
      );
    });
  }

  destroy(): void {
    this.disposed = true;
    this.teardown();
  }

  private tune(av: NonNullable<Window['webapis']>['avplay']): void {
    if (!av) return;
    if (this.live) return;
    const properties: [string, string][] = [
      ['SET_MODE_4K', 'TRUE'],
      ['ADAPTIVE_INFO', 'STARTBITRATE=HIGHEST|SKIPBITRATE=LOWEST'],
    ];
    for (const [name, value] of properties) {
      try {
        av.setStreamingProperty(name, value);
      } catch {
        // A model may not expose every streaming property.
      }
    }
  }

  private fit(): void {
    const av = window.webapis?.avplay;
    if (!av || this.disposed) return;
    const box = this.surface.getBoundingClientRect();
    const width = box.width > 2 ? box.width : window.innerWidth;
    const height = box.height > 2 ? box.height : window.innerHeight;
    const even = (value: number) => Math.max(2, Math.round(value) - (Math.round(value) % 2));
    try {
      av.setDisplayRect(Math.round(box.x), Math.round(box.y), even(width), even(height));
    } catch {
      // The rectangle can be set once the player has been opened.
    }
  }

  private teardown(): void {
    window.removeEventListener('resize', this.fit);
    if (this.torn) return;
    this.torn = true;
    const av = window.webapis?.avplay;
    if (!av) return;
    try {
      const state = av.getState();
      if (state === 'PLAYING' || state === 'PAUSED' || state === 'READY') av.stop();
    } catch {
      // stop() is invalid before prepare; close() still releases the decoder.
    }
    try {
      if (av.getState() !== 'NONE') av.close();
    } catch {
      // The instance was already released.
    }
  }

  private emitBuffering(active: boolean): void {
    if (!this.disposed) this.handlers.current.onBuffering(active);
  }

  private emitTime(): void {
    if (!this.disposed) this.handlers.current.onTime(this.positionMs, this.durationMs);
  }

  private emitError(message: string): void {
    if (!this.disposed) this.handlers.current.onError(message);
  }

  private call(action: () => void): void {
    if (this.disposed) return;
    try {
      action();
    } catch (error) {
      this.emitError(errorText(error));
    }
  }
}

function errorText(error: unknown): string {
  if (typeof error === 'string' && error.trim()) return error;
  if (error instanceof Error && error.message) return error.message;
  return 'Falha ao reproduzir';
}
