export interface RenderCanvasOptions {
  quietZone?: number;
  size?: number;
  background?: string;
  foreground?: string;
}

export interface QrCanvasContext {
  fillStyle: string | unknown;
  fillRect(x: number, y: number, width: number, height: number): void;
}

export interface QrCanvasTarget {
  readonly clientWidth: number;
  width: number;
  height: number;
  readonly dataset: Record<string, string>;
  getContext(contextId: "2d"): QrCanvasContext | null;
}

export function matrixForText(text: string): boolean[][];
export function renderCanvas(canvas: QrCanvasTarget, text: string, options?: RenderCanvasOptions): void;
export const PartyGameQrCode: Readonly<{
  matrixForText: typeof matrixForText;
  renderCanvas: typeof renderCanvas;
}>;
export type PartyGameQrCodeApi = typeof PartyGameQrCode;
