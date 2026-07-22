export interface GameTextFontOption {
  readonly value: string;
  readonly label: string;
}

export interface GameTextTarget {
  innerHTML: string;
  textContent: string | null;
  readonly ownerDocument?: unknown;
}

export const gameTextDefaultFontFamily: string;
export const gameTextFontOptions: readonly GameTextFontOption[];
export function normalizeGameTextFontFamily(value: unknown, fallback?: unknown): string;
export function normalizeGameTextMarkup(value: unknown): string;
export function transformGameTextMarkup(value: unknown, transform: unknown): string;
export function gameTextPlainText(value: unknown): string;
export function gameTextHtml(value: unknown): string;
export function setGameTextHtml(target: GameTextTarget, value: unknown): void;
