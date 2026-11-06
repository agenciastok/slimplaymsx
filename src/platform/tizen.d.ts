interface TizenTvInputDevice {
  registerKey(keyName: string): void;
  unregisterKey(keyName: string): void;
}

interface TizenApplication {
  exit(): void;
  hide(): void;
}

interface TizenNamespace {
  tvinputdevice?: TizenTvInputDevice;
  application?: {
    getCurrentApplication(): TizenApplication;
  };
}

interface SamsungProductInfo {
  getDuid(): string;
  getModel(): string;
}

interface SamsungNetwork {
  getMac(): string;
}

interface AvPlayListener {
  onbufferingstart?: () => void;
  onbufferingprogress?: (percent: number) => void;
  onbufferingcomplete?: () => void;
  oncurrentplaytime?: (currentTime: number) => void;
  onstreamcompleted?: () => void;
  onerror?: (eventType: string) => void;
}

interface SamsungAvPlay {
  open(url: string): void;
  close(): void;
  prepare(): void;
  prepareAsync(success?: () => void, error?: (error: unknown) => void): void;
  play(): void;
  pause(): void;
  stop(): void;
  seekTo(milliseconds: number, success?: () => void, error?: () => void): void;
  getState(): string;
  getCurrentTime(): number;
  getDuration(): number;
  setListener(listener: AvPlayListener): void;
  setDisplayRect(x: number, y: number, width: number, height: number): void;
  setDisplayMethod(mode: string): void;
  setStreamingProperty(name: string, value: string): void;
}

interface SamsungWebApis {
  avplay?: SamsungAvPlay;
  productinfo?: SamsungProductInfo;
  network?: SamsungNetwork;
}

declare global {
  interface Window {
    tizen?: TizenNamespace;
    webapis?: SamsungWebApis;
  }

  const tizen: TizenNamespace | undefined;
  const webapis: SamsungWebApis | undefined;
}

export {};
