/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly VITE_MSX?: string;
  }
}

declare module 'qrcode' {
  interface QrOptions {
    margin?: number;
    width?: number;
  }

  const QRCode: {
    toDataURL(text: string, options?: QrOptions): Promise<string>;
  };

  export default QRCode;
}
