/** Development-only MPEG-TS playback. The TV build must not import this module. */
export async function attachTransportStream(
  video: HTMLVideoElement,
  url: string,
  session: {
    disposed: () => boolean;
    hold: (player: { unload(): void; detachMediaElement(): void; destroy(): void }) => void;
    fail: (message: string) => void;
    start: () => Promise<void>;
  },
): Promise<void> {
  const mpegts = (await import('mpegts.js')).default;
  if (session.disposed()) return;
  if (!mpegts.isSupported()) {
    session.fail('Transmissão indisponível neste navegador');
    return;
  }
  const player = mpegts.createPlayer(
    { type: 'mse', isLive: true, url },
    {
      enableWorker: false,
      enableStashBuffer: true,
      liveBufferLatencyChasing: true,
      liveBufferLatencyMaxLatency: 4,
      liveBufferLatencyMinRemain: 1.5,
    },
  );
  session.hold(player);
  player.attachMediaElement(video);
  player.on(mpegts.Events.ERROR, () => {
    if (!session.disposed()) session.fail('Não foi possível reproduzir');
  });
  player.load();
  await session.start();
}
