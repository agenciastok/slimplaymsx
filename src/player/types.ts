export interface PlaybackHandlers {
  onBuffering: (active: boolean) => void;
  onTime: (positionMs: number, durationMs: number) => void;
  onPlaying: (playing: boolean) => void;
  onEnded: () => void;
  onError: (message: string) => void;
}

export interface PlaybackEngine {
  open(url: string): Promise<void>;
  play(): void;
  pause(): void;
  toggle(): void;
  seekBy(deltaMs: number): void;
  seekTo(positionMs: number): void;
  destroy(): void;
}

export type HandlerRef = { current: PlaybackHandlers };
