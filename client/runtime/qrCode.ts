import {
  PartyGameQrCode,
  type PartyGameQrCodeApi,
  type RenderCanvasOptions
} from "@pop-party/engine/client/qr-code";

export { PartyGameQrCode };
export type { PartyGameQrCodeApi, RenderCanvasOptions };

declare global {
  interface Window {
    PartyGameQrCode?: PartyGameQrCodeApi;
  }
}

export function installQrCodeGlobals(target: Window | typeof globalThis = globalThis): void {
  (target as Window).PartyGameQrCode = PartyGameQrCode;
}

installQrCodeGlobals(typeof window !== "undefined" ? window : globalThis);
